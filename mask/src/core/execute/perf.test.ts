import { describe, expect, it } from "vitest";
import type { SpanDetection } from "@/contracts";
import { createExecutor } from "./index";
import { fieldUnit, KEY, mkManifest, mkProposal, mkTable, spanUnit } from "./testkit";
import type { SpanIndex } from "./types";

describe("PlanExecutor performance", () => {
  it("executes 160k rows x 6 columns within a few seconds", () => {
    const n = 160_000;
    const names = ["Aino", "Eero", "Helmi", "Ilkka", "Johanna"];
    const rows = Array.from({ length: n }, (_, i) => [
      `T${i}`, `CNV-${Math.floor(i / 12)}`, `2025-0${1 + (i % 9)}-1${i % 10} 1${i % 10}:${10 + (i % 50)}:00`, String(18 + (i % 70)),
      ["phone", "chat", "email", "letter"][i % 4]!, `hello this is ${names[i % 5]} and my number is +35840${String(1000000 + i)} thanks`,
    ]);
    const t = mkTable("turns", ["turn_id", "conversation_id", "ts", "age", "channel", "text"], rows);
    const spanCache: SpanDetection[][] = rows.map((r) => {
      const text = r[5]!;
      const a = text.indexOf(names[0]!) >= 0 ? text.indexOf(names[0]!) : 14;
      const end = text.indexOf(" and");
      const p = text.indexOf("+358");
      return [{ start: a, end, label: "PERSON", score: 1, ruleId: "t" }, { start: p, end: p + 13, label: "PHONE", score: 1, ruleId: "t" }];
    });
    const spans: SpanIndex = { get: (_t, _c, r) => spanCache[r]! };
    const proposal = mkProposal([
      { unit: fieldUnit("turns", "turn_id"), recipe: "tokenize_keyed", params: { scope: "dataset", format: "token" } },
      { unit: fieldUnit("turns", "conversation_id"), recipe: "tokenize_keyed", params: { scope: "dataset", format: "token" } },
      { unit: fieldUnit("turns", "ts"), recipe: "generalize_datetime", params: { resolution: "hour" } },
      { unit: fieldUnit("turns", "age"), recipe: "generalize_numeric_bin", params: { width: 10, topCode: 90 } },
      { unit: fieldUnit("turns", "channel"), recipe: "generalize_category_rare", params: { minGroup: 5 } },
      { unit: fieldUnit("turns", "text"), recipe: "redact_text" },
      { unit: spanUnit("turns", "text", "PERSON"), recipe: "redact_surrogate", params: { consistency: "conversation" } },
      { unit: spanUnit("turns", "text", "PHONE"), recipe: "redact_typed" },
    ]);
    const manifest = mkManifest([t]);
    const t0 = performance.now();
    const out = createExecutor().execute({ tables: [t], manifest, proposal, spans, sessionKey: KEY });
    const ms = performance.now() - t0;
    if (process.env.MASK_VERBOSE) console.log(`160k x 6 executed in ${Math.round(ms)} ms`);
    expect(out.tables[0]!.rowCount).toBe(n);
    expect(out.tables[0]!.data[5]![0]).toMatch(/^hello this is \S+ and my number is \[PHONE\] thanks$/);
    expect(ms).toBeLessThan(15_000);
  }, 30_000);
});
