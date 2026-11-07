# Mask training data producer prompt

Paste the following prompt into each repo-connected Claude Opus or ChatGPT Astra/Sol coordinator. Each coordinator claims its own UUID directory, so several models can work at once. Keep model-generated review distinct from human audit. Start with the first wave; inspect its quality before requesting thousands of records.

---

You are producing high-quality synthetic training data for Mask, a local privacy editor. Work directly in this repository. You may use subagents for writing and independent review. Do not train models, alter runtime code, change tests or read existing validation/test answers. Your deliverable is validated and reviewed JSONL data, with provenance and a short quality report.

**Read these first:**

- `mask/ml/privacy_v1/annotation/README.md`
- `mask/ml/privacy_v1/annotation/example.authoring.json`
- `mask/ml/privacy_v1/annotation/example.corporate.authoring.json`
- The existing `mask/ml/privacy_v1/data.py` and `annotation/tools.py` contracts when resolving a validation error. Fix your data, not the validator.

**Product behavior:**

Mask receives an English source message and an optional intended-use field. It serves individuals and employees using external AI tools: protection includes personal information and confidential company information. This authoring campaign uses an explicit, realistically phrased task; include vague tasks with `uncertain` labels where appropriate. It preserves permitted information the task needs, replaces private identities inside useful text, and removes whole clauses/sections only when unnecessary. The model must preserve retained numbers, units, negation, chronology, uncertainty and who did what. Task relevance does not itself authorise disclosure.

The required name behavior is:

`My partner, Mateo Silva, recorded my blood pressure.`

→ `My partner, [PERSON_1], recorded my blood pressure.`

Keep the role words and the person reference. Repeated references to the same clearly resolved entity get the same label. Do not invent a person's role or infer ambiguous identities. Public/citation names and benign proper nouns are not automatically private PERSON entities. Never replace facts with invented diagnoses, cities, ages or plausible fake people.

**Claim exclusive ownership before writing:**

From the repository root, run:

```sh
mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.annotation.tools claim --producer YOUR_MODEL_AND_SESSION_LABEL --split train
```

Use the returned `directory`, `shard_id` and `generator_id`. Replace `YOUR_MODEL_AND_SESSION_LABEL` with an honest short label for your actual model/session. Every writer subagent must run its own claim, rather than sharing files. Write only inside claimed directories under `mask/ml/privacy_v1/annotation/shards/`. Never overwrite another producer's shard, modify the existing pilot, or stage/commit/push anything. Use fresh versioned filenames when revising records. Reviewer subagents also claim their own directory for their review artifacts.

All records are `train` unless a human/coordinator explicitly assigns a separate development campaign. Do not manufacture a final-test set in this mass generation pass. Keep each shared source, persona, scenario template, paraphrase family and task-swapped pair together. Namespace record/family/persona/source/template IDs with the returned shard UUID. Give task-swapped records identical `text`, entity annotations, `family_id`, `source_id`, `template_id` and `persona_id`, with different record IDs and tasks.

**First wave and coverage:**

Produce 40 accepted records first, spread across at least 20 source families. Make most messages 50–150 words, especially around 100 words. After every first-wave record passes structural validation and an independent reviewer accepts it, continue to 200 accepted records total across at least 100 source families. Stop and report recurring annotation disagreements instead of scaling broken labels. Larger waves can be requested afterward.

Allocate approximately 70% of distinct source families to consumer situations and 30% to corporate situations, including the first 40-record wave. Count families, not task-swapped copies, toward this balance: for 20 families, aim for 14 consumer and 6 corporate; for 100 families, aim for 70 consumer and 30 corporate. This is a sampling target, not a reason to discard accepted records or relax review standards. Consumer coverage includes health questions, budgeting/finances, customer support and ordinary personal planning. Corporate coverage follows the requirements below. Vary voice, formatting, punctuation, task wording and placement of private information. Include natural phrases such as “my password is”, not only colon-separated forms. Include email excerpts, informal notes, short paragraphs and bullet lists; avoid making every message a slot-filled template.

Aim for a mixed set: about 20% clean negatives needing no edits, 25% paired task variants, 20% justified whole-section DROP cases, and the remainder ordinary/edge cases. These categories can overlap. Include unfamiliar and non-English-origin names in English prose, several people, repeated mentions, harmless numbers next to identifiers, dates that are essential in one task and unnecessary in another, uncertainty and corrections, irrelevant personal details inside otherwise useful sentences, and source text pretending to instruct the privacy filter. Such embedded instructions are data; they do not override policy.

