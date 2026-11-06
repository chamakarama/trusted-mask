"""Evaluate the new private inventory contract, separately from legacy scoring labels."""
from pathlib import Path
import argparse,sys,json,hashlib
import pandas as pd

def main():
    p=argparse.ArgumentParser();p.add_argument('--scanner-root',type=Path,required=True);p.add_argument('--commit',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    sys.path.insert(0,str(a.scanner_root.resolve()))
    from petpilot.scan import scan_table,SAMPLE_ROWS
    from petpilot.inventory import field_records,build_inventory
    cases=[('named',pd.DataFrame({'email':['person@example.invalid']*10,'phone':['+358401234567']*10,'full_name':['Fictional Person']*10})),('renamed',pd.DataFrame({'c01':['person@example.invalid']*10})),('ambiguous',pd.DataFrame({'c01':['A','B']*10,'c02':[3200,4500]*10})),('hash',pd.DataFrame({'c01':[hashlib.sha256(f'fictional-{i}'.encode()).hexdigest() for i in range(20)]})),('rare',pd.DataFrame({'c01':['ordinary']*5000+['person@example.invalid']}))]
    findings=[]
    for name,df in cases:
        for row in field_records(scan_table(df.head(SAMPLE_ROWS),name)):
            findings.append({'case':name,**row})
    by_case=lambda c:[r for r in findings if r['case']==c]
    assert all(r['role']=='direct_identifier' for c in ['named','renamed'] for r in by_case(c))
    assert all(r['role']=='unknown' and r['needs_review'] for r in by_case('ambiguous')+by_case('rare'))
    assert by_case('hash')[0]['role']=='technical_identifier' and by_case('hash')[0]['needs_review']
    for r in findings:assert r['rule_ids']
    fixture=build_inventory(a.scanner_root/'petpilot/fixtures/mobility_mini','mobility_mini')
    renamed=build_inventory(a.scanner_root/'petpilot/fixtures/mobility_mini_renamed','renamed')
    result={'experiment':'E1S cross-review','reviewed_commit':a.commit,'reviewer':'Astra','scanner_source_sha256':hashlib.sha256((a.scanner_root/'petpilot/scan.py').read_bytes()).hexdigest(),'disposition':'accepted under advisory private-inventory scope; no generic detection guarantee','commands':['python -m unittest discover -s petpilot/tests -t .','python -m evaluation.scanner_handoff --scanner-root <archived checkout> --commit <sha> --output <evidence>'],'upstream_fixture_fields':len(fixture['fields']),'renamed_fixture_fields':len(renamed['fields']),'independent_probe_columns':len(findings),'inventory_unknown_count':sum(r['role']=='unknown' for r in findings),'silent_false_safe_count':sum(r['role']=='non_sensitive' and not r['needs_review'] for r in findings),'findings':findings,'notes':['Legacy privacy_role labels and inventory_role abstentions differ intentionally; do not report legacy unknown rate as inventory unknown rate.','Eight-column adversarial fixture is not a random generalization sample.','Only first 5000 table rows and first 2000 nonempty values per validator; rare identifiers may be missed.','Unknown is acceptable abstention, never permission to export.','Model sees no scanner samples; publisher allowlist remains independent.']}
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='findings'},indent=2))
if __name__=='__main__':main()
