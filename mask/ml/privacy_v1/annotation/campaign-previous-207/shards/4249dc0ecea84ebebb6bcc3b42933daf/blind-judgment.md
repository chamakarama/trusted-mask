# Blind judgment — reviewer claude-opus-subagent-reviewer-R3B-wave2-round3 (shard 4249dc0ecea84ebebb6bcc3b42933daf)

Conventions: RF = required facts (exact quotes, with hedges/corrections/negations/conditions). Ents = entity -> label -> decision.

## R3B-01 (vaccinations)
- Ents: "Dilnoza Rahimova" (x1) + later "Dilnoza" -> PERSON, ALIAS same [PERSON_1]; "Layla" PERSON (sister) -> ALIAS [PERSON_2] if kept; "7 years old" AGE KEEP (task uses age); "13 months"/"14 months"/"3 years 4 months" AGE/timing KEEP; MMR, "mild fever for one day" HEALTH KEEP.
- RF: "She is 7 years old"; "I think she had her first MMR dose at 13 months, no wait, 14 months" (hedge + correction, final = 14 months); "the second was meant to be at 3 years 4 months, but I never saw a confirmation" (uncertain whether given); "She had no reaction to the first one apart from a mild fever for one day"; "I just need a clear list of what Dilnoza might still be due".
- DROP candidate: "Her sister Layla is completely up to date, so ignore her." — unnecessary, other child; conf high (0.8).
- Expected: Hi, I'm trying to work out where we are with my daughter [PERSON_1]'s vaccinations. She is 7 years old. I think she had her first MMR dose at 13 months, no wait, 14 months, and the second was meant to be at 3 years 4 months, but I never saw a confirmation. She had no reaction to the first one apart from a mild fever for one day. I just need a clear list of what [PERSON_1] might still be due.

## R3B-02 (pension email)
- Ents: "Brightwell Pensions" ORG KEEP (addressee/provider); "3 March" DATE KEEP; "41,200", "42,100", "300", "250" FINANCIAL KEEP; "June" DATE KEEP; "part-time at a print shop" EMPLOYMENT — "dropped to part-time" KEEP (explains contribution drop), "a print shop" optional PLACEHOLDER [EMPLOYMENT]/KEEP (uncertain); "Karim Benali" PERSON ALIAS [PERSON_1]; "Leeds" LOCATION.
- RF: "The Brightwell Pensions letter dated 3 March says my pot was 41,200 at the end of the tax year"; "my own spreadsheet says 42,100, so there's a gap somewhere"; "I paid in 300 a month until June, then 250 after I dropped to part-time"; "I think they may have missed the June payment, though I'm not sure." (hedge must survive). Adviser sentence "said to check the employer contributions first" plausibly useful (KEEP with alias; low-conf drop 0.3).
- DROP candidate: "I live in Leeds so the postal copy takes a week." — irrelevant to email; conf 0.75. "Pension statement question, mostly for myself." harmless, keep (drop conf 0.3).
- Expected: Pension statement question, mostly for myself. The Brightwell Pensions letter dated 3 March says my pot was 41,200 at the end of the tax year, but my own spreadsheet says 42,100, so there's a gap somewhere. I paid in 300 a month until June, then 250 after I dropped to part-time at a print shop. I think they may have missed the June payment, though I'm not sure. My adviser, [PERSON_1], said to check the employer contributions first.

## R3B-03 (pack weight)
- Ents: none private. "Patagonia" brand, benign — not an entity (or ORG KEEP).
- RF: "10 kg limit"; "5-day"; "Tent 1.8 kg, stove and pot 0.7 kg"; "Sleeping bag 0.9 kg", "mat 0.4 kg"; "Food for 5 days at 0.6 kg a day, so 3 kg, or maybe 0.5 a day if I skip the cheese"; "Water filter 0.1 kg, first aid kit 0.3 kg, headtorch 0.1 kg"; "Clothes 1.5 kg, I think, though the rain jacket alone is 0.4" (hedge; ambiguous whether jacket included).
- DROP: none.
- Expected: identical to input. (Check: 8.8 kg with cheese, 8.3 kg without; both under 10; +0.4 if jacket is extra -> 9.2 / 8.7.)

## R3B-04 (visa centre checklist)
- Ents: "Gulnara" PERSON ALIAS [PERSON_1]; "Hasmik" PERSON (signer) ALIAS [PERSON_2]; "the 21st" DATE KEEP; "Harbourline Visa Centre" ORG KEEP, "Eastgate" LOCATION KEEP (task needs centre); fees FINANCIAL KEEP.
- RF: "on the 21st"; "The slot is 10:40 at the Harbourline Visa Centre in Eastgate"; "they want us there 20 minutes early, so 10:20"; "my passport, the two photos (35 x 45 mm), and the fee, 85 in cash, no cards"; "I think it's 85, but the website also mentioned 90 for same-day, so maybe bring 100 to be safe"; "let's take the train and meet at 9:30" (with reason "Parking is awful").
- DROP: none (all lines feed the day plan); "I know it's a long way" harmless.
- Expected: Hi [PERSON_1],\n\nThanks for offering to come with me on the 21st, I know it's a long way. The slot is 10:40 at the Harbourline Visa Centre in Eastgate, ... meet at 9:30.\n\nSee you then,\n[PERSON_2] (rest verbatim).

