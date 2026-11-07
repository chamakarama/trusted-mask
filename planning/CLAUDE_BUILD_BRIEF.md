# Mask — implementation handoff

## Mission

Build **Mask**, a fast, clear tool that adapts data protection to the user's intended analysis. The user describes what they need, imports data, reviews the proposed transformations, and exports the confirmed result.

Our promise is: **the right protection, at the right level of detail, for the task.** The core decision is how to transform information: preserve useful structure while reducing unnecessary disclosure. The product must feel effortless, and its transformations must actually execute and be evaluated.

Treat this document as the product and delivery brief. Read [MASK_PLAN.md](MASK_PLAN.md) for technical details and [MATERIALS.md](../MATERIALS.md) for the challenge sources. Implement a working vertical slice; do not stop at another planning document or a visual mockup.

## Current repository and environment

- Repository: `/Users/markp/Code/sinceai-trusted` on the originating computer. Resolve the checkout path on other machines.
- The previous bus/transport product has been removed. Build Mask without restoring its maps, product scope or old interface.
- The original synthetic challenge package is preserved in `TRUSTED_SinceAI2026_FINAL/`. Keep these supplied materials unchanged.
- `petpilot/` is a reusable rules-based column detector. It is not a trained selector or a complete text-redaction system. See its README and regression tests.
- No Mask UI, learned method selector or end-to-end Mask export service exists yet. The existing reset contains intentional uncommitted deletions; inspect Git status and preserve them.
- We have three computers and teammate-managed Google Cloud instances available for training. Hardware, GPUs, runtime limits and budgets are not specified. Make jobs configurable and runnable on a small local subset before cloud execution. Coordinate instance use with the teammate; do not provision additional paid resources by assumption.
- The user intends to run the lead implementation in their Claude Fable 5.1 / Ultracode setup, with Opus and Sonnet agents available if needed. These are user-provided environment names, not dependencies of Mask. Use the actual available models and tools; do not assume undocumented capabilities.

## Two equally important workstreams

### A. Product experience

Build a polished white, minimalist workspace. This is a primary deliverable, not a skin to add after the model is finished.

**Desktop layout:** chat/purpose on the left, data/import/review on the right. The original request repeated “left”; this brief interprets it as a two-pane layout. Use a narrower conversation pane and a larger data workspace, with resizable proportions if practical. On small screens, stack or switch panes while preserving state.

Visual direction:

- White main surfaces, subtle off-white secondary surfaces, dark readable text, restrained borders and generous spacing.
- One restrained accent colour; muted semantic colours for transformation highlights. No dark dashboard, decorative gradients, oversized cards or visual clutter.
- Precise typography and alignment. Keep the data area dense enough to inspect real tables comfortably.
- Smooth, purposeful transitions for importing, opening details, switching original/protected views and updating proposals. Aim initially for roughly 150–250 ms transitions; respect reduced-motion preferences. Avoid layout jumps, fake progress and animations that delay work.

Interaction:

1. The left pane accepts the goal conversationally and shows a compact editable interpretation: analytical task, recipient and required detail. Ask only for missing information that changes the proposal.
2. The right pane starts as a clear drop zone/file picker. Support CSV first, including text columns and multiple related tables. Show parsing errors, file/table names and a usable preview.
3. After analysis, the same workspace becomes the review surface. Preserve context and scroll position instead of sending the user through a wizard.
4. Provide original/protected comparison, labelled colour highlights and filters for method, data type, uncertainty and items needing review. Distinguish a display filter from a transformation that removes records.
5. Selecting a changed field or span reveals what changed, why it serves the goal, alternatives and relevant evidence. Show a concise reason first; technical detail expands on demand.
6. Allow edits to supported parameters and methods, then recompute affected checks. Keep edits reversible before confirmation. Disable stale export when input, goal or plan changes.
7. One clear confirmation/export action downloads the exact reviewed artifact and a sanitised report.

Keep the private **Developer panel** collapsed by default. It should expose detections, candidate recipes and scores, parameters, relationship risks, model versions, actual evaluation results and the original content affected by redaction. This is private review content, not part of the public export. Show “model preference” separately from detection confidence and measured risk; never show a single unexplained “safe percentage.”

Support keyboard navigation, visible focus, readable contrast and labels/icons alongside colour. Virtualise large previews and bound browser memory; UI responsiveness must not depend on rendering every row.

### B. Functional system and ML

The pipeline is:

**Import → understand content/relationships → interpret goal → rank valid recipes → execute and evaluate a complete plan → review → confirm/export.**

Begin with an executable deterministic policy baseline so the UI can connect to real transformations while the learned selector is trained. The two selectors must share the same contract. Clearly report which one produced a proposal.

Separate these responsibilities:

