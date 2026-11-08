/**
 * Generatore di dati sintetici per la demo: simula 8 settimane di audit sul campo
 * percorrendo il questionario reale (stessi rami condizionali) e inietta anomalie
 * note per mostrare cosa intercetta la pipeline. Deterministico (PRNG con seed).
 */
import type { SubmissionInput } from "@/domain/contract";
import { DEVICE_LIST_PRICE } from "@/domain/master-data";
import { processSubmission } from "@/domain/pipeline/process";
import type { ProcessingResult } from "@/domain/pipeline/types";
import {
  ACTIVITY_TYPES,
  PROD_GLO,
  PROD_NESSUNO,
  PROD_VELO,
  PROD_VUSE,
  QUALI_QUESTIONS,
  QUANT_MODULES,
  STORES,
  isQuestionVisible,
  type Answers,
} from "@/domain/questionnaire";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const hex = (r: Rng, n: number) =>
  Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join("");
const uuid = (r: Rng) =>
  `${hex(r, 8)}-${hex(r, 4)}-4${hex(r, 3)}-${pick(r, ["8", "9", "a", "b"])}${hex(r, 3)}-${hex(r, 12)}`;

const AUDITORS = [
  "AUD-014",
  "AUD-022",
  "AUD-031",
  "AUD-047",
  "AUD-052",
  "AUD-068",
  "AUD-073",
  "AUD-090",
];

/** Qualità media di ciascun PV: rende la classifica e la dispersione realistiche. */
const STORE_QUALITY: Record<string, number> = Object.fromEntries(
  STORES.map((s, i) => [
    s.code,
    [0.92, 0.85, 0.78, 0.9, 0.66, 0.81, 0.58, 0.74, 0.88, 0.83, 0.7, 0.62][i] ?? 0.8,
  ]),
);

/**
 * Bias di valutazione "piantato": AUD-090 è sistematicamente più severo.
 * Serve a dimostrare che l'analisi di calibrazione (analytics/kpi_report.py) lo ritrova.
 */
const AUDITOR_BIAS: Record<string, number> = { "AUD-090": -0.22 };

const QUALI_TEXT = [
  "Approccio cordiale all'ingresso, la hostess ha introdotto il prodotto in modo chiaro e senza insistenza.",
  "Hostess impegnata al telefono per alcuni minuti prima di notare i clienti in ingresso.",
  "Spiegazione tecnica accurata, poca attenzione alle promozioni attive.",
  "Interazione rapida ma completa; materiali ordinati e ben visibili.",
  "Nessuna criticità rilevante osservata durante la visita.",
];

interface Anomaly {
  kind:
    | "price_out_of_range"
    | "duplicate_serial"
    | "short_visit"
    | "missing_receipt"
    | "unknown_store"
    | "schema_error"
    | "orphan"
    | "duplicate_content"
    | "replay"
    | "no_consent"
    | "incomplete"
    | "invalid_value";
}

function simulateAnswers(
  r: Rng,
  quality: number,
  ageCtx: boolean,
  forcePurchase: boolean,
): Answers {
  const a: Answers = {};
  const ctx = { ageVerificationEnabled: ageCtx };
  for (const m of QUANT_MODULES) {
    if (m.blockedBy?.(a)) break;
    for (const q of m.questions) {
      if (!isQuestionVisible(q, a, ctx)) continue;
      switch (q.id) {
        case "a1_hostess":
          a[q.id] = r() < 0.93 ? "Sì" : "No";
          continue;
        case "d0_acquisto":
          a[q.id] = forcePurchase || r() < 0.32 ? "Sì" : "No";
          continue;
        case "c0_prodotti": {
          const sel = [
            ...(r() < 0.85 ? [PROD_GLO] : []),
            ...(r() < 0.45 ? [PROD_VELO] : []),
            ...(r() < 0.4 ? [PROD_VUSE] : []),
          ];
          a[q.id] = sel.length ? sel : [PROD_NESSUNO];
          continue;
        }
        case "c1_bundle":
          a[q.id] = r() < 0.12 ? "Non Applicabile" : r() < quality ? "Sì" : "No";
          continue;
        case "e1_modello":
          a[q.id] = r() < 0.6 ? "Hilo" : "Hyper Pro";
          continue;
        case "e1_prezzo": {
          const list = DEVICE_LIST_PRICE[a["e1_modello"] as string] ?? 39;
          a[q.id] = r() < 0.2 ? Math.round(list * 0.8 * 100) / 100 : list;
          continue;
        }
        case "e1_seriale":
          a[q.id] = `HP${24 + Math.floor(r() * 2)}X${hex(r, 6).toUpperCase()}`;
          continue;
        case "e1_bundle_stick":
          a[q.id] = 2 + Math.floor(r() * 4);
          continue;
        case "e1_email":
          a[q.id] = `cliente.${hex(r, 5)}@example.com`;
          continue;
        case "e1_phone":
          a[q.id] = `+39 3${Math.floor(r() * 10)}${Math.floor(1_000_000 + r() * 8_999_999)}`;
          continue;
        case "e1_consenso":
          a[q.id] = "Sì";
          continue;
      }
      if (q.kind === "photo") {
        a[q.id] = `photo:${hex(r, 64)}`;
      } else if (q.kind === "single") {
        const opts = q.options ?? [];
        a[q.id] = opts[0] === "Sì" ? (r() < quality ? "Sì" : opts[1]) : pick(r, opts);
      } else if (q.kind === "multi") {
        a[q.id] = [pick(r, q.options ?? [])];
      }
    }
  }
  return a;
}

