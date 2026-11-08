/**
 * Client dell'API di ingestione. Prova l'endpoint HTTP; se il backend non è
 * raggiungibile (es. hosting statico) esegue la stessa pipeline in locale, così
 * la demo resta funzionante e il percorso dati è identico.
 */
import type { SubmissionInput } from "@/domain/contract";
import { processSubmission } from "@/domain/pipeline/process";
import type { ProcessingResult } from "@/domain/pipeline/types";
import { ingest } from "./store";

export const DEMO_PEPPER = "fieldsight-demo-pepper";
export const INGEST_ENDPOINT = "/api/v1/reports";

export interface ApiResponse {
  requestId: string;
  disposition: ProcessingResult["disposition"];
  errors: ProcessingResult["errors"];
  flags: ProcessingResult["flags"];
  stages: ProcessingResult["stages"];
  /** Solo in demo: il datastore è nel browser, quindi il server restituisce i record da persistere. */
  persistence: Pick<ProcessingResult, "report" | "vault" | "vaultKey" | "deadLetter">;
}

export class NetworkError extends Error {}

async function postToApi(payload: unknown, signal?: AbortSignal): Promise<ProcessingResult | null> {
  let res: Response;
  try {
    res = await fetch(INGEST_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": String((payload as { submissionId?: string }).submissionId ?? ""),
      },
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    });
  } catch (e) {
    throw new NetworkError(e instanceof Error ? e.message : "rete non disponibile");
  }
  if (res.status === 202 || res.status === 422) {
    const body = (await res.json()) as ApiResponse;
    return {
      ...body.persistence,
      disposition: body.disposition,
      errors: body.errors,
      flags: body.flags,
      stages: body.stages,
    };
  }
  return null; // 404/5xx: backend assente o in errore → fallback
}

export async function submitReport(
  payload: SubmissionInput,
  opts: { signal?: AbortSignal; actor: string },
): Promise<{ result: ProcessingResult; via: "api" | "local-fallback"; replay: boolean }> {
  let result = await postToApi(payload, opts.signal).catch((e) => {
    if (e instanceof NetworkError && typeof navigator !== "undefined" && !navigator.onLine) throw e;
    return null;
  });
  let via: "api" | "local-fallback" = "api";
  if (!result) {
    via = "local-fallback";
    result = await processSubmission(payload, { source: "local-fallback", pepper: DEMO_PEPPER });
  }
  const { report, replay } = ingest(result, opts.actor);
  return {
    result: report ? { ...result, report, disposition: report.disposition } : result,
    via,
    replay,
  };
}
