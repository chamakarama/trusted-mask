// Independent consumer-side validation of a RouteSafe protected release (planning/INTERFACES.md, schema 1.0).
// Written separately from Astra's Python verifier so that two implementations must agree on the same bundle.
// Runs in the browser (WebCrypto) and in Node tests. A release that fails any check is refused, never "repaired".
import { geometryCentre } from "./geography";
import Ajv2020 from "ajv/dist/2020";

export const ALLOWED_MEMBERS = ["manifest.json", "definitions.json", "public_areas.geojson", "od_matrix.csv",
  "line_hour.csv", "daily.csv", "statistics.json", "README.txt", "checksums.sha256"] as const;
export const VALUE_COLUMN: Record<string, string> = { od: "trips", line_hour: "boardings", daily: "tap_events" };
// Consumer-side allowlist: the only dimensions and resources each family may ever have (contract v1).
// A manifest cannot widen these, e.g. by adding a card_id "dimension".
export const FAMILY_DIMENSIONS: Record<string, string[]> = { od: ["origin_area", "destination_area", "hour_band"], line_hour: ["line", "hour"], daily: ["date"] };
export const FAMILY_RESOURCE: Record<string, string> = { od: "od_matrix.csv", line_hour: "line_hour.csv", daily: "daily.csv" };
const GEO_PROPERTIES = ["area_id", "municipality", "name", "source"];
export const EXTRA_COLUMNS = ["noisy_value", "noise_lower", "noise_upper", "evidence_status"];
export const EVIDENCE = ["usable", "uncertain", "not_supported"];
export const HOUR_BANDS = ["00-06", "06-09", "09-15", "15-18", "18-24"];
export const SUPPORTED_MAJOR = "1";

export type Row = Record<string, string | number | null>;
export interface Validation { ok: boolean; errors: string[]; warnings: string[] }
export type Sha256 = (bytes: Uint8Array) => Promise<string>;

const td = new TextDecoder("utf-8", { fatal: true });

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, LF/CRLF). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.filter((r) => r.length > 1 || r[0] !== "").map((r) => {
    if (r.length !== header.length) throw new Error("CSV row width mismatch");
    return Object.fromEntries(header.map((h, k) => [h, r[k]]));
  });
}

function datesBetween(start: string, endInclusive: string): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z"), end = new Date(endInclusive + "T00:00:00Z");
  if (!Number.isFinite(+d) || !Number.isFinite(+end) || +end < +d || +end - +d > 366 * 86400000) throw Error("Invalid release period");
  while (d <= end) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