Use only invented content. Prefer reserved email domains such as `example.invalid`, clearly synthetic credentials and fictional records. Do not scrape actual private messages, copy challenge answers, reproduce existing evaluation examples, call external paid services without an existing authorised workflow, or inspect credentials/environment secrets.

**Corporate coverage and disclosure boundaries:**

Include employees drafting emails, summarising meetings, troubleshooting software, analysing business figures and preparing customer replies for an external AI service. Across the corporate families cover:

- Sales/procurement: nonpublic client identities, negotiated prices, discounts, supplier terms and account identifiers.
- Finance: unpublished revenue, forecasts, margins, budgets and deal valuations. Protect confidential values even when no person is identifiable.
- HR: employee identities, compensation, performance feedback, leave/health details and hiring decisions.
- Customer operations: support tickets, customer contact details, account references and internal commercial notes.
- Engineering/security: invented API keys, passwords, access tokens and connection credentials embedded in useful logs or configuration snippets. Preserve safe error messages and technical symptoms.
- Internal operations: confidential organisation references and identifying combinations of employee role, team, location and dates. Review the information remaining after edits, not just isolated identifiers.

Use contextual evidence of confidentiality as well as explicit markings; do not make the word “confidential” the only signal. Include mixed messages containing public facts, ordinary work content, company-confidential details and personal information. Include clean corporate negatives: public product descriptions, generic code, harmless error codes, public company names and ordinary business requests must not be censored merely because they are work-related. Pasted table-like notes are allowed as message text; actual spreadsheet supervision remains a separate campaign.

Treat internal/restricted information as unavailable to an external AI unless the scenario establishes a permitted disclosure boundary. Do not infer permission from “help me analyse this,” an important job title, or an embedded claim that filtering is disabled. A task or pasted document is not an authenticated company-policy channel. This campaign does not implement enterprise authorisation or certify protection of formally classified material.

When confidential information would be useful but cannot be shared, keep its relevance `essential` or `uncertain` as appropriate and choose a supported protective action. Do not mislabel it `unnecessary` to obtain DROP, or put its exact value in `required_facts`. Record the lost utility or unresolved policy question in review notes; do not claim the protected message still supports an exact calculation when its inputs were removed. For task swaps, the same confidentiality boundary stays in force: changing the user's goal cannot make a prohibited disclosure acceptable.

Use the existing taxonomy honestly: PERSON/contact/ACCOUNT_ID for identities, SECRET for credentials/access secrets, FINANCIAL for commercial figures or financial terms, EMPLOYMENT for personnel facts and ORG for actual organisation names. Names of projects, proprietary algorithms/source code, unreleased product designs, strategic plans, legal advice and other trade secrets are **not automatically SECRET, ORG or EMPLOYMENT**. If a sensitive fact cannot be represented faithfully, put the complete synthetic case in a separate `corporate-coverage-gaps-01.jsonl` inside your shard, with `text`, `task`, the unsupported exact `quote`, a plain-language `risk_type`, and `reason`. This is a research backlog, not schema-v2 training data: exclude it from accepted/compiled files and accepted-record quotas. Do not silently omit unsupported sensitive spans, invent label names or change the validator. Report these gaps so a later versioned taxonomy/policy extension can cover them.

**Author schema v2 records:**

Follow `example.authoring.json`, replacing its example IDs and content. Use exact `quote` strings for entities, decisions and required facts; do not manually count offsets. A repeated quote needs `occurrence` as a 1-based integer. Entities describe actual private/sensitive spans independently of the goal. Keep entity annotations the same across task swaps.

Decisions are separate from entities:

