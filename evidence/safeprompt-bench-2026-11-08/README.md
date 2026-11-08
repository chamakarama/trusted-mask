# Mask on SafePrompt-Bench

Measured 8 November 2026. **1,500 synthetic test documents, all retained in the denominator.** This evaluates confirmed detection spans, using SafePrompt's original scorer without modification. It does not measure task relevance, final redaction, or downstream answer quality.

## Results

All F1 scores are percentages, rounded to one decimal using the upstream scorer. Higher is better. Clean documents flagged is a false-positive measure; lower is better.

| System | Structured identifiers F1 | Names F1 | Secrets F1 | Clean documents flagged |
|---|---:|---:|---:|---:|
| SafePrompt 0.1.0 | 98.3 | 0.0 (unsupported) | 100.0 | 1 / 299 |
| Mask1 | **98.9** | **100.0** | **100.0** | 15 / 299 |
| Mask2 | 98.3 | **100.0** | **100.0** | 57 / 299 |
| MaskMini | **98.9** | 90.3 | **100.0** | 132 / 299 |

Public names: **Mask1** = reviewed DeBERTa-v3-base (7 November, epoch 1); **Mask2** = new DeBERTa-v3-base (8 November, epoch 2); **MaskMini** = reviewed MiniLM-L12-H384 (7 November, epoch 1). All rows include the same frozen Mask detection rules. Raw result filenames retain descriptive checkpoint identifiers.

**Supported claim:** the reviewed Mask detector scores 98.9 versus SafePrompt's 98.3 on the original structured-identifier metric, with additional name detection on these synthetic examples. It also produces more false positives. The newer candidate does not improve on SafePrompt's original F1 score: both round to 98.3, with unrounded scores 98.2798 and 98.3415 respectively.

| System | Original-scope precision | Original-scope recall | True positives | False positives | Misses |
|---|---:|---:|---:|---:|---:|
| SafePrompt | 99.7 | 97.0 | 4,625 | 15 | 141 |
| Mask1 | 99.6 | 98.2 | 4,681 | 17 | 85 |
| Mask2 | 98.3 | 98.3 | 4,685 | 83 | 81 |
| MaskMini | 99.6 | 98.2 | 4,681 | 17 | 85 |

The original scope contains 4,766 annotated values across `EMAIL`, `PHONE`, `IBAN`, `PAYMENT_CARD`, `IP_ADDRESS`, `VAT_ID` and `NATIONAL_ID`. The names column separately scores all 1,064 `PERSON` spans. The secrets column separately scores all 831 `SECRET` spans. The clean-document count considers findings across all nine categories. In the original scope alone, MaskMini flags 15 clean documents; including its name findings raises this to 132. MaskMini recalls every annotated name but adds 228 false name predictions, giving 82.4 precision and 90.3 F1.

If **all nine annotated categories** are scored together, F1 is 89.9 for SafePrompt, 99.2 for Mask1, 98.8 for Mask2 and 97.6 for MaskMini. This is an extended scoring scope, not SafePrompt's published headline metric. Do not compare the extended Mask score against SafePrompt's original 98.3.

## Method and provenance

- SafePrompt source: [`64df85bae1677653ef5b6f070a1acf43e0580873`](https://github.com/sinceaihq/safeprompt/tree/64df85bae1677653ef5b6f070a1acf43e0580873). Its reproduced original metrics match the [published report](https://github.com/sinceaihq/safeprompt/blob/64df85bae1677653ef5b6f070a1acf43e0580873/docs/BENCHMARK.md).
- Dataset: [Since AI's SafePrompt-Bench](https://huggingface.co/datasets/sinceaihq/safeprompt-bench), revision `a3c1875a78953b2c603c874c9e3bc44a7d870e4a`, test seed `20261020`. Test file SHA-256: `10baf58447a91326f44295760e345fcfc81a97262889811cb6e69e1e4eac5980`.
- Mask source: frozen Python files at `0b3854dfb65eaffca6714595ae6daf961d3f421e`. Concurrent working-tree edits were excluded. All three model checkpoints predate this test and are identified by SHA-256 in their metadata files. MaskMini's legacy loader reports `encoder-b-pilot`, but its verified bundle is the reviewed 516-record checkpoint, not the earlier 288-record engineering pilot.
- Mask findings are the confirmed entities returned by `build_candidates(text, model.detect(text))`, including deterministic validators and model proposals accepted by existing gates. Unconfirmed review proposals are excluded. No label remapping, fitting, threshold changes, or model changes were made in response to this test.
- Every document produced a prediction row, including empty findings. All three Mask runs completed with zero failures. The adapter checks all 1,500 IDs before scoring, preventing the upstream scorer from silently falling back to SafePrompt for missing predictions.
- No known prior use of this test was reported by the project owner. Exact-text checks found no overlap with the 516 training records used for Mask1 and MaskMini, or Mask2's 1,236 training records. This is not proof against all prior development exposure or shared templates.
- Python CPU inference used four PyTorch threads. Runtime warnings from the existing loader were left unchanged. Runs overlapped on the same host, so their elapsed times are not a controlled speed comparison.

## What these results do not establish

- The benchmark contains synthetic templates, and its names use a few fixed placeholder forms. **100% here does not mean perfect real-world name detection.** SafePrompt explicitly does not support automatic name detection.
- The secret examples follow documented token formats also used by SafePrompt's detector. The authors call this comparison circular. All systems scoring 100 here does not establish superiority on real secrets.
- This is a **detector** evaluation. In the frozen Mask pipeline, IP and VAT findings are retained for review rather than automatically redacted. The official JSON field `values_fully_hidden` measures prediction-span coverage here, not actual Mask output hiding those values.
- The newer model's relevance and passage-removal heads are not exercised by this detector benchmark. It cannot establish superior context understanding or answer preservation.
- Mask's false-positive rate is materially worse on clean documents. Per-label reports also show lower VAT recall. Keep these alongside the headline win.
- This is Python detector performance, not an end-to-end browser parity measurement for the benchmark or a universal safety/compliance claim.

## Files and reproduction

`predictions/` stores all four systems' per-document span predictions without copying the source prompts. `scores/` stores the original scorer's outputs for five clearly named scopes. Scoring-time fields were removed because the scorer times lookup rather than inference for external predictions. `manifest.json` records revisions and evidence hashes.

1. Obtain the pinned Mask source and each named model bundle. Obtain the pinned SafePrompt source and run `npm ci --ignore-scripts` there.
2. Download `data/test.jsonl` from the pinned dataset revision and verify its checksum above.
3. Run `predict_mask.py --source PATH_TO_PINNED_MASK --model PATH_TO_BUNDLE --data PATH_TO_TEST --out NEW_PREDICTIONS.jsonl` using Mask's documented Python environment. Repeat for all three bundles. The adapter refuses to overwrite an existing run.
4. Run `score.py --upstream PATH_TO_SAFEPROMPT --data PATH_TO_TEST --predictions PATH_TO_PREDICTIONS_DIRECTORY --out NEW_SCORE_DIRECTORY`. The prediction directory must contain `mask-reviewed-base.jsonl`, `mask-base-epoch2.jsonl` and `mask-mini.jsonl`. SafePrompt is rerun directly with default settings.

Attribution: SafePrompt and its scorer are by Since AI (Apache-2.0). SafePrompt-Bench is by Since AI (2026), licensed CC BY 4.0. The dataset is referenced rather than redistributed here.
