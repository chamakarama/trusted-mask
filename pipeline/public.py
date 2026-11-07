"""Copy a verified immutable bundle into an explicit public static directory."""
import json
import re
import os
from pathlib import Path
import shutil
import tempfile
from pipeline.artifact import verify, PAYLOADS

ROOT = Path(__file__).resolve().parents[1]


def sync_release(source, destination):
    source, destination = Path(source), Path(destination)
    digest = verify(source)
    manifest = json.loads((source/'manifest.json').read_text())
    ident = manifest['release_id']
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', ident): raise ValueError('INVALID_RELEASE_ID')
    releases = destination/'releases'
    releases.mkdir(parents=True, exist_ok=True)
    target = releases/ident
    if target.is_symlink() or releases.is_symlink(): raise ValueError('INVALID_PUBLIC_DESTINATION')
    if target.exists():
        if verify(target) != digest:
            raise ValueError('RELEASE_CONFLICT: immutable public destination differs')
    else:
        staging = Path(tempfile.mkdtemp(prefix='.staging-', dir=releases))
        try:
            for name in PAYLOADS | {'manifest.json', 'checksums.sha256'}:
                shutil.copyfile(source/name, staging/name)
            if verify(staging) != digest:
                raise ValueError('ARTIFACT_INVALID: staged copy')
            os.rename(staging, target)
        finally:
            if staging.exists(): shutil.rmtree(staging)
    (destination/'contract').mkdir(exist_ok=True)
    for name in ('manifest.schema.json', 'manifest-city.schema.json'):
        shutil.copyfile(ROOT/'contracts'/name, destination/'contract'/name)
    index_path = releases/'index.json'
    index = json.loads(index_path.read_text()).get('releases', []) if index_path.exists() else []
    entry = {k: manifest[k] for k in ('release_id', 'fixture', 'data_class', 'created_at')}
    entry['guarantee_status'] = manifest['privacy']['guarantee_status']
    index = [e for e in index if e['release_id'] != ident] + [entry]
    index.sort(key=lambda e: (e['fixture'], e['data_class'] != 'team_synthetic', e['release_id']))
    temporary = releases/'.index.pending'
    temporary.write_text(json.dumps({'source_ref': 'verified-local-release', 'releases': index}, indent=2)+'\n')
    os.replace(temporary, index_path)
    return digest
