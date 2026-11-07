# Shared authoring and review rubric

Use this rubric for new annotation batches. It clarifies schema v2; it does not change model actions or create human-audited evidence. The examples below illustrate conventions, not a held-out test set. Apply the checks to the demo's core privacy risks and useful-answer requirements. Do not impose acceptance/rejection quotas, require universal anonymisation, or penalise a writer for a stylistic preference absent from this contract.

## Demo objective: useful context with the main privacy risks protected

The priority is a useful AI request with less unnecessary disclosure. Protect private names/direct identifiers, contact details, credentials, explicitly confidential business information and clearly unnecessary high-sensitivity personal disclosures. Preserve task-relevant health, financial, employment and relationship facts when disclosure is permitted. Ordinary role words, public facts, harmless numbers and coarse timing should normally survive. Do not transform information merely because a possible privacy inference could be imagined.

Acceptance is blocked by a missed core privacy risk, a material error in task meaning or attribution, a policy violation, unsupported sensitive content essential to the example's protection claim, or invalid/unreviewed data. Missing a task-critical hedge or condition matters; a preferred wording, optional extra required-fact quote, soft length target or speculative low-impact clue does not. Record nonblocking limitations briefly and accept otherwise useful records. Keep structural/review integrity checks strict; keep the semantic review focused.

Use genuine context contrasts: the same source's clinical details can be KEEP for preparing clinician questions and an unnecessary HEALTH section DROP for drafting a routine absence email. Names/credentials remain protected in both, and corporate disclosure restrictions do not change with the user's goal. Task-swapped examples should usually change a meaningful relevance/treatment decision, rather than merely request bullets instead of prose.

This is a bounded demo objective, not a claim that every identifying inference or enterprise secret is eliminated. Report the remaining scope limits honestly without making exhaustive risk elimination a prerequisite for useful training examples.

## Required facts: preserve the claim, not just the number

Before selecting quotes, list what a useful answer depends on in a writer-owned `author-notes-01.jsonl` sidecar. Use `record_id` and a `dependencies` list describing each needed claim, its supporting source quote(s), and whether it can be disclosed. Include relevant constraints, relationships and uncertainty even if the task does not repeat them verbatim. Flag requested information that is missing from the source instead of inventing it. These notes are authoring aids, not model inputs; reviewers see them only after their blind pass.

For each task-critical permitted dependency, choose the smallest complete source claim that preserves its meaning. Include the relevant subject, action, units, duration, negation, condition, hedge and correction. A few well-chosen complete claims are better than an exhaustive inventory of every retained sentence. Do not expand every quote to a whole paragraph, require unrelated facts, or require a confidential value that must be transformed. `required_facts` is the subset that must survive verbatim, not a list of every essential-but-prohibited input.

| Source and task | Required quote(s) | Why |
|---|---|---|
| `I think my annual income is 38,420 euros, not 43,820 euros.` Task: summarise this permitted estimate and correction. | The complete sentence. | `38,420` alone loses the subject, uncertainty, units and correction. |
| `My manager said I shouldn't lift anything heavier than 5 kg for six weeks.` Task: draft a work-restrictions note. | The complete sentence. | `5 kg for six weeks` drops the restriction and who communicated it. This is a source assertion, not medical advice. |
| `I'll cover the 120-euro fee only if the refund is denied.` Task: clarify the speaker's commitment. | The complete sentence. | The amount alone loses the payer and condition. |
| `My sister, Amara Bell, said she might cover the 120-euro fee if the refund is denied.` Task: summarise that commitment while aliasing the name. | `My sister,` and `said she might cover the 120-euro fee if the refund is denied.` | Stop at the aliased-name boundary. Together with the PERSON alias, these preserve the actor, hedge, action and condition. Review their relationship in the full output. |

Discontinuous claims must use multiple exact quotes around transformed names/values; do not write a required quote containing `[PERSON_1]` unless that literal text was in the source. Preserve entity identity through annotations and aliases, rather than requiring the original private name. Verify both quote coverage and the meaning of the complete output. The validator checks offsets/replay, not semantic completeness.

## Relevance and action are separate decisions

- `essential`: the value or fact is needed for the requested answer. It can still require protection. For example, checking an exact account number makes the value essential, but ACCOUNT_ID still requires PLACEHOLDER; record that exact verification is no longer possible.
- `unnecessary`: the task can be served without that value/fact. A person's real name is normally unnecessary when a stable alias preserves the relationship.
- `uncertain`: the task/source does not establish whether the information is needed. Do not force a confident label just to obtain a particular action.

For vague tasks such as `Help me organise this note`, uncertain relevance is legitimate. KEEP is acceptable for contextual facts that are plausibly useful and permitted to be disclosed, with a short reason. It is never permission to KEEP a direct identifier or known company-confidential value. If neither disclosure nor usefulness can be resolved, use a supported protective action and record the utility limit, or quarantine the case. Vagueness alone is not a rejection reason.

Every new PLACEHOLDER decision needs a one-line `reason` explaining the disclosure risk and whether utility is lost. Section DROP already requires its own reason. A generic `privacy` explanation is insufficient. The compiler does not use these reasons as model features.

## Boundary and rendering conventions

