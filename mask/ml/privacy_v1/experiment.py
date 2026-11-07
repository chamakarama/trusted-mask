"""Bounded canonical-data experiments; dev is evaluation-only, never an optimizer input."""
import argparse
import gc
import json
import os
import platform
import subprocess
import time
from pathlib import Path
from .bundle import load_model, write_manifest
from .contracts import Span
from .data import digest, load_records, validate_records
from .engine import Protector, RulesModel
from .evaluate import evaluate

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / 'mask/ml/privacy_v1/data/training-2026-11-07'
HASHES = {'train.jsonl': 'df1c63afaea9fefd4193459e7ae4cdbeb05db2897d59f44b92d2d7bfcdaac1d9',
          'dev.jsonl': 'f9ad0954b8904e8d8725095cfe2f409bef3992c8895bc11855ee163a1a0e857b'}


def write(path, value):
    with Path(path).open('x') as f:
        json.dump(value, f, indent=2, ensure_ascii=False)
        f.write('\n')


def canonical():
    for name, expected in HASHES.items():
        if digest(DATA / name) != expected:
            raise ValueError(f'Canonical data hash mismatch: {name}')
    train, dev = (load_records(DATA / name) for name in HASHES)
    assert len(train) == 516 and len(dev) == 50
    assert all(r['split'] == 'train' for r in train)
    assert all(r['split'] == 'dev' for r in dev)
    validate_records(train + dev)
    return train, dev


class GoalAgnostic:
    def __init__(self, base):
        self.base = base
        self.model_id = base.model_id + '-goal-agnostic'
    def __getattr__(self, name):
        return getattr(self.base, name)
    def predict(self, text, span, task, context=''):
        return self.base.predict(text, span, 'Summarise the information.', context)


def diagnostics(model, records, destination):
    outputs = []
    report = evaluate(model, records, outputs)
    # Compare matched messages under different intended uses; this is sensitivity,
    # not proof that a changed response is correct. Gold metrics are separate.
    groups = {}
    for row in outputs:
        groups.setdefault(row['text'], []).append(row)
    pairs = [g for g in groups.values() if len({r['task'] for r in g}) > 1]
    report['context_sensitivity'] = {
        'task_swap_groups': len(pairs),
        'groups_with_changed_output': sum(len({r['result']['protected_text'] for r in g}) > 1 for g in pairs)}
    splits = {r['split'] for r in records}
    role = 'dev' if splits == {'dev'} else 'training_demonstration' if splits == {'train'} else 'fresh_diagnostic'
    report['evaluation_role'] = role
    report['limitations'][0] = {
        'dev': 'Model-reviewed short dev records; no human audit or independent final test',
        'training_demonstration': 'Training demonstrations; not held-out generalisation evidence',
        'fresh_diagnostic': 'Fresh agent-authored long diagnostics; not independently audited or used for selection',
    }[role]
    write(destination, report)
    write(destination.with_suffix('.outputs.json'), outputs)
    return report


def selection_key(report):
    # Predetermined lexicographic selection: avoid unsupported outputs, then misses,
    # lost required facts, unnecessary edits, then missed section drops.
    c = report['counts']
    return (c['unsupported'], c['required_removal'] - c['required_removed'],
            c['required_facts'] - c['facts_retained'],
            c['gold_keep_characters_changed'] + c['benign_characters_changed'],
            c['required_section_drops'] - c['sections_dropped'])


