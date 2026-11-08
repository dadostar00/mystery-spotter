import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useMemo, useState } from "react";

import { useConsoleFilters } from "@/components/console/context";
import { FilterBar } from "@/components/console/filter-bar";
import { PageHeader, Panel } from "@/components/console/ui";
import { cn } from "@/lib/utils";
import { applyFilters, storeRanking, type StoreRow } from "@/warehouse/queries";
import { useWarehouse } from "@/warehouse/store";

export const Route = createFileRoute("/console/punti-vendita")({
  component: Stores,
});

type SortKey = "avgScore" | "visits" | "delta" | "purchases";

function Delta({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted-foreground">—</span>;
  const Icon = v > 1 ? ArrowUpRight : v < -1 ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 tabular", v < -1 && "text-destructive")}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {v > 0 ? `+${v}` : v}
    </span>
  );
}

function ScoreCell({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-secondary">
        <div className="h-2 rounded-full bg-viz-1" style={{ width: `${v}%` }} />
      </div>
      <span className="w-8 text-right font-medium tabular">{v}</span>
    </div>
  );
}

function Stores() {
  const { reports } = useWarehouse();
  const [filters] = useConsoleFilters();
  const [sort, setSort] = useState<SortKey>("avgScore");
  const [asc, setAsc] = useState(false);
  const rows = useMemo(() => {
    const r = storeRanking(applyFilters(reports, filters));
    const val = (x: StoreRow) => x[sort] ?? -999;
    return [...r].sort((a, b) => (asc ? val(a) - val(b) : val(b) - val(a)));
  }, [reports, filters, sort, asc]);

  const th = (key: SortKey, label: string) => (
    <th className="pb-2 pr-3 text-right font-medium">
      <button
        type="button"
        onClick={() => (sort === key ? setAsc((x) => !x) : (setSort(key), setAsc(false)))}
        className={cn("hover:text-foreground", sort === key && "text-foreground")}
        aria-sort={sort === key ? (asc ? "ascending" : "descending") : "none"}
      >
        {label} {sort === key ? (asc ? "↑" : "↓") : ""}
      </button>
    </th>
  );

  return (
    <>
      <PageHeader
        title="Punti vendita"
        description="Classifica per compliance media. Il trend confronta la prima e la seconda metà delle visite nel periodo; il modulo più debole indica dove intervenire."
        actions={<FilterBar />}
      />
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">#</th>
                <th className="pb-2 pr-3 font-medium">Punto vendita</th>
                <th className="pb-2 pr-3 font-medium">Area</th>
                <th className="pb-2 pr-3 font-medium">
                  <button
                    type="button"
                    onClick={() =>
                      sort === "avgScore" ? setAsc((x) => !x) : (setSort("avgScore"), setAsc(false))
                    }
                    className={cn(sort === "avgScore" && "text-foreground")}
                  >
                    Compliance {sort === "avgScore" ? (asc ? "↑" : "↓") : ""}
                  </button>
                </th>
                {th("delta", "Trend")}
                {th("visits", "Visite")}
                {th("purchases", "Acquisti")}
                <th className="pb-2 pr-3 font-medium">Modulo più debole</th>
                <th className="pb-2 text-right font-medium">In revisione</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.storeCode} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground tabular">{i + 1}</td>
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{r.storeCode}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {r.city ?? "non in anagrafica"}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground">{r.region ?? "—"}</td>
                  <td className="py-2.5 pr-3">
                    <ScoreCell v={r.avgScore} />
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <Delta v={r.delta} />
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular">{r.visits}</td>
                  <td className="py-2.5 pr-3 text-right tabular">{r.purchases}</td>
                  <td className="py-2.5 pr-3 text-xs">{r.weakestModule ?? "—"}</td>
                  <td className="py-2.5 text-right tabular">{r.openIssues || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nessun dato nel periodo.
            </p>
          )}
        </div>
      </Panel>
    </>
  );
}
