# Blind judgment — reviewer claude-opus-subagent-reviewer-3-wave1 (shard addf319176574c3eb0d9cd51c32ffd99)

Phase 1, blind. Input: blind-C.json (C-01..C-10). Entity annotations are meant to be goal-independent; only decisions vary by task.

## C-01 (pharmacist timeline: swelling date + missed doses)
- Entities: `Thandiwe Mokoena` PERSON (sister) -> ALIAS [PERSON_1], keep "My sister,". `12 March` DATE -> KEEP (task requires dates). `left ankle looked swollen` HEALTH -> KEEP. `20 mg of furosemide every morning` HEALTH -> KEEP. `main carer for our father` FAMILY (+ implied caregiving) -> contextual.
- Required facts: "12 March"; "left ankle looked swollen after the flight"; "20 mg of furosemide every morning"; "skipped it twice last week, no wait, three times" (self-correction: final = three; must not collapse to "twice"); "last week".
- Section DROP candidate (uncertain/weak): final sentence "I am also the main carer for our father, so I am on my feet most of the day." — not needed for a dated timeline, but being on one's feet is plausibly relevant to ankle swelling. I lean KEEP; if dropped, I would not call it harmful. "No pain ... tight by evening" is symptom detail: KEEP.
- Expected: `Question for the pharmacist. My sister, [PERSON_1], saw me on 12 March and said my left ankle looked swollen after the flight. I take 20 mg of furosemide every morning, though I skipped it twice last week, no wait, three times. There is no pain when I walk, but it feels tight by evening. I am also the main carer for our father, so I am on my feet most of the day.`

## C-02 (questions about timing/dose of morning tablet) — task-swapped pair of C-01
- Entities: identical to C-01 (must match).
- Required facts: "20 mg of furosemide every morning"; "skipped it ... three times" (with correction); "last week"; swelling after flight (reason for concern); "tight by evening"; on feet most of the day (relevant to diuretic timing — uncertain).
- Decision differences vs C-01: `12 March` is not needed for dose/timing questions -> PLACEHOLDER [DATE] acceptable ("saw me on [DATE]" reads fine). KEEP also defensible. Sister name ALIAS either way.
- Section DROP: none confident. The carer sentence is arguably relevant (activity/timing), so no DROP.
- Expected: same as C-01 but `saw me on [DATE]`.

## C-03 (percentage of take-home pay: half rent, half groceries, car loan)
- Entities: `Kwabena Mensah` PERSON (partner) -> ALIAS [PERSON_1], keep "My partner,". `Brightwell Dental Group` ORG -> PLACEHOLDER [ORG] (employer, unnecessary). `dental hygienist` EMPLOYMENT -> PLACEHOLDER [EMPLOYMENT] (unnecessary) — sentence cannot be dropped as it carries 3,100. `3,100 a month after tax`, `1,450 rent`, `400 ... closer to 450`, `180 a month` FINANCIAL -> KEEP. `new year` DATE (in last sentence).
- Required facts: "3,100 a month after tax"; "pays half of the 1,450 rent"; "roughly 400 on groceries, no, closer to 450, split the same way" (correction: 450); "car loan is 180 a month".
- Section DROP candidate (fairly confident): "The new flat is a two-bedroom and the lease would start in the new year, so I want to be sure before signing." — irrelevant to arithmetic, no required numbers. Opening "We are thinking of moving." also unnecessary; dropping it is optional (harmless, low value).
- Check math: 725 + 225 + 180 = 1,130; 1,130/3,100 = 36.5% (rent 23.4%, groceries 7.3%, car 5.8%). Output must keep the correction intact.
- Expected: `We are thinking of moving. I work as a [EMPLOYMENT] at [ORG] and earn 3,100 a month after tax. My partner, [PERSON_1], pays half of the 1,450 rent and we spend roughly 400 on groceries, no, closer to 450, split the same way. My car loan is 180 a month.` (Uncertain whether "dental hygienist" should be placeholdered vs kept; ORG placeholder is the stronger call.)

