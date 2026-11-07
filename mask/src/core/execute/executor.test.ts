import { describe, expect, it } from "vitest";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { sha256Hex } from "@/core/util/hash";
import { createExecutor, executedTableCsv } from "./index";
import { generalizeDate, isoWeek } from "./datetime";
import { parseHetu } from "./hetu";
import { fieldUnit, groupUnit, KEY, mkManifest, mkProposal, mkTable, stubSpans, type PlanEntry } from "./testkit";
import type { TableData } from "@/core/session/types";

const run = (tables: TableData[], entries: PlanEntry[], key = KEY) =>
  createExecutor().execute({ tables, manifest: mkManifest(tables), proposal: mkProposal(entries), spans: stubSpans({}), sessionKey: key });

const col = (plan: ReturnType<typeof run>, table: string, name: string) => {
  const t = plan.tables.find((x) => x.name === table)!;
  const i = t.columns.findIndex((c) => c.name === name);
  return { meta: t.columns[i]!, data: t.data[i]! };
};

const HETU_CHARS = "0123456789ABCDEFHJKLMNPRSTUVWXY";
const hetu = (ddmmyy: string, sign: string, ind: string) => `${ddmmyy}${sign}${ind}${HETU_CHARS[Number(ddmmyy + ind) % 31]}`;

