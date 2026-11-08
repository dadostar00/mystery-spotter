import { useConsoleFilters } from "./context";
import { REGIONS, type Region } from "@/domain/master-data";
import { ACTIVITY_TYPES } from "@/domain/questionnaire";
import type { Filters } from "@/warehouse/queries";

const selectCls =
  "h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/30";

export function FilterBar() {
  const [f, setF] = useConsoleFilters();
  const days: Filters["days"][] = [7, 30, 90, 0];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className="inline-flex rounded-lg border border-border bg-card p-0.5"
        role="group"
        aria-label="Periodo"
      >
        {days.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setF((x) => ({ ...x, days: d }))}
            aria-pressed={f.days === d}
            className={
              "rounded-md px-2.5 py-1 text-xs font-medium " +
              (f.days === d
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {d ? `${d} gg` : "Tutto"}
          </button>
        ))}
      </div>
      <select
        aria-label="Area"
        className={selectCls}
        value={f.region}
        onChange={(e) => setF((x) => ({ ...x, region: e.target.value as Region | "all" }))}
      >
        <option value="all">Tutte le aree</option>
        {REGIONS.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <select
        aria-label="Tipologia attività"
        className={selectCls}
        value={f.activityType}
        onChange={(e) => setF((x) => ({ ...x, activityType: e.target.value }))}
      >
        <option value="all">Tutte le attività</option>
        {ACTIVITY_TYPES.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
    </div>
  );
}
