# Mask: task-dependent section-removal data campaign v2

> Historical record: this is the brief given to the LLM writer and reviewer sessions that produced Mask's synthetic training data. The generated data and the branches it names are not included in this repository.

## Objective and precedence

Create **500 accepted synthetic English message records** that teach when a complete clause or paragraph can be removed, while preserving useful facts and stable person references. The measured problem is that both reviewed encoders missed all nine required whole-section removals on the 50-record dev set; merely expanding section candidates did not fix it. This campaign targets that failure, including false-removal controls. More data alone is not a promise of better performance.

These instructions supersede the old `TRAINING_DATA_PROMPT.md` for campaign size, coverage, length, paths and publishing. The schema, action registry and `REVIEW_RUBRIC.md` remain authoritative. This task creates data; it does not train a model, change runtime code/validators/tests, activate an experimental mode or modify the UI. Read this file, the rubric, `example.section-pair.authoring.json`, and `annotation/README.md` for the schema/commands. Consult `data.py`, `policy.py` and `sections.py` when a contract question arises. Do not read dev/test answers, copy the existing gallery or use model predictions as ground truth.

## Deliverable and quotas

| Slice | Sources/families | Records | Purpose |
|---|---:|---:|---|
| Same source, two intended uses | 200 | 400 | At least one complete sensitive section is essential and permitted KEEP in one task, unnecessary DROP in the other |
| Relevant sensitive content controls | 50 | 50 | Protect identities but keep useful sensitive facts; do not remove a section just because it mentions health or money |
| Benign controls | 25 | 25 | No private content or edits; preserve public names, ordinary technical content and harmless numbers |
| Vague-task controls | 25 | 25 | Uncertain relevance stays uncertain; protect direct identifiers and avoid unjustified section removal |
| **Total** | **300 distinct sources/families** | **500** | Task copies are not independent sources |

Use **70% consumer / 30% corporate by distinct families**: 140 consumer + 60 corporate paired sources, and 70 consumer + 30 corporate controls. Target 210/90 families overall. Report minor quota shortfalls rather than relaxing acceptance. Do not pad, relabel controls as pairs, or count rejected records toward the target.

Among the 200 paired sources, target 90 with blank-line paragraphs, 70 with relevant and irrelevant clauses mixed in one paragraph, 20 email/log/bullet excerpts, and 20 short CSV/TSV-like pasted tables. Treat this as a format allocation, separate from consumer/corporate quotas. CSV/TSV cases are `input_kind: message`, not spreadsheet-file training or evidence of XLSX handling. Use meaningful headers and readable rows; target complete row/section removals only when justified. Report table cases whose column-dependent edits cannot be represented by the current contract as gaps, outside accepted quotas.

Aim for most prose sources at 100–180 words, with at least 60% of distinct prose sources at 100+ words. Short natural notes/tables are allowed; no filler or hard minimum. Keep each source plus task within the encoder window (512 tokens for the current encoder inputs). If a compatible local tokenizer is available, check both detector and marked-span action inputs without network downloads. Otherwise report token fit as unverified; word count is not proof. Split genuinely overlong sources into coherent independent examples before annotation, never silently truncate annotated text.

## Source realism and task contrasts

Write messages people would actually paste: a visit note, school email, invoice, customer ticket, meeting excerpt or useful log. Let unrelated information occur naturally in the source. Never add “this is private”, “unrelated to my task” or “accidentally copied” simply to tell the model the label. Confidentiality can be explicit where natural, but must not always depend on one keyword. Put intended use in `task`; do not hide answer labels inside source headings or task wording such as “drop paragraph three”. Vary section position so removal is not always at the end. Some correct outputs remove nothing.

For each pair, keep `text`, entity annotations and source/family/persona/template IDs **identical**. Change record ID, task, decisions, required facts and expected output. Choose two plausible uses of the same source, not “summarise” versus “summarise in bullets”. At least one complete section must actually switch between essential permitted retention and unnecessary removal. Both variants must be accepted before counting an accepted pair. Never manufacture the switch by changing policy or making a clearly relevant fact unnecessary.

Consumer examples: work restrictions versus a personal appointment checklist; school logistics versus a learning-support summary; invoice reconciliation versus a service complaint; travel logistics versus an insurance timeline. Do not assume medical history is irrelevant to a medical question. Use administrative tasks when omission is clearly justified. Annotators are not making clinical safety judgments.

Corporate examples: troubleshooting versus billing review; a service schedule versus an authorised expense calculation; a public status summary versus technical incident analysis. Include HR, finance, sales/procurement, support and engineering cases across the corporate allocation. A task does not authorise sending restricted information to external AI. Essential confidential values remain protected, with utility loss acknowledged. Such a case can be a control but does not count as a KEEP/DROP pair unless a different **permitted** section genuinely switches. Never portray necessary-but-forbidden data as unnecessary just to obtain DROP.

