"""Recheck the canonical release without changing datasets or fitting models."""
import os,sys,json,hashlib,collections,statistics,argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];sys.path.insert(0,str(ROOT))
p=argparse.ArgumentParser()
p.add_argument('--output-dir',type=Path,required=True)
p.add_argument('--skip-token-checks',action='store_true')
args=p.parse_args()
args.output_dir.mkdir(parents=True,exist_ok=True)
os.environ['HF_HUB_OFFLINE']='1';os.environ['TOKENIZERS_PARALLELISM']='false'
from mask.ml.privacy_v1.data import validate_records,digest
from mask.ml.privacy_v1.annotation.tools import read,compile_records
from mask.ml.privacy_v1.sections import section_targets,SECTION_MODE,CLAUSE_MODE,section_units
if not args.skip_token_checks:
 from transformers import AutoTokenizer
D=ROOT/'mask/ml/privacy_v1/data';C=D/'training-2026-11-07c'
train=read(C/'train.authored.jsonl');dev=read(C/'dev.authored.jsonl');compiled=read(C/'train.jsonl');compiled_dev=read(C/'dev.jsonl')
assert len(validate_records(train+dev))==1366
assert len(validate_records(compiled+compiled_dev))==1366
assert compile_records(train)==compiled
assert compile_records(dev)==compiled_dev
assert (C/'dev.jsonl').read_bytes()==(D/'training-2026-11-07/dev.jsonl').read_bytes()
for rel,h in json.loads((C/'sources.json').read_text())['files'].items():assert digest(C/rel)==h
report={'canonical':'mask/ml/privacy_v1/data/training-2026-11-07c','checks':{'authored_train_dev_valid':True,'compiled_train_dev_valid':True,'compiled_matches_reviewed_authored':True,'dev_unchanged':True,'source_hashes_match':True},'files':{p.name:digest(p) for p in [C/'train.jsonl',C/'dev.jsonl',C/'train.authored.jsonl',C/'dev.authored.jsonl']},'cohorts':{},'token_checks':{}}
cohorts={'old':read(D/'training-2026-11-07/train.authored.jsonl'),'placeholder':read(D/'placeholder-preservation-20261107/train.authored.jsonl'),'section':read(D/'section-removal-20261107-vr/train.authored.jsonl'),'combined':train,'dev':dev}
projection={};risks=[];boundary=[]
for name,records in cohorts.items():
 groups=collections.defaultdict(list);different_names=[];types=collections.Counter();actions=collections.Counter()
 for r in records:
  groups[r['text']].append(r)
  for d in r['decisions']:actions[d['action']]+=1;types[(d['label'],d['action'])]+=1
  people=collections.defaultdict(set)
  for e in r['entities']:
   if e['label']=='PERSON':people[e['entity_id']].add(r['text'][e['start']:e['end']])
  if any(len(values)>1 for values in people.values()):different_names.append(r['id'])
 words=[len(r['text'].split()) for r in records]
 d={'records':len(records),'families':len({r['family_id'] for r in records}),'sources':len(groups),'actions':dict(actions),'review_status':dict(collections.Counter(r['review']['status'] for r in records)),'cross_surface_person_identity_records':len(different_names),'words':{'min':min(words),'median':statistics.median(words),'max':max(words)},'section_targets':{},'task_pairs':{}}
 for mode in (CLAUSE_MODE,SECTION_MODE):
  targets={r['id']:section_targets(r,mode) for r in records}
  d['section_targets'][mode]=dict(collections.Counter(str(t['target']) for ts in targets.values() for t in ts))
  pairs=[]
  for rows in groups.values():
   if len(rows)==2 and rows[0]['task']!=rows[1]['task']:
    switches=sum({a['target'],b['target']}=={'essential','unnecessary'} for a,b in zip(targets[rows[0]['id']],targets[rows[1]['id']]))
    pairs.append({'record_ids':[r['id'] for r in rows],'switches':switches})
  d['task_pairs'][mode]={'groups':len(pairs),'groups_with_switch':sum(p['switches']>0 for p in pairs),'switched_units':sum(p['switches'] for p in pairs),'no_switch_ids':[p['record_ids'] for p in pairs if not p['switches']]}
  if name in ('combined','dev') and mode==CLAUSE_MODE:projection[name]=[{'id':r['id'],'family_id':r['family_id'],'split':r['split'],'text':r['text'],'task':r['task'],'sections':targets[r['id']]} for r in records]
 if name in ('placeholder','section'):
  for r in records:
   units=list(section_units(r['text'],CLAUSE_MODE))
   for decision in r['decisions']:
    if decision['action']=='DROP':
     touched=[(a,b) for a,b in units if a<decision['end'] and decision['start']<b]
     partial=[(a,b) for a,b in touched if not(decision['start']<=a and b<=decision['end'])]
     if partial:boundary.append({'id':r['id'],'quote':decision['quote'],'partial_units':[r['text'][a:b] for a,b in partial]})
  risks+=different_names
 report['cohorts'][name]=d
