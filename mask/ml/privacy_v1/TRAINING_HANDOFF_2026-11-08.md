# Compute handoff: learn context-dependent removal without losing placeholders

Work from `codex/training-handoff-20261108`. It combines upstream `main` at `2ce7a94` with the section proposal/audit tools and this data review. Use an isolated branch; preserve teammates' UI changes and existing demo weights. This is an implementation-and-training task: the dedicated section head is not implemented yet.

## Data and objective

Use only `mask/ml/privacy_v1/data/training-2026-11-07c/`:

- `train.jsonl`: **1,316 records**, already containing 516 old + 300 placeholder-preservation + 500 section-removal examples.
- `train.authored.jsonl`: the corresponding reviewed source annotations, needed for section targets and entity identity evaluation; not additional examples.
- `dev.jsonl` / `dev.authored.jsonl`: the same original **50 dev records**, evaluation only.

Do not glob JSONL files, concatenate earlier releases or campaign shards, mix in pilot data, or count authored and compiled copies twice. The 800 new records have passed model review and structural validation, not exhaustive human review.

Expected SHA256:

```text
train.jsonl          3787b15a4594ae9a023a49480d3ec76d41c410301e9ea0da18c5c8e6e3b7b226
train.authored.jsonl 39ac0e6b3dd3e4af8da5d9838ca5ac5e49e85fd68a659ba85d3b0c621c97e4c9
dev.jsonl            f9ad0954b8904e8d8725095cfe2f409bef3992c8895bc11855ee163a1a0e857b
dev.authored.jsonl   21771b5163abea0758d5405ae9efc463bcdc98bc4edaa932cf74e4dba1616436
```

The goal is useful protected messages: `[PERSON_1]` substitutions with stable identity, preservation of relevant claims/qualifiers, and removal of complete sensitive sections when unnecessary for the intended task. Useful context wins over aggressive deletion. KEEP for a section still allows masking identifiers inside it. Explicit task, vague task and missing task must all behave sensibly.

## 1. Freeze a meaningful evaluation split before fitting

The old dev has only nine DROP targets and messages of 56–67 words. Keep it byte-for-byte as a regression set. Before training, deterministically reserve approximately 10% of **new** family groups as a supplemental dev set, stratified across task pairs, placeholder preservation, relevant-sensitive, benign and vague-task controls. Use all connected family/source/persona/template groups as a unit, including exact/near-duplicate sources; both members of each task pair must stay together. Do not select holdouts by model performance.

Write derived train/dev files, IDs, seed, counts and hashes to a new versioned folder under `mask/ml/privacy_v1/data/`. Revalidate compiled and authored copies together. Do not alter the canonical release. The 1,316 records are the available training pool; report the actual smaller optimizer count after this reservation. No optimizer input may contain either dev set. Existing demo examples are training demonstrations, not held-out evidence. Reserve an independent final test if available; otherwise state clearly that reported selection results are dev results.

## 2. Make the pipeline consume the new supervision

Read `SECTION_REMOVAL.md`, `sections.py`, `section_audit.py`, `encoder.py`, `engine.py`, and `evidence/privacy-v1/data-review-2026-11-08/README.md`.

- `experiment.py` is hard-coded to the old directory, hashes and 516 count. Add a versioned/configurable experiment path with explicit split manifests and hashes. Preserve the old reproducible experiment; do not simply delete its assertions.
- Add a dedicated task-conditioned section-relevance head: essential / unnecessary / uncertain. Input should include the intended task and full source with the candidate clause marked. Use the same offsets/units during training and inference. Keep the entity BIO detector and entity action head.
- Derive section targets from the **entire selected training subset**, including old and placeholder data, using `section_targets(..., "clause-probe-v1")`. The full pool has 5,397 essential, 678 unnecessary, 138 uncertain and 3,783 unlabelled clause units. Unlabelled is not a negative class. Campaign-only target exports are incomplete for this run. Keep preservation controls in training; use their approved unchanged behavior without pretending every unlabelled clause is an explicit relevance annotation.
- Clause units expose a label switch in all 200 new task pairs; whole paragraphs expose one in only 98. Do not restrict training to whole paragraphs. Recheck token lengths with actual markers and the chosen tokenizer; never silently truncate the target or task.
- Normalize losses and balance task/cohort sampling so thousands of section jobs do not swamp entity detection or alias supervision. Keep the paired tasks together for sampling and diagnostics. A short frozen-backbone head warm-up followed by conservative joint fine-tuning is a reasonable starting experiment; compare measured results. Freezing old heads alone does not prevent shared-backbone regressions.
- Wire the new head into an explicitly versioned inference mode. Log raw section predictions and final edit/gate decisions separately. Do not bypass coherence/boundary/uncertainty safeguards just to improve deletion counts. Do not feed gold required facts, gold entity IDs or gold section categories into production inference.

