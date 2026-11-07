# A full fictional hackathon day — frozen v2 scenario

Declared 7 November 2026 before generation or publication. User requested removal of the large map marker and populated night/midday/afternoon/evening, including a playful Alko trip. v1 stays immutable. This is a new invented population, not v1 records with extra trips or a new noise draw of v1.

- Release `kupittaa-day-v2`; seed 2026110702; 2,000 background and 10,000 attendee cards, distinct `DAY-` namespace. No real people or linkage to v1.
- Same public rectangular domain, fixed illustrative 2025 period, two invented event weekdays (30–31 October), unchanged card-level caps and epsilon 1. Dedicated ledger scoped to the independently invented v2 population. Never use this as permission to split/reset accounting for overlapping real populations.
- Morning: all attendees travel from dispersed homes to Kupittaa (TRK-G14).
- Midday: attendees go to a fictional lunch area (TRK-G12), then return to Kupittaa.
- Afternoon: attendees leave Kupittaa for home.
- Evening: 80% make a fictional “Alko run” to a declared shopping area (TRK-G08); others go to a food area (TRK-G09). These are scenario labels, not identified shop locations, actual customers or business-opening claims.
- Night: 60% of attendees take an afterparty-to-home journey from TRK-G13. Their daily synthetic chain starts there and ends there in the evening; this intentionally simplified overnight closure is not a validated inference model.
- Background: weekday commute and lunch chains, 45% daily activity. Synthetic attendance is deliberately exaggerated, not an estimate of Since AI turnout. No street- or line-level occupancy truth is claimed.

Freeze validation: report raw inferred and protected target sums, ranks and conservative noise bounds for each of five moments. Primary visual criterion: each target remains in the protected top three for its specified direction/band. Secondary: each target lower noise bound >0; failures remain visible. Report global fine-pair WAPE and cap loss separately. No seed changes/redraws after observing results; no universal accuracy claim.

UI: no event pin. Named area and direction in the side panel. Whole-city exploration remains available. An explicit “Follow the day” mode connects the five time bands to their declared story destinations/origins; its active state must be visible and exit-able. Manual area/direction/line selection exits the mode. Use one fixed heat scale across bands; do not brighten each band independently.
