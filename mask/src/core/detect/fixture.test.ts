/**
 * Development measurements on fixtures/customer_service_small (120 train-split conversations).
 * NOT benchmark results: the lexicons are built from the same synthetic train split, so these numbers are optimistic.
 */
import { describe, expect, it } from "vitest";
import { SPAN_LABELS } from "@/contracts";
import { DetectionSetSchema, DatasetManifestSchema } from "@/contracts";
import { createFieldDetector, createProfiler, createSpanDetector } from "./index";
import { catalogRows, loadFixtureTables, loadGold, scoreSpans } from "./testing";

const tables = loadFixtureTables();
const det = createSpanDetector();

function records() {
  const turns = tables.find((t) => t.name === "turns")!;
  const conv = tables.find((t) => t.name === "conversations")!;
  const out: { gold: { start: number; end: number; label: string }[]; pred: { start: number; end: number; label: string }[] }[] = [];
  const pairs: [typeof turns, string, string, string][] = [[turns, "turn_id", "text", "turns__text.jsonl"], [conv, "conversation_id", "agent_note", "conversations__agent_note.jsonl"]];
  for (const [t, idCol, textCol, goldFile] of pairs) {
    const gold = loadGold(goldFile);
    const ids = t.data[t.columns.indexOf(idCol)]!, texts = t.data[t.columns.indexOf(textCol)]!;
    for (let i = 0; i < t.rowCount; i++) {
      const text = texts[i] ?? "";
      out.push({ gold: gold.get(ids[i]!) ?? [], pred: text ? det.detect(text, { column: textCol }) : [] });
    }
  }
  return out;
}

/** Recall floors actually reached on this fixture (development measurement). */
const RECALL_FLOOR: Record<string, number> = {
  NATIONAL_ID: 0.95, PAYMENT_CARD: 0.95, IBAN: 0.95, SECRET: 0.9, EMAIL: 0.95, PHONE: 0.95, PERSON: 0.95,
  ACCOUNT_NUMBER: 0.9, ADDRESS: 0.9, DATE: 0.9, HEALTH: 0.9, AGE: 0.9, ORG: 0.85, LOCATION: 0.9,
};

describe("span detector on the customer_service_small fixture (development measurement)", () => {
  const recs = records();
  const scores = scoreSpans(recs, SPAN_LABELS);
  it("prints per-label precision, recall and F2 (overlap mode)", () => {
    const rows = scores.filter((s) => s.gold || s.pred).map((s) =>
      `${s.label.padEnd(15)} gold ${String(s.gold).padStart(4)} pred ${String(s.pred).padStart(4)}  R ${s.recall.toFixed(3)}  P ${s.precision.toFixed(3)}  F2 ${s.f2.toFixed(3)}`);
    console.log(["span detection, fixture customer_service_small (dev measurement; lexicons from train split => optimistic)", ...rows].join("\n"));
    expect(rows.length).toBeGreaterThan(5);
  });
  for (const [label, floor] of Object.entries(RECALL_FLOOR)) {
    it(`${label} recall >= ${floor}`, () => {
      const s = scores.find((x) => x.label === label)!;
      expect(s.recall).toBeGreaterThanOrEqual(floor);
    });
  }
  it("spans never overlap and offsets are in range", () => {
    for (const r of recs) {
      const p = [...r.pred].sort((a, b) => a.start - b.start);
      for (let i = 1; i < p.length; i++) expect(p[i]!.start).toBeGreaterThanOrEqual(p[i - 1]!.end);
    }
  });
});

describe("profiler and field detector on the fixture", () => {
  const { manifest } = createProfiler().profile(tables);
  const detections = createFieldDetector().detectFields(tables, manifest, det);

  it("produces schema-valid manifest and detections without raw values", () => {
    expect(DatasetManifestSchema.safeParse(manifest).success).toBe(true);
    expect(DetectionSetSchema.safeParse(detections).success).toBe(true);
    const blob = JSON.stringify(manifest) + JSON.stringify(detections);
    // a few raw cell values from the fixture must not appear anywhere
    const cust = tables.find((t) => t.name === "customers")!;
    for (const col of ["full_name", "hetu", "email", "phone", "iban", "street_address"]) {
      const vals = cust.data[cust.columns.indexOf(col)]!.filter((v): v is string => !!v).slice(0, 20);
      for (const v of vals) expect(blob.includes(v)).toBe(false);
    }
  });

  it("finds the foreign keys between turns, conversations and customers", () => {
    const ids = manifest.relationships.map((r) => r.id);
    console.log("relationships:\n" + manifest.relationships.map((r) => `  ${r.id} (${r.kind}, ${r.matchRate}) ${r.evidence}`).join("\n"));
    expect(ids).toContain("rel:turns.conversation_id->conversations.conversation_id");
    expect(ids).toContain("rel:conversations.customer_id->customers.customer_id");
  });

  it("role accuracy against metadata/field_catalog.csv (customer_service)", () => {
    const cat = catalogRows("customer_service");
    if (!cat) { console.log("field_catalog.csv not found: skipped"); return; }
    let ok = 0;
    const confusion = new Map<string, number>();
    const misses: string[] = [];
    for (const row of cat) {
      const d = detections.fields.find((f) => f.ref.table === row.table && f.ref.column === row.column);
      const got = d?.role ?? "missing";
      if (got === row.role) ok++; else misses.push(`  ${row.table}.${row.column}: expected ${row.role}/${row.subtype}, got ${got}/${d?.subtype}`);
      const k = `${row.role} -> ${got}`;
      confusion.set(k, (confusion.get(k) ?? 0) + 1);
    }
    const acc = ok / cat.length;
    console.log(`field roles: ${ok}/${cat.length} = ${acc.toFixed(3)} (dev measurement)\nconfusion (expected -> detected):\n` +
      [...confusion].sort().map(([k, v]) => `  ${k}: ${v}`).join("\n") + (misses.length ? "\nmismatches:\n" + misses.join("\n") : ""));
    expect(acc).toBeGreaterThanOrEqual(ROLE_ACCURACY_FLOOR);
  });

  it("text columns carry a span summary", () => {
    const text = detections.fields.find((f) => f.ref.table === "turns" && f.ref.column === "text")!;
    expect(text.role).toBe("free_text");
    expect(text.spanSummary?.rowsScanned).toBeGreaterThan(1000);
    expect(text.spanSummary?.byLabel.PERSON ?? 0).toBeGreaterThan(0);
  });
});

const ROLE_ACCURACY_FLOOR = 0.8;
