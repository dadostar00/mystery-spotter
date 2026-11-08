/**
 * Mappa lo stato del questionario (UI) nel contratto v1.
 * Qui avviene la prima minimizzazione: i contatti del consumatore escono dalle
 * risposte e finiscono nel blocco `consumer`; le foto diventano riferimenti (hash),
 * il binario andrebbe su object storage con URL firmato.
 */
import { CATALOG, PII_QUESTIONS } from "@/domain/catalog";
import { CONTRACT_VERSION, type SubmissionInput } from "@/domain/contract";
import { sha256Hex } from "@/domain/pipeline/privacy";
import type { Answers, ReportType } from "@/domain/questionnaire";

export const APP_VERSION = "2.0.0";

export interface DraftVisit {
  submissionId: string;
  auditorId: string;
  ageVerificationEligible: boolean;
  activityId?: string | undefined;
  activityType: string;
  storeCode: string;
  startedAt: string;
  outcome: "completed" | "interrupted";
  storeCollaborating: boolean;
  reportType: ReportType | null;
  answers: Answers;
}

function dataUrlInfo(url: string): { mime: string; bytes: number } {
  const [head = "", body = ""] = url.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "image/jpeg";
  return { mime, bytes: Math.max(1, Math.floor((body.length * 3) / 4)) };
}

export async function buildSubmission(
  d: DraftVisit,
  endedAt = new Date(),
): Promise<SubmissionInput> {
  const answers: SubmissionInput["answers"] = [];
  const attachments: NonNullable<SubmissionInput["attachments"]> = [];

  for (const [questionId, value] of Object.entries(d.answers)) {
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0))
      continue;
    if (PII_QUESTIONS.has(questionId)) continue;
    const kind = CATALOG.get(questionId)?.question.kind;
    if (kind === "photo" && typeof value === "string" && value.startsWith("data:")) {
      const { mime, bytes } = dataUrlInfo(value);
      attachments.push({
        questionId,
        sha256: await sha256Hex(value),
        bytes,
        mimeType: mime === "image/jpg" ? "image/jpeg" : mime,
      });
      continue;
    }
    if (kind === "number") {
      const n = Number(String(value).replace(",", "."));
      answers.push({ questionId, value: Number.isFinite(n) ? n : String(value) });
      continue;
    }
    answers.push({ questionId, value: value as string | string[] });
  }

  const email = String(d.answers["e1_email"] ?? "").trim();
  const phone = String(d.answers["e1_phone"] ?? "").trim();

  return {
    schemaVersion: CONTRACT_VERSION,
    submissionId: d.submissionId,
    submittedAt: new Date().toISOString(),
    client: { app: "fieldsight-field", version: APP_VERSION, queuedOffline: false },
    auditor: {
      auditorId: d.auditorId || "AUD-ANON",
      ageVerificationEligible: d.ageVerificationEligible,
    },
    visit: {
      ...(d.activityId ? { activityId: d.activityId } : {}),
      activityType: d.activityType as SubmissionInput["visit"]["activityType"],
      storeCode: d.storeCode,
      startedAt: d.startedAt,
      endedAt: endedAt.toISOString(),
      outcome: d.outcome,
      storeCollaborating: d.storeCollaborating,
      reportType: d.reportType,
    },
    answers,
    attachments,
    ...(email || phone
      ? {
          consumer: {
            ...(email ? { email } : {}),
            ...(phone ? { phone } : {}),
            consent: d.answers["e1_consenso"] === "Sì",
          },
        }
      : {}),
  };
}
