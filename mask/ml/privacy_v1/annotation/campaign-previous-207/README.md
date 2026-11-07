# Earlier synthetic Mask training campaign

The final reviewed source dataset is `shards/199f90e83aa14b8eaa9dc617b1310f43/accepted-final-01.jsonl`; its compiled counterpart is `training-final-01.jsonl` in the same directory. Their manifests report 207 accepted train records across 184 source families. Reviews are model reviews, not human audits or release-grade evidence. The source shard directories preserve draft, validation, review and rejection history.

A cross-campaign merge check using the updated annotation workflow passed for these 207 train records together with the 50 train and 50 dev records in `../campaign-2026-11-07/`. This checks the implemented split, source and template rules; it does not guarantee semantic independence. Keep the separate dev records out of training.
