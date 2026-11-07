# Mask

**Current priority (7 November 2026):** improve the [local English privacy models](../planning/LOCAL_MODEL_PLAN.md) with reviewed training data and independent evaluation. The [message preview](web/README.md) and [Python models/API](ml/privacy_v1/README.md) are implemented; [current pilot bundles](ml/privacy_v1/MODEL_BUNDLES.md) are included through Git LFS. This table-review UI remains intact and uses its separate institutional pipeline. Provider forwarding, broad Team B annotation and CS-S2/CS-S3 expansion are deferred. The following sections document this runnable table baseline.

Purpose-aware data protection for the TrustED PETs challenge. Describe the analysis and who receives the data, import CSV tables, review exactly how each column and text span will be transformed, and export the approved result with a sanitised report. Everything runs in the browser (TypeScript, Vite, React); a Web Worker owns the session.

Baseline status 7 November 2026: the vertical slice works end to end on the supplied synthetic customer-service data with the deterministic policy selector. A learned selector exists and loads, but it has only been trained on Team A annotations (train split) with no held-out validation or test labels yet, so it has no held-out results. The benchmark adapter and full-size CS-S1 reports now exist; see `bench/README.md`. Some earlier handoff notes below are historical and do not set the current priority.

## Run

```bash
cd mask && npm install && npm run dev
```

Open http://localhost:5173, press "Try sample data" (120 synthetic conversations), type a purpose such as "An external vendor will find the main contact reasons and handle time by intent", and review. `?dev=fixture` opens a hand-written development fixture whose numbers are placeholders.

```bash
npm test          # 197 tests: contracts, detection (with gold-span measurement), execution, evaluation, export, goal, selector, pipeline
npm run typecheck
npm run build
```

## Architecture

```
import → profile/detect (core/detect) → interpret goal (core/goal) → decision units + valid candidates (core/selector)
      → rank: policy (core/selector/policy) or learned (core/selector/learned) → execute plan (core/execute)
      → evaluate (core/evaluate) → review (app) → confirm/export (core/export)
```

- `src/contracts/`: zod contracts (manifest, goal, detection, recipe, proposal, evaluation, export, benchmark, model, labels, worker protocol). Single source of truth; see `CONTRACTS.md` for ownership and rules.
- `src/core/pipeline/session.ts`: the whole pipeline over in-memory tables; `src/worker/pipeline.worker.ts` is a thin message adapter; `session.test.ts` holds the acceptance tests (goal changes, stale plan rejection, altered parameters, broken joins, unknown fields, preview/export consistency, report sanitisation).
- `src/core/registry/recipes.ts`: keep, remove, keyed token (HMAC, dataset or table scope), redact spans (typed placeholder / realistic surrogate / keep / remove per span label), coarsen time (minute to year), bin numbers, truncate postcode, merge rare categories, HETU to age band and sex. Every recipe states its limitations.
- Selection: units are columns, linked column groups (joins survive via a shared token scope) and span classes inside text columns. `candidates.ts` masks invalid candidates (executor preconditions and hard constraints from the sharing setting: e.g. a national-id span is never kept, nothing direct leaves the organisation unchanged, public releases get no pseudonymous keys). Both selectors rank only valid candidates and abstain when none is valid.
- Evaluation reports risk, utility and integrity checks separately with the status vocabulary `evaluated / not_applicable / unsupported / failed`, plus explicit threat coverage; unsupported checks are never shown as zero risk. Leakage in text is measured against Mask's own detections unless independent labels are loaded (development only).
- Export writes the exact executed tables, `mask_report.json/.md` (no raw values, token maps or keys), `mask_receipt.json` (hashes) and a zip. Confirmation approves the artifact; it is not evidence of anonymity.

## Measured so far (development, synthetic, not benchmark results)

- Span detection on the public customer-service train split: every label at or above 0.98 recall and 0.99 precision, but the lexicons are built from train-split names, so this is optimistic. Cross-domain recall on other datasets' gold: PERSON 0.997, ADDRESS 0.94, AGE 0.92, ORG 0.79, LOCATION 0.71, HEALTH 0.42. Field roles vs the catalog: 39/39 on customer_service, 415/475 across all datasets.
- Full customer-service run: profile 0.5 s, field detection 0.9 s, 140k turns of span detection about 2 to 5 s, execution of 160k rows about 1 s.
- The organiser-held eval split has never been scored. No hidden-attacker results exist.

## ML state and the handoff to the teammate's agents

Frozen split by dataset (`ml/SPLITS.json`): train = health, mobility, smart_city, energy, finance, cyber; val = education, public_admin; test = customer_service (the demo domain stays held out).

Done: 882 Team A tasks (health, finance, cyber, mobility) annotated by Sonnet and challenged by Opus (`ml/labels/annotations`, `ml/labels/challenges`), validated into `ml/labels/records.jsonl` (challenger agreement 0.94, agreement with the fixed policy 0.69). A first model trained on these only (`ml/runs/*`, copied to `public/models/selector-dev.json`) loads in the developer panel. It has no validation or test examples, so no held-out numbers.

Open for Astra / teammate agents (see `ml/README.md`, `ml/labels/BATCHES.md`, the two prompt files and `ml/labels/show_task.py`):

1. Annotate and challenge Team B batches (smart_city, energy, education, public_admin) and, last, customer_service. Save at the mirrored paths, then `npx vite-node scripts/labels/validate.ts --audit-sample 40`.
2. Human-audit the stratified sample in `ml/labels/AUDIT_SAMPLE.json` and write reviews under `ml/labels/reviews/`.
3. Run candidate plans through the benchmark adapter (`bench/README.md`, once merged) for the customer-service scenarios and `scripts/labels/select_targets.ts` to derive benchmark-qualifying targets with plan context.
4. `export_features`, `export_policy_baseline`, then `python3 -I ml/train.py`; report held-out test numbers against the fixed policy and the goal-agnostic ablation. Never tune on customer_service.

## Earlier handoff notes (historical)

- Benchmark adapter (`bench/`, `scripts/bench/`): stages executed plans privately with row maps, runs the supplied attacks, residual checks, text leakage and utility tasks, and writes `BenchmarkReport` JSON with per-test status. Includes a retained-identifier positive control, a utility-destroying control and a deliberately failed representation test.
- Interface polish: grouped metric chips, inline span-mark styling, suggestion chips that send, export-stale handling, stage timing in the developer panel.

## Design note: pasted context versus hard-coded rules

Proposed next step: let the user paste context about the data ("hospital discharge export; column `reason` is a diagnosis") and the recipient. It should be embedded and parsed into a visible, editable structured record next to the goal, with provenance, and feed two places: the field detector, as a prior that shifts role/subtype confidence on ambiguous columns (with the evidence line "you said: health data"), and the selector features, so recipe preference shifts with it. Keep a small audited set of invariants hard-coded as validity masks (never keep identifier spans for external recipients, no special-category data to a public release, no pseudonymous keys in open data). Learned weights decide preferences among valid options; they never unlock an invariant, because with a few thousand labels a model cannot be trusted to learn safety constraints, and pasted text must not be able to talk a direct identifier into "not sensitive".
