# RouteSafe web: public planner explorer + private operator workbench

**Public planner (`index.html`).** A static site that reads only allowlisted, hash-verified release files from `public/releases/<id>/`. It has no backend, cannot query private data, and never draws new noise. Every release is validated in the browser (`src/contract/validate.ts`) before anything is shown; a refused release is never displayed.

**Private operator workbench (`operator.html`).** A separate entry point with its own git-ignored static folder, `operator-public/`. It shows the scanner inventory next to the approved handling policy and the release policy. It is never part of the public build.

```bash
npm ci
npm run sync            # copy allowlisted release files + schema + evidence summary from HEAD (main has the reviewed release)
npm test                # contract validator, adversarial review cases, derived views
npm run dev             # public planner on http://localhost:5173
npm run build           # type-check, build dist/, then check the public build boundary (allowlist + private-data shapes)

# operator workbench (local only)
# from the REPOSITORY ROOT (pipeline/ must be importable), in the Python env from requirements-routesafe.lock:
#   python -m pipeline.inventory --data TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data --output web/operator-data/mobility-inventory.json
# then, in web/:
npm run operator:data   # assemble operator-public/
npm run operator        # http://localhost:5174/operator.html
```

To read another commit's release: `npm run sync -- --ref <git ref>`.

Views:
- **Corridors:** a schematic map with a stated centre-enlarged warp, a shortlist per time band, and a 21-area / 6-municipality derived toggle.
- **Lines by hour**, **Daily taps**.
- **What was shared?**: purpose, tables, protection, limitations and downloads.
- **Evidence:** the synthetic benchmark, clearly bannered.

The bounded assistant validates a typed intent and answers deterministically with numbered evidence. Without a model it uses presets and says so.
