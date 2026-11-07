# Does an explicit intended task improve the current privacy filter?

## Finding

**Not materially for the reviewed encoders in this diagnostic.** DeBERTa and MiniLM produced exactly the same protected source text for explicit tasks, a vague task, the UI first-line task and the web backend whole-message fallback on all 64 cases. Neither encoder completed any of the 20 annotated section removals. They also produced unchanged source outputs across 11 same-source task pairs whose gold edit plans differ.

The custom model reacted to explicit tasks: it completed two reviewed section removals, but lost one required fact. This is a trade-off, not a clear improvement. These results do not establish that the internal neural representation ignores the task; the detector and policy/edit gates can also suppress changes.

## Setup

- Three verified uploaded bundles, default `legacy` section pipeline, fixed weights and thresholds; local CPU inference only.
- 50 dev cases (43 sources), six training/gallery cases, six prior diagnostic cases (three source/task pairs), and two pending documentation examples (one new source/task pair). In total: 64 case/task rows from 53 unique source texts.
- Five conditions per case: original explicit intended use; `Help me with this information.`; an actually empty engine task; first source line; and the entire message as task.
- 960 model/case/condition calls, all completed without unsupported outputs. These are repeated comparisons, not 960 independent test examples.
- The source, labels and intended target task are held fixed within each comparison. Vague/empty conditions intentionally withhold intent; they are not expected to magically infer it. Some source messages already contain requests, so those conditions can still contain intent clues.
- Tested source transformation only, including pasted table text in the gallery. No CSV/XLSX file-adapter benchmark or downstream cloud-AI answer-quality evaluation was run.

## Aggregated results

Each row below covers the same 64 cases. Direct targets are gold ALIAS/PLACEHOLDER/etc. decision spans labelled with a direct identifier type; nested identifiers inside gold section DROP spans are not additional targets in this particular count. Coverage requires the full non-whitespace target to be edited. Section removal requires the full labelled non-whitespace span to be covered by DROP edits. Facts use exact required-quote retention, not semantic answer scoring.

| Model | Task supplied | Direct edit targets covered | Whole sections removed | Required facts retained | Source outputs differing from explicit |
|---|---|---:|---:|---:|---:|
| deberta-v3-base | explicit | 82/86 | 0/20 | 235/235 | 0/64 |
| deberta-v3-base | vague | 82/86 | 0/20 | 235/235 | 0/64 |
| deberta-v3-base | empty_engine_task | 80/86 | 0/20 | 235/235 | 3/64 |
| deberta-v3-base | ui_first_line | 82/86 | 0/20 | 235/235 | 0/64 |
| deberta-v3-base | web_message_only | 82/86 | 0/20 | 235/235 | 0/64 |
| encoder-b | explicit | 76/86 | 0/20 | 235/235 | 0/64 |
| encoder-b | vague | 76/86 | 0/20 | 235/235 | 0/64 |
| encoder-b | empty_engine_task | 76/86 | 0/20 | 235/235 | 0/64 |
| encoder-b | ui_first_line | 76/86 | 0/20 | 235/235 | 0/64 |
| encoder-b | web_message_only | 76/86 | 0/20 | 235/235 | 0/64 |
| custom-a | explicit | 78/86 | 2/20 | 234/235 | 0/64 |
| custom-a | vague | 78/86 | 0/20 | 235/235 | 4/64 |
| custom-a | empty_engine_task | 78/86 | 0/20 | 235/235 | 3/64 |
| custom-a | ui_first_line | 78/86 | 0/20 | 235/235 | 3/64 |
| custom-a | web_message_only | 78/86 | 0/20 | 235/235 | 3/64 |

## UI interpretation

The current browser code already sends the opening line as task context (`mask/web/static/app.js`). If the backend receives no task, `PreviewService.preview` uses the complete message as task context (`mask/web/server.py`). Neither is equivalent to calling the engine with an empty string. A separate intended-use field would provide a clearer input, but these weights did not turn that clarity into better source edits in the tests above.

The truly empty engine task caused DeBERTa to miss two additional direct edit targets, while even the vague nonempty task matched the explicit task. The engine explicitly retains contextual candidates on empty tasks. This is not evidence that the model understood the detailed intended use better: the task gate and contextual misclassification can explain the change. MiniLM had no output differences even with an empty engine task.

For a concrete demonstration, the documentation pair uses the same clinic/work note for a manager email and an appointment checklist. The desired treatment of the clinical paragraph changes. Neither encoder changed the protected source; both kept that paragraph for both tasks. The JSON reports preserve exact outputs and gate traces.

## Limits and next step

Dev was used for prior checkpoint selection, the gallery was included in training, and the other examples are model-authored diagnostics. The documentation pair is pending independent review. This is not a release test or a privacy guarantee. Perfect retention can reflect excessive KEEP behavior; it does not imply successful minimisation. No UI, runtime code, thresholds or weights were changed.

Continue the paired-task data work and evaluate a section-relevance model against these recorded baselines. Require better required removal without degrading useful-fact retention and identity protection. Adding a task box alone should not be presented as a fix for the current removal failure.

## Reproduce

With the reviewed bundles extracted as documented in `mask/ml/privacy_v1/bundled_weights/training-2026-11-07/README.md`:

```sh
python evidence/privacy-v1/intended-task-v1/run.py --output /tmp/mask-intended-task-new
```

Use a new output directory. `--models` can select a subset. `provenance.json` records source, bundle-manifest and runner hashes. The saved DeBERTa tokenizer emitted the same regex warning seen in the earlier fixed-weight experiment; it was left unchanged. The measurement helper was checked on full versus partial span coverage. No unrelated test suite was rerun for this data-only experiment.
