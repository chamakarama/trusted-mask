# Mask — current implementation brief

Updated 7 November 2026. **Immediate priority: readable, useful output for approximately 100-word English messages within the user's under-19-hour demo deadline.** Speed and model size are secondary for this milestone. Follow the immediate demo profile in [LOCAL_MODEL_PLAN.md](LOCAL_MODEL_PLAN.md); the full local-model release remains the longer-term objective.

**Current status:** both pilot models, the corrected edit pipeline, optional-intended-use message preview, file adapters and data-authoring tools are implemented. The pilot bundles are shared through Git LFS. Start with [reviewed synthetic data production](../mask/ml/privacy_v1/annotation/TRAINING_DATA_PROMPT.md), then train/evaluate both tracks. See [the current report](../evidence/privacy-v1/pipeline-v2/REPORT.md). Preserve both demo UIs (`mask/src/` and `mask/web/`) and their assets. The broader sequence below describes the full objective, including gates that remain unfinished.

## Latest demo requirements

- Preserve useful wording and relationships, replacing private names with stable numbered references. The user's expected transformation is `My partner, Mateo Silva, recorded my blood pressure.` → `My partner, [PERSON_1], recorded my blood pressure.` Do not remove the person reference as the default name treatment.
- Prioritise ALIAS/PLACEHOLDER inside useful text, and support coherent whole-clause/section DROP when that content is genuinely unnecessary. Do not delete a section containing required facts, replace necessary prose with fragments, or treat every sensitive category as removable. Add labels for these choices; the pilot has no trained DROP examples yet.
- Similar-to-training scenarios are acceptable for the rehearsed demo. Keep them separate from unfamiliar-message checks and independent evaluation. Include finance, work, support and everyday messages alongside health. Record failures and show review states; no claim of universal generalisation.
- Future provider requests should include the fixed note: `Privacy note: Labels such as [PERSON_1] represent redacted references. You may use these labels verbatim in your reply. Do not guess or invent the hidden values.` Keep application instructions separate from source content, and keep original values/maps local.
- Fix boundaries/execution, build reviewed synthetic training data, improve the encoder first, rerun the custom comparison, then connect a minimal review UI. Defer model compression and strict latency/size targets for this demo. This priority does not make either existing pilot a validated release or authorise a hidden remote rewriting dependency.

## Deliverable

For the immediate milestone, deliver the improved local message path, clean review interface and honest rehearsal/robustness results. The full release still requires an offline model bundle, tokenizer/policy/rule assets, a local Python API and CLI, message and CSV/XLSX adapters, a human-audited independent evaluation report and a measured local runtime profile. A demo alone does not complete that full release.

English is the first supported language. Finnish and Swedish follow only after separate training/evaluation. Development happens mainly on this computer. Cloud training compute is available when useful; the plan does not depend on three computers or teammates.

## Required two-option experiment

Build and fairly compare both options. **A: our custom Mask classifier**, trained from scratch on explicit text/character features, detected categories, schema/row context, goal features and interactions; improve the original approach rather than merely rerun the old institutional model. **B: a pretrained encoder with our task heads**, initially the available 33M English `microsoft/MiniLM-L12-H384-uncased`, fine-tuned for detection, relevance and treatment. MiniLM is a challenger, not the predetermined architecture.

Detect private spans independently of the goal, then choose task-conditioned treatments. A uses rule candidates plus custom features, adding a lightweight feature-based learned tagger when detection errors justify it; B can share encoder weights across detection/action passes. Preserve structured-identifier rules, action definitions, policy masks and deterministic execution in both. An arbitrary goal cannot override invariants.

Use identical approved source data, grouped splits, context information, labels, adapters and release gates. Separate detector performance, treatment accuracy on common spans, and real end-to-end privacy/fidelity. Give each track a bounded documented tuning budget, compare at matched automatic coverage, and measure its complete deployed footprint and latency. A cannot silently use a pretrained encoder while being labelled custom-only.

Choose using validation data and a predeclared quality/size/speed rule. Prefer smaller/faster when it meets the gates and acceptable quality margins; use the encoder if its measured quality improvement justifies the cost. If neither qualifies, fix the bottleneck rather than declare a winner. Freeze both finalists and the validation-selected release candidate before final test; do not select or tune on that test. Retain both result sets and the selection rationale.

Actions are keep, drop, stable alias, supported role substitution, faithful generalisation and typed placeholder. Uncertainty or unsupported cases return review instead of ready output. No invented clinical facts, ages, dates or places. Preserve necessary numbers, units, negation, timing and relationships. The product minimises unnecessary disclosure, not every sensitive fact; list intentionally retained sensitive information.

The Token Company is inspiration for a small classifier and deterministic middleware, not a dependency or a source of Mask performance claims. Compression labels and privacy labels solve different problems.

## Scope and sequence

1. Freeze the common policy, label/action schemas, source-family splits, supported identifiers, comparison rule and release criteria. Measure this computer's hardware/runtime.
2. Build both pilot loops: shared pilot data → train custom A / fine-tune encoder B → export → offline text protection with identical source offsets and deterministic edits.
3. Add CSV and ordinary values-only XLSX using the same model. Supply schema/row context, scan all exported cells, preserve useful types/structure, and reconstruct a new protected file. Explicitly reject formulas, macros, encryption and unsupported embedded content in v1. Never copy hidden raw metadata into outputs.
4. Scale the same reviewed data for both; train A locally and B on cloud if useful. Diagnose detection versus treatment failures with development/validation only. Keep related sources in one split.
5. Package A's features/weights and B's ONNX model, testing applicable quantisation and prediction/edit parity. Calibrate both deployed runtimes, select on validation, freeze finalists and run the independent comparison. Count every feature/encoder/rule asset in footprint measurements.
6. Deliver the chosen model/API/files and A/B report only when the shared release gates pass for its stated scope. Trying both is required; shipping both is not. A failed gate means another documented iteration, not a ready claim.

## Reuse and coordination

Preserve the existing app, design, detector/executor infrastructure, legacy labels/models, frozen institutional splits and benchmark history. Use the proposed new `mask/ml/privacy_v1/` namespace. Old institutional annotations are auxiliary material only when compatible and reviewed; they are not prompt-specific validation. Existing challenge-data lexicons make those data unsuitable as fresh blind detector evidence.

Agents can generate synthetic cases and propose/challenge annotations, but agent agreement is not gold. Audit disagreements and stratified agreements, and independently adjudicate the release set. Make false negatives, over-removal, contextual necessity, numerical/factual corruption, chunk-boundary misses, rare spreadsheet leaks and multi-turn accumulation visible in evaluation.

Keep development on this computer with explicit file ownership. Cloud jobs should use pinned code/data/config manifests, synthetic or authorised data, resumable checkpoints and bounded runs. No foundation-model training or new distributed infrastructure is required.

## Defer

Defer broad UI redesign, third-party browser extensions, extra institutional scenarios, broad Team B label completion, multilingual claims, OCR/PDF and unconstrained generative rewriting. A minimal demo review UI is now in scope. Prepare the receiving-AI instruction contract without treating provider integration as already implemented. The demo profile above takes precedence over the longer-term sequence where they differ.

Read the full model plan for data volumes, metrics, proposed acceptance gates, source links, model packaging and phase exit conditions. All proposed paths/commands must be implemented and verified before documenting them as runnable. Retain actual failures and limits; do not lower gates after seeing test results or count review-only outcomes as successful automatic protection.
