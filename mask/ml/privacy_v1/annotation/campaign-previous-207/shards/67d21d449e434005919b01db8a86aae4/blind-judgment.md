# Blind judgment (phase 1) — reviewer claude-opus-subagent-reviewer-1-wave1

Shard 67d21d449e434005919b01db8a86aae4. Input: blind-B.json (10 items). Written before seeing any writer output.
Convention: entity annotations should be goal-independent (identical for task-swapped pairs B-01/B-02, B-03/B-04); only decisions/DROPs may differ.

## B-01 (GP update: diagnosis, ibuprofen dose/timing, what not taken)
- Entities: PERSON "Aigerim Bekova" -> ALIAS [PERSON_1] ("My sister," role word stays). HEALTH spans ("ankle swelled up", "mild sprain, not a fracture", "X-ray showed no break", "ibuprofen 400 mg ...", "not taken any aspirin", "2 cm larger") -> KEEP (task needs them). "urgent care", "the hike" benign/not entities (or LOCATION-ish, KEEP).
- Required facts: "mild sprain, not a fracture"; "the X-ray showed no break"; "ibuprofen 400 mg, one tablet every 8 hours, for 5 days"; "I think I'd been taking it for 3 days, no wait, 4" (uncertainty + self-correction must survive); "I have not taken any aspirin"; "roughly 2 cm larger than my other ankle".
- DROP candidates: none required. "Quick summary before I forget." is filler but harmless; I would not insist on dropping it. Sister sentence carries the urgent-care/ankle context -> keep with alias.
- Expected: "Quick summary before I forget. My sister, [PERSON_1], drove me to urgent care after my ankle swelled up on the hike. [rest verbatim]"
- Note: text says swelling "started to go down" then is "now roughly 2 cm larger" — consistent enough (still swollen), must not be altered.

## B-02 (pharmacist questions about ibuprofen) — same text as B-01
- Entities: identical to B-01 (PERSON "Aigerim Bekova" ALIAS [PERSON_1]; HEALTH spans).
- Required: ibuprofen dose/frequency/duration; "3 days, no wait, 4"; "not taken any aspirin" (interaction-relevant); sprain diagnosis (indication); swelling status arguably relevant.
- DROP candidate (moderate confidence): sentence "My sister, Aigerim Bekova, drove me to urgent care after my ankle swelled up on the hike." — who drove is irrelevant to pharmacist questions; but it carries "ankle swelled up", which the next sentence partially restates. Acceptable either as DROP or as ALIAS-keep; I lean ALIAS-keep is safe, DROP is defensible. Filler opener "Quick summary before I forget." also droppable. Should not drop the diagnosis, aspirin or swelling sentences.
- Expected (if no DROP): same as B-01. If the pair is meant to differ, the sister sentence DROP is the natural difference.

## B-03 (weekly set-aside for insurance premium by renewal + monthly remainder after savings)
- Entities: DATE "14 December" -> KEEP (required). FINANCIAL amounts (2,450 take-home; 1,020 rent; 135 utilities; 380 groceries; 30 cleaning; 612 premium; 150 savings) -> KEEP if annotated at all; no direct identifiers, no PERSON.
- Required: all amounts; "14 December"; "payable in one go"; "not planning to pay it in instalments"; "which I think includes the internet" (uncertainty); "with nothing left over for eating out".
- DROP: none.
- Expected: output == input (no replacements).
- Arithmetic sanity: 2450-1020-135-380-30-150 = 735/month. Weekly set-aside depends on the current date (not stated) — task wording is fine, answer needs an assumption.

## B-04 (check monthly arithmetic, monthly remainder) — same text as B-03
- Entities: identical to B-03.
- Required: all monthly amounts, savings 150, "nothing left over for eating out".
- Insurance sentences ("My car insurance renews on 14 December ... payable in one go." / "I'm not planning to pay it in instalments."): arguably not needed for monthly arithmetic, but the one-off 612 affects December's remainder. Uncertain: DATE could become [DATE] PLACEHOLDER or the two sentences DROPped; I would accept KEEP, and accept a DROP only if reason is specific (one-off annual payment, not a monthly figure). A DATE PLACEHOLDER is low-value (renewal date is not sensitive).
- Expected (my preference): output == input; acceptable variant with insurance sentences dropped.

## B-05 (action list with owners and deadlines)
- Entities: PERSON "Tomás Echeverría" -> [PERSON_1]; later "Tomás" -> [PERSON_1] (same person, clearly resolved); "he"/"him" stay. PERSON "Haruto Kobayashi" -> [PERSON_2]; "he does" refers to Haruto. "My manager," and "from finance" stay (finance = department, not a private ORG; at most ORG KEEP). EMPLOYMENT "four-day week from the first quarter" -> KEEP (part of an agreed action/condition). DATE "the first quarter", "by Friday", "before Thursday's meeting" -> KEEP.
- Required: four-day week conditional on on-call rota covered ("which he thinks is not a problem" — attribution/uncertainty); budget code by Friday (owner Haruto); "should not book the offsite hotel until he does" (negation + dependency); checklist "from 18 items to 12"; draft sent to Tomás before Thursday's meeting.
- DROP: none ("Hi team, notes from today's one-to-one..." is a filler opener; harmless).
- Expected: "Hi team, notes from today's one-to-one before I lose them. My manager, [PERSON_1], agreed ... [PERSON_2] from finance will confirm the budget code by Friday, ... [PERSON_1] also wants the launch checklist cut from 18 items to 12, with the draft sent to him before Thursday's meeting."
- Minor oddity: "Hi team" + one-to-one notes; acceptable.

