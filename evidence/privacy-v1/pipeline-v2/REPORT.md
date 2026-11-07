# Mask output pipeline v2

7 November 2026. This update changes the editor, adapters, local preview and training-data workflow. It does not retrain either model. All 15 original bundle files, including weights, tokenizers and manifests, match the [before-update checksums](original-bundle-checksums.json). The final runtime source hashes are recorded [separately](runtime-source-checksums.json). All outputs remain review drafts.

## Delivered behavior

- Names become `[PERSON_1]`, preserving source roles and relationships. Exact repeats of an identified full name reuse the full-span substitution, even when the tagger later detects only a surname. Existing literal labels are reserved to avoid collisions. Alternate spellings, pronoun resolution and two distinct people with identical names are not solved.
- Direct-identifier rules own complete entity edits; competing model fragments cannot split them. Doubtful learned candidates are reported for review and left unchanged. This prevents many corrupt edits but can retain private data, so it cannot authorise sharing.
- Contextual sections and identity mentions are separate candidates. A whole-clause DROP requires an explicit DROP prediction, sufficient unnecessary relevance, and no essential or unresolved overlapping interpretation. A PLACEHOLDER prediction cannot authorise deletion. Essential parent context protects nested contextual facts; direct identifiers inside useful sentences still receive substitutions. Punctuation and separators are handled within the exact removal span, without globally rewriting source text.
- The preview has an optional intended-use field. Blank input uses the message itself as task context; it does not run a separate intent extractor. Either input changing immediately invalidates stale output. The copied payload includes the fixed receiving-AI instruction, protected task when supplied, and protected message. There is no provider forwarding.
- Reports include pipeline/training-policy versions, model bundle hash, unresolved detections and retained-fact locations. Direct policy edits have `score: null`; learned scores remain uncalibrated softmax values. Task/history reports and table source/output coordinates stay available without exporting original values or alias maps.
- CSV/XLSX handling now bounds actual reads and workbook dimensions before allocation, permits supported plus-prefixed phones into protection, checks output formula safety, and publishes complete files without overwriting existing paths. CLI input preserves original line endings; failures do not echo raw source. Unsupported files do not produce partial final exports.
- The [data producer prompt](../../../mask/ml/privacy_v1/annotation/TRAINING_DATA_PROMPT.md) and CLI support isolated UUID shards, exact quote resolution, separate detection/treatment labels, approved-output replay, required-fact checks, content-bound independent model reviews, and duplicate/split checks. Both trainers now consume separate `detection_spans` when present; their architectures and trained bundles are unchanged. No new production corpus or cloud training was created by this update.

## Verification

| Check | Result |
|---|---:|
| Privacy engine, both installed models, data workflow, file adapters and regressions | 74 passed |
| Local HTTP interface | 18 passed |
| Frontend DOM behavior | 6 passed |
| Original trained bundle files unchanged | 15 / 15 |

Commands, from repository root:

```sh
HF_HUB_OFFLINE=1 TOKENIZERS_PARALLELISM=false mask/ml/privacy_v1/.venv/bin/python -m pytest mask/ml/privacy_v1/tests -q
HF_HUB_OFFLINE=1 TOKENIZERS_PARALLELISM=false mask/ml/privacy_v1/.venv/bin/python -m pytest mask/web/tests -q
node --test mask/web/tests/test_frontend.mjs
git diff --check
```

The HTTP tests require loopback binding, so they were rerun successfully outside the socket-restricted sandbox. Tests exercise malformed/oversized files, atomic export conflicts, Unicode offsets, competing section decisions, incomplete/error responses, stale previews, quoted secrets, repeated aliases, context capacity and unchanged bundle loading. Data CLI claim/resolve/validate/review/merge/compile smoke checks also passed; smoke review fixtures are not genuine reviewed training data.

## Observed examples and remaining failures

The previously inspected 206-word [complex case](complex-message-01-results.json) is exploratory regression evidence, not a held-out test. Both models remove all 11 listed identifying strings. A retains 9/10 required fact strings, incorrectly replacing the mother's age. B retains 10/10 but incorrectly labels a clinic and an employer as PERSON. Both retain unrelated financial details. These failures remain visible and require improved labels/model evaluation.

A new 99-word [integration smoke](message-and-context-smoke-v2.json) produces complete review drafts through both models in both explicit-task and message-only modes. Both now use one stable label for the repeated partner name while preserving the negated statement about who had symptoms. The [first smoke result](message-and-context-smoke.json) is retained because it exposed A's partial-surname problem before exact-repeat propagation was added. These examples were inspected during development and are not independent accuracy measurements.

The original 96-record development set was also rerun using the current candidate pipeline. Its two source families and two repeated task wordings remain inadequate for generalisation claims:

| Draft diagnostic | Rules | Custom A | Encoder B |
|---|---:|---:|---:|
| Direct identifier intervals covered | 96 / 192 | 96 / 192 | 190 / 192 |
| All labelled required-removal intervals covered | 96 / 288 | 96 / 288 | 190 / 288 |
| Required fact strings retained | 96 / 96 | 96 / 96 | 96 / 96 |
| Benign characters inside edits | 0 / 2,256 | 0 / 2,256 | 0 / 2,256 |
| Automatic release coverage | 0 / 96 | 0 / 96 | 0 / 96 |

Reports: [rules](rules-dev.json), [A](custom-a-dev.json), [B](encoder-b-dev.json). These are exact-span/string diagnostics on drafts, not inference-attack or downstream-utility results. A's direct coverage fell from 120/192 in the earlier renderer to 96/192: structurally doubtful predictions are now retained for review rather than turned into destructive fragments. Overall removal coverage also falls because the historical labels ask for contextual PLACEHOLDER edits that the new section policy deliberately does not convert into whole-section deletion. Do not describe the update as a universal privacy improvement. Detector metrics now use the actual candidate pipeline and, for new data, separate detection targets; older reconciler-based numbers are not directly comparable.

## Next work

Run the shared prompt in each repo-connected writer session. Review the first 40 accepted examples before expanding that writer to 200. Independently assign development authors, keep source/persona/template families together, merge reviewed shards, then train both tracks on the same data. Give particular attention to uncued names, incidental identifiers, benign proper nouns, required ages/dates, task swaps, clean negatives and justified section DROP. Reserve human-adjudicated validation and untouched final tests separately.

The first data campaign supports English messages with explicit tasks. Message-only intent handling, conversation and table authoring need separate campaigns. Existing pilots have no DROP supervision; context capacity is still bounded, scores are uncalibrated, cross-field inference risk is unresolved and the encoder float bundle remains above the original size target. None of these limitations is removed by readable output or passing engineering tests.
