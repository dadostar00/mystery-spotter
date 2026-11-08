/**
 * Layer semantico: le metriche sono definite una sola volta qui (come farebbe un
 * dbt model o una vista SQL) e consumate da dashboard ed export. Ogni funzione
 * ha un equivalente SQL in db/schema.sql.
 */
import { CATALOG, MODULE_TITLES, questionLabel } from "@/domain/catalog";
import type { Region } from "@/domain/master-data";
import { countsForAnalytics } from "@/domain/pipeline/stateful";
import type { Disposition, ProcessedReport } from "@/domain/pipeline/types";

export { countsForAnalytics };

export interface Filters {
  days: 7 | 30 | 90 | 0;
  region: Region | "all";
  activityType: string | "all";
}

export const DEFAULT_FILTERS: Filters = { days: 30, region: "all", activityType: "all" };

export function applyFilters(
  reports: ProcessedReport[],
  f: Filters,
  now = new Date(),
): ProcessedReport[] {
  const from = f.days
    ? new Date(now.getTime() - f.days * 86_400_000).toISOString().slice(0, 10)
    : "";
  return reports.filter(
    (r) =>
      (!from || r.visitDate >= from) &&
      (f.region === "all" || r.region === f.region) &&
      (f.activityType === "all" || r.activityType === f.activityType),
  );
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function scored(reports: ProcessedReport[]) {
  return reports.filter(
    (r) => countsForAnalytics(r) && r.outcome === "completed" && r.score !== null,
  );
}

export function overviewKpis(all: ProcessedReport[]) {
  const valid = all.filter(countsForAnalytics);
  const s = scored(all);
  const completed = valid.filter((r) => r.outcome === "completed");
  const purchases = completed.filter((r) => r.kpis.purchase);
  const byDisp = (d: Disposition) => all.filter((r) => r.disposition === d).length;
  return {
    received: all.length,
    accepted: byDisp("ACCEPTED") + byDisp("ACCEPTED_WITH_WARNINGS"),
    quarantinedOpen: all.filter(
      (r) => r.disposition === "QUARANTINED" && r.review.status === "pending",
    ).length,
    rejected: byDisp("REJECTED"),
    acceptanceRate: all.length
      ? (byDisp("ACCEPTED") + byDisp("ACCEPTED_WITH_WARNINGS")) / all.length
      : null,
    avgScore: avg(s.map((r) => r.score!)),
    interrupted: valid.filter((r) => r.outcome === "interrupted").length,
    conversion: completed.length ? purchases.length / completed.length : null,
    spend: purchases.reduce((a, r) => a + (r.kpis.devicePrice ?? 0), 0),
    hostessPresence: avg(
      completed
        .filter((r) => r.kpis.hostessPresent !== null)
        .map((r) => (r.kpis.hostessPresent ? 1 : 0)),
    ),
  };
}

export function dispositionBreakdown(all: ProcessedReport[]) {
  const order: Disposition[] = ["ACCEPTED", "ACCEPTED_WITH_WARNINGS", "QUARANTINED", "REJECTED"];
  return order.map((d) => ({
    disposition: d,
    count: all.filter((r) => r.disposition === d).length,
  }));
}

function isoWeekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function weeklyTrend(all: ProcessedReport[]) {
  const map = new Map<string, { week: string; visits: number; scores: number[] }>();
  for (const r of all.filter(countsForAnalytics)) {
    const w = isoWeekStart(r.visitDate);
    const e = map.get(w) ?? { week: w, visits: 0, scores: [] };
    e.visits++;
    if (r.score !== null && r.outcome === "completed") e.scores.push(r.score);
    map.set(w, e);
  }
  return [...map.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((e) => ({
      week: e.week,
      visits: e.visits,
      score: e.scores.length ? Math.round(avg(e.scores)!) : null,
    }));
}

export function moduleScores(all: ProcessedReport[]) {
  const acc = new Map<string, { c: number; n: number }>();
  for (const r of scored(all)) {
    for (const m of r.modules) {
      const e = acc.get(m.moduleId) ?? { c: 0, n: 0 };
      e.c += m.compliant;
      e.n += m.scorable;
      acc.set(m.moduleId, e);
    }
  }
  return [...acc.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, { c, n }]) => ({
      moduleId: id,
      title: MODULE_TITLES[id] ?? id,
      score: n ? Math.round((c / n) * 100) : 0,
      checks: n,
    }));
}

