import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { PipelineSession } from "./session";
import { SCENARIO_GOALS } from "@/core/goal/scenarios";
import { createGoalInterpreter } from "@/core/goal";
import type { GoalSpec } from "@/contracts";

const fx = (name: string) => readFileSync(fileURLToPath(new URL(`../../../fixtures/customer_service_small/${name}`, import.meta.url)));
const files = () => ["customers.csv", "conversations.csv", "turns.csv"].map((name) => ({ name, data: new Uint8Array(fx(name)) }));
const KEY = new Uint8Array(32).fill(7);

const CS1 = SCENARIO_GOALS["CS-S1"]!, CS2 = SCENARIO_GOALS["CS-S2"]!, CS3 = SCENARIO_GOALS["CS-S3"]!;
const sel = (p: Awaited<ReturnType<PipelineSession["propose"]>>, unitId: string) => p.decisions.find((d) => d.unitId === unitId)?.selected;

describe("pipeline session on the customer-service fixture", () => {
  const s = new PipelineSession(KEY);
  beforeAll(() => { s.import(files()); s.profile(); });

  it("imports, profiles and detects relationships and roles", () => {
    expect(s.manifest!.tables.map((t) => t.name).sort()).toEqual(["conversations", "customers", "turns"]);
    expect(s.manifest!.relationships.some((r) => r.from.table === "conversations" && r.from.column === "customer_id" && r.to.table === "customers")).toBe(true);
    const role = (t: string, c: string) => s.detections!.fields.find((f) => f.ref.table === t && f.ref.column === c)!;
    expect(role("customers", "hetu").subtype).toBe("NATIONAL_ID");
    expect(role("customers", "email").role).toBe("direct_identifier");
    expect(role("turns", "text").role).toBe("free_text");
    expect(Object.keys(role("turns", "text").spanSummary!.byLabel)).toContain("PERSON");
  });

  it("changes justified recipes when the purpose changes", async () => {
    const p1 = await s.propose(CS1, "policy", []);
    const p2 = await s.propose(CS2, "policy", []);
    const p3 = await s.propose(CS3, "policy", []);
    expect(new Set([p1.planHash, p2.planHash, p3.planHash]).size).toBe(3);
    expect(sel(p1, "s:turns.text:PERSON")?.recipeId).toBe("redact_typed");
    expect(sel(p2, "s:turns.text:PERSON")?.recipeId).toBe("redact_surrogate");
    expect(sel(p1, "f:conversations.started_ts")?.params.resolution).toBe("hour");
    expect(sel(p3, "f:conversations.started_ts")?.params.resolution).toBe("week");
    expect(sel(p1, "f:customers.full_name")?.recipeId).toBe("suppress");
    for (const p of [p1, p2, p3]) expect(p.decisions.every((d) => d.selected || d.abstained)).toBe(true);
  });

  it("rejects stale plan hashes after a change", async () => {
    const old = await s.propose(CS1, "policy", []);
    await s.propose(CS2, "policy", []);
    expect(() => s.execute(old.planHash)).toThrow(/stale/);
  });

  it("executes, evaluates and exports exactly what the preview shows", async () => {
    const p = await s.propose(CS1, "policy", []);
    const ex = s.execute(p.planHash);
    expect(ex.tables.find((t) => t.name === "customers")!.columns.find((c) => c.name === "full_name")!.status).toBe("suppressed");
    const ev = s.evaluate(p.planHash);
    expect(ev.hardFailures).toEqual([]);
    expect(ev.coverage.length).toBeGreaterThan(4);
    expect(ev.coverage.some((c) => c.status === "unsupported")).toBe(true);
    const leak = ev.metrics.filter((m) => m.id === "text_leakage_hard_labels");
    expect(leak.length).toBeGreaterThan(0);
    for (const m of leak) expect(m.value).toBe(0);
    // preview/export consistency: exported turns.csv equals the protected row view, in order
    const { receipt, files: out } = await s.export(p.planHash);
    expect(receipt.outputHash).toBe(ex.outputHash);
    const csv = out.find((f) => f.name === "turns.csv")!;
    const parsed = Papa.parse<string[]>(new TextDecoder().decode(csv.data), { skipEmptyLines: "greedy" }).data;
    const view = s.rows({ table: "turns", view: "protected", offset: 0, limit: 50 });
    const kept = view.columns.filter((c) => ex.tables.find((t) => t.name === "turns")!.columns.find((x) => x.name === c)!.status !== "suppressed");
    expect(parsed[0]).toEqual(kept);
    for (let i = 0; i < 50; i++) {
      const row = view.rows[i]!;
      const cells = view.columns.map((c, ci) => (kept.includes(c) ? row.cells[ci] ?? "" : undefined)).filter((v) => v !== undefined);
      expect(parsed[i + 1]).toEqual(cells);
    }
    // nothing private in the report
    const report = new TextDecoder().decode(out.find((f) => f.name === "mask_report.json")!.data);
    expect(report).not.toContain("tok_");
    expect(report).not.toMatch(/\d{6}[-+A]\d{3}[0-9A-Z]/);
    expect(out.some((f) => f.name.startsWith("rowmap_"))).toBe(false);
    // the protected text no longer contains detected names
    const protectedTurns = s.rows({ table: "turns", view: "protected", offset: 0, limit: 200 });
    const textCol = protectedTurns.columns.indexOf("text");
    const changed = protectedTurns.rows.filter((r) => r.changes?.text?.spans?.length);
    expect(changed.length).toBeGreaterThan(10);
    for (const r of changed) expect(r.cells[textCol]).toMatch(/\[(PERSON|NATIONAL_ID|PHONE|EMAIL|ACCOUNT_NUMBER|ADDRESS|DATE|AGE|HEALTH|SECRET|PAYMENT_CARD|IBAN|ORG|LOCATION|DEVICE_ID|URL|USERNAME|IP_ADDRESS|LICENSE_PLATE|PROPERTY_ID)\]/);
  });

  it("applies an altered parameter and re-evaluates", async () => {
    const base = await s.propose(CS1, "policy", []);
    const edited = await s.propose(CS1, "policy", [{ unitId: "f:conversations.started_ts", recipeId: "generalize_datetime", params: { resolution: "day" } }]);
    expect(edited.planHash).not.toBe(base.planHash);
    s.execute(edited.planHash);
    const v = s.rows({ table: "conversations", view: "protected", offset: 0, limit: 3 });
    const ci = v.columns.indexOf("started_ts");
    expect(v.rows[0]!.cells[ci]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.evaluate(edited.planHash).planHash).toBe(edited.planHash);
  });

  it("detects a broken join when a linked key is tokenised per table", async () => {
    const p = await s.propose(CS1, "policy", [{ unitId: "g:conversations.customer_id+customers.customer_id", recipeId: "tokenize_keyed", params: { scope: "table", format: "token" } }]);
    s.execute(p.planHash);
    const ev = s.evaluate(p.planHash);
    const join = ev.metrics.find((m) => m.id === "join_integrity" && m.scope.includes("customer"));
    expect(join?.status).toBe("evaluated");
    expect(join!.value!).toBeLessThan(0.5);
  });

  it("flags an unknown column for review and proposes a safe default", async () => {
    const t = new PipelineSession(KEY);
    const odd = "id,zzq_token,note_free\n1,Q7-ALPHA-991,hello\n2,Q7-BETA-002,there\n3,Q7-GAMMA-113,friend\n4,Q7-DELTA-404,again\n";
    t.import([{ name: "odd.csv", data: odd }]);
    t.profile();
    const p = await t.propose(CS1, "policy", []);
    const d = p.decisions.find((x) => x.unitId === "f:odd.zzq_token")!;
    expect(d.needsReview).toBe(true);
    expect(d.reviewReasons.join(" ")).toMatch(/unrecognised/);
    expect(d.candidates.filter((c) => c.valid).length).toBeGreaterThan(1);
  });

  it("interprets a plain request into a usable goal", async () => {
    const g: GoalSpec = await createGoalInterpreter().interpret("An external vendor will find the main contact reasons and handle time by intent.", { manifest: s.manifest!, detections: s.detections!, answers: {} });
    expect(g.recipient.trustLevel).toBe("contractual");
    expect(g.task.kind).toBe("topic_mining");
    expect(g.requiredFields.map((f) => f.toLowerCase())).toContain("intent");
  });
});
