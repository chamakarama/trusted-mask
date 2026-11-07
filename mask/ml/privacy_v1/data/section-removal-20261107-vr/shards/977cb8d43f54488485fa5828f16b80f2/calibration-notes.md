# Calibration reviewer 1 notes (claude-sonnet-5-5), shard 977cb8d43f54488485fa5828f16b80f2

Reviewed: the 4 records in shard 221daaf242e64b2daaf567e507e2b744/resolved-01.jsonl (pairs lisbon-trip and export-ticket). Validation passed (4 records, file sha256 bc24ad2e...). All four accepted; token fit checked with the local DeBERTa tokenizer: 159-178 tokens for text plus task (limit 512, marked-span inputs add only a few tokens).

## Blind pass (text and task only), then comparison

- Lisbon, insurance timeline: expected alias for Ines, keep injury/treatment/cost/deadline paragraphs; plausible drop of the check-in-delay clause. Annotation matched except the delay clause was kept and made a required fact.
- Lisbon, hotel email: expected alias, keep booking paragraph, drop injury paragraph and clinic-cost/insurer paragraph. Matched exactly.
- Export, diagnosis: expected placeholders for customer, username, password; drop contract sentence and staffing sentence. Matched.
- Export, handover: expected keep staffing sentence with aliases, protect customer/credentials, drop contract sentence; I also expected the unrelated diagnosis text to be optional. Matched on all sensitive items; the diagnosis and credential sentences were retained.

## Rule interpretations I had to make

1. Required facts are only task answer dependencies. Retaining a harmless sentence does not make it a required fact; a peripheral required fact turns its clause "essential" in section targets (section_targets treats any required-fact overlap as essential). Flagged as NOTE for the check-in-delay clause in travel-claim; not blocking because no privacy or meaning loss results.
2. A pair counts as switched when a complete unit has essential KEEP/required-fact support in one task and full section-DROP coverage in the other (verified with section_units in both clause and paragraph modes and the section_targets logic). Lisbon: injury paragraph and cost/deadline paragraph. Export: the staffing sentence (the contract sentence is DROP in both, so it is a control, not a switch).
3. SECRET, USERNAME and ORG sentences cannot be section-dropped: section labels are limited to HEALTH, FINANCIAL, EMPLOYMENT, FAMILY. Credential and username therefore get PLACEHOLDER in both tasks, and the surrounding sentence stays. This is correct, not a missed DROP.
4. Relevance is not permission: the password and customer name stay protected in both tasks regardless of usefulness; relevance may be uncertain or unnecessary but the action is PLACEHOLDER either way. svc-export-nf as `uncertain` for diagnosis and `unnecessary` for handover is acceptable task-dependent relevance on identical entities.
5. Child decisions inside a section DROP are omitted (name-short, injury, care, cost, claim in hotel-email; price, names, away/cover in export-debug). Entities stay listed and identical across the pair, per task-pair rules.
6. Shared entity_id for repeated mentions (Ines full/short, Northgate twice) gives the same alias/label; occurrences resolved to distinct spans without explicit `occurrence`, and validation passes.
7. Public business names (Hotel Alvor), cities (Lisbon, Tampere), coarse dates and the ticket number stay untagged; combination risk is low and nonblocking under the rubric. Hotel Alvor is also needed for the hotel email.
8. Whole-sentence KEEP spans (for injury, care, cost, claim, away, cover) are accepted as "meaningful sensitive claims" the way the shipped example does; the label for the insurer-deadline sentence (FINANCIAL) is acceptable even though it mixes deadline and coverage doubt.
9. Section label choice for a mixed paragraph (clinic cost plus insurer terms as FINANCIAL) is acceptable when any listed label honestly fits one dominant content; no need for a second label.
10. Staffing and secondment facts about a named colleague are operational rota information, permitted for a handover task when the name is aliased; alias rehydration loss (recipient sees [PERSON_n]) is a disclosure-driven utility limit, not a rejection reason.
11. Retained non-sensitive text unrelated to the task (diagnosis sentences in the handover output) is not blocking; it is only a missed optional training signal.
12. Reviewer identity is the shard-qualified id 977cb8d43f54488485fa5828f16b80f2:claude-sonnet-5-5-calibration-reviewer-1, distinct from generator 221daaf2...:generator.
