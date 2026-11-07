"""Content-addressed snapshots for a local operator run; never include truth directories."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile


def fingerprint(folder, names):
    records = []
    for name in sorted(names):
        path = Path(folder)/name
        if path.is_symlink() or not path.is_file(): raise ValueError('INVALID_INPUT_FILE')
        h = hashlib.sha256()
        with path.open('rb') as stream:
            for chunk in iter(lambda:stream.read(1024*1024),b''): h.update(chunk)
        records.append({'name':name,'sha256':h.hexdigest()})
    return hashlib.sha256(json.dumps(records,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def snapshot(folder, names, destination):
    folder, destination = Path(folder), Path(destination)
    before = fingerprint(folder,names)
    destination.mkdir(parents=True,exist_ok=True)
    target = destination/before
    if target.exists():
        if fingerprint(target,names) != before: raise ValueError('SNAPSHOT_CHANGED')
        return target,before
    temporary=Path(tempfile.mkdtemp(prefix='.snapshot-',dir=destination))
    try:
        for name in names: shutil.copyfile(folder/name,temporary/name)
        if fingerprint(folder,names) != before or fingerprint(temporary,names) != before:
            raise ValueError('INPUT_CHANGED: retry validation on stable files')
        os.rename(temporary,target)
    finally:
        if temporary.exists(): shutil.rmtree(temporary)
    return target,before
