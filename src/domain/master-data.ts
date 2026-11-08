/**
 * Master data (anagrafiche) usate dalla pipeline per l'integrità referenziale
 * e l'arricchimento dei report. In produzione arrivano da MDM/ERP; qui sono statiche.
 */
import { STORES, type Store } from "./questionnaire";

export type Region = "Nord-Ovest" | "Nord-Est" | "Centro" | "Sud" | "Isole";

export const REGIONS: Region[] = ["Nord-Ovest", "Nord-Est", "Centro", "Sud", "Isole"];

const CITY_REGION: Record<string, Region> = {
  Milano: "Nord-Ovest",
  Torino: "Nord-Ovest",
  Genova: "Nord-Ovest",
  Bologna: "Nord-Est",
  Roma: "Centro",
  Firenze: "Centro",
  Napoli: "Sud",
  Bari: "Sud",
  Catania: "Isole",
};

export interface StoreMaster extends Store {
  region: Region;
}

export const STORE_MASTER: ReadonlyMap<string, StoreMaster> = new Map(
  STORES.map((s) => [s.code, { ...s, region: CITY_REGION[s.city] ?? "Centro" }]),
);

export function findStore(code: string): StoreMaster | undefined {
  return STORE_MASTER.get(code);
}

/** Prezzi di listino dei dispositivi: base per il controllo di plausibilità della spesa. */
export const DEVICE_LIST_PRICE: Record<string, number> = {
  Hilo: 39,
  "Hyper Pro": 29,
};
