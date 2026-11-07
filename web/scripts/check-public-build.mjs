// E6 boundary check for the PUBLIC planner build (dist/): only allowlisted files, no private data shapes.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const MEMBERS = new Set(["manifest.json", "definitions.json", "public_areas.geojson", "od_matrix.csv", "line_hour.csv", "daily.csv", "statistics.json", "README.txt", "checksums.sha256"]);
const ok = (p) => p === "index.html" || /^assets\/[\w.-]+\.(js|css|woff2?)$/.test(p) || /^contract\/manifest(?:-city)?\.schema\.json$/.test(p) ||
  (p === "evidence/evidence-summary.json" || p === "evidence/city-summary.json" || p === "evidence/kupittaa-summary.json" || p === "evidence/kupittaa-day-summary.json") || p === "releases/index.json" || (/^releases\/[a-z0-9][a-z0-9-]{0,63}\/([\w.]+)$/.test(p) && MEMBERS.has(p.split("/")[2]));
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const bad = [], leaks = [];
// shapes that must never appear in public files: travel-card ids, HETUs, e-mails of people, registry/scanner fields
// Negative numeric constants (e.g. Number.MIN_SAFE_INTEGER in MapLibre) are not card identifiers.
const PATTERNS = [/(?<![\d.\-])9\d{15}(?!\d)/, /\b\d{6}[-+A]\d{3}[0-9A-Y]\b/, /[\w.+-]+@[\w-]+\.example\b/, /holder_(name|email|phone)/, /"rule_ids"/, /inventory_schema_version/];
for (const f of walk(dist)) {
  const p = relative(dist, f).replaceAll("\\", "/");
  if (!ok(p)) bad.push(p);
  if (/\.(json|csv|txt|html|js)$/.test(p)) {
    const t = readFileSync(f, "utf8");
    for (const rx of PATTERNS) if (rx.test(t)) leaks.push(`${p}: matches ${rx}`);
  }
}
if (bad.length || leaks.length) {
  console.error("PUBLIC BUILD BOUNDARY FAILED");
  for (const b of bad) console.error("  not allowlisted:", b);
  for (const l of leaks) console.error("  private-data shape:", l);
  process.exit(1);
}
console.log(`public build OK: ${walk(dist).length} files, all allowlisted, no private-data shapes`);
