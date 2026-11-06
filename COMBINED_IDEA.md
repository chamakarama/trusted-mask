# Combined idea: RouteSafe + scanner

**Proposal for the team to review.** Comments welcome.

## In one line

RouteSafe stays the demo. A scanner that understands any dataset becomes its first step, so we cover all four steps of the brief, not just the last two.

## Why combine

- **RouteSafe alone:** great story and map, but the brief's first two steps are thin: detecting data types, and picking a technique per data type and scenario. Judges could see "one technique on one dataset".
- **Scanner alone:** strong detection, but no product story.
- **Together:** every step of the brief has something strong behind it.

## How it covers the brief

| Brief step | What we show | Part |
|---|---|---|
| 1. Detect | Every column of the bus data labelled with a reason, e.g. "card_id: links all of one person's trips" | Scanner (built) |
| 2. Select | The plan changes with the recipient. MOB-S1 (public): capped noisy statistics. MOB-S2 (consultancy): rows with weekly-rotating keyed pseudonyms and rounded times | Scanner + RouteSafe |
| 3. Transform | The protected release bundle | RouteSafe |
| 4. Demonstrate | Attack before/after, the same top corridors, error numbers | RouteSafe |
| Bonus | Same scanner on the mystery HR file: "works on data it has never seen" | Scanner |

## Demo (max 2 min; deadline Sun 10:00, per Mark's plan)

1. **0–15 s:** the problem. A few sightings reveal a card's whole travel history.
2. **15–35 s:** the scanner labels the bus data, with reasons.
3. **35–50 s:** pick who gets the data, and the plan changes (statistics vs pseudonymised rows).
4. **50–95 s:** RouteSafe release and planner map. The top corridors stay the same, and the error is shown.
5. **95–110 s:** the mystery file. It finds names, ID codes and bank accounts, and cracks a hashed ID column.
6. **110–120 s:** honest limits.

## Already done (on Vaishnav's machine, not pushed yet)

- A rule-based scanner. It uses no AI and runs locally.
- **On the organisers' answer key:** macro-F1 0.87, against 0.65 for their own baseline scanner. It finds 92% of sensitive columns, against 73% for the baseline. Caveat: the rules were written with the answer key visible, so real-world accuracy will be lower.
- **On the mystery file:** it finds every identifier (name, ID code, birth date, address, phone, email, IBAN, plate).
  - Column `c20` is an unsalted SHA-256 of the ID code, cracked for 2,111 of 2,818 rows.
  - It still misses salary, union membership, sick days and job title when the column names are hidden.

## Who does what (keeps Mark's roles)

- **Mark + Astra:** RouteSafe pipeline, privacy, evaluation. Unchanged.
- **Vaishnav + Opus:** the scanner and plan step, then the map app and demo, as in Mark's plan.
- **Hand-over:** the scanner writes a field inventory (`column, role, subtype, reason`) that the operator view displays.

## What we drop

Health, free-text cleaning and the other sectors. Focus beats breadth.

## AI and data safety

No raw data goes to any cloud AI. Rules do the detection. The only AI steps:

1. RouteSafe's planner helper, which only sees published statistics.
2. An optional hint for unclear columns. It only sees a safe summary (column name, type, a few non-personal category values like `AY-HL`), or it runs locally.

## Questions for the team

1. Is the MOB-S1 vs MOB-S2 switch worth about 3 hours, or do we show only MOB-S1?
2. Do we keep the 15-second mystery-file moment?
3. Is it OK to push the scanner code as `petpilot/`, separate from Astra's `pipeline/`?
