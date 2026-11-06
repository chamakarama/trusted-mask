# RouteSafe demo storyboard (≤ 120 s, target 110–115 s)

The recording shows the working product, not slides. Every number on screen comes from the actual release `e1-aura-001` or from the reviewed evidence summary. Tab names match the final UI: **Where people go · When people travel · Is it safe? · What's shared**, plus the private **operator workbench**.

| Time | Screen | Narration (short) | Must be true on screen |
|---|---|---|---|
| 0–8 s | Planner, *Where people go*, morning | "A bus company wants planners to see where people travel, without publishing anyone's journeys." | Header chips: synthetic data · not yet independently audited · files verified |
| 8–24 s | *Is it safe?* top: red card vs green card | "The usual fix is to delete the names. Four sightings at a stop still pick out 97.5% of travel cards. RouteSafe shares no rows at all." | 97.5% (fixed cohort, 95% ranges); before/after table 97.0 / 97.4 / 90.4%; "not the same as zero risk" |
| 24–40 s | Operator workbench, steps 1 and 3 | "Inside the company, the scanner reads every column: 4 point straight to a person, 17 identify someone when combined. Unclear columns go to a person. The release policy decides, not the scanner." | Tiles 48 / 4 / 17 / 11 / 37; *Person check* column; scanner accuracy note |
| 40–48 s | Operator step 2: click the consultancy option | "Ask for everyone's journey rows, and it refuses and offers statistics instead." | `UNSUPPORTED_SHARING_SCENARIO` |
| 48–56 s | Operator step 4 | "Each card counts at most 32 trips, then random noise is added: ε = 1, recorded once in the publisher's ledger." | ε = 1; pending review |
| 56–80 s | Planner morning: map + shortlist; type a question in *Ask a question* | "Planners see only the published tables. 8 of the 10 busiest morning routes end in Turku area 205. Every number shows its noise range. You can ask in plain words: Claude only picks the request, and the numbers come from the tables." | Map takeaway line; 5,491 / 4,565 / 4,183 with ±161; "Checked: same top 3 … 100 of 100"; AI answer contains 5,491 |
| 80–92 s | Click *Night* in the time bar | "It also tells you when not to trust it. At night, every top route is small enough to be pure noise." | Amber "Could be pure noise … about 483 trips"; KPI "Could be noise" |
| 92–108 s | *Is it safe?* → *How close are the numbers?* and *What ε = 1 means* | "The top three survived 100 of 100 noise re-runs. But area routes miss our own 20% error target, and the organisers' strict scores don't pass. We say so. In plain words, ε = 1 means the release can change anyone's odds about one card by at most 2.7 times." | 25% with the missed target; organisers' scores 0.00 / 0.00 / 0.77; 2.7×, 50% → 73% |
| 108–116 s | *What's shared* → downloads | "Everything shared is three protected tables you can download and check. No rows, no card numbers, no exact times." | Download list; "Good for / Not good for" |

Optional (Q&A only, ≤ 10 s): *When people travel*: grey cells are within the noise; "boardings peak at 07–08 and 16–17".

## Recording checklist
- 1366×768 browser window, zoom 100%, light theme. Actual release selected (no "test fixture" chip on screen).
- Start the AI helper first (`npm run assistant` with the key loaded from the local env file, never shown on screen). The badge must say **AI on**. If it is off, use the preset "Busiest morning routes?" and say "preset".
- Close devtools; no localhost URL bar or terminal in the frame.
- Record the stable path once by Saturday 20:00 EET. Keep a local copy and an offline build (`web/dist`).
- Say "synthetic data" at least once and "pending review" for the privacy claim.
