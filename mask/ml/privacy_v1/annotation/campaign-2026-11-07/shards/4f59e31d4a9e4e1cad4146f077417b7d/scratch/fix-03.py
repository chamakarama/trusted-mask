import json,pathlib
p=pathlib.Path(__file__).parent.parent
records=json.loads((p/'draft-02.json').read_text())
notes=[json.loads(x) for x in (p/'author-notes-02.jsonl').read_text().splitlines()]
health='I have had headaches on four mornings this week, but none woke me during the night.'
med='I have not tried any new medicine.'
for r in records:
 slug=r['id'].split(':')[-1]
 if slug.startswith('clinic-'):
  r['entities'].extend([{'id':'m3','entity_id':'symptoms','quote':health,'label':'HEALTH'},{'id':'m4','entity_id':'medicine','quote':med,'label':'HEALTH'}])
  if slug=='clinic-1':
   r['decisions'][1:1]=[{'kind':'entity','target_id':'m3','entity_id':'symptoms','quote':health,'label':'HEALTH','action':'KEEP','relevance':'essential'},{'kind':'entity','target_id':'m4','entity_id':'medicine','quote':med,'label':'HEALTH','action':'KEEP','relevance':'essential'}]
  else:
   section=' '+health+' '+med
   r['decisions'].insert(1,{'kind':'section','quote':section,'label':'HEALTH','action':'DROP','relevance':'unnecessary','reason':'The symptom and medication details are unrelated to the requested rent comparison.'})
   r['approved_output']=r['approved_output'].replace(section,'')
 if slug=='travel-2':r['task']='Summarise the savings note for my personal budget.'
 if slug=='work-2':r['task']='Summarise the salary and savings note for my personal budget.'
(p/'draft-03.json').write_text(json.dumps(records,ensure_ascii=False,indent=2))
(p/'author-notes-03.jsonl').write_text(''.join(json.dumps(n,ensure_ascii=False)+'\n' for n in notes))
