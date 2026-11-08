"""Frozen Mask detector evaluation, no fitting or threshold changes.

Produces confirmed detection candidates for the upstream SafePrompt scorer.
This does not run task-relevance editing or measure final redaction utility.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
p = argparse.ArgumentParser()
p.add_argument('--source', required=True)
p.add_argument('--model', required=True)
p.add_argument('--data', required=True)
p.add_argument('--out', required=True)
args = p.parse_args()
sys.path.insert(0, args.source)
import torch
torch.set_num_threads(4)
from mask.ml.privacy_v1.encoder import EncoderModel
from mask.ml.privacy_v1.candidates import build_candidates

data = Path(args.data)
rows = [json.loads(x) for x in data.read_text().splitlines() if x.strip()]
assert len(rows) == 1500
assert len({r['id'] for r in rows}) == len(rows)
assert hashlib.sha256(data.read_bytes()).hexdigest() == '10baf58447a91326f44295760e345fcfc81a97262889811cb6e69e1e4eac5980'
out = Path(args.out)
assert not out.exists(), 'Do not overwrite an evaluation run'
model = EncoderModel.load(args.model)
print(json.dumps({'loaded': model.model_id, 'documents': len(rows)}), flush=True)
start = time.monotonic()
failures = []
with out.open('w') as stream:
    for i, row in enumerate(rows):
        try:
            learned = model.detect(row['text'])
            entities, sections, pending = build_candidates(row['text'], learned)
            findings = [{'entity': s.label, 'start': s.start, 'end': s.end} for s in entities]
            prediction = {'id': row['id'], 'findings': findings}
        except Exception as error:
            # A failure remains in the denominator. An empty list must be present,
            # otherwise the upstream scorer falls back to running SafePrompt.
            failures.append({'id': row['id'], 'error': type(error).__name__, 'message': str(error)})
            prediction = {'id': row['id'], 'findings': [], 'error': type(error).__name__}
        stream.write(json.dumps(prediction, ensure_ascii=False) + '\n')
        if (i + 1) % 100 == 0:
            stream.flush()
            print(json.dumps({'completed': i + 1, 'elapsed_seconds': round(time.monotonic()-start, 1), 'failures': len(failures)}), flush=True)
elapsed = time.monotonic() - start
metadata = {'model': str(Path(args.model).resolve()), 'model_id': model.model_id,
            'source_commit': '0b3854dfb65eaffca6714595ae6daf961d3f421e',
            'model_weights_sha256': hashlib.sha256((Path(args.model)/'model.safetensors').read_bytes()).hexdigest(),
            'dataset_sha256': hashlib.sha256(data.read_bytes()).hexdigest(),
            'documents': len(rows), 'elapsed_seconds': elapsed, 'threads': 4,
            'mode': 'confirmed detector candidates, not final privacy edits',
            'failures': failures, 'torch': torch.__version__}
out.with_suffix('.metadata.json').write_text(json.dumps(metadata, indent=2)+'\n')
print(json.dumps({'complete': True, 'elapsed_seconds': round(elapsed,1), 'failures': len(failures)}), flush=True)
