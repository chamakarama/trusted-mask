"""Send the local credential to Secret Manager over stdin, never shell arguments.

Usage: python scripts/upload_secret.py PROJECT SECRET [--new-version]
Only status is printed. This script never adds a public IAM binding.
"""
import argparse
from pathlib import Path
import subprocess

p=argparse.ArgumentParser()
p.add_argument('project');p.add_argument('secret');p.add_argument('--new-version',action='store_true')
args=p.parse_args()
file=Path(__file__).resolve().parents[1]/'.env.local'
file.chmod(0o600)
values={}
for line in file.read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key,value=line.split('=',1);values[key.strip()]=value.strip().strip('\"\'')
credential=values.get('ANTHROPIC_API_KEY','')
if not credential or '\n' in credential:
    raise SystemExit('No valid API key is configured in .env.local')
command=['gcloud','secrets']+(['versions','add',args.secret] if args.new_version else ['create',args.secret,'--replication-policy=automatic'])
result=subprocess.run(command+[f'--project={args.project}','--data-file=-'],input=credential.encode(),capture_output=True)
if result.returncode:
    raise SystemExit(f'Secret upload failed (status {result.returncode}); credential output suppressed.')
print('Credential stored in Secret Manager. No credential was printed or included in a command argument.')
