import json,subprocess
p='mask/ml/privacy_v1/annotation/shards/4f59e31d4a9e4e1cad4146f077417b7d/resolved-05.jsonl'
h=json.loads(subprocess.check_output(['mask/ml/privacy_v1/.venv/bin/python','-m','mask.ml.privacy_v1.annotation.tools','validate','--input',p]))['record_hashes']
issues={'dent-v2':'BLOCKING RENDERING: Output retains "I want to describe those observations clearly without guessing the cause." after dropping the observations, leaving a dangling reference to removed dental content in a budget request. Extend the legitimate health section drop to include the dependent sentence.','invoice-v1':'BLOCKING FACT_COVERAGE: "confirmed that the supplier sent the replacement parts." is absent from required_facts even though shipment status is a central claim for the dispatch follow-up; preserve complete attribution with fragments around the aliased coordinator. Output happens to retain it.'}
notes={'invoice-v2':'NOTE Exact rebate value remains protected despite essential relevance; exact numerical analysis is unavailable.', 'dent-v1':'NOTE Dental claims and uncertainty preserved; unrelated electricity spending removed.'}
out='mask/ml/privacy_v1/annotation/shards/2a269ec2a36f464d81a9a1b560540c1c/reviews-dev-05.jsonl'
with open(out,'x') as f:
 for line in open(p):
  r=json.loads(line);rid=r['id']; key=rid.split(':')[-1]
  msg=issues.get(key,'Six checks found no blocking issue. '+notes.get(key,''))
  json.dump({'record_id':rid,'record_sha256':h[rid],'status':'rejected' if key in issues else 'accepted','review_type':'model','reviewer_id':'2a269ec2a36f464d81a9a1b560540c1c:terra-reviewer','notes':msg},f);f.write('\n')
