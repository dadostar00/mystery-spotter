/**
 * Outbox pattern lato device: ogni report viene prima scritto in coda locale
 * (durevole) e poi inviato. Se la rete manca resta in coda e riparte al ritorno
 * online; la chiave di idempotenza (submissionId) rende sicuri i retry.
 */
import { useEffect, useSyncExternalStore } from "react";

import type { SubmissionInput } from "@/domain/contract";
import type { Disposition, Flag } from "@/domain/pipeline/types";
import { NetworkError, submitReport } from "@/warehouse/ingestion-client";

const OUTBOX_KEY = "fieldsight.field.outbox";
const RECEIPTS_KEY = "fieldsight.field.receipts";

export interface OutboxItem {
  submissionId: string;
  enqueuedAt: string;
  attempts: number;
  lastError?: string;
  payload: SubmissionInput;
}

export interface Receipt {
  submissionId: string;
  disposition: Disposition;
  score: number | null;
  flags: Pick<Flag, "code" | "severity" | "message">[];
  via: "api" | "local-fallback";
  syncedAt: string;
}

interface State {
  queue: OutboxItem[];
  receipts: Record<string, Receipt>;
  syncing: boolean;
}

const EMPTY: State = { queue: [], receipts: {}, syncing: false };
let state: State | null = null;
const listeners = new Set<() => void>();

function readJson<T>(k: string, fb: T): T {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fb;
  } catch {
    return fb;
  }
}

function get(): State {
  if (typeof window === "undefined") return EMPTY;
  state ??= {
    queue: readJson(OUTBOX_KEY, []),
    receipts: readJson(RECEIPTS_KEY, {}),
    syncing: false,
  };
  return state;
}

function set(next: Partial<State>) {
  state = { ...get(), ...next };
  if (next.queue) localStorage.setItem(OUTBOX_KEY, JSON.stringify(state.queue));
  if (next.receipts) localStorage.setItem(RECEIPTS_KEY, JSON.stringify(state.receipts));
  listeners.forEach((l) => l());
}

export function enqueue(payload: SubmissionInput) {
  const cur = get();
  if (cur.queue.some((q) => q.submissionId === payload.submissionId)) return;
  set({
    queue: [
      ...cur.queue,
      {
        submissionId: payload.submissionId,
        enqueuedAt: new Date().toISOString(),
        attempts: 0,
        payload,
      },
    ],
  });
}

export async function flush(actor: string): Promise<Receipt[]> {
  if (get().syncing) return [];
  set({ syncing: true });
  const done: Receipt[] = [];
  try {
    for (const item of [...get().queue]) {
      const payload = {
        ...item.payload,
        client: { ...item.payload.client, queuedOffline: item.attempts > 0 },
      };
      try {
        const { result, via } = await submitReport(payload, { actor });
        const receipt: Receipt = {
          submissionId: item.submissionId,
          disposition: result.disposition,
          score: result.report?.score ?? null,
          flags: result.flags.map(({ code, severity, message }) => ({ code, severity, message })),
          via,
          syncedAt: new Date().toISOString(),
        };
        done.push(receipt);
        const cur = get();
        set({
          queue: cur.queue.filter((q) => q.submissionId !== item.submissionId),
          receipts: { ...cur.receipts, [item.submissionId]: receipt },
        });
      } catch (e) {
        const cur = get();
        set({
          queue: cur.queue.map((q) =>
            q.submissionId === item.submissionId
              ? {
                  ...q,
                  attempts: q.attempts + 1,
                  lastError: e instanceof NetworkError ? "Offline" : String(e),
                }
              : q,
          ),
        });
        if (e instanceof NetworkError) break; // offline: inutile provare gli altri
      }
    }
  } finally {
    set({ syncing: false });
  }
  return done;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useOutbox(): State {
  return useSyncExternalStore(subscribe, get, () => EMPTY);
}

export function getReceipt(id: string | undefined): Receipt | null {
  return id ? (get().receipts[id] ?? null) : null;
}

/** Riprova automaticamente al ritorno della connessione e all'avvio. */
export function useOutboxAutoSync(actor: string) {
  useEffect(() => {
    const run = () => void flush(actor);
    if (get().queue.length) run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [actor]);
}
