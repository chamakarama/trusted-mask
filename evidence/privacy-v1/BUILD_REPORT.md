# Mask Local — first executable A/B milestone

Historical training milestone. The subsequent [non-model pipeline update](pipeline-v2/REPORT.md) changes editing and review behavior without changing these trained bundles. Use its measurements for the current runtime; the results below preserve the original milestone.

7 November 2026. **Both planned approaches have been built, trained, exported, loaded and exercised locally. Neither is a release candidate.** This report describes an engineering pilot, not an independent estimate of protection for real consumer messages.

## What exists

The new `mask/ml/privacy_v1/` package provides a local Python API/CLI, a custom sparse logistic detector/relevance/action model (A), a fine-tuned MiniLM with three shared-encoder heads (B), common policy masks, deterministic edits, CSV/XLSX reconstruction, integrity-checked bundles, synthetic data generation, development evaluation and regression tests. The existing TypeScript application, institutional models, labels and split definitions were preserved.

Local trained bundles:

- `mask/ml/privacy_v1/artifacts/custom-a-pilot/`
- `mask/ml/privacy_v1/artifacts/encoder-b-pilot/`

B's pretrained source is `microsoft/MiniLM-L12-H384-uncased` at revision `44acabbec0ef496f6dbc93adadea57f376b7c0ec`. The local bundles include weight checksums, source/data provenance and exact action/taxonomy/policy contracts. Generated model binaries and synthetic JSONL are Git-ignored; generation/training commands and dependency versions are retained in the [package README](../../mask/ml/privacy_v1/README.md).

## Data and method

384 synthetic messages: 288 training and 96 development records, generated from eight templates with paired health/financial goals. Six template families train; two are development-only, with disjoint synthetic personas and exact source texts across splits. Each pair stays together. This is **only eight template families and two repeated task phrasings**. No labels have human audit; there is no independent validation/test set, spreadsheet training set or benign-negative evaluation corpus yet.

Both tracks used identical generated training rows and shared policy/execution. A trained three regularised logistic classifiers. B fine-tuned all encoder/head weights for one epoch (1,200 individual detection/action updates). A's recorded initial training took about 12 seconds including imports; B about 126 seconds. These are one-run observations, not controlled training-speed comparisons. No cloud compute or external teacher was used.

Hardware: Apple M5, 24 GiB RAM, macOS 27.0.1 ARM64; CPU-only execution with four PyTorch threads. MPS was unavailable in this execution sandbox. See [hardware record](hardware.json).

## Observations, with denominators

These measurements are over **review drafts**, not authorised automatic exports. Exact fact retention only checks labelled source strings; it is not a clinical, factual or downstream-utility evaluation. Required-removal coverage checks whether edits cover labelled source intervals; it does not prove resistance to identity inference or contextual linkage.

| Development diagnostic | Custom A | Encoder B |
|---|---:|---:|
| Direct identifier spans covered by removal edits | 120 / 192 | 190 / 192 |
| All labelled required-removal spans covered | 216 / 288 | 286 / 288 |
| Required fact strings retained | 96 / 96 | 96 / 96 |
| Correct action when given the **gold** span | 384 / 384 | 384 / 384 |
| Exact detector boundary/type matches | 96 / 384 | 190 / 384 |
| Benign characters inside changed spans | 408 / 2,256 | 512 / 2,256 |
| Complete message path warm p95, short pilot inputs | 2.7 ms | 99.8 ms |
| Local bundle bytes, excluding shared code/runtime | 164,876 | 134,483,207 |
| Automatic coverage | 0 / 96 | 0 / 96 |

Gold-span classification is easy on these repeated task patterns. The much weaker complete-pipeline result is the useful finding: **detection and span boundaries, not merely action selection, are the immediate bottleneck**. B still leaves two labelled identifiers uncovered. Overbroad contextual candidates also include punctuation/introductions outside the annotated span; the benign-character diagnostic makes that visible but is not the planned clean-negative span error metric. No final model has been selected.

B's float bundle is about 128.25 MiB, above the 100 MiB asset target even before shared code. ONNX/INT8 and parity checks remain work. The timing sample is only short synthetic messages under an ordinary desktop workload; it does not establish the 256/1,024-token, cold-load, memory or 10,000-cell throughput gates. Confidence intervals or population guarantees would be inappropriate from these two development families.

Detailed current diagnostics: [custom A](custom-a-pilot-dev-v2.json), [encoder B](encoder-b-pilot-dev-v2.json). The earlier `*-pilot-dev.json` reports preserve the first diagnostic snapshot before exact precision/benign-character metrics and explicit bundle contract metadata were added; trained weights were unchanged.

## Baselines

The shared rules/review fallback covers 96 / 192 direct spans and 96 / 288 total required-removal spans. It deliberately retains uncertain contextual facts for review. With task wording replaced by a constant, both learned action heads fall from 384 / 384 to 288 / 384 correct gold-span actions. Full draft removal coverage falls to 162 / 288 for A and 190 / 288 for B. This confirms task conditioning affects the pilot; it does not establish robust understanding of arbitrary user goals.

Raw reports: [rules/review baseline](rules-pilot-dev.json), [A without task conditioning](custom-a-goal-agnostic-dev.json), [B without task conditioning](encoder-b-goal-agnostic-dev.json). All have zero automatic coverage because this package cannot mark a pilot as ready.

## Verification

- 33 Python checks passed with both local models installed. They cover Unicode offsets, nested spans, blocked identifiers despite a KEEP prediction, alias consistency/collisions, task/history scanning, missing/unsupported context, corrupt distributions/bundles, split leakage, trained-model export/reload parity, network-blocked inference, detection-window tail offsets, and basic table processing through B.
- CSV checks include a rare identifier in the last row, full nonempty-cell coverage, literal number preservation, malformed/oversized files, formula-like content and existing-output protection.
- XLSX checks include reconstruction without original comments/links/author metadata/hidden content, numeric/date type retention when allowed, formula/merged-layout rejection and literal strings starting with `=` remaining strings.
- The tests found and drove a fix for ordinary Excel comment VML being rejected as an embedded drawing. Comments are now accepted as source metadata and omitted from the rebuilt file; actual embedded drawings/media remain unsupported.
- Existing application TypeScript checking was run separately; no application source files were changed.

## Next work and release blocks

1. **Audit and expand the dataset.** Independently author varied tasks, names, benign negatives, cell/row/conversation families, obfuscations, long inputs and the rest of the taxonomy. Review the [annotation contract](../../mask/ml/privacy_v1/annotation/README.md). Current pilot scores are not suitable release evidence.
2. **Improve detection and boundaries.** Keep A and B trainable; diagnose per-category misses and unnecessary edits. Do not fix the pilot by adding its held-out names to a lookup table.
3. **Complete context handling.** B's detection windows cover long text, but action inputs beyond 512 tokens fail explicitly. Cross-turn/cross-field inference, entity ambiguity, evidence-backed ROLE substitutions and broader faithful generalisations are unresolved.
4. **Independent evaluation and calibration.** Create audited validation and untouched final tests; preregister comparison margins, operating points and denominators. Measure privacy, utility, factual corruption and inference attacks at matched nonzero automatic coverage.
5. **Optimise and package.** Compare ONNX/INT8 against float outputs, record full asset/runtime size and licences, and measure cold load/RSS/long-message/table throughput offline.
6. **Release only after gates pass.** Current bundles always require review. No provider forwarding, web UI integration or ready consumer-product claim is implemented.

The next useful investment is better audited data and detector error reduction, not more compute or a larger generative model.
