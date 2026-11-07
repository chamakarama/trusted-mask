# Mask benchmark adapter (private)

Runs complete Mask plans through the supplied `pets-eval` toolkit (attacker knowledge, attacks, text gold spans,
utility tasks) and writes one `BenchmarkReport` (`src/contracts/benchmark.ts`) per executed plan. Development
self-assessment on synthetic data: **not** the official judging score and **not** a probability of anonymity.
Toolkit facts: `bench/TOOLKIT_MAP.md`.

## Loop

candidate complete plans → execute (Node, real Mask engine) → private staging + rowmaps → pets-eval attacks, text
leakage, residual checks, utility → `ml/bench/results/<dataset>/<scenario>/<planHash>.json` (+ `.plan.json`) →
`scripts/labels/select_targets.ts` applies `ml/CONSTRAINTS.json` → review → targets → `ml/train.py`.

Note: `customer_service` is the frozen TEST domain in `ml/SPLITS.json`; its results are held-out evaluation evidence,
not training targets. `--split` is checked against SPLITS.json and recorded in every report.

## Commands (from `mask/`)

```sh
# one plan (+ benchmark with --bench)
npx vite-node scripts/bench/run_plan.ts --dataset customer_service --scenario CS-S1 --out bench/runs/x \
  [--detections mask|catalog] [--plan policy|learned:<model.json>|overrides:<file.json>] [--variant leaky|destructive] \
  [--limit-rows 3000] [--seed 0] [--omit-rowmap turns] [--shuffle] [--bench]
python3 -I bench/run_bench.py --run bench/runs/x [--scenario CS-S1] [--max-adversary 3000]

# candidate set -> ml/bench/results (one python subprocess per plan; skips existing planHashes unless --force)
npx vite-node scripts/bench/candidates.ts --dataset customer_service --scenario CS-S1 [--only policy,leaky,destructive,subst,learned] [--k 12] [--model ml/runs/<id>/model.json]
npx vite-node scripts/bench/candidates.ts --dataset customer_service --scenario CS-S1 --only policy,leaky,destructive --limit-rows 3000   # quick smoke; results to bench/runs/results-subset

npx vite-node scripts/bench/validate_report.ts ml/bench/results/customer_service/CS-S1/*[0-9a-f].json   # zod contract check
python3 -I bench/tests/test_status_mapping.py      # status mapping on a saved scorecard fixture
npx vitest run scripts/bench                        # staging writer, report validation, e2e smoke (~40 s; skipped without python3+pandas)
```

The toolkit is run as `cd <PKG> && PYTHONPATH=<PKG>/toolkit python3 -m pets_eval ...`, always with `--root <PKG>`;
the exact commands are in each report's `toolkit.commandLog`. Commands: `scorecard --original --protected
<run>/staging/<ds> --scenario --root --out <run>/out --max-adversary 3000`; `text --gold ... --rowmap ...` per released
text column with public gold (cross-check of the scorecard's free-text numbers); `check <run>/export/<ds>`.

## Plans

- `policy`: the deterministic `PolicySelector` plan (the app's fallback).
- `leaky` positive control (`controls: ["retained_identifiers"]`): every direct-identifier column and PERSON/PHONE/EMAIL
  spans kept, applied as overrides although the candidates are invalid (proposal warnings record this).
- `destructive` control (`controls: ["utility_destroying"]`): every non-key column, text column and span class removed.
- substitutions: for up to K units ranked by risk relevance (attack-spec columns, direct ids, QIs, sensitive, identifying
  spans, keys, text) the policy choice is swapped for each other valid candidate, everything else unchanged.
- `learned:<model.json>`: the learned selector's plan.
- `--omit-rowmap <table>`: representation-failure control (same planHash as its base plan; keep it out of results).

Detection modes: `mask` (end to end: Mask field + span detectors, default) or `catalog` (field roles from
`field_catalog.csv` = privileged organiser labels + Mask span detector; a transformation-only comparison). Recorded as
`detectionMode` in `executed.json` and the report notes. Benchmark runs derive the keyed-token/surrogate key from
`--seed` (`sha256('mask-bench/session-key/v1/<seed>')`), so a run is reproducible for a seed; the app uses a random
per-session key.

## Run folder (PRIVATE — never shared)

```
<run>/plan.json executed.json goal.json report.json
<run>/staging/<ds>/<table>.csv          original file/column names, RFC 4180, NA-looking placeholders rewritten '[NA]'
<run>/staging/<ds>/rowmap_<table>.csv   protected_row,original_record_id  (record key of the ORIGINAL row; 0-based row
                                        of the written CSV after any filtering/reordering; never blank; withheld tables omitted)
