# Devpost write-up (DRAFT, not submitted)

Paste-ready text for the Devpost story sections. The team lead checks it, adds the team names, video link and repository link, and submits. Every number matches `SUBMISSION.md` (synthetic test data).

## Inspiration
Bus companies hold tap data that could show planners where people really travel. But even with names removed, 4 sightings at a stop pick out about 97% of travel cards. We wanted a way to share the useful part without sharing anyone's week.

## What it does
RouteSafe turns raw bus taps into an open-data release of protected counts:
- **Scan (private):** a rule-based scanner labels every column (identifies a person, identifies in combination, sensitive, unknown) and says why. Unclear columns go to a person.
- **Protect (private):** each travel card counts at most 32 route trips; then differential-privacy noise is added (OpenDP, ε = 1 per card for the 4 weeks). The spend is recorded once in a budget ledger.
- **Publish and explore (public):** only three tables leave: routes between areas per time of day, boardings per line and hour, and taps per day. The planner checks every file before showing it, then shows:
  - a map and a top-3 route shortlist with noise ranges;
  - warnings where numbers could be pure noise;
  - a "rows vs RouteSafe" safety page;
  - plain-language questions answered by Claude. Claude only picks a checked request; it never sees the data.

## How we built it
- Python publisher with OpenDP (integer Laplace) and an SQLite ledger, producing an immutable, checksummed release bundle.
- React + TypeScript planner that validates the bundle in the browser. MapLibre street map with an offline diagram fallback.
- A rule-based column scanner (`petpilot`) with a full-column identifier sweep.
- A local helper that calls Claude Opus 5.5 with structured output, so the model can only return a typed request.
- Two AI coding agents built it under the team's direction and reviewed each other's work in a public coordination issue: browser regressions, numeric checks against the CSVs, and privacy tests.

## Challenges we ran into
- **Honesty about noise.** Small routes are mostly noise. Night routes looked like real demand until we added selection-valid noise ranges (±571 across all 2,205 released route cells) and "could be pure noise" warnings.
- **The per-card cap** makes busy routes read low (the ten busiest morning routes were 8–18% below exact after capping and noise), so we show that too.
- Our privacy wording had to be precise: what ε does and doesn't promise.

## Accomplishments that we're proud of
- The morning top 3 routes stayed the same in 100 of 100 noise re-runs, while no rows, card numbers or exact times were shared.
- The app tells planners when *not* to trust a number.
- Every claim on screen traces to a committed evidence file.

## What we learned
Removing names is not anonymisation. Useful protection means choosing what question the data must answer (here, a morning shortlist) and being upfront about what it can't answer. Our area-level error (25%) misses our own 20% target, and the organisers' strict per-cell scores don't pass.

## What's next
- A reviewed final policy and weekly releases with a yearly budget.
- Person-level accounting with an authorised card-to-person mapping.
- An independent privacy audit and legal review.

## Built with
Python · OpenDP · SQLite · TypeScript · React · Vite · MapLibre GL · Claude (Anthropic API) · synthetic data from the TrustED PETs Proving Ground 2026 (Since AI ry, CC BY 4.0)
