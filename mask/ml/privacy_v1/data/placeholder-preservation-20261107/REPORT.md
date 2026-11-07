# Placeholder accuracy and context preservation campaign (2026-11-07)

Synthetic English training data for Mask. The records teach accurate identity, contact and account placeholders and stable person aliases, while exact useful facts survive. This is **model-reviewed engineering data**: no record has been human-audited, and none of it is release or evaluation evidence.

## Deliverables

| File | Records | sha256 |
|---|---:|---|
| `train.authored.jsonl` (schema v2, reviewed) | 300 | `a91060a691d5737c3b1f0653e67353b14d0127859e9cd407a9b5814b0f17510d` |
| `train.jsonl` (compiled, `privacy-v2-separated`) | 300 | `eab8e91338a196f73b6268db32f682d6403fa28963bc61719a3eef6bb79a62fc` |
| `coverage.json` | machine-readable coverage | |
| `SOURCE_MANIFEST.json` | every accepted input file with hashes, writer/reviewer shard producers | |
| `diversity-audit.json` | repeated identifiers, repeated names, near-duplicate check | |

Both data files pass `annotation.tools validate`. All 300 records have `split: train`, an independent accepted model review bound to the exact record hash, and `human_audited: false`. Each record is its own source family: 300 families, 300 sources and 300 distinct texts.

## Coverage against the request

| Category | Target | Accepted | Consumer | Corporate |
|---|---:|---:|---:|---:|
| Identity/contact/account placeholders | 180 | 180 | 138 | 42 |
| Difficult preservation (negation, corrections, quantities, conditions, multi-person) | 60 | 60 | 48 | 12 |
| Benign, no edits (public names, harmless technical identifiers) | 30 | 30 | 18 | 12 |
| Credential or confidential business | 30 | 30 | 6 | 24 |
| **Total** | **300** | **300** | **210 (70%)** | **90 (30%)** |

- **Length:** 100–157 words, mean 118. Buckets: 100–119: 188, 120–139: 90, 140–159: 22. Nothing is under 100.
- **Token fit:** checked with the local `encoder-b-pilot` (MiniLM) tokenizer. The longest text+task is 289 tokens, against a 512 limit. The DeBERTa tokenizer and marked-span action inputs were **not** checked.
- **People:** 1,084 PERSON mentions in total, all ALIAS. 249 records have two or more distinct people, and 179 mention the same person more than once (full name, then first name, surname with a title, or possessive). Every mention of one person shares one `entity_id`, so it renders as one `[PERSON_n]`.
- **Decisions by action and relevance:** ALIAS/unnecessary 1,084; PLACEHOLDER/unnecessary 429; PLACEHOLDER/essential 180, where the task needs the value and the reason states the utility loss; KEEP/essential 82, for detected sensitive facts the task needs and may disclose.
- **Benign:** all 30 benign records have no entities and no decisions, and their output equals their text.
- **Section DROP decisions:** 0. The request set no DROP quota, and writers built retention-focused scenarios. Where a source held material the task didn't need, writers protected it with a typed PLACEHOLDER and a specific reason; they never kept it. `coverage.json` has the full counts by label/action and action/relevance.
- **Corporate coverage gaps:** none recorded. No accepted case depends on an unsupported confidential type.
- **Overlap with the existing 516-record train release:** 0 exact text matches. The highest 5-gram Jaccard similarity to any old train text is 0.017. No dev or test file was read.

## Process

1. **Brief.** I wrote `CAMPAIGN_BRIEF.md`. It follows `SECTION_DATA_INSTRUCTIONS.md` (commit `5c1767f`, on `origin/codex/section-removal-pipeline`) for schema, review, private shards and publishing. It replaces that file's 500-record quota and task-pair allocation with this campaign's. Twenty-six numbered **coordinator rulings** were added as writer and reviewer questions came up. Rulings 15–17 and 23–25 settle the required-fact severity, rule 20–21 address diversity, and rule 26 settles corporate compensation.
2. **Batch 1.** Six Opus 5.5 writers each produced 10 records.
3. **Calibration.** Two independent Opus reviewers blind-reviewed the same 4 records, then compared their findings. Their spans, labels and alias groupings matched the writers on all four. They disagreed only on how severe a required-fact gap is. I settled that by rule (ruling 15), not by vote, and the record went to repair.
4. **Batch-1 review.** Six reviewers each took one writer: Opus R1 and R2 on W1 and W4, Sonnet R3–R6 on the rest. Each wrote blind notes from text and task alone, then compared against the annotations.
5. **Batch 2.** Twelve Sonnet 5.5 writers each produced 20 records, each with its own fresh Sonnet reviewer. The user asked for this switch to get more speed.
6. **Repairs.** Every rejected record got one repair round from its original writer and a hash-bound re-review by the same reviewer. None needed a second round, and none had to be replaced.
7. **Assembly.** `shards/3e13…/assemble.py` attached each review file to its exact resolved file and split accepted from rejected. It then merged the explicit accepted paths and compiled the result.

### Review outcomes

| | Accepted | Rejected |
|---|---:|---:|
| First pass, batch 1 (60) | 48 | 12 |
| First pass, batch 2 (240) | 235 | 5 |
| **First pass, all unique records** | **283 (94.3%)** | **17** |
| Repair round 1 (re-reviews) | 17 | 0 |

