# Street-following route-demand view

The zone-to-zone arc view was rejected by the project lead. The default now uses public Föli bus-shape coordinates, with signed protected OD counts assigned through a declared shortest-directed-distance model. Analysis zones remain an advanced diagnostic view, not a main map control.

- Source: [Föli GTFS](https://data.foli.fi/doc/gtfs/v0/index-en), archive downloaded 7 November 2026. [Licence/attribution](../../licenses/foli-network.txt).
- Builder: `evaluation/build_route_network.py`. Derived public geometry: `web/src/planner/data/foli-network.json`, including source archive hash, feed metadata, assignment assumptions and released geography hash.
- 17,552 rounded public shape nodes, 19,129 unique undirected display edges, 600 directional OD assignments. Each path follows directed source edges; display aggregates both directions on identical edges. Near-parallel geometry is not asserted to be the same street.
- All 25 zone centres snap within 756 metres. Access paths to the network are not drawn. No straight connectors or synthetic arcs are inserted.
- For each segment and time band, sum signed released OD cells, count each cell at most once, then clamp once. Conservative simultaneous noise bounds are propagated by summing their per-cell radii. One global intensity scale is retained across all bands and area filters.
- No private source records, generator truth, new privacy mechanism or new release were used. The existing immutable city publication and all failed utility results are unchanged.
- Public-route assignment is a visual model, not inferred actual passenger journeys or identified line loads. Shortest geometry ignores timetables, transfers, capacity and route-choice alternatives. Same-zone travel is omitted. The geometry snapshot is from 2026, while the fictional demand period is in 2025. No route-choice accuracy has been established.
- `web/tests/routes.test.ts` covers domain binding, all 600 continuous paths, shared-segment signed arithmetic, filtering, profile agreement, duplicate-edge protection and missing-path gaps. Frontend suite: 45 passing checks. Build boundary: 47 allowlisted files. The network is a separately loaded bundled asset (~346 kB gzip).

Reproduce from the archived public GTFS bytes (the live source may change):

```bash
python3 evaluation/build_route_network.py --gtfs private/public-network/foli-gtfs.zip
npm --prefix web test
npm --prefix web run build
```

The recipient view labels synthetic travel and modelled routes, provides source attribution, and puts assumptions in the segment detail. The UI shows capacity unknown; this is not a measured bus-service deficit.
