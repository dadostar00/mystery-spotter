/**
 * Pipeline di ingestione — parte stateless.
 *
 * Funzione pura (a parte Web Crypto): riceve il payload grezzo e restituisce
 * esito, report normalizzato, flag di qualità e traccia di ogni stage.
 * Gira identica nell'endpoint HTTP (edge) e nel fallback offline del client.
 * I controlli che richiedono lo storico (dedup, anomalie cross-report) sono in stateful.ts.
 */
import { CATALOG, MODULE_TITLES, MODULE_WEIGHTS, NOT_APPLICABLE, PII_QUESTIONS } from "../catalog";
import { ReportSubmissionSchema, type AnswerValue, type ReportSubmission } from "../contract";
import { DEVICE_LIST_PRICE, findStore } from "../master-data";
import {
  PROD_NESSUNO,
  QUALI_QUESTIONS,
  isQuestionVisible,
  visibleModules,
  type Answers,
} from "../questionnaire";
import {
  DEFAULT_RETENTION_DAYS,
  addDays,
  canonicalJson,
  encryptPii,
  maskEmail,
  maskPhone,
  normalizeEmail,
  normalizePhone,
  pseudonymize,
  sha256Hex,
} from "./privacy";
import {
  PIPELINE_VERSION,
  type Disposition,
  type Flag,
  type ModuleScore,
  type NormalizedAnswer,
  type PiiVaultEntry,
  type ProcessingResult,
  type StageName,
  type StageResult,
  type VisitKpis,
} from "./types";

export interface ProcessOptions {
  source: "api" | "local-fallback" | "seed";
  /** segreto per la pseudonimizzazione (in produzione da secret manager) */
  pepper: string;
  now?: Date;
  retentionDays?: number;
}

const MIN_VISIT_MINUTES = 4;
const LATE_SUBMISSION_HOURS = 72;
const SERIAL_RE = /^[A-Z0-9]{8,14}$/;

class StageRunner {
  readonly stages: StageResult[] = [];
  readonly flags: Flag[] = [];

  async run(
    stage: StageName,
    fn: (flag: (f: Omit<Flag, "stage">) => void, note: (n: string) => void) => unknown,
  ) {
    const t0 = performance.now();
    const before = this.flags.length;
    const notes: string[] = [];
    await fn(
      (f) => this.flags.push({ ...f, stage }),
      (n) => notes.push(n),
    );
    const mine = this.flags.slice(before);
    const status = mine.some((f) => f.severity === "error")
      ? "fail"
      : mine.some((f) => f.severity === "warning" || f.severity === "quarantine")
        ? "warn"
        : "pass";
    this.stages.push({
      stage,
      status,
      notes,
      durationMs: Math.round((performance.now() - t0) * 100) / 100,
    });
  }

  skip(stage: StageName, reason: string) {
    this.stages.push({ stage, status: "skipped", notes: [reason], durationMs: 0 });
  }

  get failed() {
    return this.flags.some((f) => f.severity === "error");
  }
}

export function dispositionOf(flags: Flag[]): Disposition {
  if (flags.some((f) => f.severity === "error")) return "REJECTED";
  if (flags.some((f) => f.severity === "quarantine")) return "QUARANTINED";
  if (flags.some((f) => f.severity === "warning")) return "ACCEPTED_WITH_WARNINGS";
  return "ACCEPTED";
}