| Component | Responsibility |
|---|---|
| Detection | Classify fields and text spans; identify relationships and uncertainty |
| Goal interpretation | Produce a structured goal plus an embedding; retain recipient and constraints explicitly |
| Recipe registry | Specify supported transformations, scope, parameters and preconditions |
| Method selector | Rank valid recipes conditioned on data, goal and relationship context |
| Joint evaluator | Measure the combined output's task utility and specified disclosure risks |
| Export service | Execute/serve the confirmed artifact and sanitised report |

Start with keep, suppress, typed text redaction, scoped keyed tokenisation, and supported date/numeric generalisation. Add location generalisation when a reliable mapping exists. Aggregation and differential privacy operate at query/table scope and require their own executors and evaluation; do not simulate them by adding arbitrary cell noise.

Use a field or linked-field group for structured transformations, a span for redaction, and a table/query for aggregation. Preserve necessary joins through consistent token scopes. Check combined risks rather than choosing every cell independently.

**ML formulation:** rank valid alternative recipes with a goal-conditioned softmax. Train on raw logits with categorical cross-entropy for one best target, or justified soft targets/acceptable alternatives where more than one recipe is suitable. Combined operations can be one recipe or a validated sequence; softmax does not make all privacy operations mutually exclusive.

Use a small classifier over frozen embeddings and structured features first. Compare multinomial logistic regression with interaction features against a small MLP if useful. The goal must interact with candidate/data features so changing the goal can actually change ranking. There is no requirement to train a foundation model or run distributed training.

Mask incompatible methods before softmax. Abstain when all candidates are invalid or the input is unsupported. A high score is not an anonymity guarantee. Check the proposed complete plan, preserve failed checks, and choose a deterministic validated proposal instead of sampling methods for export.

## Active-build addition: adversarial benchmark adapter

