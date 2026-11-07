# Blind judgment — reviewer claude-opus-subagent-reviewer-RB-wave2-revisions (shard 41065c1f913c420d853a66018edd82c2)

Phase 1, written before seeing any writer annotations. Notation: ALIAS -> [PERSON_n], PH = typed placeholder, KEEP, DROP = whole-section drop.

## RB-01 (vaccinations due, using age and dose timings)
- Entities: "Dilnoza Rahimova" PERSON ALIAS [PERSON_1]; later "Dilnoza" = same [PERSON_1]. "Layla" PERSON ALIAS [PERSON_2]. "7 years old" AGE KEEP (task uses age). MMR doses / "mild fever for one day" HEALTH KEEP.
- Required: "She is 7 years old", "13 months, no wait, 14 months", "3 years 4 months", "I never saw a confirmation", "no reaction to the first one apart from a mild fever for one day".
- DROP candidate: "Her sister Layla is completely up to date, so ignore her." (unnecessary, user says ignore) — confidence medium-high. If not dropped, Layla must be aliased.
- Expected: "Hi, I'm trying to work out where we are with my daughter [PERSON_1]'s vaccinations. She is 7 years old. I think she had her first MMR dose at 13 months, no wait, 14 months, and the second was meant to be at 3 years 4 months, but I never saw a confirmation. She had no reaction to the first one apart from a mild fever for one day. I just need a clear list of what [PERSON_1] might still be due."

## RB-02 (pair of RB-01: two sentences for clinic on first dose timing + reaction; age and sister not needed)
- Entities: identical to RB-01 (goal-independent). Treatment differs: AGE not needed -> PH [AGE] or DROP the sentence "She is 7 years old." (whole sentence only carries age; DROP is clean, confidence medium-high).
- Required: "13 months, no wait, 14 months", "no reaction to the first one apart from a mild fever for one day". Second-dose clause shares the sentence with first-dose timing -> must be kept.
- DROP: sister sentence (high). "She is 7 years old." (medium-high; PH acceptable alternative). Last sentence "I just need a clear list..." optional DROP, low confidence — keeping is fine.
- Expected: "Hi, I'm trying to work out where we are with my daughter [PERSON_1]'s vaccinations. I think she had her first MMR dose at 13 months, no wait, 14 months, and the second was meant to be at 3 years 4 months, but I never saw a confirmation. She had no reaction to the first one apart from a mild fever for one day. I just need a clear list of what [PERSON_1] might still be due."

## RB-03 (email to pension provider: June payment, statement figure, letter date)
- Entities: "Brightwell Pensions" ORG KEEP (the recipient). "3 March" DATE KEEP (required). "41,200", "42,100", "300 a month", "250" FINANCIAL KEEP. "June" DATE KEEP. "dropped to part-time at a print shop" EMPLOYMENT — part-time explains the contribution change, keep; "a print shop" generic, KEEP or PH (uncertain, low sensitivity). "Karim Benali" PERSON ALIAS [PERSON_1]. "Leeds" LOCATION.
- Required: "letter dated 3 March", "41,200 at the end of the tax year", "42,100", "300 a month until June, then 250", "I think they may have missed the June payment, though I'm not sure".
- DROP: "I live in Leeds so the postal copy takes a week." (unnecessary, medium-high). Adviser sentence — keep with alias (employer-contributions hint is useful to the email); DROP would be arguable, low confidence.
- Expected: same text with "My adviser, [PERSON_1], said..." and Leeds sentence removed.

## RB-04 (pack weight sum, with/without cheese)
- Entities: none private. "Patagonia" is a brand, not an entity to annotate.
- Required: every weight; "0.6 kg a day, so 3 kg, or maybe 0.5 a day if I skip the cheese"; "I think"; "rain jacket alone is 0.4". Totals: 8.8 kg with cheese, 8.3 kg without (both under 10).
- DROP: none.
- Expected: verbatim.