export async function validateRelease(files: Map<string, Uint8Array>, schema: object, sha256: Sha256): Promise<Validation> {
  const errors: string[] = [], warnings: string[] = [];
  const fail = (code: string, msg: string) => errors.push(`${code}: ${msg}`);
  const text = (name: string) => td.decode(files.get(name)!);

  // 1. manifest against the ratified JSON Schema (unknown top-level properties rejected by the schema)
  if (!files.has("manifest.json")) return { ok: false, errors: ["ARTIFACT_INVALID: manifest.json missing"], warnings };
  let manifest: any;
  try { manifest = JSON.parse(text("manifest.json")); } catch { return { ok: false, errors: ["ARTIFACT_INVALID: manifest is not JSON"], warnings }; }
  const major = String(manifest?.schema_version ?? "").split(".")[0];
  if (major !== SUPPORTED_MAJOR || !["1.0", "1.1"].includes(manifest?.schema_version)) return { ok: false, errors: [`UNSUPPORTED_VERSION: schema_version ${manifest?.schema_version}`], warnings };
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const schemaOk = validate(manifest as object);   // (not narrowing `manifest` itself)
  if (!schemaOk) {
    for (const e of validate.errors ?? []) fail("ARTIFACT_INVALID", `manifest${e.instancePath} ${e.message}`);
    return { ok: false, errors, warnings };
  }

  // 2. members: exactly the allowlisted files, each listed resource present with the stated SHA-256
  for (const name of files.keys()) if (!(ALLOWED_MEMBERS as readonly string[]).includes(name)) fail("ARTIFACT_INVALID", `unexpected member ${name}`);
  for (const name of ALLOWED_MEMBERS) if (!files.has(name)) fail("ARTIFACT_INVALID", `required member ${name} missing`);
  const listed = new Set<string>();
  for (const r of manifest.resources) {
    listed.add(r.path);
    if (!(ALLOWED_MEMBERS as readonly string[]).includes(r.path) || r.path === "manifest.json") { fail("ARTIFACT_INVALID", `resource ${r.path} not allowed`); continue; }
    const b = files.get(r.path);
    if (!b) { fail("ARTIFACT_INVALID", `resource ${r.path} missing`); continue; }
    if ((await sha256(b)) !== r.sha256) fail("ARTIFACT_INVALID", `hash mismatch for ${r.path}`);
  }
  for (const name of files.keys()) if (!listed.has(name) && name !== "manifest.json" && name !== "checksums.sha256") fail("ARTIFACT_INVALID", `${name} is not listed in manifest resources`);
  if (files.has("checksums.sha256")) {
    const want = new Map(text("checksums.sha256").trim().split("\n").map((l) => { const [h, ...p] = l.split("  "); return [p.join("  "), h] as [string, string]; }));
    for (const [name, b] of files) {
      if (name === "checksums.sha256") continue;
      if (want.get(name) !== (await sha256(b))) fail("ARTIFACT_INVALID", `checksums.sha256 disagrees for ${name}`);
    }
    for (const name of want.keys()) if (!files.has(name)) fail("ARTIFACT_INVALID", `checksums.sha256 lists missing ${name}`);
  } else warnings.push("checksums.sha256 absent");
  if (errors.length) return { ok: false, errors, warnings };

  // 3. geometry: public area points only
  let areas: string[] = [];
  try {
    const geo = JSON.parse(text("public_areas.geojson"));
    const exact = (o: unknown, keys: string[]) => !!o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).sort().join() === [...keys].sort().join();
    if (!exact(geo, ["type", "features"]) || geo.type !== "FeatureCollection" || !Array.isArray(geo.features)) fail("ARTIFACT_INVALID", "geometry must be exactly {type: FeatureCollection, features}");
    if (!Array.isArray(geo.features) || geo.features.length < 1 || geo.features.length > 100) fail("ARTIFACT_INVALID", "geometry size");
    const boxes: number[][] = [];
    for (const f of Array.isArray(geo.features) ? geo.features : []) {
      if (!exact(f, ["type", "properties", "geometry"]) || f.type !== "Feature") { fail("ARTIFACT_INVALID", "feature must be exactly {type, properties, geometry}"); break; }
      if (!exact(f.properties, GEO_PROPERTIES) || GEO_PROPERTIES.some((k) => typeof f.properties[k] !== "string" || !f.properties[k] || f.properties[k].length > 240)) { fail("ARTIFACT_INVALID", `feature properties must be exactly ${GEO_PROPERTIES} (non-empty strings)`); break; }
      if (GEO_PROPERTIES.some((k) => /[<>"'`&\u0000-\u001f]|^[=+@\-\t]/.test(f.properties[k]))) { fail("ARTIFACT_INVALID", "public labels may not contain markup, quotes, control or formula characters"); break; }
      try { geometryCentre(f.geometry, manifest.schema_version === "1.1"); }
      catch(e) { fail("ARTIFACT_INVALID", String(e)); break; }
      if (manifest.schema_version === "1.1") {
        const r = f.geometry.coordinates[0];
        const box = [Math.min(...r.map((p:number[])=>p[0])),Math.min(...r.map((p:number[])=>p[1])),Math.max(...r.map((p:number[])=>p[0])),Math.max(...r.map((p:number[])=>p[1]))];
        if (boxes.some(b=>Math.min(box[2],b[2])>Math.max(box[0],b[0])+1e-10 && Math.min(box[3],b[3])>Math.max(box[1],b[1])+1e-10)) fail("ARTIFACT_INVALID", "overlapping zones");
        boxes.push(box);
      }
      areas.push(f.properties.area_id);
    }
    if (new Set(areas).size !== areas.length) fail("ARTIFACT_INVALID", "duplicate area_id");
  } catch { fail("ARTIFACT_INVALID", "geometry is not JSON"); }

  // 4. statistics: exact families, exact columns, integer counts, display = max(0, signed estimate), fixed domains
  let stats: Record<string, Row[]> = {};
  try { stats = JSON.parse(text("statistics.json")); } catch { fail("ARTIFACT_INVALID", "statistics.json is not JSON"); }
  const released = Object.entries(manifest.families).filter(([, f]: any) => f.availability === "released").map(([k]) => k);
  const keys = Object.keys(stats);
  if (keys.sort().join() !== [...released].sort().join()) fail("ARTIFACT_INVALID", `statistics families ${keys} != released ${released}`);
  const clampAtZero = /clamp/i.test(manifest.postprocessing ?? "");
  const dates = datesBetween(manifest.period.start_date, manifest.period.end_date_inclusive);
  for (const fam of released) {
    const rows = stats[fam] ?? [];
    const value = VALUE_COLUMN[fam];
    if (!value) { fail("UNSUPPORTED_VERSION", `unknown family ${fam}`); continue; }
    const dims = FAMILY_DIMENSIONS[fam];
    if ((manifest.families[fam].dimensions ?? []).join() !== dims.join()) { fail("ARTIFACT_INVALID", `${fam}: dimensions must be exactly ${dims}`); continue; }
    if (manifest.families[fam].resource !== FAMILY_RESOURCE[fam]) { fail("ARTIFACT_INVALID", `${fam}: resource must be ${FAMILY_RESOURCE[fam]}`); continue; }
    const cols = [...dims, value, ...EXTRA_COLUMNS].sort().join();
    const seen = new Set<string>();
    for (const r of rows) {
      if (Object.keys(r).sort().join() !== cols) { fail("ARTIFACT_INVALID", `${fam}: unexpected columns ${Object.keys(r)}`); break; }
      const typed = dims.every((d) => (d === "hour" ? Number.isInteger(r[d]) : typeof r[d] === "string" && (r[d] as string) !== ""));
      if (!typed) { fail("ARTIFACT_INVALID", `${fam}: dimension values have the wrong type`); break; }
      const key = dims.map((d) => r[d]).join("|");
      if (seen.has(key)) { fail("ARTIFACT_INVALID", `${fam}: duplicate cell ${key}`); break; }
      seen.add(key);
      const v = r[value], n = r.noisy_value;
      if (!Number.isSafeInteger(v) || (v as number) < 0) { fail("ARTIFACT_INVALID", `${fam}: display count must be a nonnegative integer`); break; }
      if (!Number.isSafeInteger(n)) { fail("ARTIFACT_INVALID", `${fam}: noisy_value must be an integer`); break; }
      if (clampAtZero && n !== null && v !== Math.max(0, n as number)) { fail("ARTIFACT_INVALID", `${fam}: display count is not max(0, noisy_value)`); break; }
      const lo = r.noise_lower, hi = r.noise_upper;
      if ((lo === null) !== (hi === null) || (lo !== null && !((lo as number) <= (hi as number)))) { fail("ARTIFACT_INVALID", `${fam}: malformed interval`); break; }
      if (!EVIDENCE.includes(String(r.evidence_status))) { fail("ARTIFACT_INVALID", `${fam}: bad evidence_status`); break; }
    }
    if (fam === "od") {
      for (const r of rows) {
        if (!areas.includes(String(r.origin_area)) || !areas.includes(String(r.destination_area)) || !HOUR_BANDS.includes(String(r.hour_band))) { fail("DOMAIN_MISMATCH", `od cell outside the public domain`); break; }
      }
      if (rows.length !== areas.length * areas.length * HOUR_BANDS.length) fail("DOMAIN_MISMATCH", `od has ${rows.length} cells, expected ${areas.length ** 2 * HOUR_BANDS.length}`);
    }
    if (fam === "line_hour") {
      const lines = new Set(rows.map((r) => String(r.line)));
      if (rows.some((r) => !Number.isInteger(r.hour) || (r.hour as number) < 0 || (r.hour as number) > 23)) fail("DOMAIN_MISMATCH", "line_hour hour outside 0-23");
      if (rows.length !== lines.size * 24) fail("DOMAIN_MISMATCH", "line_hour is not lines x 24 hours");
    }
    if (fam === "daily") {
      if (rows.some((r) => !dates.includes(String(r.date))) || rows.length !== dates.length) fail("DOMAIN_MISMATCH", "daily dates do not cover the release period exactly");
    }
    // 5. the CSV download must carry exactly the same values as the JSON the UI reads
    const resource = FAMILY_RESOURCE[fam];
    try {
      const header = text(resource).split("\n", 1)[0].replace(/\r$/, "").split(",");
      const expectedHeader = [...dims, value, ...EXTRA_COLUMNS];
      if (header.join() !== expectedHeader.join()) { fail("ARTIFACT_INVALID", `${resource}: header must be exactly ${expectedHeader}`); continue; }
      const csv = parseCsv(text(resource));
      const asCsv = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, x]) => [k, x === null ? "" : String(x)])));
      if (csv.length !== asCsv.length || csv.some((c, i) => expectedHeader.some((k) => c[k] !== asCsv[i][k]))) fail("ARTIFACT_INVALID", `${resource} disagrees with statistics.json`);
    } catch (e) { fail("ARTIFACT_INVALID", `${resource}: ${(e as Error).message}`); }
  }
  if (manifest.fixture) warnings.push("fixture release: illustrative contract data, never performance evidence");
  return { ok: errors.length === 0, errors, warnings };
}