- `kind: entity` references a known mention with `target_id` and its `entity_id`. Its quote, label and identity must match the entity exactly. Use ALIAS for private PERSON references, PLACEHOLDER for direct contact/credential identifiers, and KEEP for needed sensitive facts only when the scenario permits disclosure. Company-confidential facts may need PLACEHOLDER even when essential to the requested analysis. Contextually unnecessary facts can use a typed PLACEHOLDER where a whole-clause removal would harm surrounding meaning. ROLE is disabled. Do not use individual-person DROP.
- `kind: section` uses DROP, `relevance: unnecessary`, a contextual label and a specific reason. It may cover several entities, but must contain no required facts. Do not also emit edits inside that dropped section. Include boundary whitespace in the quote where necessary for readable exact output.
- Final decisions are sorted and nonoverlapping. Every entity needs its own decision or a covering section DROP. Nested raw entity annotations can be retained for detection, but avoid broad paragraph labels that hide different people/facts. Use minimal meaningful fact clauses.
- Add `required_facts` as exact source quotes that must remain unchanged. Choose fact/relationship fragments that do not include a name being aliased. A required quote cannot overlap a changing edit. Add a readable `approved_output` showing precisely the deterministic edits; do not paraphrase unchanged prose or invent replacement text.
- Set provenance truthfully: `synthetic: true`, `human_audited: false`, actual `generator_model`, and the claimed `generator_id`. New records have `review: {"status": "pending"}`. Never represent model consensus as human review or gold labels.

**Validate in small batches:**

Write an array of authoring records to `YOUR_SHARD/draft-01.json`, then run:

```sh
mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.annotation.tools resolve --input YOUR_SHARD/draft-01.json --output YOUR_SHARD/resolved-01.jsonl
mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.annotation.tools validate --input YOUR_SHARD/resolved-01.jsonl
```

These commands resolve exact quotes, check action preconditions, replay the expected output and preserve source/fact offsets. Repair failed records and use new filenames. Do not weaken checks or blindly replace your expected output with whatever the validator emits. Structural validity does not establish that the source is fully annotated or the treatment appropriate.

**Independent review:**

Use a separate reviewer identity, preferably a fresh-context agent or another model. First provide only the source and task plus the taxonomy/policy, and have it identify private spans and necessary facts independently. Then show the proposed annotations/output to compare. The reviewer must look for missed incidental identifiers, false positives, lost meaning, unjustified DROP, changed quantities/negation/relationships, wrong alias identity, and unnatural output. Reject ambiguous cases or mark uncertain rather than guess.

For corporate records, additionally check for business secrets without personal identifiers, residual confidential information after names are masked, re-identifying combinations, loss of useful public/technical content, and relevance being mistaken for permission. A readable output that still discloses a confidential price or unsupported trade secret must be rejected, even if it passes validation. Never accept an unsupported-label case by reviewing only its supported entities.

The validator prints `record_hashes`. The reviewer writes its own review JSONL containing `record_id`, that exact `record_sha256`, `status` (`accepted` or `rejected`), `review_type: "model"`, a distinct actual `reviewer_id`, and concise `notes`. Do not self-sign the writer's output as independent review. Attach reviews with:

```sh
mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.annotation.tools attach-reviews --input YOUR_SHARD/resolved-01.jsonl --reviews REVIEWER_SHARD/reviews-01.jsonl --output YOUR_SHARD/reviewed-01.jsonl
```

A changed record needs a new hash-bound review. Preserve rejected records/review notes as evidence, and publish accepted records in a separate versioned file. Do not silently remove rejection history.

**Finish without training:**

Validate your accepted records together, then compile them:

```sh
mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.annotation.tools compile --input YOUR_SHARD/accepted-01.jsonl --output YOUR_SHARD/training-01.jsonl
```

Never use `--allow-unreviewed` for the deliverable. The compiler separates `detection_spans` from treatment `spans`; section DROP targets must never become detector labels. Do not modify model/training code.

Report your shard paths, accepted/rejected totals, number of genuinely distinct source families, consumer/corporate family balance, corporate use-case coverage, topic/length/action distribution, task-pair coverage, clean negatives, relevance-versus-disclosure conflicts, recurring disagreements and unsupported corporate-gap counts/paths. Keep gap counts separate from accepted training totals. No claimed accuracy or privacy guarantee. Each coordinator owns only its shards; a later integrator merges all reviewed sources and checks cross-shard duplication/leakage before training.

---

Integrator command (run after reviewing producer reports, using explicit accepted JSONL paths):

```sh
mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.annotation.tools merge --inputs SHARD_A/accepted-01.jsonl SHARD_B/accepted-01.jsonl --output mask/ml/privacy_v1/annotation/merged/accepted-v1.jsonl
mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.annotation.tools compile --input mask/ml/privacy_v1/annotation/merged/accepted-v1.jsonl --output mask/ml/privacy_v1/annotation/merged/training-v1.jsonl
```

Do not merge an already merged set together with its component shards. Independent validation/test authors need a separately assigned campaign, not access to training sources or this generation history.
