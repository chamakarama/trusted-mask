# Synthetic city generator: measured results

Completed on 7 November 2026. **All travel activity, people, cards, stops and lines are fictional.**
The geography is a declared Turku map extent divided into synthetic rectangular analysis-grid zones,
not neighbourhood boundaries. No observed real-city demand or protected release is represented.

All six predeclared full populations passed every construction/adapter check in
[the frozen protocol](PROTOCOL.md), and all output files were byte-identical on an
independent regeneration of each seed. Public stops, polygons and configuration
were also byte-identical across all six populations. Full hashes, sizes and
aggregate diagnostics are in [results.json](results.json). No seeds were selected
or discarded based on protected results; mechanism draws, publisher runs and ledger operations were all **zero**.

## Counts and adapter results

Each population allocates **20,000 cards to 18,000 people**: 16,000 single-card
people, 1,000 alternating-day two-card people and 1,000 split-journey two-card
people. Inactive cards remain in person/card truth; activity is not forced to a target.

| Seed | Active cards | Boardings / true journeys | Weekday raw OD | Bounded OD | Split-card inferred-area accuracy | Output bytes |
|---|---:|---:|---:|---:|---:|---:|
| 20251106 (demo) | 19,982 | 767,122 | 645,004 | 533,276 | 7.59% | 144,497,672 |
| 271828 | 19,974 | 766,536 | 644,424 | 532,570 | 8.67% | 144,387,549 |
| 314159 | 19,981 | 767,004 | 645,012 | 532,192 | 9.52% | 144,474,754 |
| 161803 | 19,984 | 766,124 | 644,390 | 533,180 | 8.51% | 144,313,976 |
| 141421 | 19,982 | 767,332 | 644,936 | 533,196 | 7.85% | 144,537,068 |
| 173205 | 19,982 | 768,442 | 645,928 | 533,516 | 8.02% | 144,746,440 |

OD and line/hour preparation use weekdays; daily preparation includes all 28 dates.
Every clean weekday boarding survives the adapter's one-hour gap filter. Unchanged
card caps apply over the entire period. This measures preparation, not protected counts.
Area inference is 100% for single-card and alternating-day cohorts in every seed,
because the model deliberately uses clean closed daily chains. The poor split-card
result demonstrates that continuous person journeys need not be recoverable from
card-local boardings. These results do not establish real-passenger inference accuracy.

## Scenario checks

| Seed | Comparable morning destinations G12 / G13 / G14 | Max diffuse destination share | Sparse / other mean origins per zone | Within-zone journeys (all cohorts) |
|---|---|---:|---:|---:|
| 20251106 | 20,983 / 20,780 / 20,215 | 4.62% | 0.165 | 73,007 |
| 271828 | 20,474 / 19,890 / 21,553 | 4.54% | 0.163 | 73,070 |
| 314159 | 21,241 / 20,324 / 20,338 | 4.49% | 0.162 | 73,099 |
| 161803 | 21,241 / 19,996 / 20,528 | 4.67% | 0.164 | 73,257 |
| 141421 | 19,454 / 21,865 / 20,489 | 4.46% | 0.167 | 73,177 |
| 173205 | 20,511 / 20,911 / 20,590 | 4.55% | 0.167 | 73,264 |

All seeds meet the predeclared comparable-destination share range (28–39% each),
diffuse maximum destination share (<10%, all 25 destinations represented), sparse
activity checks (<35% of the corresponding dense comparison), weekday reverse-trip
checks, and evening/within-zone coverage checks. No overnight demand is generated.

## Demo file sizes

| File | Bytes |
|---|---:|
| `configuration.json` | 2,755 |
| `metadata.json` | 7,481 |
| `public-zones.geojson` | 20,914 |
| `stops.csv` | 5,190 |
| `taps.csv` | 54,260,712 |
| `truth/journeys.csv` | 88,961,689 |
| `truth/person-cards.csv` | 1,238,931 |

The six retained populations occupy **866,957,459 bytes** (866.96 MB; decimal).
Sizes include metadata/configuration, observations, references and truth. Temporary
repeat outputs were removed after matching; small development/test outputs are excluded.
All raw/truth/metadata outputs are ignored under `simulation/private/`.

## Reproduction and provenance

