# Blind judgment (PHASE 1) — reviewer claude-opus-subagent-reviewer-2-wave1

Shard: 67142b1e40384307a87f011c1b0801cc. Input: blind-D.json (10 items). Written before seeing any writer annotations.

Cross-item note: name reuse across items — "Henrik Vestergaard" (D-04 brother, D-10 cousin), "Bjørn Aasgaard" (D-05, D-06), "Marisol" (D-07 stranger "Marisol Quispe", D-09 house-sitter). Fine within records, but a sign of a small name pool / template reuse; check in phase 2.

## D-01 (GP questions; age where it matters)
- Entities: PERSON "Teodor Constantinescu" -> ALIAS [PERSON_1]; "My father" role kept. AGE "78" KEEP (task asks for age). HEALTH "getting dizzy when he stands up quickly", "142/88, 138/85", "150/90", "10 mg of amlodipine every evening", "has not missed a dose", "has not fainted" KEEP. DATE "last two weeks", "Sunday", "next week" KEEP (chronology; low risk).
- Required facts: "78", "142/88", "138/85", "150/90", "I may have misread that one", "10 mg of amlodipine every evening", "has not missed a dose", "He has not fainted", "dizzy when he stands up quickly".
- DROP: none. Last sentence is partly meta ("please keep the numbers exactly") but carries "appointment next week"; keep (uncertain, not a clear DROP).
- Expected: "My father, [PERSON_1], is 78 and has been getting dizzy when he stands up quickly. ... (rest verbatim)".

## D-02 (pharmacist dose check; same text as D-01)
- Entity annotations must be identical to D-01 (goal-independent).
- PERSON -> ALIAS [PERSON_1]. Readings, amlodipine 10 mg, adherence, "has not fainted", dizziness KEEP (dizziness on standing is relevant to an antihypertensive dose check).
- AGE "78": uncertain. Relevant to dosing in older adults, so KEEP is defensible; GENERALISE "70–79" also acceptable since the task does not ask for age. I would accept either, not PLACEHOLDER (loses dose-relevant info).
- DROP: none clearly; final sentence about GP appointment is weakly relevant, not a clear DROP.
- Expected: same as D-01, possibly with age generalised.

## D-03 (50/30/20 arithmetic)
- Entities: none private. "Excel" product, "someone" hypothetical; amounts are hypothetical, not the user's FINANCIAL facts (if annotated as FINANCIAL they must be KEEP).
- Required: "2,400", "1,200", "720", "480", "4.5% a year", "12 months", "not counting compounding", the 60/20/20 uncertainty.
- DROP: none. Expected output = input verbatim.

## D-04 (budget; savings target 500)
- Entities: FINANCIAL "3,150 a month after tax", "1,020", "140", "160", "380", "95", "500" KEEP. PERSON "Henrik Vestergaard" (brother). FAMILY "my brother". EMPLOYMENT "lost his job". DATE "March", "last winter".
- Required: all expense figures and the parenthetical uncertainty about utilities (140 is the figure; 160 included the repair), "at least 500 a month".
- DROP candidate (confident): "By the way, my brother Henrik Vestergaard lost his job in March and has been sleeping on my sofa, which is a whole other story and is stressing me out a bit." — unrelated personal aside about a third party's employment; no listed expense in it. If not dropped, Henrik -> ALIAS.
- Expected: text without that sentence, otherwise verbatim. (Sum 1,635; left 1,515.)

## D-05 (polite notice, time and place clear)
- Entities: PERSON "Elif Karaca" -> [PERSON_1], "Bjørn Aasgaard" -> [PERSON_2] (ALIAS). LOCATION "Rotterdam depot" KEEP (place required). ORG "Halvorsen Freight HQ" — employer/workplace; not needed for the notice; PLACEHOLDER [ORG] acceptable, KEEP borderline (uncertain). DATE "next week", "Tuesday", "Thursday at 9:30", "end of Monday", "not Wednesday" KEEP.
- Required: Tuesday->Thursday 9:30, Rotterdam depot, who leads, joining by video, high-vis vests, closed shoes, deadline "end of Monday, not Wednesday".
- DROP candidate (weak, uncertain): "I'd rather not cancel it again after what happened with the forklift audit." — not needed for the notice; no required facts. Acceptable either way.
- Expected: "Hi all, a quick change for next week. [PERSON_1] has asked that the dock safety walkthrough move from Tuesday to Thursday at 9:30, still at the Rotterdam depot. [PERSON_2] will lead it, and I'll be joining from my usual desk at [ORG_1] by video. ..."

