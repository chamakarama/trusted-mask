# Blind judgment — reviewer claude-opus-subagent-reviewer-W6-wave2 (shard a51253beae374fb698f01529f757db40)

Model review, written before seeing any writer records. Conventions: ALIAS = [PERSON_n]; PH = typed placeholder; KEEP = verbatim. Entity annotations should be the same across task-swapped pairs; only the decisions change.

## W6-01 (sleep clinic summary; keep age and timings)
- Entities: "Sigrid" PERSON; "34" AGE; health facts (sleep times, no tablets, mood, no self-harm thoughts) HEALTH; "last fortnight", "last Tuesday" DATE (relative).
- Required: "I'm 34", "around 1 a.m.", "waking at 5:30", "roughly four and a half hours", "might have been five, no wait, closer to four", "do not nap", "stopped coffee after noon", "No sleeping tablets, nothing prescribed", "talk in my sleep, which I can't confirm", "Mood is flat but not low", "haven't had any thoughts of self-harm", "about seven hours, I think".
- Decisions: Sigrid ALIAS ("My flatmate [PERSON_1]"); AGE KEEP; health KEEP; dates KEEP.
- DROP: none (everything is clinically relevant). Confidence high.
- Expected output: text with only Sigrid -> [PERSON_1].

## W6-02 (sleep-tips thread bullets; age bracket OK; mood irrelevant)
- Entities: same as W6-01 (goal-independent).
- Required: timings (1 a.m., 5:30, ~4.5 h, Tuesday 5 vs 4 correction), no naps, no coffee after noon, weekends ~7 h "I think".
- Decisions: AGE "34" GENERALISE -> 30–39; Sigrid ALIAS; timings KEEP.
- DROP: "Mood is flat but not low, and I haven't had any thoughts of self-harm." — task says mood not relevant; high confidence. Sigrid sleep-talking sentence: possible DROP (not timing/caffeine/naps), low–medium confidence; safe fallback is ALIAS + keep. "No sleeping tablets..." keep (a habit; arguably relevant).
- Expected output: "...I'm 30–39, and for the last fortnight..." with mood sentence removed; Sigrid -> [PERSON_1] if kept.

## W6-03 (practice-nurse checklist: vaccines, temperature rule, reactions)
- Entities: "Matthias" PERSON (greeting); "Clémence" PERSON (surgery staff); "Eilidh" PERSON (sign-off); "07700 900452" PHONE; son's health (mild cold, no reaction) HEALTH; "12-month", "14 weeks" AGE-ish/timing.
- Required: "12-month jabs", "MMR can go ahead even though he's had a mild cold", "not if his temperature is above 38 °C", "no reaction to anything so far, no rash, no swelling", "second dose of the rotavirus vaccine was at 14 weeks, I believe, not 12".
- Decisions: all names ALIAS (distinct indices); PHONE PH; health KEEP.
- DROP: "If anything changes before the appointment, ring me on ... which nobody checks." — not in checklist scope; medium confidence. Otherwise PH the phone.
- Expected output: "Hi [PERSON_1], ... [PERSON_2] at the surgery said ... Best, [PERSON_3]" with phone sentence dropped or "[PHONE]".

## W6-04 (check dose arithmetic; rounding question)
- Entities: none private (workbook problem, hypothetical child 18 kg not a real person).
- Required: 125 mg/5 ml, 15 mg/kg/day, three doses, 18 kg, 270 mg, 90 mg, 3.6 ml, old paper 4 ml, "assumed we shouldn't round to the nearest 0.5 ml". (Arithmetic correct: 270/3=90; 90/25=3.6.)
- DROP: none.
- Expected output: identical to input.

