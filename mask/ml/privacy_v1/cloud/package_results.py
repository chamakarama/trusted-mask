"""Archive selected successful bundles and compact evidence before VM deletion."""
import hashlib
import json
import tarfile
from pathlib import Path

root = Path('out')
destination = Path('deliverables')
destination.mkdir(exist_ok=False)
summary = {}
# Early reports used a generic dev-set limitation sentence for every split.
# Correct only that reporting metadata, retaining its prior value and checksum.
for path in sorted(root.rglob('*.json')):
    value = json.loads(path.read_text())
    if not isinstance(value, dict) or 'counts' not in value or 'limitations' not in value:
        continue
    if value['limitations'][0] != '50 model-reviewed short dev records; no human audit or independent final test':
        continue
    role = 'training_demonstration' if path.name == 'gallery.json' else 'fresh_diagnostic' if path.name.startswith('fresh') else 'dev'
    value['reporting_metadata_correction'] = {'previous_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'previous_limitation': value['limitations'][0], 'metrics_and_predictions_unchanged': True}
    value['evaluation_role'] = role
    value['limitations'][0] = {
        'dev': 'Model-reviewed short dev records; no human audit or independent final test',
        'training_demonstration': 'Training demonstrations; not held-out generalisation evidence',
        'fresh_diagnostic': 'Fresh agent-authored long diagnostics; not independently audited or used for selection',
    }[role]
    path.write_text(json.dumps(value, indent=2) + '\n')
for track in ('custom-a', 'encoder-b', 'deberta-v3-base'):
    selection = root / track / 'selection.json'
    if not selection.exists():
        summary[track] = {'status': 'incomplete_or_failed', 'logs': f'out/logs/{track}-smoke.log'}
        continue
    chosen = json.loads(selection.read_text())['selected']
    bundle = Path(chosen['bundle'])
    archive = destination / f'{track}.tar.gz'
    with tarfile.open(archive, 'w:gz', compresslevel=1) as tar:
        tar.add(bundle, arcname=track)
        notice = Path('mask/ml/privacy_v1/licenses') / ('minilm' if track == 'encoder-b' else track)
        if notice.exists():
            tar.add(notice, arcname='third_party/' + track)
    summary[track] = {'status': 'selected', 'bundle': str(bundle), 'selection': chosen,
                      'cpu_parity': json.loads((root / track / 'cpu-parity.json').read_text()) if (root / track / 'cpu-parity.json').exists() else None}
archive = destination / 'training-evidence.tar.gz'
with tarfile.open(archive, 'w:gz') as tar:
    for path in sorted(root.rglob('*')):
        if path.is_file() and path.suffix not in ('.pt', '.npz', '.safetensors') and path.stat().st_size < 10_000_000:
            # Tokenizer/base configs stay inside each selected bundle; avoid copying all epoch tokenizers.
            if (path.parent / 'manifest.json').exists():
                continue
            tar.add(path, arcname=str(path))
    for path in ('cloud-tests.log', 'setup.log', 'SOURCE_COMMIT', 'requirements-cloud.txt'):
        if Path(path).exists():
            tar.add(path)
(destination / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
hashes = {}
for path in sorted(destination.iterdir()):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    hashes[path.name] = {'sha256': h.hexdigest(), 'bytes': path.stat().st_size}
(destination / 'SHA256SUMS').write_text(''.join(f'{v["sha256"]}  {k}\n' for k, v in hashes.items()))
print(json.dumps(hashes, indent=2))
