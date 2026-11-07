import { describe, expect, it } from "vitest";
import type { SpanDetection } from "@/contracts";
import { createExecutor, conversationKeyColumn } from "./index";
import { fieldUnit, KEY, mkManifest, mkProposal, mkTable, sp, spanOf, spanUnit, stubSpans, type PlanEntry } from "./testkit";
import { makeSurrogate } from "./surrogates";

const T1 = "Hi I am Ksenia Sokolova, mail ksenia@kotiposti.fi or call +358401234567 today.";
const T2 = "ksenia here again, my id is 020782-918P";
const T3 = "This is Ksenia Sokolova calling.";

function setup(entries: PlanEntry[], extraSpans: Record<string, SpanDetection[]> = {}, consistency = "conversation") {
  const turns = mkTable("turns", ["turn_id", "conversation_id", "text"], [
    ["T1", "CNV-1", T1], ["T2", "CNV-1", T2], ["T3", "CNV-2", T3], ["T4", "CNV-1", T3], ["T5", "CNV-3", null],
  ]);
  const spans: Record<string, SpanDetection[]> = {
    "turns.text:0": [spanOf(T1, "Ksenia Sokolova", "PERSON"), spanOf(T1, "ksenia@kotiposti.fi", "EMAIL"), spanOf(T1, "+358401234567", "PHONE")],
    "turns.text:1": [spanOf(T2, "ksenia", "PERSON"), spanOf(T2, "020782-918P", "NATIONAL_ID")],
    "turns.text:2": [spanOf(T3, "Ksenia Sokolova", "PERSON")],
    "turns.text:3": [spanOf(T3, "Ksenia Sokolova", "PERSON")],
    ...extraSpans,
  };
  const base: PlanEntry[] = [
    { unit: fieldUnit("turns", "turn_id"), recipe: "keep" },
    { unit: fieldUnit("turns", "conversation_id"), recipe: "keep" },
    { unit: fieldUnit("turns", "text"), recipe: "redact_text" },
    { unit: spanUnit("turns", "text", "PERSON"), recipe: "redact_surrogate", params: { consistency } },
  ];
  const manifest = mkManifest([turns]);
  const out = createExecutor().execute({ tables: [turns], manifest, proposal: mkProposal([...base, ...entries]), spans: stubSpans(spans), sessionKey: KEY });
  const t = out.tables[0]!;
  return { out, text: t.data[2]!, changes: t.textChanges, spans };
}

