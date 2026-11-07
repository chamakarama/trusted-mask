# Demo training addendum

22 synthetic English train-only messages: the two exact video scripts plus 20 newly authored related messages. Six are selected in `demo/web-examples.json` for optional gallery integration. 15 consumer / 7 corporate source texts; related scenarios intentionally share family/template IDs and remain entirely in training.

`accepted.jsonl` and `training.jsonl` are the final reviewed source and compiled addendum. Original pending authoring, dependency notes and blind inputs are in the author shard; reviewer directories preserve independent blind findings and hash-bound comparisons. Four initial examples received a second independent calibration review. No model review is represented as human audit.

The complete canonical dataset, including this addendum, is `../../data/training-2026-11-07/`. Use its `train.jsonl` and `dev.jsonl`; do not add this addendum twice. These examples are demo training material, not independent benchmark or test examples. No runtime policies, UI or weights are changed.
