/**
 * Catalogo domande "as data": indicizza il questionario e definisce come ogni
 * risposta contribuisce allo score di compliance. Aggiungere una domanda non
 * richiede migrazioni di schema (vedi docs/DATABASE_ARCHITECTURE.md).
 */
import { QUALI_QUESTIONS, QUANT_MODULES, type Question } from "./questionnaire";

export interface CatalogEntry {
  question: Question;
  moduleId: string;
  moduleTitle: string;
  /** Valore che indica conformità; undefined = domanda non valutata nello score. */
  compliantValue?: string;
  pii?: boolean;
}

/** Peso dei moduli nello score complessivo. */
export const MODULE_WEIGHTS: Record<string, number> = { A: 0.25, B: 0.25, C: 0.3, D: 0.2 };

/** Domande informative/di conversione che non misurano la compliance. */
const NOT_SCORED = new Set(["d0_acquisto", "a2_totalblack", "e1_consenso"]);
export const PII_QUESTIONS = new Set(["e1_email", "e1_phone"]);
export const NOT_APPLICABLE = "Non Applicabile";

function build(): Map<string, CatalogEntry> {
  const map = new Map<string, CatalogEntry>();
  for (const m of QUANT_MODULES) {
    for (const q of m.questions) {
      const scorable = q.kind === "single" && q.options?.[0] === "Sì" && !NOT_SCORED.has(q.id);
      map.set(q.id, {
        question: q,
        moduleId: m.id,
        moduleTitle: m.title,
        ...(scorable ? { compliantValue: "Sì" } : {}),
        ...(PII_QUESTIONS.has(q.id) ? { pii: true } : {}),
      });
    }
  }
  for (const q of QUALI_QUESTIONS) {
    map.set(q.id, { question: q, moduleId: "Q", moduleTitle: "Report qualitativo" });
  }
  return map;
}

export const CATALOG: ReadonlyMap<string, CatalogEntry> = build();

export const MODULE_TITLES: Record<string, string> = Object.fromEntries([
  ...QUANT_MODULES.map((m) => [m.id, m.title]),
  ["Q", "Report qualitativo"],
]);

export function questionLabel(id: string): string {
  return CATALOG.get(id)?.question.label ?? id;
}