def preflight(model, records):
    import torch
    tokenizer = model.tokenizer
    markers = [tokenizer.encode(m, add_special_tokens=False) for m in ('[unused0]', '[unused1]')]
    assert all(len(m) == 1 for m in markers) and markers[0] != markers[1]
    lengths, actions, offsets_checked, whitespace_tokens = [], [], 0, 0
    for record in records:
        text = record['text']
        encoded = tokenizer(text, return_offsets_mapping=True)
        lengths.append(len(encoded['input_ids']))
        for a, b in encoded['offset_mapping']:
            assert 0 <= a <= b <= len(text)
            if a != b:
                a, b = model._offset(text, a, b)
                if a == b:
                    # SentencePiece can emit a standalone whitespace token. The
                    # detector skips it and training masks its target with -100.
                    whitespace_tokens += 1
                    continue
                assert text[a:b].strip()
                offsets_checked += 1
        for entry in record['spans']:
            span = Span(entry['start'], entry['end'], entry['label'])
            batch = model._action_input(text, span, record['task'], record.get('context', ''))
            ids = batch['input_ids'][0].tolist()
            assert ids.count(markers[0][0]) == 1 and ids.count(markers[1][0]) == 1
            assert ids.index(markers[0][0]) < ids.index(markers[1][0])
            actions.append(len(ids))
    assert max(lengths) <= 512 and max(actions) <= 512
    record = records[0]
    span = Span(**{k: record['spans'][0][k] for k in ('start', 'end', 'label')})
    model.predict(record['text'], span, record['task']).validate()
    model.detect(record['text'])
    return {'fast_tokenizer': tokenizer.is_fast, 'marker_ids': markers,
            'tokenizer_size': len(tokenizer), 'embedding_rows': model.net.backbone.get_input_embeddings().num_embeddings,
            'config_vocab_size': model.net.backbone.config.vocab_size,
            'max_detection_tokens': max(lengths), 'max_action_tokens': max(actions),
            'offsets_checked': offsets_checked, 'whitespace_tokens_ignored': whitespace_tokens, 'source': model.source,
            'torch_version': torch.__version__}


def parity(model, directory, records):
    """Compare current inference to offline CPU reload, then CPU re-export/reload."""
    import socket
    import tempfile
    from unittest.mock import patch
    import numpy as np
    with patch.object(socket, 'socket', side_effect=AssertionError('Network forbidden during inference')):
        loaded = load_model(directory, 'cpu')
        maximum = 0.0
        for record in records:
            text, task = record['text'], record['task']
            assert model.detect(text) == loaded.detect(text)
            before, after = Protector(model).protect_text(text, task), Protector(loaded).protect_text(text, task)
            assert before.protected_text == after.protected_text and before.status == after.status
            for entry in record['spans'][:3]:
                span = Span(entry['start'], entry['end'], entry['label'])
                a, b = model.predict(text, span, task), loaded.predict(text, span, task)
                for x, y in ((a.actions, b.actions), (a.relevance, b.relevance)):
                    maximum = max(maximum, max(abs(x[k] - y[k]) for k in x))
                    assert np.allclose(list(x.values()), list(y.values()), atol=2e-5, rtol=2e-4)
        with tempfile.TemporaryDirectory() as tmp:
            exported = Path(tmp) / 'bundle'
            loaded.save(exported)
            write_manifest(exported, {'track': json.loads((directory / 'manifest.json').read_text())['track']})
            again = load_model(exported, 'cpu')
            for record in records:
                assert loaded.detect(record['text']) == again.detect(record['text'])
                assert Protector(loaded).protect_text(record['text'], record['task']).protected_text == Protector(again).protect_text(record['text'], record['task']).protected_text
        return {'passed': True, 'offline_cpu': True, 'records': len(records), 'max_probability_difference': maximum,
                'cpu_reexport_reload': True}


