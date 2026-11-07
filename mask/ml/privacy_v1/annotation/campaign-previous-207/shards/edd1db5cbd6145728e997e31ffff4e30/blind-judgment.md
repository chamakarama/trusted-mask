# Blind judgment (PHASE 1) — claude-opus-subagent-reviewer-6-wave1-revisions

Shard: edd1db5cbd6145728e997e31ffff4e30. Input: blind-CB.json (9 items). Model review, not human audit.
Pairs (same text, task-swapped): R6-01/R6-02, R6-04/R6-05, R6-06/R6-07. Entity annotations should be identical within each pair; only KEEP/PLACEHOLDER/DROP treatment may differ.

## R6-01 — dated timeline for pharmacist (swelling noticed, doses missed)
Entities: `Thandiwe Mokoena` PERSON -> ALIAS [PERSON_1]; `sister` FAMILY (role word, KEEP); `12 March` DATE KEEP (required); `left ankle looked swollen` HEALTH KEEP; `20 mg of furosemide every morning` HEALTH KEEP; `main carer for our father` FAMILY/EMPLOYMENT-like (inside droppable sentence).
Required facts: "saw me on 12 March", "left ankle looked swollen after the flight", "20 mg of furosemide every morning", "skipped it twice last week, no wait, three times" (correction must survive: final count is three, last week).
DROP candidate: "I am also the main carer for our father, so I am on my feet most of the day." — not needed for a timeline (moderate confidence; arguably explains swelling, but not part of asked timeline). "There is no pain when I walk, but it feels tight by evening." — uncertain; I would KEEP (symptom context for pharmacist, contains negation).
Expected: "Question for the pharmacist. My sister, [PERSON_1], saw me on 12 March and said my left ankle looked swollen after the flight. I take 20 mg of furosemide every morning, though I skipped it twice last week, no wait, three times. There is no pain when I walk, but it feels tight by evening."

## R6-02 — questions for pharmacist about timing/dose of morning tablet
Entities identical to R6-01.
Required: "20 mg of furosemide every morning", "skipped it twice last week, no wait, three times"; swelling and "feels tight by evening" are relevant context for timing questions -> KEEP.
`12 March`: not strictly needed; KEEP or PLACEHOLDER [DATE] both defensible (uncertain). Prefer KEEP (low harm, gives context) — would not reject either.
DROP candidate: carer sentence (same as R6-01), moderate confidence.
Expected: same as R6-01 output (optionally "saw me on [DATE]").

## R6-03 — arithmetic: % of take-home on half rent, half groceries, car loan
Entities: `Brightwell Dental Group` ORG -> PLACEHOLDER [ORG] (unnecessary); `dental hygienist` EMPLOYMENT -> unnecessary; PLACEHOLDER [EMPLOYMENT] or KEEP both acceptable (uncertain; "a [EMPLOYMENT]" grammar slightly awkward); `Kwabena Mensah` PERSON -> ALIAS [PERSON_1], `partner` KEEP; `3,100 a month after tax`, `1,450 rent`, `400 ... no, closer to 450`, `180 a month` FINANCIAL KEEP (all required; correction to 450 must survive; "split the same way" and "half" must survive). No currency stated — must not be invented.
DROP candidate: "The new flat is a two-bedroom and the lease would start in the new year, so I want to be sure before signing." — unnecessary for arithmetic (fairly confident). "We are thinking of moving." — harmless framing; keep or drop.
Expected: "We are thinking of moving. I work as a dental hygienist at [ORG] and earn 3,100 a month after tax. My partner, [PERSON_1], pays half of the 1,450 rent and we spend roughly 400 on groceries, no, closer to 450, split the same way. My car loan is 180 a month."
Sanity: 725 + 225 + 180 = 1,130 / 3,100 ≈ 36.5%.