function toPayload(
  r: Rng,
  a: Answers,
  base: {
    id: string;
    auditor: string;
    store: string;
    start: Date;
    minutes: number;
    reportType: "quantitativo" | "qualitativo" | "completo";
    ageCtx: boolean;
  },
): SubmissionInput {
  const answers: SubmissionInput["answers"] = [];
  const attachments: NonNullable<SubmissionInput["attachments"]> = [];
  for (const [questionId, value] of Object.entries(a)) {
    if (questionId === "e1_email" || questionId === "e1_phone") continue;
    if (typeof value === "string" && value.startsWith("photo:")) {
      attachments.push({
        questionId,
        sha256: value.slice(6),
        bytes: 180_000 + Math.floor(r() * 900_000),
        mimeType: "image/jpeg",
      });
      continue;
    }
    answers.push({ questionId, value: value as string | number | string[] });
  }
  const end = new Date(base.start.getTime() + base.minutes * 60_000);
  const email = a["e1_email"] as string | undefined;
  const phone = a["e1_phone"] as string | undefined;
  return {
    schemaVersion: "1.0",
    submissionId: base.id,
    submittedAt: new Date(end.getTime() + Math.floor(r() * 40) * 60_000).toISOString(),
    client: { app: "fieldsight-field", version: "2.0.0", queuedOffline: r() < 0.15 },
    auditor: { auditorId: base.auditor, ageVerificationEligible: base.ageCtx },
    visit: {
      activityType: pick(r, ACTIVITY_TYPES),
      storeCode: base.store,
      startedAt: base.start.toISOString(),
      endedAt: end.toISOString(),
      outcome: "completed",
      storeCollaborating: true,
      reportType: base.reportType,
    },
    answers,
    attachments,
    ...(email || phone ? { consumer: { email, phone, consent: a["e1_consenso"] === "Sì" } } : {}),
  };
}

export interface SeedOptions {
  count?: number;
  weeks?: number;
  seed?: number;
  now?: Date;
}

