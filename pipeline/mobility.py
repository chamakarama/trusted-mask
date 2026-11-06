"""Private, card-local mobility preparation. No evaluation imports or registry joins."""
from __future__ import annotations
import hashlib
import json
import re
from itertools import product
import numpy as np
import pandas as pd

BANDS = ('00-06','06-09','09-15','15-18','18-24')
DATES = tuple(pd.date_range('2025-10-06','2025-11-02').strftime('%Y-%m-%d'))
CAPS = {'od':32,'line_hour':64,'daily':64}
EPS = {'od':0.6,'line_hour':0.3,'daily':0.1}
COLUMNS = {'od':['origin_area','destination_area','hour_band'], 'line_hour':['line','hour'], 'daily':['date']}
VALUES = {'od':'trips','line_hour':'boardings','daily':'tap_events'}
TAP_COLS = ['card_id','ts','stop_id','line','fare_product']
STOP_COLS = ['stop_id','area','municipality','lat','lon','lines']

def validate(taps, stops):
    for df, required in ((taps,TAP_COLS),(stops,STOP_COLS)):
        if not set(required) <= set(df.columns): raise ValueError('INVALID_SCHEMA: missing required fields')
        if df[[c for c in required if not (df is taps and c=='stop_id')]].isna().any().any(): raise ValueError('INVALID_SCHEMA: missing values')
    if stops.stop_id.duplicated().any(): raise ValueError('INVALID_SCHEMA: duplicate public stop keys')
    if not len(stops): raise ValueError('INVALID_SCHEMA: empty public domain')
    for col in ('stop_id','area','municipality','lines'):
        if stops[col].str.strip().eq('').any(): raise ValueError('INVALID_SCHEMA: empty reference field')
        if stops[col].str.contains(r'^[=+@\-\t\r\n]|[\r\n]',regex=True).any(): raise ValueError('INVALID_SCHEMA: unsafe public label')
    if taps.card_id.str.strip().eq('').any(): raise ValueError('INVALID_SCHEMA: missing card ID')
    for col,lo,hi in [('lat',-90,90),('lon',-180,180)]:
        v=pd.to_numeric(stops[col],errors='coerce')
        if not np.isfinite(v).all() or not v.between(lo,hi).all(): raise ValueError('INVALID_SCHEMA: coordinates')
    # Each area must have one public municipality label.
    if (stops.groupby('area').municipality.nunique()>1).any(): raise ValueError('INVALID_SCHEMA: area mapping')
    ts=pd.to_datetime(taps.ts,format='%Y-%m-%d %H:%M:%S',errors='coerce')
    if ts.isna().any(): raise ValueError('INVALID_SCHEMA: timestamp')
    if not ts.dt.strftime('%Y-%m-%d').isin(DATES).all(): raise ValueError('INVALID_SCHEMA: period')
    if not taps.stop_id.dropna().isin(stops.stop_id).all(): raise ValueError('DOMAIN_MISMATCH: stop')
    lines=sorted(set('|'.join(stops.lines).split('|')))
    if '' in lines: raise ValueError('DOMAIN_MISMATCH: empty public line')
    if any(re.search(r'^[=+@\-\t\r\n]|[\r\n]',line) for line in lines): raise ValueError('INVALID_SCHEMA: unsafe public line label')
    lines=sorted(set(lines)|{'unknown'})
    return ts, lines

def load(input_path):
    # Select only approved inputs; optional extra columns cannot enter the pipeline.
    taps=pd.read_csv(input_path/'taps.csv',dtype=str,usecols=TAP_COLS)
    stops=pd.read_csv(input_path/'stops.csv',dtype=str,usecols=STOP_COLS)
    return taps,stops

def prepare(taps,stops,*,evaluation_caps=None):
    # Only evaluation calls override these; the publishing CLI always uses the fixed policy.
    caps=CAPS if evaluation_caps is None else evaluation_caps
    if set(caps)!=set(CAPS) or any(type(c) is not int or c<=0 for c in caps.values()): raise ValueError("UNKNOWN_POLICY")
    ts,lines=validate(taps,stops)
    t=taps[TAP_COLS].copy(); t['ts']=ts
    t['line']=t.line.where(t.line.isin(lines),'unknown')
    t['area']=t.stop_id.map(stops.set_index('stop_id').area)
    t['date']=ts.dt.strftime('%Y-%m-%d'); t['hour']=ts.dt.hour
    t['card']=t.card_id
    weekday=t[(t.ts.dt.day_of_week<5)&(t.fare_product!='double_tap')].copy()
    # Stable ties canonicalised by public stop/line; documented difference only for tied distinct events.
    j=weekday.dropna(subset=['area']).sort_values(['card','ts','stop_id','line'],kind='stable').copy()
    gap=j.groupby(['card','date']).ts.diff().dt.total_seconds().fillna(1e9)
    j=j[gap>3600].copy()
    groups=j.groupby(['card','date'])
    j['destination_area']=groups.area.shift(-1).fillna(groups.area.transform('first'))
    j['origin_area']=j.area
    j['hour_band']=pd.cut(j.hour, [0,6,9,15,18,24],right=False,labels=BANDS).astype(str)
    areas=sorted(stops.area.unique())
    domains={'od':list(product(areas,areas,BANDS)), 'line_hour':list(product(lines,range(24))), 'daily':[(d,) for d in DATES]}
    frames={'od':j,'line_hour':weekday,'daily':t}
    raw={}; bounded={}
    for family,frame in frames.items():
        cols=COLUMNS[family]; domain=pd.MultiIndex.from_tuples(domains[family],names=cols)
        raw[family]=frame.groupby(cols).size().reindex(domain,fill_value=0).to_numpy(dtype=int)
        # Hash final count units plus card/time/stop/line. Identical units interchangeable;
        # never use a whole-input hash or cross-card ranking. Cap is across the full vector.
        keys=['card','ts','stop_id','line']+cols
        keys=list(dict.fromkeys(keys))
        rank=[hashlib.sha256(('routesafe-cap-v1'+json.dumps(row,separators=(',',':'))).encode()).hexdigest() for row in frame[keys].fillna('').astype(str).itertuples(index=False,name=None)]
        chosen=frame.assign(_rank=rank).sort_values(['card','_rank'],kind='stable').groupby('card',sort=False).head(caps[family])
        bounded[family]=chosen.groupby(cols).size().reindex(domain,fill_value=0).to_numpy(dtype=int)
    geometry=[]
    for area,g in stops.groupby('area',sort=True):
        geometry.append({'type':'Feature','properties':{'area_id':area,'name':area,'municipality':g.municipality.iloc[0],'source':'Public synthetic stops; unweighted centroid'},'geometry':{'type':'Point','coordinates':[float(g.lon.astype(float).mean()),float(g.lat.astype(float).mean())]}})
    return domains,raw,bounded,{'type':'FeatureCollection','features':geometry}
