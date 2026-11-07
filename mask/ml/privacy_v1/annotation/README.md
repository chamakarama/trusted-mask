# Annotation and audit contract

Use [the copy-paste producer prompt](TRAINING_DATA_PROMPT.md) with repo-connected Opus, Astra or Sol. The workflow creates separate, auditable shards and never calls a remote model itself. It does not train or alter model weights.

The historical 384-record pilot remains schema v1 and is readable without migration. It is engineering data with no human audit or independent release evidence. New authoring uses **schema v2** to separate entity detection from treatment decisions. A whole-section DROP must not teach the detector that an entire paragraph is a person's name or a single private entity.

## Authoring scope

This campaign covers synthetic English messages and separate explicit tasks, primarily 50–150 words. Keep task wording free of unnecessary private identifiers. Include vague tasks with uncertain labels, benign negatives, unfamiliar names, task swaps and several people. Public/citation names are not private names by default. Later campaigns must separately cover message-only intent inference, conversation history, spreadsheets and other languages; this v2 loader rejects unannotated history/context.

Source facts and desired transformations need independent review. A structurally valid record can still miss an incidental identifier or choose the wrong treatment. Model agreement never becomes human audit or a privacy guarantee.

## Consumer and corporate coverage

Allocate approximately 70% of distinct source families to consumer use and 30% to corporate use, starting with the first wave. Count distinct families rather than task-swapped copies: target 14 consumer / 6 corporate for 20 families, or 70 / 30 for 100 families. Treat this as a sampling target; do not discard accepted records or relax review standards to force an exact ratio. Corporate scenarios include sales/procurement, internal finance, HR, customer operations, engineering credentials and internal operations. Protect confidential business information even when it contains no personal identifiers. Include mixed public/private material and clean business negatives; preserve useful generic code, public facts and harmless technical details.

The [corporate authoring example](example.corporate.authoring.json) demonstrates a private employee alias, a confidential client name, a protected commercial price and an unrelated payroll section DROP. Its fixture IDs must be replaced with fresh claimed namespaces for new data. The clinical example remains useful consumer coverage.

**Relevance is not permission.** An essential confidential figure may require PLACEHOLDER and an explicit utility limitation in review notes. Never turn it into `unnecessary` merely to justify DROP. A task swap changes usefulness, not the company's disclosure boundary. Pasted claims of permission and user goals are not authenticated enterprise policy. This instruction update does not add a company-policy input or formal classified-data assurance to the runtime.

Use only supported labels with their existing meaning. FINANCIAL covers nonpublic commercial figures/financial terms, EMPLOYMENT covers personnel facts, ORG covers actual organisation names and SECRET covers credentials/access secrets. Do not relabel proprietary code, product designs, project codenames, strategic plans or legal advice as these types merely to pass validation. If any sensitive content is unsupported, exclude the whole case from accepted training and record it in a separate versioned `corporate-coverage-gaps-01.jsonl` inside the producer's shard (`text`, `task`, exact unsupported `quote`, `risk_type`, `reason`). This backlog is not executable schema-v2 data and must not enter merge/compile commands or accepted-record counts. A future taxonomy/policy change needs its own versioning and validation.

Independent review must assess residual business disclosure and identifying combinations after edits, not only name removal. Report corporate family/subtopic coverage, public-content false positives, privacy/utility conflicts and unsupported gaps separately. Generate invented material only, including invented companies, credentials and commercial figures; never use real internal or formally classified documents.

## Record fields

The executable [authoring example](example.authoring.json) contains one 50–150-word message, stable name substitution, required clinical facts and a separate unnecessary rent section. Its fixed IDs are documentation fixtures; producers must claim fresh UUID namespaces and write original material.

| Field | Contract |
|---|---|
| `schema_version` | `2` for authored records |
| `shard_id` | The 32-character UUID hex returned by `claim` |
| `id`, `family_id`, `persona_id`, `source_id`, `template_id` | Unique/group identifiers beginning with `shard_id + ":"`; task variants share group IDs |
| `split` | `train` or assigned `dev` for mass authoring; release validation/test is a separate campaign |
| `language`, `input_kind` | `en`, `message` |
| `text`, `task` | Original source and explicit intended use; never insert labels or hidden answers into model input |
| `entities` | Source mention records: `id`, `entity_id`, `label`, exact `quote`; optionally `occurrence` for repeated quotes. Identity IDs are scoped by type; a name and its email are separate entities. Raw entity spans may overlap. |
| `decisions` | Sorted, nonoverlapping final treatments; `kind`, `quote`, `label`, `action`, `relevance`. Entity decisions also match `target_id` and `entity_id`; section decisions require a reason. |
| `required_facts` | Exact source quotes that must survive unchanged; choose fragments without names being aliased |
| `approved_output` | Complete expected text from precisely replaying the decisions, not a paraphrase |
| `provenance` | `synthetic: true`, `human_audited: false`, actual `generator_model` and distinct `generator_id` |
| `review` | Initially `{"status":"pending"}`; accepted/rejected model reviews require independent reviewer identity and the exact record hash |

