"""Construction/inference tests only: never exercise a privacy draw or ledger."""
import json
import shutil
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from pipeline import mobility
from simulation import generate as generator
from simulation.evaluate import audit


@pytest.fixture(scope="module")
def private(tmp_path_factory):
    patch = pytest.MonkeyPatch()
    root = tmp_path_factory.mktemp("city-generator") / "private"
    patch.setattr(generator, "PRIVATE_ROOT", root)
    yield root
    patch.undo()


@pytest.fixture(scope="module")
def population(private):
    path = private / "base"
    generator.generate(path, seed=20251106, cards=240)
    return path


def refresh_hash(path, name):
    metadata_path = path / "metadata.json"
    metadata = json.loads(metadata_path.read_text())
    metadata["files"][name] = {"sha256": generator.sha256(path / name), "bytes": (path / name).stat().st_size}
    metadata_path.write_bytes(generator.canonical_bytes(metadata))


def test_complete_audit_and_scenario_coverage(population):
    result = audit(population)
    assert result["checks"] == "passed"
    assert result["counts"]["cards"] == 240
    assert result["counts"]["people"] == 216
    assert result["counts"]["people_by_card_strategy"] == {"single_card": 192, "alternating_days": 12, "split_journeys": 12}
    assert set(result["counts"]["journeys_by_scenario"]) == {"commute", "comparable", "evening", "sparse", "within_zone", "diffuse"}
    assert result["inference_accuracy_by_card_strategy_weekdays"]["single_card"] == 1
    assert result["inference_accuracy_by_card_strategy_weekdays"]["alternating_days"] == 1
    assert result["inference_accuracy_by_card_strategy_weekdays"]["split_journeys"] < 0.5
    assert result["adapter_geometry_type"] == ["Point"]  # Polygon integration remains separate.
    assert result["adapter_bounded_totals"]["od"] < result["adapter_raw_totals"]["od"]


def test_all_output_bytes_repeat(population, private):
    second = private / "repeat"
    generator.generate(second, seed=20251106, cards=240)
    original = {str(p.relative_to(population)): p.read_bytes() for p in population.rglob("*") if p.is_file()}
    repeated = {str(p.relative_to(second)): p.read_bytes() for p in second.rglob("*") if p.is_file()}
    assert original == repeated


def test_population_changes_but_public_domain_does_not(population, private):
    other = private / "other"
    generator.generate(other, seed=271828, cards=80)
    assert generator.sha256(other / "taps.csv") != generator.sha256(population / "taps.csv")
    for name in ("stops.csv", "public-zones.geojson", "configuration.json"):
        assert (other / name).read_bytes() == (population / name).read_bytes()
    assert audit(other)["checks"] == "passed"


def test_production_does_not_read_truth_or_metadata(population, private):
    observations_only = private / "observations-only"
    observations_only.mkdir()
    for name in ("taps.csv", "stops.csv"):
        shutil.copy(population / name, observations_only / name)
    before = mobility.prepare(*mobility.load(observations_only))
    (observations_only / "truth").mkdir()
    (observations_only / "truth/journeys.csv").write_text("INVALID_TRUTH_CANARY")
    (observations_only / "metadata.json").write_text("INVALID_METADATA_CANARY")
    (observations_only / "public-zones.geojson").write_text("INVALID_GEOMETRY_CANARY")
    after = mobility.prepare(*mobility.load(observations_only))
    assert before[0] == after[0] and before[3] == after[3]
    for family in mobility.CAPS:
        assert np.array_equal(before[1][family], after[1][family])
        assert np.array_equal(before[2][family], after[2][family])


@pytest.mark.parametrize("mutation,match", [
    ("stop", "DOMAIN_MISMATCH: stop"),
    ("line", "line membership"),
    ("timestamp", "INVALID_SCHEMA: timestamp"),
    ("period", "INVALID_SCHEMA: period"),
    ("duplicate_stop", "duplicate public stop"),
])
def test_corrupt_observations_rejected(population, private, mutation, match):
    path = private / f"bad-{mutation}"
    shutil.copytree(population, path)
    name = "stops.csv" if mutation == "duplicate_stop" else "taps.csv"
    frame = pd.read_csv(path / name, dtype=str)
    if mutation == "stop":
        frame.loc[0, "stop_id"] = "NOT-A-PUBLIC-STOP"
    elif mutation == "line":
        frame.loc[0, "line"] = "NOT-A-PUBLIC-LINE"
    elif mutation == "timestamp":
        frame.loc[0, "ts"] = "not-a-date"
    elif mutation == "period":
        frame.loc[0, "ts"] = "2025-11-03 07:30:00"
    else:
        frame = pd.concat([frame, frame.iloc[:1]])
    frame.to_csv(path / name, index=False)
    refresh_hash(path, name)
    with pytest.raises(ValueError, match=match):
        audit(path)