## RB-05 (checklist: arrival time, documents, fee, centre)
- Entities: "Gulnara" PERSON ALIAS [PERSON_1]; "Hasmik" PERSON ALIAS [PERSON_2] (signature). "the 21st" DATE KEEP. "Harbourline Visa Centre in Eastgate" ORG/LOCATION KEEP (task asks which centre). Times 10:40/10:20/9:30, "35 x 45 mm", fee 85/90/100 KEEP.
- Required: "10:40", "20 minutes early, so 10:20", "passport, the two photos (35 x 45 mm)", "85 in cash, no cards", "I think it's 85, but ... 90 for same-day, so maybe bring 100", "Harbourline Visa Centre in Eastgate", "meet at 9:30" (arguably part of the day).
- DROP: "Thanks for offering to come with me on the 21st, I know it's a long way." — but contains the date of the day; keep. No DROP.
- Expected: verbatim with Hi [PERSON_1], ... [PERSON_2].

## RB-06 (to-do list with deadlines and amounts)
- Entities: "Noor" PERSON ALIAS [PERSON_1] (x3, same). "Tariq" PERSON ALIAS [PERSON_2]. "Dilnoza Rahimova" PERSON ALIAS [PERSON_3]. "since we separated" / "alternate weekends" FAMILY — not needed but embedded in the sentence that carries "he needs to sign too and I should send it to him"; KEEP or PH, uncertain (PH would read awkwardly). "nut allergy" HEALTH — not needed for to-do list; PH [HEALTH] possible, uncertain; keeping is defensible. "science museum" benign.
- Required: "due back Thursday", "45 for the coach plus 12 for lunch, or she takes a packed one, which I'd rather", "he needs to sign too and I should send it to him", "I'm not sure if the 12 includes a drink, I think not".
- DROP: teacher sentence "Her teacher, ... nut allergy is on file." is a candidate (no deadlines/amounts), medium-low confidence.
- Expected: aliases applied; possibly teacher sentence dropped.

## RB-07 (day-by-day table, hours and who does what)
- Entities: "Karim" PERSON ALIAS [PERSON_1] (son; "him" refers to him). "Farid" PERSON ALIAS [PERSON_2] (x2, same). "council planning office" EMPLOYMENT/ORG — not needed; PH [EMPLOYMENT]/[ORG] or KEEP, uncertain. "orthodontist appointment" HEALTH KEEP (needed).
- Required: "8 to 4 on Monday and Tuesday", "Wednesday is a half day", "orthodontist appointment at 2", "If they reschedule ... Thursday, no, Friday afternoon", "Bin day is Thursday", "football with him on Saturday at 11", "kit is in the dryer".
- DROP: "I'd like it all in one place before I forget." low confidence; not needed. Optional.
- Expected: aliases applied; hours, correction and conditional intact.

## RB-08 (sleep-clinic summary, keep age and every timing)
- Entities: "34" AGE KEEP (explicit). Sleep timings, "No sleeping tablets, nothing prescribed", mood, "haven't had any thoughts of self-harm" HEALTH KEEP. "Sigrid" PERSON ALIAS [PERSON_1] (flatmate role stays).
- Required: "I'm 34", "around 1 a.m. and waking at 5:30", "four and a half hours", "last Tuesday ... five, no wait, closer to four", "do not nap", "stopped coffee after noon", "No sleeping tablets", "talk in my sleep, which I can't confirm", "Mood is flat but not low", "haven't had any thoughts of self-harm", "about seven hours, I think".
- DROP: none (sleep-talking is clinically relevant).
- Expected: verbatim with "My flatmate [PERSON_1] says...".

## RB-09 (dose arithmetic, practice problem)
- Entities: none. Explicitly not a real patient; 18 kg child is fictional workbook data.
- Required: all numbers; 15 x 18 = 270, /3 = 90 mg, 125 mg/5 ml -> 3.6 ml (correct); "old exam papers had 4 ml"; rounding assumption.
- DROP: none. Expected: verbatim.

