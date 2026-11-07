# Synthetic Mask annotation campaign

User-adjusted target: 50 train and 50 dev records. All 100 delivered records have distinct model reviewers and hash-bound accepted reviews; none is human-audited. Source workflow revision: `7602aa9e6ae0d877126f8baef5dedf4438c77ffa`. Authors and reviewers used `gpt-6.1-terra`.

The deliverables are in `shards/baa368e830134852980cfb6c170455c2/`:

- `train-accepted.jsonl` and `train-compiled.jsonl`: 50 train records.
- `dev-accepted.jsonl` and `dev-compiled.jsonl`: 50 dev records. Keep these out of training.
- `adapter-fixtures/`: 10 CSV and 5 values-only XLSX training-derived fixtures and `manifest.json` containing intended uses, source record IDs, hashes and expected cell outputs. They are not message records or independent evaluation evidence. These expected outputs are derived from accepted message annotations; they have not been established as actual adapter/model predictions.
- Reviewed source, pending source, author notes, blind review, hash-bound reviews, rejections and repairs are preserved in the individual claimed shard directories. The additional dev batch `resolved-10.jsonl` is pending and excluded; its author flagged a missing health annotation.

Both accepted splits were structurally validated, independently reviewed and compiled without `--allow-unreviewed`. The cross-split merge check passed on all 100, including grouping, normalized source and template overlap checks. Such checks do not prove the absence of semantic relationships. This is development data, not release-grade test evidence or a privacy guarantee.

## Coverage and limitations

| Measure | Train | Dev |
| --- | ---: | ---: |
| Accepted records | 50 | 50 |
| Distinct families | 40 | 43 |
| Consumer / corporate families | 28 / 12 | 29 / 14 |
| Records with a task-swapped source | 20 | 14 |
| Clean negatives (no changing decisions) | 15 | 18 |
| Records with section DROP | 13 | 9 |
| 90–130 words | 7 | 0 |
| 100–150 words | 0 | 0 |
| Median word count | 61 | 60 |
| Word count range | 50–95 | 56–67 |

Actions (decision count): train ALIAS 22, KEEP 18, DROP 13, PLACEHOLDER 28; dev ALIAS 24, KEEP 15, DROP 9, PLACEHOLDER 13. The records include personal, health, finance, support, workplace and technical scenarios. The target for mostly 90–130-word messages and the rubric's preferred 100–150-word subset was not met. The dev batch has a high clean-negative share. These are coverage limitations, not reasons to misrepresent or silently rewrite accepted examples.

The 40-record train checkpoint underwent two-reviewer calibration. Initial blockers included incomplete task-critical facts and an irrelevant sensitive disclosure; repaired cases were reviewed again. Other review blockers included insufficient placeholder explanations and one confidential commercial value. Final accepted outputs preserve the hash-bound reviews and record any limited utility from protected inputs. Structural and independent model review do not establish effectiveness in production.
