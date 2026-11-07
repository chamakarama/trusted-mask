/**
 * Private benchmark staging writer (adapter contract in bench/TOOLKIT_MAP.md):
 *
 *   <run>/staging/<dataset>/<file>.csv          protected table, original file and column names, RFC 4180 quoting
 *   <run>/staging/<dataset>/rowmap_<table>.csv  protected_row,original_record_id   (PRIVATE: scoring only)
 *   <run>/export/<dataset>/<file>.csv           the shareable tables only (exactly what the app would download)
 *
 * protected_row is the 0-based row index in the written protected CSV after any filtering/reordering;
 * original_record_id is the catalogued record key of the ORIGINAL source row. Blank ids are never written.
 * Withheld tables (every column suppressed) get no file and no rowmap.
 * Placeholder values that pandas would read as NA ('NA', 'null', 'None', ...) are rewritten in the staging copy of
 * transformed/derived columns, because pets-eval reads tables with keep_default_na=True and would turn them into
 * NaN wildcards. The export keeps the app's exact bytes; rewrites are counted and reported.
 */
import fs from "node:fs";
import path from "node:path";
import type { ExecutedTable } from "@/core/execute";
import { csvField, executedTableCsv, isWithheld } from "@/core/execute";
import type { TableData } from "@/core/session/types";
import { sha256Hex } from "@/core/util/hash";

/** pandas read_csv default na_values (pandas 2.x) */
export const PANDAS_NA_TOKENS = new Set([
  "", "#N/A", "#N/A N/A", "#NA", "-1.#IND", "-1.#QNAN", "-NaN", "-nan", "1.#IND", "1.#QNAN", "<NA>", "N/A", "NA", "NULL", "NaN",
  "None", "n/a", "nan", "null",
]);

/** Rewrite an NA-looking placeholder into a visible, non-NA value. */
export const rewriteNaToken = (v: string): string => `[${v}]`;

export interface StageTableInput {
  table: ExecutedTable;
  /** original file name (customers.csv) */
  fileName: string;
  /** catalogued record key column of the original table (customer_id), null if none */
  recordKey: string | null;
  /** the original (pre-transformation) table, row-aligned with `table` */
  original: TableData;
  /** source row indices in output order (subset and/or reordering). Default: every row in source order. */
  rowOrder?: number[];
}

export interface StagedTable {
  name: string;
  fileName: string;
  released: boolean;
  rowsWritten: number;
  stagingPath: string | null;
  stagingSha256: string | null;
  exportPath: string | null;
  exportSha256: string | null;
  rowmap: { path: string | null; sha256: string | null; rows: number; omitted: boolean; unmappedRows: number; reason?: string };
  naRewrites: number;
}

export interface StagingResult { stagingDir: string; exportDir: string; tables: StagedTable[] }

const CRLF = "\r\n";

function serialize(columns: string[], data: (string | null)[][], order: number[]): string {
  const lines: string[] = new Array(order.length + 1);
  lines[0] = columns.map(csvField).join(",");
  for (let i = 0; i < order.length; i++) {
    const r = order[i]!;
    lines[i + 1] = data.map((col) => csvField(col[r])).join(",");
  }
  return lines.join(CRLF) + CRLF;
}

function writeFile(file: string, text: string): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return sha256Hex(text);
}

