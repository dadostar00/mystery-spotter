import { describe, expect, it } from "vitest";

import { applyStatefulChecks } from "@/domain/pipeline/stateful";
import type { ProcessedReport } from "@/domain/pipeline/types";
import { generateSeed } from "./seed";

describe("dataset sintetico", () => {
  it("è deterministico e attraversa tutti gli esiti della pipeline", async () => {
    const now = new Date("2026-11-08T12:00:00Z");
    const results = await generateSeed({ now, count: 180 });
    const again = await generateSeed({ now, count: 180 });
    expect(again.map((r) => r.disposition)).toEqual(results.map((r) => r.disposition));

    const stored: ProcessedReport[] = [];
    let replays = 0;
    for (const r of results) {
      if (!r.report) continue;
      const d = applyStatefulChecks(r.report, stored);
      if (d.kind === "replay") replays++;
      else stored.push(d.report);
    }
    const disp = new Set(stored.map((r) => r.disposition));
    expect(disp).toEqual(
      new Set(["ACCEPTED", "ACCEPTED_WITH_WARNINGS", "QUARANTINED", "REJECTED"]),
    );
    expect(replays).toBe(1);
    expect(results.filter((r) => r.deadLetter).length).toBe(2);

    const flagCodes = new Set(stored.flatMap((r) => r.flags.map((f) => f.code)));
    for (const c of [
      "PRICE_OUT_OF_RANGE",
      "VISIT_TOO_SHORT",
      "MISSING_RECEIPT",
      "UNKNOWN_STORE",
      "ORPHAN_ANSWER",
      "DUPLICATE_SERIAL",
      "DUPLICATE_CONTENT",
      "CONSENT_MISSING",
    ]) {
      expect(flagCodes, c).toContain(c);
    }
    const accepted = stored.filter((r) => r.disposition === "ACCEPTED");
    expect(accepted.length / stored.length).toBeGreaterThan(0.5);
  });
});
