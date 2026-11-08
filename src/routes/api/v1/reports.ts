/**
 * POST /api/v1/reports — endpoint di ingestione (gira sull'edge, Cloudflare Workers).
 *
 * 202 Accepted        → payload acquisito (ACCEPTED / WITH_WARNINGS / QUARANTINED)
 * 422 Unprocessable   → violazione del contratto o delle regole bloccanti (REJECTED)
 * 413 / 415 / 400     → errori di trasporto
 */
import { createFileRoute } from "@tanstack/react-router";

import { CONTRACT_VERSION } from "@/domain/contract";
import { processSubmission } from "@/domain/pipeline/process";
import { PIPELINE_VERSION } from "@/domain/pipeline/types";

const MAX_BODY_BYTES = 256 * 1024;

function json(body: unknown, status: number, requestId: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-request-id": requestId,
      "x-pipeline-version": PIPELINE_VERSION,
    },
  });
}

function pepper(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return env?.["PII_PEPPER"] ?? "fieldsight-demo-pepper";
}

export const Route = createFileRoute("/api/v1/reports")({
  server: {
    handlers: {
      GET: async () => {
        const requestId = crypto.randomUUID();
        return json(
          {
            service: "fieldsight-ingestion",
            contractVersion: CONTRACT_VERSION,
            pipelineVersion: PIPELINE_VERSION,
            accepts: "POST application/json (ReportSubmission v1)",
            docs: "/console/dati",
          },
          200,
          requestId,
        );
      },
      POST: async ({ request }) => {
        const requestId = crypto.randomUUID();
        if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
          return json(
            { requestId, error: "UNSUPPORTED_MEDIA_TYPE", message: "Usa application/json" },
            415,
            requestId,
          );
        }
        const text = await request.text();
        if (text.length > MAX_BODY_BYTES) {
          return json(
            {
              requestId,
              error: "PAYLOAD_TOO_LARGE",
              message: "Max 256 KB: le foto vanno come attachment",
            },
            413,
            requestId,
          );
        }
        let payload: unknown;
        try {
          payload = JSON.parse(text);
        } catch {
          return json(
            { requestId, error: "INVALID_JSON", message: "Body non è JSON valido" },
            400,
            requestId,
          );
        }

        const result = await processSubmission(payload, { source: "api", pepper: pepper() });
        console.info(
          JSON.stringify({
            evt: "report_ingested",
            requestId,
            disposition: result.disposition,
            flags: result.flags.map((f) => f.code),
          }),
        );
        return json(
          {
            requestId,
            disposition: result.disposition,
            errors: result.errors,
            flags: result.flags,
            stages: result.stages,
            persistence: {
              report: result.report,
              vault: result.vault,
              vaultKey: result.vaultKey,
              deadLetter: result.deadLetter,
            },
          },
          result.disposition === "REJECTED" ? 422 : 202,
          requestId,
        );
      },
    },
  },
});
