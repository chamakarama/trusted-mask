# Calibration guidance (binding for all writers and reviewers)

Source: two independent reviews of calibration shard 221daaf242e64b2daaf567e507e2b744 (pairs lisbon-trip, export-ticket; 4/4 accepted by both). The reviewers disagreed on no verdict. The points below settle their differing interpretations using SECTION_DATA_INSTRUCTIONS.md, REVIEW_RUBRIC.md, data.py and sections.py, not by majority vote.

## Section DROP construction
- A section decision is only `kind: section`, `action: DROP`, `relevance: unnecessary`, plus a specific reason. Use only the four runtime SECTION_LABELS: HEALTH, FINANCIAL, EMPLOYMENT, FAMILY. The validator also accepts DATE/AGE/LOCATION/ORG, but section_audit and the runtime never score those labels. Never use them for a section.
- Pick the one label that honestly describes the dominant content. A mixed unit such as clinic cost plus insurer terms can be FINANCIAL. Confidential business figures such as a contract price are FINANCIAL. Two adjacent complete units may be two section decisions when the replayed output is clean.
- A DROP must cover complete units from `section_units` (CLAUSE_MODE for a sentence or clause in a mixed paragraph, SECTION_MODE for a blank-line paragraph), including the boundary whitespace and punctuation. It must never cut through a retained unit. Check the replay for leftover fragments.
- Inside a section DROP, leave out the child entity decisions. Still list the entities, and keep them identical across both tasks of a pair (same ids, spans, labels, entity_id).
- Credentials, usernames, contact details and other DIRECT/ORG values can never be section-dropped and can never be KEEP. If the clause holding them is not needed, give them PLACEHOLDER and keep the clause. This is correct and is not a missed DROP. Only drop the clause when it is also an honest HEALTH/FINANCIAL/EMPLOYMENT/FAMILY unit.
- Relevance is separate from permission. A protected value may be `uncertain` in one task and `unnecessary` in the other, and the action stays PLACEHOLDER/ALIAS in both. Never present necessary-but-forbidden data as unnecessary just to get a DROP.

## What counts as a real switch
- A switch is one complete unit that is essential in the KEEP task and fully covered by a reviewed section DROP in the DROP task. In the KEEP task it must overlap an essential KEEP entity decision or a required fact. In the DROP task, `section_targets` must give it `unnecessary`. Verify this in at least the mode where the unit exists: clause mode for a sentence in a mixed paragraph, paragraph mode for a blank-line block.
- A unit dropped in both tasks (e.g. the contract price) is an in-pair control, not a switch. A unit kept in both is not a switch either. Count and report only real switched units in `switch_quotes`. Leave out structural headings.
- The switch must come from the task's real needs. Judge relevance by the stated task only (an injury is unnecessary for a delayed-check-in compensation email). Do not get the switch by changing policy or by calling a clearly relevant fact unnecessary.
- A named colleague's rota or secondment facts may be KEEP for a handover task when the name is aliased. If the recipient only sees [PERSON_n], record that as a disclosure-driven utility limit. It is not a defect.

## Required facts
- Required facts are answer dependencies only, written as minimal complete claims: actor, action, negation, hedge, condition, units, correction. Split them around aliased names (e.g. `, our usual on-call engineer,` + `is on secondment ... until 20 June, so`). Never include [PERSON_n] or a protected value.
- Do not add peripheral retained sentences as required facts. `section_targets` marks any unit that overlaps a required fact as essential, so a peripheral fact plants a false essential section label. Example: the check-in-delay sentence in the travel-claim task. Writers must avoid this. Reviewers mark it NOTE (FACT_COVERAGE). It becomes BLOCKING only if it touches the unit claimed as the switch, or makes the switch unit essential in the DROP task.
- Not every retained sentence needs a required fact. Leaving harmless retained text without a label (e.g. 480 euros prepaid, the day-trip sentence) is fine.
- KEEP entity spans can be whole-sentence or whole-clause sensitive claims, as in the shipped example. They must not be whole multi-claim paragraphs. Annotate names and values separately.

## Controls
- In relevant-sensitive controls, essential health or money facts stay KEEP with required facts. There is no DROP just because a section mentions health or money. Identities are still protected.
- In benign controls, make no edits and tag no public names (businesses such as Hotel Alvor, cities, coarse dates, ticket numbers) or harmless numbers. A customer name in a corporate ticket is ORG with PLACEHOLDER.
- In vague-task controls, `uncertain` relevance stays uncertain. KEEP plausibly useful permitted context with a short reason. Protect direct identifiers. Do not remove sections without a justification.

## Blocking vs nonblocking
- BLOCKING: missed core privacy risk (a name, identifier, credential or confidential value exposed), a DROP that cuts a retained unit or leaves a revealing fragment, a required fact that is lost or changed in meaning (negation, condition, attribution), a fake switch, a section label outside the four, pair entities that differ between tasks, failed validation or replay, and self-review or an unbound review.
- NOTE only: retained non-sensitive text with no safe section boundary (not a DROP target), speculative combination clues (city + date + aliased first name, service-account suffix), harmless unannotated amounts next to an annotated expense, optional extra wording preferences, and disclosure-driven utility limits that are recorded honestly.
- Reviewer ids must be shard-qualified and differ from the generator id. Use failure tags with a BLOCKING/NOTE prefix. A reject needs an exact quote and the rule it breaks. Allow at most two repair rounds per record, then replace the record.
- Writer advice (not a review rule): prefer sources where the unneeded material is a labelable sensitive unit. Unlabelled leftover text adds no section-training signal.