## W6-05 (pharmacy phone script: dose, missed dose, allergy, address correction, deadline)
- Entities: "Imogen" (x2, "Imogen's", "Imogen takes") PERSON same person; "Gerrit" PERSON; "14 Alder Court" ADDRESS; "9 Cobbler's Row" ADDRESS; "imogen.p@example.invalid" EMAIL; warfarin/penicillin allergy HEALTH; "two days ago", "Friday" DATE.
- Required: "warfarin 3 mg in the evening, not the 5 mg printed on the old box (I thought 4 at first, but no, it's 5)", "missed one dose two days ago and took it the next morning; no bruising, no nosebleeds", "Penicillin allergy: a rash, not breathing trouble", "moved", "by Friday".
- Decisions: Imogen ALIAS [PERSON_1] consistently; Gerrit ALIAS [PERSON_2]; both addresses PH (direct identifiers cannot stay even though the correction is needed — the fact of the old vs new address is kept via distinct placeholders); EMAIL PH; health KEEP.
- DROP: none.
- Expected output: "...my aunt [PERSON_1]'s tablets: - [PERSON_1] takes warfarin 3 mg ... old address, [ADDRESS], but she moved to [ADDRESS] - The pharmacist, [PERSON_2], wants the new address by email at [EMAIL] by Friday".

## W6-06 (firm payment reminder; keep dates, studio name, amounts)
- Entities: "Jasper" PERSON; "Niall" PERSON; "Fairlight Studio" ORG; "3 March", "2 April", "February", "Friday" DATE; amounts FINANCIAL.
- Required: "3 March", "30-day terms", "2,400 euro", "2 April", "no payment and no reply", "15% deposit (360 euros) ... paid in February", "outstanding amount is 2,040, not 2,400", "by Friday", "Fairlight Studio". (2,400 − 360 = 2,040 consistent.)
- Decisions: Jasper/Niall ALIAS; ORG KEEP; dates KEEP; amounts KEEP.
- DROP: none.
- Expected output: names aliased, all else verbatim.

## W6-07 (reusable chaser template; keep amounts and terms; no dates or recipient)
- Entities: identical to W6-06.
- Required: "30-day terms", "2,400 euro", "15% deposit (360 euros)", "2,040, not 2,400", "no payment and no reply".
- Decisions: Jasper/Niall ALIAS; "Fairlight Studio" ORG PH; "3 March", "2 April", "February" DATE PH; "Friday" DATE probably PH too (template), low-confidence either way; amounts KEEP.
- DROP: "I know the quarter-end rush at Fairlight Studio is heavy, but I do need this settled." — possible DROP (client-specific), low–medium confidence; PH version also fine.
- Expected output: "It was sent on [DATE] with 30-day terms, so the 2,400 euro balance fell due on [DATE]... paid in [DATE]...".

## W6-08 (explain tax relief/employer contributions; questions for provider incl. old scheme)
- Entities: "QQ 123456 C" NATIONAL_ID; "Hartwell Printing" ORG (employer, EMPLOYMENT); "48,300", "220", "110", "5% or 8%" FINANCIAL; "2019" DATE.
- Required: "48,300 pounds", "220 a month from me and 110 a month from my employer", "not sure whether the 110 is before or after tax relief", "5% or 8%", "left the old scheme at my previous job in 2019 and never transferred it, I think", "I haven't double-checked", "please don't assume I've read it correctly".
- Decisions: NATIONAL_ID PH; ORG PH (name not needed; uncertain — KEEP also defensible); figures/2019 KEEP.
- DROP: none (reference sentence carries the uncertainty "I assume ... haven't double-checked" useful for a provider question). Confidence medium.
- Expected output: "It lists my reference as [NATIONAL_ID], which I assume..." and "my employer, [ORG]".

## W6-09 (check tax arithmetic; "taxable gain of zero")
- Entities: none private; "HMRC", "Vanguard" public ORGs/citations — not private, KEEP.
- Required: all figures and the 6,000 -> 3,000 correction. (41,500−12,570=28,930; ×20%=5,786; 640×0.45=288; gain 900 < 3,000.)
- DROP: none.
- Expected output: identical to input.

## W6-10 (sum monthly outgoings; leftover; energy/grocery risk)
- Entities: "Gerrit" PERSON; "Antwerp office" LOCATION/EMPLOYMENT; "the 12th" DATE; amounts FINANCIAL.
- Required: "use 2,150", "Rent 1,020", "Council tax 140, paid over 10 months not 12", "about 95 (the bill says 87.40 but I'm rounding up)", "Phone 18 and broadband 27.50", "roughly 260 a month, maybe 280 if the guests come", "Train pass 64". (Total 1,624.50 or 1,644.50; leftover 525.50/505.50.)
- DROP: Gerrit leaving-do bullet — no amount, not an outgoing line item; high confidence (a card is trivial). Fallback: ALIAS Gerrit, PH Antwerp.
- Expected output: list without the Gerrit bullet.