function isAnswered(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== "";
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Hash del contenuto, esclusi i campi di trasporto: rileva re-invii con id diverso. */
export async function contentHashOf(s: ReportSubmission): Promise<string> {
  const { submissionId: _id, submittedAt: _at, client: _c, ...content } = s;
  return sha256Hex(canonicalJson(content));
}

export async function processSubmission(
  raw: unknown,
  opts: ProcessOptions,
): Promise<ProcessingResult> {
  const now = opts.now ?? new Date();
  const run = new StageRunner();
  const errors: { path: string; message: string }[] = [];

  // 1 · SCHEMA — il contratto è la prima barriera
  let sub = null as ReportSubmission | null;
  await run.run("schema", (flag, note) => {
    const parsed = ReportSubmissionSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ path: issue.path.join("."), message: issue.message });
      }
      flag({
        code: "SCHEMA_VIOLATION",
        severity: "error",
        message: `${errors.length} violazioni del contratto v1`,
      });
      return;
    }
    sub = parsed.data;
    note(`Contratto v${parsed.data.schemaVersion} rispettato`);
  });

  if (!sub) {
    const skipped: StageName[] = [
      "referential",
      "consistency",
      "business_rules",
      "privacy",
      "scoring",
    ];
    skipped.forEach((st) => run.skip(st, "Interrotto: payload non conforme al contratto"));
    const { consumer: _pii, ...rest } = (
      raw && typeof raw === "object" ? raw : { value: raw }
    ) as Record<string, unknown>;
    return {
      disposition: "REJECTED",
      report: null,
      vault: null,
      vaultKey: null,
      stages: run.stages,
      flags: run.flags,
      errors,
      deadLetter: {
        id: crypto.randomUUID(),
        receivedAt: now.toISOString(),
        source: opts.source,
        errors,
        payload: rest,
      },
    };
  }
  const s: ReportSubmission = sub;
  const store = findStore(s.visit.storeCode);
  const answers: Answers = {};
  const dropped: string[] = [];

  // 2 · REFERENTIAL — anagrafiche e dominio dei valori
  await run.run("referential", (flag, note) => {
    if (!store) {
      flag({
        code: "UNKNOWN_STORE",
        severity: "quarantine",
        message: `Punto vendita ${s.visit.storeCode} assente dall'anagrafica`,
      });
    }
    for (const a of s.answers) {
      const entry = CATALOG.get(a.questionId);
      if (!entry) {
        dropped.push(a.questionId);
        flag({
          code: "UNKNOWN_QUESTION",
          severity: "warning",
          questionId: a.questionId,
          message: `Domanda sconosciuta ${a.questionId} scartata`,
        });
        continue;
      }
      const q = entry.question;
      const v = a.value;
      const bad = (msg: string) =>
        flag({
          code: "INVALID_VALUE",
          severity: "error",
          questionId: q.id,
          message: `${q.id}: ${msg}`,
        });
      if (q.kind === "single") {
        if (typeof v !== "string" || !q.options?.includes(v))
          bad(`valore "${String(v)}" non ammesso`);
      } else if (q.kind === "multi") {
        if (!Array.isArray(v) || v.some((x) => !q.options?.includes(x))) bad("opzioni non ammesse");
        else if (v.includes(PROD_NESSUNO) && v.length > 1) bad(`"${PROD_NESSUNO}" è esclusivo`);
      } else if (q.kind === "number") {
        const n = asNumber(v);
        if (n === null || n < 0) bad("numero non valido");
        else {
          answers[q.id] = n;
          continue;
        }
      } else if (q.kind === "photo") {
        dropped.push(q.id);
        flag({
          code: "INLINE_BINARY",
          severity: "warning",
          questionId: q.id,
          message: "Le foto vanno inviate come attachment, valore inline scartato",
        });
        continue;
      } else if (typeof v !== "string") {
        bad("atteso testo");
      }
      answers[q.id] = v;
    }
    for (const att of s.attachments) answers[att.questionId] = `sha256:${att.sha256}`;
    note(`${s.answers.length} risposte e ${s.attachments.length} allegati verificati sul catalogo`);
  });

  // 3 · CONSISTENCY — ricalcolo dei rami condizionali lato server
  const ctx = { ageVerificationEnabled: s.auditor.ageVerificationEligible };
  const showQuant = s.visit.reportType === "quantitativo" || s.visit.reportType === "completo";
  const showQuali = s.visit.reportType === "qualitativo" || s.visit.reportType === "completo";
  const consumerGiven = Boolean(s.consumer?.email || s.consumer?.phone);
  let completionPct = 0;
  await run.run("consistency", (flag, note) => {
    if (s.visit.outcome === "interrupted") {
      if (s.visit.storeCollaborating) {
        flag({
          code: "INTERRUPTED_BUT_COLLABORATING",
          severity: "warning",
          message: "Audit interrotto con PV dichiarato collaborante",
        });
      }
      for (const id of Object.keys(answers)) {
        delete answers[id];
        dropped.push(id);
      }
      completionPct = 100;
      note("Audit interrotto: nessuna risposta attesa");
      return;
    }
    const required = [
      ...(showQuant
        ? visibleModules(answers).flatMap((m) =>
            m.questions.filter((q) => isQuestionVisible(q, answers, ctx)),
          )
        : []),
      ...(showQuali ? QUALI_QUESTIONS : []),
    ];
    const requiredIds = new Set(required.map((q) => q.id));
    // le foto viaggiano su un canale separato (upload asincrono): la loro assenza
    // è gestita come regola di business, non blocca la completezza del questionario
    const mandatory = required.filter((q) => q.kind !== "photo");
    // risposte orfane: rimaste in bozza su rami poi disattivati
    for (const id of Object.keys(answers)) {
      if (!requiredIds.has(id)) {
        delete answers[id];
        dropped.push(id);
        flag({
          code: "ORPHAN_ANSWER",
          severity: "warning",
          questionId: id,
          message: `Risposta a ${id} fuori dal ramo attivo, rimossa`,
        });
      }
    }
    const done = mandatory.filter((q) =>
      PII_QUESTIONS.has(q.id) ? consumerGiven : isAnswered(answers[q.id]),
    ).length;
    completionPct = mandatory.length ? Math.round((done / mandatory.length) * 100) : 0;
    if (completionPct < 100) {
      const missing = mandatory.filter(
        (q) => !(PII_QUESTIONS.has(q.id) ? consumerGiven : isAnswered(answers[q.id])),
      );
      flag({
        code: "INCOMPLETE_REPORT",
        severity: "error",
        message: `Completamento ${completionPct}%: mancano ${missing.map((q) => q.id).join(", ")}`,
      });
    }
    note(
      `${required.length} domande attive su ${CATALOG.size} a catalogo · completamento ${completionPct}%`,
    );
  });

  // 4 · BUSINESS RULES
  const startedAt = new Date(s.visit.startedAt);
  const endedAt = new Date(s.visit.endedAt);
  const durationMin = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);
  const purchase = answers["d0_acquisto"] === "Sì";
  const price = asNumber(answers["e1_prezzo"]);
  const model =
    typeof answers["e1_modello"] === "string" ? (answers["e1_modello"] as string) : null;
  const serial =
    typeof answers["e1_seriale"] === "string"
      ? (answers["e1_seriale"] as string).trim().toUpperCase()
      : null;
  const bundleSticks = asNumber(answers["e1_bundle_stick"]) ?? 0;
  const leadExpected = purchase && answers["c1_bundle"] === "Sì" && bundleSticks > 0;
  let keepPii = false;

  await run.run("business_rules", (flag, note) => {
    if (endedAt < startedAt) {
      flag({
        code: "INVALID_TIMESPAN",
        severity: "error",
        message: "Fine visita precedente all'inizio",
      });
    }
    if (new Date(s.submittedAt).getTime() > now.getTime() + 5 * 60_000) {
      flag({
        code: "FUTURE_TIMESTAMP",
        severity: "error",
        message: "submittedAt nel futuro: orologio del device non affidabile",
      });
    }
    if (
      s.visit.outcome === "completed" &&
      showQuant &&
      durationMin >= 0 &&
      durationMin < MIN_VISIT_MINUTES
    ) {
      flag({
        code: "VISIT_TOO_SHORT",
        severity: "quarantine",
        message: `Visita di ${durationMin} min: sotto la soglia minima di ${MIN_VISIT_MINUTES}`,
      });
    }
    const lagH = (new Date(s.submittedAt).getTime() - endedAt.getTime()) / 3_600_000;
    if (lagH > LATE_SUBMISSION_HOURS) {
      flag({
        code: "LATE_SUBMISSION",
        severity: "warning",
        message: `Inviato ${Math.round(lagH)} ore dopo la visita`,
      });
    }
    if (purchase) {
      const list = model ? DEVICE_LIST_PRICE[model] : undefined;
      if (price === null || price <= 0) {
        flag({
          code: "PRICE_MISSING",
          severity: "error",
          questionId: "e1_prezzo",
          message: "Acquisto senza prezzo valido",
        });
      } else if (list && (price > list * 1.5 || price < list * 0.5)) {
        flag({
          code: "PRICE_OUT_OF_RANGE",
          severity: "quarantine",
          questionId: "e1_prezzo",
          message: `€ ${price.toFixed(2)} fuori range rispetto al listino ${model} (€ ${list})`,
        });
      }
      if (serial && !SERIAL_RE.test(serial)) {
        flag({
          code: "SERIAL_FORMAT",
          severity: "warning",
          questionId: "e1_seriale",
          message: `Seriale "${serial}" in formato non standard`,
        });
      }
      if (!s.attachments.some((a) => a.questionId === "e1_foto_scontrino")) {
        flag({
          code: "MISSING_RECEIPT",
          severity: "quarantine",
          questionId: "e1_foto_scontrino",
          message: "Spesa senza scontrino allegato: non rimborsabile",
        });
      }
      if (!s.attachments.some((a) => a.questionId === "e1_foto_scatola")) {
        flag({
          code: "MISSING_BOX_PHOTO",
          severity: "warning",
          questionId: "e1_foto_scatola",
          message: "Foto della confezione mancante",
        });
      }
    }
    if (bundleSticks > 20) {
      flag({
        code: "BUNDLE_QTY_HIGH",
        severity: "warning",
        questionId: "e1_bundle_stick",
        message: `${bundleSticks} pacchetti in bundle: quantità anomala`,
      });
    }
    if (s.consumer) {
      if (!leadExpected) {
        flag({
          code: "UNEXPECTED_PII",
          severity: "warning",
          message: "Dati consumatore non previsti dal flusso: scartati (minimizzazione)",
        });
      } else if (!s.consumer.consent) {
        flag({
          code: "CONSENT_MISSING",
          severity: "quarantine",
          message: "Contatti senza consenso privacy: non memorizzati",
        });
      } else {
        keepPii = true;
      }
    }
    note(`Durata visita ${durationMin} min${purchase ? ` · acquisto ${model ?? "n/d"}` : ""}`);
  });

  // 5 · PRIVACY — pseudonimizzazione e cifratura dei contatti
  let vault = null as PiiVaultEntry | null;
  let vaultKey = null as ProcessingResult["vaultKey"];
  let piiToken = null as string | null;
  if (run.failed) run.skip("privacy", "Report rifiutato: nessun dato personale memorizzato");
  else
    await run.run("privacy", async (_flag, note) => {
      if (!s.consumer || !keepPii) {
        note(s.consumer ? "Dati personali scartati" : "Nessun dato personale nel payload");
        return;
      }
      const c = s.consumer;
      const key = c.email ? normalizeEmail(c.email) : normalizePhone(c.phone ?? "");
      piiToken = await pseudonymize(key, opts.pepper);
      const sealed = await encryptPii({
        email: c.email ?? null,
        phone: c.phone ? normalizePhone(c.phone) : null,
      });
      const keyId = `k_${crypto.randomUUID()}`;
      vault = {
        token: piiToken,
        submissionId: s.submissionId,
        storeCode: s.visit.storeCode,
        emailMasked: c.email ? maskEmail(c.email) : null,
        phoneMasked: c.phone ? maskPhone(c.phone) : null,
        consent: c.consent,
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        keyId,
        createdAt: now.toISOString(),
        retentionUntil: addDays(now.toISOString(), opts.retentionDays ?? DEFAULT_RETENTION_DAYS),
        status: "active",
      };
      vaultKey = { keyId, jwk: sealed.jwk };
      note(
        `Contatto pseudonimizzato (${piiToken}) e cifrato AES-256-GCM · retention ${opts.retentionDays ?? DEFAULT_RETENTION_DAYS} gg`,
      );
    });

  // 6 · SCORING — compliance per modulo e KPI di visita
  const normalized: NormalizedAnswer[] = [];
  const modules: ModuleScore[] = [];
  let score = null as number | null;
  if (run.failed) run.skip("scoring", "Report rifiutato");
  else
    await run.run("scoring", (_flag, note) => {
      const byModule = new Map<string, { c: number; n: number }>();
      for (const [id, value] of Object.entries(answers)) {
        const entry = CATALOG.get(id);
        if (!entry) continue;
        let compliant: boolean | null = null;
        if (entry.compliantValue && value !== NOT_APPLICABLE) {
          compliant = value === entry.compliantValue;
          const m = byModule.get(entry.moduleId) ?? { c: 0, n: 0 };
          m.n++;
          if (compliant) m.c++;
          byModule.set(entry.moduleId, m);
        }
        normalized.push({
          questionId: id,
          moduleId: entry.moduleId,
          label: entry.question.label,
          value: value as AnswerValue,
          compliant,
        });
      }
      let wSum = 0;
      let acc = 0;
      for (const [moduleId, { c, n }] of byModule) {
        const ms = n ? c / n : null;
        modules.push({
          moduleId,
          title: MODULE_TITLES[moduleId] ?? moduleId,
          score: ms === null ? null : Math.round(ms * 100),
          compliant: c,
          scorable: n,
        });
        const w = MODULE_WEIGHTS[moduleId] ?? 0;
        if (ms !== null) {
          wSum += w;
          acc += w * ms;
        }
      }
      modules.sort((a, b) => a.moduleId.localeCompare(b.moduleId));
      score = wSum ? Math.round((acc / wSum) * 100) : null;
      note(
        score === null
          ? "Nessuna domanda valutabile"
          : `Score ponderato ${score}/100 su ${modules.length} moduli`,
      );
    });

  const products = Array.isArray(answers["c0_prodotti"])
    ? (answers["c0_prodotti"] as string[]).filter((p) => p !== PROD_NESSUNO)
    : [];
  const yn = (id: string): boolean | null =>
    answers[id] === undefined ? null : answers[id] === "Sì";
  const kpis: VisitKpis = {
    hostessPresent: yn("a1_hostess"),
    proactiveEngagement: yn("b1_ingaggio"),
    ageCheckPerformed:
      answers["b2_strumenti"] === undefined ? null : answers["b2_strumenti"] === "Sì",
    productsPresented: products,
    purchase,
    deviceModel: purchase ? model : null,
    devicePrice: purchase ? price : null,
    deviceSerial: purchase ? serial : null,
    bundleSticks,
    durationMin,
  };

  const disposition = dispositionOf(run.flags);
  const redactedPayload = {
    ...s,
    consumer: s.consumer
      ? {
          email: s.consumer.email ? maskEmail(s.consumer.email) : undefined,
          phone: s.consumer.phone ? maskPhone(s.consumer.phone) : undefined,
          consent: s.consumer.consent,
        }
      : undefined,
  };

  return {
    disposition,
    errors,
    deadLetter: null,
    stages: run.stages,
    flags: run.flags,
    vault,
    vaultKey,
    report: {
      submissionId: s.submissionId,
      contentHash: await contentHashOf(s),
      pipelineVersion: PIPELINE_VERSION,
      receivedAt: now.toISOString(),
      processedAt: now.toISOString(),
      source: opts.source,
      disposition,
      review: { status: disposition === "QUARANTINED" ? "pending" : "none" },
      stages: run.stages,
      flags: run.flags,
      auditorId: s.auditor.auditorId,
      storeCode: s.visit.storeCode,
      city: store?.city ?? null,
      region: store?.region ?? null,
      activityType: s.visit.activityType,
      reportType: s.visit.reportType,
      outcome: s.visit.outcome,
      visitDate: s.visit.startedAt.slice(0, 10),
      startedAt: s.visit.startedAt,
      endedAt: s.visit.endedAt,
      completionPct,
      score,
      modules,
      kpis,
      answers: normalized,
      droppedAnswers: dropped,
      attachments: s.attachments,
      piiToken,
      redactedPayload,
    },
  };
}
