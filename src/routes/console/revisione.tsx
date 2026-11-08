import { createFileRoute } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ReportDetail } from "@/components/console/report-detail";
import { Button, PageHeader, Panel, SeverityIcon, fmtDateTime } from "@/components/console/ui";
import { cn } from "@/lib/utils";
import { reviewReport, useWarehouse } from "@/warehouse/store";

export const Route = createFileRoute("/console/revisione")({
  component: ReviewQueue,
});

function ReviewQueue() {
  const { reports } = useWarehouse();
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const queue = useMemo(
    () =>
      reports
        .filter(
          (r) =>
            r.disposition === "QUARANTINED" &&
            (tab === "pending" ? r.review.status === "pending" : r.review.status !== "pending"),
        )
        .sort((a, b) => a.processedAt.localeCompare(b.processedAt)),
    [reports, tab],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = queue.find((r) => r.submissionId === selectedId) ?? queue[0] ?? null;
  const [note, setNote] = useState("");

  function decide(decision: "approved" | "rejected") {
    if (!selected) return;
    if (note.trim().length < 5) {
      toast.error("Inserisci una motivazione: resta nell'audit log");
      return;
    }
    reviewReport(selected.submissionId, decision, note.trim());
    toast.success(
      decision === "approved"
        ? "Approvato: il report entra nelle analisi"
        : "Rifiutato: escluso definitivamente",
    );
    setNote("");
    setSelectedId(null);
  }

  return (
    <>
      <PageHeader
        title="Revisione"
        description="Report sospesi dalla pipeline (prezzi fuori listino, seriali duplicati, visite troppo brevi…). Restano esclusi dai KPI finché un operatore non decide; ogni decisione è tracciata con motivazione."
      />
      <div className="mb-4 inline-flex rounded-lg border border-border bg-card p-0.5">
        {(["pending", "done"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setSelectedId(null);
            }}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium",
              tab === t ? "bg-secondary" : "text-muted-foreground",
            )}
          >
            {t === "pending" ? "Da revisionare" : "Decisi"}
          </button>
        ))}
      </div>

      {queue.length === 0 ? (
        <Panel>
          <p className="py-12 text-center text-sm text-muted-foreground">
            {tab === "pending"
              ? "Coda vuota: nessun report in attesa di revisione."
              : "Nessuna decisione registrata."}
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <Panel className="p-2 sm:p-2">
            <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
              {queue.map((r) => (
                <li key={r.submissionId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.submissionId)}
                    className={cn(
                      "w-full rounded-lg p-3 text-left",
                      selected?.submissionId === r.submissionId
                        ? "bg-secondary"
                        : "hover:bg-secondary/50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {r.storeCode}{" "}
                        <span className="font-normal text-muted-foreground">{r.city ?? ""}</span>
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular">
                        {fmtDateTime(r.processedAt)}
                      </span>
                    </div>
                    <ul className="mt-1.5 space-y-1">
                      {r.flags
                        .filter((f) => f.severity === "quarantine")
                        .map((f, i) => (
                          <li key={i} className="flex items-center gap-1.5 text-xs">
                            <SeverityIcon value="quarantine" className="h-3.5 w-3.5" />
                            <span className="font-mono">{f.code}</span>
                          </li>
                        ))}
                    </ul>
                    {r.review.status !== "pending" && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {r.review.status === "approved" ? "Approvato" : "Rifiutato"} da{" "}
                        {r.review.by}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          {selected && (
            <Panel>
              {tab === "pending" && (
                <div className="mb-5 rounded-lg border border-border bg-background p-4">
                  <label htmlFor="review-note" className="text-sm font-medium">
                    Decisione
                  </label>
                  <textarea
                    id="review-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Motivazione (es. scontrino verificato via email dall'agenzia)"
                    className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="primary" onClick={() => decide("approved")}>
                      <Check className="h-4 w-4" /> Approva e includi nei KPI
                    </Button>
                    <Button variant="danger" onClick={() => decide("rejected")}>
                      <X className="h-4 w-4" /> Rifiuta
                    </Button>
                  </div>
                </div>
              )}
              <ReportDetail report={selected} />
            </Panel>
          )}
        </div>
      )}
    </>
  );
}
