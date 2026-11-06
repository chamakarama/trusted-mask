# RouteSafe demo storyboard (≤ 120 s, target 110–115 s)

The recording shows the working product, not slides. Every number on screen comes from the actual release `e1-aura-001` or from the reviewed evidence summary. Tab names match the final UI: **Where people go · When people travel · Is it safe? · What's shared**, plus the private **operator workbench**.

| Time | Screen | Narration (short) | Must be true on screen |
|---|---|---|---|
| 0–8 s | Planner, *Where people go*, morning | "A bus company wants planners to see where people travel, without publishing anyone's journeys." | Header chips: synthetic data · not yet independently audited · files verified |
| 8–24 s | *Is it safe?* top: red card vs green card | "The usual fix is to delete the names. Four sightings at a stop still pick out 97.5% of travel cards. RouteSafe shares no rows at all." | 97.5% (fixed group of 1,000 cards, 95% ranges); before/after table 97.5 / 97.5 / 87.4% with the organisers' utility scores; "not the same as zero risk" |
| 24–40 s | Operator workbench, steps 1 and 3 | "Inside the company, the scanner reads every column: 4 point straight to a person, 17 can identify someone when combined. Unclear columns go to a person. The release policy decides, not the scanner." | Tiles 48 / 4 / 17 / 11 / 37; *Person check* column; scanner accuracy note |
| 40–48 s | Operator step 2: click the consultancy option | "Ask for everyone's journey rows: that isn't offered. It explains why and offers the statistics instead." | `UNSUPPORTED_SHARING_SCENARIO` |
| 48–56 s | Operator step 4 | "Each card counts at most 32 trips, then random noise is added: ε = 1, recorded once in the publisher's ledger." | ε = 1; pending review |
| 56–80 s | Planner morning: map + shortlist; type a question in *Ask a question* | "Planners see only the published tables. 8 of the 10 busiest morning routes end in Turku area 205. Every number shows its noise range. You can ask in plain words: Claude only picks the request, and the numbers come from the tables." | Map takeaway line; 5,491 / 4,565 / 4,183 with noise ranges (±571, all 2,205 released route numbers at once); "Checked against the exact data" + KPI "100 of 100"; AI answer shows "Read as: Morning 06–09 · from anywhere · top 3" and contains 5,491 |
| 80–92 s | Click *Night* in the time-of-day bar at the top | "It also tells you when not to trust it. At night, every top route is small enough to be pure noise." | Amber "Could be pure noise … about 571 trips"; KPI "No clear busiest route" and "Could be noise"; map routes turn grey and dashed |
| 92–108 s | *Is it safe?* → *How close are the numbers?* and *What ε = 1 means* | "The top three survived 100 of 100 noise re-runs. But area routes miss our own 20% error target, and the organisers' strict scores don't pass. We say so. In plain words: with or without any one card, every result is at most 2.7 times more likely either way." | 25% with the missed target; organisers' scores 0.00 / 0.00 / 0.77; 2.7× (fixed-pair statement) |
| 108–116 s | *What's shared* → downloads | "Everything shared is three protected tables you can download and check. No rows, no card numbers, no exact times." | Download list; "Good for / Not good for" |

Optional (Q&A only, ≤ 10 s): *When people travel*: grey cells are within the noise; "boardings peak at 07–08 and 16–17".

## Recording checklist
- 1366×768 browser window, zoom 100%, light theme. Actual release selected (no "test fixture" chip on screen).
- Start the AI helper first (`npm run assistant` with the key loaded from the local env file, never shown on screen). The badge must say **AI on**. If it is off, use the preset "Busiest morning routes?" and say "preset".
- Close devtools; no localhost URL bar or terminal in the frame.
- Record the stable path once by Saturday 20:00 EET. Keep a local copy and an offline build (`web/dist`).
- Say "synthetic data" at least once and "pending review" for the privacy claim.

Technical rehearsal: narration is about 235 words (94 seconds at 150 words/minute, before pauses/clicks). Record an actual timed take; this arithmetic is not a verified video duration. Main now includes the full-inventory scanner sweep (6 exact roles, 2 appropriate abstentions, 0 silently-safe results on the eight-column probe) and the reviewed E7 fixed-pair simulation. The short video may leave E7 for Q&A; preserve the central utility failure disclosure.