describe("PlanExecutor: field recipes", () => {
  const people = mkTable("people", ["id", "name", "note"], [["1", "Anna", "x"], ["2", "Bob", null], ["3", "Anna", "y"]]);

  it("keeps, suppresses (column listed with empty data) and removes columns without a decision", () => {
    const out = run([people], [{ unit: fieldUnit("people", "id"), recipe: "keep" }, { unit: fieldUnit("people", "name"), recipe: "suppress" }]);
    const t = out.tables[0]!;
    expect(t.columns.map((c) => [c.name, c.status])).toEqual([["id", "kept"], ["name", "suppressed"], ["note", "suppressed"]]);
    expect(t.data[0]).toEqual(["1", "2", "3"]);
    expect(t.data[1]).toEqual([]);
    expect(t.data[2]).toEqual([]);
    expect(out.notes.some((n) => n.includes("people.note") && n.includes("no decision unit"))).toBe(true);
    expect(executedTableCsv(t)).toBe("id\r\n1\r\n2\r\n3\r\n");
    expect(t.sha256).toBe(sha256Hex(executedTableCsv(t)));
  });

  it("tokenises with keyed HMAC: consistent, null-preserving, scope-dependent, key-dependent", () => {
    const a = mkTable("a", ["cid"], [["C1"], ["C2"], ["C1"], [null]]);
    const b = mkTable("b", ["cid"], [["C1"], ["C3"]]);
    const out = run([a, b], [{ unit: groupUnit(["a", "cid"], ["b", "cid"]), recipe: "tokenize_keyed", params: { scope: "dataset", format: "token" } }]);
    const ta = col(out, "a", "cid").data, tb = col(out, "b", "cid").data;
    expect(ta[0]).toMatch(/^tok_[0-9a-f]{12}$/);
    expect(ta[0]).toBe(ta[2]);
    expect(ta[0]).not.toBe(ta[1]);
    expect(ta[3]).toBeNull();
    expect(tb[0]).toBe(ta[0]); // joins survive across tables in the dataset scope
    const scopeKey = hmac(sha256, KEY, new TextEncoder().encode("mask/token/dataset/v1"));
    expect(ta[0]).toBe(`tok_${bytesToHex(hmac(sha256, scopeKey, new TextEncoder().encode("C1"))).slice(0, 12)}`);

    const perTable = run([a, b], [
      { unit: fieldUnit("a", "cid"), recipe: "tokenize_keyed", params: { scope: "table", format: "token" } },
      { unit: fieldUnit("b", "cid"), recipe: "tokenize_keyed", params: { scope: "table", format: "prefix" } },
    ]);
    const pa = col(perTable, "a", "cid").data, pb = col(perTable, "b", "cid").data;
    expect(pa[0]).not.toBe(ta[0]);
    expect(pb[0]).toMatch(/^C1_[0-9a-f]{10}$/);
    expect(pb[0]!.slice(3)).not.toBe(pa[0]!.slice(4, 14));

    const otherKey = run([a, b], [{ unit: groupUnit(["a", "cid"], ["b", "cid"]), recipe: "tokenize_keyed", params: { scope: "dataset", format: "token" } }], new Uint8Array(32));
    expect(col(otherKey, "a", "cid").data[0]).not.toBe(ta[0]);
  });

  it("coarsens timestamps to every resolution and empties unparseable values", () => {
    const t = mkTable("e", ["ts"], [["2025-01-29 09:23:41"], ["29.1.2025 09:59"], ["2025-01-29"], ["not a date"], [null]]);
    const expectations: Record<string, (string | null)[]> = {
      "15min": ["2025-01-29 09:15", "2025-01-29 09:45", "2025-01-29", null, null],
      hour: ["2025-01-29 09:00", "2025-01-29 09:00", "2025-01-29", null, null],
      day: ["2025-01-29", "2025-01-29", "2025-01-29", null, null],
      week: ["2025-W05", "2025-W05", "2025-W05", null, null],
      month: ["2025-01", "2025-01", "2025-01", null, null],
      year: ["2025", "2025", "2025", null, null],
    };
    for (const [resolution, want] of Object.entries(expectations)) {
      const out = run([t], [{ unit: fieldUnit("e", "ts"), recipe: "generalize_datetime", params: { resolution } }]);
      expect(col(out, "e", "ts").data).toEqual(want);
      expect(out.notes.some((n) => n.includes("e.ts") && n.includes("1 value"))).toBe(true);
    }
    expect(isoWeek(2024, 12, 30)).toEqual({ year: 2025, week: 1 });
    expect(generalizeDate("2021-01-03", "week")).toBe("2020-W53");
    expect(generalizeDate("2025-02-30", "day")).toBeNull();
  });

  it("bins numbers with width and top-code", () => {
    const t = mkTable("p", ["age"], [["34"], ["39"], ["40"], ["95"], ["90"], ["abc"], [null], ["7.5"]]);
    const out = run([t], [{ unit: fieldUnit("p", "age"), recipe: "generalize_numeric_bin", params: { width: 10, topCode: 90 } }]);
    expect(col(out, "p", "age").data).toEqual(["30-39", "30-39", "40-49", "90+", "90+", null, null, "0-9"]);
    expect(out.notes.some((n) => n.includes("non-numeric"))).toBe(true);
    const five = run([t], [{ unit: fieldUnit("p", "age"), recipe: "generalize_numeric_bin", params: { width: 5, topCode: 0 } }]);
    expect(col(five, "p", "age").data.slice(0, 4)).toEqual(["30-34", "35-39", "40-44", "95-99"]);
  });

  it("truncates postcodes to 3 or 2 digits", () => {
    const t = mkTable("p", ["pc"], [["20100"], ["00180"], ["X1"], [null]]);
    expect(col(run([t], [{ unit: fieldUnit("p", "pc"), recipe: "generalize_postcode", params: { digits: "3" } }]), "p", "pc").data).toEqual(["201**", "001**", null, null]);
    expect(col(run([t], [{ unit: fieldUnit("p", "pc"), recipe: "generalize_postcode", params: { digits: "2" } }]), "p", "pc").data).toEqual(["20***", "00***", null, null]);
  });

  it("merges rare categories into other", () => {
    const t = mkTable("c", ["city"], [["Turku"], ["Turku"], ["Turku"], ["Oulu"], ["Salo"], ["Salo"], [null]]);
    const out = run([t], [{ unit: fieldUnit("c", "city"), recipe: "generalize_category_rare", params: { minGroup: 2 } }]);
    expect(col(out, "c", "city").data).toEqual(["Turku", "Turku", "Turku", "other", "Salo", "Salo", null]);
    expect(col(out, "c", "city").meta.status).toBe("transformed");
  });

  it("derives age band and sex from HETU", () => {
    const h2000 = hetu("150305", "A", "123"); // born 2005-03-15, 123 odd -> M
    const h1800 = hetu("010190", "+", "246"); // born 1890 -> 90+
    const t = mkTable("c", ["id", "hetu"], [["1", "020782-918P"], ["2", "311064-9219"], ["3", h2000], ["4", "020782-918X"], ["5", null], ["6", h1800]]);
    const out = run([t], [{ unit: fieldUnit("c", "id"), recipe: "keep" }, { unit: fieldUnit("c", "hetu"), recipe: "derive_hetu", params: { ageBandYears: "10", referenceDate: "2025-12-31" } }]);
    const tbl = out.tables[0]!;
    expect(tbl.columns.map((c) => [c.name, c.status, c.sourceColumn, c.unitId])).toEqual([
      ["id", "kept", "id", "f:c.id"], ["hetu_age_band", "derived", "hetu", "f:c.hetu"], ["hetu_sex", "derived", "hetu", "f:c.hetu"],
    ]);
    expect(col(out, "c", "hetu_age_band").data).toEqual(["40-49", "60-69", "20-29", null, null, "90+"]);
    expect(col(out, "c", "hetu_sex").data).toEqual(["F", "M", "M", null, null, "F"]);
    const five = run([t], [{ unit: fieldUnit("c", "hetu"), recipe: "derive_hetu", params: { ageBandYears: "5", referenceDate: "2025-12-31" } }]);
    expect(col(five, "c", "hetu_age_band").data.slice(0, 3)).toEqual(["40-44", "60-64", "20-24"]);
    expect(parseHetu("311064-9219")?.birth).toEqual({ y: 1964, m: 10, d: 31 });
    expect(out.notes.some((n) => n.includes("1 invalid identity code"))).toBe(true);
  });

  it("is deterministic and hashes output tables", () => {
    const t = mkTable("t", ["a", "b"], [["x,1", "he said \"hi\""], ["y", null]]);
    const entries: PlanEntry[] = [{ unit: fieldUnit("t", "a"), recipe: "keep" }, { unit: fieldUnit("t", "b"), recipe: "keep" }];
    const o1 = run([t], entries), o2 = run([t], entries);
    expect(o1.outputHash).toBe(o2.outputHash);
    expect(executedTableCsv(o1.tables[0]!)).toBe('a,b\r\n"x,1","he said ""hi"""\r\ny,\r\n');
    expect(o1.planHash).toBe(mkProposal(entries).planHash);
    expect(o1.durationMs).toBeGreaterThanOrEqual(0);
  });
});
