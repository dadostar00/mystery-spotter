import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";

import { HBars, TrendLine, VolumeBars } from "@/components/console/charts";
import { useConsoleFilters } from "@/components/console/context";
import { FilterBar } from "@/components/console/filter-bar";
import {
  DISPOSITION_COLOR,
  DISPOSITION_LABEL,
  DispositionBadge,
  Kpi,
  PageHeader,
  Panel,
  fmtPct,
} from "@/components/console/ui";
import {
  applyFilters,
  dispositionBreakdown,
  engagementFunnel,
  moduleScores,
  overviewKpis,
  regionScores,
  topIssues,
  weeklyTrend,
} from "@/warehouse/queries";
import { useWarehouse } from "@/warehouse/store";

export const Route = createFileRoute("/console/")({
  component: Overview,
});

function Overview() {
  const { reports } = useWarehouse();
  const [filters] = useConsoleFilters();
  const data = useMemo(() => applyFilters(reports, filters), [reports, filters]);
  const k = useMemo(() => overviewKpis(data), [data]);
  const trend = useMemo(() => weeklyTrend(data), [data]);
  const mods = useMemo(() => moduleScores(data), [data]);
  const issues = useMemo(() => topIssues(data), [data]);
  const funnel = useMemo(() => engagementFunnel(data), [data]);
  const regions = useMemo(() => regionScores(data), [data]);
  const disp = useMemo(() => dispositionBreakdown(data), [data]);
  const total = disp.reduce((a, d) => a + d.count, 0);

  return (
    <>
      <PageHeader
        title="Panoramica"
        description="KPI di compliance calcolati solo sui report che hanno superato la pipeline (accettati o approvati in revisione). Quarantene e rifiuti restano fuori dalle medie."
        actions={<FilterBar />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Report ricevuti"
          value={String(k.received)}
          hint={`${k.interrupted} audit interrotti`}
        />
        <Kpi
          label="Tasso di accettazione"
          value={fmtPct(k.acceptanceRate)}
          hint={`${k.rejected} rifiutati`}
        />
        <Kpi
          label="Compliance media"
          value={k.avgScore === null ? "—" : `${Math.round(k.avgScore)}/100`}
          hint="score ponderato per modulo"
        />
        <Kpi
          label="Da revisionare"
          value={String(k.quarantinedOpen)}
          hint="in quarantena"
          tone={k.quarantinedOpen ? "warn" : undefined}
        />
        <Kpi
          label="Presenza hostess"
          value={fmtPct(k.hostessPresence)}
          hint="sulle visite complete"
        />
        <Kpi
          label="Conversione"
          value={fmtPct(k.conversion)}
          hint={`€ ${k.spend.toFixed(0)} spesa dispositivi`}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel
          title="Compliance media per settimana"
          description="Score 0–100 · solo report validi"
          className="xl:col-span-2"
        >
          {trend.length ? <TrendLine data={trend} /> : <Empty />}
          <p className="mb-1 mt-4 text-xs font-medium text-muted-foreground">
            Visite valide per settimana
          </p>
          {trend.length ? <VolumeBars data={trend} /> : null}
        </Panel>

        <Panel title="Esito della pipeline" description={`${total} submission nel periodo`}>
          {total ? (
            <>
              <div
                className="flex h-3 gap-0.5 overflow-hidden rounded-full"
                role="img"
                aria-label="Distribuzione esiti"
              >
                {disp
                  .filter((d) => d.count)
                  .map((d) => (
                    <div
                      key={d.disposition}
                      title={`${DISPOSITION_LABEL[d.disposition]}: ${d.count}`}
                      style={{
                        width: `${(d.count / total) * 100}%`,
                        background: DISPOSITION_COLOR[d.disposition],
                      }}
                    />
                  ))}
              </div>
              <ul className="mt-4 space-y-2.5">
                {disp.map((d) => (
                  <li key={d.disposition} className="flex items-center justify-between text-sm">
                    <DispositionBadge value={d.disposition} />
                    <span className="font-medium tabular">
                      {d.count}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {fmtPct(d.count / total)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                to="/console/ingestione"
                className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary"
              >
                Log di ingestione <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <Empty />
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="Compliance per modulo" description="Quota di controlli conformi">
          {mods.length ? (
            <HBars
              rows={mods.map((m) => ({
                key: m.moduleId,
                label: `${m.moduleId} · ${m.title}`,
                value: m.score,
                sub: `${m.checks} controlli`,
              }))}
              unit="%"
            />
          ) : (
            <Empty />
          )}
        </Panel>

        <Panel title="Funnel della visita" description="Dove si perde il consumatore">
          {funnel[0]?.value ? (
            <HBars
              max={funnel[0].value}
              rows={funnel.map((s, i) => ({
                key: s.step,
                label: s.step,
                value: s.value,
                ...(i > 0 ? { sub: fmtPct(s.value / funnel[0]!.value) } : {}),
              }))}
            />
          ) : (
            <Empty />
          )}
        </Panel>

        <Panel
          title="Compliance per area"
          description="Media dello score per macro-regione"
          className="lg:col-span-2 xl:col-span-1"
        >
          {regions.length ? (
            <HBars
              rows={regions.map((r) => ({
                key: r.region,
                label: r.region,
                value: r.score,
                sub: `${r.visits} visite`,
              }))}
              unit="/100"
            />
          ) : (
            <Empty />
          )}
        </Panel>
      </div>

      <Panel
        title="Non conformità più frequenti"
        description="Dove concentrare formazione e richiami alle agenzie"
        className="mt-4"
      >
        {issues.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Mod.</th>
                  <th className="pb-2 pr-3 font-medium">Controllo</th>
                  <th className="pb-2 pr-3 text-right font-medium">Non conformi</th>
                  <th className="w-40 pb-2 font-medium">Tasso</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((i) => (
                  <tr key={i.questionId} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-xs text-muted-foreground">
                      {i.moduleId}
                    </td>
                    <td className="py-2.5 pr-3">{i.label}</td>
                    <td className="py-2.5 pr-3 text-right tabular">
                      {i.fails}/{i.total}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-secondary">
                          <div
                            className="h-2 rounded-full bg-viz-1"
                            style={{ width: `${i.failRate * 100}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs tabular">
                          {fmtPct(i.failRate)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
      </Panel>
    </>
  );
}

function Empty() {
  return (
    <p className="py-10 text-center text-sm text-muted-foreground">
      Nessun dato nel periodo selezionato.
    </p>
  );
}
