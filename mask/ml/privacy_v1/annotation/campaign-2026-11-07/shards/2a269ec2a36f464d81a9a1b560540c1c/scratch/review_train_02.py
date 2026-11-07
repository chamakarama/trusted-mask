import json, subprocess
p='mask/ml/privacy_v1/annotation/shards/db8b7d42074a4c40a2aeb824c9f77cbf/resolved-02.jsonl'
hashes=json.loads(subprocess.check_output(['mask/ml/privacy_v1/.venv/bin/python','-m','mask.ml.privacy_v1.annotation.tools','validate','--input',p]))['record_hashes']
issues={
'r03-1':'BLOCKING POLICY: "ZX-382-19" placeholder reason says only "The private identifier is not needed for this task and must be protected." It does not identify the account-number disclosure risk; rubric requires a specific risk and utility explanation.',
'r03-2':'BLOCKING POLICY: "ZX-382-19" placeholder reason says only "The private identifier is not needed for this task and must be protected." It does not identify the account-number disclosure risk; rubric requires a specific risk and utility explanation.',
'r04-1':'BLOCKING POLICY: "mira.river@example.invalid" placeholder reason says only "The private identifier is not needed for this task and must be protected." It fails to identify the email/contact disclosure risk.',
'r04-2':'BLOCKING POLICY: "mira.river@example.invalid" placeholder reason says only "The private identifier is not needed for this task and must be protected." It fails to identify the email/contact disclosure risk.',
'r06-1':'BLOCKING POLICY: "fern-moon-72" is a password, yet its reason calls it a "private identifier" and does not state the credential/access risk.',
'r06-2':'BLOCKING POLICY: "fern-moon-72" is a password, yet its reason calls it a "private identifier" and does not state the credential/access risk.',
'r11-1':'BLOCKING POLICY/RELEVANCE: "46,500 euros" is an unapproved quote confined to internal sales notes, yet KEEP exposes it to the external AI and incorrectly marks it essential for a generic follow-up. Also the placeholder reason for "Alder Vale Ltd" says only "The private identifier is not needed for this task and must be protected" without identifying confidential customer-identity risk.',
'r12-1':'BLOCKING RELEVANCE: "1.8 million euros" and "14 percent" are marked essential even though an explanation of why forecasts use a range does not require the exact values. Protection is correct but relevance must reflect the task independently of disclosure. NOTE Unnumbered same-type placeholders make exact numerical analysis unavailable.',
'r13-1':'BLOCKING POLICY: "test-token-7q2m-88" is an access token, but its placeholder reason calls it a "private identifier" without stating credential/access risk.'}
notes={
'r01-1':'NOTE Club schedule retained as harmless unrelated context; earlier timing/attribution omission repaired.',
'r01-2':'NOTE Revised source supplies the intended Thursday-to-Friday move; unrelated health and savings are removed.',
'r02-1':'NOTE Earlier missing problem and availability claims now included.',
'r02-2':'NOTE Availability is included; identical treatment to its task swap offers limited contrast but is not independently blocking.',
'r05-1':'NOTE Unrelated friend context remains with name aliased; no core disclosure issue.',
'r10-1':'NOTE Vague task; source context makes permitted sorting constraints useful, and no uncertain sensitive entity decision is needed.'}
out='mask/ml/privacy_v1/annotation/shards/2a269ec2a36f464d81a9a1b560540c1c/reviews-train-02.jsonl'
with open(out,'x') as f:
 for line in open(p):
  r=json.loads(line); rid=r['id']; key=rid.split(':')[-1]
  status='rejected' if key in issues else 'accepted'
  msg=issues.get(key,'Six checks found no blocking issue. '+notes.get(key,''))
  json.dump({'record_id':rid,'record_sha256':hashes[rid],'status':status,'review_type':'model','reviewer_id':'2a269ec2a36f464d81a9a1b560540c1c:terra-reviewer','notes':msg},f);f.write('\n')
