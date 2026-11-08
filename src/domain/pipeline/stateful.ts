/**
 * Pipeline di ingestione — parte stateful.
 *
 * Controlli che richiedono lo storico già acquisito. In produzione sono query
 * indicizzate sul DB (unique su submission_id, indice su device_serial, ecc.);
 * qui ricevono lo storico come array per restare funzioni pure e testabili.
 */
import { dispositionOf } from "./process";
import type { Flag, ProcessedReport, StageResult } from "./types";

export type CommitDecision =
  { kind: "replay"; existing: ProcessedReport } | { kind: "insert"; report: ProcessedReport };

const counted = (r: ProcessedReport) =>
  r.disposition === "ACCEPTED" ||
  r.disposition === "ACCEPTED_WITH_WARNINGS" ||
  (r.disposition === "QUARANTINED" && r.review.status === "approved");

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Robust z-score (Iglewicz–Hoaglin): 0.6745·(x − mediana)/MAD.
 * Meno sensibile della media/dev.std agli stessi outlier che vuole trovare.
 * Se più di metà dei valori coincide (MAD = 0, tipico dei prezzi di listino)
 * si ripiega sulla deviazione media assoluta: (x − mediana)/(1.2533·MeanAD).
 */
export function robustZ(x: number, sample: number[]): number | null {
  if (sample.length < 8) return null;
  const med = median(sample);
  const dev = sample.map((v) => Math.abs(v - med));
  const mad = median(dev);
  if (mad > 0) return (0.6745 * (x - med)) / mad;
  const meanAd = dev.reduce((a, b) => a + b, 0) / dev.length;
  if (meanAd === 0) return x === med ? 0 : Infinity;
  return (x - med) / (1.2533 * meanAd);
}

export function applyStatefulChecks(
  report: ProcessedReport,
  history: ProcessedReport[],
): CommitDecision {
  // Idempotenza: lo stesso submissionId non viene mai processato due volte.
  const existing = history.find((h) => h.submissionId === report.submissionId);
  if (existing) return { kind: "replay", existing };

  if (report.disposition === "REJECTED") {
    return {
      kind: "insert",
      report: {
        ...report,
        stages: [
          ...report.stages,
          { stage: "dedup", status: "skipped", durationMs: 0, notes: ["Report rifiutato"] },
          { stage: "cross_report", status: "skipped", durationMs: 0, notes: ["Report rifiutato"] },
        ],
      },
    };
  }

  const flags: Flag[] = [];
  const stages: StageResult[] = [];
  const t0 = performance.now();

  const dup = history.find(
    (h) => h.contentHash === report.contentHash && h.disposition !== "REJECTED",
  );
  if (dup) {
    flags.push({
      code: "DUPLICATE_CONTENT",
      severity: "quarantine",
      stage: "dedup",
      message: `Contenuto identico al report ${dup.submissionId.slice(0, 8)}: possibile doppio invio`,
    });
  }
  stages.push({
    stage: "dedup",
    status: dup ? "warn" : "pass",
    durationMs: Math.round((performance.now() - t0) * 100) / 100,
    notes: [`Confronto hash SHA-256 con ${history.length} report`],
  });

  const t1 = performance.now();
  const valid = history.filter(counted);
  const k = report.kpis;
  if (k.purchase && k.deviceSerial) {
    const same = valid.find((h) => h.kpis.deviceSerial === k.deviceSerial);
    if (same) {
      flags.push({
        code: "DUPLICATE_SERIAL",
        severity: "quarantine",
        stage: "cross_report",
        questionId: "e1_seriale",
        message: `Seriale ${k.deviceSerial} già rendicontato (${same.storeCode}, ${same.visitDate}): rischio doppio rimborso`,
      });
    }
  }
  if (k.purchase && k.devicePrice !== null && k.deviceModel) {
    const prices = valid
      .filter((h) => h.kpis.deviceModel === k.deviceModel && h.kpis.devicePrice !== null)
      .map((h) => h.kpis.devicePrice!);
    const z = robustZ(k.devicePrice, prices);
    if (z !== null && Math.abs(z) > 3.5) {
      flags.push({
        code: "PRICE_OUTLIER",
        severity: "warning",
        stage: "cross_report",
        questionId: "e1_prezzo",
        message: `Prezzo € ${k.devicePrice.toFixed(2)} anomalo rispetto a ${prices.length} acquisti ${k.deviceModel} (z robusto ${z === Infinity ? "∞" : z.toFixed(1)})`,
      });
    }
  }
  const repeated = valid.find(
    (h) =>
      h.auditorId === report.auditorId &&
      h.storeCode === report.storeCode &&
      h.visitDate === report.visitDate,
  );
  if (repeated) {
    flags.push({
      code: "REPEATED_VISIT",
      severity: "warning",
      stage: "cross_report",
      message: `Stesso auditor già in ${report.storeCode} il ${report.visitDate}`,
    });
  }
  stages.push({
    stage: "cross_report",
    status: flags.some((f) => f.stage === "cross_report") ? "warn" : "pass",
    durationMs: Math.round((performance.now() - t1) * 100) / 100,
    notes: [`Seriali, prezzi e visite confrontati con ${valid.length} report validi`],
  });

  const allFlags = [...report.flags, ...flags];
  const disposition = dispositionOf(allFlags);
  return {
    kind: "insert",
    report: {
      ...report,
      flags: allFlags,
      stages: [...report.stages, ...stages],
      disposition,
      review: { status: disposition === "QUARANTINED" ? "pending" : "none" },
    },
  };
}

export { counted as countsForAnalytics };