## B-06 (friendly workshop invite opener, <120 words)
- Entities: "Kahneman" and "Thinking, Fast and Slow" are public/citation names -> NOT private PERSON (annotating them = false positive). "Thursday" DATE benign KEEP. "sprint 14" not an entity.
- Required: planning fallacy framing; "roughly 30 to 40 percent"; sprint 14 "6 weeks" vs "9"; "I am not proposing we add more process"; "15-minute pre-mortem at the start of each planning session"; "over the next 3 sprints".
- DROP: none.
- Expected: output == input. (Negative/no-op example.)

## B-07 (polite firm complaint email asking for refund)
- Entities: ACCOUNT_ID "70418832" -> PLACEHOLDER [ACCOUNT_ID] (direct identifier, cannot be kept even though useful). PHONE "07700 900431" -> [PHONE]. EMAIL "saoirse.nibhriain@example.invalid" -> [EMAIL]. PERSON "Saoirse Ní Bhriain" (signature) -> [PERSON_1]. In the separate paragraph: HEALTH "physiotherapist for my shoulder", DATE "since March", DATE "3 November", EMPLOYMENT/HEALTH "sick leave" — annotated regardless of DROP.
- Required: "3 routers billed, only 1 delivered"; "14.99 a month"; "Please refund the two extra charges and confirm in writing."
- DROP (high confidence): paragraph "Separately, I have been seeing a physiotherapist for my shoulder since March and my sick leave ends on 3 November, but that has nothing to do with this complaint." — unrelated health/employment info, self-declared irrelevant, contains no required facts.
- Keep the contact sentence with placeholders (useful for a complaint email).
- Expected: "Hello,\n\nDetails for the broadband refund request:\n- Account number [ACCOUNT_ID]\n- 3 routers billed, only 1 delivered\n- Each router billed at 14.99 a month\n\nYou can reach me on [PHONE] or at [EMAIL] if you need anything else. Please refund the two extra charges and confirm in writing.\n\nRegards,\n[PERSON_1]" (no leftover blank-line artefacts).

## B-08 (support ticket summary: problem + what tried)
- Entities: none private. "Orbis X2" product, firmware "3.1.4"/"3.0.9", channels 36/44/149, "8 months", "24 month warranty" are benign technical facts -> not entities (annotating as ORG/ACCOUNT_ID would be false positive).
- Required: 5 GHz drops "roughly every 20 minutes" since firmware 3.1.4; "does not happen on 2.4 GHz"; "factory reset did not help"; 3 channels (36, 44, 149) same result; "not changed any other settings"; ~8 months old, 24-month warranty; rollback-to-3.0.9 question.
- DROP: none.
- Expected: output == input.

## B-09 (trip planning checklist: who does what, numbers to confirm)
- Entities: PERSON "Bartholomew Nkemelu" -> [PERSON_1]. AGE "40th" (birthday) -> contextual; not needed for checklist — uncertain: KEEP is harmless, PLACEHOLDER makes "[PERSON_1]'s [AGE] birthday" (slightly awkward); I would accept either, not a GENERALISE (ordinal). PERSON "Wiremu Parata" -> [PERSON_2]. "my cousin" FAMILY role word stays. HEALTH "repeat my cholesterol test", DATE "in the new year" in last sentence.
- Required: [PERSON_2] handles cabin booking; head count "by the end of next week"; "9 adults and 3 kids"; "I think my cousin may bring 2 more, not sure yet" (uncertainty); "150 per head, covering food and the cabin, not transport".
- DROP (high confidence): "Also, between us, my doctor wants me to repeat my cholesterol test in the new year and I keep forgetting about it." — unrelated health info.
- Expected: "We're doing a weekend away for [PERSON_1]'s 40th birthday. [PERSON_2] is handling the cabin booking and needs a head count by the end of next week; so far it's 9 adults and 3 kids, but I think my cousin may bring 2 more, not sure yet. Budget is 150 per head, covering food and the cabin, not transport."

## B-10 (task: "Help me sort this out.")
- Task is vague: cannot establish anything as unnecessary -> no section DROP justifiable; contextual facts KEEP. Possible "bad task" flag if the dataset expects specific tasks; as a deliberately vague-task example it is fine only if the record keeps everything except direct identifiers.
- Entities: ADDRESS "14 Linden Row" -> PLACEHOLDER [ADDRESS] (direct identifier). PERSON "Yusuf Demir" -> [PERSON_1] ("my brother-in-law," stays). DATE "the 3rd" / "the 5th" KEEP with "I think, or maybe ... I'll check" uncertainty intact. "the agent", "my landlord", "my old flatmate" role words, not entities.
- Required: keys "on the 3rd, I think, or maybe the 5th"; van "85 for the day"; help "from 9 until about 1 but not after"; "I have not told my landlord yet"; notice "30 days, not 60"; owe "120 for the broadband", pay before leaving.
- DROP: none.
- Expected: "Thinking out loud about the move. The new flat is at [ADDRESS], and the keys are collected from the agent on the 3rd, I think, or maybe the 5th, I'll check. The van hire is 85 for the day, and my brother-in-law, [PERSON_1], can help from 9 until about 1 but not after. [rest verbatim]"

## Things I'll check in phase 2
- B-01/B-02 and B-03/B-04 entity sets identical; differences only in DROP/decisions, and the claimed difference is real.
- Public name Kahneman not aliased (B-06); no false positives on B-08 product/firmware numbers.
- Signature name and email in B-07 both covered; B-07/B-09 DROPs clean (no dangling blank lines / "Also,").
- Uncertainty phrases ("no wait, 4", "I think", "maybe the 5th", "not sure yet") and negations preserved verbatim.