export function writeStaging(opts: { runDir: string; dataset: string; tables: StageTableInput[]; omitRowmaps?: string[] }): StagingResult {
  const stagingDir = path.join(opts.runDir, "staging", opts.dataset);
  const exportDir = path.join(opts.runDir, "export", opts.dataset);
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.rmSync(exportDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });
  fs.mkdirSync(exportDir, { recursive: true });
  const omit = new Set(opts.omitRowmaps ?? []);
  const out: StagedTable[] = [];
  for (const inp of opts.tables) {
    const t = inp.table;
    if (inp.original.rowCount !== t.rowCount) throw new Error(`${t.name}: executed table has ${t.rowCount} rows, original ${inp.original.rowCount}`);
    if (/^(rowmap_|_)/.test(path.basename(inp.fileName))) throw new Error(`${inp.fileName}: table file names starting with rowmap_ or _ are not tables to pets-eval`);
    const base: StagedTable = {
      name: t.name, fileName: inp.fileName, released: false, rowsWritten: 0, stagingPath: null, stagingSha256: null, exportPath: null,
      exportSha256: null, rowmap: { path: null, sha256: null, rows: 0, omitted: false, unmappedRows: 0 }, naRewrites: 0,
    };
    if (isWithheld(t)) { base.rowmap.reason = "table withheld"; out.push(base); continue; }
    const order = inp.rowOrder ?? Array.from({ length: t.rowCount }, (_, i) => i);
    for (const r of order) if (!Number.isInteger(r) || r < 0 || r >= t.rowCount) throw new Error(`${t.name}: row order index ${r} out of range`);
    if (new Set(order).size !== order.length) throw new Error(`${t.name}: row order repeats a source row`);
    const live = t.columns.map((c, i) => ({ c, d: t.data[i]! })).filter((x) => x.c.status !== "suppressed");
    // staging copy: NA-token rewrite in transformed/derived columns where the value is a new placeholder
    let rewrites = 0;
    const stagingData = live.map(({ c, d }) => {
      if (c.status !== "transformed" && c.status !== "derived") return d;
      const oi = c.sourceColumn ? inp.original.columns.indexOf(c.sourceColumn) : -1;
      const orig = c.status === "transformed" && oi >= 0 ? inp.original.data[oi]! : null;
      let copy: (string | null)[] | null = null;
      for (let r = 0; r < d.length; r++) {
        const v = d[r];
        if (v === null || v === undefined || !PANDAS_NA_TOKENS.has(v)) continue;
        if (orig && orig[r] === v) continue; // unchanged original value: the original reads the same way
        if (!copy) copy = d.slice();
        copy[r] = rewriteNaToken(v);
        rewrites++;
      }
      return copy ?? d;
    });
    const names = live.map((x) => x.c.name);
    const stagingPath = path.join(stagingDir, inp.fileName);
    const exportPath = path.join(exportDir, inp.fileName);
    const stagingSha = writeFile(stagingPath, serialize(names, stagingData, order));
    const isIdentity = order.length === t.rowCount && order.every((r, i) => r === i);
    // export: the app's exact bytes (executedTableCsv) when rows are in source order
    const exportText = isIdentity ? executedTableCsv(t) : serialize(names, live.map((x) => x.d), order);
    const exportSha = writeFile(exportPath, exportText);
    const res: StagedTable = { ...base, released: true, rowsWritten: order.length, stagingPath, stagingSha256: stagingSha, exportPath, exportSha256: exportSha, naRewrites: rewrites };
    // rowmap
    if (!inp.recordKey) {
      res.rowmap.reason = "no catalogued record key: no rowmap can be written";
    } else if (omit.has(t.name)) {
      res.rowmap = { ...res.rowmap, omitted: true, reason: "rowmap deliberately omitted (--omit-rowmap)" };
    } else {
      const ki = inp.original.columns.indexOf(inp.recordKey);
      if (ki < 0) throw new Error(`${t.name}: record key ${inp.recordKey} not in the original table`);
      const keys = inp.original.data[ki]!;
      const lines = ["protected_row,original_record_id"];
      let unmapped = 0;
      for (let i = 0; i < order.length; i++) {
        const id = keys[order[i]!];
        if (id === null || id === undefined || id.trim() === "") { unmapped++; continue; }
        lines.push(`${i},${csvField(id)}`);
      }
      const rmPath = path.join(stagingDir, `rowmap_${t.name}.csv`);
      const rmSha = writeFile(rmPath, lines.join(CRLF) + CRLF);
      res.rowmap = { path: rmPath, sha256: rmSha, rows: lines.length - 1, omitted: false, unmappedRows: unmapped, ...(unmapped ? { reason: `${unmapped} rows have a blank original record id and are left unmapped` } : {}) };
    }
    out.push(res);
  }
  return { stagingDir, exportDir, tables: out };
}

/** Original tables written as CSV (for a --limit-rows subset the toolkit must compare against the same subset). */
export function writeOriginalSubset(dir: string, tables: TableData[]): { name: string; path: string; sha256: string }[] {
  fs.rmSync(dir, { recursive: true, force: true });
  return tables.map((t) => {
    const p = path.join(dir, t.fileName);
    const order = Array.from({ length: t.rowCount }, (_, i) => i);
    return { name: t.name, path: p, sha256: writeFile(p, serialize(t.columns, t.data, order)) };
  });
}