def main():
    # Preserve the historical 516-record experiment exactly. The new version
    # requires an explicit frozen manifest and uses a separate objective path.
    import sys
    if '--section-split' in sys.argv:
        from .section_training import main as section_main
        sys.argv[sys.argv.index('--section-split')] = '--split'
        return section_main()
    parser = argparse.ArgumentParser()
    parser.add_argument('--track', choices=('custom-a', 'encoder-b', 'deberta-v3-base', 'rules'), required=True)
    parser.add_argument('--base', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--device', default='cpu', choices=('cpu', 'cuda'))
    parser.add_argument('--smoke', action='store_true')
    parser.add_argument('--epochs', type=int, default=2)
    parser.add_argument('--learning-rates', type=float, nargs='+', default=[2e-5, 5e-5])
    args = parser.parse_args()
    if not 1 <= args.epochs <= 3 or not 1 <= len(args.learning_rates) <= 3 or any(not 0 < lr <= 1e-3 for lr in args.learning_rates):
        parser.error('Bounded search requires 1–3 epochs and 1–3 learning rates in (0, .001]')
    train, dev = canonical()
    args.output.mkdir(parents=True, exist_ok=False)
    write(args.output / 'run.json', {'args': vars(args) | {'output': str(args.output), 'base': str(args.base)},
          'dataset_sha256': HASHES, 'train_records': len(train), 'dev_records': len(dev),
          'git_commit': Path('SOURCE_COMMIT').read_text().strip() if Path('SOURCE_COMMIT').exists() else
                        os.environ.get('MASK_SOURCE_COMMIT') or subprocess.check_output(['git','rev-parse','HEAD'], text=True).strip(),
          'code_sha256': {p.name: digest(p) for p in sorted(Path(__file__).parent.glob('*.py'))},
          'platform': platform.platform(), 'selection_order': ['unsupported', 'privacy_misses', 'lost_facts', 'unnecessary_character_edits', 'missed_section_drops']})
    if args.track == 'rules':
        diagnostics(RulesModel(), dev, args.output / 'dev.json')
        return
    started, candidates = time.perf_counter(), []

    def checkpoint(model, name, details):
        path = args.output / name
        model.save(path)
        write_manifest(path, {'track': args.track, 'dataset_sha256': HASHES['train.jsonl'],
                       'train_records': 12 if args.smoke and args.track == 'custom-a' else 516,
                       'training': details, 'source': getattr(model, 'source', None), 'device': args.device,
                       'elapsed_seconds': time.perf_counter() - started, 'calibrated': False})
        report = diagnostics(model, dev, args.output / (name + '.dev.json'))
        candidates.append({'bundle': str(path), 'key': selection_key(report), 'training': details})
        print(json.dumps(candidates[-1]), flush=True)
        return path

    if args.track == 'custom-a':
        from .custom import CustomModel
        for c in ([1.] if args.smoke else [.3, 1., 3.]):
            model = CustomModel.train(train[:12] if args.smoke else train, c=c, max_iter=30 if args.smoke else 500)
            name = f'c-{c:g}'
            path = checkpoint(model, name, {'C': c, 'max_iter': 30 if args.smoke else 500,
                              'smoke_subset_records': 12 if args.smoke else None})
            write(args.output / (name + '.parity.json'), parity(model, path, dev[:3]))
    else:
        import torch
        from .encoder import EncoderModel
        torch.set_num_threads(4)
        for lr in (args.learning_rates[:1] if args.smoke else args.learning_rates):
            model = EncoderModel.from_pretrained(args.base, args.device)
            write(args.output / f'lr-{lr:g}.preflight.json', preflight(model, train + dev))
            def on_epoch(current, epoch, details, optimizer):
                path = checkpoint(current, f'lr-{lr:g}-epoch-{epoch}', details)
                # Local trusted training state; not part of inference bundle.
                torch.save({'optimizer': optimizer.state_dict(), 'torch_rng': torch.get_rng_state(),
                            'epoch': epoch, 'steps': details['steps']}, args.output / f'{path.name}.optimizer.pt')
                if args.smoke:
                    write(args.output / f'{path.name}.parity.json', parity(current, path, dev[:3]))
            model.train_records(train, epochs=1 if args.smoke else args.epochs,
                max_steps=12 if args.smoke else None, learning_rate=lr, on_epoch=on_epoch)
            del model
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
    chosen = min(candidates, key=lambda c: c['key'])
    write(args.output / 'selection.json', {'selected': chosen, 'candidates': candidates, 'smoke_only': args.smoke,
          'elapsed_seconds': time.perf_counter() - started})
    if not args.smoke:
        model = load_model(chosen['bundle'], args.device)
        write(args.output / 'cpu-parity.json', parity(model, Path(chosen['bundle']), dev[:5]))
        diagnostics(GoalAgnostic(model), dev, args.output / 'goal-agnostic.dev.json')


if __name__ == '__main__':
    main()
