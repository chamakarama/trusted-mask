# Mask three-candidate training campaign

Base: `fc94f9f1f3000f22e94d07fc9990c35e4a877973`. Dedicated branch: `codex/mask-training-2026-11-07`.

Only `mask/ml/privacy_v1/data/training-2026-11-07/train.jsonl` (516 records) is used for fitting. Its companion `dev.jsonl` (50 records) is evaluation-only. `dataset.json` records exact hashes, enforced by the experiment runner alongside cross-split validation. No authored copies, shards or old pilot are training inputs.

The bounded search compares custom logistic C values 0.3/1/3 (500 iterations), and encoder learning rates 2e-5/5e-5 at epochs 1/2. Every encoder epoch is exported and evaluated; optimizer state is retained separately from inference bundles. Selection is lexicographic by unsupported count, required-removal misses, lost required facts, unnecessary edited characters, and missed DROP targets. This favors privacy over utility and does not establish production safety. Logistic regression has no learning-rate/epoch control; its appropriate regularization comparison is recorded instead.

Run `python -m mask.ml.privacy_v1.experiment --help` for per-candidate commands. `mask/ml/privacy_v1/cloud/run_campaign.sh` runs smoke tests first, both baselines, the bounded comparisons, CPU/offline export parity, gallery examples, adapters, and fresh long messages. Execute from the repository root with a `SOURCE_COMMIT` file containing the packaged source revision. Each run requires a new output directory.

DeBERTa uses revision `8ccc9b6f36199bec6961081d44eb72fb3f7353f3`. It retains the shared BIO detector, task-conditioned action/relevance heads and unchanged policy rules. The adapter grows embeddings only when required by added markers, validates marker IDs against embeddings, and trims only whitespace from SentencePiece source offsets. Fast-tokenizer offsets, all training/dev action lengths, forward inference and export compatibility are checked in smoke runs.

Fresh long diagnostics are three newly authored 112–120-word messages under two tasks each. They are never fitting or selection inputs; they are not independently audited. The six gallery examples and 16 adapter fixtures are training demonstrations. Reports preserve actual before/after outputs and expected-target mismatches. All bundles remain review-only prototypes. The live demo model is not changed.

Cloud execution uses one temporary L4 VM in the user-approved existing `hugo-infrastructure` project, named `since-ai-artem-training`, with a four-hour automatic STOP. Artifacts must be copied and verified before explicit instance deletion. Existing stopped instances are untouched. Completion results and artifact retrieval details are recorded separately when available.
