"""Upload one saved archive using object-scoped signed actions, then erase them."""
import argparse
import hashlib
import json
import time
from pathlib import Path
import requests


def main():
    p=argparse.ArgumentParser();p.add_argument('--instructions',type=Path,required=True);p.add_argument('--receipt',type=Path,required=True)
    args=p.parse_args();spec=json.loads(args.instructions.read_text());archive=Path(spec['archive'])
    with archive.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
    if digest!=spec['object']['oid'] or archive.stat().st_size!=spec['object']['size']:
        raise ValueError('Saved archive does not match authorized LFS object')
    try:
        action=spec['actions'].get('upload')
        if action:
            with archive.open('rb') as f:
                response=requests.put(action['href'],headers=action.get('header',{}),data=f,timeout=(30,900))
            if not 200<=response.status_code<300:raise RuntimeError('LFS upload HTTP '+str(response.status_code))
        action=spec['actions'].get('verify')
        if action:
            response=requests.post(action['href'],headers=action.get('header',{}),json=spec['object'],timeout=60)
            if not 200<=response.status_code<300:raise RuntimeError('LFS verification HTTP '+str(response.status_code))
        receipt={'track':spec['track'],'sha256':digest,'bytes':archive.stat().st_size,
                 'uploaded_at_unix':time.time(),'github_lfs_upload_completed':True,'evaluation_status':'pending'}
        args.receipt.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True)
    finally:
        args.instructions.unlink(missing_ok=True)


if __name__=='__main__':main()
