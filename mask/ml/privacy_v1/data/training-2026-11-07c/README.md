# Canonical Mask training data, version c (8 November 2026)

Use this folder for the next training run that should learn task-dependent section removal. It is [`../training-2026-11-07b/`](../training-2026-11-07b/README.md) (516 original + 300 placeholder-preservation records) with the reviewed 500-record [section-removal campaign](../section-removal-20261107-vr/REPORT.md) added to train. Dev is unchanged.

- `train.jsonl`: **1,316 compiled training records** in 1,044 families: 816 from version b plus 500 new ones.
- `dev.jsonl`: **50 compiled development records**, copied byte-for-byte from `training-2026-11-07b` (and therefore from `training-2026-11-07`). Never train on these.
- `train.authored.jsonl`, `dev.authored.jsonl`: the reviewed schema-v2 source annotations and provenance for the same examples. They are not additional training data.
- `*.manifest.json`: counts and file checksums written by the repository's `merge`/`compile` tools.
- `sources.json`: source paths, checksums, counts and token checks.

The same rules as the previous releases apply: do not glob JSONL files, do not combine compiled and authored copies, do not add campaign shards again, and do not mix in `../pilot.jsonl`.

## What the 500 added records contribute

| Slice | Records |
|---|---:|
| Same-source, two-task pairs: a complete clause/paragraph is essential KEEP for one task and unnecessary DROP for the other | 400 (200 pairs) |
| Relevant-sensitive controls (useful health/money facts kept, identities protected) | 50 |
| Benign no-edit controls | 25 |
| Vague-task controls (uncertain stays uncertain) | 25 |

300 distinct sources, 46–198 words. Section DROP labels: FINANCIAL 117, HEALTH 102, EMPLOYMENT 50, FAMILY 25. Each record has an independent model review bound to its exact hash; none is human-audited. Clause- and paragraph-mode section-target exports are in the campaign folder; the present trainer does not consume them automatically.

## Checks run when building this folder

- Build script: `../section-removal-20261107-vr/build_training_07c.py` (same procedure as version b's script).
- `merge` passed on train (1,316) plus dev (50) for both the authored and compiled copies: duplicate IDs, source/group reuse across splits, normalised duplicates and near-duplicate templates across splits. Check outputs are in `../section-removal-20261107-vr/integration-checks/`.
- `compile` passed; `load_records` loads 1,316 train and 50 dev records.
- Longest text plus task: 320 tokens with the pinned MiniLM tokenizer and 325 with the reviewed DeBERTa tokenizer, against a 512 limit.
- Train action counts: KEEP 1,575, ALIAS 3,031, PLACEHOLDER 1,743, DROP 425, GENERALISE 6. DROP is now about three times as common as in version b.

These checks do not prove semantic perfection or any privacy guarantee.

## Train and evaluate

Run from the repository root and pass this folder's files explicitly, for example for DeBERTa:

```sh
python -m mask.ml.privacy_v1.train --track encoder-b --data mask/ml/privacy_v1/data/training-2026-11-07c/train.jsonl --base <pinned base model> --device cuda --epochs 1 --output mask/ml/privacy_v1/artifacts/<new-artifact-name>
python -m mask.ml.privacy_v1.evaluate --model mask/ml/privacy_v1/artifacts/<new-artifact-name> --data mask/ml/privacy_v1/data/training-2026-11-07c/dev.jsonl --device cuda --output evidence/privacy-v1/<new-artifact-name>-dev.json
```

`experiment.py` and `tests/test_training_campaign.py` are still pinned to `training-2026-11-07`. Use new artifact paths for every experiment and compare against the earlier models on the same dev set.
