# Judge Q&A: short answers

Plain-language answers for live questions. They are consistent with `evidence/DEMO_FACTS.md` (the technical version) and `SUBMISSION.md`. All numbers come from the synthetic test data.

**What does it do, in one sentence?**
A bus company publishes where and when people travel as open data. It shares only three tables of noisy, capped counts, never anyone's journeys. Trip destinations are inferred from where the same card next boards, not observed.

**Why not just remove the names?**
Four sightings (a stop and an hour) still pick out 97.5% of travel cards in de-named rows (a fixed group of 1,000 cards; the organisers' own sample gives 97%). With k ≥ 5 suppression it is still 87% of the cards left. So we share no rows at all.

**What does ε = 1 mean?**
Take two versions of the data: one with a travel card and all its records, one without it, and everyone else unchanged. Anything the release could show is at most 2.7 times more likely with one version than with the other. Someone who knew every other record and was 50/50 on whether that card is in the data could get to at most 73%. Swapping one card's whole history for another history is two such steps, so 2ε (at most 7.4 times). It protects each card for this one 4-week release. A person with two cards gets twice the ε.

**Your organisers' scores are 0.00 / 0.00 / 0.77. Is the data useful?**
Not for everything, and we say so. Those scores use per-cell relative error, which strongly penalises low-count cells, and small cells are mostly noise. A narrower synthetic planning test holds up (this is not proven value for a real bus service):
- the morning top 3 routes matched the exact data, with the same top 3 in 100 of 100 noise re-runs;
- daily totals track the exact ones closely;
- town-level routes have about 14% volume-weighted error.

Area routes miss our own 20% error target (25%). That is a known limit, not hidden.

**Why are the numbers lower than the real counts?**
Each card counts at most 32 trips. In the synthetic test, after capping and noise together, the ten busiest morning routes were 8–18% below their exact inferred counts. The ±571 noise range covers only the random noise around the capped counts; it does not include what the cap removes.

**What about night routes?**
Most are small enough to be pure noise. The planner says so (grey routes, "could be pure noise") instead of pretending.

**What does the AI do? Isn't giving data to an AI risky?**
No operator records or release counts are sent to the AI. Your typed question is sent as written, with the public area list, so don't type personal details. Claude only turns the question into one checked request (time of day, start area, how many routes). The app's own code computes the answer from the published tables. The column scanner uses rules, no AI.

**Is it certified or legally anonymous?**
No. The two builder agents reviewed each other's code and ran tests (issue #3). There has been no professional audit, and the GDPR Recital 26 argument needs legal review. The release still says "pending review".

**Did you just pick a lucky release?**
No. We published once and kept it unchanged. A predeclared search over eight policies found none that met every target; we report that.

**What if they publish every month?**
Each release spends another ε: 12 monthly releases means ε = 12 for a card in all of them, or 24 for someone with two cards. A real operator needs a yearly budget and a way to link one person's cards.

**Why noise instead of hiding small cells (under 10 trips)?**
Hiding cells can be undone when several overlapping tables are published, and a cell of 11 can still confirm a known commuter. Noise has a stated guarantee that adds up predictably across releases. We did not measure the suppression alternative.

**Membership attack?**
In a simulation with three preselected synthetic cards, an attacker who knew every other record and the target card's whole history caught 1.5–2.2% of members at about 1% false alarms. Guessing catches 1%. That is one specific attack, not proof of zero risk.
