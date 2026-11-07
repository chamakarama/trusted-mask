# Canonical Mask training data, version b (7 November 2026)

Use this folder for the next training run. It is [`../training-2026-11-07/`](../training-2026-11-07/README.md) with the reviewed 300-record [placeholder-preservation campaign](../placeholder-preservation-20261107/REPORT.md) added to train. Dev is unchanged.

- `train.jsonl`: **816 compiled training records**, in 744 families. That is the earlier 516 records plus 300 new ones.
- `dev.jsonl`: **50 compiled development records**, copied byte-for-byte from `training-2026-11-07`. Never train on these.
- `train.authored.jsonl`, `dev.authored.jsonl`: the reviewed schema-v2 source annotations and provenance for the same examples. They are not additional training data.
- `*.manifest.json`: counts and file checksums, written by the repository's `merge`/`compile` tools.
- `sources.json`: source paths, checksums, per-file hashes and counts.
- Adapter fixtures are not duplicated here. Use `../training-2026-11-07/adapter-fixtures/`.

The same rules as the previous release apply:
- Do not glob JSONL files.
- Do not combine compiled and authored copies.
- Do not add the original campaign shards again.
- Do not mix in `../pilot.jsonl`.

## What the 300 added records contribute

| Category | Records |
|---|---:|
| Identity/contact/account placeholders with stable `[PERSON_n]` aliases | 180 |
| Difficult preservation (negation, corrections, quantities, conditions, several people) | 60 |
| Benign no-edit controls (public names, harmless technical identifiers) | 30 |
| Credential or confidential-business protection with surrounding context kept | 30 |

The split is 210 consumer and 90 corporate. The records are 100–157 words and contain no section DROPs. Each has an independent model review bound to its exact record hash. None has been human-audited. See the campaign `REPORT.md` for provenance, review outcomes and known limitations, including repeated fictional phone numbers and names across records.

## Checks run when building this folder

- The build script is `../placeholder-preservation-20261107/shards/3e13d8432f5f4061b4895f69cf70e7a9/build_training_07b.py`.
- `merge` passed on train (816) plus dev (50), for both the authored and the compiled copies. That covers duplicate IDs, source/group reuse across splits, normalised duplicates and five-word near-duplicate templates across splits.
- `compile` passed, and `load_records` loads 816 train and 50 dev records.
- New campaign texts have 0 exact matches with the previous 516 train texts, and the highest 5-gram Jaccard similarity is 0.017.
- The longest text plus task across all 816 records is 320 tokens with the pinned MiniLM tokenizer, against a 512 limit. The DeBERTa tokenizer was not checked.
- Train action counts are KEEP 850, ALIAS 1,912, PLACEHOLDER 1,222, DROP 131 and GENERALISE 6. The new records add no DROP or GENERALISE, so those actions are relatively rarer than in the previous release.

These checks do not prove semantic perfection or any privacy guarantee.

## Train and evaluate

Run from the repository root, as in the previous release, but pass this folder's files explicitly:

```sh
python -m mask.ml.privacy_v1.train --track encoder-b --data mask/ml/privacy_v1/data/training-2026-11-07b/train.jsonl --base .cache/privacy-v1/minilm --device cuda --epochs 1 --output mask/ml/privacy_v1/artifacts/encoder-b-reviewed-v2
python -m mask.ml.privacy_v1.evaluate --model mask/ml/privacy_v1/artifacts/encoder-b-reviewed-v2 --data mask/ml/privacy_v1/data/training-2026-11-07b/dev.jsonl --device cuda --output evidence/privacy-v1/encoder-b-reviewed-v2-dev.json
```

`experiment.py` and `tests/test_training_campaign.py` are still pinned to `training-2026-11-07` (exactly 516 train records). The published bundles and evidence describe that earlier file. Point those scripts at this folder only in a deliberate, versioned change. Use new artifact paths for every experiment, and compare against the 516-record models on the same dev set.
