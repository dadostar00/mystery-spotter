import type { SubmissionInput } from "@/domain/contract";

/** Payload di esempio per il playground dell'API. */
export function samplePayload(kind: "valid" | "quarantine" | "invalid"): unknown {
  const now = Date.now();
  const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
  const base: SubmissionInput = {
    schemaVersion: "1.0",
    submissionId: crypto.randomUUID(),
    submittedAt: iso(1),
    client: { app: "api-playground", version: "1.0.0", queuedOffline: false },
    auditor: { auditorId: "AUD-DEMO", ageVerificationEligible: false },
    visit: {
      activityType: "121 Executive",
      storeCode: "PV-0210",
      startedAt: iso(32),
      endedAt: iso(5),
      outcome: "completed",
      storeCollaborating: true,
      reportType: "quantitativo",
    },
    answers: [
      { questionId: "a1_hostess", value: "Sì" },
      { questionId: "a2_uniforme", value: "Sì" },
      { questionId: "a3_materiali", value: "Sì" },
      { questionId: "a3_dispositivi", value: "Sì" },
      { questionId: "a4_stato", value: "Sì" },
      { questionId: "b1_ingaggio", value: "Sì" },
      { questionId: "b3_profilazione", value: "No" },
      {
        questionId: "c0_prodotti",
        value: ["GLO (Tabacco Riscaldato)", "VELO (Bustine di Nicotina)"],
      },
      { questionId: "c1_prova", value: "Sì" },
      { questionId: "c1_peculiarita", value: "Sì" },
      { questionId: "c1_prezzi", value: "Sì" },
      { questionId: "c1_bundle", value: "Non Applicabile" },
      { questionId: "c1_registrazione", value: "Sì" },
      { questionId: "c1_extra", value: "No" },
      { questionId: "c2_velo_trial", value: "Sì" },
      { questionId: "d0_acquisto", value: "Sì" },
      { questionId: "d1_processo", value: "Sì" },
      { questionId: "d2_consenso", value: "Sì" },
      { questionId: "d3_sms", value: "Sì" },
      { questionId: "e1_modello", value: "Hyper Pro" },
      { questionId: "e1_prezzo", value: 29 },
      { questionId: "e1_seriale", value: "HP25XC0FFEE" },
    ],
    attachments: [
      {
        questionId: "e1_foto_scontrino",
        sha256: "3f".repeat(32),
        bytes: 412_000,
        mimeType: "image/jpeg",
      },
      {
        questionId: "e1_foto_scatola",
        sha256: "7a".repeat(32),
        bytes: 388_000,
        mimeType: "image/jpeg",
      },
    ],
  };
  if (kind === "quarantine") {
    return {
      ...base,
      visit: { ...base.visit, startedAt: iso(8), endedAt: iso(6) },
      answers: base.answers.map((a) => (a.questionId === "e1_prezzo" ? { ...a, value: 79 } : a)),
      attachments: base.attachments?.filter((a) => a.questionId !== "e1_foto_scontrino"),
    };
  }
  if (kind === "invalid") {
    return {
      ...base,
      submissionId: "1234",
      visit: { ...base.visit, storeCode: "TORINO-1", activityType: "Visita" },
      answers: [...base.answers, { questionId: "c3_vuse", value: "Forse" }],
    };
  }
  return base;
}