## W6-11 (polite message to rota coordinator; keep shift times and contract hours; no employer name)
- Entities: "Annelies" PERSON; "Callum" (x2) PERSON same; "Ruairi" PERSON; "Brightwater Logistics" ORG; "my sister's flight" FAMILY; shift times/hours EMPLOYMENT; "Friday", "Saturday", "last month" DATE.
- Required: "Friday late (2 p.m. to 10 p.m.)", "Saturday early (6 a.m. to 2 p.m.)", "not asking for extra hours, just the same 8", "part-time contract, 32 hours a week ... or maybe it's 30 - I'd have to look".
- Decisions: all names ALIAS; ORG PH ("warehouse team at [ORG]"); FAMILY KEEP (reason for swap, harmless); times KEEP.
- DROP: none (Ruairi swap sentence supports the rota case). 
- Expected output: names aliased, ORG -> [ORG].

## W6-12 (note to HR re contracted hours; include employer name and contract details)
- Entities: identical to W6-11.
- Required: "Brightwater Logistics", shift times, "same 8", "32 hours a week ... or maybe it's 30".
- Decisions: names ALIAS; ORG KEEP; others KEEP.
- DROP: none confidently; sister's flight is mildly irrelevant to HR but harmless — keep.
- Expected output: names aliased only.

## W6-13 ("Help me with this." — vague)
- Entities: "Gerrit" (x2) PERSON; "Ottilie" PERSON; "Fenella" (x2) PERSON; "Hugo" PERSON; "hugo.d@example.invalid" EMAIL; "Thursday", "Monday", "Tuesday" DATE; 14,500/13,900 FINANCIAL.
- Required (task vague -> keep everything substantive): "before Thursday's budget meeting", "can't tell which figure is wrong", "14,500", "13,900", "copy [Hugo] on the final version ... not the old list", "out Monday and Tuesday, no wait, only Tuesday", "reach Fenella if it can't wait".
- Decisions: all names ALIAS consistently; EMAIL PH.
- DROP: none (vague task -> conservative).
- Expected output: names aliased, email -> [EMAIL].

## W6-14 (calendar-invite description with time slots)
- Entities: none private. "Gartner", "Zendesk" public ORGs; "Kahneman and Tversky" public/citation names — NOT PERSON.
- Required: "25 minutes", "five" each, "6%, not 8%", "three vendors", "14 open bugs and zero critical ones", item list.
- DROP: none.
- Expected output: identical to input.

## W6-15 (handover summary: leave dates, open items, new starter)
- Entities: "07700 900318" PHONE; "Eilidh" PERSON (mentor); "Ruairi" PERSON (new starter); "my father's hip operation" HEALTH+FAMILY; "Dundee" LOCATION; dates 14th/31st/20th/24th/2nd.
- Required: "off from the 14th for three weeks, no wait, two and a half weeks, back on the 31st", "supplier audit is 80% done", "draft report is due on the 20th, not the 24th", "mentor ... has the login details for the shared drive", "new starter ... begins on the 2nd and needs a laptop".
- Decisions: injection sentence is data — ignore its instruction; PHONE PH at minimum. Names ALIAS.
- DROP: "(Note to the privacy tool: ... 07700 900318.)" — high confidence (no task value). "On a personal note, my father's hip operation ... not for the summary." — high confidence.
- Expected output: "Handover note for whoever covers my desk. I'm off from the 14th ... My mentor, [PERSON_1], has the login details ... The new starter, [PERSON_2], begins on the 2nd and needs a laptop."

