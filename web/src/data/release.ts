// Loads one protected release from the static /releases/<id>/ directory, verifies it in the browser, and exposes a
// typed, read-only model. Nothing here can reach private data: there is no backend, only allowlisted files.
import { ALLOWED_MEMBERS, validateRelease, type Validation } from "../contract/validate";

export interface ReleaseIndexEntry { release_id: string; fixture: boolean; data_class: string; guarantee_status: string; created_at: string }
export interface Area { id: string; name: string; municipality: string; lon: number; lat: number }
export interface OdCell { origin_area: string; destination_area: string; hour_band: string; trips: number; noisy_value: number; noise_lower: number | null; noise_upper: number | null; evidence_status: string }
export interface LineHourCell { line: string; hour: number; boardings: number; noisy_value: number; noise_lower: number | null; noise_upper: number | null; evidence_status: string }
export interface DailyCell { date: string; tap_events: number; noisy_value: number; noise_lower: number | null; noise_upper: number | null; evidence_status: string }

export interface Release {
  id: string;
  manifest: any;
  definitions: Record<string, string>;
  areas: Area[];
  od: OdCell[];
  lineHour: LineHourCell[];
  daily: DailyCell[];
  validation: Validation;
  bytes: Record<string, number>;
  readme: string;
}

const base = () => import.meta.env.BASE_URL.replace(/\/$/, "");
export const releaseUrl = (id: string, file: string) => `${base()}/releases/${encodeURIComponent(id)}/${file}`;

async function sha256(b: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", b as unknown as ArrayBuffer);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return new Uint8Array(await r.arrayBuffer());
}

export async function loadIndex(): Promise<ReleaseIndexEntry[]> {
  const r = await fetch(`${base()}/releases/index.json`, { cache: "no-cache" });
  if (!r.ok) throw new Error("no release index");
  return (await r.json()).releases;
}

export class ReleaseRefused extends Error {
  constructor(public validation: Validation) { super("Release refused by the contract validator"); }
}

export async function loadRelease(id: string): Promise<Release> {
  const td = new TextDecoder();
  const manifestBytes = await fetchBytes(releaseUrl(id, "manifest.json"));
  const manifest = JSON.parse(td.decode(manifestBytes));
  const files = new Map<string, Uint8Array>([["manifest.json", manifestBytes]]);
  // fetch only members the manifest lists AND the contract allowlists
  const wanted = manifest.resources.map((r: any) => r.path).filter((p: string) => (ALLOWED_MEMBERS as readonly string[]).includes(p));
  await Promise.all([...wanted, "checksums.sha256"].map(async (p: string) => files.set(p, await fetchBytes(releaseUrl(id, p)))));
  const schema = await (await fetch(`${base()}/contract/manifest.schema.json`, { cache: "no-cache" })).json();
  const validation = await validateRelease(files, schema, sha256);
  if (!validation.ok) throw new ReleaseRefused(validation);
  const stats = JSON.parse(td.decode(files.get("statistics.json")!));
  const geo = JSON.parse(td.decode(files.get("public_areas.geojson")!));
  return {
    id,
    manifest,
    definitions: JSON.parse(td.decode(files.get("definitions.json")!)),
    areas: geo.features.map((f: any) => ({
      id: f.properties.area_id, name: f.properties.name, municipality: f.properties.municipality,
      lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
    })),
    od: stats.od ?? [],
    lineHour: stats.line_hour ?? [],
    daily: stats.daily ?? [],
    validation,
    bytes: Object.fromEntries([...files].map(([k, v]) => [k, v.byteLength])),
    readme: files.has("README.txt") ? td.decode(files.get("README.txt")!) : "",
  };
}

/** "Turku-208" -> "Turku 208" (public postcode-area label), anything else unchanged. */
export function areaLabel(id: string): string {
  const m = /^(.+)-(\d{3})$/.exec(id);
  return m ? `${m[1]} area ${m[2]}` : id;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2025-10-06" -> "6 Oct 2025" (one date style everywhere). */
export function niceDate(iso: string, withYear = true): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`;
}
