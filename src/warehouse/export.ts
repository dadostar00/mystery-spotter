/**
 * Export verso strumenti esterni (BI, data lake, Python/DuckDB in analytics/).
 * Formati scelti per l'interoperabilità: NDJSON per i fact, CSV "long" per le risposte.
 */
import type { ProcessedReport } from "@/domain/pipeline/types";
import { storeRanking } from "./queries";

/** Riga piatta del fact: è lo schema atteso da analytics/kpi_report.py e da db/schema.sql. */
export function factRow(r: ProcessedReport) {
  return {
    submission_id: r.submissionId,
    received_at: r.receivedAt,
    visit_date: r.visitDate,
    auditor_id: r.auditorId,
    store_code: r.storeCode,
    city: r.city,
    region: r.region,
    activity_type: r.activityType,
    report_type: r.reportType,
    outcome: r.outcome,
    disposition: r.disposition,
    review_status: r.review.status,
    completion_pct: r.completionPct,
    score: r.score,
    score_a: r.modules.find((m) => m.moduleId === "A")?.score ?? null,
    score_b: r.modules.find((m) => m.moduleId === "B")?.score ?? null,
    score_c: r.modules.find((m) => m.moduleId === "C")?.score ?? null,
    score_d: r.modules.find((m) => m.moduleId === "D")?.score ?? null,
    hostess_present: r.kpis.hostessPresent,
    purchase: r.kpis.purchase,
    device_model: r.kpis.deviceModel,
    device_price: r.kpis.devicePrice,
    duration_min: r.kpis.durationMin,
    flags: r.flags.map((f) => f.code),
    pii_token: r.piiToken,
    pipeline_version: r.pipelineVersion,
  };
}

export function toNdjson(reports: ProcessedReport[]): string {
  return reports.map((r) => JSON.stringify(factRow(r))).join("\n") + "\n";
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("|") : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]!);
  return (
    [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n"
  );
}

export function answersLong(reports: ProcessedReport[]) {
  return reports.flatMap((r) =>
    r.answers.map((a) => ({
      submission_id: r.submissionId,
      store_code: r.storeCode,
      visit_date: r.visitDate,
      module_id: a.moduleId,
      question_id: a.questionId,
      value: Array.isArray(a.value) ? a.value.join("|") : a.value,
      compliant: a.compliant,
    })),
  );
}

export function storesCsv(reports: ProcessedReport[]) {
  return toCsv(storeRanking(reports).map((s) => ({ ...s })));
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
