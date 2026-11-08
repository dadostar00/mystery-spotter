/**
 * Grafici della console. Regole: una sola scala per grafico (mai doppio asse),
 * una serie = un colore fisso, stato = icona + etichetta, tooltip su ogni marca.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

import { fmtDate } from "./ui";

const axis = { fontSize: 11, fill: "var(--muted-foreground)" };

function Tip({
  active,
  payload,
  label,
  unit,
  labelFmt,
}: TooltipProps<number, string> & { unit?: string; labelFmt?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{labelFmt ? labelFmt(String(label)) : label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="mt-0.5 text-muted-foreground tabular">
          {p.name}:{" "}
          <span className="font-medium text-foreground">
            {p.value ?? "—"}
            {unit}
          </span>
        </p>
      ))}
    </div>
  );
}

export function TrendLine({ data }: { data: { week: string; score: number | null }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
        <XAxis
          dataKey="week"
          tickFormatter={fmtDate}
          tick={axis}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
        />
        <YAxis domain={[40, 100]} tick={axis} tickLine={false} axisLine={false} />
        <Tooltip
          content={<Tip unit="/100" labelFmt={(l) => `Settimana del ${fmtDate(l)}`} />}
          cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
        />
        <Line
          type="monotone"
          dataKey="score"
          name="Compliance media"
          stroke="var(--viz-1)"
          strokeWidth={2}
          dot={{ r: 3.5, fill: "var(--viz-1)", stroke: "var(--card)", strokeWidth: 2 }}
          activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function VolumeBars({ data }: { data: { week: string; visits: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: -18 }} barCategoryGap={4}>
        <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
        <XAxis
          dataKey="week"
          tickFormatter={fmtDate}
          tick={axis}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
        />
        <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
        <Tooltip
          content={<Tip labelFmt={(l) => `Settimana del ${fmtDate(l)}`} />}
          cursor={{ fill: "var(--secondary)" }}
        />
        <Bar
          dataKey="visits"
          name="Visite valide"
          fill="var(--viz-1)"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barre orizzontali HTML: etichette lunghe leggibili e valore sempre scritto. */
export function HBars({
  rows,
  max = 100,
  unit = "",
  color = "var(--viz-1)",
}: {
  rows: { key: string; label: string; value: number; sub?: string }[];
  max?: number;
  unit?: string;
  color?: string;
}) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key} title={`${r.label}: ${r.value}${unit}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-foreground">{r.label}</span>
            <span className="shrink-0 font-medium text-foreground tabular">
              {r.value}
              {unit}
              {r.sub && <span className="ml-1.5 font-normal text-muted-foreground">{r.sub}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary">
            <div
              className="h-2 rounded-full"
              style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