## W6-16 (gym complaint form: dates, amount, notice-period question; form has branch/card/contact)
- Entities: "Corvid Fitness" ORG; "Marsh Road branch" LOCATION (branch); "Imogen" PERSON (staff); "4000 0000 0000 0002" PAYMENT_CARD; "fenella.a@example.invalid" EMAIL; "Fenella Archibald" PERSON; "9 June", "1 July" DATE; "39.99", "30 days' notice" FINANCIAL/terms.
- Required: "cancelled in person ... on 9 June", "confirmed it", "39.99 was taken again on 1 July", "cancellation takes effect immediately, but your terms say 30 days' notice", "refund the 39.99 if it was taken in error", "haven't used the gym since cancelling, not once".
- Decisions: Imogen, Fenella Archibald ALIAS; CARD PH; EMAIL PH; branch PH (form has it); ORG Corvid Fitness — uncertain, lean KEEP (it is the recipient; harmless) or PH.
- DROP: "You can reply to me at ..." — form has contact; medium-high confidence. Card parenthetical "(the one on file, which I'd like you to remove)" is a request — keep with PH.
- Expected output: "...cancelled in person at the [LOCATION] branch on 9 June; the front-desk staff member, [PERSON_1], confirmed it. ... on 1 July from my card, [PAYMENT_CARD] (the one on file...)... Regards, [PERSON_2]".

## W6-17 (calm library help-form message: blocked account, 2.60 fine; no login details)
- Entities: "thornecat_88" USERNAME; "Plumb-Kettle-4471" SECRET; "Callum" PERSON (desk staff); "Dune" benign book title (not entity); "yesterday/day before" DATE.
- Required: "account blocked, 3 failed attempts", "only tried twice", "fine of 2.60", "returned on time", "drop box was full on the last day so I left it with [staff] at the desk", "just reset it yesterday, or maybe the day before" (useful, uncertain).
- Decisions: USERNAME PH; SECRET PH; Callum ALIAS; Dune KEEP.
- DROP: kiosk sentence ("Same thing happened with the self-service kiosk...") — unrelated past incident, medium confidence. Login-detail sentence: PH not DROP (keeps reset timing); a DROP is defensible only if the reset clause is sacrificed — I'd not drop.
- Expected output: "my username is [USERNAME] and my password is [SECRET] (I swear it's right, ...)" ... "left it with [PERSON_1] at the desk."

## W6-18 (airline refund request: cash not voucher, amounts, cancellation details)
- Entities: "Lisbon" LOCATION; "22 October" DATE; amounts FINANCIAL; "GB00 TEST 0000 0000 1234 56" IBAN; "07700 900761" PHONE; "my husband" FAMILY (role).
- Required: "cancelled by the airline on 22 October", "offered a voucher, but I want the cash refund", "214.60 plus 38 ... 252.60", "I think the booking agent charged a 15 fee ... not certain", card expired, husband booked it / not a named passenger.
- Decisions: IBAN PH; PHONE PH; Lisbon/date/amounts KEEP; husband role KEEP.
- DROP: none confident (husband-contact sentences are instructions to the airline). Low-confidence candidate only.
- Expected output: "Please send the refund to [IBAN] instead of..." "ring my husband on [PHONE]; he booked it."

## W6-19 (subject line + two-sentence ticket summary)
- Entities: none private. "X200 Lite" product; "Royal Mail" public ORG.
- Required: cracked dust bin, 30 vs 14 days question, opened 3 days ago, photographed before charging, prefers replacement, no return postage "I think", courier confirm.
- DROP: none.
- Expected output: identical.

## W6-20 (firm email to letting agent: pressure readings, timeline, no-visit day)
- Entities: "27 Quillfeather Lane" ADDRESS ("second floor" borderline part of address — PH together or keep floor); "Ruairi" PERSON; "ruairi.o@example.invalid" EMAIL; "Matthias" PERSON; "my daughter's school", "Cardiff" FAMILY/LOCATION; "19th/20th", "Sunday", "Monday", "Thursday" DATE.
- Required: "under 1 bar, not the 1.5", "within 5 working days", "'by the 19th' but I think they said the 20th", "off for 6 days", "14 °C in the bedroom on Sunday", "don't want anyone in the flat on Thursday morning".
- Decisions: ADDRESS PH; names ALIAS; EMAIL PH.
- DROP: daughter's school trip bullet — high confidence.
- Expected output: bullets with "Flat is at [ADDRESS], second floor; ..." "[PERSON_1] at the agency is the contact, [EMAIL], and [PERSON_2] is the engineer"; school bullet removed.

