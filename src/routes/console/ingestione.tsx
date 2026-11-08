import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { DeadLetterDetail, ReportDetail, SidePanel } from "@/components/console/report-detail";
import { DispositionBadge, PageHeader, Panel, fmtDateTime } from "@/components/console/ui";
import type { DeadLetter, Disposition, ProcessedReport } from "@/domain/pipeline/types";
import { cn } from "@/lib/utils";
import { flagStats } from "@/warehouse/queries";
import { useWarehouse } from "@/warehouse/store";

export const Route = createFileRoute("/console/ingestione")({
  component: IngestionLog,
});

type Row =
  { kind: "report"; at: string; r: ProcessedReport } | { kind: "dlq"; at: string; d: DeadLetter };

const FILTERS: { id: Disposition | "all" | "DLQ"; label: string }[] = [
  { id: "all", label: "Tutti" },
  { id: "ACCEPTED", label: "Accettati" },
  { id: "ACCEPTED_WITH_WARNINGS", label: "Con avvisi" },
  { id: "QUARANTINED", label: "Quarantena" },
  { id: "REJECTED", label: "Rifiutati" },
  { id: "DLQ", label: "Dead-letter" },
];

const PAGE = 25;

function IngestionLog() {
  const { reports, deadLetters } = useWarehouse();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Row | null>(null);

  const rows = useMemo<Row[]>(() => {
    const all: Row[] = [
      ...reports.map((r) => ({ kind: "report" as const, at: r.processedAt, r })),
      ...deadLetters.map((d) => ({ kind: "dlq" as const, at: d.receivedAt, d })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    const needle = q.trim().toLowerCase();
    return all.filter((row) => {
      if (filter === "DLQ" && row.kind !== "dlq") return false;
      if (filter !== "all" && filter !== "DLQ") {
        if (row.kind !== "report") return filter === "REJECTED";
        if (row.r.disposition !== filter) return false;
      }
      if (!needle) return true;
      const hay =
        row.kind === "report"
          ? `${row.r.submissionId} ${row.r.storeCode} ${row.r.city} ${row.r.auditorId} ${row.r.flags.map((f) => f.code).join(" ")}`
          : `${row.d.id} ${row.d.errors.map((e) => e.path).join(" ")}`;
      return hay.toLowerCase().includes(needle);
    });
  }, [reports, deadLetters, filter, q]);

  const flags = useMemo(() => flagStats(reports).slice(0, 8), [reports]);
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));

  return (
    <>
      <PageHeader
        title="Ingestione"
        description="Ogni submission ricevuta dall'API con l'esito di ciascuno stage. I payload che violano il contratto finiscono in dead-letter queue e non producono record di fatto."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Panel>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setFilter(f.id);
                    setPage(0);
                  }}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium",
                    filter === f.id
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                placeholder="ID, PV, auditor, codice flag…"
                className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/30 md:w-64"
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Elaborato</th>
                  <th className="pb-2 pr-3 font-medium">Submission</th>
                  <th className="pb-2 pr-3 font-medium">PV</th>
                  <th className="pb-2 pr-3 font-medium">Esito</th>
                  <th className="pb-2 pr-3 text-right font-medium">Score</th>
                  <th className="pb-2 font-medium">Flag</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) =>
                  row.kind === "report" ? (
                    <tr
                      key={row.r.submissionId}
                      onClick={() => setOpen(row)}
                      className="cursor-pointer border-b border-border/60 hover:bg-secondary/50"
                    >
                      <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-muted-foreground tabular">
                        {fmtDateTime(row.at)}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs">
                        {row.r.submissionId.slice(0, 8)}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="font-medium">{row.r.storeCode}</span>
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {row.r.city ?? "—"}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <DispositionBadge value={row.r.disposition} />
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular">{row.r.score ?? "—"}</td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {row.r.flags.slice(0, 2).map((f, i) => (
                            <span
                              key={i}
                              className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px]"
                            >
                              {f.code}
                            </span>
                          ))}
                          {row.r.flags.length > 2 && (
                            <span className="text-[11px] text-muted-foreground">
                              +{row.r.flags.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={row.d.id}
                      onClick={() => setOpen(row)}
                      className="cursor-pointer border-b border-border/60 hover:bg-secondary/50"
                    >
                      <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-muted-foreground tabular">
                        {fmtDateTime(row.at)}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs">{row.d.id.slice(0, 8)}</td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">—</td>
                      <td className="py-2.5 pr-3">
                        <DispositionBadge value="REJECTED" />
                      </td>
                      <td className="py-2.5 pr-3 text-right">—</td>
                      <td className="py-2.5">
                        <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px]">
                          SCHEMA_VIOLATION
                        </span>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nessuna submission corrisponde ai filtri.
              </p>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span className="tabular">
              {rows.length} righe · pagina {page + 1} di {pages}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-border px-2.5 py-1 disabled:opacity-40"
              >
                ←
              </button>
              <button
                type="button"
                disabled={page >= pages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-border px-2.5 py-1 disabled:opacity-40"
              >
                →
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="Flag più frequenti" description="Su tutte le submission">
          <ul className="space-y-2">
            {flags.map((f) => (
              <li key={f.code}>
                <button
                  type="button"
                  onClick={() => {
                    setQ(f.code);
                    setFilter("all");
                    setPage(0);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-secondary"
                >
                  <span className="truncate font-mono text-xs">{f.code}</span>
                  <span className="text-xs font-medium tabular">{f.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <SidePanel open={open !== null} onClose={() => setOpen(null)}>
        {open?.kind === "report" && <ReportDetail report={open.r} />}
        {open?.kind === "dlq" && <DeadLetterDetail item={open.d} />}
      </SidePanel>
    </>
  );
}
