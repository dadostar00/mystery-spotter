/**
 * Data contract v1 — il payload che l'app auditor invia all'API di ingestione.
 *
 * È l'unica fonte di verità condivisa tra client, server e test: lo stesso schema
 * Zod valida l'input sull'endpoint HTTP e tipizza il codice TypeScript.
 * Regole di evoluzione: modifiche additive => minor (1.x); breaking => nuova versione
 * major con endpoint /api/v2 e periodo di doppia accettazione.
 */
import { z } from "zod";

import { ACTIVITY_TYPES } from "./questionnaire";

export const CONTRACT_VERSION = "1.0" as const;

const isoDateTime = z.string().datetime({ offset: true });

export const AnswerValueSchema = z.union([
  z.string().max(4000),
  z.array(z.string().max(200)).max(20),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const AnswerSchema = z.object({
  questionId: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, "questionId non valido"),
  value: AnswerValueSchema,
});

export const AttachmentSchema = z.object({
  questionId: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive().max(15_000_000),
  mimeType: z.string().regex(/^image\/(jpeg|png|webp|heic)$/),
});

/** Dati personali del consumatore: viaggiano in un blocco separato per essere isolati alla fonte. */
export const ConsumerPiiSchema = z
  .object({
    email: z.string().email().max(254).optional(),
    phone: z
      .string()
      .regex(/^\+?[0-9 ()-]{6,20}$/, "telefono non valido")
      .optional(),
    consent: z.boolean(),
  })
  .refine((c) => Boolean(c.email || c.phone), {
    message: "Serve almeno un contatto tra email e telefono",
  });

export const ReportSubmissionSchema = z
  .object({
    schemaVersion: z.literal(CONTRACT_VERSION),
    /** Chiave di idempotenza generata dal client alla creazione della bozza. */
    submissionId: z.string().uuid(),
    submittedAt: isoDateTime,
    client: z.object({
      app: z.string().max(40),
      version: z.string().max(20),
      queuedOffline: z.boolean(),
    }),
    auditor: z.object({
      auditorId: z.string().min(2).max(40),
      ageVerificationEligible: z.boolean(),
    }),
    visit: z.object({
      activityId: z.string().max(60).optional(),
      activityType: z.enum(ACTIVITY_TYPES),
      storeCode: z.string().regex(/^PV-\d{4}$/, "codice PV non valido"),
      startedAt: isoDateTime,
      endedAt: isoDateTime,
      outcome: z.enum(["completed", "interrupted"]),
      storeCollaborating: z.boolean(),
      reportType: z.enum(["quantitativo", "qualitativo", "completo"]).nullable(),
    }),
    answers: z.array(AnswerSchema).max(200),
    attachments: z.array(AttachmentSchema).max(10).default([]),
    consumer: ConsumerPiiSchema.optional(),
  })
  .superRefine((s, ctx) => {
    if (s.visit.outcome === "completed" && s.visit.reportType === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visit", "reportType"],
        message: "Un report completato deve dichiarare la tipologia",
      });
    }
    const ids = new Set<string>();
    s.answers.forEach((a, i) => {
      if (ids.has(a.questionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["answers", i, "questionId"],
          message: `Risposta duplicata per ${a.questionId}`,
        });
      }
      ids.add(a.questionId);
    });
  });

export type ReportSubmission = z.infer<typeof ReportSubmissionSchema>;
export type SubmissionInput = z.input<typeof ReportSubmissionSchema>;
export type AnswerValue = z.infer<typeof AnswerValueSchema>;