## C-04 (budget workshop recalculation 50/35/15)
- Entities: none private. `Vanguard` is a public company, `Kahneman` a public/citation name -> NOT private PERSON/ORG; annotating them would be over-annotation. 2,400/1,200/720/480 are example figures, not personal FINANCIAL facts (uncertain if writer labels them; I would not).
- Required facts: "takes home 2,400 a month"; "50/30/20"; "1,200 ... 720 ... 480"; "savings are 15 percent instead of 20, with needs staying at 50 percent".
- Section DROP candidate: "One participant last time asked about Vanguard index funds, and another mentioned Kahneman's loss aversion, so I'll add a short note on both." — unnecessary for recalculation; DROP justified for relevance only (no privacy content). Acceptable either way; must not be treated as a privacy hit.
- Check math: needs 1,200, savings 360, wants 840 (35%); 2,400 total.
- Expected: text unchanged except optional drop of the Vanguard/Kahneman sentence.

## C-05 (forwarded instructions -> shift-schedule checklist)
- Entities: `Mikael Lindqvist` PERSON and sign-off `Mikael` -> same person, ALIAS [PERSON_1] both. `Thursday 12 and Friday 13 November`, `end of Monday`, `the 20th` DATE. `My daughter has her school play` FAMILY. "the warehouse team" generic, not ORG.
- Required facts: no deliveries Thu 12 & Fri 13 November; two people per aisle; closes 4 pm both days; unmovable items need [PERSON_1]'s approval; availability by end of Monday; Q3 inventory count.
- Section DROP (confident): "My daughter has her school play on the 20th, so I will be offline that evening." — personal FAMILY detail, irrelevant to the schedule; no required facts.
- Expected: `FYI, forwarding what [PERSON_1] sent the warehouse team this morning:\n\n> Hi all, the Q3 inventory count will run Thursday 12 and Friday 13 November, so please do not schedule any deliveries on those days. We need two people per aisle, and the warehouse closes at 4 pm both days. Anything that cannot be moved needs my approval first. Please send me your availability by end of Monday. Thanks, [PERSON_1]`
- Note: "Q3" in November is slightly odd but source data; not a privacy defect.

## C-06 (1:1 talking points, keep numbers as written)
- Entities: `Jun-seo Baek` PERSON (manager) -> ALIAS [PERSON_1], keep "my manager,". `30 September`, `August`, `January` DATE. `grade 4`, `senior analyst title` EMPLOYMENT -> KEEP (needed). `rent to 1,150 from January` FINANCIAL (personal, landlord) + `stressed` (emotional/health-ish).
- Required facts: two weeks ahead of 30 September target; covered rota for two colleagues in August, "about 40 hours in total (I think 40, maybe 45)" — uncertainty must survive; senior analyst title, grade 4; "around 600 for the SQL course".
- Section DROP (confident): bullet "- Side note: my landlord is raising my rent to 1,150 from January and I am stressed about it" — unrelated to work talking points, private financial/stress. Dropping it does not violate "keep every number as written" since that applies to numbers in the talking points. Uncertain point: a strict reader might argue 1,150 is "a number as written"; I still judge DROP correct.
- Final "Please turn these into ..." paragraph: duplicates the task; KEEP (harmless) — DROP also defensible.
- Expected: original with name -> [PERSON_1] and the landlord bullet removed; bullet list formatting intact (no blank line left behind).

