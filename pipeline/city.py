"""Publish a team-synthetic rectangular city domain through the existing mechanism."""
from pathlib import Path
import hashlib
import json
import os
import tempfile

from pipeline import artifact
from pipeline.geography import zone_centres, validate_city_grid
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
    """Read only generator metadata and publisher inputs; never traverse its truth entries."""
    folder = Path(folder)
    metadata = json.loads((folder/'metadata.json').read_text())
    if not isinstance(metadata, dict) or metadata.get('dataset_class') != 'team-generated-synthetic':
        raise ValueError('INVALID_METADATA: team-generated-synthetic dataset_class required')
    if not isinstance(metadata.get('generator_version'),str) or not metadata['generator_version'] or type(metadata.get('population_seed')) is not int:
        raise ValueError('INVALID_METADATA: generator_version and population_seed required')
    if metadata.get('geography_provenance',{}).get('id') != 'turku-analysis-grid-v1':
        raise ValueError('INVALID_METADATA: geography id required')
    if metadata.get('period') != {'start':'2025-10-06','end':'2025-11-02','timezone':'Europe/Helsinki'}:
        raise ValueError('INVALID_METADATA: supported period required')
    config = metadata.get('configuration')
    config_hash = hashlib.sha256((json.dumps(config,indent=2,sort_keys=True,ensure_ascii=False)+'\n').encode()).hexdigest()
    if config_hash != metadata.get('configuration_sha256'):
        raise ValueError('INVALID_METADATA: configuration checksum')
    if not isinstance(config,dict) or config.get('period') != metadata['period'] or config.get('geography') != metadata['geography_provenance']:
        raise ValueError('INVALID_METADATA: configuration agreement')
    import re
    if not re.fullmatch('[0-9a-f]{64}',metadata.get('generator_source_sha256','')):
        raise ValueError('INVALID_METADATA: source checksum')
    for name in ('taps.csv','stops.csv','public-zones.geojson'):
        record = metadata.get('files',{}).get(name,{})
        if record.get('sha256') != hashlib.sha256((folder/name).read_bytes()).hexdigest() or record.get('bytes') != (folder/name).stat().st_size:
            raise ValueError('INVALID_METADATA: input checksum '+name)
    return metadata


def public_provenance(folder):
    metadata = validate_metadata(folder)
    return {'generator_version':metadata['generator_version'], 'population_seed':metadata['population_seed'],
            'generator_source_sha256':metadata['generator_source_sha256'], 'configuration_sha256':metadata['configuration_sha256'],
            'geography_sha256':metadata['files']['public-zones.geojson']['sha256']}


def prepare_city(folder):
    folder = Path(folder)
    validate_metadata(folder)
    geometry = json.loads((folder/'public-zones.geojson').read_text())
    validate_city_grid(geometry)
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
    payload = artifact.build(release_id, revision, domains, draw(bounded), geometry, city=True, city_provenance=public_provenance(immutable))
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.city-', dir=output.parent))/'bundle'
    artifact.write(staging, payload)
    digest = artifact.verify(staging)
    os.rename(staging, output)
    staging.parent.rmdir()
    commit(ledger, release_id, identity, digest)
    return {'release_id': release_id, 'manifest_sha256': digest, 'reused': False}
