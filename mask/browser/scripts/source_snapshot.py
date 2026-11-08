"""Pin browser inference to committed Python sources, never another chat's edits."""
import json
from pathlib import Path
import subprocess
ROOT = Path(__file__).resolve().parents[3]
BROWSER = ROOT / 'mask/browser'

def snapshot():
    config = json.loads((BROWSER / 'runtime-source.json').read_text())
    commit = config['commit']
    if len(commit) != 40 or any(c not in '0123456789abcdef' for c in commit):
        raise ValueError('Expected a full source commit')
    source = commit
    if subprocess.run(['git','cat-file','-e',f'{commit}^{{commit}}'],cwd=ROOT,capture_output=True).returncode:
        # This repository's history was rewritten to drop the organiser dataset; the pinned
        # commit's Python sources are identical at its rewritten ID (see evidence/COMMIT_IDS.md).
        source = config.get('commit_in_this_repository', commit)
        if len(source) != 40 or any(c not in '0123456789abcdef' for c in source):
            raise ValueError('Expected a full source commit')
    destination = BROWSER / '.cache/source' / commit
    if not (destination / '.complete').exists():
        paths = subprocess.check_output(['git','ls-tree','-r','--name-only',source,'mask/ml/privacy_v1'],cwd=ROOT,text=True).splitlines()
        for name in paths:
            if not name.endswith('.py'): continue
            target = destination / name
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(subprocess.check_output(['git','show',f'{source}:{name}'],cwd=ROOT))
        for directory in ('mask','mask/ml','mask/ml/privacy_v1'):
            init = destination / directory / '__init__.py'
            if not init.exists(): init.write_text('')
        (destination / '.complete').write_text(commit)
    return destination
