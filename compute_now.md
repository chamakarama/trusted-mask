# Final compute prompt — 8 November 2026

Train and deliver BOTH DeBERTa-v3-base and DeBERTa-v3-large for Mask. Training speed is sufficient, so large is a required comparison.

Fetch `origin/codex/training-handoff-20261108` and read `mask/ml/privacy_v1/TRAINING_HANDOFF_2026-11-08.md`. Continue existing progress if already started. Work on an isolated branch and preserve teammates' UI work.

Use only `mask/ml/privacy_v1/data/training-2026-11-07c/`. Its 1,316 records already include all 516 original, 300 placeholder-preservation and 500 section-removal examples. Do not duplicate older releases or authored/compiled copies. Keep the original 50 dev records out of training and freeze the prescribed family-separated supplemental dev split before fitting. Both models use identical splits.

Update the experiment path from the old 516-record release. Implement and connect the task-conditioned section-relevance head while preserving entity detection and placeholder objectives. Verify on a small training-only sample that changing the intended task changes the correct section through the actual edit pipeline. Address the documented essential-to-KEEP shortcut and full/short-name alias consistency. Retained sections still need identifier protection. Never use gold annotations during inference or bypass safeguards merely to increase deletion.

Train BOTH base and large with the same objectives and evaluation protocol. Run concurrently if resources allow. Use a bounded schedule and correct architecture identifiers/loaders; avoid lengthy hyperparameter searches.

**Upload weights immediately:** as soon as EACH model finishes and its checkpoint is saved, push it to GitHub through the repository's Git LFS/bundle mechanism. Do not wait for the other model or full evaluation. Include tokenizer, configuration, section-head weights, architecture/version metadata, checksums and loading instructions. Preserve previous weights and mark evaluation status accurately. A private cloud-bucket link alone is insufficient.

After each upload, download/load the published bundle through the real application loader and run a CPU smoke test. Inspect a few 100–180 word messages, including a same-message/different-task pair. Check actual section removal, useful facts, repeated/full/short names, distinct people, contact details, vague tasks, benign no-edit behavior and local restoration where supported. Run the original and supplemental dev sets and report identifier misses, lost required facts and correct section removals against the current baseline.

Aim for a usable handoff by **06:00 Helsinki time, 8 November**. Push code, both model bundles, configs and concise results. Provide exact demo launch commands for either model, three tested inputs with actual outputs, and your recommended model. Report unfinished work and failures plainly; preserve the working demo model as a fallback. Do not redesign the UI or silently change its default model.