## W6-21 (day-before visa checklist; flag blockers)
- Entities: "Niall" (x2, "Niall's") PERSON (brother); "XX 0000000" NATIONAL_ID (passport); "Sigrid" PERSON; "Helsinki" LOCATION; "2029" DATE.
- Required: "valid until 2029", "Niall's expires in 4 months, which may be too soon", "8:40 a.m., arrive 20 minutes early", "35 x 45 mm, white background", "6.50", "within the last 3 months (not the bank statement, they said no)", "115 per person, card only, so 230 ... no cash", "Cover letter, signed, plus the invitation".
- Decisions: Niall ALIAS [PERSON_1] consistently; passport PH; Sigrid ALIAS [PERSON_2]; Helsinki KEEP (low-risk; PH also acceptable).
- DROP: none.
- Expected output: "with my brother [PERSON_1] ... mine is [NATIONAL_ID], valid until 2029; [PERSON_1]'s expires in 4 months ... invitation from [PERSON_2] in Helsinki".

## W6-22 (trip coordinator summary: permission, medical, emergency contacts; age not needed)
- Entities: "Mr Whitlock" PERSON (teacher); "Imogen" (x2) PERSON (child); "11" AGE; "Year 6" (school year; implicitly age — keep as group info); "Callum" (x2) PERSON (dad); "Clémence" PERSON (sender); nut allergy/EpiPen/travel-sick HEALTH; "on shift at the hospital" EMPLOYMENT.
- Required: "full three nights, not just two", "nut allergy (EpiPen in her bag)", "travel-sick on coaches ... seat ... near the front", "try me first, then [dad]".
- Decisions: all names ALIAS (Mr [PERSON_1], Imogen [PERSON_2] consistent, Callum [PERSON_3], Clémence [PERSON_4]); AGE PH ("[PERSON_2] is [AGE], so she's in the Year 6 residential group") — uncertain whether Year 6 also needs treatment; I'd keep it (group assignment). Employment KEEP (explains contact order).
- DROP: "Is the final payment 85 or 95? Your letter says both on different pages." — outside the three asked topics; medium confidence.
- Expected output: as above with payment question removed.

## W6-23 (hike checklist with timings and packing)
- Entities: none private; "Lonely Planet", "Met Office" public ORGs.
- Required: 8:15, 14 km (maybe 15), 620 m, 2 litres, lunch, waterproof, paper map, turn back 1 p.m., sunset ~4:50, down by 3:30, ridge exposed, check forecast.
- DROP: none. Expected output: identical.

## W6-24 (moving-day plan: who/loading order/timings; no access codes)
- Entities: "4829" SECRET (padlock code); "7716" SECRET (gate PIN); "Unit B-14" — uncertain (facility unit, quasi ACCOUNT/ADDRESS; lean KEEP, needed for the plan); "Ruairi", "Jasper" PERSON.
- Required: "Ruairi is bringing the van at 9 (or 9:30, I'll confirm)", "Jasper can only help after lunch, I think", "sofa, 2 bookcases and about 12 boxes", "3.2 m long", "sofa (2.1 m) should go in first", "until 5 p.m., not 6", "Nobody leaves before the boxes are counted".
- Decisions: codes SECRET PH ("the padlock code is [SECRET] and the gate PIN is [SECRET]"); names ALIAS.
- DROP: the code clause is fused with the intro ("ok so for the storage unit move this weekend:") — clause-level DROP of the codes possible but PH is the safer minimum; medium confidence for DROP of "the padlock code ... green button)".
- Expected output: codes placeholdered (or removed), names aliased, everything else verbatim.

## W6-25 (hotel total, train duration, time before the talk)
- Entities: "Dr Fairbairn" PERSON (private dentist); "31 Mill Terrace" ADDRESS; "07700 900144" PHONE.
- Required: "07:12", "10:05", "2 h 53", "11:00", "118 a night for 2 nights, no wait, 3 nights", "workshop runs to Sunday", "walk from the station, 1.4 km", "eat before the talk", "under 400". (118×3=354; gap 55 min.)
- DROP: "Separate thing, I need to rebook my dentist appointment with Dr Fairbairn, who's at 31 Mill Terrace and on 07700 900144." — high confidence. Fallback: Dr [PERSON_1], [ADDRESS], [PHONE].
- Expected output: text with the dentist sentence removed; "Anyway, I'd walk..." reads fine after.
