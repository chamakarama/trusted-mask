# Fixed-weight section-removal experiment

## Decision

**Do not enable the experimental modes in the demo yet.** Enumerating structural units repairs candidate coverage, but it does not teach the existing heads to remove irrelevant sections. MiniLM and DeBERTa still remove none of the reviewed whole DROP spans in these cohorts. The custom model loses useful facts, especially in paragraph mode. No weights, thresholds, training records or live UI configuration were changed by this experiment.

## Results

DROP counts require the entire labelled non-whitespace span to be removed. Fact retention is exact required-quote presence, not a downstream answer-quality score. Additional changes to unannotated characters are recorded in JSON but are not automatically classified as errors.

| Model | Cohort | Mode | Correct whole DROP | Required facts retained |
|---|---|---|---:|---:|
| custom-a | dev (50) | clause-probe-v1 | 0/9 | 166/182 |
| custom-a | dev (50) | legacy | 2/9 | 181/182 |
| custom-a | dev (50) | paragraph-probe-v1 | 0/9 | 81/182 |
| custom-a | fresh (6) | clause-probe-v1 | 0/4 | 15/18 |
| custom-a | fresh (6) | legacy | 0/4 | 18/18 |
| custom-a | fresh (6) | paragraph-probe-v1 | 3/4 | 7/18 |
| custom-a | gallery (6) | clause-probe-v1 | 0/4 | 24/24 |
| custom-a | gallery (6) | legacy | 0/4 | 24/24 |
| custom-a | gallery (6) | paragraph-probe-v1 | 0/4 | 15/24 |
| deberta-v3-base | dev (50) | clause-probe-v1 | 0/9 | 182/182 |
| deberta-v3-base | dev (50) | legacy | 0/9 | 182/182 |
| deberta-v3-base | dev (50) | paragraph-probe-v1 | 0/9 | 182/182 |
| deberta-v3-base | fresh (6) | clause-probe-v1 | 0/4 | 18/18 |
| deberta-v3-base | fresh (6) | legacy | 0/4 | 18/18 |
| deberta-v3-base | fresh (6) | paragraph-probe-v1 | 0/4 | 18/18 |
| deberta-v3-base | gallery (6) | clause-probe-v1 | 0/4 | 24/24 |
| deberta-v3-base | gallery (6) | legacy | 0/4 | 24/24 |
| deberta-v3-base | gallery (6) | paragraph-probe-v1 | 0/4 | 24/24 |
| encoder-b | dev (50) | clause-probe-v1 | 0/9 | 182/182 |
| encoder-b | dev (50) | legacy | 0/9 | 182/182 |
| encoder-b | dev (50) | paragraph-probe-v1 | 0/9 | 182/182 |
| encoder-b | fresh (6) | clause-probe-v1 | 0/4 | 18/18 |
| encoder-b | fresh (6) | legacy | 0/4 | 18/18 |
| encoder-b | fresh (6) | paragraph-probe-v1 | 0/4 | 18/18 |
| encoder-b | gallery (6) | clause-probe-v1 | 0/4 | 24/24 |
| encoder-b | gallery (6) | legacy | 0/4 | 24/24 |
| encoder-b | gallery (6) | paragraph-probe-v1 | 0/4 | 24/24 |

All 558 model/mode/record runs completed without unsupported outputs. Counts are repeated comparisons of 62 records, not 558 independent examples. Dev was used previously for checkpoint selection; gallery examples are in training. The six fresh diagnostics reuse three sources with two tasks each. None of these is a release-grade final test. Timings include per-span inference and are exploratory local CPU measurements, not a latency benchmark.

## Why this matters

For the MiniLM medical video example, several irrelevant clauses receive >0.99 unnecessary relevance scores but a PLACEHOLDER action, while other required-to-drop clauses receive KEEP. A blanket rule converting unnecessary or PLACEHOLDER to whole-section DROP would obscure this disagreement and is not validated by these results. The custom model demonstrates the opposite danger: more removal with severe fact loss.

The immediate model work is a separately supervised section relevance head, with exact runtime section boundaries and same-source/different-task examples. Existing reviewed labels project to 177 unnecessary versus 2,250 essential clause targets. The exporter leaves 1,465 unlabelled clauses unlabelled. See [implementation and training plan](../../../mask/ml/privacy_v1/SECTION_REMOVAL.md) and [focused generation brief](../../../mask/ml/privacy_v1/annotation/SECTION_DATA_PROMPT.md).

## Reproduce and verification

Archive checksums and all three bundle integrity manifests were verified before offline CPU inference. `provenance.json` records source and manifest hashes. Each model/cohort/mode JSON contains individual output, edit, fact-retention and decision-trace evidence.

From the repository root, with reviewed bundles extracted as documented in their README:

```sh
python evidence/privacy-v1/section-removal-v1/run.py --output /tmp/mask-section-comparison-new
```

The output directory must not exist. Run with the repository Python dependencies. No network inference, fitting, threshold search or automatic deployment occurs. The local Transformers runtime emitted a tokenizer regex warning for the saved DeBERTa tokenizer; the tokenizer was not changed during this fixed-weight comparison.

Verification after integrating the latest committed UI: **158 Python tests passed, 2 skipped; 11 frontend tests passed**. This includes 13 new structural-section tests. Initial local test setup lacked the old pilot weight file and jsdom dependency; the verified existing pilot file and installed dependencies were supplied and the complete suites then passed.
