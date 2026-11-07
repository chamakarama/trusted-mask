/**
 * Loading supplied challenge tables into the same column-major TableData the app's pipeline worker builds
 * (papaparse, no dynamic typing, "" -> null), plus a relationship-preserving row subset for quick smoke runs.
 * Private benchmark code: runs in Node only, never in the app bundle.
 */
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import type { TableData } from "@/core/session/types";
import { sha256Hex } from "@/core/util/hash";
import { CHALLENGE_DIR, loadCatalog, type CatalogRow } from "../../labels/common";

export const PKG = CHALLENGE_DIR;

/** Same parsing as src/worker/pipeline.worker.ts parseCsv. */
export function parseCsvText(name: string, fileName: string, text: string, byteSize: number, sha256: string): TableData {
  const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: "greedy", dynamicTyping: false });
  const rows = parsed.data;
  const warnings = parsed.errors.slice(0, 20).map((e) => `row ${e.row ?? "?"}: ${e.message}`);
  const header = (rows[0] ?? []).map((h, i) => (h && h.trim()) || `column_${i + 1}`);
  const body = rows.slice(1);
  const data: (string | null)[][] = header.map(() => new Array<string | null>(body.length));
  for (let r = 0; r < body.length; r++) {
    const row = body[r] ?? [];
    if (row.length !== header.length && warnings.length < 25) warnings.push(`row ${r + 2}: ${row.length} fields, expected ${header.length}`);
    for (let c = 0; c < header.length; c++) {
      const v = row[c];
      data[c]![r] = v === undefined || v === "" ? null : v;
    }
  }
  return { name, fileName, columns: header, data, rowCount: body.length, byteSize, sha256, parseWarnings: warnings };
}

export function tableNameOf(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "_");
}

export function loadCsvFile(file: string): TableData {
  const buf = fs.readFileSync(file);
  const fileName = path.basename(file);
  return parseCsvText(tableNameOf(fileName), fileName, buf.toString("utf8"), buf.byteLength, sha256Hex(new Uint8Array(buf)));
}

/** Every CSV of PKG/data/<dataset>/, sorted by file name. */
export function loadDataset(dataset: string, dataDir = path.join(PKG, "data", dataset)): TableData[] {
  if (!fs.existsSync(dataDir)) throw new Error(`no dataset folder ${dataDir}`);
  const files = fs.readdirSync(dataDir).filter((f) => f.toLowerCase().endsWith(".csv")).sort();
  if (!files.length) throw new Error(`no CSV files in ${dataDir}`);
  return files.map((f) => loadCsvFile(path.join(dataDir, f)));
}

export function catalogFor(dataset: string): CatalogRow[] {
  return loadCatalog().filter((r) => r.dataset === dataset);
}

/** Catalogued record key column of a table (the id the toolkit rowmap uses), or null. */
export function recordKeyOf(catalog: CatalogRow[], table: string): string | null {
  return catalog.find((r) => r.table === table && r.privacy_role === "record_key")?.column ?? null;
}

/** Restrict a table to the given source rows (in that order). Hash/size describe the subset, not the file. */
export function selectRows(t: TableData, rows: number[]): TableData {
  const data = t.data.map((col) => rows.map((r) => col[r] ?? null));
  const sig = sha256Hex(`${t.sha256}:subset:${rows.length}:${sha256Hex(rows.join(","))}`);
  return { ...t, data, rowCount: rows.length, sha256: sig, parseWarnings: [...t.parseWarnings, `subset of ${t.rowCount} rows`] };
}

/**
 * Relationship-preserving subset for smoke runs: a table is a child of another when one of its catalogued
 * technical identifiers has the parent's record-key column name. Root tables keep their first `limit` rows;
 * child tables keep the rows whose foreign key points at a kept parent row (so joins stay intact).
 * Returns the subset tables and a per-table description.
 */
export function relationalSubset(tables: TableData[], catalog: CatalogRow[], limit: number): { tables: TableData[]; log: string[] } {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const parentOf = new Map<string, { fk: string; parent: string; parentKey: string }>();
  for (const t of tables) {
    for (const r of catalog.filter((x) => x.table === t.name && x.privacy_role === "technical_identifier")) {
      const parent = catalog.find((x) => x.table !== t.name && x.privacy_role === "record_key" && x.column === r.column && byName.has(x.table));
      if (parent && !parentOf.has(t.name)) parentOf.set(t.name, { fk: r.column, parent: parent.table, parentKey: parent.column });
    }
  }
  const kept = new Map<string, number[]>();
  const log: string[] = [];
  const visit = (name: string, depth = 0): number[] => {
    const done = kept.get(name);
    if (done) return done;
    if (depth > tables.length) throw new Error("cyclic foreign keys in catalog");
    const t = byName.get(name)!;
    const rel = parentOf.get(name);
    let rows: number[];
    if (!rel) {
      rows = Array.from({ length: Math.min(limit, t.rowCount) }, (_, i) => i);
      log.push(`${name}: first ${rows.length} of ${t.rowCount} rows`);
    } else {
      const parent = byName.get(rel.parent)!;
      const prow = visit(rel.parent, depth + 1);
      const pk = parent.data[parent.columns.indexOf(rel.parentKey)]!;
      const keys = new Set(prow.map((r) => pk[r]).filter((v): v is string => v !== null));
      const fk = t.data[t.columns.indexOf(rel.fk)]!;
      rows = [];
      for (let r = 0; r < t.rowCount; r++) { const v = fk[r]; if (v !== null && v !== undefined && keys.has(v)) rows.push(r); }
      log.push(`${name}: ${rows.length} of ${t.rowCount} rows whose ${rel.fk} is in the kept ${rel.parent}.${rel.parentKey}`);
    }
    kept.set(name, rows);
    return rows;
  };
  const out = tables.map((t) => selectRows(t, visit(t.name)));
  return { tables: out, log };
}