def test_overlapping_person_journeys_rejected(population, private):
    path = private / "overlap"
    shutil.copytree(population, path)
    frame = pd.read_csv(path / "truth/journeys.csv", dtype=str)
    assert frame.loc[0, "person_id"] == frame.loc[1, "person_id"]
    # First journey now arrives after the next departure, still within its day.
    frame.loc[0, "arrival_ts"] = frame.loc[1, "arrival_ts"]
    frame.to_csv(path / "truth/journeys.csv", index=False)
    refresh_hash(path, "truth/journeys.csv")
    with pytest.raises(ValueError, match="chronology/overlap"):
        audit(path)


def test_person_card_mapping_corruption_rejected(population, private):
    path = private / "wrong-person"
    shutil.copytree(population, path)
    frame = pd.read_csv(path / "truth/journeys.csv", dtype=str)
    frame.loc[0, "person_id"] = "SYN-P-NONOWNER"
    frame.to_csv(path / "truth/journeys.csv", index=False)
    refresh_hash(path, "truth/journeys.csv")
    with pytest.raises(ValueError, match="person/card ownership"):
        audit(path)


def test_polygon_schema_and_bbox(population):
    zones = json.loads((population / "public-zones.geojson").read_text())
    rings = [f["geometry"]["coordinates"][0] for f in zones["features"]]
    assert len(rings) == 25
    assert min(x for ring in rings for x, y in ring) == 22.20
    assert max(x for ring in rings for x, y in ring) == 22.35
    assert min(y for ring in rings for x, y in ring) == 60.40
    assert max(y for ring in rings for x, y in ring) == 60.50
    for feature in zones["features"]:
        assert set(feature["properties"]) == {"area_id", "name", "municipality", "source"}
        assert all(isinstance(v, str) for v in feature["properties"].values())
        ring = feature["geometry"]["coordinates"][0]
        assert len(ring) == 5 and ring[0] == ring[-1]


def test_dst_transition_is_local_calendar_not_fixed_utc(population):
    taps, _ = mobility.load(population)
    local = pd.to_datetime(taps.ts).dt.tz_localize("Europe/Helsinki", ambiguous="raise", nonexistent="raise")
    before = local[local.dt.strftime("%Y-%m-%d").eq("2025-10-25")]
    after = local[local.dt.strftime("%Y-%m-%d").eq("2025-10-26")]
    assert len(before) and len(after)
    assert {t.utcoffset().total_seconds() for t in before} == {10800}
    assert {t.utcoffset().total_seconds() for t in after} == {7200}


def test_existing_output_and_nonprivate_output_refused(population, private, tmp_path):
    before = generator.sha256(population / "taps.csv")
    with pytest.raises(FileExistsError):
        generator.generate(population, cards=1)
    assert generator.sha256(population / "taps.csv") == before
    with pytest.raises(ValueError, match="ignored private"):
        generator.generate(tmp_path / "public-output", cards=1)
    with pytest.raises(ValueError, match="cards must be positive"):
        generator.generate(private / "invalid", cards=0)


def test_frozen_declaration():
    config = generator.load_config()
    assert config["development_seed"] == config["demo_seed"] == 20251106
    assert config["evaluation_seeds"] == [271828, 314159, 161803, 141421, 173205]
    assert config["cards"] == 20000
    assert config["period"] == {"start": "2025-10-06", "end": "2025-11-02", "timezone": "Europe/Helsinki"}
    # Locks the actual frozen assumptions independently of generator implementation.
    assert generator.sha256(generator.DEFAULT_CONFIG) == "f345edb769a2e3bdfd72961d54ea0c9a5739e04c711cd56794c0f6216917d7de"
