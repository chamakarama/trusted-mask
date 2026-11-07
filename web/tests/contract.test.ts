// T1 handshake from the consumer side: independently validate Astra's fixture and actual release, and refuse mutations.
// Reads the synced copies in web/public (run `npm run sync` first).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateRelease } from "../src/contract/validate";

const pub = join(__dirname, "..", "public");
const schema = JSON.parse(readFileSync(join(pub, "contract", "manifest.schema.json"), "utf8"));
const sha = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const enc = new TextEncoder();

function load(id: string): Map<string, Uint8Array> {
  const dir = join(pub, "releases", id);
  return new Map(readdirSync(dir).map((f) => [f, new Uint8Array(readFileSync(join(dir, f)))]));
}
const releases = ["fixture-only-001", "e1-aura-001", "city-turku-v1"].filter((id) => existsSync(join(pub, "releases", id)));

describe.each(releases)("release %s", (id) => {
  const schema = JSON.parse(readFileSync(join(__dirname,"../../contracts", id==="city-turku-v1"?"manifest-city.schema.json":"manifest.schema.json"),"utf8"));
  it("passes independent validation", async () => {
    const res = await validateRelease(load(id), schema, sha);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it("refuses an unknown top-level manifest property", async () => {
    const files = load(id);
    const m = JSON.parse(new TextDecoder().decode(files.get("manifest.json")));
    m.passenger_ids = ["x"];
    files.set("manifest.json", enc.encode(JSON.stringify(m)));
    expect((await validateRelease(files, schema, sha)).ok).toBe(false);
  });

  it("refuses an unsupported major version", async () => {
    const files = load(id);
    const m = JSON.parse(new TextDecoder().decode(files.get("manifest.json")));
    m.schema_version = "2.0";
    files.set("manifest.json", enc.encode(JSON.stringify(m)));
    const res = await validateRelease(files, schema, sha);
    expect(res.ok).toBe(false);
    expect(res.errors.join()).toMatch(/UNSUPPORTED_VERSION/);
  });

  it("refuses a tampered statistic (hash no longer matches)", async () => {
    const files = load(id);
    const s = JSON.parse(new TextDecoder().decode(files.get("statistics.json")));
    s.od[0].trips += 1;
    files.set("statistics.json", enc.encode(JSON.stringify(s)));
    expect((await validateRelease(files, schema, sha)).ok).toBe(false);
  });

  it("refuses an extra, unlisted member such as raw taps", async () => {
    const files = load(id);
    files.set("taps.csv", enc.encode("card_id,ts\n1,2025-10-06 08:00:00\n"));
    const res = await validateRelease(files, schema, sha);
    expect(res.ok).toBe(false);
    expect(res.errors.join()).toMatch(/unexpected member taps.csv/);
  });

  it("refuses a CSV download that disagrees with the JSON the UI shows, even with recomputed hashes", async () => {
    const files = load(id);
    const csv = new TextDecoder().decode(files.get("od_matrix.csv")).split("\n");
    const cells = csv[1].split(",");
    cells[3] = String(Number(cells[3]) + 7);
    csv[1] = cells.join(",");
    files.set("od_matrix.csv", enc.encode(csv.join("\n")));
    // an attacker or bug that also rewrites the manifest and checksums must still be caught by the CSV<->JSON check
    const m = JSON.parse(new TextDecoder().decode(files.get("manifest.json")));
    for (const r of m.resources) r.sha256 = await sha(files.get(r.path)!);
    files.set("manifest.json", enc.encode(JSON.stringify(m)));
    const lines = [...files.entries()].filter(([k]) => k !== "checksums.sha256").sort(([a], [b]) => a.localeCompare(b));
    files.set("checksums.sha256", enc.encode((await Promise.all(lines.map(async ([k, v]) => `${await sha(v)}  ${k}`))).join("\n") + "\n"));
    const res = await validateRelease(files, schema, sha);
    expect(res.ok).toBe(false);
    expect(res.errors.join()).toMatch(/disagrees with statistics.json/);
  });
});

describe("public labels cannot carry markup (A-011/A-012 regression)", () => {
  it("refuses an HTML-bearing area label even when every hash is recomputed", async () => {
    const files = load("fixture-only-001");
    const dec = new TextDecoder();
    const g = JSON.parse(dec.decode(files.get("public_areas.geojson")));
    g.features[0].properties.name = '<img src=x onerror="window.__pwned=1">';
    files.set("public_areas.geojson", enc.encode(JSON.stringify(g)));
    const m = JSON.parse(dec.decode(files.get("manifest.json")));
    for (const r of m.resources) r.sha256 = await sha(files.get(r.path)!);
    files.set("manifest.json", enc.encode(JSON.stringify(m)));
    const lines = [...files.entries()].filter(([k]) => k !== "checksums.sha256").sort(([a], [b]) => a.localeCompare(b));
    files.set("checksums.sha256", enc.encode((await Promise.all(lines.map(async ([k, v]) => `${await sha(v)}  ${k}`))).join("\n") + "\n"));
    const res = await validateRelease(files, schema, sha);
    expect(res.ok).toBe(false);
    expect(res.errors.join()).toMatch(/markup/);
  });
});
