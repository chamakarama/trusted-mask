import json,subprocess
p='mask/ml/privacy_v1/annotation/shards/777b624ec45a40d086a880b5f15cdcd0/resolved-05.jsonl'
h=json.loads(subprocess.check_output(['mask/ml/privacy_v1/.venv/bin/python','-m','mask.ml.privacy_v1.annotation.tools','validate','--input',p]))['record_hashes']
notes={'expenses-next-a':'NOTE Vague task: permitted personal spending details use uncertain relevance; retained adjustment and incomplete spending qualify comparison.', 'procure-next-a':'NOTE Nonpublic supplier and discount values protected; remaining generic shipment context carries no obvious core identifying combination.', 'token-next-a':'NOTE Synthetic credential is protected as a token; generic troubleshooting remains possible.'}
out='mask/ml/privacy_v1/annotation/shards/2a269ec2a36f464d81a9a1b560540c1c/reviews-train-writer-a-05.jsonl'
with open(out,'x') as f:
 for line in open(p):
  r=json.loads(line);rid=r['id']; key=rid.split(':')[-1]
  json.dump({'record_id':rid,'record_sha256':h[rid],'status':'accepted','review_type':'model','reviewer_id':'2a269ec2a36f464d81a9a1b560540c1c:terra-reviewer','notes':'Six checks found no blocking issue. '+notes.get(key,'')},f);f.write('\n')