report['drop_boundary_partial_units']=boundary
print(json.dumps({'checks':report['checks'],'counts':{k:v['records'] for k,v in report['cohorts'].items()},'partial_drop_units':len(boundary)},indent=2),flush=True)
for name,path in ([] if args.skip_token_checks else [('minilm',ROOT/'mask/ml/privacy_v1/artifacts/reviewed-2026-11-07/encoder-b'),('deberta',ROOT/'mask/ml/privacy_v1/artifacts/reviewed-2026-11-07/deberta-v3-base')]):
 tok=AutoTokenizer.from_pretrained(path,local_files_only=True,trust_remote_code=False)
 max_tag=0;max_action=0;bad=[];marker_count=0
 for rec in compiled+compiled_dev:
  text=rec['text'];n=len(tok(text)['input_ids']);max_tag=max(max_tag,n)
  if n>512:bad.append(rec['id']+':detection')
  for s in rec['spans']:
   marked=text[:s['start']]+' [unused0] '+text[s['start']:s['end']]+' [unused1] '+text[s['end']:]
   ids=tok(rec['task']+'\n'+rec.get('context','')+'\nType: '+s['label'],marked)['input_ids'];max_action=max(max_action,len(ids));marker_count+=1
   if len(ids)>512:bad.append(rec['id']+':action')
 report['token_checks'][name]={'records':len(compiled+compiled_dev),'action_inputs':marker_count,'max_detection_tokens':max_tag,'max_marked_action_tokens':max_action,'over_limit':bad}
 print(name,report['token_checks'][name],flush=True)
(args.output_dir/'audit.json').write_text(json.dumps(report,indent=2))

# Deterministic review sample: disparate cases, not picked for a desired verdict.
sample=[]
for name in ('placeholder','section'):
 records=cohorts[name];ordered=sorted(records,key=lambda r:hashlib.sha256(r['id'].encode()).hexdigest())
 selectors=[('general',lambda r:True),('name_variants',lambda r:r['id'] in risks),('essential_placeholder',lambda r:any(d['action']=='PLACEHOLDER' and d['relevance']=='essential' for d in r['decisions'])),('drop',lambda r:any(d['action']=='DROP' for d in r['decisions'])),('vague',lambda r:any(d['relevance']=='uncertain' for d in r['decisions'])),('benign',lambda r:not r['decisions'])]
 used=set()
 for label,predicate in selectors:
  hit=next((r for r in ordered if predicate(r) and r['id'] not in used),None)
  if hit:
   used.add(hit['id']);sample.append({'cohort':name,'slice':label,'record':hit})
(args.output_dir/'semantic-sample.json').write_text(json.dumps(sample,indent=2,ensure_ascii=False))
print('Audit and sample ready',flush=True)