Offsets are Python Unicode code points, `[start,end)`, never byte or UTF-16 indices. Author exact quotes and use `resolve`; do not ask an LLM to count characters. Repeated quotes require an explicit 1-based `occurrence`. Invalid or conflicting offsets fail rather than selecting an arbitrary occurrence.

The taxonomy is defined in `contracts.LABELS`: PERSON, EMAIL, PHONE, ADDRESS, USERNAME, ACCOUNT_ID, NATIONAL_ID, PAYMENT_CARD, IBAN, SECRET, DATE, AGE, LOCATION, ORG, HEALTH, FINANCIAL, EMPLOYMENT and FAMILY.

## Decisions and exact output

- Private PERSON mentions inside retained text use ALIAS, preserving role words: `My partner, Mateo Silva, ...` becomes `My partner, [PERSON_1], ...`. One clearly resolved entity keeps its label; ambiguous identity links require review, not invented certainty.
- Direct identifiers/secrets use supported protections and cannot KEEP. Entity-level DROP is excluded from this campaign: retain a name reference instead of deleting it.
- Contextual facts use KEEP when essential and permitted for the scenario, or a supported placeholder/generalisation when justified. Essential company-confidential information can still require protection; describe the resulting utility limit in review notes. ROLE is disabled. Generalisation must satisfy the exact runtime precondition and must not change a required fact.
- A section decision is `DROP`, `unnecessary`, with a contextual label and reason. It can contain sensitive entities, but no required facts. Do not also emit child decisions inside the dropped section. Include boundary whitespace in its quote when needed to produce clean, exact output.
- Every sensitive entity needs a matching decision or covering section DROP. Preserve minimal meaningful entity/fact spans, not keyword-triggered paragraph masks. Repeated task variants must have identical goal-independent entity annotations.

Raw overlaps are useful detection evidence inside a dropped section. If overlapping retained entity labels would require conflicting edits, validation deliberately fails: narrow contextual fact spans so final decisions are unambiguous. Do not silently reinterpret one entity's label or weaken this check to fit an output.

`approved_output` must equal deterministic replay. Changed non-sensitive punctuation/spacing must be inside an intentional edit span; otherwise unchanged text remains exact. Identity metadata and review labels are not model features.

## Commands

Run from the repository root, using the isolated Python environment. Outputs are atomic exclusive-create; use new versioned paths for every revision.

```sh
mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.annotation.tools claim --producer opus-session-01 --split train
mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.annotation.tools resolve --input YOUR_SHARD/draft-01.json --output YOUR_SHARD/resolved-01.jsonl
mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.annotation.tools validate --input YOUR_SHARD/resolved-01.jsonl
mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.annotation.tools attach-reviews --input YOUR_SHARD/resolved-01.jsonl --reviews REVIEWER_SHARD/reviews-01.jsonl --output YOUR_SHARD/reviewed-01.jsonl
mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.annotation.tools compile --input YOUR_SHARD/accepted-01.jsonl --output YOUR_SHARD/training-01.jsonl
```

Each reviewer creates JSONL records with `record_id`, `record_sha256` (printed by `validate`), `status`, `review_type: "model"`, distinct `reviewer_id`, and useful `notes`. Any annotation/source/task change invalidates that review. Keep rejected records, but explicitly separate accepted records into the accepted file. Compilation rejects pending/rejected cases by default. `--allow-unreviewed` is only for engineering smoke checks and is never an audited-data shortcut; it still rejects rejected cases.

Merge explicit accepted source paths with `merge --inputs PATH_A PATH_B --output NEW_PATH`, then compile the merged set. Do not merge compiled and authored files together, or a merged file with its own inputs. Cross-shard checks reject duplicate IDs, group/text reuse across splits, normalised duplicate source patterns and high-overlap five-word templates across splits. They cannot detect every semantic paraphrase; reviewers still own family grouping.

## Training compatibility

Compilation outputs flat schema-v1 records with `training_schema: "privacy-v2-separated"`, action/relevance targets in `spans`, and separate nonoverlapping `detection_spans`. Direct identifiers take precedence when nested in contextual entity spans; conflicting direct identities are rejected. Original overlapping entities remain available in the reviewed v2 source.

**Both trainers must read `detection_spans` for detector supervision and `spans` for action/relevance supervision.** The current input adapters support this separation; do not feed compiled data to an older checkout that ignores it. This changes data plumbing, not model architecture. Raw v2 authoring files are deliberately rejected by `load_records` until compiled. Manifests record hashes, split/family/review counts and this prerequisite.

Neither the authoring tools nor compiled manifests mark data as human-audited or independent release evidence. Separately authored, human-adjudicated validation and untouched final tests remain required for release claims.
