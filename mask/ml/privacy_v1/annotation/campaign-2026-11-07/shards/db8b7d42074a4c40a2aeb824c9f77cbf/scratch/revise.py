import json,pathlib
p=pathlib.Path('mask/ml/privacy_v1/annotation/shards/db8b7d42074a4c40a2aeb824c9f77cbf'); records=json.loads((p/'draft-01.json').read_text()); notes=[]
F={
'01-1':['My sister,', 'checked my temperature after lunch.', 'It was 38.1 C on Tuesday and 37.4 C on Wednesday.', 'I had a sore throat but no cough.', 'I have not taken any fever medicine.'],
'01-2':['The club meets on Thursday; I need to ask to move it to Friday.'],
'02-1':['My flatmate,','says the kitchen tap has dripped since Friday.','We put a bowl underneath and it filled halfway overnight.','The shutoff valve still turns, but the handle is stiff.','Please ask the landlord to arrange a repair and mention that weekday afternoons work.'],
'02-2':['Please ask the landlord to arrange a repair and mention that weekday afternoons work.'],
'03-1':['The morning service leaves at 08:15 and takes 50 minutes.','The afternoon service takes 65 minutes and departs at 14:30.','We need to arrive before 10:00 and would rather avoid a taxi.'],
'03-2':['The morning service leaves at 08:15 and takes 50 minutes.','We need to arrive before 10:00 and would rather avoid a taxi.'],
'04-1':['The parcel arrived on Thursday with a torn outer box.','Two cups were intact, but the third had a chipped rim.','I took a photo before unpacking the rest and kept the packaging.','Please help me request a replacement for the damaged cup without implying that all three were broken.'],
'04-2':['The parcel arrived on Thursday with a torn outer box.','Two cups were intact, but the third had a chipped rim.'],
'05-1':['I think my electricity bill was 94 euros in May, not 49 euros.','June was 78 euros, though I have not checked the final statement yet.','Both amounts include the standing charge.'],
'05-2':['My friend','has a new dog.'],
'06-1':['The basil has yellow leaves, but the rosemary looks healthy.','I watered both pots on Sunday and the soil is still damp today.'],
'06-2':['My neighbour,','watered the balcony plants while I was away.'],
'07-1':['For Saturday dinner I have lentils, carrots and rice.','One guest does not eat dairy, and another cannot have peanuts.','I have one oven and about 45 minutes to cook.','I would like enough for four people, with leftovers if possible.'],
'08-1':['The public library closes at 18:00 on Mondays and 16:00 on Saturdays according to the printed timetable I have.','The return slot is open after closing.','I need to return two books and collect a reserved title, but collection requires the desk to be open.'],
'09-1':['My bicycle chain slips when I pedal hard in the highest gear.','It does not slip in the lower gears.','I cleaned the chain last weekend, but I have not measured its wear.','The rear wheel was removed for a puncture repair just before this started.'],
'10-1':['I am sorting old family photographs into three albums.','Some have dates on the back and others only have a place written in pencil.','I want a naming convention that keeps uncertain dates visibly uncertain and does not require me to identify everyone.','The albums should be easy for relatives to browse later.'],
'11-1':['The customer requested a shorter onboarding checklist and a clear contact for each step.','Please draft a generic follow-up asking which steps are blocked and avoid promising a delivery date.'],
'12-1':['These figures have not been published or approved.','The sales team expects seasonal demand to be uneven, and the estimate may change.','I need help explaining why a forecast should include a range rather than a single point estimate.'],
'13-1':['The support log reports timeout error E408 after three retries.','The public documentation recommends checking the network connection first.','The failure occurs before the upload begins, and no files are transferred.'],
'14-1':['The interview panel wants a structured agenda for discussing a separate open role.','Please draft an agenda covering skills, consistent questions and next steps; do not assume a hiring decision has been made.']}
for r in records:
 key=r['id'].split(':r')[1]; text=r['text']
 if key.startswith('01-'):
  add='\n\nThe club meets on Thursday; I need to ask to move it to Friday.'
  text+=add; r['text']=text
  # New source grouping reflects the changed message; the two variants remain identical.
  r['source_id']=r['source_id']+'-v2'
  if key=='01-2':
   before=text[:text.index('\n\nThe club meets')]
   r['decisions']=[dict(kind='section',quote=before,label='HEALTH',action='DROP',relevance='unnecessary',reason='The medical history and unrelated savings are not needed to reschedule the club meeting.')]
   # Drop leading separator together with the first paragraph, leaving readable text.
   r['decisions'][0]['quote']=before+'\n\n'
 r['required_facts']=[{'quote':q} for q in F[key]]
 # Recompute output from exact decisions, with the same deterministic aliases.
 out=text; reps=[]; people={}
 for d in r['decisions']:
  a=d['action']; q=d['quote']; start=text.index(q)
  if a=='ALIAS':
   people.setdefault(d['entity_id'],len(people)+1); val=f"[PERSON_{people[d['entity_id']]}]"
  elif a=='PLACEHOLDER': val=f"[{d['label']}]"
  elif a=='DROP': val=''
  else: continue
  reps.append((start,start+len(q),val))
 for a,b,v in reversed(reps): out=out[:a]+v+out[b:]
 r['approved_output']=out
 notes.append({'record_id':r['id'],'dependencies':[{'claim':f"Task-specific source dependencies for: {r['task']}",'supporting_quotes':F[key],'disclosure_limits':'Private identities, direct identifiers, and restricted business figures must be protected; protected financial values cannot support exact numerical analysis.'}]})
(p/'draft-02.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
(p/'author-notes-02.jsonl').write_text(''.join(json.dumps(n,ensure_ascii=False)+'\n' for n in notes))
