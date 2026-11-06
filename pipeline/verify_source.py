"""Verify every supplied manifest member without modifying the package."""
import hashlib,json,sys
from pathlib import Path

def verify(root):
    m=json.loads((root/'MANIFEST.json').read_text()); failures=[]
    for f in m['files']:
        p=root/f['path']
        if not p.resolve().is_relative_to(root.resolve()): raise ValueError('Invalid manifest path')
        b=p.read_bytes()
        if len(b)!=f['bytes'] or hashlib.sha256(b).hexdigest()!=f['sha256']: failures.append(f['path'])
    if failures: raise ValueError(f'MANIFEST_MISMATCH: {len(failures)} files')
    return {'package':m['package'],'version':m['version'],'verified_members':len(m['files']),'manifest_sha256':hashlib.sha256((root/'MANIFEST.json').read_bytes()).hexdigest()}
if __name__=='__main__': print(json.dumps(verify(Path(sys.argv[1])),indent=2))
