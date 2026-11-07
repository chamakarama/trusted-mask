# Mask ML: learned recipe selector

The learned task is **goal-conditioned protection-recipe selection**. For each decision unit (a column, a linked
column group, or a span label inside a text column) and a structured goal, the selector ranks the valid candidate
recipes with a softmax over logits, masking invalid candidates, and abstains when none is valid. The app side is
`src/core/selector/features.ts` (feature spec, see `FEATURES.md`) and `src/core/selector/learned.ts`
(`createLearnedSelector(artifact)`); the policy selector (`policy.ts`) is the fixed baseline.

Everything runs on a plain CPU. A full run (tasks, export, training both models) takes seconds; no GPU is needed.

## Where targets come from

Two label sources, kept apart with provenance (`LabelRecord.validation.checks.source`):

1. **Benchmark-derived** (`source: "benchmark"`, primary). Several candidate complete plans per (dataset, scenario) are
   executed and run through the supplied pets-eval attacks, residual checks, text leakage and the scenario's utility
   tasks by the benchmark adapter (separate owner). It writes one `BenchmarkReport` (`src/contracts/benchmark.ts`) per
   executed plan plus the plan (Proposal JSON) to `ml/bench/results/<dataset>/<scenario>/`.
   `scripts/labels/select_targets.ts` applies the **predeclared** constraints in `ml/CONSTRAINTS.json` (per trust level:
   no retained direct identifiers outside internal use, no hard-label text leakage, linkage re-identification at or
   below the threshold, every required utility task answerable), ranks qualifying plans by mean relevant utility, and
   writes per-unit targets that **retain the surrounding plan**: `chosen` from the best plan, `acceptable` from other
   qualifying plans whose choice differs, plus `planHash`, `planContext` (every unit's choice), the report id and every
   test's status and metrics. A missing, `unsupported` or `failed` test never satisfies a constraint. If no plan
   qualifies, an explicit `_FAILURE.json` is written; no success is invented. A benchmark target is `weak` when any
   constraint-covering test of its plan was `failed` or `unsupported`.
2. **Agent annotations** (`source: "annotation"`). Annotation and challenger agents label tasks with the prompts in
   `ml/labels/`. These are candidate supervision: weak unless a challenger agrees or a human approves.

Status vocabulary everywhere: `evaluated` / `not_applicable` / `unsupported` / `failed`.

Training weights: benchmark target 1.0 (0.5 if weak); annotation with challenger agreement or human approval 1.0,
unreviewed 0.6, challenger disagreement 0.3, human rejected 0 (dropped). A record's weight is shared across its goal
variants (paraphrases are not independent examples).

## Splits (frozen)

`ml/SPLITS.json`, by source group (dataset): train = health, mobility, smart_city, energy, finance, cyber; val =
education, public_admin; test = customer_service (held-out domain). Never edit it; its sha256 is recorded in
`ml/data/meta.json` and the artifact. Test examples are never used for training, early stopping, temperature fitting or
tuning; the held-out comparison in `report.md` uses the test split only.

## Pipeline

All TypeScript steps: `cd mask && npx vite-node scripts/labels/<step>.ts`. Python: `python3 -I ml/<script>.py` (numpy only,
see `requirements.txt`; if numpy is missing: `python3 -m venv ml/.venv && ml/.venv/bin/pip install -r ml/requirements.txt`
and use `ml/.venv/bin/python -I`).

| Step | Command | Output |
|---|---|---|
| 1. Tasks | `make_tasks.ts [--dataset health] [--limit 10]` | `ml/labels/tasks/**` (one per unit × scenario), `INDEX.json`, `ml/labels/BATCHES.md`, `ml/labels/goals.json` (canonical goal + 2 paraphrase variants per scenario, with embeddings), stats cache `ml/cache/stats/` |
| 2a. Benchmark targets | `select_targets.ts [--dataset ..] [--scenario ..]` | `ml/labels/bench_targets/**`, `SUMMARY.json` |
| 2b. Agent annotation | see below | `ml/labels/annotations/**`, `ml/labels/challenges/**` |
| 3. Validate and merge | `validate.ts [--audit-sample 40]` | `ml/labels/records.jsonl`, `SUMMARY.json`, `AUDIT_SAMPLE.json` |
| 4. Features | `export_features.ts [--no-variants]` | `ml/data/examples.jsonl`, `classes.json`, `meta.json` |
| 5. Policy baseline | `export_policy_baseline.ts` | `ml/data/policy_baseline.jsonl` |
| 6. Train | `python3 -I ml/train.py [--hidden 0] [--l2 1e-3] [--epochs 800] [--lr 0.05] [--seed 0] [--config cfg.json]` | `ml/runs/<run-id>/model.json`, `metrics.json`, `report.md` |
| 7. Re-evaluate | `python3 -I ml/evaluate.py --model ml/runs/<id>/model.json` | metrics on the current `ml/data` |

Small subset first: `make_tasks.ts --dataset health,education,customer_service --limit 10`, annotate those, then steps
3–6 with `train.py --limit 200 --epochs 100`. `train.py` options: `--hidden N` (one-hidden-layer MLP; evaluated for
comparison only, because the v1 `ModelArtifact` is linear and no `model.json` is written), `--ablate-goal` (goal-agnostic
model), `--no-embedding`, `--no-compare` (skip the automatic goal-agnostic comparison).

Cloud: copy the repo (with the challenge package next to `mask/`), `npm ci`, then run the same commands; a small CPU
instance is enough. Copy back `ml/runs/<run-id>/` only.

`ml/labels/tasks/`, `ml/data/`, `ml/cache/` and `ml/runs/` are git-ignored and regenerated deterministically;
`goals.json`, annotations, challenges, reviews and bench targets are the files to share.

## Annotating a batch (teammates)

`ml/labels/BATCHES.md` assigns one batch per dataset: Team A = health, finance, cyber, mobility; Team B = smart_city,
energy, education, public_admin; customer_service is the held-out TEST domain, annotated **last** and never used for
training or tuning.

1. Run `make_tasks.ts` (or `--dataset <yours>`); tasks are at `ml/labels/tasks/<dataset>/<scenario>/*.json`.
2. Annotator agent: `ml/labels/PROMPT_ANNOTATOR.md` + one task JSON → save to `ml/labels/annotations/<dataset>/<scenario>/<same file name>.json`.
3. Challenger agent (different model or fresh session): `ml/labels/PROMPT_CHALLENGER.md` + task + annotation →
   `ml/labels/challenges/<same path>`.
4. Run `validate.ts`; fix every `INVALID` file it lists (unknown/invalid keys, schema errors).

## Review protocol

1. **Programmatic validation** (`validate.ts`): schema, task id, chosen/acceptable must be valid candidates; benchmark
   targets must match a task's valid candidates.
2. **Challenger**: status `agreement` / `disagreement` (a triage signal, not validation).
3. **Human audit**: `validate.ts --audit-sample N` writes a stratified sample (per dataset × status, all disagreements).
   For each item write `ml/labels/reviews/<same path>.json`:
   `{"taskId", "status": "human_approved" | "human_rejected", "reviewer": "<name>", "notes": "...", "chosen"?: {"key"}, "acceptable"?: [{"key"}]}`
   (an approval with `chosen` replaces the annotator's choice). Re-run `validate.ts`.

Record status fields: `reviewer.status` ∈ unreviewed, agreement, disagreement, human_approved, human_rejected; `weak`;
`validation.checks.source`, `planHash`, `planContext`, `benchmark`.

## Reporting

`report.md` separates: the **held-out comparison on the test split** (learned vs fixed policy vs goal-agnostic vs
class prior); agreement **by label source** (agent teacher agreement vs benchmark-target agreement); validation
(tuning) results; per-dataset/scenario/unit-kind breakdowns; recipe confusion; ECE; abstention; goal sensitivity (how
often the choice for the same unit changes with the scenario). Teacher agreement is not a privacy or utility outcome:
outcomes of the learned selector's own plans come from running its proposals through the benchmark adapter.

## Handoff artifact

`ml/runs/<run-id>/model.json` conforms to `src/contracts/model.ts` (`ModelArtifact`): weights (classes × features) and
bias, feature names and `FEATURE_SPEC_VERSION`, embedding model/dims (or null), class → recipe/params mapping,
temperature calibration (fitted on val), training provenance (code revision, data hash, split hash, config, example
counts, environment) and evaluation (held-out test metrics, baselines, notes). Ship it with `metrics.json` and
`report.md`. The app rejects artifacts whose registry or feature-spec version differs.

## Not done yet

- No real annotations or benchmark results exist; all numbers so far come from synthetic smoke fixtures.
- Labels are not yet executed/evaluated per annotation (`validation.executed` is false for agent labels).
