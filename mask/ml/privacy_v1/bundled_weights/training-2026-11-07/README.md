# Reviewed training bundles — 7 November 2026

These Git LFS archives contain the three selected models trained only on the canonical 516-record training set. The 50 dev records were used for checkpoint selection, never fitting. They are byte-identical to the checksum-verified Google Cloud artifacts.

| Archive | Selected checkpoint |
|---|---|
| `custom-a.tar.gz` | C=0.3, 500 iterations |
| `encoder-b.tar.gz` | Pinned MiniLM, learning rate 5e-5, epoch 1 |
| `deberta-v3-base.tar.gz` | Pinned DeBERTa-v3-base, learning rate 2e-5, epoch 1 |

All bundles passed offline CPU inference and export/reload parity. DeBERTa is the recommended reviewed demo candidate; none reliably removes unrelated medical sections. The live demo and historical pilot models remain unchanged. See the [full comparison](../../../../../evidence/privacy-v1/training-2026-11-07/COMPARISON.md).

From the repository root on `codex/mask-training-2026-11-07`, install Git LFS and download the actual archives:

```sh
git lfs install
git lfs pull --include="mask/ml/privacy_v1/bundled_weights/training-2026-11-07/*.tar.gz"
cd mask/ml/privacy_v1/bundled_weights/training-2026-11-07
shasum -a 256 -c SHA256SUMS
mkdir -p ../../artifacts
mkdir ../../artifacts/reviewed-2026-11-07
for model in custom-a encoder-b deberta-v3-base; do
  tar xzf "$model.tar.gz" -C ../../artifacts/reviewed-2026-11-07
done
```

The extraction directory must be new. Back at the repository root, with the documented Python dependencies installed, verify all three bundle manifests:

```sh
HF_HUB_OFFLINE=1 python -c 'from pathlib import Path; from mask.ml.privacy_v1.bundle import verify; root=Path("mask/ml/privacy_v1/artifacts/reviewed-2026-11-07"); [verify(root/name) for name in ("custom-a", "encoder-b", "deberta-v3-base")]; print("All three bundle manifests verified")'
```

Use this branch's loader for DeBERTa support. Each archive contains a model directory with its original integrity manifest; encoder archives also include upstream notices under `third_party/`. A small Git LFS pointer file is not the model archive: run `git lfs pull` before extraction.
