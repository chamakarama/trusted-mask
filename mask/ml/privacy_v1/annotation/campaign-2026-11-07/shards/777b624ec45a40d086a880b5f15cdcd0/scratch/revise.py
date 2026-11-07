import json
from pathlib import Path
p=Path('mask/ml/privacy_v1/annotation/shards/777b624ec45a40d086a880b5f15cdcd0')
r=json.loads((p/'draft-02.json').read_text()); notes=[json.loads(x) for x in (p/'author-notes-02.jsonl').read_text().splitlines()]; n={x['record_id']:x for x in notes}
extra={
'reading-a':['Could you suggest a reading schedule for a 240-page novel?','The book is a library copy, so I cannot mark the pages.'],
'packing-a':['I need a checklist for packing a small carry-on for a four-day trip.'],
'soup-a':['I am trying to adjust a soup recipe for six people.'],
'kettle-a':['I am writing to a shop about a kettle that stopped heating after two weeks.'],
'lunch-a':['My father,','and I are organising a family lunch.'],
'tickets-b':['My sister,','offered to meet me at the station if her shift ends on time.'],
'budget-b':['My take-home pay is about 2,400 euros per month, and my fixed bills total 1,350 euros.','I think groceries cost around 300 euros, but that is only an estimate.','Please do not treat the remainder as guaranteed savings.'],
}
for x in r:
 slug=x['id'].split(':')[-1]
 if slug=='sales-b':
  x['required_facts']=[]
  n[x['id']]['dependencies'].append({'claim':'Exact comparison needs the actual offer; policy prevents disclosure and the comparison cannot be completed from the masked input.','supporting_quotes':['72,500 euros'],'disclosure_limit':'Confidential figure must be withheld.'})
 for q in extra.get(slug,[]):
  x['required_facts'].append({'quote':q}); n[x['id']]['dependencies'].append({'claim':'Preserve this additional task-relevant claim or constraint.','supporting_quotes':[q],'disclosure_limit':'Permitted as written.'})
(p/'draft-03.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
(p/'author-notes-03.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in notes))