Implement the [required benchmark integration in the technical plan](MASK_PLAN.md#required-adversarial-benchmark-integration) as part of the functional workstream. The supplied package provides attacker knowledge, attack code, utility tasks and reference baselines. Connect these to real transformed outputs; a model confidence score or LLM judgement is not an attack result.

The development loop is: **generate candidate complete plans → execute → run attacks and utility tasks → review qualifying plans → create training targets → train the softmax selector**. No differentiation through the attack code is required. Retain plan context when creating per-field labels, because risks depend on combined choices.

The pipeline owner builds private benchmark staging, correct row mappings and a versioned adapter. The ML owner uses development results for supervision and reserves independent held-out evaluation. The UX owner displays test coverage, measured risk and retained utility separately from recipe preference. Implement this against the current application architecture without replacing work already underway merely to match an illustrative stack choice.

For the first customer-service demo, combine the supplied customer-table linkage attack with text-leakage checks and relevant task-utility tests. The customer-table attack does not establish safety of transcripts or all joins. Expose missing coverage and record `evaluated`, `not_applicable`, `unsupported` and `failed` distinctly; missing tests are never zero risk.

Keep truth, attacker inputs and scoring rowmaps out of production features and shareable artifacts. Preserve correct toolkit representation handling so a transformed row-level table is not accidentally scored as synthetic. Ordinary uploads may lack ground truth: report unavailable measurements honestly. Optional organiser-hidden attacks are future independent checks, not results we already possess.

Acceptance: execute multiple candidate plans on a new supported synthetic input, produce reproducible privacy/utility reports and reviewed targets, compare on frozen held-out cases, and verify export isolation. Include a deliberately leaky candidate, a utility-destroying candidate and a failed/unsupported test to prove the reporting behaves correctly. See the technical plan for source links and the full protocol.

## Training labels with ChatGPT or Claude agents

Yes: use agents to accelerate annotation and goal/scenario generation on synthetic development data. Treat their output as **candidate supervision**, not verified truth.

1. Freeze train/validation/test source assignments before generating variants or annotations. Keep related people, conversations, source schemas and derived transformations together as appropriate. Preserve the organiser's hidden evaluation split.
2. Give a labelling agent the permitted recipe registry, synthetic source context, structured goal and threat assumptions. Request structured output: selected recipe, parameters, acceptable alternatives, concise rationale and unresolved questions. Do not request fabricated certainty percentages.
3. Use a second agent to challenge feasibility, unnecessary disclosure and lost utility. Agreement is a useful triage signal, not independent validation.
4. Validate recipe IDs, parameters, scope and compatibility programmatically. Execute candidate recipes and run applicable utility/attack tests. Send disagreements and failed checks for human review; audit a stratified sample of agreements as well.
5. Store label provenance: source group/split, goal, candidate set, chosen recipe, alternatives, annotator model/prompt version, reviewer status and measured outcomes. Mark unreviewed/weak labels explicitly.
6. Keep final test targets independent of the teacher labels used for training. Report agreement with the teacher separately from task utility, leakage and attack outcomes. Use organiser scoring where available.

The supplied field/span annotations label content, not optimal treatments. The unlabelled HR dataset was inspected during prior scanner development; do not call it a new blind test or report accuracy without independent labels. Many rows and paraphrased goals are not necessarily independent training examples.

## Three-computer execution plan

| Owner/workspace | Primary work | Handoff |
|---|---|---|
| Computer 1 — product | UI, interaction states, review experience, frontend integration | Components against agreed fixtures/contracts; keyboard/responsive checks |
| Computer 2 — pipeline | Import, detector adapter, recipe executors, API, export, joint evaluation | Working deterministic end-to-end baseline and contract tests |
| Computer 3 — ML/data | Label pipeline, splits, features, training, calibration, model evaluation | Versioned examples, reproducible training jobs and model artifact |
| Teammate's cloud instances | Approved annotation/embedding batches and training/evaluation jobs | Checkpoints, metrics, logs and inference-ready artifacts |

Use separate branches/worktrees or clones with explicit file ownership. The lead owns shared contracts and merges. Avoid concurrent edits to the same files. Opus/Sonnet agents may handle bounded tasks with clear deliverables; the lead remains responsible for integration and evidence.

Inspect cloud hardware before selecting batch sizes. Start with a local smoke run, then parallel independent experiments/data batches where useful. Make runs resumable, seedable and configurable; record code revision, data/split hash, embedding/feature versions, recipe-registry version, configuration and environment. Transfer approved synthetic material only. Keep truth and attacker data isolated from production model features.

A model handoff must include weights, feature preprocessing, embedding requirements, class/recipe mapping, calibration metadata, training provenance and evaluation results. Reject incompatible model/registry versions rather than guessing.

## Shared contracts before parallel implementation

Agree on typed schemas and representative fixtures first. Keep the schema implementation in one owned location and generate/share client types where practical.

- `DatasetManifest`: input hash/version, tables, types, internal row IDs and relationships.
- `GoalSpec`: task, recipient, output form, measures, resolution, required joins, unresolved fields and version.
- `Detection`: field/span references, categories, evidence, uncertainty and relationship references.
- `Recipe`: ID/version, supported scope/types, parameter schema and executor requirements.
- `Proposal`: input/goal versions, selector/version, valid candidates/scores, selected recipes, parameters, reasons and review state.
- `Evaluation`: plan/output versions, metric definitions, results, thresholds, failures and unsupported checks.
- `ExportReceipt`: confirmed plan/input/output hashes, artifact references and sanitised report.

Model UI states explicitly: empty, importing, profiling, needs input, proposing, evaluating, review ready, updating, exporting, complete, failed/cancelled. Discard stale asynchronous responses after changes. Stable row/span references must survive sorting and filtering. Mock fixtures are permitted for parallel UI development but must be visibly development-only; never present fixture metrics as measured results.

## Milestones and acceptance

1. **Agree contracts and first demonstration.** Use customer-service structured/text data and two concrete purposes. Define recipes, evaluators and split boundaries.
2. **Deliver a real vertical slice.** Import → goal → deterministic proposal → actual transformed preview → confirm → download. Establish the white two-pane design and smooth state transitions now.
3. **Produce reviewed training examples.** Run agent annotation, schema validation, actual candidate-plan execution through the adversarial/utility benchmark adapter, and human audits. Freeze evaluation before tuning.
4. **Integrate the learned selector.** Replace the baseline behind the same API. Compare against fixed policies and a goal-agnostic selector on held-out data. Report failures and abstentions.
5. **Finish experience and evidence.** Test new supported inputs, goal changes, altered parameters, rare/unknown fields, cross-field risks, broken joins, stale requests and exact preview/export consistency.

Done means a new supported synthetic input is genuinely processed; changing the analytical purpose can change justified recipes; the approved downloaded file matches the preview; and before/after measurements show what remains useful and what risks remain. The demonstration must include actual outputs and the developer trace. No unsupported-domain or universal-anonymity claims.

## Lead-agent operating instructions

Read current repository state and the source brief before editing. Treat this as authorisation to build the local Mask implementation. Make routine implementation decisions autonomously and use specialist agents when helpful. Prefer a small coherent architecture; a practical default is a TypeScript web client and Python service/training code, but adapt to verified environment constraints.

Build and test incrementally, keeping a runnable baseline throughout. Explanations must reflect executed decisions. Do not fabricate benchmarks, infer production readiness from synthetic tests, or silently replace unavailable models with mocked intelligence. Report what is implemented, what was measured, and what remains uncertain. Public deployment, competition submission and new paid infrastructure are separate actions, not implied by this implementation handoff.
