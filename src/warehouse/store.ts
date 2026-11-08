/**
 * Repository del data warehouse.
 *
 * Nella demo pubblica il "database aziendale" vive nel browser (localStorage),
 * così il sito resta statico/edge e ogni visitatore ha la propria sandbox.
 * L'interfaccia è quella di un repository: in produzione le stesse operazioni
 * diventano query su PostgreSQL (vedi db/schema.sql) senza toccare la UI.
 */
import { useSyncExternalStore } from "react";

import type {
  DeadLetter,
  PiiVaultEntry,
  ProcessedReport,
  ProcessingResult,
} from "@/domain/pipeline/types";
import { applyStatefulChecks } from "@/domain/pipeline/stateful";

const K = {
  reports: "fieldsight.wh.reports",
  vault: "fieldsight.wh.pii_vault",
  keys: "fieldsight.wh.keystore",
  audit: "fieldsight.wh.audit_log",
  dlq: "fieldsight.wh.dead_letter",
} as const;

export interface AuditLogEntry {
  id: string;
  at: string;
  actor: string;
  action:
    | "INGEST"
    | "DLQ"
    | "REPLAY"
    | "REVIEW_APPROVE"
    | "REVIEW_REJECT"
    | "PII_REVEAL"
    | "PII_ERASE"
    | "RETENTION_JOB"
    | "EXPORT"
    | "SEED"
    | "RESET";
  target?: string;
  detail?: string;
}

export interface WarehouseSnapshot {
  reports: ProcessedReport[];
  vault: PiiVaultEntry[];
  audit: AuditLogEntry[];
  deadLetters: DeadLetter[];
}

export const CONSOLE_OPERATOR = "operatore.demo@fieldsight";

const EMPTY: WarehouseSnapshot = { reports: [], vault: [], audit: [], deadLetters: [] };
let snapshot: WarehouseSnapshot | null = null;
const listeners = new Set<() => void>();

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("Warehouse: scrittura non riuscita", e);
  }
}

function load(): WarehouseSnapshot {
  if (typeof window === "undefined") return EMPTY;
  if (!snapshot) {
    snapshot = {
      reports: read<ProcessedReport[]>(K.reports, []),
      vault: read<PiiVaultEntry[]>(K.vault, []),
      audit: read<AuditLogEntry[]>(K.audit, []),
      deadLetters: read<DeadLetter[]>(K.dlq, []),
    };
  }
  return snapshot;
}

