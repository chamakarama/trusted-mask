// Copy allowlisted protected release files into web/public/releases/<id>/ for the static explorer.
// Verifies every file against the release manifest's SHA-256 before copying. Never copies anything else.
//
// usage: node scripts/sync-release.mjs [--ref <git ref>] [release-path ...]
//   default ref: HEAD (the reviewed release is on main since b223859; pass --ref to read another commit)
//   default releases: releases/e1-aura-001 fixtures/protected-v1
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const out = resolve(here, "..", "public");
const args = process.argv.slice(2);
let ref = "HEAD";
const paths = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--ref") ref = args[++i];
  else paths.push(args[i]);
}
if (!paths.length) {
  paths.push("releases/e1-aura-001", "fixtures/protected-v1");
  try { execFileSync("git",["cat-file","-e",`${ref}:releases/city-turku-v1/manifest.json`],{cwd:repo,stdio:"ignore"}); paths.push("releases/city-turku-v1"); } catch { /* Older refs have the original benchmark only. */ }
}

// Exactly the members INTERFACES.md lists for a release directory; nothing else is ever copied.
const ALLOWED = ["manifest.json", "definitions.json", "public_areas.geojson", "od_matrix.csv", "line_hour.csv",
  "daily.csv", "statistics.json", "README.txt", "checksums.sha256"];

const show = (p) => execFileSync("git", ["show", `${ref}:${p}`], { cwd: repo, maxBuffer: 1 << 28 });
const sha = (b) => createHash("sha256").update(b).digest("hex");

const index = [];
for (const rel of paths) {
  const manifestBytes = show(`${rel}/manifest.json`);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const id = manifest.release_id;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error(`unsafe release id ${id}`);
  const dest = join(out, "releases", id);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const r of manifest.resources) {
    if (!ALLOWED.includes(r.path)) throw new Error(`ARTIFACT_INVALID: ${r.path} is not an allowlisted member`);
    const b = show(`${rel}/${r.path}`);
    if (sha(b) !== r.sha256) throw new Error(`ARTIFACT_INVALID: hash mismatch for ${id}/${r.path}`);
    writeFileSync(join(dest, r.path), b);
  }
  writeFileSync(join(dest, "manifest.json"), manifestBytes);
  writeFileSync(join(dest, "checksums.sha256"), show(`${rel}/checksums.sha256`));
  index.push({ release_id: id, fixture: manifest.fixture, data_class: manifest.data_class,
    guarantee_status: manifest.privacy?.guarantee_status, created_at: manifest.created_at });
  console.log(`synced ${id} (${manifest.resources.length + 2} files) from ${ref}:${rel}`);
}
// The one reviewed, synthetic-only evidence file the public UI may read (INTERFACES.md §7); never the evaluation dir.
try {
  const ev = show("evidence/evidence-summary.json");
  JSON.parse(ev.toString("utf8"));
  mkdirSync(join(out, "evidence"), { recursive: true });
  writeFileSync(join(out, "evidence", "evidence-summary.json"), ev);
  console.log("synced evidence/evidence-summary.json");
} catch { console.log("no evidence/evidence-summary.json at this ref (evidence view will say so)"); }
try {
  const summary=show("evidence/workflow-city/public-summary.json");
  JSON.parse(summary.toString("utf8"));mkdirSync(join(out,"evidence"),{recursive:true});
  writeFileSync(join(out,"evidence","city-summary.json"),summary);
} catch { /* City evidence is absent from older refs. */ }
mkdirSync(join(out, "contract"), { recursive: true });
for (const name of ["manifest.schema.json", "manifest-city.schema.json"]) {
  try { writeFileSync(join(out,"contract",name),show(`contracts/${name}`)); }
  catch (error) { if(name === "manifest.schema.json") throw error; }
}
// real releases first, fixtures last
index.sort((a, b) => Number(a.fixture) - Number(b.fixture) || a.release_id.localeCompare(b.release_id));
writeFileSync(join(out, "releases", "index.json"), JSON.stringify({ source_ref: ref, releases: index }, null, 2) + "\n");
console.log(`wrote public/releases/index.json (${index.length} releases) and public/contract/manifest.schema.json`);
