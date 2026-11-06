"""MOB-U1 native and explicitly adapted aggregate MOB-U2/U3, upstream unchanged."""
from pathlib import Path
import json,sys
import numpy as np
import pandas as pd
from pipeline.mobility import load
from pipeline.artifact import encode
ROOT=Path('TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026')
sys.path.insert(0,str(ROOT/'toolkit'))
from pets_eval.utility.mobility import _od,_line_hour,_daily
from pets_eval.parse import table_mape,score_from_rel_error,to_datetime

def line_reference(t):
    ts=to_datetime(t.ts);mask=(ts.dt.day_of_week<5)&(t.fare_product!='double_tap')
    return t[mask].groupby([t.loc[mask,'line'].astype(str),ts[mask].dt.hour]).size()

def daily_reference(t):return t.groupby(to_datetime(t.ts).dt.date).size()

def line_adapter(t,aggregate):
    p=aggregate.groupby(['line','hour']).boardings.sum();e=table_mape(line_reference(t),p,min_count=50)
    return {'score':float(score_from_rel_error(e,.5)),'mape':float(e)}

def daily_adapter(t,aggregate):
    p=aggregate.assign(date=pd.to_datetime(aggregate.date).dt.date).groupby('date').tap_events.sum();o=daily_reference(t)
    e=table_mape(o,p);p=p.reindex(o.index,fill_value=0);corr=float(np.corrcoef(o.values,p.values)[0,1]) if p.std()>0 else 0.
    return {'score':float(score_from_rel_error(e,.3)*max(corr,0)),'mape':float(e),'r':corr}

def main():
    t,s=load(ROOT/'data/mobility');orig={'taps':t,'stops':s};release=Path('releases/e1-aura-001')
    od=pd.read_csv(release/'od_matrix.csv');line=pd.read_csv(release/'line_hour.csv',dtype={'line':str});daily=pd.read_csv(release/'daily.csv')
    # Equivalent untouched counts must score exactly as untouched rows. No pseudo-events.
    line_exact=line_reference(t).rename('boardings').reset_index();line_exact.columns=['line','hour','boardings']
    daily_exact=daily_reference(t).rename('tap_events').reset_index();daily_exact.columns=['date','tap_events']
    parity={'line_native':_line_hour(orig,orig),'line_adapter':line_adapter(t,line_exact),'daily_native':_daily(orig,orig),'daily_adapter':daily_adapter(t,daily_exact)}
    result={'experiment':'E5 native and aggregate adapters','data_class':'supplied_synthetic','release_id':'e1-aura-001','native_MOB_U1':_od(orig,{'od_matrix':od}),'adapted_MOB_U2':line_adapter(t,line),'adapted_MOB_U3':daily_adapter(t,daily),'unprotected_parity':parity,'limitations':['MOB-U2/U3 are aggregate adapters, not unmodified toolkit outputs.','Public unknown-line bucket cannot recover original unlisted line detail; native reference remains original.','No fake event records created.','External DP Mobility Report comparison not run.']}
    out=Path('evidence/e5');out.mkdir(parents=True,exist_ok=True);(out/'benchmark.json').write_bytes(encode(result));print(json.dumps(result,indent=2))
if __name__=='__main__':main()
