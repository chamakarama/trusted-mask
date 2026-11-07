# Coordinator merge: 237 accepted records (2026-11-07)

Synthetic schema-v2 training records, made by following `TRAINING_DATA_PROMPT.md` and the annotation README.
The original target was 2,000. On request it was cut to 500, then stopped early at 237 so the data could be pushed.

- `merged-01.jsonl`: 237 records, 212 families, split `train`, all `review.status = accepted`, all 50-150 words.
  Made with `tools merge` from every `accepted-*.jsonl` of this run. `validate` reports valid.
  sha256 cf904d62c2ec3c9a69f27cb63684740c033b4f476f445365d051268ba67406c0
- `training-01.jsonl`: `tools compile` output (adapter `privacy-v2-separated`), with no `--allow-unreviewed`.
  sha256 578fd20f77300c6d5d23f195aaa7e48dfee1f9883e6eb4671a2c9c00aff2f9a1

## How it was made
- Writers and reviewers: Claude Sonnet 5.5 (model review, not human-audited, not release evidence). Each batch has a
  writer shard and a separate reviewer shard (different generator_id). Review was blind first, then compared with the
  full record and bound to the record hash. Up to two repair rounds were allowed.
- 37 records come from a 40-record checkpoint (shards 4090..., 0460..., 45b4..., bb97...). The other 200 come from
  scale wave 1 (12 batches of about 15 seeds).
- Calibration: the other reviewer identity cross-reviewed batches. See the `*calibration*` reviewer shards.
- Rejections: 4 first-pass rejections (1 at the checkpoint, 3 in shard 8ba7...). All were repaired and accepted on
  re-review. Nothing is quarantined.
- Scratch folders (helper scripts, blind-pass notes) are not committed.

## Known limitations, found by the wave-1 quality check
1. Checkpoint addendum item 3 told writers to section-DROP credential clauses as SECRET, but the validator rejects
   direct-identifier labels on section DROPs. Writers worked around this in different ways. Shard 8ba7... rewrote
   source text while keeping its source_id, so its author notes are stale.
2. Severity was not consistent: one reviewer blocked on addendum style items that others only noted (calibration
   31/34, kappa on blocking 0).
3. The credential phrase "my password is ..., I'll change it later" appears in 7 records. Many name tokens repeat
   across shards. The corporate share is about 25% (target 30%) and task pairs about 20% (target 25%).
The planned fix for later batches: placeholder only the identifier value and never require its frame text, plus an
explicit BLOCKING/NOTE severity table.
