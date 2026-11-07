# Mask campaign: placeholder accuracy and context preservation (2026-11-07)

Coordinator: claude-opus-5-5 (Claude Code session). Coordinator shard: `shards/3e13d8432f5f4061b4895f69cf70e7a9`.

## Precedence

Follow `mask/ml/privacy_v1/annotation/SECTION_DATA_INSTRUCTIONS.md` (commit `5c1767f` on `origin/codex/section-removal-pipeline`) for schema, independent review, validation, private working directories and publishing, **except** for its 500-record quota and its mandatory task-pair allocation, which this campaign replaces. `annotation/README.md`, `annotation/REVIEW_RUBRIC.md`, `annotation/TRAINING_DATA_PROMPT.md` (schema/decision sections), `example.authoring.json` and `example.corporate.authoring.json` stay authoritative for the schema, action rules and acceptance checks. Fix your data, never the validator. Do not change runtime/UI code, tests, old datasets or other shards.

## Deliverable

**300 accepted synthetic English records, every record its own independent source family** (fresh `family_id`, `persona_id`, `source_id` and `template_id` slugs per record; no task pairs, no name-swapped templates).

| Category | Code | Records | What it teaches |
|---|---|---:|---|
| Identity/contact/account placeholders | `identity` | 180 | Realistic messages where names become stable `[PERSON_n]` aliases and emails, phones, addresses, usernames, account/policy/order numbers, IBANs, cards and IDs become typed placeholders, while the substantive request (amounts, dates, symptoms, deadlines, who-did-what) survives exactly |
| Difficult preservation | `preservation` | 60 | Negation, corrections ("not X, it's Y"), exact quantities/units, conditions ("only if"), hedges and relationships among 2–4 distinct people, with aliases that keep who said/did/owes what |
| Benign, no edits | `benign` | 30 | Zero entities and zero decisions; `approved_output` equals `text`. Public names in public roles (authors, historical figures, public companies, products, public bodies) and harmless technical identifiers (HTTP status codes, error codes, version numbers, port numbers, public package names, ISBNs, public standards, sample IDs in public docs) |
| Credential or confidential business | `credential_confidential` | 30 | Passwords, API keys, tokens, connection strings (SECRET), confidential client names (ORG) and nonpublic commercial figures (FINANCIAL) are protected, while the useful surrounding context (error messages, config structure, the question, public facts, timelines) survives |

**70% consumer / 30% corporate families: 210 consumer, 90 corporate.** Each writer pack of 50 targets:

| Category | Consumer | Corporate | Total |
|---|---:|---:|---:|
| identity | 23 | 7 | 30 |
| preservation | 8 | 2 | 10 |
| benign | 3 | 2 | 5 |
| credential_confidential | 1 | 4 | 5 |
| **Total** | **35** | **15** | **50** |

Report shortfalls rather than relaxing acceptance. There is **no DROP quota**. Write naturally retention-focused scenarios, where the sensitive facts present are mostly what the task needs. If a source does contain genuinely unnecessary sensitive material, protect it (a whole-unit section DROP or a typed PLACEHOLDER with a reason). Never KEEP unnecessary sensitive material to look "retention-focused".

## Source realism

