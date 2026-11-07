import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import type { ExecutedTable } from "@/core/execute";
import type { TableData } from "@/core/session/types";
import { seededPermutation } from "./lib/runplan";
import { writeStaging } from "./lib/staging";

const orig: TableData = {
  name: "customers", fileName: "customers.csv", columns: ["customer_id", "full_name", "city", "note"],
  data: [["C1", "C2", "C3", "C4"], ["Ann", "Bob", "Cid", "Dee"], ["Turku", "Oulu", "Turku", "Espoo"], ["a, \"quoted\"\nline", null, "NA", "x"]],
  rowCount: 4, byteSize: 0, sha256: "x", parseWarnings: [],
};
const executed: ExecutedTable = {
  name: "customers", rowCount: 4, textChanges: new Map(), sha256: "y",
  columns: [
    { name: "customer_id", sourceColumn: "customer_id", unitId: "u1", status: "transformed" },
    { name: "full_name", sourceColumn: "full_name", unitId: "u2", status: "suppressed" },
    { name: "city", sourceColumn: "city", unitId: "u3", status: "transformed" },
    { name: "note", sourceColumn: "note", unitId: "u4", status: "transformed" },
  ],
  // city placeholder "NA" is new (would be read as NaN by pandas); note "NA" at row 2 equals the original
  data: [["tok_1", "tok_2", "tok_3", "tok_4"], [], ["Turku", "NA", "Turku", "null"], ["a, \"quoted\"\nline", null, "NA", "x"]],
};
const withheld: ExecutedTable = {
  name: "turns", rowCount: 1, textChanges: new Map(), sha256: "z",
  columns: [{ name: "turn_id", sourceColumn: "turn_id", unitId: "t", status: "suppressed" }], data: [[]],
};
const turnsOrig: TableData = { ...orig, name: "turns", fileName: "turns.csv", columns: ["turn_id"], data: [["T1"]], rowCount: 1 };

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "mask-staging-"));
const read = (f: string) => Papa.parse<string[]>(fs.readFileSync(f, "utf8"), { skipEmptyLines: "greedy" }).data;

describe("writeStaging", () => {
  it("writes tables, rowmaps after suppression and shuffling, NA rewrites, and an export with tables only", () => {
    const run = tmp();
    const order = seededPermutation(4, 3);
    const res = writeStaging({ runDir: run, dataset: "cs", tables: [
      { table: executed, fileName: "customers.csv", recordKey: "customer_id", original: orig, rowOrder: order },
      { table: withheld, fileName: "turns.csv", recordKey: "turn_id", original: turnsOrig },
    ] });
    const st = path.join(run, "staging", "cs");
    const rows = read(path.join(st, "customers.csv"));
    expect(rows[0]).toEqual(["customer_id", "city", "note"]); // suppressed column absent
    const rm = read(path.join(st, "rowmap_customers.csv"));
    expect(rm[0]).toEqual(["protected_row", "original_record_id"]);
    expect(rm.length - 1).toBe(4);
    for (const [pr, id] of rm.slice(1)) {
      expect(id).toBeTruthy();
      const src = order[Number(pr)]!;
      expect(id).toBe(orig.data[0]![src]); // the original record key of the source row now at protected_row
      expect(rows[Number(pr) + 1]![0]).toBe(executed.data[0]![src]);
    }
    // NA rewrite only for new placeholders; the multi-line quoted value round-trips
    const city = rows.slice(1).map((r) => r[1]);
    expect(city).toContain("[NA]");
    expect(city).toContain("[null]");
    const notes = rows.slice(1).map((r) => r[2]);
    expect(notes).toContain("NA");
    expect(notes).toContain("a, \"quoted\"\nline");
    expect(res.tables.find((t) => t.name === "customers")!.naRewrites).toBe(2);
    // withheld table: no file, no rowmap
    expect(fs.existsSync(path.join(st, "turns.csv"))).toBe(false);
    expect(fs.existsSync(path.join(st, "rowmap_turns.csv"))).toBe(false);
    // export: tables only, keeps the app's values
    const exp = fs.readdirSync(path.join(run, "export", "cs"));
    expect(exp).toEqual(["customers.csv"]);
    expect(read(path.join(run, "export", "cs", "customers.csv")).slice(1).map((r) => r[1])).toContain("NA");
  });

  it("never writes blank ids and honours omitted rowmaps", () => {
    const run = tmp();
    const o2: TableData = { ...orig, data: [["C1", null, " ", "C4"], ...orig.data.slice(1)] };
    const res = writeStaging({ runDir: run, dataset: "cs", tables: [{ table: executed, fileName: "customers.csv", recordKey: "customer_id", original: o2 }] });
    const rm = read(path.join(run, "staging", "cs", "rowmap_customers.csv")).slice(1);
    expect(rm).toEqual([["0", "C1"], ["3", "C4"]]);
    expect(res.tables[0]!.rowmap.unmappedRows).toBe(2);
    const run2 = tmp();
    const res2 = writeStaging({ runDir: run2, dataset: "cs", omitRowmaps: ["customers"], tables: [{ table: executed, fileName: "customers.csv", recordKey: "customer_id", original: orig }] });
    expect(res2.tables[0]!.rowmap.omitted).toBe(true);
    expect(fs.existsSync(path.join(run2, "staging", "cs", "rowmap_customers.csv"))).toBe(false);
  });
});
