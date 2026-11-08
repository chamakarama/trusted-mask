"""Run the original SafePrompt scorer, with explicit comparison scopes."""
import argparse
import json
from pathlib import Path
import subprocess

p = argparse.ArgumentParser()
p.add_argument('--upstream', required=True, type=Path)
p.add_argument('--data', required=True, type=Path)
p.add_argument('--predictions', required=True, type=Path)
p.add_argument('--out', required=True, type=Path)
a = p.parse_args()
for field in ('upstream', 'data', 'predictions', 'out'):
    setattr(a, field, getattr(a, field).resolve())
a.out.mkdir(exist_ok=False)
rows = [json.loads(x) for x in a.data.read_text().splitlines() if x.strip()]
ids = {r['id'] for r in rows}
assert len(rows) == len(ids) == 1500
labels = ['EMAIL', 'PHONE', 'IBAN', 'PAYMENT_CARD', 'IP_ADDRESS', 'VAT_ID', 'NATIONAL_ID']
scopes = {'official': labels, 'names': ['PERSON'], 'secrets': ['SECRET'],
          'with_names': labels + ['PERSON'], 'all_labels': labels + ['PERSON', 'SECRET']}
for model in ('safeprompt', 'mask-reviewed-base', 'mask-base-epoch2', 'mask-mini'):
    pred = a.predictions / (model + '.jsonl')
    if model != 'safeprompt':
        predictions = [json.loads(x) for x in pred.read_text().splitlines() if x.strip()]
        assert len(predictions) == 1500 and {r['id'] for r in predictions} == ids
        assert all(isinstance(r['findings'], list) for r in predictions)
    for scope, selected in scopes.items():
        out = a.out / f'{model}_{scope}.json'
        cmd = ['node', '--import', 'tsx', 'eval/bench/evaluate.ts', '--data', str(a.data),
               '--labels', ','.join(selected), '--out', str(out)]
        if model != 'safeprompt':
            cmd += ['--pred', str(pred)]
        subprocess.run(cmd, cwd=a.upstream, check=True, capture_output=True, text=True)
        result = json.loads(out.read_text())
        result.pop('data', None)
        result.pop('ms_per_document', None)
        result.pop('ms_per_10k_chars', None)
        out.write_text(json.dumps(result, indent=2) + '\n')
        print(model, scope, result['overall']['f1'], flush=True)