- **Length:** 100–180 words of `text`, without padding or filler. Benign cases too. Stay well inside 512 encoder tokens (source plus task).
- Formats people actually paste: emails, chat messages, notes, support tickets, bullet lists, short logs/config excerpts, meeting notes. Vary voice, punctuation and where identifiers appear.
- **Names:** include repeated names (full name then first name, or surname with a title, or possessives like `Ilse's`), unfamiliar and non-English-origin names in English prose (e.g. Oyelaran, Nguyen Thi Lan, Kaveh, Szczepańska, Tauriainen, Ngata), and two to four distinct people in many records. Every mention of the same person shares one `entity_id`, so every mention renders as the same `[PERSON_n]`. Distinct people get distinct `entity_id`s. Exclude honorifics (`Dr`, `Mrs`) from PERSON spans. Annotate `Ilse` in `Ilse's`, not the `'s`.
- **Role words survive:** `my landlord, Pieter Vos,` becomes `my landlord, [PERSON_1],`. Do not tag role words as FAMILY unless the relationship is itself the sensitive claim.
- **Exact useful facts:** keep amounts, units, dates/deadlines that the task needs, doses, counts, percentages and ordinals verbatim (KEEP, not placeholder) when permitted.
- **Invented content only.** Emails on reserved domains (`example.com`, `example.org`, `example.net`, `*.example`, `*.invalid`, `*.test`). Phone numbers in fictional ranges (UK `07700 900xxx`, US `555-01xx`, or clearly made up). Fake IBANs/cards/IDs that are obviously synthetic.
- **Credential format rule (blocking):** never imitate real provider key formats, because GitHub push protection will block the publish. No `AKIA…`, `ghp_`/`gho_`/`github_pat_`, `xoxb-`/`xoxp-`, `sk_live_`/`sk_test_`/`rk_live_`, `sk-…` OpenAI/Anthropic style, `AIza…`, `-----BEGIN … PRIVATE KEY-----`, JWTs (`eyJ…`), or real cloud connection-string formats with real hosts. Use invented shapes such as `tok-demo-4Rf8Lq2ZpW`, `pw: Lantern!Fig42`, `key=qa_7f3c91e2_fake`.
- Never write "this is private" or "unrelated to my task" just to signal the label. Put intended use in `task`, phrased as a person would, without private identifiers and without answer hints like "replace the email".
- Do not copy or lightly reword the example files, other shards, or each other.

## Annotation rules (schema v2)

