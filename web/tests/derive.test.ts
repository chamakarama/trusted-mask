// Derived views must only filter/sort/sum released values; the municipality view sums SIGNED estimates, then clamps.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { cellRadius, commonEnd, hourTotals, lineTotals, municipalityCells, noiseRadius, outgoingAt, rangeOf, rankAt, shortlistReliability, weekdaysInPeriod } from "../src/data/derive";
import { oddsBound } from "../src/data/evidence";
import type { Release } from "../src/data/release";

function load(id: string): Release {
  const dir = join(__dirname, "..", "public", "releases", id);
  const j = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8"));
  const stats = j("statistics.json"), geo = j("public_areas.geojson");
  return {
    id, manifest: j("manifest.json"), definitions: j("definitions.json"),
    areas: geo.features.map((f: any) => ({ id: f.properties.area_id, name: f.properties.name, municipality: f.properties.municipality, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] })),
    od: stats.od, lineHour: stats.line_hour, daily: stats.daily, validation: { ok: true, errors: [], warnings: [] }, bytes: {}, readme: "",
  };
}

const rel = load("e1-aura-001");

it("municipality cells cover the full public municipality domain", () => {
  const munis = new Set(rel.areas.map((a) => a.municipality));
  expect(municipalityCells(rel)).toHaveLength(munis.size * munis.size * 5);
});

it("municipality value = max(0, sum of released signed area estimates), never a sum of clamped values", () => {
  const muni = new Map(rel.areas.map((a) => [a.id, a.municipality]));
  for (const m of municipalityCells(rel)) {
    const members = rel.od.filter((c) => muni.get(c.origin_area) === m.origin_area && muni.get(c.destination_area) === m.destination_area && c.hour_band === m.hour_band);
    const signed = members.reduce((s, c) => s + c.noisy_value, 0);
    expect(m.noisy_value).toBe(signed);
    expect(m.trips).toBe(Math.max(0, signed));
  }
});

it("corridor ranking excludes same-place pairs and is sorted by the released estimate", () => {
  for (const level of ["area", "municipality"] as const) {
    const r = rankAt(rel, level, "06-09", null);
    expect(r.every((c) => c.origin_area !== c.destination_area)).toBe(true);
    expect(r.every((c, i) => i === 0 || r[i - 1].trips >= c.trips)).toBe(true);
  }
});

it("per-weekday division uses the public number of weekdays in the period", () => {
  expect(weekdaysInPeriod(rel)).toBe(20);
});

it("noise ranges match Astra's privacy/uncertainty.py (OpenDP discrete Laplace accuracy, rounded up)", () => {
  expect(cellRadius(rel, "od")).toBe(161);
  expect(cellRadius(rel, "line_hour")).toBe(640);
  expect(cellRadius(rel, "daily")).toBe(1918);
  expect(noiseRadius(rel.manifest.privacy.families.od.scale, 0.05 / 420)).toBe(483); // evidence/e6 morning simultaneous radius
  expect(() => noiseRadius(0)).toThrow();
});

it("totals add SIGNED estimates and clamp once, never a sum of already-clamped values", () => {
  for (const l of lineTotals(rel)) expect(l.total).toBe(Math.max(0, l.cells.reduce((s, c) => s + c.noisy_value, 0)));
  const out = outgoingAt(rel, "area", "00-06");
  for (const [a, v] of out) {
    const signed = rel.od.filter((c) => c.hour_band === "00-06" && c.origin_area === a && c.destination_area !== a).reduce((s, c) => s + c.noisy_value, 0);
    expect(v).toBe(Math.max(0, signed));
  }
  expect(hourTotals(rel)).toHaveLength(24);
});

it("shortlist ranges are selection-valid: 95% for all candidate routes at once, around the signed value", () => {
  const night = shortlistReliability(rel, rankAt(rel, "area", "00-06", null), 3);
  expect(night.candidates).toBe(420);
  expect(night.radius).toBe(483); // = evidence/e6 morning simultaneous radius, wider than the single-cell 161
  expect(night.noiseOnly).toEqual([1, 2, 3]);
  const morning = shortlistReliability(rel, rankAt(rel, "area", "06-09", null), 3);
  expect(morning.noiseOnly).toEqual([]);
  const rusko = shortlistReliability(rel, rankAt(rel, "area", "06-09", "Rusko-213"), 3);
  expect(rusko.candidates).toBe(20);
  expect(rusko.radius).toBe(noiseRadius(rel.manifest.privacy.families.od.scale, 0.05 / 20));
  expect(rusko.noiseOnly.length).toBeGreaterThan(0);
  expect(rangeOf(341, 483)).toEqual([0, 824]);
  expect(rangeOf(-20, 161)).toEqual([0, 141]);
});

it("map takeaway names the most common end of the busiest morning routes", () => {
  const t = commonEnd(rankAt(rel, "area", "06-09", null).slice(0, 10));
  expect(t?.side).toBe("end");
  expect(t?.place).toBe("Turku-205");
});

it("epsilon in plain words: odds change at most e^eps (eps 1: 50% -> 73%)", () => {
  const b = oddsBound(1);
  expect(b.factor).toBeCloseTo(2.718, 3);
  expect(Math.round(b.posterior * 100)).toBe(73);
  expect(Math.round(oddsBound(2).posterior * 100)).toBe(88);
});
