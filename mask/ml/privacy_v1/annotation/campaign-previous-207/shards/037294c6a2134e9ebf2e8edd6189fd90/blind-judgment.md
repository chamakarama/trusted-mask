# Blind judgment — reviewer claude-opus-subagent-reviewer-R3C-wave2-round3 (shard 037294c6a2134e9ebf2e8edd6189fd90)

General: entity annotations must be identical across task-swapped pairs (01/02, 03/04, 05/06); only decisions/DROPs differ. Names recurring across unrelated items (Tashi, Farhana, Rohan Chaudhary, Imran) are separate people per record. Never invent currency where the source gives none.

## R3C-01 (vaccine history, age + husband's record wanted)
Entities: "Farhana Siddiqui" PERSON->ALIAS [PERSON_1]; "34" AGE KEEP (task asks for age); "tetanus booster", "hep B", "sore arm" HEALTH KEEP; "Arvind" PERSON->ALIAS [PERSON_2] ("My husband," role word stays). "about eight years ago" relative DATE KEEP if tagged.
Required facts (exact): "I'm 34"; "before a trip"; "I had a tetanus booster at work about eight years ago, I think." (hedges "about", "I think"); "For hep B I had two doses of the three, and I never went back for the third." (negation); "No reactions to either, apart from a sore arm for a day."; "My husband, Arvind, had all three and has the certificate, which isn't much help to me."; "My GP surgery says my record is incomplete, and I'd rather not guess."; closing request "what's certain and what's only my memory".
DROP: none (greeting sentence is identity-only; DROP low confidence, aliasing preferred).
Expected: "Hi, it's [PERSON_1] here. I'm 34 and trying ... My husband, [PERSON_2], had all three ..." rest verbatim.

