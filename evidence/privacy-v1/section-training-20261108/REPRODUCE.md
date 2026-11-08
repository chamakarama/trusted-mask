# Reproduce the bounded base/large comparison

Use branch `codex/mask-deberta-section-20261108`. The shared root was fast-forwarded
to `aa76674`; training lives in an isolated worktree based on the requested
handoff plus that upstream main. No web UI/default model was changed.

## Data

Only `training-2026-11-07c` is the canonical pool. Its 1,316 records already
contain all three releases; authored/compiled files are two views of each row.
The frozen `section-split-20261108-v1/split-manifest.json` records source and
derived SHA256, seed, connected-group counts and exact IDs. There are **1,236
optimizer records, 80 supplemental dev records, and 50 unchanged original dev
records**. The split was frozen and committed before either full fit.

```sh
python -m mask.ml.privacy_v1.freeze_section_split \
  --source mask/ml/privacy_v1/data/training-2026-11-07c \
  --output /tmp/mask-reproduced-section-split
```

No pilot, earlier shards, development rows, adapters or fresh messages enter the
optimizer. The original-connected families remain in train; new connected groups
are reserved by seeded hash within strata. Exact/normalized sources and near
5-word-shingle duplicates are connected before selection. This is dev evidence,
not an independent human-audited final test.

## Environment and pinned sources

The cloud runs used one NVIDIA L4 each, Ubuntu 24.04 image
`pytorch-2-9-cu129-ubuntu-2404-nvidia-580-v20261029`, Python 3.12 and
`torch==2.9.1+cu129`. Run `bash mask/ml/privacy_v1/cloud/bootstrap.sh` on that image.
Other dependencies are pinned by `requirements.lock`; CPU-only environments use
the existing README installation. No version is fetched during inference.

```sh
.venv/bin/python -m mask.ml.privacy_v1.fetch_encoder \
  --track deberta-v3-base --output pretrained-base
.venv/bin/python -m mask.ml.privacy_v1.fetch_encoder \
  --track deberta-v3-large --output pretrained-large
```

Base revision: `8ccc9b6f36199bec6961081d44eb72fb3f7353f3`.
Large revision: `64a8c8eab3e352a784c658aef62be1662607476f`.

## Training-only integration gate

The first 450-step overfit exposed two failures: contextual fragments had
conflicting KEEP supervision across task pairs, and unlabelled but approved
preserved clauses lacked a preservation constraint. The corrected objective adds
fragment DROP supervision only inside explicit unnecessary training clauses and
non-deletion loss for literally preserved unlabelled clauses, never invented
essential labels. The 600-step training-only rerun passed all five raw and actual
pipeline switches, retained 41 facts and had no false clause deletion. One
business-number review exception remains counted as an identifier miss; the
existing rule was preserved. See both saved sanity reports.

```sh
HF_HUB_OFFLINE=1 TOKENIZERS_PARALLELISM=false .venv/bin/python -m mask.ml.privacy_v1.section_training \
  --split mask/ml/privacy_v1/data/section-split-20261108-v1 --base pretrained-base \
  --output runs/sanity-reproduction --smoke --epochs 1 --steps 600 --device cuda
```

## Full fits

Both start afresh from their own pinned pretrained backbone, never the overfit
checkpoint. Seed 17, two epochs, backbone LR 1e-5, heads LR 2e-4, 100 head-only
warmup updates, effective batch 8/microbatch 4, normalized alternating BIO,
action/relevance and section objectives (1:1:1), BF16 autocast with FP32 parameters
and optimizer state. Source cohorts interleave; matching task-pair clauses stay
adjacent within effective batches. See `configs/section_training_20261108.json`
and each input audit for exact objectives, sample counts and tokenizer limits.

```sh
HF_HUB_OFFLINE=1 TOKENIZERS_PARALLELISM=false .venv/bin/python -m mask.ml.privacy_v1.section_training \
  --split mask/ml/privacy_v1/data/section-split-20261108-v1 --base pretrained-base \
  --output runs/deberta-base-v1 --epochs 2 --microbatch 4 --device cuda
HF_HUB_OFFLINE=1 TOKENIZERS_PARALLELISM=false .venv/bin/python -m mask.ml.privacy_v1.section_training \
  --split mask/ml/privacy_v1/data/section-split-20261108-v1 --base pretrained-large \
  --output runs/deberta-large-v2 --epochs 2 --microbatch 4 --device cuda
```

