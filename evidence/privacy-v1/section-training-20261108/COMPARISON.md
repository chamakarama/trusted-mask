# DeBERTa base and large: trained, published, development-selected

**Prefer base epoch 2 for a supervised experimental demo. Keep the existing
working DeBERTa demo default unchanged.** Neither new candidate passes the
no-new-fact-loss acceptance gate across both dev sets. Large removes more content,
but also removes more useful facts. Its selected checkpoint is epoch 1, with the
initial final-epoch bundle preserved separately.

Both models started from their own pinned pretrained source and used the same
frozen split, objectives, seed and bounded two-epoch / one-learning-rate schedule.
There were **1,236 optimizer records**, **80 family-separated supplemental dev
records**, and the unchanged **50 original dev records**. Only the canonical
1,316-record `training-2026-11-07c` pool was used; no dev, pilot or earlier shard
was added to training. This is development evidence, not an independent final test.

## End-to-end comparison

| Original dev, 50 messages | Identifier misses /30 | Lost facts /182 | Correct clause removals /12 | False clause removals | Correct task switches /12 |
|---|---:|---:|---:|---:|---:|
| Rules only | 22 | 0 | 0 | 0 | 0 |
| Existing DeBERTa | 0 | 0 | 0 | 0 | 0 |
| Existing MiniLM | 0 | 0 | 0 | 0 | 0 |
| **Base epoch 2** | **0** | **0** | **3** | **0** | **3** |
| **Large epoch 1 (selected)** | **0** | **0** | **5** | **0** | **5** |
| Large epoch 2 | 0 | 0 | 8 | 1 | 8 |

| Supplemental dev, 80 messages | Identifier misses /323 | Lost facts /405 | Correct clause removals /58 | False clause removals | Correct task switches /42 |
|---|---:|---:|---:|---:|---:|
| Rules only | 249 | 0 | 0 | 0 | 0 |
| Existing DeBERTa | 29 | 19 | 0 | 0 | 0 |
| Existing MiniLM | 24 | 19 | 0 | 0 | 0 |
| **Base epoch 2** | **24** | **8** | **20** | **5** | **9** |
| **Large epoch 1 (selected)** | **24** | **12** | **32** | **11** | **14** |
| Large epoch 2 | 24 | 24 | 38 | 16 | 15 |

Both selected models introduce **zero new identifier misses** relative to the old
DeBERTa on these rows, but base introduces **five newly lost fact quotes** and
large epoch 1 introduces **ten**. Improved aggregate retention does not excuse
those regressions. Base epoch 1 loses 15 supplemental facts and makes nine false
clause removals; epoch 2 is the better base checkpoint. Large epoch 1 halves the
final checkpoint's fact losses, so it is selected despite slightly lower recall.

Whole gold sections removed: base 3/9 original and 8/33 supplemental; selected
large 5/9 and 15/33. Supplemental clause precision/recall: base 20/25 and 20/58;
selected large 32/43 and 32/58. At the coalesced edit-region level, 14/18 base
regions and 19/26 selected-large regions contain only gold DROP content, ignoring
whitespace and terminal delimiters. Partial removal does not count as whole-section
recall. Unlabelled-clause removal is conservatively counted as false.

Unnecessary changed characters on supplemental are 621 for the old baseline,
714 for base, 1,336 for selected large, and 2,098 for large epoch 2. These are
character overlap diagnostics, not token accuracy.

## Placeholders, identities and context

The essential-to-KEEP shortcut is removed in the versioned inference mode:
essential relevance can retain a section while a PLACEHOLDER action protects its
private value. Essential non-direct placeholder matches across the two dev sets
are 3/9 for base, 7/9 for selected large, and 9/9 for large epoch 2; the larger
model's stronger substitution learning also causes over-masking of useful values.
Total type-exact placeholder matches are 98/130 for base and 103/130 for selected
large, versus 90/130 for the old DeBERTa.

Supplemental inconsistent-identity counts fall from 47 to zero, and erroneous
merges from two to zero, for both selected candidates. Full/short-name links are
conservative and require an unambiguous detected full name. Large epoch 1 has one
original-dev type error: it protects the person “Levo San” as `[ORG]`, so that
mention cannot use person-alias restoration. Privacy coverage and correct alias
semantics are reported separately.

Base's goal-agnostic ablation has zero correct task switches, compared with 3/12
and 9/42 when conditioned. Selected large's goal-agnostic ablation also has zero,
versus 5/12 and 14/42 when conditioned. It loses seven original and 15 supplemental
facts, versus zero and 12 when conditioned. The ablation replaces the model's task input with a
constant generic task while retaining production safety gates. New weights under
the legacy pipeline are also measured, separating learned-weight gains from the
new head/resolver/gates. Full counts are in `comparison.json`.

Both selected candidates leave all original and supplemental approved-no-edit
controls unchanged. Five supplemental relevant-sensitive and three vague-task
controls have no false removals or fact losses; one identifier miss remains in
the relevant-sensitive group. Cohort details are in `cohort-summary.json`.

## Bounded threshold check and inspected failures

