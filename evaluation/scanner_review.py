"""Post-freeze scanner probes; no tuning. Independent synthetic fixture outcomes."""
import hashlib,json
from pathlib import Path
import pandas as pd
from petpilot.scan import scan_table
from pipeline.artifact import encode

CASES=[
 ('named_identifiers',pd.DataFrame({'email':['person@example.invalid']*10,'phone':['+358401234567']*10,'full_name':['Fictional Person']*10}),{'email':'direct_identifier','phone':'direct_identifier','full_name':'direct_identifier'}),
 ('renamed_email',pd.DataFrame({'c01':['person@example.invalid']*10}),{'c01':'direct_identifier'}),
 ('ambiguous_categories',pd.DataFrame({'c01':['A','B']*10,'c02':[3200,4500]*10}),{'c01':'sensitive_attribute','c02':'sensitive_attribute'}),
 ('unlinked_hash',pd.DataFrame({'c01':[hashlib.sha256(f'fictional-{i}'.encode()).hexdigest() for i in range(20)]}),{'c01':'technical_identifier'}),
 ('rare_after_sample',pd.DataFrame({'c01':['ordinary']*5000+['person@example.invalid']}),{'c01':'direct_identifier'}),
]

def main():
    rows=[]
    for name,df,truth in CASES:
        for r in scan_table(df,name):
            rows.append({'case':name,'column':r.column,'expected':truth[r.column],'observed':r.privacy_role,'reason':r.reason,'correct':truth[r.column]==r.privacy_role})
    from sklearn.metrics import f1_score
    expected=[r['expected'] for r in rows]; observed=[r['observed'] for r in rows]
    sensitive={'direct_identifier','quasi_identifier','sensitive_attribute','technical_identifier','free_text'}
    n=sum(x in sensitive for x in expected); detected=sum(e in sensitive and o in sensitive for e,o in zip(expected,observed))
    result={'experiment':'E1S','scanner_commit':'4cd1374','scope':'independent post-freeze deliberately adversarial fixtures; not random generalization sample','fixture_labels':'ambiguous c01 is union membership; c02 salary by fixture construction, unavailable to scanner','columns':len(rows),'macro_f1':float(f1_score(expected,observed,average='macro',zero_division=0)),'macro_f1_denominator':'union of observed and expected role labels','sensitive_recall':detected/n,'sensitive_denominator':n,'unknown_rate':sum(x=='unknown' for x in observed)/len(rows),'false_negatives':[r for r in rows if r['expected'] in sensitive and r['observed'] not in sensitive],'outcomes':rows,'limitations':['Rules were developed using supplied labels; development score is not blind validation.','Mystery file already inspected; not a blind test.','Absence of matches and lack of person context do not imply safety.','Publisher aggregate allowlist is independent of all scanner findings.']}
    out=Path('evidence/e1s');out.mkdir(parents=True,exist_ok=True);(out/'independent-fixtures.json').write_bytes(encode(result));print(json.dumps(result,indent=2))
if __name__=='__main__': main()
