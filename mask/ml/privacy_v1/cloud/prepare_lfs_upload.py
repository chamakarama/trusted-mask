"""Create object-scoped GitHub LFS upload instructions; never export GitHub token."""
import argparse
import base64
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlparse
import requests


def main():
    p=argparse.ArgumentParser();p.add_argument('--ready',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    args=p.parse_args();ready=json.loads(args.ready.read_text())
    token=subprocess.check_output(['gh','auth','token'],text=True).strip()
    auth=base64.b64encode(('x-access-token:'+token).encode()).decode()
    obj={'oid':ready['sha256'],'size':ready['bytes']}
    response=requests.post('https://github.com/Chintufp/Since-AI-hackathon---WAWS.git/info/lfs/objects/batch',
        headers={'Authorization':'Basic '+auth,'Accept':'application/vnd.git-lfs+json','Content-Type':'application/vnd.git-lfs+json'},
        json={'operation':'upload','transfers':['basic'],'objects':[obj]},timeout=60)
    if response.status_code!=200:raise RuntimeError('GitHub LFS batch HTTP '+str(response.status_code))
    entry=response.json()['objects'][0]
    if entry.get('error'):raise RuntimeError('GitHub LFS object rejected: '+str(entry['error'].get('code')))
    actions=entry.get('actions',{})
    # Basic GitHub credentials must never be sent to the temporary GPU machine.
    for action in actions.values():
        if any(token in str(v) or auth in str(v) for v in [action.get('href',''),*action.get('header',{}).values()]):
            raise RuntimeError('Refusing to export a broad GitHub credential')
    value={'object':obj,'actions':actions,'archive':ready['archive'],'track':ready['track']}
    fd=os.open(args.output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:json.dump(value,f)
    print(json.dumps({'sha256':obj['oid'],'bytes':obj['size'],'already_uploaded':not bool(actions.get('upload')),
                      'action_hosts':{k:urlparse(v['href']).hostname for k,v in actions.items()}}))


if __name__=='__main__':main()
