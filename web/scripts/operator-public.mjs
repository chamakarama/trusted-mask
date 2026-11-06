// Assemble the PRIVATE operator workbench's static folder (operator-public/, git-ignored).
// usage: node scripts/operator-public.mjs --inventory <inventory.json produced by Astra's adapter>
//   e.g. python -m pipeline.inventory --data TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data --output web/operator-data/mobility-inventory.json
// Copies the inventory plus the PUBLIC release manifests (already synced into public/releases by sync-release.mjs).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const inv = resolve(web, args[args.indexOf("--inventory") + 1] ?? "operator-data/mobility-inventory.json");
const out = join(web, "operator-public");
const parsed = JSON.parse(readFileSync(inv, "utf8"));
if (parsed.inventory_schema_version !== "1.0" || !Array.isArray(parsed.fields)) throw new Error("not an inventory 1.0 envelope");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "releases"), { recursive: true });
copyFileSync(inv, join(out, "inventory.json"));
const pub = join(web, "public", "releases");
if (existsSync(join(pub, "index.json"))) {
  copyFileSync(join(pub, "index.json"), join(out, "releases", "index.json"));
  for (const id of readdirSync(pub)) {
    if (existsSync(join(pub, id, "manifest.json"))) {
      mkdirSync(join(out, "releases", id), { recursive: true });
      copyFileSync(join(pub, id, "manifest.json"), join(out, "releases", id, "manifest.json"));
    }
  }
}
writeFileSync(join(out, "README.txt"), "PRIVATE operator workbench data. Never deploy. Never copy into web/public.\n");
console.log(`operator-public/ ready: inventory (${parsed.fields.length} fields) + release manifests`);
