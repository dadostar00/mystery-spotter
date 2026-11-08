import { describe, expect, it } from "vitest";

import type { SubmissionInput } from "../contract";
import { decryptPii } from "./privacy";
import { processSubmission } from "./process";
import { applyStatefulChecks, robustZ } from "./stateful";
import type { ProcessedReport } from "./types";

const NOW = new Date("2026-11-08T12:00:00Z");
const opts = { source: "api" as const, pepper: "test-pepper", now: NOW };

/** Visita completa con acquisto GLO + bundle + lead: il percorso più lungo del questionario. */
function fullVisit(over: Partial<SubmissionInput> = {}): SubmissionInput {
  return {
    schemaVersion: "1.0",
    submissionId: "6f1c2a1e-3b7d-4c8e-9a10-1b2c3d4e5f60",
    submittedAt: "2026-11-08T10:40:00Z",
    client: { app: "test", version: "1", queuedOffline: false },
    auditor: { auditorId: "AUD-001", ageVerificationEligible: false },
    visit: {
      activityType: "121 Standard",
      storeCode: "PV-0101",
      startedAt: "2026-11-08T10:00:00Z",
      endedAt: "2026-11-08T10:30:00Z",
      outcome: "completed",
      storeCollaborating: true,
      reportType: "quantitativo",
    },
    answers: [
      { questionId: "a1_hostess", value: "Sì" },
      { questionId: "a2_uniforme", value: "Sì" },
      { questionId: "a3_materiali", value: "Sì" },
      { questionId: "a3_dispositivi", value: "Sì" },
      { questionId: "a4_stato", value: "No" },
      { questionId: "a4_problema", value: "Usurati" },
      { questionId: "b1_ingaggio", value: "Sì" },
      { questionId: "b3_profilazione", value: "Sì" },
      { questionId: "c0_prodotti", value: ["GLO (Tabacco Riscaldato)"] },
      { questionId: "c1_prova", value: "Sì" },
      { questionId: "c1_peculiarita", value: "Sì" },
      { questionId: "c1_prezzi", value: "Sì" },
      { questionId: "c1_bundle", value: "Sì" },
      { questionId: "c1_registrazione", value: "Sì" },
      { questionId: "c1_extra", value: "No" },
      { questionId: "d0_acquisto", value: "Sì" },
      { questionId: "d1_processo", value: "Sì" },
      { questionId: "d2_consenso", value: "Sì" },
      { questionId: "d3_sms", value: "Sì" },
      { questionId: "e1_modello", value: "Hilo" },
      { questionId: "e1_prezzo", value: 39 },
      { questionId: "e1_seriale", value: "HP24XA1B2C3" },
      { questionId: "e1_bundle_stick", value: 3 },
      { questionId: "e1_consenso", value: "Sì" },
    ],
    attachments: [
      {
        questionId: "e1_foto_scontrino",
        sha256: "a".repeat(64),
        bytes: 1000,
        mimeType: "image/jpeg",
      },
      {
        questionId: "e1_foto_scatola",
        sha256: "b".repeat(64),
        bytes: 1000,
        mimeType: "image/jpeg",
      },
    ],
    consumer: { email: "Mario.Rossi@Example.com", phone: "333 1234567", consent: true },
    ...over,
  };
}

const codes = (r: { flags: { code: string }[] }) => r.flags.map((f) => f.code);

describe("contratto e validazione", () => {
  it("accetta una visita completa e calcola lo score", async () => {
    const r = await processSubmission(fullVisit(), opts);
    expect(r.disposition).toBe("ACCEPTED");
    expect(r.report?.completionPct).toBe(100);
    // 2 non conformità (a4_stato, c1_extra) su 16 domande valutate, pesate per modulo
    expect(r.report?.score).toBeGreaterThan(80);
    expect(r.report?.score).toBeLessThan(100);
  });

  it("rifiuta un payload fuori contratto e lo manda in dead-letter senza PII", async () => {
    const bad = { ...fullVisit(), submissionId: "non-un-uuid" };
    const r = await processSubmission(bad, opts);
    expect(r.disposition).toBe("REJECTED");
    expect(r.report).toBeNull();
    expect(r.errors[0]?.path).toBe("submissionId");
    expect(JSON.stringify(r.deadLetter)).not.toContain("Mario");
  });

  it("rifiuta valori fuori dominio (VELO/VUSE: solo Sì/No)", async () => {
    const s = fullVisit();
    s.answers.push({ questionId: "c2_velo_trial", value: "Non Applicabile" });
    const r = await processSubmission(s, opts);
    expect(r.disposition).toBe("REJECTED");
    expect(codes(r)).toContain("INVALID_VALUE");
  });

  it("rifiuta un report dichiarato completo ma con domande mancanti", async () => {
    const s = fullVisit();
    s.answers = s.answers.filter((a) => a.questionId !== "c1_prezzi");
    const r = await processSubmission(s, opts);
    expect(r.disposition).toBe("REJECTED");
    expect(codes(r)).toContain("INCOMPLETE_REPORT");
  });
});