Large's first attempt failed at the first joint-backbone update because reentrant
checkpointing cannot reuse DeBERTa's shared relative-position autograd graph.
The recorded fresh restart uses non-reentrant checkpointing; objectives and
splits are identical. No failed-run weights initialize either final model.

Every epoch saves model plus optimizer/RNG state. Final bundles are packaged and
uploaded before full evaluation. Both saved epochs are then compared on both dev
sets (one LR, no lengthy search); quality recommendations use dev only. Fresh
messages, gallery and adapter fixtures are diagnostics, not selection/training.

## Evaluation

After publishing each model, run a fresh public GitHub download through
`cloud.verify_published` with its SHA256 and archive root name. It blocks sockets
during CPU application loading/inference, exercises real `ModelService.preview`,
and checks protected text, detector output and section-score export/reload parity.
The blank-task app uses the source message as context, matching the existing UI.

```sh
HF_HUB_OFFLINE=1 TOKENIZERS_PARALLELISM=false .venv/bin/python -m mask.ml.privacy_v1.cloud.evaluate_saved \
  --run runs/deberta-base-v1 --track deberta-v3-base --output evaluation/base
HF_HUB_OFFLINE=1 TOKENIZERS_PARALLELISM=false .venv/bin/python -m mask.ml.privacy_v1.cloud.evaluate_saved \
  --run runs/deberta-large-v2 --track deberta-v3-large --output evaluation/large
```

This evaluates both checkpoints, the final goal-agnostic ablation, and final
weights under the old entity/section pipeline to separate inference changes from
weight gains. Fixed old DeBERTa, MiniLM and rules-only reports use identical rows.
Gold identities/facts/sections enter scoring only, never `protect_text`.

```sh
HF_HUB_OFFLINE=1 TOKENIZERS_PARALLELISM=false .venv/bin/python -m mask.ml.privacy_v1.section_quick_checks \
  --model runs/deberta-base-v1/deberta-v3-base \
  --inputs evidence/privacy-v1/section-training-20261108/fresh-long-inputs.json \
  --fixtures mask/ml/privacy_v1/data/training-2026-11-07/adapter-fixtures \
  --gallery demo/web-examples.json --output evaluation/base-quick --device cuda
```

Substitute the large path for large. The six gallery examples and 16 actual
CSV/XLSX fixtures are training demonstrations. Fresh inputs are synthetic agent-
authored diagnostics: 119–140 words, three distinct sources, a task swap, vague
and missing-task controls, ambiguous same-first-name people and a benign case.
Local restoration uses a labelled mock reply, not an external AI response.

## Tokenizer compatibility

`tokenizer-probe.json` records four Unicode/decimal/whitespace probes, four
distinct special markers and embedding bounds. Large and the published base have
byte-identical `tokenizer.json` files (SHA256
`002c22f589cb3156047bfc52a943a95bb89c50c66b7c39cdc8de07f250b2887e`).
The actual backend is DeBERTaV2TokenizerFast / Unigram / Metaspace, with 128,005
tokens inside 128,100 embedding rows. Transformers 4.57.6 emits an unrelated
Mistral warning for these local 4.57.6 configs because of its version guard; no
Mistral regex change was applied. The warning is preserved in logs.

```sh
HF_HUB_OFFLINE=1 python -m mask.ml.privacy_v1.cloud.tokenizer_probe \
  --bundle mask/ml/privacy_v1/artifacts/section-training-20261108/deberta-v3-large \
  --output /tmp/large-tokenizer-probe.json
```

## Dev-selected large checkpoint

Large epoch 1 loses 12 supplemental required facts, versus 24 for epoch 2,
and makes 11 false clause removals versus 16. It was therefore selected after
the bounded comparison and published in a separate `selected-epoch-1` artifact
path. Both candidates were trained for the same two-epoch maximum. No extra
training or new data was used for selection. Base selects epoch 2.

```sh
python -m mask.ml.privacy_v1.cloud.select_checkpoint \
  --run runs/deberta-large-v2 --epoch 1 --pretrained pretrained-large \
  --output runs/deberta-large-selected-epoch1
HF_HUB_OFFLINE=1 python -m mask.ml.privacy_v1.cloud.evaluate_saved \
  --run runs/deberta-large-selected-epoch1 --track deberta-v3-large \
  --output evaluation/large-selected --published-only
```

The selected artifact receives a new public-download CPU parity check and fresh,
adapter, dev, goal-agnostic and legacy-pipeline checks after publication.
The initial large final-epoch upload was delayed about 25 minutes when an
interruption terminated the local publication monitor; it was resumed and
published before evaluation. Base uploaded about 75 seconds after packaging.
