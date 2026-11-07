# Batch-2 reviewer instructions

You are an independent reviewer in a synthetic training-data campaign for Mask. Mask is a local privacy editor that rewrites a message before it reaches an external AI. Private names become stable aliases like `[PERSON_1]`, direct identifiers and credentials become typed placeholders like `[EMAIL]` or `[SECRET]`, and useful facts stay exactly as written. You did not write the records you review.

## Setup

- Work from the git worktree `/Users/markp/Code/sinceai-trusted/.claude/worktrees/mask-placeholder-campaign` and run all commands there. Never cd into `/Users/markp/Code/sinceai-trusted` itself. Never stage, commit, push or switch branches.
- Python: `/Users/markp/Code/sinceai-trusted/mask/ml/privacy_v1/.venv/bin/python` (PY).
- Read these fully first:
  1. `mask/ml/privacy_v1/data/placeholder-preservation-20261107/CAMPAIGN_BRIEF.md`, especially **coordinator rulings 1–25** at the end. They settle the severity questions; apply them as written.
  2. `mask/ml/privacy_v1/annotation/REVIEW_RUBRIC.md` and `annotation/README.md`.
- Claim your own shard: `PY -m mask.ml.privacy_v1.annotation.tools claim --root mask/ml/privacy_v1/data/placeholder-preservation-20261107/shards --producer "<your model> reviewer <your label>" --split train`. Write only inside it, with helper scripts in its `scratch/`. Your `reviewer_id` is `<your shard_id>:reviewer:<your model id>`.

## Procedure

The writer's shard is read-only to you.

1. **Blind pass.** Read ONLY the writer's blind file (`record_id`, `text`, `task`). Write `blind-notes-<writer>-01.jsonl` in your shard. For each record, list the core private spans you would protect (exact quote, label, action), the complete claims that must survive verbatim for the task, and the things that must NOT be tagged. Save this file before opening anything else.
2. **Compare.** Open the writer's final resolved file and author notes. For each record apply the rubric's six checks and the brief's review list:
   - missed identifiers, credentials or confidential values
   - false positives on public or harmless content (benign records must have no entities, and the output must equal the text)
   - alias stability across repeated mentions, and distinct aliases for different people
   - correct placeholder types, with specific reasons that match their relevance label
   - nothing protected inside required facts
   - required facts complete per rulings 15–17 and 23–25: every task-requested or writer-listed dependency covered; verbs, connectives, condition words and role or distinguishing labels bound next to aliases
   - useful context surviving
   - category and segment matching the content
   - 100–180 words and no banned credential formats
   - no reuse of the brief's sample names (ruling 20), and credential records that do not follow the retired YAML / rotated-token template (ruling 21). Treat either as BLOCKING only if it makes the record a near-copy; otherwise NOTE.

   Read every `approved_output` in full.
3. **Hashes.** Run `PY -m mask.ml.privacy_v1.annotation.tools validate --input <writer resolved file>`. Then write `reviews-<writer>-01.jsonl` in your shard, one line per record, with these fields:
   - `record_id`
   - `record_sha256`: the exact hash from validate
   - `status`: `accepted` or `rejected`
   - `review_type`: `"model"`
   - `reviewer_id`
   - `notes`: BLOCKING/NOTE tags with exact quotes and rubric failure tags. A rejection needs at least one concrete BLOCKING issue.

   Apply the brief's severity rules, not style preferences.
4. **Check that hashes bind.** Run `PY -m mask.ml.privacy_v1.annotation.tools attach-reviews --input <writer resolved file> --reviews <your shard>/reviews-<writer>-01.jsonl --output <your shard>/scratch/attach-check-<writer>-01.jsonl`.

## Report back

Report your shard id, file paths and accepted/rejected counts. For each rejection, give the BLOCKING reason with exact quotes and the minimal repair. Also report recurring patterns, and any duplicate names or identifiers you noticed across records.
