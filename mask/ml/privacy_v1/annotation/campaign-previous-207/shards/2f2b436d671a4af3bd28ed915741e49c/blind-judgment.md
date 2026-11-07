# Blind judgment — reviewer claude-opus-subagent-reviewer-RD-wave2-revisions (shard 2f2b436d671a4af3bd28ed915741e49c)

Written before seeing any writer annotation. Entity sets are meant to be goal-independent; only decisions differ across task-swapped pairs (01/02, 03/04, 05/06).

## RD-01 (vaccine history; age + husband needed)
- Entities: "Farhana Siddiqui" PERSON; "34" AGE; "Arvind" PERSON (husband); HEALTH facts (tetanus booster, hep B doses, sore arm). "at work" not an entity. "GP surgery" generic, not ORG entity.
- Required: "I'm 34"; "about eight years ago, I think"; "two doses of the three"; "never went back for the third"; "No reactions to either, apart from a sore arm for a day"; "had all three and has the certificate"; "my record is incomplete".
- Decisions: Farhana Siddiqui ALIAS [PERSON_1]; Arvind ALIAS [PERSON_2]; 34 KEEP; HEALTH KEEP. No DROP.
- Expected: "Hi, it's [PERSON_1] here. I'm 34 and ... My husband, [PERSON_2], had all three and has the certificate, which isn't much help to me. ..." (rest verbatim).

## RD-02 (questions for GP; age + husband explicitly not relevant)
- Entities: identical to RD-01.
- Required: tetanus "about eight years ago, I think"; hep B "two doses of the three", "never went back for the third"; reactions; "record is incomplete"; "I'd rather not guess".
- Decisions: Farhana ALIAS [PERSON_1]; 34 PLACEHOLDER [AGE] (sentence cannot be dropped: carries trip/vaccine context); Arvind still annotated PERSON.
- DROP candidate: "My husband, Arvind, had all three and has the certificate, which isn't much help to me." — husband's record explicitly irrelevant; no required facts (the "of the three" fact is in the earlier sentence). Confidence high.
- Expected: "Hi, it's [PERSON_1] here. I'm [AGE] and trying to sort out ... sore arm for a day. My GP surgery says my record is incomplete, and I'd rather not guess. Could you help ...?"

## RD-03 (firm follow-up: amount, due date, lateness, where to pay)
- Entities: "Tashi" PERSON; "Nusrat Chowdhury" PERSON and "Nusrat's" (same person, same alias); "Ayesha" PERSON; "DE00 0000 0000 0000 0000 00" IBAN; amounts FINANCIAL; "14 October" DATE. "invoice 2024-117": document reference, not a personal identifier (uncertain whether writer treats as ACCOUNT_ID; I would KEEP it — task says quote invoice number).
- Required: "1,450 plus 6% VAT, so 1,537"; "1,537.00"; "due on 14 October"; "three weeks over"; "60 euro conference ticket"; "net of that you owe 1,477.00"; "IBAN ... quoting the invoice number"; "counts as late under our contract". Arithmetic checks (1450x1.06=1537; 1537-60=1477).
- Decisions: Tashi [PERSON_1], Nusrat Chowdhury/Nusrat [PERSON_2] ("[PERSON_2]'s firm"), Ayesha [PERSON_3]; IBAN PLACEHOLDER [IBAN]; FINANCIAL/DATE KEEP. No DROP (the "rather not involve" line is the "firm" part; keep).
- Expected: full text with those substitutions; "Pay into the usual account, IBAN [IBAN], quoting the invoice number."

## RD-04 (bookkeeping sums only; due date and payment details not needed)
- Entities: identical to RD-03.
- Required: "1,450 plus 6% VAT, so 1,537 in total"; "1,537.00"; "60 euro conference ticket"; "net of that you owe 1,477.00"; invoice 2024-117 (bookkeeping reference).
- DROP candidates: (a) "It was due on 14 October and we're now three weeks over, which my accountant, Nusrat Chowdhury, says counts as late under our contract." — due date explicitly not needed; high. (b) "I'd rather not involve Nusrat's firm if we can sort this out this week." — not about sums; medium-high. (c) "Pay into the usual account, IBAN ..., quoting the invoice number." — payment details explicitly not needed; high.
- Decisions: greeting/sign-off ALIAS [PERSON_1]/[PERSON_3]; Nusrat still annotated even inside dropped sections.
- Expected: "Hi [PERSON_1],\n\nJust chasing invoice 2024-117 for the website copy: 1,450 plus 6% VAT, so 1,537 in total (it shows as 1,537.00 on the PDF). Last month I also covered your 60 euro conference ticket, so net of that you owe 1,477.00.\n\nThanks,\n[PERSON_3]"