<run>/original/<ds>/                    only with --limit-rows: the same relational subset of the originals
<run>/out/                              scorecard.json/html, text_*.json (RAW leaked values), check.json, commands.log
<run>/export/<ds>/                      the shareable tables only — exactly the app download bytes
```

Isolation: rowmaps, truth/, adversary/, holdout/, pii_spans, `scorecard.json/html` (absolute paths; hash-attack
examples) and `pets-eval text` output (raw examples) stay in `<run>` and never enter `export/`. `run_bench.py` refuses to
report if `export/` holds anything but table CSVs, runs `check` on `export/` (not staging), and writes `--out` outside
staging. Reports carry metrics only, plus paths and sha256 of the private artifacts. `bench/runs/` is git-ignored.

## Tests and status rules

`evaluated` / `not_applicable` / `unsupported` / `failed`. Missing, skipped, failed or misclassified tests are never 0.

| id | kind | evaluated when | otherwise |
|---|---|---|---|
| `representation.<t>` | representation | `row_alignment == 'row map'` and rowmap rows = protected rows | withheld → n/a; anything else → **failed**, and k_anonymity / linkage / text_leakage / aggregate of that table → unsupported |
| `direct_identifiers_retained.<t>` | residual_check | table released with catalogued direct ids (max share of original values kept) | no catalogued direct id / withheld → n/a; table error → failed |
| `hashed_ids_reversible.<t>` | attack | a hex-digest column was found and attacked | none found → n/a |
| `k_anonymity.<t>` | residual_check | share k<5 over released catalogued QIs (+ k<2/k<10, min/median k, original) | no QI released → n/a |
| `linkage.<t>.<adversary>` | attack | attack ran with ≥1 spec column: reidentification_rate, attribute_inference_success with base_rate and advantage_over_base_rate, baseline_original; denominators n_targets_in_data, n_adversary_rows_tested | no spec → `linkage.<t>.no_spec` n/a; every spec column removed (toolkit stub `qis_used == []`, reports 0.0) → **unsupported**; `error:` → failed |
| `text_leakage.<t>.<c>` | text_leakage | public-gold rows via rowmap: leakage_rate, identifying_leakage_rate, hard_label_leaks, `per_label.<L>` (n per label in denominators, n_values) | column withheld → n/a |
| `text_leakage.<t>.<c>.eval_split` | text_leakage | never | **unsupported**: eval-split gold is organiser-held |
| `utility.<TASK>` | utility | score + exposed detail (f1/rho original vs protected; tvd/mape/mae/retained) | `not answerable` → unsupported (reason lists missing columns; the toolkit's own mean counts a required one as 0); error → failed |
| `residual_check.<t>`, `residual_check.export` | residual_check | regex counts, informational, never scored | |
| `membership_inference.<t>` | attack | — | only appears when the toolkit fell back to the synthetic branch → unsupported |
| `aggregate_score` | aggregate_score | privacy/utility/composite + every component | any representation failure → unsupported |

`covers` uses the threat ids of `src/core/evaluate` (direct_reidentification, quasi_identifier_linkage,
attribute_inference_external, free_text_identifier_leakage, undetected_spoken_identifiers, token_reversal,
membership_inference). Report notes list what is NOT covered: cross-table key/timestamp linkage, trajectories,
eval-split text, organiser-held hidden attackers, membership inference for row-level releases, linkage on tables without
an attack spec. `ml/CONSTRAINTS.json` (constraints-2) matches `direct_identifiers_retained.*`, `text_leakage.<t>.<c>` and
`linkage.*` exactly.

## Representation hazard

Without a rowmap (or original record ids) pets-eval treats a released table as synthetic: linkage, k<5 and free-text
leakage are skipped and DCR/MIA against the holdout run instead; with verbatim record keys and no rowmap it aligns by
those ids. Either way the composite changes for reasons unrelated to protection. The adapter asserts `row map` for
every released row-level table (tested with `--omit-rowmap`).

## Sampling limits (fixed in the toolkit; recorded in every report)

`--max-adversary 3000` (CS adversary 2600 rows: no sampling; seed 0), hash dictionary 300k candidates / 2M variants,
hash detection on 2000 values, regex residual scan on the first 20,000 rows, DCR 20,000 rows, MIA 5,000/side,
trajectory 1,000 users, CS-U5 20,000 original turns (random_state 7, eval split included). Text spans shorter than 3
normalised characters are untestable (all 2-digit AGE values).

`--limit-rows N` keeps the first N rows of root tables and the child rows whose foreign key points at them; the toolkit
then compares against the same subset written to `<run>/original/` (it would otherwise judge utility against the full
original). Subset numbers are not comparable with full-size runs.

## Cloud CPU instance

Copy the repo with `TRUSTED_SinceAI2026_FINAL/` next to `mask/` (or set `MASK_CHALLENGE_DIR`), `npm ci`, ensure python3
with numpy, pandas, scipy, scikit-learn (`MASK_PYTHON` selects the interpreter), then run `candidates.ts`. One plan
takes ~30 s at full customer_service size (~4 GB RAM is plenty); run scenarios as separate processes in parallel.
Copy back only `ml/bench/results/`; leave `bench/runs/` on the instance or delete it.