Include negation, corrections, conditions, hedges, several people and repeated references. Keep roles: `My partner, Mateo Silva, ...` becomes `My partner, [PERSON_1], ...`. Preserve permitted doses, quantities, commitments and chronology when the answer depends on them. Ordinary role words/public names are not automatically sensitive. Unsupported trade secrets belong in the existing corporate-coverage-gap format; never call proprietary code SECRET merely to pass a validator.

All content must be invented. Use reserved domains for contact examples and fictional credentials. No real private data, credential inspection or private-source scraping. Do not copy documentation examples as accepted records or inflate volume by swapping names in one template.

## Authoring: teach sections without corrupting entity labels

Use schema v2 with exact quotes; let `resolve` calculate Unicode offsets. Every independent source starts with fresh group slugs under its writer's claimed UUID. Reuse groups only for intentional related variants; all members remain in one split. Task-pair entities are goal-independent. A broad paragraph is not one entity: annotate actual names, values and meaningful sensitive claims, then a separate section treatment.

- A `kind: section` decision is **only** `DROP` with `relevance: unnecessary`, an honest contextual label (normally HEALTH, FINANCIAL, EMPLOYMENT or FAMILY) and a specific reason. It may cover several entities; omit child decisions inside it. Never label a person-only deletion as section removal.
- Retained sections are supervised through essential permitted entity KEEP decisions and `required_facts`. There is **no section KEEP action in schema v2**. Do not invent it, a SECTION label or custom replacement text.
- Private PERSON references in retained text use ALIAS; direct identifiers use the existing protections in both tasks. Only PERSON aliases are numbered today. Do not invent `[SECRET_1]` or change renderer behavior. Relevant secret values must not enter `required_facts` verbatim.
- DROP must cover a whole coherent runtime clause/paragraph, including boundary whitespace/punctuation where needed for exact readable output. Use `section_units(text, CLAUSE_MODE)` and `section_units(text, SECTION_MODE)` to inspect candidates. A section can cover several complete units, but must not cut through a retained unit. Do not remove a bare sensitive noun and leave broken grammar.
- If a unit mixes relevant and irrelevant content that cannot be safely separated at supported boundaries, keep it with the appropriate smaller protective edit or record a boundary gap. Do not sacrifice a required fact to increase DROP counts. Unlabelled text is not an automatic DROP or KEEP training label.

Before writing required quotes, list the task's answer dependencies in an author sidecar. Required facts are **minimal complete claims**, not isolated values: `The patient should avoid lifting more than 5 kg for six weeks.` preserves the restriction; `5 kg` does not. Include actor/action, negation, uncertainty, units, conditions and corrections as needed. Split exact claims around aliased names. Include what the answer actually depends on; do not make every retained sentence mandatory or require a value absent from the source.

The worked pair is a pending documentation fixture, not independently reviewed training data. The manager email keeps work restrictions and drops the clinical paragraph; the appointment checklist keeps both. Both protect the name and remove reception administration. Inspect its exact output rather than copying its source.

For each pair write a sidecar `pair-notes-01.jsonl` entry with `family_id`, the two `record_ids`, `domain`, `source_format`, exact `switch_quotes`, the KEEP-task reason, the DROP-task reason, any disclosure limit and the necessary answer dependencies. Sidecars are audit metadata, never model input. Controls need `record_id`, `control_type`, domain/format and dependencies. Review must verify the context switch from the actual final annotations, not just the notes.

## Efficient independent production and review

Use the models actually available in the runner; record their real identities. This prompt does not automatically choose Sonnet or any other model. Where subagents are available, use up to 10 writer packs of 50 records (20 paired families + 10 controls each), with a smaller pool of independent reviewers. Each pack targets 14 consumer + 6 corporate paired families and 7 consumer + 3 corporate controls. The coordinator allocates control subtypes and source formats to meet the totals. Give each worker exclusive ownership; never share scratch files. Without subagents, draft sequentially and obtain independent review from another agent/session; do not forge an independent reviewer identity.

Calibrate two reviewers on the same four records (two complete pairs), first blind source/task assessment, then comparison with annotations. Resolve rubric interpretations, not disagreements by majority vote. Produce the first 50 accepted records, including all three control types, and audit their full outputs/pair switches before scaling to 500. This is an internal quality gate; no routine user reconfirmation is needed. If there is a systematic blocking problem, correct the instructions' interpretation before producing more of it.

After calibration, **one independent review per record/pair** is enough; no blanket multiple-reviewer rounds. Give the reviewer both tasks for a pair, with writer labels hidden initially. Use the rubric's six checks plus:

1. Does the same source have a real, justified KEEP/DROP switch under the two goals?
2. Is each DROP a complete supported unit with no required fact or residual fragment exposing the same disclosure?
3. Does required-fact coverage preserve the meaning, especially negation/conditions/attribution?
4. Does the protected message still let an AI perform the requested task, or truthfully document any disclosure-driven utility loss?

