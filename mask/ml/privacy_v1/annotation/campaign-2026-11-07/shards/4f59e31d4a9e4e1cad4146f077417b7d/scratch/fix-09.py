import json,pathlib
p=pathlib.Path(__file__).parent.parent
add={'travel-2':['I am considering changing banks.'],'work-2':['I am considering a savings plan.'],'ops-1':['Our coordinator,','reported that the sample delivery arrived one day late.']}
rs=[r for r in json.loads((p/'draft-03.json').read_text()) if r['id'].split(':')[-1] in add]
ns=[json.loads(x) for x in (p/'author-notes-03.jsonl').read_text().splitlines() if json.loads(x)['record_id'].split(':')[-1] in add]
for r in rs:
 qs=add[r['id'].split(':')[-1]];r['required_facts'].extend({'quote':q} for q in qs)
 for n in ns:
  if n['record_id']==r['id']:n['dependencies'].extend({'claim':q,'source_quotes':[q],'disclosable':True} for q in qs)
(p/'draft-09.json').write_text(json.dumps(rs,ensure_ascii=False,indent=2))
(p/'author-notes-09.jsonl').write_text(''.join(json.dumps(n,ensure_ascii=False)+'\n' for n in ns))
