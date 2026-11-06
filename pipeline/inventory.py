"""Adapter to existing petpilot. Findings are advisory and never export permission."""
import argparse,json,subprocess
from pathlib import Path
import pandas as pd
from petpilot.scan import scan_folder
ROLES={'direct_identifier','quasi_identifier','sensitive_attribute','technical_identifier','record_key','free_text','non_sensitive','unknown'}
HANDLING={'card_id':'internal_grouping_only','ts':'time_bin','stop_id':'public_reference_lookup','line':'aggregate_input','fare_product':'internal_grouping_only'}

def adapt(df):
    if df.duplicated(['dataset','table','column']).any():raise ValueError('INVALID_INVENTORY: duplicate field')
    fields=[]
    for row in df.to_dict('records'):
        role=row['privacy_role'] if row['privacy_role'] in ROLES else 'unknown'
        fields.append({'table':row['table'],'column':row['column'],'role':role,'subtype':row['subtype'],'reason':row['reason'],'rule_ids':[],'rule_evidence':'not_emitted_by_scanner','certainty':'unknown','needs_review':True,'policy':{'purpose_id':'public_aggregate_mobility','handling':HANDLING.get(row['column'],'omit') if row['table']=='taps' else 'public_reference_lookup' if row['table']=='stops' else 'omit','rationale':'Explicit supported schema; scanner label cannot permit export.','required_for_analysis':row['table']=='taps' and row['column'] in HANDLING,'review_status':'pending_review'}})
    return {'inventory_schema_version':'1.0','scanner_version':'petpilot at 4cd1374','source_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'dataset':'mobility','analysis_mode':'rules','sampling':'First 5000 rows; value validators first 2000 nonempty values; rare values may be missed.','fields':fields}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--data',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    df=scan_folder(a.data,['mobility']);a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(adapt(df),indent=2));print(f'Inventory fields: {len(df)}; all pending review')
