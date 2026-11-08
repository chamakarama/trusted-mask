# Mask three-candidate training campaign

> Data availability: the training and development data are not published in this repository. The commands below record what was run; the dataset hash files identify the exact data.

Base: `fc94f9f1f3000f22e94d07fc9990c35e4a877973`.

Only `mask/ml/privacy_v1/data/training-2026-11-07/train.jsonl` (516 records) is used for fitting. Its companion `dev.jsonl` (50 records) is evaluation-only. `dataset.json` records exact hashes, enforced by the experiment runner alongside cross-split validation. No authored copies, shards or old pilot are training inputs.

The bounded search compares custom logistic C values 0.3/1/3 (500 iterations), and encoder learning rates 2e-5/5e-5 at epochs 1/2. Every encoder epoch is exported and evaluated; optimizer state is retained separately from inference bundles. Selection is lexicographic by unsupported count, required-removal misses, lost required facts, unnecessary edited characters, and missed DROP targets. This favors privacy over utility and does not establish production safety. Logistic regression has no learning-rate/epoch control; its appropriate regularization comparison is recorded instead.

Run `python -m mask.ml.privacy_v1.experiment --help` for per-candidate commands. `mask/ml/privacy_v1/cloud/run_campaign.sh` runs smoke tests first, both baselines, the bounded comparisons, CPU/offline export parity, gallery examples, adapters, and fresh long messages. Execute from the repository root with a `SOURCE_COMMIT` file containing the packaged source revision. Each run requires a new output directory.

DeBERTa uses revision `8ccc9b6f36199bec6961081d44eb72fb3f7353f3`. It retains the shared BIO detector, task-conditioned action/relevance heads and unchanged policy rules. The adapter grows embeddings only when required by added markers, validates marker IDs against embeddings, and trims only whitespace from SentencePiece source offsets. Fast-tokenizer offsets, all training/dev action lengths, forward inference and export compatibility are checked in smoke runs.

Fresh long diagnostics are three newly authored 112–120-word messages under two tasks each. They are never fitting or selection inputs; they are not independently audited. The six gallery examples and 16 adapter fixtures are training demonstrations. Reports preserve actual before/after outputs and expected-target mismatches. All bundles remain review-only prototypes. The live demo model is not changed.

Cloud execution uses one temporary L4 VM in the user-approved existing `hugo-infrastructure` project, named `since-ai-artem-training`, with a four-hour automatic STOP. Artifacts must be copied and verified before explicit instance deletion. Existing stopped instances are untouched. Completion results and artifact retrieval details are recorded separately when available.

## Reproduce the executed GPU workflow

The VM image was `deeplearning-platform-release/pytorch-2-9-cu129-ubuntu-2404-nvidia-580-v20261029`, on `g2-standard-4` with one L4. It supplied Python 3.12.3 and PyTorch `2.9.1+cu129`; the cloud bootstrap preserves that CUDA build. Exact installed packages are in `measurements/environment.lock`.

From the checkout on that image:

```sh
git rev-parse HEAD > SOURCE_COMMIT
bash mask/ml/privacy_v1/cloud/bootstrap.sh
source .venv/bin/activate
bash mask/ml/privacy_v1/cloud/run_campaign.sh
bash mask/ml/privacy_v1/cloud/finalize.sh
```

The first script runs all smoke tests, full bounded grids, both baselines, and gallery/adapter/fresh diagnostics. The finalizer adds 12-case offline CPU parity and packages selected bundles. Use a fresh checkout/output path for another run: outputs deliberately refuse overwrites.

Equivalent individual comparison commands, after the corresponding smoke tests pass:

```sh
python -m mask.ml.privacy_v1.experiment --track custom-a --output out/custom-a
python -m mask.ml.privacy_v1.fetch_encoder --track encoder-b --output .cache/encoder-b
HF_HUB_OFFLINE=1 python -m mask.ml.privacy_v1.experiment --track encoder-b --base .cache/encoder-b --device cuda --epochs 2 --learning-rates 0.00002 0.00005 --output out/encoder-b
python -m mask.ml.privacy_v1.fetch_encoder --track deberta-v3-base --output .cache/deberta-v3-base
HF_HUB_OFFLINE=1 python -m mask.ml.privacy_v1.experiment --track deberta-v3-base --base .cache/deberta-v3-base --device cuda --epochs 2 --learning-rates 0.00002 0.00005 --output out/deberta-v3-base
```

For each smoke test use the same `experiment` command with `--smoke` and a distinct output directory. Custom smoke fits only the first 12 canonical training records for 30 iterations; encoder smoke performs 12 training updates. Full runs use all 516 training records. Dev never enters an optimizer. The data loader validates both splits together and enforces their recorded SHA-256 hashes.

The source for the actual custom/MiniLM runs was `739f5a7`; DeBERTa used `6067629`. Later reporting fixes record evaluation roles correctly; older generic limitation text was corrected with its prior checksum retained in `reporting_metadata_correction`, leaving metrics and predictions unchanged. The final branch includes these fixes and publication tools. Fixed seeds, image/dependencies, inputs and commands are recorded; bit-identical retraining across different hardware/library versions is not claimed.

Weights were uploaded directly from the VM using per-object resumable upload sessions. The Google account token stayed on the control machine. `storage-verification.json` records independent object-generation, size, SHA-256 metadata and server-computed MD5 verification. The evidence archive, summary and checksum list were downloaded again and hashed independently. Third-party notices accompany both encoder archives.