## R6-04 — GP update: diagnosis, ibuprofen dose/timing, what not taken
Entities: `Aigerim Bekova` PERSON -> ALIAS [PERSON_1], `sister` KEEP (if sentence kept). HEALTH KEEP: "mild sprain, not a fracture", "X-ray showed no break", "ibuprofen 400 mg, one tablet every 8 hours, for 5 days", "3 days, no wait, 4", "have not taken any aspirin", "roughly 2 cm larger than my other ankle". "urgent care", "the hike" are generic, not entities.
DROP candidate: "My sister, Aigerim Bekova, drove me there and has stayed with me this week to help." — unnecessary for GP update (confident). If dropped, no alias needed in output (entity still annotated).
Expected: "Quick summary before I forget. I went to urgent care after my ankle swelled up on the hike. The doctor there said it was a mild sprain, not a fracture, and the X-ray showed no break. They prescribed ibuprofen 400 mg, one tablet every 8 hours, for 5 days. I think I'd been taking it for 3 days, no wait, 4, before the swelling started to go down. I have not taken any aspirin. The swelling is now roughly 2 cm larger than my other ankle."

## R6-05 — questions for pharmacist about ibuprofen
Entities identical to R6-04. Same required facts (dose, frequency, duration, days taken with correction, no aspirin — interaction question, diagnosis as context, swelling size).
DROP candidate: sister sentence (confident). Output same as R6-04. Pair differs little in treatment; if writer claims a treatment difference, it should be justified (I see none needed).

## R6-06 — weekly set-aside for insurance premium by renewal + monthly remainder
Entities: `14 December` DATE KEEP (required: renewal deadline). FINANCIAL KEEP: 2,450 euros, 1,020, 135 (with "I think includes the internet" uncertainty), 380 + 30, 612 euros one go, not instalments (negation), 150 savings, "nothing left over for eating out". No direct identifiers.
No DROP. Output = source verbatim. Note: number of weeks depends on today's date, which the text does not give — downstream must not invent it.

## R6-07 — check monthly arithmetic, remaining each month
Entities identical to R6-06.
`14 December` not needed for monthly arithmetic -> PLACEHOLDER [DATE] acceptable; KEEP also acceptable (uncertain). Insurance sentences must NOT be dropped (612 premium is a figure that may enter the calculation; "not in instalments" matters).
Expected: source with optional "renews on [DATE]". Treatment difference vs R6-06 (DATE keep vs placeholder) is the plausible genuine difference.

## R6-08 — action list with owners and deadlines
Entities: `Tomás Echeverría` PERSON -> ALIAS [PERSON_1]; later `Tomás` -> same [PERSON_1] (clearly resolved); `Haruto Kobayashi` PERSON -> ALIAS [PERSON_2]; `my manager` role KEEP; `from finance` (department, ORG-ish) KEEP — owner context; `four-day week` EMPLOYMENT KEEP; DATE KEEP: "from the first quarter", "by Friday", "before Thursday's meeting"; numbers "18 items to 12" KEEP; negations "not a problem", "should not book the offsite hotel until he does" KEEP; pronouns he/him unchanged.
No DROP (everything is actions/owners/deadlines; greeting is short framing).
Expected: "Hi team, notes from today's one-to-one before I lose them. My manager, [PERSON_1], agreed I can move to a four-day week from the first quarter as long as the on-call rota is covered, which he thinks is not a problem. [PERSON_2] from finance will confirm the budget code by Friday, and I should not book the offsite hotel until he does. [PERSON_1] also wants the launch checklist cut from 18 items to 12, with the draft sent to him before Thursday's meeting."

## R6-09 — "Help me sort this out." (vague task)
Entities: `14 Linden Row` ADDRESS -> PLACEHOLDER [ADDRESS] (direct identifier); `Yusuf Demir` PERSON -> ALIAS [PERSON_1], `brother-in-law` KEEP; `the 3rd ... or maybe the 5th` DATE KEEP with uncertainty; `85 for the day`, `120 for the broadband` FINANCIAL KEEP; "from 9 until about 1 but not after" KEEP; "notice period is 30 days, not 60" KEEP; "have not told my landlord yet" KEEP; roles agent/landlord/old flatmate KEEP.
No DROP: vague task means nothing is clearly unnecessary — any DROP should be rejected. Task is vague but realistic; acceptable only if the record treats it conservatively.
Expected: "Thinking out loud about the move. The new flat is at [ADDRESS], and the keys are collected from the agent on the 3rd, I think, or maybe the 5th, I'll check. The van hire is 85 for the day, and my brother-in-law, [PERSON_1], can help from 9 until about 1 but not after. I have not told my landlord yet, and my notice period is 30 days, not 60. I also owe my old flatmate 120 for the broadband, which I should pay before I leave."
