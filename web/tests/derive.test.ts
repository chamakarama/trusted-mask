// Derived views must only filter/sort/sum released values; the municipality view sums SIGNED estimates, then clamps.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { municipalityCells, rankAt, weekdaysInPeriod } from "../src/data/derive";
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
