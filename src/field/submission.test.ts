import { describe, expect, it } from "vitest";

import { ReportSubmissionSchema } from "@/domain/contract";
import { processSubmission } from "@/domain/pipeline/process";
import { PROD_GLO } from "@/domain/questionnaire";
import { buildSubmission } from "./submission";

const photo = "data:image/jpeg;base64," + "A".repeat(4000);

describe("app auditor → contratto v1", () => {
  it("trasforma lo stato del questionario in un payload valido, senza PII nelle risposte", async () => {
    const payload = await buildSubmission(
      {
        submissionId: crypto.randomUUID(),
        auditorId: "AUD-777",
        ageVerificationEligible: false,
        activityType: "HoReCa",
        storeCode: "PV-0420",
        startedAt: new Date(Date.now() - 25 * 60_000).toISOString(),
        outcome: "completed",
        storeCollaborating: true,
        reportType: "quantitativo",
        answers: {
          a1_hostess: "Sì",
          a2_uniforme: "Sì",
          a3_materiali: "Sì",
          a3_dispositivi: "Sì",
          a4_stato: "Sì",
          b1_ingaggio: "Sì",
          b3_profilazione: "Sì",
          c0_prodotti: [PROD_GLO],
          c1_prova: "Sì",
          c1_peculiarita: "Sì",
          c1_prezzi: "Sì",
          c1_bundle: "Sì",
          c1_registrazione: "Sì",
          c1_extra: "Sì",
          d0_acquisto: "Sì",
          d1_processo: "Sì",
          d2_consenso: "Sì",
          d3_sms: "Sì",
          e1_modello: "Hilo",
          e1_prezzo: "39,00",
          e1_seriale: "HP24X0001AB",
          e1_foto_scontrino: photo,
          e1_foto_scatola: photo,
          e1_bundle_stick: "4",
          e1_email: "lucia@example.com",
          e1_phone: "",
          e1_consenso: "Sì",
          a1_attesa: "", // campo svuotato: non deve viaggiare
        },
      },
      new Date(),
    );

    expect(ReportSubmissionSchema.safeParse(payload).success).toBe(true);
    expect(payload.answers.some((a) => a.questionId.startsWith("e1_email"))).toBe(false);
    expect(payload.answers.find((a) => a.questionId === "e1_prezzo")?.value).toBe(39);
    expect(payload.attachments).toHaveLength(2);
    expect(payload.consumer).toEqual({ email: "lucia@example.com", consent: true });

    const r = await processSubmission(payload, { source: "api", pepper: "p" });
    expect(r.disposition).toBe("ACCEPTED");
    expect(r.report?.score).toBe(100);
    expect(r.vault?.emailMasked).toBe("l***@example.com");
  });
});