function commit(next: Partial<WarehouseSnapshot>) {
  const cur = load();
  snapshot = { ...cur, ...next };
  if (next.reports) write(K.reports, snapshot.reports);
  if (next.vault) write(K.vault, snapshot.vault);
  if (next.audit) write(K.audit, snapshot.audit);
  if (next.deadLetters) write(K.dlq, snapshot.deadLetters);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith("fieldsight.wh.")) {
      snapshot = null;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useWarehouse(): WarehouseSnapshot {
  return useSyncExternalStore(subscribe, load, () => EMPTY);
}

export function getWarehouse(): WarehouseSnapshot {
  return load();
}

function logEntry(e: Omit<AuditLogEntry, "id" | "at"> & { at?: string }): AuditLogEntry {
  return { id: crypto.randomUUID(), at: e.at ?? new Date().toISOString(), ...e };
}

export function appendAudit(e: Omit<AuditLogEntry, "id" | "at">) {
  commit({ audit: [logEntry(e), ...load().audit].slice(0, 500) });
}

/**
 * Commit transazionale di un esito di pipeline: controlli stateful + scrittura
 * di fact, vault e chiave. Restituisce il report effettivamente persistito.
 */
export function ingest(
  result: ProcessingResult,
  actor: string,
): { report: ProcessedReport | null; replay: boolean } {
  const cur = load();
  if (!result.report) {
    if (result.deadLetter) {
      const dl = result.deadLetter;
      commit({
        deadLetters: [dl, ...cur.deadLetters].slice(0, 200),
        audit: [
          logEntry({
            actor,
            action: "DLQ",
            target: dl.id,
            detail: `${dl.errors.length} violazioni di contratto`,
          }),
          ...cur.audit,
        ],
      });
    }
    return { report: null, replay: false };
  }
  const decision = applyStatefulChecks(result.report, cur.reports);
  if (decision.kind === "replay") {
    commit({
      audit: [
        logEntry({
          actor,
          action: "REPLAY",
          target: decision.existing.submissionId,
          detail: "Invio duplicato ignorato (idempotenza)",
        }),
        ...cur.audit,
      ],
    });
    return { report: decision.existing, replay: true };
  }
  const report = decision.report;
  const keepVault = result.vault && report.disposition !== "REJECTED";
  if (keepVault && result.vaultKey) {
    const keys = read<Record<string, JsonWebKey>>(K.keys, {});
    keys[result.vaultKey.keyId] = result.vaultKey.jwk;
    write(K.keys, keys);
  }
  commit({
    reports: [report, ...cur.reports],
    ...(keepVault && result.vault ? { vault: [result.vault, ...cur.vault] } : {}),
    audit: [
      logEntry({
        actor,
        action: "INGEST",
        target: report.submissionId,
        detail: `${report.disposition} · ${report.source}`,
        at: report.processedAt,
      }),
      ...cur.audit,
    ].slice(0, 500),
  });
  return { report, replay: false };
}

/** Variante bulk per il caricamento storico: un solo write su storage. */
export function ingestBatch(results: ProcessingResult[], actor: string): number {
  const cur = load();
  const reports = [...cur.reports];
  const vault = [...cur.vault];
  const deadLetters = [...cur.deadLetters];
  const keys = read<Record<string, JsonWebKey>>(K.keys, {});
  let inserted = 0;
  for (const r of results) {
    if (r.deadLetter) deadLetters.unshift(r.deadLetter);
    if (!r.report) continue;
    const d = applyStatefulChecks(r.report, reports);
    if (d.kind === "replay") continue;
    reports.unshift(d.report);
    inserted++;
    if (r.vault && r.vaultKey && d.report.disposition !== "REJECTED") {
      vault.unshift(r.vault);
      keys[r.vaultKey.keyId] = r.vaultKey.jwk;
    }
  }
  write(K.keys, keys);
  reports.sort((a, b) => b.processedAt.localeCompare(a.processedAt));
  commit({
    reports,
    vault,
    deadLetters,
    audit: [
      logEntry({ actor, action: "SEED", detail: `${inserted} report caricati via batch` }),
      ...cur.audit,
    ],
  });
  return inserted;
}

export function reviewReport(id: string, decision: "approved" | "rejected", note: string) {
  const cur = load();
  commit({
    reports: cur.reports.map((r) =>
      r.submissionId === id
        ? {
            ...r,
            review: { status: decision, by: CONSOLE_OPERATOR, at: new Date().toISOString(), note },
          }
        : r,
    ),
    audit: [
      logEntry({
        actor: CONSOLE_OPERATOR,
        action: decision === "approved" ? "REVIEW_APPROVE" : "REVIEW_REJECT",
        target: id,
        detail: note,
      }),
      ...cur.audit,
    ],
  });
}

export function getVaultKey(keyId: string): JsonWebKey | null {
  return read<Record<string, JsonWebKey>>(K.keys, {})[keyId] ?? null;
}

/** Crypto-shredding: si distrugge la chiave e il ciphertext; restano solo metadati non personali. */
export function erasePii(tokens: string[], reason: string, actor = CONSOLE_OPERATOR) {
  const cur = load();
  const keys = read<Record<string, JsonWebKey>>(K.keys, {});
  const at = new Date().toISOString();
  const set = new Set(tokens);
  const vault = cur.vault.map((v) => {
    if (!set.has(v.token) || v.status === "erased") return v;
    delete keys[v.keyId];
    return {
      ...v,
      status: "erased" as const,
      ciphertext: "",
      iv: "",
      emailMasked: null,
      phoneMasked: null,
      erasedAt: at,
      erasureReason: reason,
    };
  });
  write(K.keys, keys);
  commit({
    vault,
    audit: [
      logEntry({
        actor,
        action: reason === "retention" ? "RETENTION_JOB" : "PII_ERASE",
        detail: `${tokens.length} record · ${reason}`,
      }),
      ...cur.audit,
    ],
  });
}

export function resetWarehouse() {
  Object.values(K).forEach((k) => window.localStorage.removeItem(k));
  snapshot = null;
  commit({
    audit: [logEntry({ actor: CONSOLE_OPERATOR, action: "RESET", detail: "Warehouse svuotato" })],
  });
}
