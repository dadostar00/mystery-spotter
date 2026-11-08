import { createFileRoute } from "@tanstack/react-router";
import { Download, Play, RotateCcw, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { seedWarehouse } from "@/components/console/context";
import { StageTimeline } from "@/components/console/report-detail";
import { samplePayload } from "@/components/console/samples";
import {
  Button,
  Code,
  DispositionBadge,
  PageHeader,
  Panel,
  fmtDateTime,
} from "@/components/console/ui";
import { CONTRACT_VERSION } from "@/domain/contract";
import { processSubmission } from "@/domain/pipeline/process";
import { PIPELINE_VERSION, type ProcessingResult } from "@/domain/pipeline/types";
import { cn } from "@/lib/utils";
import { answersLong, download, storesCsv, toCsv, toNdjson } from "@/warehouse/export";
import { DEMO_PEPPER, INGEST_ENDPOINT, type ApiResponse } from "@/warehouse/ingestion-client";
import {
  CONSOLE_OPERATOR,
  appendAudit,
  ingest,
  resetWarehouse,
  useWarehouse,
} from "@/warehouse/store";

export const Route = createFileRoute("/console/dati")({
  component: DataAndApi,
});

const FLOW = [
  {
    t: "App auditor (PWA)",
    d: "Questionario con rami condizionali · outbox offline · chiave di idempotenza",
    tech: "React 19 · TypeScript",
  },
  {
    t: "API di ingestione",
    d: `POST ${INGEST_ENDPOINT} · validazione contratto v${CONTRACT_VERSION}`,
    tech: "TanStack Start · Cloudflare Workers",
  },
  {
    t: "Pipeline",
    d: "Contratto → anagrafiche → coerenza → regole → privacy → scoring → dedup → cross-report",
    tech: "Zod · Web Crypto",
  },
  {
    t: "Data store",
    d: "Fact report e risposte (long) · vault PII cifrato · dead-letter · audit log",
    tech: "PostgreSQL (db/schema.sql)",
  },
  {
    t: "Consumo",
    d: "Console KPI · revisione · export NDJSON/CSV · analisi Python",
    tech: "Recharts · DuckDB · Polars-ready",
  },
];

const CONTRACT_FIELDS: [string, string, string][] = [
  ["schemaVersion", `"${CONTRACT_VERSION}"`, "versione del contratto; breaking change ⇒ /api/v2"],
  ["submissionId", "uuid", "chiave di idempotenza generata alla creazione della bozza"],
  ["submittedAt", "ISO 8601", "orario di invio dal device (controllato contro clock skew)"],
  ["auditor", "{ auditorId, ageVerificationEligible }", "abilita il ramo «verifica età»"],
  [
    "visit",
    "{ storeCode, activityType, startedAt, endedAt, outcome, reportType, … }",
    "contesto della visita",
  ],
  ["answers[]", "{ questionId, value }", "risposte atomiche: string | string[] | number | boolean"],
  [
    "attachments[]",
    "{ questionId, sha256, bytes, mimeType }",
    "solo metadati; il binario va su object storage",
  ],
  ["consumer?", "{ email?, phone?, consent }", "PII isolati alla fonte, almeno un contatto"],
];

function DataAndApi() {
  const { reports, deadLetters, audit } = useWarehouse();
  const [kind, setKind] = useState<"valid" | "quarantine" | "invalid">("valid");
  const [body, setBody] = useState(() => JSON.stringify(samplePayload("valid"), null, 2));
  const [resp, setResp] = useState<{
    status: number;
    via: string;
    data: ApiResponse | { error: string; message: string };
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        toast.error("JSON non valido");
        return;
      }
      let status = 0;
      let data: ApiResponse | { error: string; message: string };
      let via = "api";
      try {
        const res = await fetch(INGEST_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
        status = res.status;
        if (status === 404 || status >= 500) throw new Error("backend non disponibile");
        data = (await res.json()) as ApiResponse;
      } catch {
        via = "local-fallback";
        const r = await processSubmission(parsed, {
          source: "local-fallback",
          pepper: DEMO_PEPPER,
        });
        status = r.disposition === "REJECTED" ? 422 : 202;
        data = {
          requestId: "local",
          disposition: r.disposition,
          errors: r.errors,
          flags: r.flags,
          stages: r.stages,
          persistence: r,
        };
      }
      if ("persistence" in data) {
        const p = data.persistence;
        const result: ProcessingResult = {
          ...p,
          disposition: data.disposition,
          errors: data.errors,
          flags: data.flags,
          stages: data.stages,
        };
        const { report, replay } = ingest(result, "api-playground");
        if (report)
          data = {
            ...data,
            disposition: report.disposition,
            stages: report.stages,
            flags: report.flags,
          };
        if (replay) toast.info("Submission già ricevuta: risposta idempotente");
      }
      setResp({ status, via, data });
    } finally {
      setBusy(false);
    }
  }

  function exportFile(kind: "ndjson" | "answers" | "stores") {
    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === "ndjson")
      download(`fact_report_${stamp}.ndjson`, toNdjson(reports), "application/x-ndjson");
    if (kind === "answers")
      download(`fact_answer_${stamp}.csv`, toCsv(answersLong(reports)), "text/csv");
    if (kind === "stores") download(`store_kpi_${stamp}.csv`, storesCsv(reports), "text/csv");
    appendAudit({ actor: CONSOLE_OPERATOR, action: "EXPORT", detail: kind });
  }

  const apiData = resp?.data && "stages" in resp.data ? resp.data : null;

  return (
    <>
      <PageHeader
        title="Dati & API"
        description="Come i dati arrivano, dove vengono trasformati e come escono verso altri sistemi. L'endpoint è reale: puoi inviargli payload e osservare la pipeline."
      />

      <Panel
        title="Flusso del dato"
        description={`Pipeline ${PIPELINE_VERSION} · contratto v${CONTRACT_VERSION}`}
      >
        <ol className="grid gap-3 md:grid-cols-5">
          {FLOW.map((s, i) => (
            <li key={s.t} className="relative rounded-lg border border-border bg-background p-3">
              <p className="font-mono text-[11px] text-muted-foreground">0{i + 1}</p>
              <p className="mt-1 text-sm font-semibold">{s.t}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.d}</p>
              <p className="mt-2 text-[11px] font-medium text-primary">{s.tech}</p>
              {i < FLOW.length - 1 && (
                <span
                  aria-hidden
                  className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-muted-foreground md:block"
                >
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel
          title="Playground API"
          description={`POST ${INGEST_ENDPOINT} · Content-Type: application/json`}
          actions={
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {(["valid", "quarantine", "invalid"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    setBody(JSON.stringify(samplePayload(k), null, 2));
                    setResp(null);
                  }}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-medium",
                    kind === k ? "bg-secondary" : "text-muted-foreground",
                  )}
                >
                  {k === "valid" ? "Valido" : k === "quarantine" ? "Sospetto" : "Malformato"}
                </button>
              ))}
            </div>
          }
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
            aria-label="Payload JSON"
            className="h-80 w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-[11px] leading-relaxed outline-none focus:ring-2 focus:ring-ring/30"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => void send()} disabled={busy}>
              <Send className="h-4 w-4" /> Invia
            </Button>
            <Button
              variant="ghost"
              onClick={() => setBody(JSON.stringify(samplePayload(kind), null, 2))}
            >
              <RotateCcw className="h-4 w-4" /> Nuovo ID
            </Button>
            <span className="text-xs text-muted-foreground">
              Reinvia lo stesso payload per verificare l'idempotenza.
            </span>
          </div>
          <details className="mt-4 text-xs">
            <summary className="cursor-pointer font-medium">Equivalente curl</summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-secondary/60 p-3 font-mono text-[11px]">
              {`curl -X POST https://<host>${INGEST_ENDPOINT} \\
  -H "content-type: application/json" \\
  -d @report.json`}
            </pre>
          </details>
        </Panel>

        <Panel
          title="Risposta"
          description={
            resp ? `HTTP ${resp.status} · via ${resp.via}` : "Invia un payload per vedere l'esito"
          }
        >
          {!resp ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              <Play className="mx-auto mb-2 h-6 w-6" />
              In attesa di una richiesta
            </p>
          ) : apiData ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 font-mono text-xs font-semibold",
                    resp.status === 202 ? "bg-secondary" : "bg-destructive/10 text-destructive",
                  )}
                >
                  {resp.status}
                </span>
                <DispositionBadge value={apiData.disposition} />
              </div>
              <StageTimeline stages={apiData.stages} />
              {apiData.errors.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-border p-3 text-xs">
                  {apiData.errors.map((e, i) => (
                    <li key={i}>
                      <Code>{e.path || "(root)"}</Code> {e.message}
                    </li>
                  ))}
                </ul>
              )}
              {apiData.flags.length > 0 && (
                <ul className="space-y-1 text-xs">
                  {apiData.flags.map((f, i) => (
                    <li key={i}>
                      <span className="font-mono font-semibold">{f.code}</span>{" "}
                      <span className="text-muted-foreground">{f.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <pre className="overflow-auto rounded-lg bg-secondary/60 p-3 font-mono text-[11px]">
              {JSON.stringify(resp.data, null, 2)}
            </pre>
          )}
        </Panel>
      </div>

      <Panel
        title="Contratto dati v1"
        description="Schema Zod condiviso da client, API e test — src/domain/contract.ts"
        className="mt-4"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <tbody>
              {CONTRACT_FIELDS.map(([f, t, d]) => (
                <tr key={f} className="border-b border-border/60 align-top last:border-0">
                  <td className="py-2 pr-3 font-mono text-xs font-medium">{f}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{t}</td>
                  <td className="py-2 text-xs">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Risposte: <Code>202</Code> acquisito (anche in quarantena) · <Code>422</Code> rifiutato
          con elenco violazioni · <Code>413</Code> payload &gt; 256 KB · <Code>415</Code>{" "}
          content-type errato.
        </p>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Export"
          description="Formati aperti per BI, data lake e notebook (vedi analytics/)"
        >
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => exportFile("ndjson")}>
              <Download className="h-4 w-4" /> fact_report.ndjson
            </Button>
            <Button onClick={() => exportFile("answers")}>
              <Download className="h-4 w-4" /> fact_answer.csv
            </Button>
            <Button onClick={() => exportFile("stores")}>
              <Download className="h-4 w-4" /> store_kpi.csv
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {reports.length} report · {deadLetters.length} in dead-letter. Le risposte sono in
            formato «long» (una riga per risposta): aggiungere domande non cambia lo schema.
          </p>
        </Panel>

        <Panel title="Ambiente demo" description="Il warehouse è locale al tuo browser">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                resetWarehouse();
                void seedWarehouse().then((n) => toast.success(`${n} report rigenerati`));
              }}
            >
              <RotateCcw className="h-4 w-4" /> Rigenera dati demo
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm("Svuotare il warehouse?")) resetWarehouse();
              }}
            >
              Svuota warehouse
            </Button>
          </div>
          <p className="mb-2 mt-4 text-xs font-medium text-muted-foreground">
            Audit log (ultimi eventi)
          </p>
          <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs">
            {audit.slice(0, 15).map((a) => (
              <li key={a.id} className="flex gap-2">
                <span className="w-24 shrink-0 text-muted-foreground tabular">
                  {fmtDateTime(a.at)}
                </span>
                <span className="font-mono">{a.action}</span>
                <span className="truncate text-muted-foreground">{a.detail}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
