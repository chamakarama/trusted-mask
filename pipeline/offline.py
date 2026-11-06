"""Export a reviewed static build for local offline playback; no source/private directories."""
from pathlib import Path
import argparse,hashlib,json,re,zipfile
from pipeline.artifact import verify,PAYLOADS

README='''RouteSafe E1 offline planner — synthetic benchmark, pending privacy review.
Extract and run: python -m http.server 8768 --bind 127.0.0.1 --directory planner
Then open the local server in a browser. No internet is needed for the schematic map or deterministic presets. No live AI is connected. Never serve the source repository or private publisher directory.
Data/docs: TrustED PETs Proving Ground 2026, Since AI ry, CC BY 4.0.
Public geography: GeoNames (CC BY 4.0), via github.com/zauberware/postal-codes-json-xml-csv; points are schematic public-stop centroids, not road geometry.
This is an internal review artifact, not a deployed site or submitted competition entry. Review manifest/definitions and the explicit utility limitations before making claims.
'''

def package(build:Path,output:Path):
    if output.resolve().is_relative_to(build.resolve()):raise ValueError('OUTPUT_MUST_BE_OUTSIDE_BUILD')
    index=json.loads((build/'releases/index.json').read_text())
    receipts={}
    for entry in index['releases']:
        name=entry['release_id']
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}',name):raise ValueError('INVALID_RELEASE_ID')
        receipts[name]=verify(build/'releases'/name)
    allowed={'index.html','releases/index.json','contract/manifest.schema.json'}
    for name in receipts:
        allowed|={f'releases/{name}/{member}' for member in PAYLOADS|{'manifest.json','checksums.sha256'}}
    members=[('README.txt',README.encode())]
    for path in sorted(build.rglob('*')):
        if path.is_symlink():raise ValueError('SYMLINK_IN_BUILD')
        if not path.is_file():continue
        name=path.relative_to(build).as_posix()
        if name not in allowed and not re.fullmatch(r'assets/[A-Za-z0-9_-]+\.(js|css)',name):raise ValueError('UNEXPECTED_BUILD_PATH')
        members.append(('planner/'+name,path.read_bytes()))
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open('xb') as fp:
        with zipfile.ZipFile(fp,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
            for name,body in members:
                info=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));info.create_system=3;info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
                z.writestr(info,body,compresslevel=9)
    return {'members':len(members),'archive_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'release_manifest_hashes':receipts,'noise_draws':0,'scope':'static build plus reviewed release files; no publisher source or ledger'}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--build',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();print(json.dumps(package(a.build,a.output)))
