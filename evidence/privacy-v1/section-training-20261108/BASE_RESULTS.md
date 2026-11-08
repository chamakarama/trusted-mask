# Base result: loadable and published; do not replace the default

The two-epoch base bundle was uploaded to GitHub LFS about 75 seconds after its
archive was saved, before full evaluation. SHA256:
`356bae562b723b84aa18880676db2fda0283b0cce8d37a6db37ab2703238459d`
(597,907,864 bytes). Download/loading instructions are in
`mask/ml/privacy_v1/bundled_weights/section-training-20261108/README.md`.

**Epoch 2 beats epoch 1 on both dev sets, but fails the prototype acceptance gate.**
The default 0.9 section threshold improves removal and alias consistency, while
introducing false deletions and some new value-masking errors. Keep the old demo
checkpoint available and unchanged. This is dev evidence, not independent testing.

| Original dev: 50 messages | Identifier misses /30 | Lost facts /182 | Correct clauses /12 | False clauses | Correct task switches /12 |
|---|---:|---:|---:|---:|---:|
| Rules | 22 | 0 | 0 | 0 | 0 |
| Fixed old DeBERTa | 0 | 0 | 0 | 0 | 0 |
| New base epoch 1 | 0 | 0 | 1 | 0 | 1 |
| New base epoch 2 | 0 | 0 | 3 | 0 | 3 |
| Epoch 2, goal-agnostic | 0 | 0 | 0 | 0 | 0 |

| Supplemental dev: 80 messages | Identifier misses /323 | Lost facts /405 | Correct clauses /58 | False clauses | Correct task switches /42 |
|---|---:|---:|---:|---:|---:|
| Rules | 249 | 0 | 0 | 0 | 0 |
| Fixed old DeBERTa | 29 | 19 | 0 | 0 | 0 |
| Fixed MiniLM | 24 | 19 | 0 | 0 | 0 |
| New base epoch 1 | 24 | 15 | 17 | 9 | 8 |
| New base epoch 2 | 24 | 8 | 20 | 5 | 9 |
| Epoch 2, goal-agnostic | 24 | 5 | 5 | 1 | 0 |
| Epoch 2 weights, old pipeline | 24 | 10 | 8 | 6 | 5 |

Epoch 2 removes 3/9 original and 8/33 supplemental whole gold sections. Its
supplemental clause-removal precision is 20/25, recall 20/58. All 18 original and
three supplemental approved-no-edit controls remain unchanged. Unnecessary changed
characters on supplemental: old DeBERTa 621, new base 714 (not a token metric).

The old baseline has 47 inconsistent gold identities and two erroneous identity
merges on supplemental; new base has zero of either. Reusing new weights under the
old pipeline still has 45 inconsistent identities: the conservative resolver is a
material part of the gain, not something the weights alone learned. Exact-label
PLACEHOLDER matches improve from 83/117 to 89/117; essential non-direct placeholders
remain 3/5 correct. These stricter type counts differ from coverage-based misses.

## Bounded threshold check

Only two higher thresholds were tried, on dev, with no additional fitting:

| Threshold | Original correct / false clauses | Supplemental correct / false clauses | Supplemental lost facts |
|---|---:|---:|---:|
| 0.9 (published runtime) | 3 / 0 | 20 / 5 | 8 |
| 0.999 | 1 / 0 | 7 / 0 | 4 |
| 0.9999 | 0 / 0 | 0 / 0 | 4 |

0.999 is the better conservative deletion setting in this small check, but does
not solve the new financial-value masking errors. It is a diagnostic override,
not the configuration embedded in the published archive. No threshold here meets
the full acceptance requirement of better removal with no new required-fact loss.
No stronger privacy claim follows from high softmax scores.

## Inspected failures

Every lost fact and false removal is enumerated with its exact overlapping edits
in `base/audits/`; all actual source/protected messages and raw/final section traces
are in `base/cloud/evaluation/`.

- Five false clause removals at 0.9 affect a care-allowance ownership statement,
  an employer medical-certificate option, an uncertain vision finding and its
  explanatory fact, and an unlabelled e-bike reimbursement detail. Some wrong scores
  exceed 0.997. Threshold 0.999 suppresses these finite examples.
- New value substitutions damage an engineering handover's uptime percentage and
  credit terms (including `99[FINANCIAL]%`). This persists under stricter deletion
  thresholds and is not hidden by the improved aggregate fact count.
- A merchant name and a credit-note ID are also masked inside required facts.
  These overlap errors already existed in the baseline. There are five newly lost
  fact quotes at 0.9 and 16 old losses recovered; at 0.999 two new quotes still fail.
- None of the 24 remaining identifier misses is new relative to old DeBERTa.
  They include synthetic telephone/card values rejected by existing validators,
  business-number review exceptions, three incomplete address spans, an
  unconfirmed secret, and two username mentions. The safeguards were preserved;
  these are still counted as misses, not excused as success.
- Gallery: only the budget example is an exact target match. Archived medical
  paragraphs remain in several examples; date of birth and some pasted CSV
  customer IDs remain. Actual CSV processing is better than treating pasted CSV
  text as a plain message; those are different supported paths.

## Fresh messages, adapters and CPU

Six fresh cases use three distinct 119–140-word sources, including a matched task
swap, vague and missing task, distinct people sharing a first name and benign
no-edit. Base has zero annotated identifier misses, zero checked fact losses and
zero alias inconsistencies/merges. It removes the cough paragraph for a delivery
task but fails to remove the desk-order sentence for the clinician task. Vague and
blank tasks retain both subjects while protecting identifiers; the benign message
is unchanged. See `BASE_EXAMPLES.md` for three actual sources and their outputs.

All 16 actual CSV/XLSX fixtures completed parse/transform/export/reparse; 15 matched
expected cells exactly (old baseline: 9). The remaining gardening fixture masks
a payment card but retains its unnecessary sentence. These fixtures and six gallery
examples are training demonstrations, not held-out quality evidence.

Fresh public GitHub download, archive hash, full bundle integrity, real app loader,
offline CPU inference and CPU export/reload parity all passed. Section-score
maximum difference was exactly 0.0. On a G2-standard-8 host using four CPU threads,
load took 9.17s, first 134-word preview 5.88s, warm pipeline 3.62s, peak process RSS
2,369 MiB. The process ran alongside GPU evaluation; these are approximate timings,
not a dedicated benchmark. Local restoration was tested with an explicitly mock
reply; no external AI service was called.

The base GPU VM and its 150GB disk were deleted after all evidence was retrieved.
The large run remains separate and will receive the same evaluation protocol.