At threshold 0.999, base has no false clause removals but only 1/12 original and
7/58 supplemental correct removals, and two newly lost fact quotes remain due to
value substitutions. Threshold 0.9999 suppresses all base removals. For large
**epoch 2**, thresholds 0.999 and 0.9999 still produce 10 and four supplemental
false clause removals, with 21 and 17 lost facts. No tested configuration meets
the full acceptance gate. These are diagnostic overrides; published runtimes use
0.9. Scores are not calibrated privacy guarantees.

Every false removal and lost-fact span is recorded with actual edits in
`base/audits/` and `large/audits/`; source/protected outputs and raw/final gate traces
are preserved. Inspected failures include removing care-allowance ownership,
return-to-work adjustments, custody context needed for an account transfer,
medical reasons supporting an accommodation request, and explanations for an
inability to carry recycling. Value errors include masking an uptime percentage,
credit terms, licence prices, a public pay band and useful place/merchant names.
The larger final checkpoint is especially overconfident on these errors.

Remaining identifier misses include existing phone/card validation rejections,
business-number review exceptions, incomplete addresses, an unconfirmed secret
and username mentions. They remain counted as misses; safeguards were not removed
to inflate masking or removal scores. No gold facts or identities enter inference.

## Artifacts, examples and reproduction

- Selected base: `mask/ml/privacy_v1/bundled_weights/section-training-20261108/deberta-v3-base.tar.gz`.
- Selected large: `mask/ml/privacy_v1/bundled_weights/section-training-20261108/selected-epoch-1/deberta-v3-large.tar.gz`.
- Preserved large epoch 2: the parent directory's `deberta-v3-large.tar.gz`.
- Exact download/demo commands: the bundle directory README and selected-epoch-1 README.
- Three distinct 119–140-word source messages and actual task-swapped outputs: `BASE_EXAMPLES.md` and `LARGE_EXAMPLES.md`.
- Training, smoke, selection and evaluation commands: `REPRODUCE.md`.
- Canonical and frozen dataset hashes: `DATASET_SHA256SUMS`; full IDs/seed/strata in the frozen split manifest.

All bundles include tokenizer/configuration, entity and section heads, truthful
architecture identifiers, pinned source revisions, checksums and upstream notices.
Base is 12 layers / width 768; large is 24 / 1024. Both use the verified, byte-identical
DeBERTa tokenizer, four known markers and adequate embeddings. `tokenizer-probe.json`
explains the unrelated Transformers Mistral warning; no Mistral modification was
applied. The training-only final-pipeline sanity test passed all five raw and
actual task switches, with all 41 required facts retained and no false removal.
The full integration suite passed 195 tests with two skips.

Base's published CPU bundle passed offline application loading and exact
export/reload parity: roughly 2,369 MiB peak RSS and 3.62s warm inference on a
134-word message with four CPU threads. Large epoch 2 also passed, at roughly
4,335 MiB and 11.84s. These are approximate concurrent-run measurements, not a
controlled benchmark. Selected large also passed exact CPU export/reload parity, at roughly
4,328 MiB and 10.72s warm inference; its six fresh application outputs match GPU
outputs exactly. Verification is in `STATUS.json` and `large/cloud/published-large-selected/verification.json`.

Base and large epoch 2 each complete all 16 actual CSV/XLSX round trips, with 15
exact fixture matches; selected large has 13. Its failures are retaining a masked
card sentence in the garden fixture, exposing the confidential 72,500-euro offer,
and missing the standalone person name Sofia Martin in the support CSV (with
subsequent alias numbering shifted). These are real failures despite all adapter
round trips completing. The six web gallery outputs were inspected; only the
budget output matches exactly, and remaining leaks include birth date/customer IDs.
Gallery and adapter fixtures are
training demonstrations, not unseen evaluation. Fresh-message diagnostics and
local mock-reply restoration are recorded separately; no external AI response
was requested or represented as real. On six fresh cases, selected large has zero
checked identifier/fact/identity failures, but misses both whole-section removal
targets: delivery removes only part of the cough paragraph and the clinician task
keeps the desk dispute. Base misses one of those two targets. Vague/blank tasks
retain topics while protecting identifiers; the benign example stays unchanged. On six fresh cases, selected large has zero
checked identifier/fact/identity failures, but misses both whole-section removal
targets: delivery removes only part of the cough paragraph and the clinician task
keeps the desk dispute. Base misses one of those two targets. Vague/blank tasks
retain topics while protecting identifiers; the benign example stays unchanged.

The initial large archive's upload was delayed about 25 minutes when an interruption
terminated the local monitor. It was uploaded on resumption before evaluation;
base uploaded about 75 seconds after packaging. The selected large checkpoint was
published separately as soon as selected/packaged. The large run's first attempt
also failed at reentrant gradient checkpointing; a fresh non-reentrant restart
completed both epochs. Failed sanity and training attempts are preserved honestly.

No UI or default-model change was made. The existing working DeBERTa remains
available as the fallback. Both task-created GPU instances and their 150GB boot disks were deleted after
public verification and evidence retrieval. GCP lists for the task prefix return
no instances or disks, verified at 01:44 UTC / 03:44 Helsinki. Estimated compute
is $2.64; a conservative total estimate of €5.64 includes a €3 storage/transfer/FX
allowance, below the €10 limit. This is not a billing invoice. See `budget.json`
and `CLOUD_CLEANUP.json`. No other project resources were deleted.
