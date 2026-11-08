/**
 * Rigenera analytics/sample/*: lo stesso export che la console produce da "Dati & API".
 * Uso: npx vitest run analytics/export-sample.test.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { it } from "vitest";

import { applyStatefulChecks } from "../src/domain/pipeline/stateful";
import type { ProcessedReport } from "../src/domain/pipeline/types";
import { answersLong, toCsv, toNdjson } from "../src/warehouse/export";
import { generateSeed } from "../src/warehouse/seed";

it("rigenera il dataset di esempio", async () => {
  const results = await generateSeed({ now: new Date("2026-11-08T12:00:00Z") });
  const stored: ProcessedReport[] = [];
  for (const r of results) {
    if (!r.report) continue;
    const d = applyStatefulChecks(r.report, stored);
    if (d.kind === "insert") stored.push(d.report);
  }
  const out = (f: string) => fileURLToPath(new URL(`./sample/${f}`, import.meta.url));
  writeFileSync(out("fact_report.ndjson"), toNdjson(stored));
  writeFileSync(out("fact_answer.csv"), toCsv(answersLong(stored)));
});
