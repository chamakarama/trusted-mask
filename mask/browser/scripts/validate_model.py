"""Generate actual Python references and compare optimized final edits, never targets."""
import copy
import json
from pathlib import Path
import sys
import time
ROOT = Path(__file__).resolve().parents[3]
BROWSER = ROOT / 'mask/browser'
from source_snapshot import snapshot
SOURCE_ROOT = snapshot()
sys.path.insert(0, str(SOURCE_ROOT))
sys.path.insert(0, str(BROWSER / '.tools/python'))
import torch
import onnxruntime as ort
from mask.ml.privacy_v1.bundle import load_model
from mask.ml.privacy_v1.engine import Protector

import argparse
parser=argparse.ArgumentParser()
parser.add_argument('--key', choices=['mask1','mask2','maskmini'],required=True)
parser.add_argument('--reference',type=Path,required=True)
args=parser.parse_args()
torch.set_num_threads(4)
reference = load_model(args.reference)
current = json.loads((BROWSER / f'public/models/{args.key}.json').read_text())
manifest_path = (BROWSER / 'public/models' / current['manifest']).resolve()
manifest = json.loads(manifest_path.read_text())
options=ort.SessionOptions()
options.intra_op_num_threads=4
session=ort.InferenceSession(str(manifest_path.parent/'model.onnx'),sess_options=options,providers=['CPUExecutionProvider'])

class Network:
    backbone=reference.net.backbone
    if hasattr(reference.net,'section'):section=reference.net.section
    def __call__(self, batch, mode):
        batch=dict(batch)
        if 'section_mask' in manifest['inputs'] and 'section_mask' not in batch:
            batch['section_mask']=torch.zeros_like(batch['input_ids'])
        out=session.run(None,{x.name:batch[x.name].cpu().numpy() for x in session.get_inputs()})
        if mode=='section':return torch.from_numpy(out[3])
        return torch.from_numpy(out[0]) if mode=='tag' else tuple(torch.from_numpy(x) for x in out[1:3])

optimized=copy.copy(reference)
optimized.net=Network()
dev=ROOT/'mask/ml/privacy_v1/data/training-2026-11-07/dev.jsonl'
records=[json.loads(line) for line in dev.read_text().splitlines()] if dev.exists() else []
if not dev.exists():print('Development set not included in this repository; validating gallery, fresh, unicode and integration cases only.',file=sys.stderr)
for source in ['gallery.outputs.json','fresh.outputs.json']:
    records.extend(json.loads((ROOT/'evidence/privacy-v1/training-2026-11-07/measurements/deberta-v3-base-inspect'/source).read_text()))
records.extend({'id':f'unicode-{i}', 'task':'Summarise this message.', 'text':text} for i,text in enumerate([
    '😀 My name is Émilie Dupont; email: emilie@example.invalid. My salary is 3500 euros.',
    'Name: Jose\u0301 Martin\nEmail: jose@example.invalid\nMy partner has asthma.',
    'Already [PERSON_1]. Name: Jane Smith. Name: Jane Smith. Email: jane@example.invalid.',
    'Name: Anne O’Connor; phone: +358 40 123 4567. My blood pressure is 120/80.',
]))
records.extend(json.loads((BROWSER/'tests/integration-cases.json').read_text()))
def stable(result):
    return {k:result[k] for k in ['status','protected_text','protected_task','review_reasons','retained_sensitive','pending_reviews','coverage']}

cases=[]; differences=[]; output_differences=0; edit_differences=0; section_differences=0
started=time.monotonic()
for i,r in enumerate(records):
    task=r.get('task') or r['text'].split('\n')[0]
    a=Protector(reference).protect_text(r['text'],task).as_dict()
    b=Protector(optimized).protect_text(r['text'],task).as_dict()
    output_differences += (a['protected_text'],a['protected_task']) != (b['protected_text'],b['protected_task'])
    edits = lambda r: [{k:v for k,v in e.items() if k!='score'} for e in r['edits']]
    edit_differences += edits(a) != edits(b)
    sections = lambda r: [{k:d.get(k) for k in ('start','end','outcome','reason','edit_start','edit_end')} for d in r.get('section_diagnostics',[])]
    section_differences += sections(a) != sections(b)
    if stable(a)!=stable(b):
        differences.append({'id':r.get('id',str(i)),'reference':stable(a),'optimized':stable(b)})
    cases.append({'id':r.get('id',str(i)),'text':r['text'],'task':task,'expected':b,'reference':a})
    if i%10==0: print(f'Compared {i+1}/{len(records)} cases',flush=True)
out=BROWSER/'.cache/validation'/args.key;out.mkdir(parents=True,exist_ok=True)
(out/'cases.json').write_text(json.dumps(cases,ensure_ascii=False))
(out/'quantization-differences.json').write_text(json.dumps(differences,indent=2,ensure_ascii=False))
# Full tokenizer contract: singles, pairs, and overflowing windows.
tokenizer=[]
texts=list(dict.fromkeys([r['text'] for r in records]+['hello ' * 600, '  A\tB\nC\r\nD  ', 'A\u00a0B\u202fC \ufb01 😀']))
for text in texts:
    for windowed in [False,True]:
        kwargs={'max_length':512,'stride':64,'truncation':True,'return_overflowing_tokens':True,'padding':True} if windowed else {}
        enc=dict(reference.tokenizer(text,return_offsets_mapping=True,**kwargs));enc.pop('overflow_to_sample_mapping',None)
        if not windowed:enc={k:[v] for k,v in enc.items()}
        windows=[{k:v[i] for k,v in enc.items()} for i in range(len(enc['input_ids']))]
        tokenizer.append({'text':text,'pair':None,'windowed':windowed,'expected':{'windows':windows}})
for r in records:
    text=r['text']; pair=' [unused0] '+text[:20]+' [unused1] '+text[20:]
    task=r.get('task','Summarise.')+'\n\nType: PERSON'
    enc=dict(reference.tokenizer(task,pair,return_offsets_mapping=True))
    tokenizer.append({'text':task,'pair':pair,'windowed':False,'expected':{'windows':[enc]}})
(out/'tokenizer-cases.json').write_text(json.dumps(tokenizer,ensure_ascii=False))
report={'source_commit':json.loads((BROWSER/'runtime-source.json').read_text())['commit'],'reference_bundle_sha256':reference.bundle_sha256,'cases':len(cases),'final_result_differences':len(differences),'protected_output_differences':output_differences,'applied_edit_differences':edit_differences,'section_decision_differences':section_differences,'seconds':time.monotonic()-started,'model':manifest['id']}
(out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report),flush=True)

if differences: raise SystemExit('Model conversion differences require explicit review before deployment.')