## R3C-02 (questions for GP; age + husband's record explicitly not relevant)
Entities identical to 01.
Decisions: "34" AGE PLACEHOLDER [AGE] (or GENERALISE 30–39; placeholder better given "not relevant"); "Farhana Siddiqui" ALIAS.
DROP: "My husband, Arvind, had all three and has the certificate, which isn't much help to me." — high confidence (task says husband's records irrelevant; no own-record facts inside). Arvind still annotated PERSON.
Required facts: "before a trip"; "I had a tetanus booster at work about eight years ago, I think."; "For hep B I had two doses of the three, and I never went back for the third."; "No reactions to either, apart from a sore arm for a day."; "My GP surgery says my record is incomplete, and I'd rather not guess."
Expected: "Hi, it's [PERSON_1] here. I'm [AGE] and trying to sort out my vaccine history before a trip, so bear with the muddle. I had a tetanus booster ... sore arm for a day. My GP surgery says my record is incomplete, and I'd rather not guess. Could you help me ...?"

## R3C-03 (follow-up: amount owed, due date, how late, where to pay)
Entities: "Tashi" PERSON ALIAS [PERSON_1]; "Nusrat Chowdhury" and "Nusrat's" same PERSON ALIAS [PERSON_2] ("my accountant," role stays; "[PERSON_2]'s firm"); "Ayesha" PERSON ALIAS [PERSON_3]; "IBAN DE00 0000 0000 0000 0000 00" (value span) IBAN PLACEHOLDER [IBAN] even though payment location is needed; "14 October" DATE KEEP; amounts "1,450", "1,537", "1,537.00", "60 euro", "1,477.00" FINANCIAL KEEP — tag ALL of them consistently (or none), and identically in 04; "6% VAT" uncertain (rate; if tagged, FINANCIAL KEEP). "2024-117" invoice number: uncertain — business document reference, not personal; I lean not-annotated/KEEP (needed for "quoting the invoice number"); if labelled ACCOUNT_ID it must be PLACEHOLDER and identically in 04.
Required facts: "invoice 2024-117 for the website copy: 1,450 plus 6% VAT, so 1,537 in total (it shows as 1,537.00 on the PDF)"; "It was due on 14 October and we're now three weeks over"; "which my accountant ... says counts as late under our contract"; "Last month I also covered your 60 euro conference ticket, so net of that you owe 1,477.00." (amount actually owed = net 1,477.00; arithmetic 1,450x1.06=1,537; -60=1,477 checks out; only the ticket is stated in euro); "I'd rather not involve [PERSON_2]'s firm if we can sort this out this week." (condition/deadline, firmness); "Pay into the usual account, IBAN [IBAN], quoting the invoice number."
DROP: none.
Expected: aliases + [IBAN]; everything else verbatim.

## R3C-04 (bookkeeping sums only; due date + payment details not needed)
Entities identical to 03.
DROP candidates: (a) "Pay into the usual account, IBAN ..., quoting the invoice number." high (payment details explicitly unneeded); (b) "I'd rather not involve Nusrat's firm if we can sort this out this week." high (no sums); (c) "It was due on 14 October and we're now three weeks over, which my accountant, Nusrat Chowdhury, says counts as late under our contract." medium-high (due date explicitly unneeded, no sums). If (c) not dropped, "14 October" DATE PLACEHOLDER.
Required facts: "invoice 2024-117 for the website copy: 1,450 plus 6% VAT, so 1,537 in total (it shows as 1,537.00 on the PDF)"; "Last month I also covered your 60 euro conference ticket, so net of that you owe 1,477.00." All amounts KEEP.
Expected: "Hi [PERSON_1],\n\nJust chasing invoice 2024-117 for the website copy: 1,450 plus 6% VAT, so 1,537 in total (it shows as 1,537.00 on the PDF). Last month I also covered your 60 euro conference ticket, so net of that you owe 1,477.00.\n\nThanks,\n[PERSON_3]" (greeting/sign-off may stay aliased).

## R3C-05 (team-channel rota; leave out non-rota)
Entities: "Imran" PERSON [PERSON_1]; "Kavya" (x2 incl. "Kavya's") PERSON [PERSON_2]; "Dilshan" PERSON [PERSON_3]; "off sick" HEALTH; "knee operation" HEALTH; "07700 900311" PHONE PLACEHOLDER. Weekdays/"next week" not needing tags (if tagged DATE, KEEP).
Required facts: "Imran can't do Thursday's late, so Kavya has said she'll swap and take the 2 pm to 10 pm (no, 1 pm to 9 pm, I misread the sheet)" — correction must survive: final shift is 1 pm to 9 pm (keep the correction text or the corrected value only; never 2–10 alone); "and I'll cover Kavya's Friday early, 6 am to 2 pm."; "That keeps us at four on the floor Thursday and three Friday, one short, I know."
DROP: "Also, totally separate: I'm having a knee operation in a couple of weeks and will be out of the office for about three weeks after that." high. "If anyone needs me on any of this before Wednesday, call me on 07700 900311." medium (contact, not rota; if kept -> [PHONE]). "Dilshan is still off sick and should be back the week after, so please don't ping him." uncertain (availability is rota-adjacent and "don't ping him" is a team instruction; HEALTH sensitive in a team channel) — either keep-with-alias or DROP acceptable; not both-ways across pair inconsistently for entities.
Expected: "Rota update for next week, team. [PERSON_1] can't do Thursday's late, so [PERSON_2] has said she'll swap and take the 2 pm to 10 pm (no, 1 pm to 9 pm, I misread the sheet), and I'll cover [PERSON_2]'s Friday early, 6 am to 2 pm. That keeps us at four on the floor Thursday and three Friday, one short, I know. [Dilshan sentence aliased or dropped]"

## R3C-06 (manager handover: swaps + own absence, duration, how to reach)
Entities identical to 05.
Decisions: "knee operation" HEALTH KEEP (reason for absence in a manager handover; placeholder would be awkward) — mild uncertainty; "07700 900311" PHONE PLACEHOLDER [PHONE] (direct identifier, never kept, even though "how to reach me" requested); names ALIAS.
Required facts: swap sentence with the "(no, 1 pm to 9 pm, I misread the sheet)" correction; "I'll cover Kavya's Friday early, 6 am to 2 pm."; "four on the floor Thursday and three Friday, one short"; "I'm having a knee operation in a couple of weeks and will be out of the office for about three weeks after that." (hedges "a couple of", "about", "after that"); "If anyone needs me on any of this before Wednesday, call me on [PHONE]." (condition "before Wednesday").
DROP: none (Dilshan sentence low-confidence DROP; staffing-relevant for a manager, keep).
Expected: full text with aliases and [PHONE].

## R3C-07 (sleep summary for GP; skip unrelated)
Entities: "Anjali" PERSON ALIAS [PERSON_1]; "Rohan Chaudhary" PERSON [PERSON_2]; "35 euros" FINANCIAL; "3 mg melatonin" HEALTH KEEP; caffeine/coffee not a private entity.
Required facts: "Sleep diary, week 2"; Mon "in bed 23:00, asleep maybe 23:45, woke twice (3:10 and 5:30), up at 6:45" (hedge "maybe"); Tue "in bed 22:30, asleep by 23:00, no wake-ups, up at 6:30"; Wed "caffeine after 4 pm (one coffee, no, two), asleep around 00:30, woke once" (correction -> two coffees; "around"); Thu "bed at 1:15 am, up at 7:00"; Fri "took the 3 mg melatonin as the GP suggested, asleep by 23:20, woke once"; "Weekend: skipped the diary" (missing-data fact).
DROP: "- Side note, not for the GP: Rohan Chaudhary owes me 35 euros for the concert tickets, remind me" — high (bullet). Weekend bullet: keep (low DROP). Thu bullet: keep; "Anjali's birthday dinner" explains late bed — alias.
Expected: list with Anjali -> [PERSON_1], side-note bullet removed, everything else verbatim.

## R3C-08 (standup notes -> action items)
Entities: none private. "Stripe", "AWS" are public vendor ORGs — not private; annotating them would be over-annotation (at most ORG KEEP). "4.2.1", "10 am" not identifiers.
Required facts: "build 4.2.1 shipped on schedule"; "p95 latency down from 480 ms to 310 ms (I think, the dashboard may have been showing p90)" (uncertainty must survive); "Stripe webhook retries are now capped at 5, not 3 as in the old config" (negation/correction); "still waiting on the AWS quota increase, ticket open for 6 days"; "Next up is the changelog, then the rollback drill, which we agreed would take no more than 45 minutes." (order, upper bound).
DROP: none (or low-confidence: "Nothing here involves customer data." / trailing request sentence). 
Expected: text unchanged.

## R3C-09 (visa checklist; keep every size, amount, appointment date)
Entities: "the 12th", "the 21st" DATE KEEP; "software tester" EMPLOYMENT, "Fenwick Labs" ORG, "for 4 years" EMPLOYMENT/duration — uncertain need; I lean KEEP (employment letter content; checklist meaning) but typed placeholders [EMPLOYMENT]/[ORG] defensible if grammatical; "Imran Qureshi" PERSON ALIAS [PERSON_1] ("in HR" stays); "Sunita Bhattarai" PERSON ALIAS [PERSON_2] ("my sister," role stays); "4,500", "85" FINANCIAL KEEP (no currency given — don't add one).
Required facts: "(appointment is on the 12th, no, the 21st, check the email)" (correction -> 21st, plus "check the email" hedge); "Passport, valid for 6+ months, plus a photocopy of the photo page"; "Two photos, 35 x 45 mm, not smiling"; "ask Imran Qureshi in HR for the signed copy"; "Bank statements for the last 3 months, balance of at least 4,500"; "Invitation letter from my sister, Sunita Bhattarai, plus a copy of her residence permit"; "Fee: 85 by card at the desk, no cash".
DROP: none.
Expected: aliases only (plus optional employment placeholders).

## R3C-10 (school-trip checklist for family chat)
Entities: "Tashi" (x2 incl. "Tashi's") PERSON ALIAS [PERSON_1]; "9" AGE PLACEHOLDER/GENERALISE (not needed); "Year 4" — reveals age, uncertain (not a listed label; leaving it is acceptable); "Oakfield Primary" ORG PLACEHOLDER [ORG] (not needed); "Marrick Roman fort" public place/LOCATION KEEP (benign, destination); "the 17th", "the 10th" DATE KEEP; "6" FINANCIAL KEEP (no currency); "Mr Iyengar" PERSON ALIAS ("The teacher, [PERSON_2]," — "Mr" may stay or go, consistently). "nut-free (school rule)" is not a HEALTH fact about the child — don't invent an allergy.
Required facts: "the class visits the Marrick Roman fort on the 17th"; "The slip has to be signed and returned by the 10th, along with 6 for the coach, exact change, no cards."; "The coach leaves at 8:15 and is back around 3:30, no, 4:00 per the letter." (correction -> 4:00); "Packed lunch, nut-free (school rule), and waterproofs even if it's dry."; "said he'd text parents if the weather turns, so keep your phone on."
DROP: none.
Expected: "Reminder to self, and for the family chat, about [PERSON_1]'s school trip. [PERSON_1] is [AGE], Year 4 at [ORG], and the class visits the Marrick Roman fort on the 17th. ... The teacher, Mr [PERSON_2], said ..." (age/ORG placeholders; uncertain whether reviewer standard prefers KEEP for family chat — placeholders preferred as unneeded).

## R3C-11 (allotment volunteer plan; keep every number and correction)
Entities: "Rohan Chaudhary" PERSON ALIAS [PERSON_1] ("The consultant," stays); "surgery", "the wound heals normally" HEALTH — KEEP (sentences carry required numbers; placeholdering "the surgery" is awkward) — mild uncertainty; "Sanjay" PERSON ALIAS [PERSON_2] ("My brother" stays); "Farhana" PERSON ALIAS [PERSON_3] ("next door" stays).
Required facts: "I'll be in for 3 nights after the surgery and shouldn't lift anything over 5 kg for six weeks"; "My brother Sanjay can water on the 2 days he's off (not 3)" (correction/negation); "Farhana next door has offered Saturdays"; "broad beans (50 g) and onion sets, about 40, maybe 45" (hedges); "Nothing heavy until week 7, so the compost delivery has to wait."; "I'd like to be back on the plot by week 8 if the wound heals normally." (condition).
DROP: none ("Journal, late evening." low confidence).
Expected: aliases only, rest verbatim.
