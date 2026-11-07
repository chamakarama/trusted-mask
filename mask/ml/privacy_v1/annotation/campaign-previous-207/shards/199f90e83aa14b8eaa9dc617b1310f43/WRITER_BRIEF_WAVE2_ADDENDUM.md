# Wave 2 addendum (read AFTER WRITER_BRIEF.md; it overrides where it conflicts)

Wave 1 (40 records, 4 writers, independent Opus review) was accepted/rejected as follows: first-pass acceptance was only ~65%.
Learn from the rejection reasons so your records pass first time. You are one of 8 wave-2 writers (W1..W8) producing 25 records each.

## Lessons from wave-1 rejections (apply all)
1. **Span discipline.** Each entity span is ONE fact, starting and ending on word boundaries, with NO trailing full stop and no lumped facts.
   Clause-level HEALTH/FINANCIAL/EMPLOYMENT spans are fine for KEEP, but the span must be grammatical if it is ever replaced:
   a span "is in hospital after a fall" produced "his mother [HEALTH] on [DATE]" (broken). Start spans after the verb ("in hospital after a fall").
   Prefer short fact spans: "ibuprofen 400 mg, one tablet every 8 hours", "Rent is 1,020", "dental hygienist".
2. **required_facts must cover everything the task's output depends on**: every number in a calculation, the diagnosis a GP task asks for, the place if the task says "time and place", corrections ("400, no, closer to 450"), negations, who-did-what, role words ("My sister,"). Do not list contentless fragments ("renews on") or facts the task does not use. Do not list a fact that a changing edit touches.
3. **Section DROP only when nothing the task needs is inside.** Read the whole dropped sentence/bullet against the task. Wave 1: a hospital bullet containing "he may need cover next week" was dropped though the rota task needed it -> rejected. Good DROPs: unrelated tangents (a landlord rent rise inside a performance-review prep list; a daughter's school play inside an inventory email; a physio appointment inside a status update).
   Also use DROP where the task clearly excludes content (e.g. task says logistics not needed) — don't leave it in with only a date placeholder.
4. **PLACEHOLDER on a contextual fact only when relevance is "unnecessary".** If you'd say "uncertain" => KEEP. Under a vague task, KEEP uncertain facts; alias persons; placeholder direct identifiers (relevance essential/unnecessary as truthful).
5. **Consistency inside a record.** If you tag one weekday/date mention as DATE, tag all the same-kind mentions that matter (Monday/Wednesday/"end of Monday"), or write the text so only one date-like mention exists. Same for parallel money facts.
6. **Task-swapped pairs must genuinely differ in treatment** (not just one date placeholder): e.g. DATE KEEP vs [DATE]; AGE KEEP vs GENERALISE; a tangent kept vs DROPPED; a health detail KEEP vs [HEALTH]. Text, entities and all group ids identical; ids and tasks differ; decisions/required_facts/approved_output differ.
7. **Don't over-claim "essential".** essential = task output truly needs it; otherwise uncertain.
8. Role words (my sister / my husband / my aunt) stay unannotated unless the relationship is itself a task fact (then FAMILY KEEP); be consistent.
9. Vague tasks ("Help me with this.") are allowed but at most 1 per writer, and handled conservatively.
10. **Length**: wave-1 messages averaged 88 words. Aim for 95–125 words (stay within 50–150). Make them read like real messages, not worked examples: vary openers; messy, human, with asides.
11. **Fresh scenarios.** Wave 1 already used: ankle sprain + ibuprofen, father's blood pressure/amlodipine, glucose log, car-insurance renewal budget, flatshare split, broadband refund, router dropouts, locked-out account, desk bolts, house-sitter checklist, family reunion, wedding trip, move notes, planning-fallacy workshop, dishwasher E24, 50/30/20 worksheet, weekend away, 70th birthday party, review prep, inventory email, desk delivery, wifi dropouts, trip journal, walkthrough reschedule, sync notes. Do NOT reuse these; invent new scenarios (e.g. a landlord repair thread, a school-trip permission, a vaccination schedule, a freelance invoice chase, a pension statement question, a gym membership dispute, a shift swap, a library fine, a visa-appointment checklist, a tax return worksheet, a sleep diary, a refund for a cancelled flight...).
12. Check output grammar for every PLACEHOLDER/ALIAS by reading the final sentence aloud.

## Coverage required in YOUR 25 records
- 25 records = 3 task-swapped pairs (6 records, 3 families) + 19 singles (19 families) = 22 families. Topic spread: 5 each of health, budgeting/finances, workplace, customer support, personal planning (pairs count toward topics).
- Clean negatives: 5 (entities []; tempting numbers/dates/public names/companies; benign proper nouns; no private info).
- Section-DROP records: 5 (at least 2 bullets/lines in lists, at least 2 mid-paragraph sentences; reasons specific; boundary whitespace inside the quote so output is clean).
- Direct identifiers across your set (each with a natural phrasing, synthetic values): 1 IBAN-like (fake, e.g. a `DE00 0000 ...`/`GB00 TEST ...` obviously synthetic), 1 NATIONAL_ID-like (obviously synthetic format), 2 PHONE, 2 ADDRESS, 2 EMAIL (example.invalid), 1 USERNAME, 1 PAYMENT_CARD (obviously test number), 2 SECRET ("my password is", "the code is", "PIN is", "the Wi-Fi key is").
- At least 2 messages with 3+ different people; at least 2 with a repeated name (first-name-only repeats share the entity_id; remember `occurrence`).
- At least 2 messages with AGE (one pair or two records showing KEEP vs GENERALISE/PLACEHOLDER), at least 2 with ORG/LOCATION where the task needs one but not the other, at least 2 with EMPLOYMENT/FAMILY facts.
- At least 1 message with an embedded instruction aimed at the privacy filter/assistant (just data).
- Formats: at least 4 bullet lists/checklists, 3 email excerpts (with greeting/sign-off), 3 informal notes/chat paste, 2 forwarded or quoted messages, rest paragraphs.
- Corrections/uncertainty ("40, no wait 45", "I think", "maybe") in at least 8 records; negation and units in at least 8.
- Public/citation names or companies left un-annotated in at least 3 records (never as private PERSON).
- Do not reuse the same sentence frames across your records.

## Names
Use ONLY the name pool assigned to you in your prompt (invented names for fictional private individuals). A single record may use first-name-only references. Avoid famous real people as private individuals; public/citation names (e.g. a cited author) allowed only as un-annotated negatives/context.

## Process
Write 2 drafts (draft-01.json: 13 records, draft-02.json: 12 records), resolve and validate each (resolved-01.jsonl, resolved-02.jsonl). Then fix any validation errors in new versioned files. Your final deliverable is the list of resolved files. Report as per WRITER_BRIEF (include a per-record one-liner and the coverage tally against the list above).
