"""Upload via object-scoped resumable sessions; no Google account credential on VM."""
import base64
import hashlib
import json
from pathlib import Path
import requests

sessions_path = Path('upload-sessions.json')
sessions = json.loads(sessions_path.read_text())
verified = {}
for name, session in sessions.items():
    path = Path('deliverables') / name
    md5, sha = hashlib.md5(), hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            md5.update(chunk)
            sha.update(chunk)
    assert sha.hexdigest() == session['sha256']
    with path.open('rb') as f:
        response = requests.put(session['url'], data=f,
            headers={'Content-Length': str(path.stat().st_size), 'Content-Type': 'application/octet-stream'}, timeout=900)
    if not response.ok:
        raise RuntimeError(f'Upload failed for {name}: HTTP {response.status_code}')
    metadata = response.json()
    assert metadata['md5Hash'] == base64.b64encode(md5.digest()).decode()
    assert metadata['metadata']['sha256'] == sha.hexdigest()
    verified[name] = {'uri': 'gs://' + metadata['bucket'] + '/' + metadata['name'],
                      'generation': metadata['generation'], 'bytes': int(metadata['size']),
                      'sha256': sha.hexdigest(), 'md5Hash': metadata['md5Hash'],
                      'crc32c': metadata.get('crc32c'), 'server_checksum_verified': True}
    print(json.dumps(verified[name]), flush=True)
Path('deliverables/upload-verification.json').write_text(json.dumps(verified, indent=2) + '\n')
sessions_path.unlink()