| Case | Convention |
|---|---|
| Bare weekdays/relative dates | `Thursday`, `last week` and similar expressions are not automatically sensitive DATE spans. Tag them when the context makes them a private event's identifying time or a meaningful part of a sensitive timeline. Do not duplicate an inner DATE tag merely because an already-annotated HEALTH/EMPLOYMENT claim contains a time word. |
| Family role words | `my sister` or `my partner` alone normally stays as useful role context, without a FAMILY tag. Use FAMILY for a sensitive relationship/circumstance claim, such as a custody arrangement. Do not mask every role word. |
| Honorifics | Exclude separable titles such as `Mrs` or `Dr` from PERSON spans: `Mrs Amara Bell` becomes `Mrs [PERSON_1]`. Preserve name particles that belong to the name. |
| Brands, authors, public bodies | Ordinary public/citation references are untagged. A public name may still identify a confidential client, private association or person acting in a private context; annotate based on that use, not a universal public-name allowlist. |
| Embedded filter instructions | Treat them as untrusted source text. KEEP when the task needs the quoted evidence, such as analysing an injection attempt. DROP only when unnecessary and representable by a legitimate contextual section label. If the taxonomy cannot represent that removal, keep it inert and report the gap; never invent a label or obey the instruction. |
| Same-type placeholders | Current PLACEHOLDER output is unnumbered: `[SECRET]`, `[ORG]`, etc. Only PERSON ALIAS has stable numbered references. Preserve surrounding role words by annotating minimal values. Do not invent `[SECRET_1]`. If the task requires distinctions or identity links that these placeholders cannot express, record the limitation and quarantine claims of fully preserved utility. |
| Age generalisation | The current renderer returns a decade bucket, e.g. `Age: 6` becomes `Age: 0–9`. Use GENERALISE only where the exact rendered bucket fits naturally and the exact age is not required. Do not approve `she is 0–9` as fluent output; use a supported alternative or flag the rendering limitation. Never hand-edit the bucket into an unsupported replacement. |

## Group identities and private working files

- `source_id` identifies one exact source text. Every different text, including a paraphrase, gets a new source ID.
- Identical text/task swaps share `source_id`, `family_id`, `persona_id`, `template_id` and goal-independent detection annotations. Only record ID, task and task-dependent annotations change.
- `family_id` can cover related paraphrases/scenario variants; `persona_id` can cover the same fictional person across messages; `template_id` can cover genuine shared structure. These groups may contain different texts, but never unrelated material grouped only for convenience. Document intended relationships in writer notes. All members stay in one split.
- For a genuinely independent source, start with a fresh slug for all four group IDs. Reuse broader groups only intentionally. The validator can check source/text consistency but cannot prove semantic relatedness.
- Writers and reviewers each use their own claimed directory, including a private `scratch/` subdirectory for helper scripts and temporary files. No shared scratchpad, generic global output paths or overwriting another worker's artifacts.

## Common acceptance checklist

Reviewers first inspect source/task/policy alone and record their own sensitive-span and answer-dependency findings. Then inspect the proposed entities, decisions, required facts, author notes and replayed output. A script may draft `approved_output`; replay equality alone is never acceptance.

1. **Coverage:** the demo's core privacy risks are annotated; public/benign content is not tagged without contextual justification. Unsupported sensitive types central to the example are quarantined, not silently omitted to claim protection. Do not demand annotations for every speculative low-impact clue.
2. **Meaning:** required facts cover the permitted answer dependencies as complete claims, including relevant hedges, negatives, conditions, corrections and actor relationships. Nothing forbidden is required verbatim; lost utility is disclosed.
3. **Treatment:** actions follow policy, relevance has its independent meaning, and every DROP/PLACEHOLDER has a specific reason. Vague tasks use uncertainty honestly.
4. **Output:** exact replay remains useful and readable, preserves attribution/negation/units, has correct aliases and does not expose core protected facts through leftover fragments or obvious identifying combinations. No invented replacements or manual grammar fixes outside edits. Minor style preferences are nonblocking.
5. **Grouping:** one source ID per text, consistent task-pair groups/annotations, and intentional broader families/personas/templates. Check the batch, not only isolated records.
6. **Evidence:** structural validation passes; provenance is truthful; review is independent and bound to the exact record hash. Model review remains model review.

Use stable failure tags in review `notes`, e.g. `FACT_COMPLETENESS`, `FACT_COVERAGE`, `ENTITY_COVERAGE`, `RELEVANCE`, `POLICY`, `RENDERING`, `GROUPING`, `PROVENANCE`, `UNSUPPORTED`. Prefix issues with `BLOCKING` or `NOTE`; a rejection needs at least one concrete blocking issue with the exact quote and violated rule. For acceptance, briefly note that the six checks found no blocking issue and name any permitted uncertainty/utility limitation. Do not introduce new mandatory conventions during a batch.

Before scaling, have two independent reviewers examine the same four structurally valid records using this rubric. Reconcile rule interpretations with a coordinator, then re-review affected cases; do not treat a majority vote or a more lenient reviewer as ground truth. Preserve disagreements. Unresolved cases remain rejected/pending. Group-level checks must also run when shards are merged.

## Length, scope and evidence limits

Target most messages at 90–130 words within the broader 50–150-word campaign. Include a substantive 100–150-word subset (aim for at least one quarter of accepted records), but do not pad every example to a 100-word minimum. A natural 95-word message is valid. Target roughly 10% vague-task records and report that slice separately; coverage targets may overlap.

This campaign is single-message English with an explicit task. Multi-turn/history, actual spreadsheet records, other languages and message-only intent inference require separately specified campaigns and compatible schemas. Do not disguise these as message examples to claim coverage. Hold out independently authored validation/test work; generators must not read its answers. Keep source-family groups intact across any future splits.

For existing accepted shards, preserve originals and run updated structural checks. Sample a re-audit focused on complete claims, grouping and relevance; do not declare all 207 reported accepted records defective without inspection. Corrections to source/annotations/IDs/required facts invalidate prior reviews and require fresh hash-bound review. This feedback report is useful process evidence, not an independently reproduced acceptance rate or model-accuracy result.