describe("PlanExecutor: redact_text", () => {
  const typedEmailSuppressPhone: PlanEntry[] = [
    { unit: spanUnit("turns", "text", "EMAIL"), recipe: "redact_typed" },
    { unit: spanUnit("turns", "text", "PHONE"), recipe: "suppress" },
    { unit: spanUnit("turns", "text", "NATIONAL_ID"), recipe: "redact_typed" },
  ];

  it("applies typed, surrogate and suppress decisions with original offsets recorded", () => {
    const { text, changes } = setup(typedEmailSuppressPhone);
    const t0 = text[0]!;
    expect(t0).not.toContain("Ksenia");
    expect(t0).toContain("mail [EMAIL] or call today.");
    expect(t0).not.toContain("  ");
    expect(t0).toMatch(/^Hi I am [A-ZÅÄÖ][a-zåäö]+ [A-ZÅÄÖ][a-zåäö]+, mail/);
    const ch = changes.get("2:0")!;
    expect(ch.spans.map((s) => [s.label, s.recipeId])).toEqual([["PERSON", "redact_surrogate"], ["EMAIL", "redact_typed"], ["PHONE", "suppress"]]);
    expect(T1.slice(ch.spans[1]!.start, ch.spans[1]!.end)).toBe("ksenia@kotiposti.fi");
    expect(ch.spans[1]!.replacement).toBe("[EMAIL]");
    expect(ch.spans[2]!.replacement).toBe("");
    expect(ch.spans[0]!.unitId).toBe("s:turns.text:PERSON");
    expect(text[1]).toMatch(/^[a-zåäö]+ here again, my id is \[NATIONAL_ID\]$/); // lower-case name keeps its case style
    expect(text[4]).toBeNull();
    expect(changes.has("2:4")).toBe(false);
  });

  it("keeps surrogates consistent within a conversation and per name word", () => {
    const { text } = setup(typedEmailSuppressPhone);
    const full0 = /^Hi I am (\S+ \S+),/.exec(text[0]!)![1]!;
    const full3 = /^This is (\S+ \S+) calling/.exec(text[3]!)![1]!; // same conversation CNV-1
    expect(full3).toBe(full0);
    expect(text[1]!.split(" ")[0]).toBe(full0.split(" ")[0]!.toLowerCase()); // "ksenia" alone -> same first name
    const ds = setup(typedEmailSuppressPhone, {}, "dataset").text;
    expect(/^This is (\S+ \S+)/.exec(ds[2]!)![1]).toBe(/^This is (\S+ \S+)/.exec(ds[3]!)![1]); // across conversations
  });

  it("varies surrogates across conversations and with consistency none", () => {
    const seen = new Set<string>();
    for (let c = 0; c < 12; c++) seen.add(makeSurrogate("PERSON", "Ksenia Sokolova", (k) => [...`${c}|${k}`].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7))!);
    expect(seen.size).toBeGreaterThan(3);
    expect(seen.has("Ksenia Sokolova")).toBe(false);
  });

  it("falls back to typed placeholders for labels without a decision and notes it", () => {
    const { text, out } = setup([{ unit: spanUnit("turns", "text", "EMAIL"), recipe: "redact_typed" }, { unit: spanUnit("turns", "text", "PHONE"), recipe: "keep" }]);
    expect(text[0]).toContain("call +358401234567 today"); // keep leaves it
    expect(text[1]).toContain("[NATIONAL_ID]");
    expect(out.notes.some((n) => n.includes("NATIONAL_ID") && n.includes("no span decision"))).toBe(true);
  });

  it("is safe with overlapping and out-of-range spans", () => {
    const { text, changes } = setup(typedEmailSuppressPhone, {
      "turns.text:2": [sp(0, 7, "ORG"), sp(5, 12, "LOCATION"), spanOf(T3, "Ksenia Sokolova", "PERSON"), sp(10, 999, "EMAIL")],
    });
    expect(text[2]).toMatch(/^\[ORG\] [A-ZÅÄÖ]\S* \S+ calling\.$/);
    expect(changes.get("2:2")!.spans.map((s) => s.label)).toEqual(["ORG", "PERSON"]);
  });

  it("surrogates of other labels look like the label", () => {
    const seed = (k: string) => [...k].reduce((a, ch) => (a * 33 + ch.charCodeAt(0)) >>> 0, 5381);
    expect(makeSurrogate("EMAIL", "a.b@c.fi", seed)).toMatch(/^[a-z]+\.[a-z]+\d\d@[a-z.]*example(\.[a-z]+)?$/);
    expect(makeSurrogate("PHONE", "+358401234567", seed)).toMatch(/^\+358\d{9}$/);
    expect(makeSurrogate("PHONE", "040 123 4567", seed)).toMatch(/^0\d\d \d{3} \d{4}$/);
    expect(makeSurrogate("ACCOUNT_NUMBER", "251 384 823 1", seed)).toMatch(/^\d{3} \d{3} \d{3} \d$/);
    expect(makeSurrogate("DATE", "2025-03-14", seed)).toMatch(/^2025-\d\d-\d\d$/);
    expect(makeSurrogate("DATE", "14.3.2025", seed)).toMatch(/^\d{1,2}\.\d{1,2}\.2025$/);
    expect(makeSurrogate("AGE", "45 years", seed)).toMatch(/^\d+ years$/);
    expect(makeSurrogate("LOCATION", "Turku", seed)).not.toBe("Turku");
    expect(makeSurrogate("ADDRESS", "Kuusikuja 7 F 4", seed)).toMatch(/^\S+ \d+ [A-D] \d+$/);
    expect(makeSurrogate("NATIONAL_ID", "020782-918P", seed)).toBeNull();
  });

  it("finds the conversation key column", () => {
    const turns = mkTable("turns", ["turn_id", "conversation_id", "text"], [["T1", "C1", "x"], ["T2", "C1", "y"]]);
    expect(conversationKeyColumn(turns, mkManifest([turns]))).toBe("conversation_id");
    const notes = mkTable("calls", ["rec", "customer_id", "note"], [["1", "A", "x"], ["2", "A", "y"]]);
    const cust = mkTable("customers", ["customer_id"], [["A"]]);
    expect(conversationKeyColumn(notes, mkManifest([notes, cust], [{ from: { table: "calls", column: "customer_id" }, to: { table: "customers", column: "customer_id" }, matchRate: 1 }]))).toBe("customer_id");
    const lone = mkTable("x", ["a", "b"], [["1", "2"]]);
    expect(conversationKeyColumn(lone, mkManifest([lone]))).toBeNull();
  });
});
