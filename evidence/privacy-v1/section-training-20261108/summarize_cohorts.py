import json
from pathlib import Path
from collections import defaultdict,Counter
root=Path('evidence/privacy-v1/section-training-20261108')
rows=[json.loads(l) for l in Path('mask/ml/privacy_v1/data/training-2026-11-07c/train.authored.jsonl').read_text().splitlines()]
tasks=defaultdict(set)
for r in rows:tasks[r['text']].add(r['task'])
cohort={}
for i,r in enumerate(rows):
 cohort[r['id']]=('original-connected' if i<516 else 'placeholder-preservation' if i<816 else 'task-pair' if len(tasks[r['text']])>1 else 'benign' if not r['decisions'] else 'vague-task' if any(d['relevance']=='uncertain' for d in r['decisions']) else 'relevant-sensitive')
paths={'old-deberta':root/'baselines/deberta-original-supplemental.json','base':root/'base/cloud/evaluation/base/epoch-2-conditioned-supplemental.json'}
if (root/'large/cloud/evaluation/large/epoch-2-conditioned-supplemental.json').exists():paths['large-epoch-2']=root/'large/cloud/evaluation/large/epoch-2-conditioned-supplemental.json'
if (root/'large/cloud/evaluation/large/epoch-1-conditioned-supplemental.json').exists():paths['large-selected-epoch-1']=root/'large/cloud/evaluation/large/epoch-1-conditioned-supplemental.json'
out={}
for name,path in paths.items():
 c=defaultdict(Counter)
 for r in json.loads(path.read_text())['outputs']:
  g=cohort[r['id']];c[g]['records']+=1
  c[g]['identifier_misses']+=len(r['identifier_misses']);c[g]['lost_required_facts']+=len(r['lost_required_facts']);c[g]['false_clause_removals']+=len(r['false_removals'])
  c[g]['records_with_any_drop']+=any(e['action']=='DROP' for e in r['result']['edits'])
  c[g]['unchanged_records']+=r['text']==r['result']['protected_text']
 assert {g:v['records'] for g,v in c.items()}=={'placeholder-preservation':30,'task-pair':40,'relevant-sensitive':5,'vague-task':3,'benign':2}
 out[name]={g:dict(v) for g,v in c.items()}
(root/'cohort-summary.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