- Repository base: `a6d0d53abcb14e553def40865f36bea032294e49` (`main` at task start).
- Design read: `planning/PLANNER_WORKFLOW_REDESIGN.md` on
  `codex/planner-workflow-redesign-plan` at `a7b097a13931c29cf7b1cca841aafd91669d8ef3`.
- Frozen configuration/protocol commit: `7365571`; generator/evaluator under test:
  `fdc2ddfc5638951796c81f4093f67c4f02bff286`. Subsequent commits add reports/documentation only.
- Frozen configuration file SHA-256: `f345edb769a2e3bdfd72961d54ea0c9a5739e04c711cd56794c0f6216917d7de`.
- Generator source SHA-256: `a411e783601cf8d5c7034420d6945fa0f3fd7206469b45b16e41a0145ae311a4`.
- Evaluator source SHA-256: `0a9c0880aeefe92d69f30dd77c32287791212f78c1ff02b709d987bf2072c27c`.
- Unmodified production `pipeline/mobility.py` SHA-256:
  `523478f5a3bee1f898d0c90d8989b50b284f7c426dab3c28ad0bb231a77f6af1`.
- Runtime: Python 3.12.3, pandas 3.1.1, numpy 2.5.4.
- Generator uses standard-library `random.Random(population_seed)` only. Source and
  config fingerprints in metadata are separate from any production release identity.

The committed JSON file hash above fingerprints its original formatting; each output
metadata file also records the hash of the canonical sorted configuration copy.
Both forms generate identical output; the test suite verifies canonical-config replay.

Exact full evaluation command, run from the isolated repository root:

```sh
/Users/markp/Code/sinceai-trusted/.venv/bin/python -m simulation.evaluate --output-root simulation/private/confirmation-v1-verified --report evidence/city-generator/results.json
```

Generate the demo alone in a fresh ignored directory:

```sh
python -m simulation.generate --config simulation/config/turku-grid-v1.json --seed 20251106 --cards 20000 --output simulation/private/turku-grid-v1-seed-20251106-cards-20000
```

Validation: `python -m pytest -q tests/simulation` — **16 passed**. Tests cover
repeatability, canonical-config replay, geometry/reference membership, chronology
across DST and card changes, scenario balance, observation/truth correspondence,
corrupt-input rejection, no overwrite/nonprivate output, and actual production
`load/prepare` with truth absent or replaced by invalid canaries. Only preparation
was tested; no privacy tests that draw mechanisms or operate ledgers were run.

Development interruptions: an initial demo generation stopped after 382,226
boarding rows to replace slow timezone-aware `strftime` calls. A second attempt
finished generation but was interrupted during preparation to fix JSON key-order
dependence when replaying a canonical configuration. Neither attempt completed
a population audit; neither produced protected results. Parameters and seeds were
unchanged. Observation/truth/reference/config bytes matched before/after the timing
optimisation on the 240-card development run, and before/after the key-order fix
on the complete demo. The six completed runs above use the final committed code.

## Integration issues and limitations

- `load/prepare` accepts observations without truth or polygon metadata. It returns
  Point centroids. Current `pipeline.artifact.verify` rejects Polygon geometry.
  The other owner must explicitly integrate the separate `public-zones.geojson`,
  25-zone domain, dataset class and provenance into an appropriate reviewed contract.
- No UI, operator workflow, release contract, privacy publisher, privacy parameter,
  benchmark result or ledger was edited. No merge, deployment or external contact.
- Synthetic stops/lines are fixed public references, not actual Föli stops/services.
  Rectangles/stops are not clipped to land, roads or municipal borders; no real
  land-use, population density or demand calibration is claimed.
- Travel duration uses straight-line distance and jitter. Closed daily chains and
  absence of transfers, duplicates, missing references and overnight travel make
  this an intentionally simplified clean-input scenario. Invalid inputs are tested
  separately, not inserted into the production-shaped data.
- Morning/afternoon/evening/sparse/comparable/diffuse patterns are planted model
  assumptions. Construction and inference checks say nothing about privacy-noise
  utility, final release acceptance, real demand or service-planning validity.
- Dates are Helsinki local wall times with no UTC offset to match the existing
  adapter. The ambiguous DST hour is avoided. Files are chronological per card,
  not globally sorted by timestamp.