## R3B-05 (school-trip to-do)
- Ents: "Noor" (x3) PERSON ALIAS [PERSON_1]; "Tariq" PERSON ALIAS [PERSON_2]; "Dilnoza Rahimova" PERSON (teacher) ALIAS [PERSON_3]; "Thursday" DATE KEEP; "45", "12" FINANCIAL KEEP; "since we separated"/"alternate weekends" FAMILY (contextual; keeping acceptable, PLACEHOLDER awkward); "nut allergy" HEALTH; "science museum" benign.
- RF: "the permission form is due back Thursday"; "the trip costs 45 for the coach plus 12 for lunch, or she takes a packed one, which I'd rather"; "he needs to sign too and I should send it to him"; "I'm not sure if the 12 includes a drink, I think not." (hedge).
- DROP candidate: "Her teacher, Dilnoza Rahimova, said the class is going to the science museum and that Noor's nut allergy is on file." — no deadline/amount/action; conf 0.65 (uncertain: some would keep destination).
- Expected: Notes to self for [PERSON_1]'s school trip: the permission form is due back Thursday, and the trip costs 45 for the coach plus 12 for lunch, or she takes a packed one, which I'd rather. [PERSON_2] has [PERSON_1] on alternate weekends since we separated, so he needs to sign too and I should send it to him. I'm not sure if the 12 includes a drink, I think not.

## R3B-06 (week table)
- Ents: "Karim" PERSON (son) ALIAS [PERSON_1]; "Farid" (x2) PERSON (husband) ALIAS [PERSON_2]; "council planning office" EMPLOYMENT/ORG — not needed for hours; PLACEHOLDER [EMPLOYMENT] optional (uncertain; KEEP acceptable); "orthodontist appointment" HEALTH KEEP; weekday/times KEEP. Role words "my son", "my husband" stay.
- RF: "I work 8 to 4 on Monday and Tuesday"; "Wednesday is a half day because my son Karim has an orthodontist appointment at 2"; "If they reschedule, my husband Farid can take him on Thursday, no, Friday afternoon" (condition + correction, final = Friday afternoon); "Bin day is Thursday, so someone has to put the bins out" (unassigned); "Farid also has football with him on Saturday at 11"; "the kit is in the dryer".
- DROP candidate: "I'd like it all in one place before I forget." filler; conf 0.4 (keep fine).
- Expected: input with Karim->[PERSON_1], Farid->[PERSON_2] (optionally "at [EMPLOYMENT]").

## R3B-07 (sleep clinic)
- Ents: "34" AGE KEEP (task); "Sigrid" PERSON ALIAS [PERSON_1]; sleep/mood/self-harm statements HEALTH KEEP; "last Tuesday" DATE KEEP.
- RF: "I'm 34"; "for the last fortnight"; "getting to sleep around 1 a.m. and waking at 5:30, so roughly four and a half hours"; "last Tuesday it might have been five, no wait, closer to four"; "I do not nap in the day"; "I have stopped coffee after noon"; "No sleeping tablets, nothing prescribed"; "says I talk in my sleep, which I can't confirm either way"; "Mood is flat but not low, and I haven't had any thoughts of self-harm"; "Weekends are better, about seven hours, I think".
- DROP: none ("Sleep diary, as promised." harmless).
- Expected: input with "My flatmate [PERSON_1] says I talk in my sleep".

## R3B-08 (trip coordinator)
- Ents: "Whitlock" (Mr Whitlock) PERSON ALIAS -> "Mr [PERSON_1]"; "Imogen" (x2) PERSON ALIAS [PERSON_2]; "Callum" (x2) PERSON ALIAS [PERSON_3]; "Clémence" PERSON (signer = "me") ALIAS [PERSON_4]; "11" AGE -> PLACEHOLDER [AGE] (task: "Her age isn't needed"; GENERALISE also acceptable); "Year 6" — implies age; uncertain, keep (group assignment); "on shift at the hospital" EMPLOYMENT -> keep or PLACEHOLDER (uncertain); nut allergy/EpiPen/travel-sick HEALTH KEEP.
- RF: "I'm giving permission for the full three nights, not just two" (negation); "She has a nut allergy (EpiPen in her bag)"; "gets travel-sick on coaches, so please seat Imogen near the front"; "for emergencies please try me first, then Callum" (order); context "Her dad, Callum, works away on weeks when I'm on shift".
- DROP candidate: "Is the final payment 85 or 95? Your letter says both on different pages." — not permission/medical/emergency; conf 0.7.
- Expected: Dear Mr [PERSON_1],\n\nThank you for the trip letter. [PERSON_2] is [AGE], so she's in the Year 6 residential group, and I'm giving permission for the full three nights, not just two. She has a nut allergy (EpiPen in her bag) and gets travel-sick on coaches, so please seat [PERSON_2] near the front. Her dad, [PERSON_3], works away on weeks when I'm on shift at the hospital, so for emergencies please try me first, then [PERSON_3].\n\nKind regards,\n[PERSON_4]

