"""Run with python -m pipeline. Private publisher and public verifier are separate commands."""
from pathlib import Path
import argparse, hashlib, json, math, os, shutil, subprocess, tempfile
from pipeline import artifact
from pipeline.mobility import load,prepare,EPS
from privacy.mechanism import draw
from privacy.ledger import reserve,commit
from privacy.provenance import publisher_revision,runtime_identity

POLICY='e1-experimental-32-64-64-epsilon1-v1'
def publish(input_path,output,ledger,release_id):
    code=publisher_revision()
    runtime=runtime_identity()
    domains,raw,bounded,geo=prepare(*load(input_path))
    # Full input digest stays private. One request identity includes code/policy/input.
    h=hashlib.sha256((POLICY+code+json.dumps(runtime,sort_keys=True)).encode())
    for name in ('taps.csv','stops.csv'):
        with (input_path/name).open('rb') as f:
            for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    identity=h.hexdigest()
    epsilon=math.fsum(EPS.values())
    if epsilon!=1.0: raise ValueError('UNKNOWN_POLICY: E1 schema requires total epsilon 1')
    receipt=reserve(ledger,release_id,identity,epsilon=epsilon)
    if receipt:
        if artifact.verify(output)!=receipt: raise ValueError('ARTIFACT_INVALID: committed receipt')
        return {'release_id':release_id,'reused':True,'manifest_sha256':receipt}
    # Any exception after reservation remains charged, even before an actual draw.
    if output.exists(): raise ValueError('RELEASE_CONFLICT: output exists')
    payload=artifact.build(release_id,code,domains,draw(bounded),geo)
    output.parent.mkdir(parents=True,exist_ok=True)
    staging=Path(tempfile.mkdtemp(prefix='.routesafe-',dir=output.parent))/'bundle'
    artifact.write(staging,payload); digest=artifact.verify(staging)
    # Same filesystem rename makes the complete bundle visible atomically. Ledger recovery fails closed.
    os.rename(staging,output); staging.parent.rmdir()
    commit(ledger,release_id,identity,digest)
    return {'release_id':release_id,'reused':False,'manifest_sha256':digest}

def main():
    ap=argparse.ArgumentParser(); sub=ap.add_subparsers(dest='cmd',required=True)
    p=sub.add_parser('publish'); p.add_argument('--input',type=Path,required=True); p.add_argument('--output',type=Path,required=True); p.add_argument('--ledger',type=Path,required=True); p.add_argument('--release-id',required=True)
    p=sub.add_parser('verify-release');p.add_argument('--release',type=Path,required=True)
    args=ap.parse_args()
    if args.cmd=='publish': result=publish(args.input,args.output,args.ledger,args.release_id)
    else: result={'manifest_sha256':artifact.verify(args.release),'verified':True}
    print(json.dumps(result))
if __name__=='__main__': main()
