# RouteSafe

**Bus demand without passenger histories.** RouteSafe lets a transport operator publish where and when people travel as open data, without publishing anyone's journeys. Built for the TrustED *PETs Transformer* challenge at Since AI Hackathon 2026 (scenario MOB-S1, synthetic Turku-region data).

## The problem in one number

Deleting names is not enough. In a test on 1,000 synthetic travel cards, **4 sightings (a stop and an hour) pick out 97.5% of cards** in de-named tap records, and still 87.4% of the 922 eligible cards with k ≥ 5 suppression (the organisers' own sample gives 97.0% and 90.4%). So RouteSafe shares **no rows at all**.

## What RouteSafe does

1. **Scan (private).** The `petpilot` scanner reads every column of the operator's data and says what it is (identifies a person / identifies in combination / sensitive / unknown) and why. It uses rules, no AI, and nothing leaves the machine. Unclear columns go to a person.
2. **Protect (private).** The publisher counts trips per route (destinations are inferred from where the same card next starts a journey, not observed), boardings per line-hour and taps per day. Each travel card counts at most 32 / 64 / 64, then OpenDP adds random noise (differential privacy, total ε = 1 per card). The spend is written once to a budget ledger.
3. **Publish and explore (public).** Only three tables of protected counts leave, as a checksummed bundle. The planner checks every file in the browser before it shows anything.

## What you see in the planner

- **Where people go:** map and shortlist of the busiest routes per time of day, each with its ±noise range. It says when routes are too small to trust ("could be pure noise", e.g. at night). You can also ask in plain words: Claude only picks one typed request, and every number comes from the published tables.
- **When people travel:** boardings per line and hour (cells inside the noise are grey), and taps per day.
- **Is it safe?:** sharing rows vs RouteSafe, the exact-data checks, the organisers' scores, and what ε = 1 means in plain words.
- **What's shared:** who it is for, what it is and isn't fit for, our assumptions, and downloads of the exact files.

A separate **operator workbench** (private, never published) shows the scanner's findings, the per-column handling, and the refusal of row-level sharing.

## Results (synthetic data, honest version)

| Question | Answer | Evidence |
|---|---|---|
| Do planners still get the right shortlist? | Morning top 3 routes = the exact data's (3/3); same top 3 in **100 of 100** noise re-runs. Only weekday mornings were tested. | `evidence/evidence-summary.json` |
| How exact are the numbers? | Each area-level route cell in the planner carries a ±571-trip range for the random noise (95% for all 2,205 released route cells at once). The range does not cover the per-card cap. After capping and noise, the ten busiest exact-ranked morning routes came out 8–18% below their exact inferred counts. Volume-weighted error: routes 25% (**misses our 20% target**), lines 15%, days 7%. | same |
| Organisers' strict utility scores | RouteSafe: routes 0.00 (native MOB-U1), lines 0.00 and days 0.77 (adapted MOB-U2/U3): **not passing**, because small cells are mostly noise. For comparison, sharing de-named rows scores 1.00 / 1.00 / 1.00 but exposes 97% of cards. | same |
| How good is the scanner? | Development (rules tuned on the samples, not blind): macro-F1 0.90, sensitive recall 0.92. Tricky probe: 0 sensitive columns wrongly called safe. | `petpilot/README.md` |

The protection is per travel card for this one 4-week release, under stated assumptions. It is not person-level anonymity: a person with 2 cards counts twice. The manifest says **pending review**, and it has not been independently audited.

## Run it

```sh
cd web
npm ci
npm run sync    # copy the reviewed release from this commit
npm run dev     # planner on http://localhost:5173
```

The suggested questions work without any key. The typed-question helper (`npm run assistant`) needs an Anthropic API key in the environment. Full setup, publisher, tests and evidence commands: [ROUTESAFE_DEVELOPMENT.md](ROUTESAFE_DEVELOPMENT.md) · [web/README.md](web/README.md) · [petpilot/README.md](petpilot/README.md).

## Repository map

| Path | What |
|---|---|
| `petpilot/` | column scanner (inventory, rules, evaluation) |
| `pipeline/`, `privacy/` | private publisher, DP mechanism, budget ledger, privacy argument |
| `releases/e1-aura-001/` | the published release (immutable) |
| `evaluation/`, `evidence/` | synthetic-only checks and their results ([evidence/README.md](evidence/README.md)) |
| `web/` | public planner and private operator workbench |
| `contracts/`, `planning/` | release schema, interfaces, decisions, coordination |
| `SUBMISSION.md`, `demo/` | submission draft and the 2-minute demo script |

Coordination and the executable peer review between the two builder agents are recorded in [issue #3](https://github.com/Chintufp/Since-AI-hackathon---WAWS/issues/3). The pre-build idea is kept as [planning history](planning/ORIGINAL_IDEA.md); its features and numbers are not results.

## Credits

Synthetic data: TrustED PETs Proving Ground 2026 by Since AI ry (CC BY 4.0); postcode centroids from GeoNames (CC BY 4.0). OpenDP (MIT). Map: MapLibre GL JS, OpenFreeMap tiles, © OpenMapTiles, © OpenStreetMap contributors; the tile server never receives release data. Font: Inter (SIL OFL). Notices: `licenses/frontend-third-party.txt`. No TrustED or EU endorsement is implied.