- PERSON (private individuals) → `ALIAS`, normally `relevance: "unnecessary"` (the alias preserves the role and identity link).
- EMAIL, PHONE, ADDRESS, USERNAME, ACCOUNT_ID, NATIONAL_ID, PAYMENT_CARD, IBAN, SECRET → `PLACEHOLDER` with a specific one-line `reason`. Relevance is `essential` when the task needs the exact value (then the reason states the utility loss, e.g. "the agent cannot verify the exact policy number; the dispute only needs to reference it"), `unnecessary` otherwise.
- Contextual labels (DATE, AGE, LOCATION, ORG, HEALTH, FINANCIAL, EMPLOYMENT, FAMILY): annotate meaningful sensitive claims and decide independently. `KEEP` + `essential` when the task needs them and disclosure is permitted (personal health/money facts a user shares about themselves for their own task normally are). `PLACEHOLDER` (with reason) when confidential or unnecessary. Avoid tagging harmless numbers, bare weekdays or public facts.
- Company-confidential values stay protected even when essential (FINANCIAL/ORG PLACEHOLDER, utility loss stated). Relevance is not permission. Never mark them `unnecessary` to justify removal, and never put them in `required_facts`.
- Unsupported confidential types (codenames, proprietary algorithms, unreleased designs, legal advice) are not SECRET/ORG/FINANCIAL. Avoid building cases around them; if one is central, record it in your shard's `corporate-coverage-gaps-01.jsonl` and keep it out of accepted data.
- Placeholders are unnumbered (`[EMAIL]`, `[ACCOUNT_ID]`). If two same-type values must stay distinguishable for the task, note the limitation in the reason; do not invent `[EMAIL_1]`.
- Section DROP only as a complete supported clause/paragraph, `unnecessary`, contextual label, specific reason, boundary whitespace included, no child decisions, no required facts inside.
- Benign: `entities: []`, `decisions: []`, `approved_output` identical to `text`. Do not tag public figures cited in a public context; a public name used in a private context (e.g. your neighbour shares a celebrity's name) is a private PERSON.

## Required facts (most common rejection cause last time)

List answer dependencies first in your `author-notes-01.jsonl`. Then choose **minimal complete claims**: subject, action, quantity with unit, negation, hedge, condition and correction together. `I was charged 42.80 euros twice, not once` — not `42.80 euros`. Split exact quotes around aliased names or placeholders: `My sister,` + `said she might cover the 120-euro fee if the refund is denied.` A required quote must not overlap any edited span. Do not require every sentence, and never require a protected value.

## Files and workflow (per writer)

1. Claim your own shard: `PY -m mask.ml.privacy_v1.annotation.tools claim --root mask/ml/privacy_v1/data/placeholder-preservation-20261107/shards --producer "<honest model/session label>" --split train`. Use its `shard_id`/`generator_id`. Work only inside your shard; scripts and temp files go in your shard's `scratch/`.
2. Write `draft-NN.json` (array of authoring records, `provenance.generator_model` = your real model id, `review: {"status": "pending"}`). Prefix every record ID with `shard_id:` followed by a short slug like `id-017`, `pres-004`, `ben-002`, `cred-003`.
3. Write `author-notes-NN.jsonl`, one line per record: `record_id`, `category` (identity | preservation | benign | credential_confidential), `segment` (consumer | corporate), `domain`, `format`, `features` (subset of `repeated_name`, `unfamiliar_name`, `multiple_people`, `negation`, `correction`, `quantity`, `condition`, `relationship`, `hedge`, `public_name`, `technical_identifier`, `credential`, `confidential_business`, `section_drop`), and `dependencies` (needed claims, supporting quotes, disclosure limits, utility loss).
4. Resolve and validate: `resolve --input draft-NN.json --output resolved-NN.jsonl`, then `validate --input resolved-NN.jsonl`. Repair into new versioned files; outputs are exclusive-create.
5. Run the coordinator helper for stats and a blind export: `PY mask/ml/privacy_v1/data/placeholder-preservation-20261107/shards/3e13d8432f5f4061b4895f69cf70e7a9/campaign_tool.py stats --input resolved-NN.jsonl --notes author-notes-NN.jsonl`, then `... blind --input resolved-NN.jsonl --output blind-NN.jsonl`.
6. Read every replayed `approved_output` yourself for meaning and readability before handing off.

`PY` is `/Users/markp/Code/sinceai-trusted/mask/ml/privacy_v1/.venv/bin/python`, run from the worktree root `/Users/markp/Code/sinceai-trusted/.claude/worktrees/mask-placeholder-campaign`.

Writers never stage, commit or push. Never edit another shard.

## Review (per reviewer)

Claim your own shard (producer label = your real reviewer identity). For each assigned batch:

1. **Blind pass:** read only `blind-NN.jsonl` (id, text, task). Write `blind-notes-NN.jsonl` in your shard (core private spans, answer dependencies, what must survive) before opening the writer's resolved file or notes.
2. **Compare:** open `resolved-NN.jsonl` and the writer's author notes. Apply the rubric's six checks plus: aliases stable across repeated mentions and distinct across people; placeholders correct type; no direct identifier, credential or confidential value leaks through output or required facts; required facts preserve negation/correction/condition/quantity/attribution; benign records have no false positives and no missed private data; useful context survives; category and segment match the content.
3. Write `reviews-NN.jsonl`: `record_id`, exact `record_sha256` from `validate`, `status` (`accepted`/`rejected`), `review_type: "model"`, `reviewer_id` (your shard id + `:reviewer` + model id), `notes` with `BLOCKING`/`NOTE` tags and exact quotes. A rejection needs at least one concrete blocking issue.

Blocking: missed core identifier/credential/confidential value, wrong alias identity, lost or distorted required meaning, policy/schema errors, false positives that remove useful public/benign content, unjustified deletions, category mismatch that breaks the quota claim, banned credential formats. Nonblocking: style, optional extra required facts, speculative low-impact clues.

Two repair rounds per record at most, then replace. Reviews are model reviews, never human audit.

## Coordinator rulings v1 (after batch 01 writer questions)

1. **Relevance of protected identifiers.** `essential` when the requested output must reference, pass on or check that exact value (a reply that must give the grandmother's number, a dispute that must cite the order number); the PLACEHOLDER reason then states the utility loss (the user re-inserts the value). `unnecessary` when the task can be done without it. Either is acceptable when the reason is specific and honest; reviewers do not reject on this boundary alone.
2. **Confidential business values the task does not need** (a media budget in an auth-error question): `unnecessary` + PLACEHOLDER with reason is correct. The rule against `unnecessary` applies only to confidential values the task genuinely needs.
3. **Connection strings and config.** Tag only the secret part (password, key, token) as SECRET when the rest is invented, harmless and useful (scheme, port, DB name, service-account user, `*.test`/`*.internal.test` host). Tag the whole string only when every part is sensitive.
4. **Contextual claims around names.** Decisions cannot overlap, so HEALTH/FAMILY/EMPLOYMENT KEEP spans may be sub-clauses that exclude the name. Prefer tagging a sensitive claim the task relies on (custody arrangement, mediation, diagnosis) as KEEP + essential rather than leaving it untagged; leaving such a claim untagged is a NOTE, not blocking, when it is kept verbatim anyway.
5. **ORG.** Tag a real-world-style organisation name when it is confidential (client under NDA) or when, combined with the aliased names, it would identify the private people (a small former employer in a reference request). Public businesses in public roles, clubs and shops mentioned in passing stay untagged. Either choice on a borderline small business is a NOTE, not blocking.
6. **Same-type placeholders.** Two values rendering as the same `[PHONE]` are acceptable when position or role words still tell them apart; say so in the reason.
7. **Length.** The campaign range is 100–180 words; the manifest's 50/150 bins are informational only.
8. **Short required fragments** around aliases (`is leading, and`) are fine when, together with the alias, they preserve attribution. Reviewers check the whole output's meaning.
9. **Harmless technical identifiers** (service names, internal ticket IDs like `SEC-3187`, versions, ports, invented `*.test` hosts) stay untagged unless they are credentials or reveal a confidential client.
10. **A consumer's own sensitive amounts and health facts.** Tag a meaningful personal financial/health/employment claim that the task depends on (a tax-office claim, a debt balance, income, a diagnosis or dose) as KEEP + essential, so the data teaches "detected but kept". Ordinary prices, bill shares and refund amounts may stay untagged as harmless numbers. Writers need not tag every amount; reviewers treat an untagged-but-kept amount as a NOTE at most.
11. **Writers do not need to read SECTION_DATA_INSTRUCTIONS.md**; this brief carries everything from it that applies here.
12. **Natural confidentiality cues** ("we're under NDA with them", "not announced yet") are fine; just do not make one keyword the only signal across the batch.
13. **Full dates of birth** are DATE + PLACEHOLDER (there is no DOB label). Internal business references (PO numbers, booking references) may be ACCOUNT_ID + PLACEHOLDER when they key to a private account or person; harmless public reference formats may stay untagged. Either is a NOTE, not blocking, when consistent within the record.
14. **Repair batches** get matching versioned notes files (`resolved-01b.jsonl` with `author-notes-01b.jsonl`).

## Coordinator rulings v2 (after reviewer calibration on 4 records)

Calibration: R1 (shard `f537c6be…`) and R2 (shard `276fb502…`) independently reviewed W3 `pres-002`, W3 `cred-001`, W5 `id-004` and W5 `ben-001`. Blind spans, labels and alias groupings matched the writers on all four. They disagreed only on `id-004`: R1 rejected it over required-fact coverage, R2 accepted it with notes. This is resolved by rule interpretation below, not by vote; under it `id-004` needs repair.

15. **Required-fact severity.**
    - **BLOCKING (FACT_COVERAGE / FACT_COMPLETENESS):** an answer dependency that the task explicitly asks for, or that the writer's own notes list, has no required quote at all (e.g. the "open asks" in a rota update). Also blocking: when the required quotes, read together with the aliases, lose the words that set a claim's direction, negation, condition, correction or actor. For example, a swap required as `[A]` … `'s shift` without `will take`.
    - **NOTE:** a covered claim whose quote boundary is slightly short but whose meaning is not inverted (`calls back upset, don't offer…` without `If she`), optional extras (config key names, greeting lines), or a fragment the output keeps verbatim when its claim is otherwise represented.
16. **Attribution tasks.** When the task asks who decided, owes, said or does what, require the binding words next to each alias (`Correction from`, `will take`, `or`, role words) as their own fragments.
17. **Distinguishing same-type placeholders.** When the task needs two `[PHONE]`/`[ACCOUNT_ID]` values told apart, the role words that distinguish them (`, text him on`, `number has changed to`, `Policy no.`) must be required.
18. **Reasons must match labels.** A PLACEHOLDER reason that contradicts its own relevance (marked `unnecessary` while saying the user must restore the value) should be fixed by the writer. Reviewers note it, and block only if the reason misstates policy or hides a leak.
19. **Required quotes may include retained honorifics and role words** (`offered a replacement; Mrs`). Contract terms next to a masked confidential figure (a 30-minute SLA window) are a NOTE unless they reveal the masked value or identify the client.

## Coordinator rulings v3 (after batch-01 review)

20. **No reuse of the brief's sample names or numbers.** The names listed in "Source realism" (Oyelaran, Nguyen Thi Lan, Kaveh, Szczepańska, Tauriainen, Ngata) were examples of *kinds* of names, not a pool. Do not use them in new records. Do not reuse a phone number, email local part, account number or credential string that appears in any other record you have written; invent each one fresh. Draw names from many origins (e.g. Yoruba, Tamil, Finnish, Polish, Vietnamese, Māori, Arabic, Portuguese, Icelandic, Korean, Hungarian, Ghanaian, Filipino) and vary them.
21. **Vary credential/confidential scenarios.** Batch 01 converged on one template (YAML excerpt + `api_token: tok-demo-…` + "nothing else changed" + a colleague who rotated the key + a confidential figure). New credential records must use other setups: a shared-account password in an email, a Wi-Fi or alarm code in a house-sitter note, a `.env` excerpt, a curl command with a header, a CSV export with a client column, a sales pipeline note with a discount, a board-pack figure in a meeting summary, a vendor portal login in a handover. Vary the token shapes too (`tok-demo-` at most once per writer).
22. **Service-account users, DB names and internal hosts stay untagged** (ruling 3). Tagging them is a NOTE on existing records and should not recur.
23. **Pre-handoff dependency check (writers).** For every dependency in your notes, confirm at least one required quote covers it *including* its verb, role word, header label or distinguishing label. If a PLACEHOLDER reason says labels keep two same-type values apart, those labels must be required.
24. **Condition and connective words (confirms ruling 15).** BLOCKING when, reading the required quotes together with the aliases, a conditional, temporary or causal claim becomes a plain statement (`Until` dropped from "Until [PERSON_3] actually pays, I'm not counting…"; `If` dropped from "If [PERSON_3]'s escort can't be arranged, push…"). NOTE when another condition word in the same claim keeps it conditional (the `If she … unless` case).
25. **Chat transcripts.** When the task asks who said what, require each speaker label/colon bound to an alias. When the task asks for a timeline, require the timestamps or dates it depends on.

## Coordinator ruling v4 (after batch-2 review)

26. **Compensation in corporate records.** An employee's *own* pay, shared by that employee for their own task (checking their own overtime), may be KEEP + essential like ruling 10. A *colleague's or third party's* exact pay, rate, bonus or salary band pasted by HR, payroll or a manager into an external-AI task is company-confidential personnel data: FINANCIAL + PLACEHOLDER (essential when the task needs it, with the utility loss stated), never KEEP and never a required fact. Non-monetary personnel facts the task needs about an aliased employee (team move, contract end, agreed leave dates) remain KEEP-able. Applied in review: S2 `id-010` rejected for keeping a colleague's hourly rate; a scan of all corporate records found no other third-party pay KEEP.
