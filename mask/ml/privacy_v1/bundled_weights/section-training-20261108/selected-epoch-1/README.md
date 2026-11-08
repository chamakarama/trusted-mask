# Selected large checkpoint: epoch 1

Epoch 1 retains more required facts than epoch 2 on frozen supplemental dev:
12 losses versus 24, with 11 versus 16 false clause removals. It is the selected
large comparison checkpoint, not an accepted replacement for the live demo.
The initial epoch-2 bundle remains in the parent directory for reproducibility.

From the repository root, download and extract this checkpoint separately:

```sh
git lfs pull --include='mask/ml/privacy_v1/bundled_weights/section-training-20261108/selected-epoch-1/*.tar.gz'
(cd mask/ml/privacy_v1/bundled_weights/section-training-20261108/selected-epoch-1 && shasum -a 256 -c SHA256SUMS)
mkdir -p mask/ml/privacy_v1/artifacts/section-training-20261108-selected-epoch-1
tar xzf mask/ml/privacy_v1/bundled_weights/section-training-20261108/selected-epoch-1/deberta-v3-large.tar.gz \
  -C mask/ml/privacy_v1/artifacts/section-training-20261108-selected-epoch-1
HF_HUB_OFFLINE=1 TOKENIZERS_PARALLELISM=false mask/ml/privacy_v1/.venv/bin/python -m mask.web.server \
  --model mask/ml/privacy_v1/artifacts/section-training-20261108-selected-epoch-1/deberta-v3-large --port 8787
```

This archive contains the complete tokenizer, source/configuration, section head,
entity heads/backbone weights, runtime metadata, licenses and integrity manifest.
No training is repeated when selecting an earlier checkpoint. Runtime threshold
remains 0.9; the two higher threshold diagnostics were run on epoch 2 for both sizes.
See the parent `STATUS.json` for post-publication validation status.