/** Restituisce gli esiti di pipeline in ordine cronologico, pronti per ingestBatch. */
export async function generateSeed(opts: SeedOptions = {}): Promise<ProcessingResult[]> {
  const r = mulberry32(opts.seed ?? 20261108);
  const count = opts.count ?? 180;
  const weeks = opts.weeks ?? 8;
  const now = opts.now ?? new Date();
  const span = weeks * 7 * 86_400_000;

  const anomalyAt = new Map<number, Anomaly["kind"]>([
    [17, "price_out_of_range"],
    [33, "short_visit"],
    [48, "missing_receipt"],
    [61, "unknown_store"],
    [66, "invalid_value"],
    [115, "incomplete"],
    [74, "schema_error"],
    [88, "orphan"],
    [97, "duplicate_serial"],
    [109, "duplicate_content"],
    [121, "replay"],
    [133, "short_visit"],
    [140, "schema_error"],
    [152, "no_consent"],
    [160, "duplicate_serial"],
    [171, "price_out_of_range"],
  ]);

  const payloads: { payload: unknown; at: Date }[] = [];
  const serials: string[] = [];
  let lastPayload: SubmissionInput | null = null;

  for (let i = 0; i < count; i++) {
    const t = now.getTime() - span + (span * i) / count;
    const start = new Date(t);
    start.setHours(9 + Math.floor(r() * 9), Math.floor(r() * 60), 0, 0);
    if (start.getTime() > now.getTime() - 3 * 3_600_000)
      start.setTime(now.getTime() - 3 * 3_600_000 - (count - i) * 60_000);
    const store = pick(r, STORES).code;
    const auditor = pick(r, AUDITORS);
    const kind = anomalyAt.get(i);
    const id = uuid(r);

    if (r() < 0.05 && !kind) {
      // PV non collaborante: audit interrotto
      payloads.push({
        at: start,
        payload: {
          schemaVersion: "1.0",
          submissionId: id,
          submittedAt: new Date(start.getTime() + 10 * 60_000).toISOString(),
          client: { app: "fieldsight-field", version: "2.0.0", queuedOffline: false },
          auditor: { auditorId: auditor, ageVerificationEligible: false },
          visit: {
            activityType: pick(r, ACTIVITY_TYPES),
            storeCode: store,
            startedAt: start.toISOString(),
            endedAt: new Date(start.getTime() + 6 * 60_000).toISOString(),
            outcome: "interrupted",
            storeCollaborating: false,
            reportType: null,
          },
          answers: [],
          attachments: [],
        } satisfies SubmissionInput,
      });
      continue;
    }

    const week = Math.floor((i / count) * weeks);
    const quality = Math.max(
      0.2,
      Math.min(0.97, (STORE_QUALITY[store] ?? 0.8) + week * 0.012 + (AUDITOR_BIAS[auditor] ?? 0)),
    );
    const ageCtx = r() < 0.3;
    const forcePurchase =
      kind === "price_out_of_range" ||
      kind === "duplicate_serial" ||
      kind === "missing_receipt" ||
      kind === "no_consent";
    const rt = r() < 0.65 ? "completo" : r() < 0.85 ? "quantitativo" : "qualitativo";
    const reportType = forcePurchase && rt === "qualitativo" ? "completo" : rt;
    const forceQuant = kind === "short_visit" || kind === "incomplete" || kind === "invalid_value";
    let a =
      reportType === "qualitativo" && !forceQuant
        ? {}
        : simulateAnswers(r, quality, ageCtx, forcePurchase);
    for (let t = 0; t < 30 && forcePurchase && a["d0_acquisto"] !== "Sì"; t++)
      a = simulateAnswers(r, quality, ageCtx, true);
    // il caso "consenso negato" richiede il ramo completo GLO → bundle → lead
    for (let t = 0; t < 30 && kind === "no_consent" && !a["e1_email"]; t++)
      a = simulateAnswers(r, 0.99, ageCtx, true);
    if (reportType !== "quantitativo" || forceQuant)
      QUALI_QUESTIONS.forEach((q) => (a[q.id] = pick(r, QUALI_TEXT)));

    if (a["e1_seriale"]) serials.push(a["e1_seriale"] as string);
    if (kind === "price_out_of_range") a["e1_prezzo"] = 89;
    if (kind === "duplicate_serial" && serials.length > 2)
      a["e1_seriale"] = serials[Math.floor(serials.length / 2)];
    if (kind === "missing_receipt") delete a["e1_foto_scontrino"];
    if (kind === "no_consent" && a["e1_email"]) a["e1_consenso"] = "No";

    const minutes = kind === "short_visit" ? 2 : 12 + Math.floor(r() * 25);
    const payload = toPayload(r, a, {
      id,
      auditor,
      store: kind === "unknown_store" ? "PV-9999" : store,
      start,
      minutes,
      reportType:
        kind === "short_visit" || kind === "incomplete" || kind === "invalid_value"
          ? "completo"
          : reportType,
      ageCtx,
    });

    if (kind === "incomplete")
      payload.answers = payload.answers.filter((x) => x.questionId !== "a1_hostess");
    if (kind === "invalid_value")
      payload.answers.push({ questionId: "c3_vuse", value: "Non Applicabile" });
    if (kind === "orphan") payload.answers.push({ questionId: "a1_attesa", value: "30 minuti" });
    if (kind === "schema_error") {
      payloads.push({
        at: start,
        payload: {
          ...payload,
          auditor: { auditorId: "" },
          visit: { ...payload.visit, storeCode: "0101" },
        },
      });
      continue;
    }
    if (kind === "duplicate_content" && lastPayload) {
      payloads.push({
        at: start,
        payload: { ...lastPayload, submissionId: id, submittedAt: start.toISOString() },
      });
      continue;
    }
    if (kind === "replay" && lastPayload) {
      payloads.push({ at: start, payload: lastPayload });
      continue;
    }
    payloads.push({ at: start, payload });
    lastPayload = payload;
  }

  const results: ProcessingResult[] = [];
  for (const p of payloads) {
    const submitted = (p.payload as { submittedAt?: string }).submittedAt;
    const base =
      submitted && !Number.isNaN(Date.parse(submitted)) ? Date.parse(submitted) : p.at.getTime();
    const processedAt = new Date(Math.min(now.getTime(), base + 90_000));
    results.push(
      await processSubmission(p.payload, {
        source: "seed",
        pepper: "fieldsight-demo-pepper",
        now: processedAt,
      }),
    );
  }
  return results;
}