Major leaks, unjustified deletions, wrong meaning, policy/schema errors and fabricated review are blocking. Style preferences, harmless details and speculative minor privacy clues are nonblocking notes. Limit each record to two repair rounds; preserve rejects and replace failed pairs rather than repeatedly polishing or finding a more lenient reviewer. Hash-bind review to the final record. Both task variants need acceptance. Do not claim model review is human audit or release validation.

## Paths, commands and handoff

Use an available Python with the repository dependencies; the local `.venv` path is not guaranteed to exist in every checkout. The commands below use `python`. Work on your own branch/worktree if another agent is editing the checkout; never switch/reset someone else's working branch. All new campaign artifacts live under one new folder:

`mask/ml/privacy_v1/data/section-removal-<RUN_ID>/`

Choose a unique RUN_ID. The coordinator owns this folder; writers/reviewers own individual UUID shards within it. Claim using the supported custom root:

```sh
python -m mask.ml.privacy_v1.annotation.tools claim --root mask/ml/privacy_v1/data/section-removal-<RUN_ID>/shards --producer ACTUAL_MODEL_SESSION --split train
```

Use the returned directory/IDs. Writers put helper scripts in their own `scratch/`; reviewers claim their own shard. All accepted generation records in this campaign are train. Do not add to the old 516-record release, change dev/test, generate fake final-test evidence, or overwrite other runs. Independent held-out task-pair generation is a separate assignment.

For each versioned batch, using actual claimed paths in place of the placeholders:

```sh
python -m mask.ml.privacy_v1.annotation.tools resolve --input WRITER_SHARD/draft-01.json --output WRITER_SHARD/resolved-01.jsonl
python -m mask.ml.privacy_v1.annotation.tools validate --input WRITER_SHARD/resolved-01.jsonl
python -m mask.ml.privacy_v1.annotation.tools attach-reviews --input WRITER_SHARD/resolved-01.jsonl --reviews REVIEWER_SHARD/reviews-01.jsonl --output WRITER_SHARD/reviewed-01.jsonl
```

The reviewer owns its review file; use `validate`'s exact record hashes. Filter accepted records into a new versioned file without changing content; retain rejected records and notes separately. The coordinator merges explicit accepted **authored** paths, not globs, then compiles:

```sh
python -m mask.ml.privacy_v1.annotation.tools merge --inputs SHARD_A/accepted-01.jsonl SHARD_B/accepted-01.jsonl --output RUN_DIR/train.authored.jsonl
python -m mask.ml.privacy_v1.annotation.tools compile --input RUN_DIR/train.authored.jsonl --output RUN_DIR/train.jsonl
python -m mask.ml.privacy_v1.section_audit --data RUN_DIR/train.authored.jsonl --section-mode clause-probe-v1 --output RUN_DIR/section-targets.clause.json
python -m mask.ml.privacy_v1.section_audit --data RUN_DIR/train.authored.jsonl --section-mode paragraph-probe-v1 --output RUN_DIR/section-targets.paragraph.json
```

`RUN_DIR` above means the actual new campaign directory, not a shell variable that has been set for you. Never use `--allow-unreviewed` for deliverables. Both authored/compiled files represent the same records; section exports are derived labels, not extra examples. The present trainer does not consume the auxiliary section-target format automatically. Inspect the exports: all claimed switched units must have unnecessary targets for the DROP task and essential targets for the KEEP task. Omit purely structural headings from switch-count claims. Check boundary coverage before reviewers sign off, and preserve unsupported boundaries as gaps.

Coordinator final checks: whole-batch validation, exact duplicate and obvious template-copy inspection, complete pair acceptance, identical task-pair entities/groups, truthful split/provenance, exact replay, required facts, and reported achieved coverage. The merger enforces several grouping checks but cannot prove semantic relatedness or within-train diversity. Do not inspect held-out labels to optimise examples; the later integrator can run cross-split leakage checks before training.

Write `REPORT.md` and a machine-readable `coverage.json`: accepted/rejected records, unique families, accepted complete pairs, actual switched units, domain/format/control counts, length distribution, section essential/unnecessary/uncertain/unlabelled counts, token-fit status, recurring failures, corporate/boundary gaps and paths. Separate first-pass acceptance from revision attempts. Include a source manifest with explicit accepted shard paths/hashes and generator/reviewer identities. No guessed accuracy or privacy guarantees.

**Publishing is part of this assignment.** Writer/reviewer subagents do not commit shared changes. After validation, the coordinator commits and pushes only its campaign folder and review provenance to its own branch. Exclude environments, credentials, caches and scratch scripts; preserve rejects/review evidence in clearly separate files. Do not force-push, merge to main, replace canonical release files, or include another agent's changes. Report the branch, commit, exact train/authored/section-target paths and counts. An integrator can combine this reviewed extension with the existing release once duplication/leakage checks pass. If independent review or Git access is unavailable, report the precise incomplete stage and preserve pending work; never mark it accepted/pushed.
