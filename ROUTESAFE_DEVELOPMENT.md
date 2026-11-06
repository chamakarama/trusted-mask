# RouteSafe development (E1 checkpoint)

Use a dedicated checkout; Astra uses `/workspace/routesafe-astra`. Preserve Opus's work. This cloud task is already isolated: do not create extra worktrees unless explicitly requested. Source materials and petpilot remain unchanged.

Python 3.12, Git and Git LFS are required. From the checkout:

```sh
git lfs install --local
git lfs pull
git lfs fsck
python -m venv .venv
.venv/bin/python -m pip install -r requirements-routesafe.lock
.venv/bin/python -m pipeline.verify_source TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026
.venv/bin/python -m pytest tests/privacy -q
.venv/bin/python -m pipeline verify-release --release fixtures/protected-v1
.venv/bin/python -m pipeline.inventory --data TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data --output private/mobility-inventory.json
```

The committed experimental release already exists. Verify and reuse it for the demo; do not rerun publication to obtain different values. The publish command below documents the original operation and is only for a deliberately new, separately reviewed publication. New publication requires clean committed production code. Keep the ledger and output together. Do not delete/replace a ledger to retry or reset budget. The CLI is an operator command, not a public service. E1 policy and privacy claim remain pending cross-review.

```sh
.venv/bin/python -m pipeline publish --input TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data/mobility --ledger private/publisher.sqlite --release-id e1-aura-001 --output releases/e1-aura-001
.venv/bin/python -m pipeline verify-release --release releases/e1-aura-001
.venv/bin/python -m evaluation.e1 --input TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data/mobility --release releases/e1-aura-001 --output evidence/e1
```

Repeating publication with the same inputs/code/ledger/ID returns the same committed artifact; code/input changes conflict rather than silently redrawing. A reservation interrupted before commit stays charged. Inspect privately and retain the last known bundle; do not create a new ledger as an automatic recovery action.

The diagnostic chart is `evidence/e1/protected-output.html`. It contains only the actual protected values; `evidence/e1/e1.json` contains synthetic-only exact utility comparisons and is separate from the release. Serve only the diagnostic directory for local review (`python -m http.server 8765 --bind 127.0.0.1 --directory evidence/e1`), never the repository or source package. Opus owns the public explorer.

Issue #3 is the authoritative coordination channel. Astra reads its public HTML and writes `ops/astra:coordination/astra.md`; Opus relays those outbound messages into #3. The latest O-004/A-004 decision supersedes the initial mailbox-only arrangement. GitHub API blocked in Astra's environment, Git writes verified using the exact `.git` remote URL. Poll every five minutes while active, post every 30 minutes, push working checkpoints at least every 45 minutes. No autonomous execution occurs after the chat stops. Public deployment and submission need human authorization.

Additional evaluation commands: `python -m evaluation.inference`, `python -m evaluation.repeated`, `python -m evaluation.policy_search`, `python -m evaluation.attacks`, `python -m evaluation.benchmark`, and `python -m evaluation.identity_scope`. Use `.venv/bin/python` from this checkout. These are explicitly synthetic-only experiments. The policy search found no all-target winner. Do not interpret experimental draws as free real-data publication or reset the publisher ledger. The reviewed Opus scanner was integrated into main at 4c563b1. Publisher/privacy and frontend integration await reverse review and fixes recorded in issue #3.

Attribution: TrustED PETs Proving Ground 2026 synthetic data by Since AI ry (CC BY 4.0). Public stop placement uses GeoNames postcode centroids (CC BY 4.0), via github.com/zauberware/postal-codes-json-xml-csv; derived points are schematic. No TrustED or EU endorsement is implied.


The assembled public planner is now on this feature branch. From the checkout, use the locked frontend dependencies and copy only allowlisted releases:

```sh
npm ci --prefix web
npm run sync --prefix web -- --ref HEAD
npm test --prefix web
npm run build --prefix web
.venv/bin/python -m http.server 8768 --bind 127.0.0.1 --directory web/dist
```

Verified runtime: Node 24.22.1, npm 11.9.0. The production build runs without private publisher access and uses a local schematic SVG map, so no map tile API is required. Once loaded, filters/views work without internet; offline reload still requires a local static server and files. Free-text AI is explicitly unavailable; presets are deterministic and labelled. Do not claim a live model is connected.

Independent consumer review: all 19 tests pass with the municipality view and evidence panel at Opus 1be7d7a. The actual release, downloads, refusals, 390px layout and local-only network requests were exercised in Chromium. Review reports are under evidence/e6/. Publisher reverse review remains necessary before main integration or strengthened privacy claims.


Local packaging (does not publish, deploy, or draw noise; output must be a new path):

```sh
.venv/bin/python -m pipeline.bundle --release releases/e1-aura-001 --output runtime/e1-review.zip
.venv/bin/python -m pipeline.offline --build web/dist --output runtime/planner-review.zip
```

The offline package includes the synthetic-only evidence summary and exact verified release files. Never substitute real-data reference evidence. Extract it and follow README.txt; serve only its planner/ folder. The private operator view is separate: generate web/operator-data/mobility-inventory.json with pipeline.inventory, then run `npm run operator:data --prefix web`. From web/, build with `node_modules/.bin/vite build --config vite.operator.config.ts`; serve only web/dist-operator locally and never deploy it.
