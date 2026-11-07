# RouteSafe synthetic Turku city generator

**Team-generated synthetic travel on real city geography.** All people, cards,
stops, lines and travel activity are fictional. These data say nothing about
observed demand in Turku. The 25 rectangles are explicitly labelled **analysis-grid
zones**, not neighbourhood or municipal boundaries.

This module owns population generation and evaluation only. It does not import
or run a privacy mechanism, publisher, release builder or ledger. Existing privacy
parameters are unchanged. Truth is an evaluation-only artifact and must never be
an input to a production job.

## Reproduce

From the repository root, using Python 3.12 and the repository's existing Python
environment (generation itself uses only the standard library):

```sh
python -m simulation.generate --config simulation/config/turku-grid-v1.json --seed 20251106 --cards 20000 --output simulation/private/turku-grid-v1-seed-20251106-cards-20000
```

A smaller run uses the same frozen assumptions:

```sh
python -m simulation.generate --seed 20251106 --cards 240 --output simulation/private/small-240
python -m pytest -q tests/simulation
```

Evaluate the predeclared demo seed plus all five confirmation seeds, with a fresh
byte-for-byte repeat for each (requires the repository's pandas/numpy dependencies):

```sh
python -m simulation.evaluate --output-root simulation/private/confirmation-v1 --report evidence/city-generator/results.json
```

Output directories must be inside `simulation/private/`, are ignored by Git, and
must not already exist. Existing populations are never overwritten. Use a fresh
private directory for an intentional repetition. About 1.4 GB of disk space is
needed for six populations plus one temporary repeat; exact sizes are in the
results. Each run can use substantial memory during pandas preparation. Repeat
copies are removed only after their complete file hashes match; original outputs
are retained. No raw data is committed.

The checked-in configuration, development/demo seed **20251106**, and confirmation
seeds **271828, 314159, 161803, 141421, 173205** were declared before confirmation.
They have no connection to privacy-mechanism randomness. Do not change population,
seed or configuration after inspecting protected outputs to obtain a better map.
A changed model needs a new version and declared evaluation; this generator's
metadata is provenance, not a production privacy policy or release manifest.

## Files and integration

| File | Meaning |
|---|---|
| `taps.csv` | `card_id,ts,stop_id,line,fare_product`; one departure boarding per true journey |
| `stops.csv` | `stop_id,area,municipality,lat,lon,lines`; fixed synthetic public references |
| `public-zones.geojson` | 25 Polygon features with exactly four string properties: `area_id,name,municipality,source` |
| `metadata.json` | Version/source hash, complete config and seed, period, geography provenance, limitations, counts, file sizes and SHA-256 hashes |
| `configuration.json` | Canonical copy of the effective frozen configuration; card-count override is recorded separately in metadata |
| `truth/journeys.csv` | Simulated journey ID, person/card, scenario, true origin/destination stops and departure/arrival times |
| `truth/person-cards.csv` | Person/card mapping, card role/strategy, scenario and home area; includes inactive cards |

Only `taps.csv` and `stops.csv` enter the existing adapter:

```python
from pathlib import Path
from pipeline.mobility import load, prepare
inputs = Path("simulation/private/turku-grid-v1-seed-20251106-cards-20000")
taps, stops = load(inputs)
domains, raw, bounded, centroid_geometry = prepare(taps, stops)
```

This call prepares counts and applies existing caps. It does **not** draw noise
or publish. Preparation has 3,125 OD cells (25×25×5), 168 line/hour cells
(6 synthetic lines plus the adapter's `unknown` line, ×24), and 28 date cells.
The observed files contain no unknown references. Each boarding line serves both
simulated journey endpoints according to the frozen synthetic reference network.

**Integration boundary:** `prepare` still returns Point centroids. The current
`pipeline.artifact.verify` accepts Point geometry, not Polygon. This work does
not change either implementation or the release contract. The other owner must
explicitly integrate/review `public-zones.geojson` and the new domain/provenance
before any polygon release. Do not replace files inside an existing release.
No full publisher, UI or protected-artifact validation is claimed here.

## Public geography

The publicly declared, author-selected bounding box is **west 22.20°, south
60.40°, east 22.35°, north 60.50°**, around central Turku. It is a fixed map extent,
not an official city bounding box. The [OpenStreetMap reference extent](https://www.openstreetmap.org/?bbox=22.20%2C60.40%2C22.35%2C60.50&layer=mapnik)
was consulted on 7 November 2026. Reference-map credit: OpenStreetMap contributors;
[OSM attribution and licence](https://www.openstreetmap.org/copyright).
No OSM geometry, stop, route, passenger or population records are downloaded or
copied into the outputs. Rectangles and stop points are constructed numerically.
Any future basemap integration must supply its own required attribution.

Coordinates are longitude/latitude, OGC:CRS84. Split the bbox into five equal
longitude intervals (0.03°) and five latitude intervals (0.02°). Enumerate zones
`TRK-G01`–`TRK-G25` west-to-east, then south-to-north. Rings are closed and
counterclockwise; adjacent cells share exact rounded edges. These are equal
angular cells, not exactly equal-area cells.

Each cell has two synthetic stops at 0.33 and 0.67 of each axis. Stops advertise
`SYN-NET` plus their row line (`SYN-R1`–`SYN-R5`); these are fictional transport
references, not actual Föli services. Municipality labels explicitly describe
an analysis extent; there is no verified municipal membership. Geometry is not
clipped to land, roads or jurisdiction boundaries, and some cells/stops can cross
water or unsuitable terrain. Public geography never depends on population seed
or realised activity and contains no person/card properties.

## Population and chronology

At default scale, 20,000 cards belong to 18,000 people: 16,000 single-card people,
1,000 alternating-day two-card people and 1,000 split-journey two-card people.
Secondary-card count is `floor(cards × 0.10)`. Smaller runs use the same rule;
very small runs may omit scenarios or multi-card cases. Activity is stochastic,
so allocated cards are not guaranteed to appear in taps.

Scenario proportions use largest-remainder allocation, shuffled with the
population RNG: commute 42%, comparable destinations 20%, evening 12%, sparse
6%, within-zone 10%, diffuse 10%. Daily activity probabilities, time schedules,
jitter and occasional commuter evening activity are all in the frozen JSON.
Comparable weekday morning destinations are G12/G13/G14 with equal selection
probability; the main employment destination is G18, evening focus G13. Sparse
homes are in G01/G05/G21/G25. These roles are invented, not Turku land-use claims.
Diffuse journeys use random reference stops and home-return chains.

Every active day starts at the person's assigned home stop and returns there.
The true destination of one journey is the next journey's origin, even across
card changes and days. Durations use an approximate straight-line distance with
base time and jitter, not actual transit routing. There are no zero-displacement
journeys, overlaps, overnight travel, transfers, duplicates or missing stop keys.
Within-zone journeys use distinct stops. Frequent weekday riders naturally
exceed the unchanged OD cap; raw and bounded counts are reported separately.

Times cover **6 October–2 November 2025 inclusive**, in **Europe/Helsinki**, formatted
`YYYY-MM-DD HH:MM:SS`. They are local boarding/departure wall times without an
offset for adapter compatibility. Scheduled activity avoids the repeated 03:00
hour at the 26 October DST transition; validation converts to UTC to check order.
No night demand is generated, so the 00–06 band is intentionally empty. Files are
streamed in person/day/journey order: each card is chronological, but the whole
CSV is not globally time-sorted. Stable ordering and no execution timestamp in
metadata allow exact byte reproduction in the recorded Python environment.

## Truth and inference limitations

The production adapter uses same-card, same-day next-origin inference and closes
the last boarding to that card's first origin. Weekday OD/line-hour inputs and
all-day daily inputs have different calendar scope. This generator's clean closed
chains make area inference exact for single-card and alternating-day cohorts;
that is deliberately optimistic and does not establish inference quality on real
passengers. For split-journey people, journey 1 uses the primary card, journey 2
the secondary, and subsequent journeys alternate. Their true journeys remain
continuous but card-local inference often gets destinations wrong. Switching
cards by day preserves within-day inference. Both cases are reported separately.

Truth is kept under `truth/` only. Tests prepare successfully with truth absent
or replaced by invalid canaries. Neither truth nor generated metadata/geometry
is required by `pipeline.mobility.load`. The person mapping must never be used
to silently change the production privacy unit from cards to people.

See [the frozen evaluation protocol](../evidence/city-generator/PROTOCOL.md) and
[measured results](../evidence/city-generator/RESULTS.md). These measure construction
and inference only; no privacy noise, release utility, real-world validity,
passenger demand or transport-service recommendation is established.
