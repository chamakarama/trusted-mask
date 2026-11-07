# Frozen section training split, 8 November 2026

Created before fitting from only `training-2026-11-07c`: 1,236 optimizer records,
80 supplemental development records, and the original 50 development records
copied byte-for-byte. Both DeBERTa sizes must use this exact manifest.

The 80 supplemental records reserve 20 complete task pairs, 30 placeholder
records, five relevant-sensitive controls, two benign controls and three vague
controls. Family/source/persona/template links, exact and normalized sources,
and near-duplicate five-word shingles are connected before deterministic
stratified selection. Original-connected families remain in train.

Authored and compiled copies are aligned views, not extra optimizer examples.
Supplemental authored records change only split/review metadata: their original
review is preserved as `review.source_review`; the derivative is not falsely
represented as newly model-reviewed. Compiled source hashes refer to these
derivatives. Canonical source files are unchanged.

Recreate into a new directory:

```sh
python -m mask.ml.privacy_v1.freeze_section_split \
  --source mask/ml/privacy_v1/data/training-2026-11-07c \
  --output /tmp/mask-section-split-reproduction
```

`split-manifest.json` records IDs, counts, seed, strata and all source/derived
SHA-256 hashes. There is no independent human-audited final test; both held-out
sets are development evidence.
