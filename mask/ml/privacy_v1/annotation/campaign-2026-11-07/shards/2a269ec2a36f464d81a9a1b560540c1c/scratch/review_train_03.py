import json,subprocess
p='mask/ml/privacy_v1/annotation/shards/db8b7d42074a4c40a2aeb824c9f77cbf/resolved-03.jsonl'
h=json.loads(subprocess.check_output(['mask/ml/privacy_v1/.venv/bin/python','-m','mask.ml.privacy_v1.annotation.tools','validate','--input',p]))['record_hashes']
ids={'r03-1','r03-2','r04-1','r04-2','r06-1','r06-2','r11-1','r12-1','r13-1'}
notes={'r11-1':'NOTE Unapproved internal price is now protected; generic onboarding follow-up does not need its amount. The existence of a quote remains, without an obvious core confidential value.', 'r12-1':'NOTE Revenue and margin values are protected and marked unnecessary for the general explanation; exact numerical analysis is unavailable.'}
out='mask/ml/privacy_v1/annotation/shards/2a269ec2a36f464d81a9a1b560540c1c/reviews-train-03.jsonl'
with open(out,'x') as f:
 for line in open(p):
  r=json.loads(line);rid=r['id']; key=rid.split(':')[-1]
  if key not in ids: continue
  json.dump({'record_id':rid,'record_sha256':h[rid],'status':'accepted','review_type':'model','reviewer_id':'2a269ec2a36f464d81a9a1b560540c1c:terra-reviewer','notes':'Six checks found no blocking issue. '+notes.get(key,'Prior placeholder reason now identifies the relevant disclosure risk and task utility.')},f); f.write('\n')
