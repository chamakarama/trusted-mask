# RouteSafe demo storyboard (≤ 120 s, target 110–115 s)

The recording shows the working product, not slides. Every number on screen comes from the actual release or the evidence summary. Precomputed steps are labelled as such.

| Time | Screen | Narration (short) | Must be true on screen |
|---|---|---|---|
| 0–10 s | Planner header: "Share demand. Keep journeys private." | "A city wants to know where people travel. A passenger shouldn't have to publish their week." | Synthetic data + period label visible |
| 10–28 s | Evidence tab → "Why not share the rows?" | "We tried the obvious fix: delete names. Four sightings at a bus stop still single out 97% of travel cards." | 97.0% B0, 97.4% B2, 90.4% B2-k; "not applicable ≠ 0% risk" |
| 28–46 s | Operator workbench, steps 1–3 | "RouteSafe first scans the operator's data: every column gets a type and a reason. Unknowns are flagged, not called safe. Then the purpose decides the handling: card numbers stay inside, times become bands." | Real inventory (48 columns, review counts); scanner reason vs policy handling |
| 46–58 s | Operator step 2: click the consultancy option | "Ask for row-level histories, and it refuses and offers statistics instead." | `UNSUPPORTED_SHARING_SCENARIO` |
| 58–68 s | Operator step 4 | "It publishes once: each card is capped, then calibrated noise is added. ε = 1, recorded in a ledger." | "previously generated release e1-aura-001"; pending review |
| 68–92 s | Planner → Corridors, morning band; click shortlist #1; ask a preset | "The planner sees only the published tables. Morning demand converges on the centre; here are the three corridors worth a closer look." | Top 3 = 5,491 / 4,565 / 4,183; "inferred · uncertain" labels; refusal for a passenger history |
| 92–106 s | Evidence → decision + error | "Did protection change the decision? The same top three in 100 out of 100 noise draws. Single counts are noisy, about 25% at area level, so we say so." | 3/3, 100/100, 25.1% with the missed target shown |
| 106–115 s | What was shared? → download | "Everything shared is downloadable and checked against its manifest. No rows, no card numbers, no exact times." | Download list; limitations |

Optional (only if the core fits in time; otherwise Q&A backup, ≤ 10 s): scanner on the mystery HR file finds the ID column hidden as a hash (inspected development example, not a blind test).

## Recording checklist
- 1366×768 browser window, zoom 100%, light theme. The fixture release must not be selected (no "fixture" badge on screen).
- Close devtools; no localhost URL bar in the frame if possible.
- Record the stable path once by Saturday 20:00 EET. Keep a local copy and an offline build (`web/dist`).
- Say "synthetic data" at least once and "pending review" for the privacy claim.
