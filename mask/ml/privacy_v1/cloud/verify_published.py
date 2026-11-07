"""Download a public GitHub bundle, exercise the app loader and offline CPU parity."""
import argparse
import gc
import hashlib
import json
import platform
import resource
import socket
import tarfile
import time
from pathlib import Path
from unittest.mock import patch
import requests
import torch
from mask.ml.privacy_v1.bundle import load_model,write_manifest
from mask.ml.privacy_v1.engine import Protector
from mask.ml.privacy_v1.sections import section_units,CLAUSE_MODE
from mask.web.server import ModelService,_person_map
from mask.web.restore import restore_text


def main():
    p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--sha256',required=True)
    p.add_argument('--track',required=True);p.add_argument('--examples',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    args=p.parse_args();args.output.mkdir(parents=True,exist_ok=False);torch.set_num_threads(4)
    archive=args.output/'published.tar.gz';started=time.time();checksum=hashlib.sha256()
    with requests.get(args.url,stream=True,timeout=(30,900)) as response:
        if response.status_code!=200:raise RuntimeError('GitHub download HTTP '+str(response.status_code))
        with archive.open('wb') as out:
            for block in response.iter_content(1024*1024):out.write(block);checksum.update(block)
    if checksum.hexdigest()!=args.sha256:raise ValueError('Published archive hash mismatch')
    with tarfile.open(archive) as tar:tar.extractall(args.output,filter='data')
    examples=json.loads(args.examples.read_text());outputs=[];snapshots=[];timings=[]
    with patch.object(socket,'socket',side_effect=AssertionError('Network forbidden during model loading/inference')):
        start=time.perf_counter();model=load_model(args.output/args.track,'cpu');load_seconds=time.perf_counter()-start
        app=ModelService(Protector(model));engine=app.protector
        for example in examples:
            text,task=example['text'],example['task'];start=time.perf_counter()
            preview=app.preview(text,task);timings.append(time.perf_counter()-start)
            if preview['protected_text'] is None:raise ValueError('Published bundle failed real application preview')
            effective_task=task.strip() if task.strip() else text
            result=engine.protect_text(text,effective_task)
            assert preview['protected_text']==result.protected_text
            units=list(section_units(text,CLAUSE_MODE))
            section_scores=model.predict_sections(text,units,effective_task)
            snapshots.append((text,effective_task,result.protected_text,section_scores,model.detect(text)))
            mapping=_person_map(text,[vars(e) for e in result.edits],result.protected_text)
            reply=' '.join(mapping)+' [PERSON_999] [EMAIL]'
            restored=restore_text(reply,mapping)
            assert '[PERSON_999]' in restored and '[EMAIL]' in restored
            outputs.append({'id':example['id'],'text':text,'task':task,'word_count':len(text.split()),
                            'protected_text':result.protected_text,'result':result.as_dict(),
                            'application_preview_supported':True,'local_mock_reply':reply,'local_restored_reply':restored,
                            'latency_seconds':timings[-1]})
        start=time.perf_counter();engine.protect_text(examples[0]['text'],examples[0]['task']);warm=time.perf_counter()-start
        exported=args.output/'cpu-reexport';model.save(exported)
        write_manifest(exported,{'track':args.track,'evaluation_status':'cpu_parity_reexport'})
        del app,engine,model;gc.collect()
        reloaded=load_model(exported,'cpu');maximum=0.
        for text,task,expected,probabilities,detected in snapshots:
            assert Protector(reloaded).protect_text(text,task).protected_text==expected
            assert reloaded.detect(text)==detected
            after=reloaded.predict_sections(text,list(section_units(text,CLAUSE_MODE)),task)
            for a,b in zip(probabilities,after,strict=True):
                maximum=max(maximum,max(abs(a[k]-b[k]) for k in a))
        assert maximum<=1e-6
    report={'track':args.track,'url':args.url,'sha256':checksum.hexdigest(),'bytes':archive.stat().st_size,
            'public_download_verified':True,'real_application_loader':True,'offline_cpu':True,
            'cpu_reexport_reload_parity':True,'maximum_section_probability_difference':maximum,
            'cpu_threads':4,'cold_model_load_seconds':load_seconds,'first_preview_seconds':timings[0],
            'warm_pipeline_seconds':warm,'max_rss_mb':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,
            'platform':platform.platform(),'torch_version':torch.__version__,
            'elapsed_seconds':time.time()-started,'outputs':outputs}
    (args.output/'verification.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='outputs'}),flush=True)


if __name__=='__main__':main()
