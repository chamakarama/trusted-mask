/** Test helpers for the detection module (node only; imported by *.test.ts, never by the app). */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import Papa from "papaparse";
import type { TableData } from "@/core/session/types";
import { sha256Hex } from "@/core/util/hash";

const here = dirname(fileURLToPath(import.meta.url));
export const MASK_ROOT = resolve(here, "../../..");
export const FIXTURE_DIR = join(MASK_ROOT, "fixtures/customer_service_small");
export const PACKAGE_DIR = resolve(MASK_ROOT, "../TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026");

/** Parse a CSV file the way the pipeline worker does (column-major, "" -> null). */
export function loadCsv(path: string): TableData {
  const buf = readFileSync(path);
  const text = buf.toString("utf8");
  const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: "greedy", dynamicTyping: false });
  const rows = parsed.data;
  const header = (rows[0] ?? []).map((h, i) => (h && h.trim()) || `column_${i + 1}`);
  const body = rows.slice(1);
  const data: (string | null)[][] = header.map(() => new Array<string | null>(body.length));
  for (let r = 0; r < body.length; r++) {
    const row = body[r] ?? [];
    for (let c = 0; c < header.length; c++) { const v = row[c]; data[c]![r] = v === undefined || v === "" ? null : v; }
  }
  const fileName = path.split("/").pop()!;
  return { name: fileName.replace(/\.[^.]+$/, ""), fileName, columns: header, data, rowCount: body.length, byteSize: buf.byteLength, sha256: sha256Hex(new Uint8Array(buf)), parseWarnings: [] };
}

export function loadFixtureTables(): TableData[] {
  return ["conversations.csv", "customers.csv", "turns.csv"].map((f) => loadCsv(join(FIXTURE_DIR, f)));
}

export interface GoldSpan { start: number; end: number; label: string; text: string }
export function loadGold(file: string): Map<string, GoldSpan[]> {
  const out = new Map<string, GoldSpan[]>();
  for (const line of readFileSync(join(FIXTURE_DIR, "gold", file), "utf8").split("\n")) {
    if (!line.trim()) continue;
    const o = JSON.parse(line) as { record_id: string; spans: GoldSpan[] };
    out.set(o.record_id, o.spans);
  }
  return out;
}

export function catalogRows(dataset: string): { table: string; column: string; role: string; subtype: string }[] | null {
  const p = join(PACKAGE_DIR, "metadata/field_catalog.csv");
  if (!existsSync(p)) return null;
  const parsed = Papa.parse<Record<string, string>>(readFileSync(p, "utf8"), { header: true, skipEmptyLines: true });
  return parsed.data.filter((r) => r.dataset === dataset).map((r) => ({ table: r.table!, column: r.column!, role: r.privacy_role!, subtype: r.subtype! }));
}

export interface LabelScore { label: string; gold: number; found: number; pred: number; tp: number; recall: number; precision: number; f2: number }
/** Overlap-mode scoring: a gold span is found if any predicted span with the same label overlaps it;
 *  a predicted span is a true positive if it overlaps any gold span. */
export function scoreSpans(records: { gold: { start: number; end: number; label: string }[]; pred: { start: number; end: number; label: string }[] }[], labels: readonly string[]): LabelScore[] {
  const acc = new Map(labels.map((l) => [l, { gold: 0, found: 0, pred: 0, tp: 0 }]));
  for (const r of records) {
    for (const g of r.gold) {
      const a = acc.get(g.label); if (!a) continue;
      a.gold++;
      if (r.pred.some((p) => p.label === g.label && p.start < g.end && g.start < p.end)) a.found++;
    }
    for (const p of r.pred) {
      const a = acc.get(p.label); if (!a) continue;
      a.pred++;
      if (r.gold.some((g) => p.start < g.end && g.start < p.end)) a.tp++;
    }
  }
  return labels.map((label) => {
    const a = acc.get(label)!;
    const recall = a.gold ? a.found / a.gold : 1, precision = a.pred ? a.tp / a.pred : 1;
    const f2 = recall + precision ? (5 * precision * recall) / (4 * precision + recall) : 0;
    return { label, ...a, recall, precision, f2 };
  });
}