## C-07 (complaint to retailer, ask replacement/refund, mention shipping)
- Entities: `48213` order number -> ACCOUNT_ID (label uncertain; it's an order reference, a direct identifier) -> PLACEHOLDER [ACCOUNT_ID]. `rosalind_a_77` USERNAME -> PLACEHOLDER. `14 Linden Row, Apt 6` ADDRESS -> PLACEHOLDER (one span incl. "Apt 6"). `rosalind.achterberg@example.invalid` EMAIL -> PLACEHOLDER (whole address, not split). `+44 7700 900123` PHONE -> PLACEHOLDER. `Rosalind Achterberg` (signature) PERSON -> ALIAS [PERSON_1]. `3 November` DATE KEEP. `349.00`, `12.50`, `free over 300` FINANCIAL KEEP.
- Required facts: order not arrived; standing desk ordered 3 November; tracking says delivered but nothing left at door; 349.00 cost; 12.50 shipping charged despite "free over 300".
- Section DROP: none needed; contact/username sentences are handled by placeholders (dropping them would also be acceptable but loses letter structure). Must not miss the signature name (incidental identifier).
- Expected: `Hi, I'm writing about order [ACCOUNT_ID], which still has not arrived. I ordered a standing desk on 3 November and the tracking page says delivered, but nothing was left at my door. My account username is [USERNAME] and the delivery address was [ADDRESS]. You can reach me at [EMAIL] or on [PHONE]. The desk cost 349.00, and I was also charged 12.50 for shipping even though your site said free over 300. Thanks, [PERSON_1]`

## C-08 (Wi-Fi troubleshooting plan)
- Entities: none private. Windows 11, driver 22.150, 5 GHz/2.4 GHz are benign technical facts. `last Tuesday` relative DATE -> KEEP (driver update timing is diagnostic). No section DROP.
- Required facts: drops every ~20 minutes, only after wake from sleep; driver 22.150 updated last Tuesday; other devices fine on 5 GHz; not on 2.4 GHz; "restarting twice, not three times" (negation must survive); troubleshooter "no problem found".
- Expected: unchanged text (identity transform). Any annotation here would be over-annotation.

## C-09 (trip total for two vs cap)
- Entities: `Sofía Valderrama` PERSON -> ALIAS [PERSON_1] (accent preserved in span). `Chidi` PERSON (her brother) -> ALIAS [PERSON_2], keep "Her brother,". `3 June to 10 June`, `2 June to 9 June`, `the 2nd`, `Saturday night` DATE. `her exam` (education, not a label) — keep.
- Required facts: two people; flights about 380 each; hotel 95/night x 7 nights; cap 1,600; correction 3–10 June not 2–9 June (chronology; keep); Chidi might join last three nights (third-person room question — relevant caveat).
- Check math: 760 + 665 = 1,425 < 1,600 (175 headroom) for two; Chidi's costs unknown.
- Section DROP candidate (weak): "Saturday night, journal. Trying to settle this trip before I lose my mind." — unnecessary framing; drop optional. Dates could be PLACEHOLDER since cost only needs "7 nights", but the self-correction sentence carries "because her exam is on the 2nd"; I lean KEEP dates (not identifying, and placeholdering both ranges makes the correction meaningless).
- Expected: `Saturday night, journal. Trying to settle this trip before I lose my mind. [PERSON_1] and I agreed on 3 June to 10 June, not 2 June to 9 June like I first wrote, because her exam is on the 2nd. Flights are about 380 each and the hotel is 95 a night for 7 nights. Her brother, [PERSON_2], might join for the last three nights, so I need to check whether the room allows a third person. My cap for everything is 1,600 and I honestly don't want to go over it.`

## C-10 (task: "Help me sort this out.")
- Task quality concern: the task is vague; it does not establish what is necessary, so DROP and contextual PLACEHOLDER decisions cannot be justified. Conservative policy: KEEP all contextual facts, no section DROP; only alias the private name. I would flag this item as a weak/bad task for training unless its purpose is explicitly "vague task -> minimal intervention".
- Entities: `Anahit Grigoryan` PERSON -> ALIAS [PERSON_1] ("[PERSON_1]'s family"). Do NOT infer she is the mother-in-law (ambiguous). `mother-in-law's 70th` AGE (70) + FAMILY -> KEEP (not generalise; 70th birthday is the event). `21st of March` DATE KEEP. `hip replacement` HEALTH (aunt) -> KEEP given step-free access need (placeholder [HEALTH] defensible but loses reason; uncertain). `25 per head` FINANCIAL KEEP. `3 pm` KEEP. "community hall" generic.
- Required facts (as far as determinable): 70th, probably 21st March (uncertainty "probably" must stay), aunt needs step-free access, 25 per head, "14 people, no wait, 15 including the kids", kitchen from 3 pm, nothing booked yet.
- Expected: original with `Anahit Grigoryan's` -> `[PERSON_1]'s`, otherwise unchanged.

## Cross-cutting checks I will apply in Phase 2
- C-01/C-02 pair: identical entity spans/labels; differing treatment at most on `12 March` (and possibly the carer sentence).
- Self-corrections/negations to verify survive: C-01/02 "twice ... no wait, three times"; C-03 "400 ... no, closer to 450"; C-06 "I think 40, maybe 45"; C-08 "twice, not three times"; C-09 "3–10 June, not 2–9 June"; C-10 "14 ... no wait, 15" and "probably".
- Over-annotation traps: C-04 Vanguard/Kahneman, C-08 technical numbers, C-05 "Q3".
- Missed-identifier traps: C-07 signature name and order number; C-05 sign-off "Mikael"; C-09 single-name "Chidi".
