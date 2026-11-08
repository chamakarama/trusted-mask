"""Fixed-weight comparison; output must be a new directory. No fitting."""
import sys,json,time,gc,collections,os
from pathlib import Path
R=Path(__file__).resolve().parents[3];sys.path.insert(0,str(R));os.environ['HF_HUB_OFFLINE']='1';os.environ['TOKENIZERS_PARALLELISM']='false'
import torch
torch.set_num_threads(4)
from mask.ml.privacy_v1.bundle import load_model
from mask.ml.privacy_v1.section_audit import audit_record
from mask.ml.privacy_v1.sections import SECTION_MODES
D=R/'mask/ml/privacy_v1/data/training-2026-11-07'
dev=[json.loads(l) for l in (D/'dev.authored.jsonl').read_text().splitlines()]
train=[json.loads(l) for l in (D/'train.authored.jsonl').read_text().splitlines()]
gallery_ids={r['training_record_id'] for r in json.loads((R/'demo/web-examples.json').read_text())['examples']}
gallery=[r for r in train if r['id'] in gallery_ids]
fresh=json.loads((R/'evidence/privacy-v1/training-2026-11-07/fresh-long-messages.json').read_text())
import argparse
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);args=p.parse_args()
out=args.output;out.mkdir(parents=True,exist_ok=False)
for name in ['deberta-v3-base','encoder-b','custom-a']:
 model=load_model(R/'mask/ml/privacy_v1/artifacts/reviewed-2026-11-07'/name,device='cpu'); results=[]
 for cohort,records in [('gallery',gallery),('dev',dev),('fresh',fresh)]:
  for mode in ('legacy',*SECTION_MODES):
   start=time.perf_counter(); batch=[]
   for i,r in enumerate(records):
    row=audit_record(model,r,mode);row['cohort']=cohort;batch.append(row)
    if (i+1)%10==0:print(name,cohort,mode,i+1,flush=True)
   summary={k:sum(x[k] for x in batch) for k in ('required_drops','missed_drops','required_facts','retained_facts','keep_characters_changed','unannotated_characters_changed')}
   summary.update(model=name,cohort=cohort,mode=mode,records=len(batch),unsupported=sum(x['result']['status']=='unsupported' for x in batch),seconds=round(time.perf_counter()-start,2))
   print(json.dumps(summary),flush=True);results+=batch
   with (out/(name+'-'+cohort+'-'+mode+'.json')).open('x') as f:json.dump(dict(summary=summary,records=batch),f,indent=2,ensure_ascii=False)
 del model;gc.collect()
