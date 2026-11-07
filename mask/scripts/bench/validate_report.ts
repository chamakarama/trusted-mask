/**
 * Validate BenchmarkReport JSON files against the zod contract (src/contracts/benchmark.ts).
 *   npx vite-node scripts/bench/validate_report.ts <report.json> [more.json ...]
 */
import fs from "node:fs";
import { validateReport } from "./lib/validate";

const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!files.length) { console.error("usage: validate_report.ts <report.json> [...]"); process.exit(2); }
let bad = 0;
for (const f of files) {
  const r = validateReport(JSON.parse(fs.readFileSync(f, "utf8")));
  if (r.ok) console.log(`ok  ${f} (${r.report!.tests.length} tests)`);
  else { bad++; console.log(`BAD ${f}\n  ${r.errors.slice(0, 20).join("\n  ")}`); }
}
process.exit(bad ? 1 : 0);