/** Le domande con più non conformità: dove intervenire con formazione. */
export function topIssues(all: ProcessedReport[], limit = 6) {
  const acc = new Map<string, { fail: number; total: number }>();
  for (const r of scored(all)) {
    for (const a of r.answers) {
      if (a.compliant === null) continue;
      const e = acc.get(a.questionId) ?? { fail: 0, total: 0 };
      e.total++;
      if (!a.compliant) e.fail++;
      acc.set(a.questionId, e);
    }
  }
  return [...acc.entries()]
    .filter(([, e]) => e.total >= 5)
    .map(([id, e]) => ({
      questionId: id,
      label: questionLabel(id),
      moduleId: CATALOG.get(id)?.moduleId ?? "",
      failRate: e.fail / e.total,
      fails: e.fail,
      total: e.total,
    }))
    .sort((a, b) => b.failRate - a.failRate)
    .slice(0, limit);
}

export interface StoreRow {
  storeCode: string;
  city: string | null;
  region: Region | null;
  visits: number;
  avgScore: number | null;
  lastScore: number | null;
  delta: number | null;
  purchases: number;
  openIssues: number;
  weakestModule: string | null;
}

export function storeRanking(all: ProcessedReport[]): StoreRow[] {
  const by = new Map<string, ProcessedReport[]>();
  for (const r of all) by.set(r.storeCode, [...(by.get(r.storeCode) ?? []), r]);
  return [...by.entries()]
    .map(([code, rs]) => {
      const s = scored(rs).sort((a, b) => a.visitDate.localeCompare(b.visitDate));
      const half = Math.floor(s.length / 2);
      const prev = avg(s.slice(0, half).map((r) => r.score!));
      const recent = avg(s.slice(half).map((r) => r.score!));
      const mods = moduleScores(rs).filter((m) => m.checks > 0);
      const weakest = mods.length ? mods.reduce((a, b) => (b.score < a.score ? b : a)) : null;
      return {
        storeCode: code,
        city: rs[0]?.city ?? null,
        region: rs[0]?.region ?? null,
        visits: rs.filter(countsForAnalytics).length,
        avgScore: s.length ? Math.round(avg(s.map((r) => r.score!))!) : null,
        lastScore: s.at(-1)?.score ?? null,
        delta: prev !== null && recent !== null && s.length >= 4 ? Math.round(recent - prev) : null,
        purchases: rs.filter((r) => countsForAnalytics(r) && r.kpis.purchase).length,
        openIssues: rs.filter(
          (r) => r.disposition === "QUARANTINED" && r.review.status === "pending",
        ).length,
        weakestModule: weakest ? `${weakest.moduleId} · ${weakest.title}` : null,
      };
    })
    .sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1));
}

export function regionScores(all: ProcessedReport[]) {
  const by = new Map<string, number[]>();
  for (const r of scored(all)) {
    if (!r.region) continue;
    by.set(r.region, [...(by.get(r.region) ?? []), r.score!]);
  }
  return [...by.entries()]
    .map(([region, xs]) => ({ region, score: Math.round(avg(xs)!), visits: xs.length }))
    .sort((a, b) => b.score - a.score);
}

export function flagStats(all: ProcessedReport[]) {
  const acc = new Map<string, { code: string; severity: string; count: number }>();
  for (const r of all) {
    for (const f of r.flags) {
      const e = acc.get(f.code) ?? { code: f.code, severity: f.severity, count: 0 };
      e.count++;
      acc.set(f.code, e);
    }
  }
  return [...acc.values()].sort((a, b) => b.count - a.count);
}

/** Funnel commerciale della visita: dove si perde il consumatore. */
export function engagementFunnel(all: ProcessedReport[]) {
  const c = all.filter(
    (r) => countsForAnalytics(r) && r.outcome === "completed" && r.kpis.hostessPresent !== null,
  );
  return [
    { step: "Visite con questionario", value: c.length },
    { step: "Hostess presente", value: c.filter((r) => r.kpis.hostessPresent).length },
    { step: "Ingaggio proattivo", value: c.filter((r) => r.kpis.proactiveEngagement).length },
    {
      step: "Prodotto presentato",
      value: c.filter((r) => r.kpis.productsPresented.length > 0).length,
    },
    { step: "Acquisto", value: c.filter((r) => r.kpis.purchase).length },
  ];
}