describe("coerenza dei rami condizionali", () => {
  it("rimuove le risposte orfane di rami disattivati", async () => {
    const s = fullVisit();
    s.answers.push({ questionId: "a1_attesa", value: "30 minuti" }); // visibile solo se hostess assente
    const r = await processSubmission(s, opts);
    expect(r.disposition).toBe("ACCEPTED_WITH_WARNINGS");
    expect(r.report?.droppedAnswers).toContain("a1_attesa");
    expect(r.report?.answers.some((a) => a.questionId === "a1_attesa")).toBe(false);
  });
});

describe("regole di business", () => {
  it("mette in quarantena prezzi fuori listino e spese senza scontrino", async () => {
    const s = fullVisit({ attachments: [] });
    s.answers = s.answers.map((a) => (a.questionId === "e1_prezzo" ? { ...a, value: 120 } : a));
    const r = await processSubmission(s, opts);
    expect(r.disposition).toBe("QUARANTINED");
    expect(codes(r)).toEqual(expect.arrayContaining(["PRICE_OUT_OF_RANGE", "MISSING_RECEIPT"]));
  });

  it("segnala visite troppo brevi", async () => {
    const s = fullVisit();
    s.visit = { ...s.visit, endedAt: "2026-11-08T10:02:00Z" };
    const r = await processSubmission(s, opts);
    expect(codes(r)).toContain("VISIT_TOO_SHORT");
  });

  it("non memorizza contatti senza consenso", async () => {
    const s = fullVisit({ consumer: { email: "a@b.it", consent: false } });
    const r = await processSubmission(s, opts);
    expect(codes(r)).toContain("CONSENT_MISSING");
    expect(r.vault).toBeNull();
    expect(r.report?.piiToken).toBeNull();
  });
});

describe("privacy", () => {
  it("pseudonimizza, maschera e cifra; nessun PII in chiaro nel fact", async () => {
    const r = await processSubmission(fullVisit(), opts);
    expect(r.vault?.emailMasked).toBe("m***@example.com");
    expect(r.report?.piiToken).toMatch(/^pii_[a-f0-9]{24}$/);
    expect(JSON.stringify(r.report)).not.toMatch(/mario\.rossi|1234567/i);
    const plain = await decryptPii<{ email: string; phone: string }>(
      r.vault!.ciphertext,
      r.vault!.iv,
      r.vaultKey!.jwk,
    );
    expect(plain.phone).toBe("+393331234567");
  });

  it("il token è stabile a parità di contatto normalizzato", async () => {
    const a = await processSubmission(fullVisit(), opts);
    const b = await processSubmission(
      fullVisit({ consumer: { email: "MARIO.ROSSI@example.COM", consent: true } }),
      opts,
    );
    expect(a.report?.piiToken).toBe(b.report?.piiToken);
  });
});

describe("controlli stateful", () => {
  const accepted = async (over: Partial<SubmissionInput> = {}) =>
    (await processSubmission(fullVisit(over), opts)).report as ProcessedReport;

  it("è idempotente sullo stesso submissionId", async () => {
    const r = await accepted();
    expect(applyStatefulChecks(r, [r]).kind).toBe("replay");
  });

  it("rileva doppi invii con id diverso e seriali già rendicontati", async () => {
    const first = await accepted();
    const second = await accepted({
      submissionId: "7a1c2a1e-3b7d-4c8e-9a10-1b2c3d4e5f61",
      submittedAt: "2026-11-08T11:00:00Z",
    });
    const d = applyStatefulChecks(second, [first]);
    expect(d.kind).toBe("insert");
    if (d.kind === "insert") {
      expect(d.report.disposition).toBe("QUARANTINED");
      expect(codes(d.report)).toEqual(
        expect.arrayContaining(["DUPLICATE_CONTENT", "DUPLICATE_SERIAL", "REPEATED_VISIT"]),
      );
    }
  });

  it("robust z-score ignora la coda e trova l'outlier", () => {
    const sample = [39, 39, 31.2, 39, 31.2, 39, 39, 31.2, 39, 40];
    expect(robustZ(39, sample)).toBe(0);
    // lo sconto promo ricorrente (-20%) non è un'anomalia, un prezzo a 5€ sì
    expect(Math.abs(robustZ(31.2, sample) ?? 0)).toBeLessThan(3.5);
    expect(Math.abs(robustZ(5, sample) ?? 0)).toBeGreaterThan(3.5);
    expect(robustZ(39, [39, 39, 39, 39, 39, 39, 39, 39])).toBe(0);
    expect(robustZ(39, [39, 39])).toBeNull();
  });
});
