import json,pathlib
p=pathlib.Path(__file__).parent.parent
source=json.loads((p/'draft-01.json').read_text())
notes=[json.loads(x) for x in (p/'author-notes-01.jsonl').read_text().splitlines()]
rejected={'health','email','housing','study','procure','credential','finance'}
records=[r for r in source if r['id'].split(':')[-1] in rejected]
notes=[n for n in notes if n['record_id'].split(':')[-1] in rejected]
for r in records:
 slug=r['id'].split(':')[-1]
 add=[]
 if slug=='health':
  q='The feeling usually passes within ten minutes.'
  r['entities'].append({'id':'m3','entity_id':'duration','quote':q,'label':'HEALTH'})
  r['decisions'].append({'kind':'entity','target_id':'m3','entity_id':'duration','quote':q,'label':'HEALTH','action':'KEEP','relevance':'essential'})
 if slug=='email':r['decisions'][0]['reason']='The email address identifies a contact and could expose their account contact details; the support request does not need the exact address.'
 if slug=='housing':add=['My neighbour,','mentioned that the shared hallway light flickers in the evening.','I wrote down that the building manager should check it before anyone replaces the bulb.']
 if slug=='study':add=['I have four chapters to review before the exam.','Leave time to revisit difficult material.']
 if slug=='procure':
  r['decisions'][1]['reason']='The supplier identity is confidential; the generic follow-up can use the supplier role without naming it.'
  r['decisions'][2]['reason']='The unapproved internal quote would disclose confidential pricing; the onboarding request does not need the exact price.'
 if slug=='credential':r['decisions'][0]['reason']='The password could grant unauthorised account access if disclosed; troubleshooting can proceed without its value.'
 if slug=='finance':
  add=['Our internal finance note says the confidential projected shortfall is','for the quarter.']
  r['decisions'][0]['reason']='The exact internal shortfall is confidential financial information; its removal prevents exact numerical variance analysis.'
 r['required_facts'].extend({'quote':q} for q in add)
 for n in notes:
  if n['record_id']==r['id']:
   n['dependencies'].extend({'claim':q,'source_quotes':[q],'disclosable':True} for q in add)
(p/'draft-04.json').write_text(json.dumps(records,ensure_ascii=False,indent=2))
(p/'author-notes-04.jsonl').write_text(''.join(json.dumps(n,ensure_ascii=False)+'\n' for n in notes))
