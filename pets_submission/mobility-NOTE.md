# RouteSafe mobility release (aggregate, MOB-S1)

These are byte-identical copies of `releases/e1-aura-001/`: all nine canonical files, including manifest, checksums, definitions, statistics and public geometry. From the repository root run `.venv/bin/python -m pipeline verify-release --release pets_submission/mobility`. No new noise was drawn or privacy budget spent.

- Aggregate counts only: route trips per area pair and time band, boardings per line and hour, taps per day. Every value has differentially private noise (OpenDP integer Laplace); each card's contribution is capped first.
- No rows, no card ids, no exact timestamps, and **no row map**. Row-linkage and lookup attacks do not apply.
- Protection unit: one travel card's records for the whole 4-week period, ε = 1 in total, δ = 0. A person with two cards gets 2ε. Status: pending review; no independent audit.
