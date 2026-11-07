import json
base='mask/ml/privacy_v1/annotation/shards/636360bb8a544d9ea79023c117ea6d03/'
p='mask/ml/privacy_v1/annotation/shards/777b624ec45a40d086a880b5f15cdcd0/resolved-03.jsonl'
h=json.load(open(base+'scratch/validation-02.json'))['record_hashes']
issues={
'bicycle-a':"BLOCKING FACT_COMPLETENESS: 'One has a seven-speed gear system and recently replaced tyres, but its brakes need adjustment.' and 'The other has three speeds and working brakes, although the seller does not know when its chain was last changed.' lack the antecedent 'I am comparing two used bicycles.' The paired claims need their subject for complete task-critical supervision.",
'tap-a':"BLOCKING FACT_COMPLETENESS: 'It has dripped for roughly a week and gets worse when the handle is fully closed.' lacks its antecedent 'I am drafting a note to my landlord about a dripping kitchen tap.' The principal problem and affected object need to survive as a complete task-critical claim.",
'publicapp-a':"BLOCKING FACT_COMPLETENESS: 'It lets users create events, add reminders and view a weekly schedule.' lacks its antecedent 'We are preparing a public description of a calendar application for an external writing assistant.' The product being described is a task-critical subject.",
'sales-a':"BLOCKING FACT_COMPLETENESS: 'They asked for a two-week onboarding outline and a named point of contact; do not promise a launch date.' lacks the prospective customer antecedent from 'our account manager, Amina Diallo, spoke with the prospective customer Juniper Forge.' Preserve the actor with exact permitted fragments around protected names."
}
extra={'cough-b':' NOTE RENDERING: Adjacent [HEALTH] placeholders leave health-timing context in an otherwise usable rent extraction; no symptom is disclosed.','tickets-b':' NOTE RELEVANCE: Vague task permits uncertain relevance and retained health context.','budget-b':' NOTE RELEVANCE: Vague task permits uncertain relevance of the retained personal budget details.','sales-b':' NOTE POLICY: Essential confidential price is masked; the external comparison cannot be completed, as the author notes and decision reason state.'}
with open(base+'reviews-02.jsonl','x') as f:
 for r in map(json.loads,open(p)):
  key=r['id'].split(':')[-1]; issue=issues.get(key)
  o={'record_id':r['id'],'record_sha256':h[r['id']],'status':'rejected' if issue else 'accepted','review_type':'model','reviewer_id':'636360bb8a544d9ea79023c117ea6d03:reviewer','notes':issue or 'The six rubric checks found no blocking issue.'+extra.get(key,'')}
  f.write(json.dumps(o,ensure_ascii=False)+'\n')
