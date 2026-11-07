"""Private synthetic evaluation: generator invariants and existing prepare adapter only.

No mechanism, publisher, artifact builder or ledger is imported or executed.
"""
from __future__ import annotations

import argparse
import json
import platform
import shutil
from pathlib import Path

import numpy as np
import pandas as pd

from pipeline import mobility
from simulation.generate import (DEFAULT_CONFIG, PRIVATE_ROOT, VERSION, canonical_bytes,
                                 generate, load_config, sha256)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def audit(path):
    """Fail on broken invariants; return aggregate diagnostics, never raw/truth rows."""
    path = Path(path)
    metadata = json.loads((path / "metadata.json").read_text())
    config = metadata["configuration"]
    require(sha256(path / "configuration.json") == metadata["configuration_sha256"], "configuration fingerprint")
    taps, stops = mobility.load(path)  # Production reads precisely these two files.
    ts, lines = mobility.validate(taps, stops)
    truth = pd.read_csv(path / "truth/journeys.csv", dtype=str)
    cards = pd.read_csv(path / "truth/person-cards.csv", dtype=str)
    zones = json.loads((path / "public-zones.geojson").read_text())
    for name, record in metadata["files"].items():
        require(sha256(path / name) == record["sha256"], f"file checksum: {name}")
        require((path / name).stat().st_size == record["bytes"], f"file size: {name}")
    require(len(zones["features"]) == 25, "zone count")
    west, south, east, north = config["geography"]["bbox_wsen"]
    zone_ids = []
    for index, feature in enumerate(zones["features"]):
        props, geometry = feature["properties"], feature["geometry"]
        require(set(props) == {"area_id", "name", "municipality", "source"} and
                all(isinstance(value, str) for value in props.values()), "exact string polygon properties")
        require("analysis-grid" in props["name"] and "not neighbourhood" in props["source"], "grid labelling")
        zone_ids.append(props["area_id"])
        row, col = divmod(index, 5)
        x0, x1 = (round(west + (east - west) * i / 5, 8) for i in (col, col + 1))
        y0, y1 = (round(south + (north - south) * i / 5, 8) for i in (row, row + 1))
        require(geometry == {"type": "Polygon", "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]},
                "deterministic counterclockwise rectangular grid")
        group = stops[stops.area == props["area_id"]]
        require(len(group) == 2 and group.lon.astype(float).between(x0, x1, inclusive="neither").all()
                and group.lat.astype(float).between(y0, y1, inclusive="neither").all(), "stops strictly inside own polygon")
    require(len(set(zone_ids)) == 25 and set(stops.area) == set(zone_ids), "area membership")
    require(len(stops) == 50, "stop count")
    stop_lookup = stops.set_index("stop_id")
    require(taps.line.isin(lines).all(), "line membership")
    require(all(line in available.split("|") for line, available in
                zip(taps.line, taps.stop_id.map(stop_lookup.lines))), "boarding line serves public stop")
    require(len(taps) == len(truth) == metadata["counts"]["taps"], "tap/truth row counts")
    require(taps.card_id.equals(truth.card_id) and taps.ts.equals(truth.departure_ts)
            and taps.stop_id.equals(truth.origin_stop_id), "observations contain actual truth departures in row order")
    require(truth.journey_id.is_unique and cards.card_id.is_unique, "unique truth keys")
    require(len(cards) == metadata["configured_cards"], "configured card count")
    require(cards.person_id.nunique() == metadata["counts"]["people"], "person count")
    require(truth.destination_stop_id.isin(stops.stop_id).all(), "truth destination domain")
    require(truth.origin_stop_id.ne(truth.destination_stop_id).all(), "nonzero stop displacement")
    require(all(line in available.split("|") for line, available in
                zip(taps.line, truth.destination_stop_id.map(stop_lookup.lines))), "line serves destination")
    card_lookup = cards.set_index("card_id")
    require(truth.card_id.map(card_lookup.person_id).equals(truth.person_id), "person/card ownership")
    require(truth.card_id.map(card_lookup.scenario).equals(truth.scenario), "persistent scenario identity")
    departure = pd.to_datetime(truth.departure_ts, format="%Y-%m-%d %H:%M:%S")
    arrival = pd.to_datetime(truth.arrival_ts, format="%Y-%m-%d %H:%M:%S")
    # tz_localize raises on ambiguous/nonexistent wall times; UTC order crosses the DST change.
    departure_utc = departure.dt.tz_localize("Europe/Helsinki", ambiguous="raise", nonexistent="raise").dt.tz_convert("UTC")
    arrival_utc = arrival.dt.tz_localize("Europe/Helsinki", ambiguous="raise", nonexistent="raise").dt.tz_convert("UTC")
    require((arrival_utc > departure_utc).all(), "positive journey duration")
    require(arrival.dt.date.eq(departure.dt.date).all(), "journeys remain within local day")
    previous_arrival = arrival_utc.groupby(truth.person_id).shift()
    previous_destination = truth.groupby("person_id", sort=False).destination_stop_id.shift()
    require((previous_arrival.isna() | departure_utc.gt(previous_arrival)).all(), "chronology/overlap across all person cards")
    require((previous_destination.isna() | truth.origin_stop_id.eq(previous_destination)).all(), "person-level spatial continuity")
    require(departure_utc.groupby(truth.card_id).diff().dropna().gt(pd.Timedelta(hours=1)).all(), "card chronology and adapter gap")
    person_cards = cards.groupby("person_id", sort=False)
    multiplicity = person_cards.size()
    require(multiplicity.between(1, 2).all(), "one or two cards per person")
    expected_multi = int(metadata["configured_cards"] * config["population"]["secondary_card_fraction_of_cards"])
    require(int(multiplicity.eq(2).sum()) == expected_multi, "multi-card allocation")
    require(person_cards.card_strategy.nunique().eq(1).all(), "consistent card strategy")
    strategy = truth.card_id.map(card_lookup.card_strategy)
    truth["date"] = departure.dt.strftime("%Y-%m-%d")
    truth["origin_area"] = truth.origin_stop_id.map(stop_lookup.area)
    truth["destination_area"] = truth.destination_stop_id.map(stop_lookup.area)
    truth["hour_band"] = pd.cut(departure.dt.hour, [0, 6, 9, 15, 18, 24], right=False, labels=mobility.BANDS).astype(str)
    per_day = truth.groupby(["person_id", "date"], sort=False)
    require(per_day.origin_stop_id.first().equals(per_day.destination_stop_id.last()), "daily home-return chains")
    home_by_person = cards.drop_duplicates("person_id").set_index("person_id").home_area
    first_origins = per_day.origin_area.first()
    require(all(area == home_by_person[person] for (person, _), area in first_origins.items()), "daily chains start at assigned home")
    role = truth.card_id.map(card_lookup.card_role)
    day_index = (departure.dt.normalize() - pd.Timestamp(config["period"]["start"])).dt.days
    alternating = strategy.eq("alternating_days")
    split = strategy.eq("split_journeys")
    expected_alternating = day_index.mod(2).map({0: "primary", 1: "secondary"})
    expected_split = per_day.cumcount().mod(2).map({0: "primary", 1: "secondary"})
    require(role[alternating].equals(expected_alternating[alternating]), "alternating-day card handling")
    require(role[split].equals(expected_split[split]), "split-journey card handling")
    weekday = departure.dt.day_of_week.lt(5)
    commute = truth.scenario.isin(["commute", "comparable"]) & weekday
    morning = truth.hour_band.eq("06-09")
    afternoon = truth.hour_band.eq("15-18")
    am = truth[commute & morning].set_index(["person_id", "date"])
    pm = truth[commute & afternoon].set_index(["person_id", "date"])
    require(am.index.equals(pm.index) and am.origin_stop_id.equals(pm.destination_stop_id)
            and am.destination_stop_id.equals(pm.origin_stop_id), "morning outbound/afternoon reverse journeys")
    within = truth.scenario.eq("within_zone")
    require(truth.loc[within, "origin_area"].equals(truth.loc[within, "destination_area"]), "within-zone cohort")
    # Independently reproduce next-origin inference for comparison with production counts.
    inferred = truth[weekday].copy()
    inferred["strategy"] = strategy[weekday]
    inferred["inferred_destination"] = inferred.groupby(["card_id", "date"], sort=False).origin_area.shift(-1)
    inferred["inferred_destination"] = inferred.inferred_destination.fillna(
        inferred.groupby(["card_id", "date"], sort=False).origin_area.transform("first"))
    inferred["correct"] = inferred.inferred_destination.eq(inferred.destination_area)
    domains, raw, bounded, adapter_geo = mobility.prepare(taps, stops)
    require(len(domains["od"]) == 25 * 25 * 5 and len(domains["daily"]) == 28, "adapter domains")
    require(int(raw["od"].sum()) == int(weekday.sum()) == int(raw["line_hour"].sum()), "weekday adapter counts")
    require(int(raw["daily"].sum()) == len(taps), "all-day adapter counts")
    expected = inferred.groupby(["origin_area", "inferred_destination", "hour_band"]).size()
    expected = expected.reindex(pd.MultiIndex.from_tuples(domains["od"]), fill_value=0).to_numpy()
    require(np.array_equal(raw["od"], expected), "production next-origin count parity")
    for family in mobility.CAPS:
        require(int(bounded[family].sum()) <= cards.card_id.nunique() * mobility.CAPS[family], "unchanged card contribution caps")
    actual_people = cards.drop_duplicates("person_id").scenario.value_counts().to_dict()
    total_people = metadata["counts"]["people"]
    require(all(abs(actual_people.get(scenario, 0) - total_people * weight) <= 1
                for scenario, weight in config["population"]["scenario_weights"].items()), "scenario allocation balance")
    comparable = truth[truth.scenario.eq("comparable") & weekday & morning].destination_area.value_counts().sort_index()
    diffuse = truth[truth.scenario.eq("diffuse")].destination_area.value_counts(normalize=True)
    sparse_activity = float(truth.scenario.eq("sparse").sum()) / max(actual_people.get("sparse", 0), 1)
    dense_activity = float(truth.scenario.eq("commute").sum()) / max(actual_people.get("commute", 0), 1)
    origin_counts = truth.origin_area.value_counts().reindex(zone_ids, fill_value=0)
    sparse_ids = [f"TRK-G{i:02d}" for i in config["geography"]["sparse_zones"]]
    sparse_zone_mean = float(origin_counts.loc[sparse_ids].mean())
    core_zone_mean = float(origin_counts.drop(sparse_ids).mean())
    if metadata["configured_cards"] >= 20000:
        require(len(comparable) == 3 and comparable.div(comparable.sum()).between(0.28, 0.39).all(), "comparable morning destinations balance")
        require(len(diffuse) == 25 and float(diffuse.max()) < 0.10, "diffuse demand without dominant destination")
        require(sparse_activity < 0.35 * dense_activity, "sparse rider activity")
        require(sparse_zone_mean < 0.35 * core_zone_mean, "sparse area activity")
        require(set(strategy) == {"single_card", "alternating_days", "split_journeys"}, "multi-card case coverage")
        require(int(truth.hour_band.eq("18-24").sum()) > 0 and int(within.sum()) > 0, "evening and within-zone coverage")
    return {
        "population_seed": metadata["population_seed"], "counts": metadata["counts"],
        "checks": "passed", "checks_scope": "domain, chronology, person/card mapping, scenario balance, production load/prepare parity",
        "weekday_journeys": int(weekday.sum()),
        "journeys_by_band_all_days": truth.hour_band.value_counts().sort_index().to_dict(),
        "comparable_weekday_morning_destinations": comparable.to_dict(),
        "diffuse_destination_count": len(diffuse), "diffuse_max_destination_share": float(diffuse.max()) if len(diffuse) else None,
        "origins_by_zone": origin_counts.to_dict(),
        "sparse_zone_mean_origins": sparse_zone_mean, "core_zone_mean_origins": core_zone_mean,
        "sparse_journeys_per_person": sparse_activity, "commute_journeys_per_person": dense_activity,
        "within_zone_journeys_all_cohorts": int(truth.origin_area.eq(truth.destination_area).sum()),
        "inference_accuracy_by_card_strategy_weekdays": inferred.groupby("strategy").correct.mean().to_dict(),
        "adapter_raw_totals": {k: int(v.sum()) for k, v in raw.items()},
        "adapter_bounded_totals": {k: int(v.sum()) for k, v in bounded.items()},
        "adapter_domain_sizes": {k: len(v) for k, v in domains.items()},
        "adapter_geometry_type": sorted({f["geometry"]["type"] for f in adapter_geo["features"]}),
        "files": {**metadata["files"], "metadata.json": {"bytes": (path / "metadata.json").stat().st_size,
                                                         "sha256": sha256(path / "metadata.json")}},
    }


def run(output_root, report, *, config_path=DEFAULT_CONFIG, cards=None):
    """Evaluate every declared seed, preserving failures; no population selection."""
    config = load_config(config_path)
    output_root, report = Path(output_root), Path(report)
    result = {"generator_version": VERSION, "configuration_sha256": sha256(config_path),
              "generator_source_sha256": sha256(Path(__file__).with_name("generate.py")),
              "evaluator_source_sha256": sha256(__file__), "python": platform.python_version(),
              "pandas": pd.__version__, "numpy": np.__version__,
              "mechanism_draws": 0, "publisher_runs": 0, "ledger_operations": 0,
              "demo_seed_predeclared": config["demo_seed"], "evaluation_seeds_predeclared": config["evaluation_seeds"],
              "cards_per_population": config["cards"] if cards is None else cards, "populations": []}
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_bytes(canonical_bytes(result))
    for seed in [config["demo_seed"], *config["evaluation_seeds"]]:
        output = output_root / f"seed-{seed}"
        try:
            generate(output, config_path=config_path, seed=seed, cards=cards)
            row = audit(output)
            repeat = output_root / f"repeat-{seed}"
            generate(repeat, config_path=config_path, seed=seed, cards=cards)
            original_files = {str(p.relative_to(output)): sha256(p) for p in output.rglob("*") if p.is_file()}
            repeated_files = {str(p.relative_to(repeat)): sha256(p) for p in repeat.rglob("*") if p.is_file()}
            require(original_files == repeated_files, "byte repeatability including metadata/truth")
            row["repeatability"] = "all output files byte-identical on independent regeneration"
            shutil.rmtree(repeat)  # Only this newly generated repeat copy; original retained privately.
        except Exception as exc:
            row = {"population_seed": seed, "checks": "failed", "error": f"{type(exc).__name__}: {exc}"}
        result["populations"].append(row)
        report.write_bytes(canonical_bytes(result))
        print(json.dumps({"seed": seed, "checks": row["checks"], "taps": row.get("counts", {}).get("taps"),
                          "error": row.get("error")}), flush=True)
    require(all(row["checks"] == "passed" for row in result["populations"]), "one or more declared populations failed; see report")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output-root", type=Path, default=PRIVATE_ROOT / "confirmation-v1")
    parser.add_argument("--report", type=Path, default=Path("evidence/city-generator/results.json"))
    parser.add_argument("--cards", type=int)
    args = parser.parse_args()
    run(args.output_root, args.report, config_path=args.config, cards=args.cards)


if __name__ == "__main__":
    main()
