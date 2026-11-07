import json,pathlib
p=pathlib.Path(__file__).parent.parent
rs=[r for r in json.loads((p/'draft-05.json').read_text()) if r['id'].endswith((':dent-v2',':invoice-v1'))]
ns=[json.loads(x) for x in (p/'author-notes-05.jsonl').read_text().splitlines() if json.loads(x)['record_id'].endswith((':dent-v2',':invoice-v1'))]
for r in rs:
 if r['id'].endswith(':dent-v2'):
  d=next(x for x in r['decisions'] if x['kind']=='section'); d['quote']+=' I want to describe those observations clearly without guessing the cause.'
  r['approved_output']=r['approved_output'].replace(' I want to describe those observations clearly without guessing the cause.','')
 else:
  qs=['Our coordinator,','confirmed that the supplier sent the replacement parts.']
  r['required_facts'].extend({'quote':q} for q in qs)
  for n in ns:
   if n['record_id']==r['id']:n['dependencies'].extend({'claim':q,'source_quotes':[q],'disclosable':True} for q in qs)
(p/'draft-07.json').write_text(json.dumps(rs,ensure_ascii=False,indent=2))
(p/'author-notes-07.jsonl').write_text(''.join(json.dumps(n,ensure_ascii=False)+'\n' for n in ns))
