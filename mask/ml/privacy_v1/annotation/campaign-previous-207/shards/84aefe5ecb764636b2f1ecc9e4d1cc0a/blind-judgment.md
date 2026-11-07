# Blind judgment (phase 1) — reviewer claude-opus-subagent-reviewer-5-wave1-revisions

Shard 84aefe5ecb764636b2f1ecc9e4d1cc0a. Input: blind-AD.json (R5-01..R5-05). Independent, made before seeing any writer data.
No task-swapped pairs are apparent within these 5 items (all texts distinct).

## R5-01 (clinical note; logistics explicitly not needed)
Entities:
- "Priya Raghunathan" PERSON (practice nurse) -> ALIAS [PERSON_1] (if not inside a dropped section).
- "Ngoc Anh Tran" PERSON (sister) -> ALIAS [PERSON_2]. Role words "my dad", "my sister", "the practice nurse" stay.
- "12 March" DATE, "9:40" (time, part of the appointment date/time) — logistics, not needed.
- "Monday", "Tuesday", "Wednesday" DATE (relative weekdays) -> KEEP (chronology of readings and missed dose).
- HEALTH: fasting glucose values, "500 mg of metformin twice a day", skipped evening dose, "No dizziness, just tiredness" -> KEEP.
- "I work that morning" — weak EMPLOYMENT, not needed.
Required facts (exact): "7.2 mmol/L on Monday", "6.8 on Tuesday", "9.1 on Wednesday", "just toast for dinner (I'm not convinced)", "500 mg of metformin twice a day", "skipped the evening dose once, on Tuesday", "No dizziness, just tiredness".
Section DROP: the sentence "His appointment with Priya Raghunathan, the practice nurse, is on 12 March at 9:40, and my sister Ngoc Anh Tran is driving him because I work that morning." — task explicitly excludes visit logistics; contains no clinical facts. Confident DROP. Entities inside should still be annotated (PERSON x2, DATE, time).
"I'd like the readings ready to hand over." — borderline; harmless, contains no identifier. KEEP or DROP both defensible (uncertain); if dropped, reason = request about handover logistics.
Expected output: "My dad's fasting glucose log, in case it helps: 7.2 mmol/L on Monday, 6.8 on Tuesday, then 9.1 on Wednesday after what he insists was just toast for dinner (I'm not convinced). He takes 500 mg of metformin twice a day and skipped the evening dose once, on Tuesday. No dizziness, just tiredness. I'd like the readings ready to hand over."
Watch: no negation loss ("No dizziness"), "once", "twice a day", uncertainty "(I'm not convinced)" preserved; no dangling whitespace where the sentence was removed.

## R5-02 (ops sync checklist)
Entities:
- "Oluwaseun Adeyemi" PERSON -> [PERSON_1]; "Oluwaseun" (bullet 3) same person -> [PERSON_1] ("his" pronoun stays).
- "his mother" FAMILY; "in hospital after a fall" HEALTH (third party); "the 3rd" DATE.
- "Monday", "Wednesday", "next week" DATE -> KEEP (deadlines).
- Numbers: "340", "approved up to 400", "no more than 4 people on nights", "size M and L only, not S" -> KEEP verbatim (negation/limits).
- No ORG named (supplier, facilities generic). No direct identifiers otherwise.
Required facts: printer replacement + 340 quote / 400 cap; rota confirmation by Wednesday with ≤4 on nights; glove reorder M and L only, not S; loading-bay door sticks when cold.
Section DROP candidate: bullet 3 ("Oluwaseun mentioned in passing that his mother is in hospital ..."). It is third-party health info "mentioned in passing", not an agenda item. BUT it carries "he may need cover next week", which is plausibly relevant to the rota item. UNCERTAIN. I lean DROP as acceptable (reason: incidental family health disclosure, not an action item), but a KEEP with HEALTH/DATE placeholders would also be defensible. A DROP must not be justified as "contains nothing operational" — it does contain the possible cover need; the justification should acknowledge that.
Expected output (my lean): bullets 1, 2, 4, 5 with "Oluwaseun Adeyemi" -> "[PERSON_1]"; intro line kept.

