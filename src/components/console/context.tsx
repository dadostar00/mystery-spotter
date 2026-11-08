import { createContext, useContext, type Dispatch, type SetStateAction } from "react";

import { type Filters } from "@/warehouse/queries";
import { generateSeed } from "@/warehouse/seed";
import { CONSOLE_OPERATOR, ingestBatch } from "@/warehouse/store";

export const SEEDED_KEY = "fieldsight.wh.seeded";

export const FiltersCtx = createContext<[Filters, Dispatch<SetStateAction<Filters>>] | null>(null);

export function useConsoleFilters() {
  const ctx = useContext(FiltersCtx);
  if (!ctx) throw new Error("useConsoleFilters fuori da /console");
  return ctx;
}

/** Carica lo storico sintetico passando dalla pipeline reale (batch ETL). */
export async function seedWarehouse() {
  const results = await generateSeed();
  const n = ingestBatch(results, CONSOLE_OPERATOR);
  localStorage.setItem(SEEDED_KEY, new Date().toISOString());
  return n;
}