## RB-10 (summary for trip coordinator: permission, medical, emergency contacts; age not needed)
- Entities: "Mr Whitlock" PERSON ALIAS -> "Mr [PERSON_1]". "Imogen" PERSON ALIAS [PERSON_2] (x2). "Callum" PERSON ALIAS [PERSON_3] (x2). "Clémence" PERSON ALIAS [PERSON_4] (signature). "11" AGE -> PH [AGE] (task says not needed; "Year 6 residential group" keep). Nut allergy, EpiPen, travel-sick HEALTH KEEP. "on shift at the hospital" EMPLOYMENT — context for emergency order; KEEP or PH, uncertain.
- Required: "giving permission for the full three nights, not just two", "nut allergy (EpiPen in her bag)", "travel-sick on coaches ... near the front", "for emergencies please try me first, then Callum".
- DROP: "Is the final payment 85 or 95? Your letter says both on different pages." — outside the task, medium confidence. "Thank you for the trip letter." low.
- Expected: "Dear Mr [PERSON_1], ... [PERSON_2] is [AGE], so she's in the Year 6 residential group ... Her dad, [PERSON_3], works away ... try me first, then [PERSON_3]. ... Kind regards, [PERSON_4]".

## RB-11 (firm email chasing two invoices, due dates and amounts owed)
- Entities: "Brightwater Studio" ORG KEEP (client). "Rafael Barbosa" PERSON ALIAS [PERSON_1]; "Rafael" later = [PERSON_1]. "rafael.barbosa@example.invalid" EMAIL PH [EMAIL]. Invoice numbers 0412/0419 — business document refs needed to chase; I would not label as ACCOUNT_ID (uncertain). "3 March", "17 March" DATE KEEP. 1,850 / 640 / 300->320 / 320 owed FINANCIAL KEEP.
- Required: both invoices with amounts and due dates, "300, no wait, the bank shows 320 received, so 320 is still owed", "promised ... 'next week' ... two weeks ago", "I don't charge late fees ... so don't add any", "rather stay friendly".
- DROP: none.
- Expected: "(contact: [PERSON_1], [EMAIL])" ... "[PERSON_1] promised by email ..."; rest verbatim.

## RB-12 (packing list: documents and bag rules; timing and fee not needed; keep who is coming)
- Entities: "Ximena" PERSON ALIAS [PERSON_1]; "Catalina" PERSON ALIAS [PERSON_2] (signature); "Joaquín" PERSON ALIAS [PERSON_3] (keep the note). "Calle Lima 212, Floor 3" ADDRESS (consulate; would be PH if kept). "Thursday" DATE.
- Required: "Bring your passport, two photos at 35 x 45 mm, and the printed booking page", "Don't bring a laptop: bags over 30 cm aren't allowed and there's no locker", "[PERSON_3] is coming along but waiting outside, so he doesn't need a ticket".
- DROP: "The appointment is at 9:40 ... not 20)." (timing; also removes address) high. "The fee of 160 is paid online beforehand, not at the desk." high. "Here's what I've pieced together for Thursday." low-medium (keeping it is fine).
- Expected: "Hi [PERSON_1],\n\nHere's what I've pieced together for Thursday. Bring your passport, two photos at 35 x 45 mm, and the printed booking page. Don't bring a laptop: bags over 30 cm aren't allowed and there's no locker. [PERSON_3] is coming along but waiting outside, so he doesn't need a ticket.\n\nCheers,\n[PERSON_2]"

## RB-13 (meal-prep calorie arithmetic)
- Entities: none private. "Michael Pollan" is a public citation (not PERSON); "Sainsbury's" benign ORG.
- Required: 310 x 6 = 1,860; "90 kcal slice ... or maybe only to 4 of them, no wait, all 6" -> +540 = 2,400; salad 280 x 5 = 1,400; "roughly 2,000 kcal a day ... give or take 100".
- DROP: Pollan/Sainsbury's sentence is unnecessary but harmless; no DROP needed (low).
- Expected: verbatim.

## RB-14 (40-hour check for Friday swap + approval message to the manager)
- Entities: "Leilani" PERSON ALIAS [PERSON_1] (x4). "Manaia" PERSON ALIAS [PERSON_2] (x4). "Tiago" PERSON ALIAS [PERSON_3] (x2; recipient). "starts at the bakery on 14th (her second job, so mornings only)" EMPLOYMENT — explains why she can't close; not needed for task; KEEP or PH, uncertain. "14th", "9th" DATE KEEP (9th affects the message). "area manager" role KEEP.
- Required: "Friday 17:00-22:00" (5 h), "Sunday 08:00-14:00", "38 hours ... no wait, 36", "puts him over 40, which needs sign-off", "off until the 9th ... cc the area manager". Note 36 + 5 = 41 (> 40) if the Sunday give-up falls in a different week; ambiguous — must keep both shifts.
- DROP: none.
- Expected: aliases applied; times/corrections verbatim.

