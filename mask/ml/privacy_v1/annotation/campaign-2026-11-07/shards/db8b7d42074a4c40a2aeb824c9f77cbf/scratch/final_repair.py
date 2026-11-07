import json,pathlib
p=pathlib.Path('mask/ml/privacy_v1/annotation/shards/db8b7d42074a4c40a2aeb824c9f77cbf')
records=json.loads((p/'draft-02.json').read_text()); notes=[json.loads(x) for x in (p/'author-notes-02.jsonl').read_text().splitlines()]
reasons={'ZX-382-19':'The account number could identify or expose the account; the requested bus advice does not need it.','mira.river@example.invalid':'The email address is private contact information; the requested parcel description does not need the address.','fern-moon-72':'The password is a credential that could enable account access; plant advice or a thank-you does not need it.','Alder Vale Ltd':'The prospective customer identity is in internal sales notes; the generic follow-up can refer to the customer without naming it.','46,500 euros':'The unapproved quote is restricted internal pricing; the generic onboarding follow-up does not require its value.','1.8 million euros':'The unpublished revenue forecast is restricted financial information; the general explanation does not require its value.','14 percent':'The unpublished margin forecast is restricted financial information; the general explanation does not require its value.','test-token-7q2m-88':'The access token could provide system access; generic troubleshooting does not require the credential.'}
changed=[]
for r in records:
 key=r['id'].split(':r')[1]
 if key not in {'03-1','03-2','04-1','04-2','06-1','06-2','11-1','12-1','13-1'}: continue
 for d in r['decisions']:
  if d['quote'] in reasons:
   d['reason']=reasons[d['quote']]
   if d['quote']=='46,500 euros': d['action']='PLACEHOLDER'; d['relevance']='unnecessary'
   if d['quote'] in {'1.8 million euros','14 percent'}: d['relevance']='unnecessary'
 text=r['text']; out=text; reps=[]; people={}
 for d in r['decisions']:
  a=d['action']; q=d['quote']; start=text.index(q)
  if a=='ALIAS':
   people.setdefault(d['entity_id'],len(people)+1); val=f"[PERSON_{people[d['entity_id']]}]"
  elif a=='PLACEHOLDER': val=f"[{d['label']}]"
  elif a=='DROP': val=''
  else: continue
  reps.append((start,start+len(q),val))
 for a,b,v in reversed(reps): out=out[:a]+v+out[b:]
 r['approved_output']=out; changed.append(r['id'])
(p/'draft-03.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
for n in notes:
 if n['record_id'] in changed:
  n['dependencies'][0]['disclosure_limits']='Protect the specific account, contact detail, credential, customer identity or unpublished financial figure; the requested generic task does not need the protected value.'
(p/'author-notes-03.jsonl').write_text(''.join(json.dumps(n,ensure_ascii=False)+'\n' for n in notes))
print('Repaired',len(changed))
