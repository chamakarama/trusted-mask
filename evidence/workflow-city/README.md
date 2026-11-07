# City workflow implementation evidence — 7 November 2026

This is a working local demonstration, not a validated transport-planning product. PR #12's generator was integrated without changing its population model, seeds or source. The actual city publication and both map layers use its predeclared demo population.

## Reproducible result

- Input: seed `20251106`, 20,000 cards, 18,000 people, 767,122 taps, 50 fictional public stops, 25 fixed artificial grid zones. All seven generated file hashes and sizes matched the generator's frozen demo evidence; a separate reviewer checked the match.
- Publisher source: `2403621`. Artifact: [`releases/city-turku-v1`](../../releases/city-turku-v1/manifest.json), manifest SHA-256 `2a1735f0221db33868959c03db16007ad0f1b9bb4cf808b9893e0c7c1add292c`.
- Exactly one committed production publication, epsilon 1 under the existing card-level caps and family split. The original private ledger is retained under `private/workflow-review/`. New workbenches reuse the committed artifact when input fingerprints match; they do not spend again. Interrupted reservations still require accounting review.
- ZIP SHA-256: `f55edee0a3e43a4180312719f1e9aec833db11f2faed726a83f5b9f0c9df38fe`. It contains exactly the nine release files; no records, truth or scanner inventory.
- The original Aura release is byte-for-byte unchanged. Its manifest SHA remains `bcd8b07aca896ffdbeb1a8695beea709642bafacc464e289f4e276d55f8c184d`.

## Utility fails the broad target

The actual city release has **31.2% OD WAPE**, missing the 20% target; cap loss is **17.3%** and morning top-three overlap is **2/3**. Full family values and exact evaluation identity are in [candidate-evaluation.json](candidate-evaluation.json). Those errors compare the protected result with inferred journeys, not observed true destinations.

[utility-simulation.json](utility-simulation.json) retains all six declared 20,000-card populations and 100 independent distribution simulations per population. **0/600 meet the 20% OD error target; midday fails the stated decision criterion in 600/600.** No failed seed/time band was dropped. This evaluates OD only. Difference-of-geometric sampling represents the discrete Laplace law; it is not an additional release, runtime validation of OpenDP, or a test of line-hour/daily utility. Its fixed simulation seed is independent of production randomness.

`mean_top3_uncertain_count` counts selected cells whose noise interval around the bounded count includes zero. It is **not** ranking confidence. The simultaneous per-cell radius is 590; area sums use conservative sums of those radii. These intervals exclude cap loss and destination-inference error.

Generator evidence separately reports approximately 7.59% true-destination-area accuracy for the demo's split-journey two-card users. That failure remains separate from privacy-noise error. Closed single-card chains are deliberately optimistic; artificial activity does not establish actual Turku demand.

Reproduce the distribution study:

```bash
.venv/bin/python -m evaluation.city_utility --demo-input simulation/private/workflow-demo-20251106 --report evidence/workflow-city/utility-simulation.json
```

The evaluator validates population seed/config/card count, records NumPy version and source hashes, and never imports a publisher or operates a ledger. This can take several minutes and creates missing confirmation populations in ignored directories.

## Verification scope

- 70 Python checks across privacy, workflow, scanner and generator; 41 frontend checks across contract, arithmetic and flow semantics.
- Python and browser independently accept the actual city release; wrong geometry/domain, path traversal, null signed counts, corrupted archives, changed scanned input, stale approval and failed evaluation have regression coverage.
- Two independent read-only reviews found and verified fixes. A reviewer reproduced the complete demo simulation metrics and checked all six populations against frozen file hashes. This is builder review, not professional certification.
- Both static builds pass. The public build boundary permits only static assets, two schemas, approved synthetic evidence and nine files per release. No operator page, raw/truth directory or private endpoint is included.
- Existing dependency advisories were resolved with MapLibre 6.16.0 and Vitest 5.1.0; npm reported zero known vulnerabilities after updating. This is a point-in-time audit, not a security guarantee.
- Browser QA exercised real owner actions, actual publication/reuse, map loading, tile/worker failure fallback, search, directional selection, time profiles and shortlist actions. Rendering bugs found in QA were fixed, including the collapsed map container, missing worker bundle and crowded primary controls. Release reads are bounded to three concurrent requests after a local static-server connection drop was reproduced; a loader regression verifies the real city artifact under that limit. CSV and HTML downloads were checked for both a saved area and directional connection, with the exact release identity retained.

## Open gates

The artifact is for an exploratory local demonstration. Broad utility remains failed. No claim is made for street-level routes, congestion, real-city service recommendations, production authentication/approval, a completed video, deployment, external submission or an unfamiliar-user study. Mobile layout and keyboard/screen-reader checks need a fuller human pass. Basemap tiles require a network connection; the area list remains the fallback. The map and worker remain large deferred downloads.

## Route view correction

The latest view replaces zone arcs with street-following demand over public Föli bus geometry and makes that the default. Analysis zones are an advanced view. See [route-network.md](route-network.md) for provenance, assumptions, 45 frontend checks and the 47-file public build check. [Current screenshot](street-routes.png). Earlier `travel-demand.png` records the superseded arc view. No actual route-choice or bus-capacity accuracy is claimed.

## Narrower task and visible privacy boundary

The prospective [protocol](../../planning/UTILITY_RECOVERY_PROTOCOL.md) was committed as `fe1f24c` before generating three new 20,000-card populations (7071101–7071103). [All results](planning-utility.json) retain every band and both directions. The morning destination-area shortlist met its declared criterion in **300/300** distribution draws: at least two of the exact top three and no more than 10% selection regret. Exact 3/3 agreement occurred in **256/300** draws. This varies populations within the same generator, not across real-world settings or different models.

Absolute area counts still fail: median morning destination WAPE is 22.9–23.4% across these populations, with 0/300 draws meeting 20%. The actual immutable release retains 2/3 morning destinations with 0.19% selection regret and 22.6% area WAPE. Other tasks fail, including the actual midday destination top-three criterion. The earlier 31.2% fine-pair count failure and 600-draw study remain unchanged.

The planner now exposes this specific task through **Morning priorities → inspect routes → save shortlist → export**. These priorities use released signed counts only. The owner workbench has five visible stages: Private input, Purpose, Protect, Check, Share. It shows three actual source rows beside actual protected recipient records and compares the private exact shortlist against the released shortlist. Private source rows and exact reference counts are never included in the static recipient build. The recipient-preview endpoint verifies the release before reading its output; stale or altered output is rejected. Evaluation approval now includes the task-scoring source identity.

Verification for this change: **75 Python tests, 45 frontend tests**, both builds, and the 47-file public boundary check pass. The complete owner flow reused the original artifact; the deterministic package SHA remains `f55edee0a3e43a4180312719f1e9aec833db11f2faed726a83f5b9f0c9df38fe`. Browser checks covered the morning priorities and saving all three; a 390×844 viewport showed no horizontal overflow. This is a responsive smoke check, not a full accessibility or unfamiliar-user study. [Planner screenshot](morning-priorities.png).

Reproduce the new study with `.venv/bin/python -m evaluation.planning_utility` and the frozen protocol. No production publication or ledger operation is performed by that evaluator.

The browser also verified the owner’s actual recipient records and private exact-versus-protected task comparison. [Boundary screenshot](private-to-shared.png).
