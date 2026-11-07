# RouteSafe planner and private data-owner workflow

The planner is a static recipient application. The owner workbench is a separate local Python service. Only verified release bundles cross that boundary. Both entries use the same seven-step story described in [the redesign plan](../planning/PLANNER_WORKFLOW_REDESIGN.md).

## Run the complete local slice

Use Python 3.12 and a Node version supported by the pinned package lock. From the repository root:

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements-routesafe.lock
npm --prefix web ci
npm --prefix web run sync
npm --prefix web run build
npm --prefix web run build:operator
```

Run these in separate terminals, both from the repository root:

```bash
.venv/bin/python -m http.server 8791 --bind 127.0.0.1 --directory web/dist
.venv/bin/python -m pipeline.workflow
```

Open **http://127.0.0.1:8792/operator.html**. Use the exact loopback hostname; the private service rejects other Host/Origin combinations. Select Aura Transit, validate, review field handling, select the supported purpose, verify the existing protected artifact, inspect its measured limits, acknowledge exploratory use, then prepare the package and open the planner. The benchmark path reuses `e1-aura-001`; it does not draw fresh noise.

The public planner is **http://127.0.0.1:8791/**. It starts with a city map, time bands and trip starts/destinations. Select an area, open its connections, compare the daily profile, then save/export a shortlist. The original benchmark has public area **points**, so it remains honestly displayed as area markers. The bundled `city-turku-v1` release is the default: 25 shaded artificial grid zones, plus a **Travel flows** layer of schematic zone-to-zone connections. It does not measure street congestion.

Do not expose the repository through a development server. The commands above serve only `web/dist` publicly and `web/dist-operator` privately. Vite development commands are for trusted local development, not recipient sharing. The operator build has no copied public directory.

## Connect the independent synthetic generator

Start with its output in `private/city-v1/`, then restart the private service with:

```bash
.venv/bin/python -m pipeline.workflow --city-input private/city-v1
```

Required files:

- `taps.csv`: `card_id,ts,stop_id,line,fare_product` using the existing mobility adapter.
- `stops.csv`: `stop_id,area,municipality,lat,lon,lines`; every stop lies within its declared public zone.
- `public-zones.geojson`: Exactly 25 frozen 5×5, non-overlapping, axis-aligned rectangles in lon/lat for the city contract. Each feature has exactly `area_id,name,municipality,source`. No holes, arbitrary geometry fields or private-derived boundaries. Target scenario: 25 fixed artificial Turku grid zones, never presented as official neighbourhoods.
- `metadata.json`: the native PR #12 generator record, checked without rewriting it. Required provenance includes `dataset_class: team-generated-synthetic`, `generator_version`, `population_seed`, `generator_source_sha256`, canonical `configuration` and `configuration_sha256`, `period` with `start/end/timezone`, `geography_provenance.id: turku-analysis-grid-v1`, and file hashes/sizes for the three production input files. The publisher verifies those hashes and copies only a five-field public provenance summary into the city manifest.

Generate the frozen full demo with `python -m simulation.generate --config simulation/config/turku-grid-v1.json --seed 20251106 --cards 20000 --output simulation/private/turku-grid-v1-seed-20251106-cards-20000`, then use that directory for `--city-input`. Keep its canonical configuration and metadata unchanged. Truth stays in a separate `truth/` directory: it is never scanned, imported into the publisher or copied to the recipient. Raw generator outputs and truth remain git-ignored. See [simulation/README.md](../simulation/README.md) for the six declared populations and reproduction checks.

The service snapshots every top-level CSV inspected by the scanner, plus city geography/metadata. Review and evaluation are tied to that fingerprint and the candidate manifest hash. Changes invalidate downstream steps. For the unchanged demo inputs, the service verifies the committed release receipt and reuses `releases/city-turku-v1`; fresh workbenches do not draw new noise. The original publication used clean committed source `2403621` and OpenDP 0.16.0, with one committed reservation in `private/workflow-review/city-ledger.sqlite`. A new publication requires clean committed production code and accounting review; retries reuse its exact artifact. Do not change runtime/ledger directories to reset spent budget. A failed reservation requires accounting review, not a redraw.

The city artifact lives in `private/workflow/candidate/city-turku-v1`. Sharing verifies the accepted artifact, builds/verifies a deterministic ZIP, atomically stages it, and copies only the nine contract files to the public build. No website is deployed. The service is a single-user local demo, not authentication, organisational approval or a hosted service.

## Verify

```bash
.venv/bin/python -m pytest -q tests/privacy tests/workflow tests/simulation petpilot/tests
npm --prefix web test
npm --prefix web run build
npm --prefix web run build:operator
npm --prefix web audit
```

The two schemas are `contracts/manifest.schema.json` (1.0 points) and `contracts/manifest-city.schema.json` (1.1 strict rectangles). Browser and Python verifiers independently check shapes, domains, CSV/JSON agreement and hashes. Schema 1.1 does not widen the statistical families or change the privacy unit, caps or epsilon split.

Known product limits: external basemap tiles require network access; the area list remains usable on tile failure. The map renderer is loaded separately but remains a large chunk. Bounds are conservative, noise-only intervals around capped counts. Generated travel cannot establish real-city demand. City evaluation is complete and fails the broad utility target: 31.2% OD WAPE, with 0/600 distribution simulations meeting 20%. See `evidence/workflow-city/README.md`. Unfamiliar-user usability and fuller mobile/accessibility checks remain open. The optional AI tool is omitted from the core planner flow; legacy source remains available in the repository.