## D-06 (action items and owners)
- Entities: PERSON "Rangi Tāwhiri" and both later "Rangi" -> same [PERSON_1]; "Bjørn Aasgaard" -> [PERSON_2]. DATE "Monday's", "the 3rd", "Friday", "Thursday", "Wednesday", "8:00". HEALTH "physio for my knee".
- Required: VPN token still needed (owner not stated — do not infer), onboarding pack draft due Friday "not Thursday", shadow two chats/day first week then four, joins rota on the 3rd. Backlog "212, down from 260" is status not an action item; KEEP (not a clear DROP).
- DROP candidate (confident): "- Personal: physio for my knee at 8:00 on Wednesday, so I'll be an hour late that day." — personal health, not an action item; contains no required facts.
- Expected: bullets with aliases, personal bullet removed cleanly (no orphan blank line/dash).

## D-07 (message to courier about misdelivery)
- Entities: order number "GX-7714-0382" -> direct identifier; PLACEHOLDER (label likely ACCOUNT_ID; label choice uncertain). PERSON "Lakshmi Venkataraman" and "Lakshmi" -> [PERSON_1]; "Marisol Quispe" and "a Marisol" -> [PERSON_2] (private third party; must not merge with PERSON_1). FINANCIAL "189.90" KEEP. DATE "Saturday", "five days, not three", "yesterday" KEEP. Items (24-inch monitor, keyboard) KEEP.
- Required: wrong signer, recipient at home all day, items and total, five days not three, the two questions (claim vs wait).
- DROP: none.
- Expected: "...order [ACCOUNT_ID_1] was meant for my sister, [PERSON_1], but the tracking says it was signed for by someone called [PERSON_2] on Saturday. We don't know a [PERSON_2] and [PERSON_1] was at home all day..." ("a [PERSON_2]" is slightly awkward but acceptable).

## D-08 (dishwasher troubleshooting)
- Entities: none. "four years old" is appliance age, not AGE; E24, 2 cm, 60 cm, 3 seconds are technical facts.
- DROP: none. Expected output = input verbatim. Any annotation here would be a false positive.

## D-09 (checklist for house-sitter)
- Entities: PERSON "Marisol" -> ALIAS [PERSON_1]. SECRET "5938" (door code) -> PLACEHOLDER [SECRET_1]; SECRET "bluekettle-farm-22" (Wi-Fi password) -> [SECRET_2]. PAYMENT_CARD "4242 4242 4242 4242" -> PLACEHOLDER (even though it is a well-known test number, it is card-shaped and must not be kept). DATE "the 21st", "Thursday night" KEEP. FINANCIAL "over 120" KEEP.
- Required: every second morning "not every day", door code exists if key sticks, guest Wi-Fi, pay vet bills on the card, over 120 text first, bins Thursday night, recycling every other week + uncertainty.
- DROP: none (all bullets are checklist content; the secrets bullet is needed but with placeholders).
- Expected: "Notes for [PERSON_1] while we're away (back on the 21st): ... The door code is [SECRET_1] if the key sticks in the lock, and the Wi-Fi password is [SECRET_2] for the guest network. - If the vet bills arrive, pay them on the card, [PAYMENT_CARD_1]. ..."

## D-10 (task: "Can you help with this?")
- Task issue: task is vague (copies the text's last line); gives little basis for task-relevance decisions. Possible "bad task" flag in phase 2 unless the record is deliberately a vague-task case; then everything plausibly relevant to reunion planning must be KEEP.
- Entities: LOCATION "Dunedin" KEEP, "Oslo" KEEP (travel). DATE "14 March", "four days" KEEP. PERSON "Nneka Obi" -> [PERSON_1] ("My aunt" kept); AGE "81" KEEP (or GENERALISE 80–89; accessibility relevance — uncertain which). HEALTH "uses a walker", "stairs are a problem" KEEP; PERSON "Henrik Vestergaard" -> [PERSON_2] ("My cousin" kept); HEALTH "back injury" KEEP with "I think he mentioned" uncertainty preserved. FINANCIAL "220 a night", "250 if breakfast is included" KEEP. "eight or nine people" KEEP.
- DROP: none.
- Expected: names aliased, rest verbatim.