All 17 rejected first-pass versions are kept in `shards/3e13…/assembly/rejected-*.jsonl` with their review notes. None is in the training files.

**Recurring rejection causes:** 16 of 17 rejections were `required_facts` coverage gaps. The entities and outputs in those records were judged correct. The gaps were:

- A dependency listed in the writer's own notes had no required quote. Examples: the "open asks" in a rota, the "done" items in a checklist, a booking sentence.
- The verb, connective or condition word next to an alias was left out (`will take`, `told`, `spoke to`, `Until`, `If`, `I paid`, `Correction from`), so who-did-what or the condition was lost.
- When two same-type placeholders had to be told apart, their distinguishing labels were not required (`Policy no.:` / `Claim ref:`, `texted from` / `Her mobile is`).

The remaining rejection was a policy error, in S2 `id-010`. An HR officer had pasted a colleague's hourly rate, and the record KEPT it. It was repaired to a FINANCIAL placeholder, and ruling 26 was written. A scan of all corporate records found no other KEEP of third-party pay.

## Provenance

- **Generators:** `claude-opus-5-5` wrote 60 records (writers W1–W6) and `claude-sonnet-5-5` wrote 240 (writers S1–S12). Each writer claimed its own shard; `SOURCE_MANIFEST.json` lists shard to producer.
- **Reviewers:** the final accepted reviews come from `claude-opus-5-5` for 20 records (R1 on W1, R2 on W4) and from `claude-sonnet-5-5` for 280. Every reviewer was a separate fresh-context subagent with its own shard and `reviewer_id`. No writer reviewed its own work.
- **Limitation:** the 240 batch-2 records were written and reviewed by different instances of the same model family. They are independent contexts, but not independent models.
- **Coordinator:** a Claude Code session on `claude-opus-5-5`, shard `3e13d8432f5f4061b4895f69cf70e7a9`. It owns the brief, prompts, calibration files, helper scripts and assembly outputs.

## Deviations and known limitations

- **Base branch.** The work is on `annotation/placeholder-preservation-20261107`, cut from `main` (`c90f885`). The instructions file lives only on `origin/codex/section-removal-pipeline`. Annotation tooling on `main` matches that branch except for files the branch adds: `sections.py`, `section_audit.py` and a one-line `contracts.py` change.
  - **Consequence:** the `section_audit` exports were not produced, because that module is not on `main`. The campaign has 0 section DROP decisions, so those exports would contain no switched units.
- **Scaling gate.** Batch 2 started after calibration and after two of the six batch-1 reviews, not after the full first 50 accepted records were audited. The systematic issue, required-fact binding, had already shown up and gone into the writer prompt. Later batch-1 reviews found no new systematic problem.
- **Diversity** (`diversity-audit.json`):
  - There are no near-duplicate texts.
  - 25 fictional identifier values recur across records. The worst are phone `07700 900314`, in 8 records, and `07700 900418`, in 6. The UK fictional `07700 900xxx` range is small, and the writers defaulted to similar numbers.
  - 121 name tokens appear in 3 or more records. Examples: Adeyemi in 11, Kwabena in 10, Oluwaseun in 10. Some full names recur for unrelated people.
  - Batch-1 records use the brief's own example names (e.g. Kaveh, Oyelaran, Nguyen Thi Lan). Ruling 20, which forbids this, came after batch 1, and reviewers counted the reuse as a NOTE, not a blocker.
  - `tok-demo-` appears in 4 records, and the brief's sample key `qa_7f3c91e2_fake` in 1. None of these were rewritten, since that would need a fresh review. A later integrator may want to dedupe identifiers.
- **Thematic clustering.** Within some writer packs, scenarios cluster (bereavement, travel claims, community groups), even though every record is its own family.
- **Relevance edge cases.** Protected identifiers may be `essential` or `unnecessary` (ruling 1). Reviewers recorded the cases where a reason's wording doesn't match its label as NOTEs (ruling 18). Nothing leaked as a result.
- **Extra review evidence.** Reviewer R1 reviewed W2 before its scope changed (`shards/f537…/reviews-W2-01.jsonl`, plus blind notes for W2 and W3). Those files are kept as evidence but are **not** canonical. The canonical W2 reviews are R3's.
- **Scope.** Model review is not human audit. Nothing here claims accuracy or a privacy guarantee. Before training, an integrator should run cross-split duplication and leakage checks against dev/test.

## Paths

- **Run folder:** `mask/ml/privacy_v1/data/placeholder-preservation-20261107/`.
- **Writer shards:** `shards/<uuid>/`. Each holds `claim.json`, the draft, resolved and author-notes files with their repair versions, and the blind files.
- **Reviewer shards:** each holds `claim.json`, the blind notes and the reviews.
- **Coordinator shard:** `shards/3e13d8432f5f4061b4895f69cf70e7a9/`. It holds the prompts, the calibration files, `campaign_tool.py`, `assemble.py`, `build_coverage.py`, `diversity_check.py`, `assembly-pairs-extra.json`, and `assembly/` (reviewed, accepted and rejected per input).
- **Not published:** writer and reviewer `scratch/` directories are left out of the commit.