## R5-03 (vague help: make sense / what to sort out)
Entities:
- "Kasimir" PERSON -> [PERSON_1]; "Lindiwe" PERSON -> [PERSON_2] ("her" stays); "Oluwaseun" PERSON -> [PERSON_3] ("his" stays).
- "the 14th", "the 15th" DATE -> KEEP (uncertainty "I think? maybe ... checking" must survive).
- "knee surgery" HEALTH (third party). Needed? Only the fact that he might not come matters for the headcount; the reason is not needed. Lean PLACEHOLDER [HEALTH] ("because of his [HEALTH]"); KEEP defensible under a vague task. Uncertain.
- "9pm", "22", "140 a night for 3 nights", "200 each", "not sure we agreed" -> KEEP.
- "the wedding", "rehearsal dinner", "airport" benign; no location named.
Section DROP: none — every clause is a to-do relevant item.
Expected output: "ok so thinking about the wedding thing. flights are booked for the 14th (I think? maybe the 15th, checking) and [PERSON_1] said he can pick us up from the airport if it's before 9pm. [PERSON_2] is doing the rehearsal dinner and wants a headcount, I told her 22 but [PERSON_3] might not come because of his [HEALTH]. Hotel is 140 a night for 3 nights. also need to decide about the gift, maybe 200 each? not sure we agreed on that" (or with "knee surgery" kept).

## R5-04 (polite short notice; time and place clear)
Entities:
- "Elif Karaca" PERSON -> [PERSON_1]; "Bjørn Aasgaard" PERSON -> [PERSON_2] (leader role must stay attached to the alias).
- "Rotterdam depot" LOCATION -> KEEP (place is required).
- "Halvorsen Freight HQ" ORG (+ location of sender's desk) -> not needed for the notice; PLACEHOLDER [ORG] preferred (KEEP defensible since team shares the employer; uncertain).
- "Tuesday", "Thursday at 9:30", "next week", "end of Monday, not Wednesday" DATE -> KEEP (negation "not Wednesday" crucial).
Required facts: moved from Tuesday to Thursday at 9:30; still at the Rotterdam depot; [PERSON_2] leads; sender joins by video; bring own high-vis vests, wear closed shoes; objections by end of Monday, not Wednesday.
Section DROP candidate: "I'd rather not cancel it again after what happened with the forklift audit." — backstory, not needed for a polite short notice; contains no required fact. Lean DROP (moderate confidence). Sentence "I'll be joining from my usual desk at Halvorsen Freight HQ by video" is part of a sentence with the leader fact, so not a standalone DROP unit; the clause is borderline-useful.
Expected output: "Hi all, a quick change for next week. [PERSON_1] has asked that the dock safety walkthrough move from Tuesday to Thursday at 9:30, still at the Rotterdam depot. [PERSON_2] will lead it, and I'll be joining from my usual desk at [ORG] by video. Please bring your own high-vis vests and wear closed shoes. If Thursday doesn't work, tell me by end of Monday, not Wednesday."

## R5-05 (generic "Can you help with this?" — accommodation planning)
Entities:
- "Nneka Obi" PERSON (aunt) -> [PERSON_1]; "Henrik Vestergaard" PERSON (cousin) -> [PERSON_2]. Role words "My aunt", "My cousin" stay.
- "Dunedin" LOCATION -> KEEP (destination needed). "Oslo" LOCATION -> origin; marginal; KEEP or PLACEHOLDER [LOCATION] both defensible (uncertain; I lean KEEP as travel logistics, low sensitivity).
- "14 March", "four days" DATE -> KEEP.
- "81" AGE -> needed only loosely (accessibility); KEEP or GENERALISE (80–89) acceptable; uncertain.
- "uses a walker, so stairs are a problem" HEALTH -> KEEP (accessibility requirement).
- "back injury" HEALTH -> KEEP (drives "maybe not a sofa bed"); hedge "I think he mentioned" must survive.
- "220 a night, maybe 250 if breakfast is included" FINANCIAL -> KEEP. "eight or nine people" uncertainty -> KEEP.
Section DROP: none. Final "Can you help with this?" duplicates task but is harmless; no DROP needed.
Expected output: same text with the two names aliased (optionally AGE generalised).

## Things I will check in phase 2
- Whether the two names inside the R5-01 dropped sentence are still annotated; whether DROP reasons are specific.
- R5-02 bullet-3 treatment and its justification (cover need); consistent [PERSON_1] across "Oluwaseun Adeyemi"/"Oluwaseun".
- R5-04 "not Wednesday" negation preserved; ORG handling; forklift sentence.
- HEALTH treatment of third parties (R5-02, R5-03) vs needed health (R5-01, R5-05).
