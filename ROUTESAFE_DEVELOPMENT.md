# RouteSafe development (reviewed integration)

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

The committed experimental release already exists. Verify and reuse it for the demo; do not rerun publication to obtain different values. The publish command below documents the original operation and is only for a deliberately new, separately reviewed publication. New publication requires clean committed production code. Keep the ledger and output together. Do not delete/replace a ledger to retry or reset budget. The CLI is an operator command, not a public service. Opus executed the critical privacy tests in O-011; the immutable E1 manifest retains its original pending_review marker. This is not final utility-policy acceptance or certification.

```sh
.venv/bin/python -m pipeline publish --input TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data/mobility --ledger private/publisher.sqlite --release-id e1-aura-001 --output releases/e1-aura-001
.venv/bin/python -m pipeline verify-release --release releases/e1-aura-001
.venv/bin/python -m evaluation.e1 --input TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data/mobility --release releases/e1-aura-001 --output evidence/e1
```

Repeating publication with the same inputs/code/ledger/ID returns the same committed artifact; code/input changes conflict rather than silently redrawing. A reservation interrupted before commit stays charged. Inspect privately and retain the last known bundle; do not create a new ledger as an automatic recovery action.

The diagnostic chart is `evidence/e1/protected-output.html`. It contains only the actual protected values; `evidence/e1/e1.json` contains synthetic-only exact utility comparisons and is separate from the release. Serve only the diagnostic directory for local review (`python -m http.server 8765 --bind 127.0.0.1 --directory evidence/e1`), never the repository or source package. Opus owns the public explorer.

Issue #3 is the authoritative coordination channel. Astra reads its public HTML and writes `ops/astra:coordination/astra.md`; Opus relays those outbound messages into #3. The latest O-004/A-004 decision supersedes the initial mailbox-only arrangement. GitHub API blocked in Astra's environment, Git writes verified using the exact `.git` remote URL. Poll every five minutes while active, post every 30 minutes, push working checkpoints at least every 45 minutes. No autonomous execution occurs after the chat stops. Public deployment and submission need human authorization.

Additional evaluation commands: `python -m evaluation.inference`, `python -m evaluation.repeated`, `python -m evaluation.policy_search`, `python -m evaluation.attacks`, `python -m evaluation.benchmark`, and `python -m evaluation.identity_scope`. Use `.venv/bin/python` from this checkout. These are explicitly synthetic-only experiments. The policy search found no all-target winner. Do not interpret experimental draws as free real-data publication or reset the publisher ledger. The reviewed Opus scanner was integrated into main at 4c563b1. Executable reverse privacy review is complete (O-011); current integration decisions and consumer wording fixes are recorded in issue #3.

Attribution: TrustED PETs Proving Ground 2026 synthetic data by Since AI ry (CC BY 4.0). Public stop placement uses GeoNames postcode centroids (CC BY 4.0), via github.com/zauberware/postal-codes-json-xml-csv; derived points are schematic. No TrustED or EU endorsement is implied.


The assembled public planner and private publisher were integrated into main at b223859 after reciprocal review. From the checkout, use the locked frontend dependencies and copy only allowlisted releases:

```sh
npm ci --prefix web --cache /tmp/routesafe-npm-cache
npm run sync --prefix web -- --ref HEAD
npm test --prefix web
npm run build --prefix web
.venv/bin/python -m http.server 8768 --bind 127.0.0.1 --directory web/dist
```

Verified runtime: Node 24.22.1, npm 11.9.0. The production build runs without private publisher access. It offers an optional street map and a local schematic SVG fallback; append `?map=schematic` for an immediate offline view. Once loaded, filters/views work without internet; offline reload still requires a local static server and files. Presets are deterministic. An optional local model proxy translates free-text questions into validated intents; all factual answers come from the release. Without that separately configured proxy the UI reports AI offline. No API key is needed to try the planner. Astra verified model boundaries with mocks, not paid calls; Opus reported four live functional checks in O-012 using the human-authorised local configuration. This is not an accuracy evaluation.

Independent consumer review: all 20 frontend tests pass at Opus dae86c5, integrated in b223859. The actual release, downloads, refusals, 390px layout and automatic offline fallback were exercised in Chromium. Adversarial checks confirm HTML-bearing labels are refused, model notes cannot become factual output, and stale release responses cannot replace the selected release. These checks also pass against the integrated production build. Review reports are under evidence/e6/. Opus independently passed the 30 privacy tests at 1b84370; subsequent local coverage has 33 privacy tests plus 10 scanner tests. Review is recorded separately from immutable release metadata.


Local packaging (does not publish, deploy, or draw noise; output must be a new path):

```sh
.venv/bin/python -m pipeline.bundle --release releases/e1-aura-001 --output runtime/e1-review.zip
.venv/bin/python -m pipeline.offline --build web/dist --output runtime/planner-review.zip
```

The offline package includes the synthetic-only evidence summary and exact verified release files. Never substitute real-data reference evidence. Extract it and follow README.txt; serve only its planner/ folder. The private operator view is separate: generate web/operator-data/mobility-inventory.json with pipeline.inventory, then run `npm run operator:data --prefix web`. From web/, build with `node_modules/.bin/vite build --config vite.operator.config.ts`; serve only web/dist-operator locally and never deploy it.


## Quick local preview without Python

Use a separate folder to preserve any active builder checkout. This pinned version includes the reviewed fixed-domain noise ranges, synthetic membership evidence, assistant cancellation on newer actions and default-HEAD release sync:

```sh
git clone https://github.com/Chintufp/Since-AI-hackathon---WAWS.git routesafe-reviewed-ui
cd routesafe-reviewed-ui
git checkout 89d7152
npm ci --prefix web
npm run sync --prefix web -- --ref HEAD
npm run dev --prefix web -- --host 127.0.0.1 --port 5175
```

Open the address printed by Vite on that same machine, adding `?map=schematic` if offline. Select `e1-aura-001`. The morning shortlist should show 5491 / 4565 / 4183; the Evidence view must also show the failed area-level error target. This requires Node/npm and Git, but no publisher, Python, model key, or new release. The optional proxy's default origin list does not include port 5175, so use deterministic presets in this isolated preview. No public URL has been deployed.

The cloud's `/home/agent/.npm` cache is unwritable; the explicit `/tmp/routesafe-npm-cache` option above fixes that without disabling integrity checks. On Windows use its normal writable npm cache. Python executable paths there are `.venv/Scripts/python.exe` instead of `.venv/bin/python`.

Reviewed evidence integration at 89d7152 passed 44 Python tests, 25 frontend tests, TypeScript/Vite/public boundary checks, 145 browser filter comparisons and both assistant/release race regressions. O-015 accepts the fixed-pair synthetic membership diagnostic. Its AUC is .569–.603 for three selected profiles; this is not a universal privacy guarantee. OD display intervals use a fixed 571 radius across 2,205 cells, around signed counts with endpoints clamped at zero. The immutable release itself still has null intervals.
