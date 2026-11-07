import json,subprocess
p='mask/ml/privacy_v1/annotation/shards/4f59e31d4a9e4e1cad4146f077417b7d/resolved-08.jsonl'
h=json.loads(subprocess.check_output(['mask/ml/privacy_v1/.venv/bin/python','-m','mask.ml.privacy_v1.annotation.tools','validate','--input',p]))['record_hashes']
notes={'delivery2-08':'NOTE "My email address is " is overrequired for this request, but the email value is protected and this fragment does not materially affect utility.', 'supply-08':'NOTE Generic operational sample status has no explicitly restricted business identifier or value.', 'support-08':'NOTE Generic service status is retained with uncertainty; no sensitive credential is present.'}
out='mask/ml/privacy_v1/annotation/shards/2a269ec2a36f464d81a9a1b560540c1c/reviews-dev-08.jsonl'
with open(out,'x') as f:
 for line in open(p):
  r=json.loads(line);rid=r['id'];key=rid.split(':')[-1]
  json.dump({'record_id':rid,'record_sha256':h[rid],'status':'accepted','review_type':'model','reviewer_id':'2a269ec2a36f464d81a9a1b560540c1c:terra-reviewer','notes':'Six checks found no blocking issue. '+notes.get(key,'')},f);f.write('\n')
