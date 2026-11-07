# Frozen generator evaluation v1

Declared before confirmation runs on 2026-11-07. This evaluates fictional
population construction and `pipeline.mobility.load/prepare`, not privacy utility.
Generator v1.0.0; configuration `simulation/config/turku-grid-v1.json`.
Frozen file SHA-256: `f345edb769a2e3bdfd72961d54ea0c9a5739e04c711cd56794c0f6216917d7de`.

- Development and demonstration population seed: **20251106**, selected before any protected results.
- Five confirmation population seeds: **271828, 314159, 161803, 141421, 173205**.
- Full scale: exactly 20,000 allocated fictional cards per seed, 18,000 people,
  including 2,000 people with two cards. Actual active cards and event counts are measured.
- Population parameters and seeds stay fixed across all runs. Small unit-test runs
  use the same parameters, with an explicit card-count override.
- Run all six populations; retain all outcomes, including failures. Repeat generation
  for every population and compare every output byte, including metadata and truth.
- Zero privacy-mechanism draws, publisher runs or ledger operations. No release-utility,
  privacy or favourable-result selection claim. No changed privacy parameters.

## Declared checks

1. Exactly 25 counterclockwise rectangular analysis-grid polygons spanning the
   documented bbox; exact four string properties; 50 synthetic interior stops.
2. Every tap and true destination uses the public stop/line domain. Lines serve
   both journey endpoints. No zero-displacement journeys.
3. Valid adapter timestamps/period; positive duration, no person-level overlap,
   continuous actual locations across cards/days, strict per-card chronology;
   Helsinki UTC conversion succeeds across the 26 October DST change.
4. Persistent person/card ownership; one or two cards per person; declared
   scenario proportions within one person of largest-remainder allocation.
5. Weekday commute/comparable morning journeys reverse in the afternoon;
   evening and within-zone journeys exist. Full-scale comparable morning
   destination shares each lie in [0.28, 0.39]; diffuse demand covers all 25
   destinations and no destination exceeds 10%; sparse journeys/person are
   below 35% of commute journeys/person; mean origins per sparse zone are
   below 35% of mean origins per other zone. These are synthetic construction
   checks, not real-city validity or protected-output targets.
6. Existing `load/prepare` succeeds without truth. Its raw counts match independently
   calculated next-origin inference; report raw and bounded totals separately.
   Retain current caps; report inferred-vs-true area accuracy by card strategy.
7. Same config/seed/card count produces byte-identical files; public stops/polygons
   do not depend on population seed or card count.

Tests also corrupt references/timestamps/person chronology to verify that audits
fail, and remove/replace truth to prove production preparation does not read it.

No transfers, duplicate taps, missing stop references or overnight journeys are
injected into the clean production dataset. Invalid-input behaviour is exercised
separately in tests. No 100-draw privacy experiment from the broader redesign plan
is attempted; privacy evaluation belongs to the other chat's scope.
