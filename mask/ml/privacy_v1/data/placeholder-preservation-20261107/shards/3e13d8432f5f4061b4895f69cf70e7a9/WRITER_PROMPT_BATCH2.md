# Batch-2 writer instructions (Sonnet writers S1–S12)

You are a writer in a synthetic training-data campaign for Mask, a local privacy editor that rewrites a message before it goes to an external AI: private names become stable aliases like `[PERSON_1]`, direct identifiers and credentials become typed placeholders like `[EMAIL]` or `[SECRET]`, and useful facts stay exactly as written.

## Setup

- Work in the git worktree `/Users/markp/Code/sinceai-trusted/.claude/worktrees/mask-placeholder-campaign`. Run every command from that directory. Never cd into `/Users/markp/Code/sinceai-trusted` itself. Never stage, commit, push or switch branches.
- Python: `/Users/markp/Code/sinceai-trusted/mask/ml/privacy_v1/.venv/bin/python` (called PY below).
- Read fully before writing:
  1. `mask/ml/privacy_v1/data/placeholder-preservation-20261107/CAMPAIGN_BRIEF.md`, including **every coordinator ruling (1–23) at the end**. It is your governing brief.
  2. `mask/ml/privacy_v1/annotation/README.md` and `REVIEW_RUBRIC.md`.
  3. `mask/ml/privacy_v1/annotation/example.authoring.json` and `example.corporate.authoring.json`, for the schema only. Do not copy their content.
- Consult `mask/ml/privacy_v1/data.py` and `policy.py` only to explain a validation error. Do not read other shards' records.

## Your batch: exactly 20 records

The coordinator's message gives you your themes and your exact category/segment allocation. Each record is 100–180 words and has its own fresh `family_id`, `persona_id`, `source_id` and `template_id` slug. Record ID slugs: `id-NNN`, `pres-NNN`, `ben-NNN`, `cred-NNN`. Set `generator_model` to `claude-sonnet-5-5`. Claim with producer label `claude-sonnet-5-5 writer S<n>`.

## Why batch-1 records were rejected (avoid these)

All batch-1 rejections came from `required_facts`, not from the entities.

1. **A dependency in your notes with no required quote.** If your notes say the user "wants to stay with therapist X", then `I'd like to stay with` must be required. Check every dependency against `required_facts` before handoff (ruling 23).
2. **Missing direction, actor or condition words.** A swap required as `[A]` … `'s shift` without `will take` fails. Include the verb, negation, condition word (`If`, `only if`, `unless`) and correction marker (`Correction from`, `not`) inside the quotes (rulings 15–16).
3. **Same-type placeholders with no required labels.** When two `[ACCOUNT_ID]`s or `[PHONE]`s must be told apart, require their labels (`My patient number is`, `Policy no.`, `, text him on`), including labels in header lines such as `HR:` / `; manager:` (ruling 17).
4. **Copying brief examples.** Never use the brief's example names (Oyelaran, Nguyen Thi Lan, Kaveh, Szczepańska, Tauriainen, Ngata) or a shared phone number such as `07700 900871`. Invent every name and identifier fresh, from many origins (ruling 20).
5. **One credential template.** Do not write "YAML excerpt + `api_token: tok-demo-…` + nothing else changed + colleague rotated the key". Use a different setup for each credential record (ruling 21).
6. **Tagging service-account users, DB names or `*.test` hosts.** Leave them untagged (rulings 3 and 22).
7. **Dropping the connective next to an alias.** `Until`, `If`, `unless`, `only if`, and the verb between two aliases (`told`, `will take`, `is swapping with`) must sit inside a required quote. Otherwise "[PERSON_3] actually pays, I'm not counting…" becomes a flat statement (ruling 24). In chat logs, require the speaker labels when the task asks who said what, and the timestamps when it asks for a timeline (ruling 25).
8. **A reason that contradicts its label.** If the reason says the user will re-insert the value, mark it `essential`, not `unnecessary` (ruling 18).
9. **Final pass.** For every sentence containing an alias or placeholder, confirm its verb, connective and role words are inside a required quote, unless the task truly does not depend on that sentence.

## Workflow

1. Claim your shard: `PY -m mask.ml.privacy_v1.annotation.tools claim --root mask/ml/privacy_v1/data/placeholder-preservation-20261107/shards --producer "claude-sonnet-5-5 writer S<n>" --split train`. Work only inside the returned directory. Put scripts and temp files in its `scratch/`. A small builder script that takes exact quotes and replays `approved_output` with the project's own functions (`from mask.ml.privacy_v1.data import resolve_record, replay` or similar; check `data.py`) is the reliable way to get exact output. Never hand-count offsets.
2. Write `draft-01.json` (an array of 20 authoring records, `review: {"status": "pending"}`, `provenance` with `synthetic: true`, `human_audited: false`, `generator_id` from your claim and `generator_model`) and `author-notes-01.jsonl` (fields listed in the brief: `record_id`, `category`, `segment`, `domain`, `format`, `features`, `dependencies`).
3. `PY -m mask.ml.privacy_v1.annotation.tools resolve --input <shard>/draft-01.json --output <shard>/resolved-01.jsonl`, then `... validate --input <shard>/resolved-01.jsonl`.
4. `PY mask/ml/privacy_v1/data/placeholder-preservation-20261107/shards/3e13d8432f5f4061b4895f69cf70e7a9/campaign_tool.py stats --input <shard>/resolved-01.jsonl --notes <shard>/author-notes-01.jsonl` and fix every reported problem. Repairs go to new versioned files (`draft-01b.json` → `resolved-01b.jsonl` with `author-notes-01b.jsonl`); outputs are exclusive-create.
5. Read every replayed `approved_output` yourself. Check that it is readable, that aliases stay stable across repeated mentions and distinct across people, that no protected value appears in output or required facts, and that each dependency is covered by a complete claim.
6. Export the blind file from your final resolved file: `... campaign_tool.py blind --input <shard>/resolved-01<x>.jsonl --output <shard>/blind-01.jsonl`.

## Report back

Report your shard directory and `shard_id`, the exact final resolved, notes and blind file names, the validate summary with record hashes, the helper stats JSON, a one-line list of the 20 records, and any ambiguity you hit.
