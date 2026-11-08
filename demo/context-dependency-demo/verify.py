"""Replay the synthetic context demo through the local application preview."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT))
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'

import torch
from mask.ml.privacy_v1.bundle import load_model
from mask.ml.privacy_v1.engine import Protector
from mask.web.server import ModelService


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    torch.set_num_threads(4)
    text = (HERE / 'message.txt').read_text().rstrip('\n')
    tasks = {name: (HERE / f'{name}-task.txt').read_text().strip()
             for name in ('manager', 'clinician')}
    required = (
        'Fit to return to desk duties from 18 November.',
        'No lifting over 5 kg or standing for more than twenty minutes until review on 9 December.',
        'My manager said working from home on Tuesdays and Thursdays would be fine.',
    )
    medical = text.split('\n\n')[-1]
    patient = next(line.removeprefix('Patient: ') for line in text.splitlines() if line.startswith('Patient: '))
    outputs = []
    with patch.object(socket, 'socket', side_effect=AssertionError('Offline inference only')):
        model = load_model(args.model, 'cpu')
        app = ModelService(Protector(model))
        for name in ('manager', 'clinician', 'manager'):
            started = time.perf_counter()
            preview = app.preview(text, tasks[name], client='context-demo')
            elapsed = time.perf_counter() - started
            output = preview['protected_text']
            assert isinstance(output, str), preview['status']
            checks = {
                'supported_preview': preview['status'] in ('ready', 'needs_review'),
                'name_aliased': patient not in output and 'Patient: [PERSON_1]' in output,
                'work_facts_preserved': all(quote in output for quote in required),
                'protected_provider_payload': patient not in preview['provider_request']['user'],
            }
            if name == 'manager':
                checks['psychiatric_details_removed'] = all(
                    quote not in output for quote in ('bipolar', 'lamotrigine', 'sleep', 'dose'))
            else:
                checks['medical_details_preserved'] = medical in output
                checks['only_name_changes'] = output == text.replace(patient, '[PERSON_1]')
            assert all(checks.values()), checks
            outputs.append({'context': name, 'task': tasks[name], 'seconds': elapsed,
                            'checks': checks, 'preview': preview})
            print(json.dumps({'context': name, 'checks': checks, 'protected_text': output}), flush=True)
    assert outputs[0]['preview']['protected_text'] == outputs[2]['preview']['protected_text']
    report = {
        'model_id': model.model_id,
        'model_manifest_sha256': hashlib.sha256((args.model / 'manifest.json').read_bytes()).hexdigest(),
        'source_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'message_sha256': hashlib.sha256(text.encode()).hexdigest(),
        'source': text, 'word_count': len(text.split()), 'device': 'cpu', 'threads': 4,
        'switch_back_reproduces_manager_output': True,
        'limitations': [
            'Synthetic demo revised after testing two more natural introductions with both tasks.',
            'Complete local Python application preview; no live browser or provider request.',
            'No model weights, thresholds or production defaults changed.',
        ],
        'outputs': outputs,
    }
    (args.output / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    for row in outputs[:2]:
        # Preserve the actual model output, including trailing blank lines.
        (args.output / f"{row['context']}-protected.txt").write_text(row['preview']['protected_text'])


if __name__ == '__main__':
    main()
