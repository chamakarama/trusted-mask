"""Package an already verified release; never draw noise or copy private inputs."""
from pathlib import Path
import argparse,hashlib,zipfile
from pipeline.artifact import verify,PAYLOADS

def bundle(release:Path,output:Path):
    digest=verify(release)
    if output.resolve().is_relative_to(release.resolve()):raise ValueError('OUTPUT_MUST_BE_OUTSIDE_IMMUTABLE_RELEASE')
    output.parent.mkdir(parents=True,exist_ok=True)
    members=sorted(PAYLOADS|{'manifest.json','checksums.sha256'})
    # Exclusive creation preserves an existing archive, including user work.
    with output.open('xb') as stream:
        with zipfile.ZipFile(stream,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
            for name in members:
                info=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));info.create_system=3;info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
                z.writestr(info,(release/name).read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
    with zipfile.ZipFile(output) as z:
        if z.namelist()!=members:raise ValueError('ARCHIVE_MEMBERS_MISMATCH')
        for name in members:
            if z.read(name)!=(release/name).read_bytes():raise ValueError('ARCHIVE_BYTES_MISMATCH')
    return {'manifest_sha256':digest,'archive_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'members':len(members),'noise_draws':0}

if __name__=='__main__':
    import json
    p=argparse.ArgumentParser();p.add_argument('--release',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();print(json.dumps(bundle(a.release,a.output)))
