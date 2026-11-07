# Calibration reviewer 2 notes

Blind pass (text + task only) expectations, written before opening annotations:
- Lisbon claim timeline: keep injury, treatment, 95-euro cost, 30-day deadline and coverage doubt; alias Ines; delay paragraph optional. Hotel email: keep booking and delay, drop injury and clinic/insurer content.
- Northgate ticket debug: keep timeout facts; protect customer, username, password; drop contract price and rota/secondment. Handover: keep who covers/until when; protect credentials and customer; contract price still dropped.
Result: annotations matched my blind expectations; all four accepted.

Rule interpretations made:
1. A confidential figure (contract price) that is unrelated to both tasks is DROP/unnecessary in both variants; it is a control inside the pair, not the switch. The switch is the staffing/secondment clause.
2. Credentials/usernames cannot KEEP; retaining them as [SECRET]/[USERNAME] placeholders in a retained clause is acceptable when removing the clause would cut a mixed unit (the "temporary password ... expires on Friday" sentence).
3. Relevance for a protected-but-unneeded username may be `uncertain` in a diagnostic task and `unnecessary` in a handover; honest per-task difference, nonblocking.
4. Public business names (Hotel Alvor) are untagged; a customer name in a corporate ticket is ORG.
5. Harmless unannotated amounts (480 euros prepaid) beside annotated personal expenses (95 euros) are nonblocking; tagging the claim-relevant expense is sufficient.
6. Required facts need not include every kept sentence (e.g. 480 euros, day-trip sentence); extra retained required fact (check-in delay in claim task) is harmless.
7. Retained but non-essential sentences with no safe section boundary (ticket diagnosis in the handover) are a NOTE, not a rejection; unlabelled is not a DROP target.
8. Adjacent paragraph DROPs as two section decisions are acceptable when each is a complete unit and the output is clean.
9. Task relevance judged by the stated task only: the hotel-email task is about delayed check-in, so an injury at the hotel is unnecessary even though it could support a wider complaint.
10. Residual combination clues (Lisbon + dates + hotel + first name aliased; svc-export-nf suffix) are speculative low-impact NOTEs.