## R3B-09 (calorie arithmetic)
- Ents: none private. "Michael Pollan" public citation — NOT PERSON; "Sainsbury's" benign ORG.
- RF: "310 kcal per bowl and I make 6 bowls, so about 1,860 total"; "add a 90 kcal slice of rye bread to each, I think, or maybe only to 4 of them, no wait, all 6" (final = all 6); "Chickpea salad is 280 kcal per box, 5 boxes"; question "Is my total for the soup plus bread correct, and what does the salad add?". Target "roughly 2,000 kcal a day ... give or take 100" optional context (keep).
- DROP candidate: the Pollan/Sainsbury's sentence — irrelevant; conf 0.6 (could also keep; no privacy gain).
- Expected: identical or minus Pollan sentence. (Check: soup 1,860 correct; +540 bread = 2,400; salad 1,400; all 3,800.)

## R3B-10 (rota swap)
- Ents: "Leilani" (x3), "Manaia" (x4), "Tiago" (x2) PERSON ALIAS [PERSON_1..3]; "the bakery"/"her second job" EMPLOYMENT (Leilani's) — not needed; PLACEHOLDER optional / keep (uncertain); "14th", "9th" DATE KEEP; "area manager" role KEEP.
- RF: "Manaia takes Leilani's Friday 17:00-22:00 and Leilani takes Manaia's Sunday 08:00-14:00"; "Manaia has done 38 hours this week already, no wait, 36" (final 36); "so I think the extra shift puts him over 40, which needs sign-off" (hedge); "Tiago is meant to approve, but he's off until the 9th, so I'll message him and cc the area manager"; "Leilani can't do Friday close anymore". Arithmetic caveat: 36+5=41 (>40) but if the given-up Sunday 6 h is in the same week, 35 — answer must flag.
- DROP: none clearly (bakery clause is inside the reason sentence; drop conf 0.3).
- Expected: input with names aliased consistently.

## R3B-11 (support tools)
- Ents: Zendesk, Intercom, Jira, Linear benign ORG/products KEEP; "Fred Brooks" public citation — not PERSON; "Q4" DATE KEEP.
- RF: "Zendesk quoted 55 per seat per month for 12 seats, so 660 a month, I think"; "Intercom came in higher, around 74 a seat, no wait, 79" (final 79, "around"); open decisions: "comparing Zendesk and Intercom for support tooling, and Jira against Linear for the engineering board"; "Whichever we pick, we won't migrate before the Q4 freeze, which runs for 3 weeks".
- DROP candidates: Brooks sentence ("padded the estimate by 30%") conf 0.5 (30% may matter, uncertain); "Nobody outside the team has been told yet, so don't forward this." conf 0.4 (instruction, keep safer).
- Expected: identical (or minus Brooks sentence). (Check: Zendesk 660/month; Intercom 79x12 = 948/month.)

## R3B-12 (phone deals)
- Ents: Vodafone, EE benign ORG KEEP; no private persons (agent "she" unnamed).
- RF: "the 20GB plan is 18 a month for 24 months, with the phone 0 up front"; "it goes to 21 after the first 12 months, no wait, after the first 6" (final 6); "I've asked for that in writing"; "EE's rep offered 15 for 12 months, then 25, with 30GB"; "I'm not going over 12GB most months, though I once hit 16GB while travelling".
- DROP candidate: "I haven't signed anything and they only asked about my usage, not my details." conf 0.45.
- Expected: identical. (Check: Vodafone 6x18+18x21 = 486; EE 12x15+12x25 = 480; EE cheaper by 6.)

## R3B-13 (courier complaint)
- Ents: "Rojas" (in "Mrs Rojas") PERSON ALIAS -> "Mrs [PERSON_1]" (named third party on delivery note; keep the quote and "anyone by that name"); "Manaia" PERSON (partner) ALIAS [PERSON_2]; "Tiago" PERSON (concierge) ALIAS [PERSON_3]; "manaia.t@example.invalid" EMAIL PLACEHOLDER [EMAIL] (do not infer it is the partner's); "23 October" DATE KEEP; "64.90" FINANCIAL KEEP.
- RF: "marked delivered on 23 October, but nothing arrived"; "The courier's note says it was left with a neighbour, \"Mrs Rojas\""; "I live in a block of flats and don't know anyone by that name"; "was home all afternoon and heard no buzzer"; "checked the parcel room twice"; "so I think the driver went to the wrong building, though I can't prove it" (hedge); "Please reply to [EMAIL], which I check more than my own inbox"; "tell me whether you will resend or refund the 64.90".
- DROP: none.
- Expected: input with "Mrs [PERSON_1]", "My partner, [PERSON_2]," "Our concierge, [PERSON_3]," "reply to [EMAIL],".