## RD-05 (team rota post; leave out non-rota)
- Entities: "Imran", "Kavya" (x3: Kavya, she, Kavya's), "Dilshan" (+"him") PERSON; "07700 900311" PHONE; "off sick" HEALTH (Dilshan); "knee operation" HEALTH; time spans DATE-ish keep.
- Required: "Thursday's late"; "2 pm to 10 pm (no, 1 pm to 9 pm, I misread the sheet)"; "Kavya's Friday early, 6 am to 2 pm"; "four on the floor Thursday and three Friday, one short".
- Decisions: Imran [PERSON_1], Kavya [PERSON_2] (both mentions), Dilshan [PERSON_3]; phone [PHONE].
- DROP candidates: "Also, totally separate: I'm having a knee operation ... about three weeks after that." — self-declared unrelated; high. Dilshan sentence — UNCERTAIN: it is availability (rota-relevant) but carries third-party health; I'd keep it (maybe PLACEHOLDER [HEALTH] for "off sick" is awkward; keep). Phone sentence ("If anyone needs me on any of this before Wednesday...") — refers to the rota; I'd keep with [PHONE]; DROP low confidence.
- Expected: rota sentences with aliases + Dilshan sentence + "If anyone needs me on any of this before Wednesday, call me on [PHONE]."

## RD-06 (manager handover: swaps + own absence, duration, contact)
- Entities: identical to RD-05.
- Required: all shift facts as RD-05; "in a couple of weeks"; "about three weeks after that"; "before Wednesday"; the contact instruction (number itself is a direct identifier -> [PHONE]).
- Decisions: aliases as RD-05; phone PLACEHOLDER [PHONE] despite "how to reach me" (direct identifier never verbatim). "knee operation": reason for absence is not asked for — PLACEHOLDER [HEALTH] defensible ("I'm having a [HEALTH] in a couple of weeks"); KEEP also defensible as the user's own fact to their manager. Uncertain; lean KEEP is acceptable, PLACEHOLDER acceptable. Dilshan off sick KEEP (staffing).
- DROP: none.
- Expected: full text with aliases and [PHONE].

## RD-07 (sleep summary for GP; skip unrelated)
- Entities: "Anjali" PERSON; "Rohan Chaudhary" PERSON; "35 euros" FINANCIAL; melatonin 3 mg / GP HEALTH; times.
- Required: all bed/sleep/wake times Mon–Fri; "caffeine after 4 pm (one coffee, no, two)"; "asleep around 00:30, woke once"; "bed at 1:15 am, up at 7:00"; "3 mg melatonin as the GP suggested, asleep by 23:20, woke once"; weekend gap ("skipped the diary").
- Decisions: Anjali ALIAS [PERSON_1] (Thu line kept — explains late bedtime).
- DROP: "- Side note, not for the GP: Rohan Chaudhary owes me 35 euros for the concert tickets, remind me" — high. Weekend line keep (data gap).
- Expected: diary with "[PERSON_1]'s birthday dinner" and side-note bullet removed.

## RD-08 (pharmacy email; keep doses, allergy, correction)
- Entities: "Meera Pillai" and "Meera" PERSON (same, mother; "mum"); "Imran Qureshi" PERSON (pharmacist); "Dilshan" and "Dilshan Perera" PERSON (same, writer); "07700 900482" PHONE; HEALTH: levothyroxine 75 mcg / 100 mcg, penicillin allergy, headache.
- Required: "levothyroxine 75 mcg, one tablet each morning"; "not 100 mcg, that was the old dose, I think they changed it in the spring"; "allergic to penicillin"; "confirmed the dose on the phone last time"; "mum's own phone is off"; headache on switching brand.
- Decisions: Meera [PERSON_1] both; Imran Qureshi [PERSON_2]; Dilshan/Dilshan Perera [PERSON_3]; phone [PHONE]; HEALTH KEEP. No DROP.
- Expected: "...my mother, [PERSON_1], ... [PERSON_2], your pharmacist, confirmed ... ring me, [PERSON_3], on [PHONE], ... [PERSON_1] also wondered ... Thanks,\n[PERSON_3]".

## RD-09 (tax worksheet; ID added later; drop non-return items)
- Entities: "Harpreet Gill" PERSON; "TEST-0000-4471" NATIONAL_ID; "Sunita" PERSON; FINANCIAL amounts; "council job" EMPLOYMENT (keep); "hospice charity" generic keep; "2025/26" DATE keep.
- Required: "38,200 from the council job"; "tax paid 5,910 (or is it 5,190? check the P60)"; "112 from savings, under the 1,000 allowance, I believe"; "240 ... or 420? check the receipts"; "Still to find: the pension statement".
- Decisions: name ALIAS [PERSON_1]; NATIONAL_ID PLACEHOLDER [NATIONAL_ID]; Sunita annotated PERSON.
- DROP: "- Side note: Sunita is lending me 300 for the wedding photographer, repay by the 5th" — not part of return; high.
- Expected: checklist with "Name on the return: [PERSON_1]; national ID [NATIONAL_ID] (they asked for it twice, ugh)" and Sunita bullet removed.

## RD-10 (standup action items; no private data)
- Entities: none private. Stripe, AWS are public vendors — not entities (or ORG KEEP at most). Versions/metrics are not identifiers.
- Required: "10 am"; "4.2.1"; "480 ms to 310 ms (I think, the dashboard may have been showing p90)"; "capped at 5, not 3"; "open for 6 days"; "no more than 45 minutes"; changelog then rollback drill order.
- DROP: none (the closing request and "Nothing here involves customer data" are harmless; very low-confidence candidates only).
- Expected: identical to input (negative/no-op example).

## RD-11 (gym billing complaint)
- Entities: "hgill_run42" USERNAME; "harpreet.gill@example.invalid" EMAIL; "Dilshan" PERSON (staff); "Harpreet Gill" PERSON; "night-shift nurse" EMPLOYMENT; dates and 34.99 FINANCIAL/DATE keep.
- Required: "3 June"; "through the app, then again in person"; "34.99 on 1 July and again on 1 August"; "30 days' notice"; "first charge is fair ... but the second is not"; "second 34.99 refunded, not the first"; "written confirmation that the account is closed"; "Please don't call ... email is best".
- Decisions: username [USERNAME]; email [EMAIL]; Dilshan [PERSON_1] ("a staff member called [PERSON_1]"); Harpreet Gill [PERSON_2]. "night-shift nurse": uncertain — KEEP (justifies no-call request) or PLACEHOLDER [EMPLOYMENT] ("I'm a [EMPLOYMENT] and asleep in the day" reads slightly worse since "night-shift" explains daytime sleep). Lean KEEP, low confidence. No DROP.
- Expected: full text with those placeholders/aliases.

## RD-12 (warranty repair request; town not needed)
- Entities: "Tanner & Wells" ORG (retailer, KEEP — task needs retailer); "Bristol" LOCATION; "07700 900646" PHONE; "21 November last year" DATE KEEP; "Arden 9 stand mixer" product, not an entity.
- Required: "stopped spinning after 11 months"; "249.00, no, 294.00, I misread it"; "motor hums but the bowl doesn't turn, no burning smell"; "did NOT overload it, two loaves of dough at most"; "unplugged since", "kept the box"; "warranty is 24 months"; "21 November last year".
- Decisions: Bristol PLACEHOLDER [LOCATION] ("Bought at Tanner & Wells in [LOCATION]"); phone [PHONE].
- DROP: the "them: best number..." / "me: 07700 900646, after 5 pm please." exchange — contact not in task list; candidate DROP low-medium; keeping with [PHONE] also fine.
- Expected: transcript with [LOCATION] and [PHONE] (or contact lines dropped).

## RD-13 (formal complaint to letting agent)
- Entities: "Ayesha Malik" PERSON; "14 Linden Court, Flat 3B" ADDRESS; "Rohan" PERSON (contractor); "Anjali Deshpande" PERSON (neighbour); "Nusrat Chowdhury" PERSON; HEALTH (asthmatic, cough, doctor not linked); "950" FINANCIAL; dates.
- Required: "first reported on 9 September (your system wrongly shows a later date)"; "came on the 16th"; "blocked gutter"; "black mould along 1.2 m"; "neighbour ... has the same problem"; "I'm asthmatic and the cough has got worse, though my doctor hasn't yet linked the two"; "firm repair date in writing"; "rent of 950 is paid up to date".
- Decisions: aliases [PERSON_1..4]; ADDRESS PLACEHOLDER [ADDRESS]; HEALTH/FINANCIAL/DATE KEEP. No DROP.
- Expected: "Dear [PERSON_1],\n\nI'm writing about the damp in the bedroom of [ADDRESS], which ... Your contractor, [PERSON_2], ... my neighbour next door, [PERSON_3], ... Regards,\n[PERSON_4]".

## RD-14 (phone plan cost comparison; no private data)
- Entities: none private. Vodafone/Three public companies (not private entities).
- Required: "20 GB plan at 12 a month"; "unlimited plan at 21"; "both 24-month contracts, I think, though the unlimited one might be 12"; "assuming I never go over the cap"; "show the sums".
- DROP: none (usage figures harmless; low-confidence candidate only).
- Expected: identical to input.

## RD-15 (visa checklist: bring / ask someone / check)
- Entities: "Fenwick Labs" ORG; "software tester ... for 4 years" EMPLOYMENT; "Imran Qureshi" PERSON (HR); "Sunita Bhattarai" PERSON (sister); amounts/sizes.
- Required: "12th, no, the 21st, check the email"; "valid for 6+ months"; "35 x 45 mm, not smiling"; "last 3 months, balance of at least 4,500"; "Fee: 85 by card at the desk, no cash"; "ask ... in HR for the signed copy"; invitation letter + residence permit copy.
- Decisions: Imran Qureshi [PERSON_1]; Sunita Bhattarai [PERSON_2] ("my sister, [PERSON_2]"). Fenwick Labs / tester / 4 years: uncertain — not strictly needed for a checklist; KEEP acceptable (describes the letter), PLACEHOLDER [ORG] also defensible. Lean KEEP, low confidence. No DROP.
- Expected: full text with the two aliases.

## RD-16 (school-trip checklist for family chat)
- Entities: "Tashi" PERSON (child, x2); "9" AGE; "Oakfield Primary" ORG; "Mr Iyengar" PERSON (teacher); "Marrick Roman fort" public site (benign, KEEP); dates/times/money.
- Required: "visits the Marrick Roman fort on the 17th"; "signed and returned by the 10th"; "6 for the coach, exact change, no cards"; "leaves at 8:15"; "back around 3:30, no, 4:00 per the letter"; "nut-free (school rule)"; "waterproofs even if it's dry"; teacher will text, keep phone on.
- Decisions: Tashi ALIAS [PERSON_1]; AGE 9 PLACEHOLDER [AGE] (not needed; family knows); Oakfield Primary PLACEHOLDER [ORG] (not needed); Mr Iyengar ALIAS [PERSON_2] (keep "The teacher," role). "Year 4" not an entity, keep.
- DROP: none ("Tashi is 9..." sentence contains the trip date).
- Expected: "...about [PERSON_1]'s school trip. [PERSON_1] is [AGE], Year 4 at [ORG], and the class visits the Marrick Roman fort on the 17th. ... The teacher, [PERSON_2], said ...". (Unsure whether "Mr" should stay outside the alias; I'd alias "Mr Iyengar" whole or keep "Mr [PERSON_2]" — either fine if consistent.)

## RD-17 (reading pace; no private data)
- Entities: none. Authors/titles are public citation names — not PERSON entities.
- Required: "272 pages"; "541 pages"; "3 weeks, so 21 days"; "30 pages a day on weekdays"; "only 15 at weekends, or maybe 20, I'm not sure".
- DROP: none.
- Expected: identical to input. (Check if writer annotated author names: that would be a false positive.)

## RD-18 (allotment volunteer plan; keep every number and correction)
- Entities: "Rohan Chaudhary" PERSON (consultant); "Sanjay" PERSON (brother); "Farhana" PERSON (neighbour); HEALTH (surgery, 3 nights, lifting limit, wound); quantities.
- Required: "3 nights after the surgery"; "anything over 5 kg for six weeks"; "2 days he's off (not 3)"; "Saturdays"; "broad beans (50 g)"; "about 40, maybe 45"; "Nothing heavy until week 7, so the compost delivery has to wait"; "back on the plot by week 8 if the wound heals normally".
- Decisions: Rohan Chaudhary [PERSON_1] ("The consultant, [PERSON_1], says"); Sanjay [PERSON_2] ("My brother [PERSON_2]"); Farhana [PERSON_3] ("[PERSON_3] next door"); HEALTH KEEP (task demands every number; surgery context explains the constraints). No DROP (first sentence holds numbers).
- Expected: text with three aliases, everything else verbatim.

## Cross-item notes
- Task-swapped pairs must have identical entity spans/labels; only decisions/drops differ.
- Recurring uncertainty: contextual reasons not explicitly requested (knee operation in RD-06, night-shift nurse RD-11, employer RD-15, contact lines RD-05/RD-12). I will not reject a writer choice in these zones unless output is damaged or the choice contradicts the task.
