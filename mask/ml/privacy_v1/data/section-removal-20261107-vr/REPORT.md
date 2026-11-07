# Section-removal data campaign: section-removal-20261107-vr

Synthetic English training records that teach when a complete clause or paragraph can be removed for one intended use and must be kept for another. Built from `codex/section-removal-pipeline` following `annotation/SECTION_DATA_INSTRUCTIONS.md`, `REVIEW_RUBRIC.md` and the calibration guidance in this folder. Model-reviewed only: **not human-audited, not release evidence, no accuracy or privacy guarantee.** No model was trained; no runtime, validator, UI or existing dataset was changed.

## Achieved

| | Target | Achieved |
|---|---:|---:|
| Accepted records | 500 | **500** |
| Distinct sources / families | 300 | **300** |
| Complete same-source pairs (both tasks accepted) | 200 | **200** (199 with pair notes; 1 repaired pair `dc8166…:eng-device-order-r2-*` lacks its sidecar but is verified identical-source, keep 0 / drop 1 section, both accepted) |
| Relevant-sensitive controls | 50 | **50** |
| Benign controls | 25 | **25** |
| Vague-task controls | 25 | **25** |
| Pair formats: blank-line / mixed-clause / email-log-bullet / CSV-TSV | 90 / 70 / 20 / 20 | 89 / 68 (+1 repaired pair) / 22 / 20 (from writer sidecars; format labels normalised) |
| Consumer / corporate pairs | 140 / 60 | 136 / 63 (+1 corporate repaired pair) as labelled in sidecars; a few sidecars lacked `segment`, classified from domain |
| Consumer / corporate controls | 70 / 30 | 68 / 32 (same caveat) |

- Switch quotes recorded in pair notes: **256** across 199 annotated pairs (several pairs switch more than one unit).
- Records with at least one section DROP: 251. Section labels: FINANCIAL 117, HEALTH 102, EMPLOYMENT 50, FAMILY 25 (only the four runtime section labels).
- Section-target exports (derived labels, not extra examples): clause mode essential 1,510 / unnecessary 501 / uncertain 96; paragraph mode essential 628 / unnecessary 135 / uncertain 9. Switches inside mixed paragraphs, emails, logs and table rows carry their signal in clause mode only (expected; see calibration guidance).
- Source length (words): min 46, median 124, max 198; 232 sources 100–180, 60 under 100, 8 over 180. 77% of sources are 100+ words.
- Duplicates: 0 exact text+task duplicates; 0 sources sharing any 12-word span (template-copy check).
- Review: 496 accepted on first independent review, 4 after one repair round; 4 rejected records preserved in shard `rejected-0*.jsonl` with `rejected-notes-0*.jsonl`. No self-review (every reviewer id is in a different shard from its record).
- Token fit: checked offline with the local DeBERTa tokenizer on task + text by the gate auditor (max 231 tokens on the first 50) and by writers where reported; marked-span action inputs were not tokenized. Treat full-set token fit as partially verified.
- Table gaps: 17 sidecar entries record CSV/TSV cases whose column-dependent edits the current contract cannot represent (not counted in quotas; one sidecar line is malformed JSON and is kept as-is).

## Process

1. Calibration: one writer produced 2 pairs; two independent reviewers assessed them blind, then a referee resolved rule interpretations into `calibration-guidance.md` (binding for all workers).
2. Quality gate: pack 1 (50 records: 20 pairs + 10 controls) was written, independently reviewed and audited in full (merged copy validated, compiled, replayed exactly; every switch confirmed in clause mode). Gate passed with five fixes fed to all later writers (inference-based KEEP tasks, fewer coworker-health switches, varied skeletons, invented organisation names, no reused phone numbers/IDs).
3. Scale: 18 packs of 25 records ran in three parallel workflows, each with its own writer shard, an independent reviewer shard and at most two repair rounds.
4. Coordination: explicit accepted files (see `sources.json`, with SHA-256) were validated, merged into `train.authored.jsonl`, compiled to `train.jsonl`, and exported with `section_audit` in both probe modes. `coverage.json` holds the machine-readable counts.

Identities: writers and reviewers were `claude-sonnet-5-5` subagents in separate claimed shards; calibration referee, gate auditor and coordinator were `claude-opus-5-5`.

## Paths

- `train.authored.jsonl` — 500 authored schema-v2 records (merged)
- `train.jsonl` — the same 500 records compiled for training
- `section-targets.clause.json`, `section-targets.paragraph.json` — section-target exports
- `coverage.json`, `sources.json`, `calibration-guidance.md`, this `REPORT.md`
- `shards/<uuid>/` — per-worker drafts, resolved/reviewed files, accepted and rejected records, review files, pair/control notes and table-gap sidecars (scratch folders excluded from the commit)

## Limitations

- All review is by models; no human audit. First-pass acceptance (99%) is high; reviewers worked from the calibrated rubric, but leniency cannot be ruled out without an independent audit sample.
- Consumer/corporate and format counts come from writer sidecars and are slightly off target (see table); quotas were not padded.
- The present trainer does not consume the auxiliary section-target exports automatically.
- Cross-split leakage against dev/test was not checked here (instructions leave this to the integrator before training).
- `section_audit` needed `PYTHONUTF8=1` on Windows (it writes with the platform default encoding); no code was changed.
