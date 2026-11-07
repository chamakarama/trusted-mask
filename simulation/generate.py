"""Deterministic fictional boarding observations and separate journey truth."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import random
from collections import Counter
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

VERSION = "1.0.0"
SCENARIOS = ("commute", "comparable", "evening", "sparse", "within_zone", "diffuse")
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = Path(__file__).with_name("config") / "turku-grid-v1.json"
PRIVATE_ROOT = Path(__file__).with_name("private")
TAP_COLUMNS = ["card_id", "ts", "stop_id", "line", "fare_product"]
STOP_COLUMNS = ["stop_id", "area", "municipality", "lat", "lon", "lines"]
JOURNEY_COLUMNS = ["journey_id", "person_id", "card_id", "scenario", "origin_stop_id",
                   "destination_stop_id", "departure_ts", "arrival_ts"]
CARD_COLUMNS = ["person_id", "card_id", "card_role", "card_strategy", "scenario", "home_area"]
LIMITATIONS = [
    "All people, cards, stops, lines and travel activity are fictional; no observed real-city demand.",
    "Rectangular analysis grid over a public Turku map extent, not neighbourhood or municipal boundaries.",
    "Stops are synthetic interior reference points, not actual transit stops; no road, water or land-use snapping.",
    "Trips use straight-line timing, not timetables or route/vehicle capacity; no empirical calibration.",
    "Closed daily home-return chains simplify travel; no overnight trips, transfers, duplicates or missing references generated.",
    "Europe/Helsinki local wall times omit UTC offsets to match the adapter; no events during the ambiguous DST hour.",
    "Multiple cards can belong to one person; card-level preparation does not provide person-level protection.",
    "Production destinations are inferred from same-card next origins; truth must never enter production inputs.",
    "No protected release, mechanism draws, privacy parameter changes or ledger operations are performed.",
]


def canonical_bytes(value):
    return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode()


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_config(path=DEFAULT_CONFIG):
    config = json.loads(Path(path).read_text())
    g, p = config["geography"], config["population"]
    if (g["rows"], g["columns"]) != (5, 5):
        raise ValueError("v1 requires exactly 25 analysis-grid zones")
    west, south, east, north = g["bbox_wsen"]
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError("invalid bbox")
    if config["period"] != {"start": "2025-10-06", "end": "2025-11-02", "timezone": "Europe/Helsinki"}:
        raise ValueError("v1 period must match the existing production adapter")
    if set(p["scenario_weights"]) != set(SCENARIOS):
        raise ValueError("v1 requires its six declared scenarios")
    if not math.isclose(sum(p["scenario_weights"].values()), 1.0):
        raise ValueError("scenario weights must sum to one")
    if any(weight <= 0 for weight in p["scenario_weights"].values()):
        raise ValueError("scenario weights must be positive")
    if not 0 <= p["secondary_card_fraction_of_cards"] < 0.5:
        raise ValueError("secondary-card fraction must be in [0, 0.5)")
    if len(config["evaluation_seeds"]) < 5 or len(set(config["evaluation_seeds"])) != len(config["evaluation_seeds"]):
        raise ValueError("declare at least five distinct evaluation seeds")
    return config


def zone_id(index):
    return f"TRK-G{index:02d}"


def public_domain(config):
    """Public geometry and stop/line references depend only on configuration."""
    g = config["geography"]
    west, south, east, north = g["bbox_wsen"]
    xs = [round(west + (east - west) * i / 5, 8) for i in range(6)]
    ys = [round(south + (north - south) * i / 5, 8) for i in range(6)]
    features, stops = [], []
    for row in range(5):
        for col in range(5):
            area = zone_id(row * 5 + col + 1)
            x0, x1, y0, y1 = xs[col], xs[col + 1], ys[row], ys[row + 1]
            features.append({"type": "Feature", "properties": {
                "area_id": area, "name": f"Turku synthetic analysis-grid zone {row * 5 + col + 1:02d}",
                "municipality": g["municipality_label"], "source": g["source"]},
                "geometry": {"type": "Polygon", "coordinates": [
                    [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]}})
            for number, fraction in enumerate(g["stop_fractions"], 1):
                stops.append({"stop_id": f"SYN-{area}-{number}", "area": area,
                              "municipality": g["municipality_label"],
                              "lat": round(y0 + fraction * (y1 - y0), 8),
                              "lon": round(x0 + fraction * (x1 - x0), 8),
                              "lines": f"SYN-NET|SYN-R{row + 1}"})
    return {"type": "FeatureCollection", "features": features}, stops


def scenario_assignment(weights, count, rng):
    """Largest-remainder allocation; stable scenario balance even for small runs."""
    counts = {key: math.floor(count * value) for key, value in weights.items()}
    order = sorted(weights, key=lambda key: (-(count * weights[key] - counts[key]), key))
    for key in order[:count - sum(counts.values())]:
        counts[key] += 1
    # JSON object key order is not part of the model, including canonical config copies.
    result = [key for key in SCENARIOS for _ in range(counts[key])]
    rng.shuffle(result)
    return result


def make_writer(path, columns):
    stream = path.open("w", newline="", encoding="utf-8")
    writer = csv.DictWriter(stream, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    return stream, writer


def distance_km(a, b):
    # Short local distances: equirectangular approximation is sufficient for fictional timing.
    lat = math.radians((a["lat"] + b["lat"]) / 2)
    return 6371 * math.hypot(math.radians(a["lat"] - b["lat"]),
                            math.cos(lat) * math.radians(a["lon"] - b["lon"]))


def generate(output, *, config_path=DEFAULT_CONFIG, seed=None, cards=None):
    config = load_config(config_path)
    seed = config["development_seed"] if seed is None else seed
    cards = config["cards"] if cards is None else cards
    if type(cards) is not int or cards < 1 or type(seed) is not int or seed < 0:
        raise ValueError("cards must be positive and seed a nonnegative integer")
    output = Path(output).resolve()
    if not output.is_relative_to(PRIVATE_ROOT.resolve()) or output == PRIVATE_ROOT.resolve():
        raise ValueError(f"outputs must be inside ignored private directory: {PRIVATE_ROOT}")
    output.mkdir(parents=True, exist_ok=False)  # Never silently replace a population.
    (output / "truth").mkdir()
    (output / "configuration.json").write_bytes(canonical_bytes(config))
    rng = random.Random(seed)  # Population randomness only. No privacy imports or draws.
    geojson, stops = public_domain(config)
    (output / "public-zones.geojson").write_bytes(canonical_bytes(geojson))
    with (output / "stops.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=STOP_COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(stops)
    by_area = {i: [s for s in stops if s["area"] == zone_id(i)] for i in range(1, 26)}
    p, g = config["population"], config["geography"]
    multi_count = math.floor(cards * p["secondary_card_fraction_of_cards"])
    people = cards - multi_count
    multi_people = set(rng.sample(range(people), multi_count))
    strategies = ["alternating_days" if i % 2 == 0 else "split_journeys" for i in range(multi_count)]
    rng.shuffle(strategies)
    scenarios = scenario_assignment(p["scenario_weights"], people, rng)
    sparse = set(g["sparse_zones"])
    core = [i for i in range(1, 26) if i not in sparse]
    home_weights = [p["sparse_home_weight"] if i in sparse else 1 for i in range(1, 26)]
    start, end = (date.fromisoformat(config["period"][key]) for key in ("start", "end"))
    tz = ZoneInfo(config["period"]["timezone"])
    tap_stream, tap_writer = make_writer(output / "taps.csv", TAP_COLUMNS)
    journey_stream, journey_writer = make_writer(output / "truth/journeys.csv", JOURNEY_COLUMNS)
    card_stream, card_writer = make_writer(output / "truth/person-cards.csv", CARD_COLUMNS)
    counts, scenario_journeys, used_cards = Counter(), Counter(), set()
    next_secondary = people
    minutes = p["departure_minutes"]
    try:
        for person_index, scenario in enumerate(scenarios):
            person = f"SYN-P{person_index + 1:06d}"
            person_cards = [f"SYN-C{person_index + 1:06d}"]
            strategy = "single_card"
            if person_index in multi_people:
                person_cards.append(f"SYN-C{next_secondary + 1:06d}")
                strategy = strategies[next_secondary - people]
                next_secondary += 1
            home_area = rng.choice(sorted(sparse)) if scenario == "sparse" else rng.choices(range(1, 26), home_weights)[0]
            if scenario == "within_zone":
                home_area = rng.choice(core)
            home = rng.choice(by_area[home_area])
            destination_area = (rng.choice(g["comparable_destinations"]) if scenario == "comparable"
                                else g["employment_destination"])
            # Commute destinations differ from home; within-zone is an explicit other scenario.
            if scenario in ("commute", "comparable") and home_area == destination_area:
                home_area = rng.choice([i for i in core if i != destination_area])
                home = rng.choice(by_area[home_area])
            work = rng.choice(by_area[destination_area])
            for role, card in enumerate(person_cards):
                card_writer.writerow(dict(person_id=person, card_id=card, card_role="primary" if role == 0 else "secondary",
                                          card_strategy=strategy, scenario=scenario, home_area=zone_id(home_area)))
            counts[strategy + "_people"] += 1
            for day_index in range((end - start).days + 1):
                day = start + timedelta(days=day_index)
                weekday = day.weekday() < 5
                probability = p["weekday_activity" if weekday else "weekend_activity"][scenario]
                if rng.random() >= probability:
                    continue
                evening = rng.choice([s for s in by_area[g["evening_destination"]] if s != home])
                if scenario in ("commute", "comparable") and weekday:
                    destinations = [work, home]
                    departure_minutes = [minutes["outbound"], minutes["return"]]
                    if rng.random() < p["commuter_evening_probability"]:
                        destinations += [evening, home]
                        departure_minutes += [minutes["evening_out"], minutes["evening_return"]]
                elif scenario == "evening":
                    destinations = [evening, home]
                    departure_minutes = [minutes["evening_out"], minutes["evening_return"]]
                elif scenario == "within_zone":
                    destinations = [next(s for s in by_area[home_area] if s != home), home]
                    departure_minutes = [minutes["within_out"], minutes["within_return"]]
                elif scenario == "sparse":
                    destinations = [rng.choice(by_area[rng.choice(core)]), home]
                    departure_minutes = [minutes["sparse_out"], minutes["sparse_return"]]
                elif scenario == "diffuse":
                    four = rng.random() < p["diffuse_four_journeys_probability"]
                    departure_minutes = minutes["diffuse_four" if four else "diffuse_two"]
                    destinations = []
                    previous = home
                    for _ in departure_minutes[:-1]:
                        destination = rng.choice([s for s in stops if s != home and s != previous])
                        destinations.append(destination)
                        previous = destination
                    destinations.append(home)
                else:  # Weekend leisure for the commute/comparable cohorts.
                    destinations = [rng.choice([s for s in stops if s["area"] in {zone_id(i) for i in core} and s != home]), home]
                    departure_minutes = [minutes["leisure_out"], minutes["leisure_return"]]
                origin = home
                for journey_index, (destination, minute) in enumerate(zip(destinations, departure_minutes)):
                    card_index = (day_index % len(person_cards) if strategy == "alternating_days"
                                  else journey_index % len(person_cards) if strategy == "split_journeys" else 0)
                    card = person_cards[card_index]
                    departure = datetime.combine(day, time(), tzinfo=tz) + timedelta(
                        minutes=minute + rng.randint(-p["departure_jitter_minutes"], p["departure_jitter_minutes"]),
                        seconds=rng.randrange(60))
                    duration = p["travel_minutes_base"] + math.ceil(distance_km(origin, destination) * p["travel_minutes_per_km"])
                    arrival = departure + timedelta(minutes=duration + rng.randint(0, p["travel_minutes_jitter"]))
                    same_row = origin["lines"] == destination["lines"]
                    line = origin["lines"].split("|")[1] if same_row else "SYN-NET"
                    counts["journeys"] += 1
                    scenario_journeys[scenario] += 1
                    used_cards.add(card)
                    departure_text = departure.replace(tzinfo=None).isoformat(sep=" ", timespec="seconds")
                    arrival_text = arrival.replace(tzinfo=None).isoformat(sep=" ", timespec="seconds")
                    tap_writer.writerow(dict(card_id=card, ts=departure_text,
                                             stop_id=origin["stop_id"], line=line, fare_product="synthetic_season"))
                    journey_writer.writerow(dict(journey_id=f"SYN-J{counts['journeys']:09d}", person_id=person,
                        card_id=card, scenario=scenario, origin_stop_id=origin["stop_id"],
                        destination_stop_id=destination["stop_id"], departure_ts=departure_text,
                        arrival_ts=arrival_text))
                    origin = destination
    finally:
        tap_stream.close()
        journey_stream.close()
        card_stream.close()
    outputs = {}
    for path in sorted(output.rglob("*")):
        if path.is_file():
            outputs[str(path.relative_to(output))] = {"bytes": path.stat().st_size, "sha256": sha256(path)}
    metadata = {
        "generator_version": VERSION, "generator_source_sha256": sha256(__file__),
        "configuration": config, "configuration_sha256": hashlib.sha256(canonical_bytes(config)).hexdigest(),
        "population_seed": seed, "randomness_scope": "population only; independent of privacy mechanisms",
        "configured_cards": cards, "small_run_override": cards != config["cards"],
        "dataset_class": config["dataset_class"], "label": config["label"], "period": config["period"],
        "timestamp_format": "%Y-%m-%d %H:%M:%S", "timestamp_semantics": "Europe/Helsinki local departure/boarding time",
        "geography_provenance": g, "limitations": LIMITATIONS,
        "counts": {"people": people, "cards": cards, "active_cards": len(used_cards), "taps": counts["journeys"],
                   "journeys": counts["journeys"], "stops": len(stops), "zones": len(geojson["features"]),
                   "people_by_card_strategy": {k.removesuffix("_people"): v for k, v in counts.items() if k.endswith("_people")},
                   "people_by_scenario": dict(Counter(scenarios)), "journeys_by_scenario": dict(scenario_journeys)},
        "production_inputs": ["taps.csv", "stops.csv"],
        "evaluation_only": ["truth/journeys.csv", "truth/person-cards.csv"], "files": outputs,
    }
    (output / "metadata.json").write_bytes(canonical_bytes(metadata))
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--seed", type=int)
    parser.add_argument("--cards", type=int)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    config = load_config(args.config)
    seed = config["development_seed"] if args.seed is None else args.seed
    cards = config["cards"] if args.cards is None else args.cards
    output = args.output or PRIVATE_ROOT / f"turku-grid-v1-seed-{seed}-cards-{cards}"
    metadata = generate(output, config_path=args.config, seed=seed, cards=cards)
    print(json.dumps({"output": str(output.resolve()), "counts": metadata["counts"]}, indent=2))


if __name__ == "__main__":
    main()
