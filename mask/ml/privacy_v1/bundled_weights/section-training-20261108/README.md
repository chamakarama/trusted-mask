# DeBERTa section-head bundles — 8 November 2026

Base and large were both trained and evaluated. Only the selected base archive
(epoch 2, called Mask2 in the project README) is included in this repository; the
large checkpoints are too big to include, and their SHA256 values are recorded in
`STATUS.json` for publication and evaluation status. A manifest's `pending`
status describes the instant of packaging; subsequent tests are recorded in
STATUS and the linked evidence without modifying the immutable archive.

These are review-required prototypes. The prior `training-2026-11-07` bundles are
preserved. The loader in this repository (`mask/ml/privacy_v1/bundle.py`) supports
DeBERTa and the section head.

From the repository root, with Git LFS installed:

```sh
git lfs pull --include='mask/ml/privacy_v1/bundled_weights/section-training-20261108/*.tar.gz'
(cd mask/ml/privacy_v1/bundled_weights/section-training-20261108 && shasum -a 256 -c SHA256SUMS)
mkdir -p mask/ml/privacy_v1/artifacts/section-training-20261108
for archive in mask/ml/privacy_v1/bundled_weights/section-training-20261108/*.tar.gz; do
  tar xzf "$archive" -C mask/ml/privacy_v1/artifacts/section-training-20261108
done
```

The archives each contain a directory named after the model, with safetensors
(including the section head), tokenizer, backbone configuration, source revision,
runtime configuration, architecture/version metadata, checksums and upstream
license/model card. No Hugging Face download is needed to load them.

Install the existing Python environment if needed:

```sh
python3.12 -m venv mask/ml/privacy_v1/.venv
mask/ml/privacy_v1/.venv/bin/python -m pip install -r mask/ml/privacy_v1/requirements.lock
```

Run it explicitly through the existing demo:

```sh
HF_HUB_OFFLINE=1 TOKENIZERS_PARALLELISM=false mask/ml/privacy_v1/.venv/bin/python -m mask.web.server \
  --model mask/ml/privacy_v1/artifacts/section-training-20261108/deberta-v3-base --port 8787
```

Open http://127.0.0.1:8787. Preview is local. Existing provider configuration
controls any separately approved AI request. These commands do not change the
default model. Old fallback:

```sh
HF_HUB_OFFLINE=1 mask/ml/privacy_v1/.venv/bin/python -m mask.web.server \
  --model mask/ml/privacy_v1/artifacts/reviewed-2026-11-07/deberta-v3-base --port 8787
```

Training and evaluation evidence:
`evidence/privacy-v1/section-training-20261108/` at the repository root.