Two integration mismatches need explicit treatment:

1. **Relevance is not disclosure permission.** There are 83 essential PLACEHOLDER targets outside the DIRECT labels. `engine._decision` currently converts essential predictions to KEEP. Separate relevance needed for deletion from action needed for value substitution, preserving direct-identifier protection and reporting ambiguous cases. Do not relabel these targets to make the current shortcut look correct.
2. **Stable aliases need identity resolution.** 323 records use multiple name forms for one person. The runtime currently keys aliases by exact text; a detector/action model alone cannot learn the missing link. Evaluate full/short-name consistency with authored entity IDs as gold only. If adding a resolver, use conservative unambiguous links and test distinct people sharing a first name. Never merge ambiguous identities blindly. Report remaining limitations, including local restoration behavior.

Before a full cloud run, overfit a small **training-only** subset of task pairs and preservation controls. Verify raw section predictions respond correctly to the task, retained sections still mask names, and the deployed edit path actually performs the intended deletion. If this fails, fix the objective/integration before scaling compute. Unit tests should cover these material behavior changes.

## 3. Train and compare

Train **both DeBERTa-v3-base and DeBERTa-v3-large** using the same frozen splits, objectives and evaluation. Both runs are required; the user has confirmed that training is fast and compute is available. Verify the shared pipeline on base first, then run concurrently if resources permit. Pin pretrained revisions, dependency versions and seeds. Give large its own truthful model identifier and compatible loader/bundle support; do not save it under the base track. Starting both from their pinned pretrained checkpoints gives the cleaner model-size comparison. Keep current trained DeBERTa and MiniLM checkpoints as fixed baselines; another custom-model run is lower priority.

Use a small, bounded schedule with early stopping; for example a few epochs and one or two conservative encoder learning rates, with separately recorded new-head settings. Tune on dev only. Record source/family sampling, loss weights, precision and actual optimizer counts. If the base pipeline has not passed its sanity check, an expensive large run is premature.

Do not choose by token accuracy or the number of DROP predictions alone. Select for useful end-to-end behavior. Never interpret softmax scores as calibrated privacy guarantees.

## 4. Evaluate and deliver

Compare fixed current DeBERTa, rules-only, the new base, and new large, using identical pipeline settings where possible. Include a goal-agnostic ablation of each new model. Separate weight gains from changes to inference/gates. Reuse `evidence/privacy-v1/intended-task-v1/` diagnostics and add the newly held-out task pairs.

Report on each dev set separately:

- Direct identifier misses and false masking; placeholder/alias correctness, repeated-name consistency and erroneous identity merges.
- Required-fact retention, especially negation, conditions, corrections and numbers. Inspect every false deletion and any increased identifier leakage.
- Whole-section DROP precision/recall and false deletion rate on relevant-sensitive, vague and benign controls.
- **Correct task-conditioned switches**: the specific gold section must stay for the relevant task and disappear for the irrelevant task, with identities protected in both. Merely changing output is not success.
- Explicit vs generic vs missing intended task; raw classifier scores vs final gate outcomes; honest examples of remaining failures.
- Representative 100–180 word messages and actual CSV adapter fixtures. Pasted CSV-like text is not proof of spreadsheet support. Any spreadsheet claim needs parse/transform/export round-trip verification.

Use dev results to set a deletion threshold that improves correct removals without new required-fact losses or identifier leakage on these finite checks; if that trade-off fails, retain the old demo default and report it. This is a prototype acceptance gate, not a general privacy guarantee.

Publish configs, split manifests, training commands, metrics and original/protected examples under a fresh evidence directory. Include a concise base-versus-large comparison, chosen checkpoint and known limitations. Save the selected bundles with tokenizer/config, section head, model architecture/version, pinned source revision, license/provenance and SHA256 manifest. Verify the real application loader and CPU inference from the published bundle; report approximate memory and cold/warm latency on a 100-word example. Preserve old bundles for rollback.

Immediately after each model finishes and its checkpoint is saved, push its downloadable weights through the repository's existing Git LFS/bundle mechanism, with checksums and extraction/loading instructions. Do not wait for the other model or full evaluation. Mark evaluation status accurately and update it after testing. Commit code, data split manifests and reports as they become available. A private cloud-bucket-only path is not a completed handoff. Do not overwrite teammates' UI work or silently switch the live demo model. Provide the branch, artifact locations and exact integration command when finished.

## Overnight delivery target

Aim for a usable handoff by 06:00 Helsinki time on 8 November. After each upload, verify download and loading through the real application loader, run a CPU smoke test, inspect a few 100–180 word messages and matched task pairs, and run both frozen dev sets. Check aliases, local restoration where supported, useful-fact retention, vague/no-edit controls, and actual section deletion. Provide exact demo launch commands for both models and three tested examples with real outputs. Preserve current demo weights as a fallback and report unfinished work plainly.
