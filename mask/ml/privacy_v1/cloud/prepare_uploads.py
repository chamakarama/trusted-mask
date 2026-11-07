"""Run on the authenticated control machine, never on the training VM."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import requests

parser = argparse.ArgumentParser()
parser.add_argument('--bucket', required=True)
parser.add_argument('--prefix', required=True)
parser.add_argument('--hashes', type=Path, required=True, help='JSON filename -> sha256, bytes')
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()
sessions = {}
for name, info in json.loads(args.hashes.read_text()).items():
    if Path(name).name != name:
        raise ValueError('Artifact names must be basenames')
    response = requests.post(f'https://storage.googleapis.com/upload/storage/v1/b/{args.bucket}/o',
        params={'uploadType': 'resumable', 'name': args.prefix.rstrip('/') + '/' + name, 'ifGenerationMatch': '0'},
        headers={'Authorization': 'Bearer ' + token, 'X-Upload-Content-Length': str(info['bytes'])},
        json={'metadata': {'sha256': info['sha256']}, 'contentType': 'application/octet-stream'}, timeout=60)
    response.raise_for_status()
    sessions[name] = {'url': response.headers['Location'], 'sha256': info['sha256']}
fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    json.dump(sessions, f)
print(f'Created {len(sessions)} object-scoped upload sessions; account token stays on control machine.')