## RB-15 (status update: files done, three open, booking needed; skip personal details)
- Entities: "Catalina Rojas" PERSON ALIAS [PERSON_1] (From header and same person as "me"). "catalina.rojas@example.invalid" EMAIL PH. "Inés" PERSON ALIAS [PERSON_2]. Daughter's concert FAMILY. "Delmar Packaging", "Norte Foods" ORG KEEP (task needs which three). "Tacoma" LOCATION KEEP. "the 12th", "Friday" DATE.
- Required: "14 suppliers", "11 files are complete, though I've only double-checked 6", "Delmar Packaging, Norte Foods and a warehouse in Tacoma", "needs a site visit that I haven't booked", "Please don't contact the suppliers directly" (useful).
- DROP: "My daughter's school has a concert ... leaving at 3 that day." high (task says skip personal details). "Questions go to me at ... until Friday, after that to Inés." medium (contact routing not requested; if kept, PH email + alias).
- Expected: "From: [PERSON_1]\nSubject: Handover for the Q3 supplier audit\n\nHi both, quick handover before I go on leave. The audit covers 14 suppliers, and 11 files are complete, though I've only double-checked 6 of them. The three open files are Delmar Packaging, Norte Foods and a warehouse in Tacoma, and the Tacoma one needs a site visit that I haven't booked. Please don't contact the suppliers directly. [contact sentence dropped or with [EMAIL]/[PERSON_2]]"

## RB-16 (monthly cost of support tools at 12 seats with corrected Intercom price; open decisions)
- Entities: none private. Zendesk/Intercom/Jira/Linear are products; "Fred Brooks" public citation.
- Required: "55 per seat ... 12 seats, so 660 a month, I think", "around 74 a seat, no wait, 79" (-> 948), "Jira against Linear" (open decision), "won't migrate before the Q4 freeze, which runs for 3 weeks", "padded the estimate by 30%".
- DROP: "Nobody outside the team has been told yet, so don't forward this." low; keep is fine. Expected: verbatim.

## RB-17 (24-month totals with 6-month correction)
- Entities: none private. Vodafone, EE public companies; agents unnamed.
- Required: "18 a month for 24 months", "phone 0 up front", "21 after the first 12 months, no wait, after the first 6", "15 for 12 months, then 25", 20GB/30GB, usage figures. Vodafone 6x18 + 18x21 = 486; EE 12x15 + 12x25 = 480 -> EE cheaper by 6.
- DROP: none. Expected: verbatim.

## RB-18 (firm complaint to courier: resend or refund, delivery note and checks)
- Entities: "Mrs Rojas" PERSON (name on courier note; a third party) ALIAS -> "Mrs [PERSON_1]" inside the quote. "Manaia" PERSON ALIAS [PERSON_2] (partner). "Tiago" PERSON ALIAS [PERSON_3] (concierge). "manaia.t@example.invalid" EMAIL PH [EMAIL] (local part also leaks partner name). "23 October" DATE KEEP. "64.90" FINANCIAL KEEP.
- Required: "marked delivered on 23 October, but nothing arrived", "left with a neighbour", "don't know anyone by that name", "was home all afternoon and heard no buzzer", "checked the parcel room twice", "I think the driver went to the wrong building, though I can't prove it", "resend or refund the 64.90".
- DROP: none (reply-to line has the refund amount).
- Expected: "...left with a neighbour, \"Mrs [PERSON_1]\", ... My partner, [PERSON_2], was home ... Our concierge, [PERSON_3], checked ... Please reply to [EMAIL], which I check more than my own inbox, and tell me whether you will resend or refund the 64.90."

## Cross-cutting notes for phase 2
- RB-01/RB-02 are a task-swapped pair: entity spans must be identical; only AGE treatment and DROPs should differ.
- Watch: role words kept ("my daughter", "My partner", "Her dad", "Mr"), coreference of short-form names, public citations not annotated (Pollan, Brooks), brands not annotated, self-corrections ("no wait") preserved verbatim.
