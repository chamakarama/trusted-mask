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

Publish one experimental supplied-synthetic release. Keep the ledger and output together. Do not delete/replace a ledger to retry or reset budget. The CLI is an operator command, not a public service. E1 policy and privacy claim remain pending cross-review.

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
