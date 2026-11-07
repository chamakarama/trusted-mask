"""Final selected-bundle CPU checks, including gallery and longer diagnostic inputs."""
import json
import time
from pathlib import Path
import torch
from mask.ml.privacy_v1.bundle import load_model
from mask.ml.privacy_v1.engine import Protector
from mask.ml.privacy_v1.experiment import ROOT, canonical, parity

torch.set_num_threads(4)
train, _ = canonical()
by_id = {r['id']: r for r in train}
gallery = json.loads((ROOT / 'demo/web-examples.json').read_text())['examples']
records = [by_id[e['training_record_id']] for e in gallery]
records += json.loads((ROOT / 'evidence/privacy-v1/training-2026-11-07/fresh-long-messages.json').read_text())
results = {}
for track in ('custom-a', 'encoder-b', 'deberta-v3-base'):
    selection = Path('out') / track / 'selection.json'
    if not selection.exists():
        results[track] = {'status': 'no_selected_bundle'}
        continue
    bundle = Path(json.loads(selection.read_text())['selected']['bundle'])
    try:
        model = load_model(bundle, 'cpu')
        result = parity(model, bundle, records)
        engine = Protector(model)
        durations = []
        for record in records:
            start = time.perf_counter()
            engine.protect_text(record['text'], record['task'])
            durations.append(time.perf_counter() - start)
        result['cpu_pipeline_seconds'] = {'median': sorted(durations)[len(durations)//2], 'maximum': max(durations), 'samples': len(durations)}
        result['cpu_threads'] = torch.get_num_threads()
        result['bundle_bytes'] = sum(p.stat().st_size for p in bundle.iterdir() if p.is_file())
        results[track] = result
        del model, engine
    except Exception as error:
        results[track] = {'status': 'failed', 'error': f'{type(error).__name__}: {error}'}
    print(json.dumps({track: results[track]}), flush=True)
Path('out/final-cpu-verification.json').write_text(json.dumps(results, indent=2) + '\n')
