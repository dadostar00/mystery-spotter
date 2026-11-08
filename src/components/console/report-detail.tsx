import { useState } from "react";

import type { DeadLetter, ProcessedReport } from "@/domain/pipeline/types";
import { cn } from "@/lib/utils";
import {
  Code,
  DispositionBadge,
  STAGE_LABEL,
  SeverityIcon,
  StageIcon,
  fmtDateTime,
  severityLabel,
} from "./ui";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function StageTimeline({ stages }: { stages: ProcessedReport["stages"] }) {
  return (
    <ol className="space-y-2.5">
      {stages.map((s, i) => (
        <li key={`${s.stage}-${i}`} className="flex gap-3">
          <StageIcon status={s.status} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium">
                <span className="mr-1.5 font-mono text-xs text-muted-foreground">{i + 1}</span>
                {STAGE_LABEL[s.stage] ?? s.stage}
              </p>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {s.status === "skipped"
                  ? "—"
                  : s.durationMs < 0.1
                    ? "<0.1 ms"
                    : `${s.durationMs} ms`}
              </span>
            </div>
            {s.notes.map((n, j) => (
              <p key={j} className="text-xs text-muted-foreground">
                {n}
              </p>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

function fmtValue(v: unknown) {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "string" && v.startsWith("sha256:")) return `allegato ${v.slice(7, 19)}…`;
  return String(v);
}

export function ReportDetail({ report }: { report: ProcessedReport }) {
  const [tab, setTab] = useState<"answers" | "payload">("answers");
  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <DispositionBadge value={report.disposition} />
          {report.review.status !== "none" && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
              Revisione: {report.review.status}
            </span>
          )}
        </div>
        <p className="mt-3 text-lg font-semibold">
          {report.storeCode} · {report.city ?? "PV non in anagrafica"}
        </p>
        <p className="text-sm text-muted-foreground">
          {report.activityType} · {report.reportType ?? "audit interrotto"} · auditor{" "}
          {report.auditorId}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Score", report.score === null ? "—" : `${report.score}/100`],
            ["Completamento", `${report.completionPct}%`],
            ["Durata visita", `${report.kpis.durationMin} min`],
            ["Sorgente", report.source],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-secondary/60 p-2.5">
              <dt className="text-[11px] text-muted-foreground">{k}</dt>
              <dd className="text-sm font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground">
          {report.submissionId} · ricevuto {fmtDateTime(report.receivedAt)} · pipeline{" "}
          {report.pipelineVersion}
        </p>
        {report.review.note && (
          <p className="mt-2 rounded-lg border border-border p-2.5 text-xs">
            <span className="font-medium">Nota di revisione ({report.review.by}):</span>{" "}
            {report.review.note}
          </p>
        )}
      </div>

      <Section title="Lineage — stage della pipeline">
        <StageTimeline stages={report.stages} />
      </Section>

      <Section title={`Flag di qualità (${report.flags.length})`}>
        {report.flags.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna anomalia rilevata.</p>
        ) : (
          <ul className="space-y-2">
            {report.flags.map((f, i) => (
              <li key={i} className="flex gap-2.5 rounded-lg border border-border p-2.5">
                <SeverityIcon value={f.severity} className="mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs">
                    <span className="font-mono font-semibold">{f.code}</span>
                    <span className="ml-2 text-muted-foreground">
                      {severityLabel(f.severity)} · {STAGE_LABEL[f.stage]}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm">{f.message}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {report.modules.length > 0 && (
        <Section title="Score per modulo">
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {report.modules.map((m) => (
              <li key={m.moduleId} className="rounded-lg border border-border p-2.5">
                <p className="truncate text-[11px] text-muted-foreground">
                  {m.moduleId} · {m.title}
                </p>
                <p className="text-sm font-semibold tabular">
                  {m.score ?? "—"}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {m.compliant}/{m.scorable}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Dati">
        <div className="mb-3 inline-flex rounded-lg border border-border p-0.5">
          {(["answers", "payload"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium",
                tab === t ? "bg-secondary" : "text-muted-foreground",
              )}
            >
              {t === "answers"
                ? `Risposte normalizzate (${report.answers.length})`
                : "Payload ricevuto (PII redatti)"}
            </button>
          ))}
        </div>
        {tab === "answers" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <tbody>
                {report.answers.map((a) => (
                  <tr
                    key={a.questionId}
                    className="border-b border-border/60 align-top last:border-0"
                  >
                    <td className="py-2 pr-2 font-mono text-muted-foreground">{a.questionId}</td>
                    <td className="py-2 pr-2">
                      <p className="text-muted-foreground">{a.label}</p>
                      <p className="font-medium">{fmtValue(a.value)}</p>
                    </td>
                    <td className="py-2 text-right">
                      {a.compliant === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : a.compliant ? (
                        <span className="font-medium">conforme</span>
                      ) : (
                        <span className="font-medium text-destructive">non conforme</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.droppedAnswers.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Scartate dalla pipeline:{" "}
                {report.droppedAnswers.map((d) => (
                  <Code key={d}>{d}</Code>
                ))}
              </p>
            )}
          </div>
        ) : (
          <pre className="max-h-96 overflow-auto rounded-lg bg-secondary/60 p-3 font-mono text-[11px] leading-relaxed">
            {JSON.stringify(report.redactedPayload, null, 2)}
          </pre>
        )}
      </Section>
    </div>
  );
}

export function DeadLetterDetail({ item }: { item: DeadLetter }) {
  return (
    <div className="space-y-5">
      <div>
        <DispositionBadge value="REJECTED" />
        <p className="mt-3 text-lg font-semibold">Payload fuori contratto</p>
        <p className="text-sm text-muted-foreground">
          Il messaggio non è diventato un report: è in dead-letter queue per analisi e, se serve,
          correzione e reinvio.
        </p>
        <p className="mt-3 font-mono text-[11px] text-muted-foreground">
          {item.id} · {fmtDateTime(item.receivedAt)} · {item.source}
        </p>
      </div>
      <Section title={`Violazioni del contratto (${item.errors.length})`}>
        <ul className="space-y-1.5">
          {item.errors.map((e, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <SeverityIcon value="error" className="mt-0.5" />
              <span>
                <Code>{e.path || "(root)"}</Code> {e.message}
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Payload (senza blocco consumer)">
        <pre className="max-h-96 overflow-auto rounded-lg bg-secondary/60 p-3 font-mono text-[11px] leading-relaxed">
          {JSON.stringify(item.payload, null, 2)}
        </pre>
      </Section>
    </div>
  );
}

/** Pannello laterale semplice e accessibile (Esc / click fuori per chiudere). */
export function SidePanel({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-foreground/30"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-card p-5 shadow-xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2.5 py-1 text-sm text-muted-foreground hover:bg-secondary"
            autoFocus
          >
            Chiudi ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
