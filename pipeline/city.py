"""Publish a team-synthetic rectangular city domain through the existing mechanism."""
from pathlib import Path
import hashlib
import json
import os
import tempfile

from pipeline import artifact
from pipeline.geography import zone_centres
from pipeline.mobility import load, prepare, EPS
from privacy.ledger import reserve, commit
from privacy.mechanism import draw
from privacy.provenance import publisher_revision, runtime_identity

INPUTS = ('taps.csv', 'stops.csv', 'public-zones.geojson', 'metadata.json')
POLICY = 'city-grid-32-64-64-epsilon1-v1'


def fingerprint(folder, names=INPUTS):
    from pipeline.snapshot import fingerprint as file_fingerprint
    return file_fingerprint(folder, names)


def validate_metadata(folder):
    metadata = json.loads((folder/'metadata.json').read_text())
    if not isinstance(metadata, dict) or metadata.get('data_class') != 'team_synthetic':
        raise ValueError('INVALID_METADATA: team_synthetic data_class required')
    if not metadata.get('generator_version') or type(metadata.get('seed')) is not int:
        raise ValueError('INVALID_METADATA: generator_version and integer seed required')
    if metadata.get('public_domain_version') != 'turku-analysis-grid-v1':
        raise ValueError('INVALID_METADATA: public_domain_version required')
    period = metadata.get('period', {})
    if any(period.get(k) != v for k,v in {'start_date':'2025-10-06','end_date_inclusive':'2025-11-02','timezone':'Europe/Helsinki'}.items()):
        raise ValueError('INVALID_METADATA: supported period required')
    expected = hashlib.sha256((folder/'public-zones.geojson').read_bytes()).hexdigest()
    if metadata.get('geography_sha256') != expected:
        raise ValueError('INVALID_METADATA: geography checksum mismatch')
    return metadata


def prepare_city(folder):
    folder = Path(folder)
    validate_metadata(folder)
    geometry = json.loads((folder/'public-zones.geojson').read_text())
    centres = zone_centres(geometry, polygons=True)
    taps, stops = load(folder)
    if set(stops.area) != set(centres):
        raise ValueError('DOMAIN_MISMATCH: stops and analysis zones')
    bounds = {f['properties']['area_id']: f['geometry']['coordinates'][0] for f in geometry['features']}
    municipalities = {f['properties']['area_id']: f['properties']['municipality'] for f in geometry['features']}
    for stop in stops.itertuples():
        if stop.municipality != municipalities[stop.area]: raise ValueError('DOMAIN_MISMATCH: municipality')
        ring = bounds[stop.area]
        if not min(p[0] for p in ring) <= float(stop.lon) <= max(p[0] for p in ring) or not min(p[1] for p in ring) <= float(stop.lat) <= max(p[1] for p in ring):
            raise ValueError('DOMAIN_MISMATCH: public stop outside its zone')
    domains, raw, bounded, _ = prepare(taps, stops)
    return domains, raw, bounded, geometry


def publish(folder, output, ledger, release_id):
    folder, output, ledger = Path(folder), Path(output), Path(ledger)
    revision = publisher_revision()
    runtime = runtime_identity()
    from pipeline.snapshot import snapshot
    immutable, input_hash = snapshot(folder, INPUTS, ledger.parent/'publisher-inputs')
    domains, _, bounded, geometry = prepare_city(immutable)
    if fingerprint(immutable) != input_hash: raise ValueError('SNAPSHOT_CHANGED')
    identity = hashlib.sha256((POLICY+revision+json.dumps(runtime, sort_keys=True)+input_hash).encode()).hexdigest()
    receipt = reserve(ledger, release_id, identity, epsilon=sum(EPS.values()))
    if receipt:
        if artifact.verify(output) != receipt:
            raise ValueError('ARTIFACT_INVALID: committed receipt')
        return {'release_id': release_id, 'manifest_sha256': receipt, 'reused': True}
    if output.exists():
        raise ValueError('RELEASE_CONFLICT: output exists; reservation remains spent')
    payload = artifact.build(release_id, revision, domains, draw(bounded), geometry, city=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.city-', dir=output.parent))/'bundle'
    artifact.write(staging, payload)
    digest = artifact.verify(staging)
    os.rename(staging, output)
    staging.parent.rmdir()
    commit(ledger, release_id, identity, digest)
    return {'release_id': release_id, 'manifest_sha256': digest, 'reused': False}
