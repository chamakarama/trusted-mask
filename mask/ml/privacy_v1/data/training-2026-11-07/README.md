# Canonical Mask training data — 7 November 2026

> **Superseded for new training runs by [`../training-2026-11-07b/`](../training-2026-11-07b/README.md).** That folder holds these 516 train records plus 300 reviewed placeholder-preservation records, with the same dev set. This folder stays unchanged, because the published bundles, evidence, `experiment.py` and `tests/test_training_campaign.py` refer to its exact 516-record file.

This folder consolidates the reviewed **schema-v2** campaigns available on 7 November 2026, including the exact two video messages and 20 newly authored demo-related messages.

- `train.jsonl`: **516 compiled training records**.
- `dev.jsonl`: **50 compiled development records**. Never train on these.
- `train.authored.jsonl`, `dev.authored.jsonl`: reviewed source annotations and provenance. These are the same examples, not additional training data.
- `*.manifest.json`: counts and file checksums.
- `sources.json`: source dataset paths, checksums and coverage.
- `adapter-fixtures/`: 10 earlier CSV + 5 XLSX inputs, plus the video support CSV and its expected protected output. Training-derived integration fixtures, not message records or held-out evaluation.

Do not glob JSONL files, combine compiled and authored copies, or add original shards again. Do not silently mix in `../pilot.jsonl`: it is a separate historical programmatic engineering dataset, not part of this reviewed training release. Older institutional/table-selector datasets train a different model and are also not inputs here.

## Demo use and evidence limits

`demo/web-examples.json` at repository root contains six ready-to-load gallery examples with optional intended use, source record IDs and expected targets. UI integration can load their text/task, but must run the real model; never display the annotated expected text as a model prediction. This change supplies data, not UI wiring or new model weights.

Both `demo/personal-health-message.txt` and `demo/corporate-support-message.txt` are preserved byte-for-byte inside the new source records. These and all 20 related examples are explicitly included in training. Their outputs are rehearsed/training demonstrations, not unseen generalisation evidence. The video script's browser-local processing claim still requires verification against the actual deployed implementation.

The dev set is only 50 messages of 56–67 words and is model-reviewed, not human-audited. Check fresh 100–150-word examples separately. GENERALISE remains sparsely represented. The 22 new messages are 85–135 words; their detector and task-conditioned action inputs fit the pinned MiniLM 512-token window (maximum 327 tokens in this check). Existing schema, review hashes, replay, compiler and cross-split checks pass; this does not prove semantic perfection or privacy guarantees.

## Train/evaluate

Run from repository root with a supported Python environment; follow `../../README.md` for dependency setup and pinned encoder download.

```sh
python -m mask.ml.privacy_v1.train --track custom-a --data mask/ml/privacy_v1/data/training-2026-11-07/train.jsonl --output mask/ml/privacy_v1/artifacts/custom-a-reviewed-v1
python -m mask.ml.privacy_v1.fetch_encoder --output .cache/privacy-v1/minilm
python -m mask.ml.privacy_v1.train --track encoder-b --data mask/ml/privacy_v1/data/training-2026-11-07/train.jsonl --base .cache/privacy-v1/minilm --device cuda --epochs 1 --output mask/ml/privacy_v1/artifacts/encoder-b-reviewed-v1
python -m mask.ml.privacy_v1.evaluate --model mask/ml/privacy_v1/artifacts/encoder-b-reviewed-v1 --data mask/ml/privacy_v1/data/training-2026-11-07/dev.jsonl --device cuda --output evidence/privacy-v1/encoder-b-reviewed-v1-dev.json
```

Use new versioned paths for every experiment. Compare a bounded set of epoch counts using dev performance, alongside rules-only and goal-agnostic baselines. Select on full-pipeline privacy misses and retained useful facts, not training loss alone. Verify exported bundle reload and CPU inference before replacing any demo model.
