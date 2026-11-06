from pathlib import Path
import json,sqlite3
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import pandas as pd
import pytest
from pipeline.mobility import prepare,load,CAPS
from pipeline.artifact import build,write,verify
from privacy.mechanism import measurement
from privacy.ledger import reserve,commit

def inputs():
    stops=pd.DataFrame({'stop_id':['s1','s2'],'area':['a','b'],'municipality':['town','town'],'lat':['60','60.1'],'lon':['22','22.1'],'lines':['1','1']})
    taps=pd.DataFrame([{'card_id':card,'ts':f'2025-10-{6+d:02d} {h:02d}:00:00','stop_id':'s1' if h==7 else 's2','line':'1','fare_product':'season'} for card in ['one','two'] for d in range(20) for h in [7,9,11,13,15,17,19,21]])
    return taps,stops

def test_card_local_bounds_and_neighbor():
    t,s=inputs(); dom,raw,bounded,geo=prepare(t,s)
    _,_,one,_=prepare(t[t.card_id=='one'],s)
    _,_,two,_=prepare(t[t.card_id=='two'],s)
    for f in CAPS:
        assert bounded[f].sum()<=2*CAPS[f]
        assert np.abs(bounded[f]-one[f]).sum()<=CAPS[f]
        assert np.array_equal(bounded[f],one[f]+two[f])
        assert measurement(f).check(CAPS[f],{'od':.6,'line_hour':.3,'daily':.1}[f])

def test_missing_stop_only_excluded_from_od():
    t,s=inputs();t.loc[0,'stop_id']=None
    _,raw,_,_=prepare(t,s)
    assert raw['daily'].sum()==len(t)
    t.loc[0,'card_id']=None
    with pytest.raises(ValueError,match='missing values'): prepare(t,s)

def test_duplicate_join_and_unknown_line():
    t,s=inputs()
    with pytest.raises(ValueError,match='duplicate'):prepare(t,pd.concat([s,s.iloc[:1]]))
    t.loc[0,'line']='private-new-line'
    dom,raw,_,_=prepare(t,s)
    assert 'private-new-line' not in {x[0] for x in dom['line_hour']}
    assert ('unknown',7) in dom['line_hour']

def test_canary_excluded_and_artifact_tamper(tmp_path):
    t,s=inputs();t['secret_canary']='CANARY-PRIVATE-123';t['scanner_role']='non_sensitive'
    dom,raw,bounded,geo=prepare(t,s)
    payload=build('test','a'*40,dom,{f:v.tolist() for f,v in bounded.items()},geo)
    assert b'CANARY' not in b''.join(payload.values())
    path=tmp_path/'bundle';write(path,payload);verify(path)
    (path/'statistics.json').write_text('{}')
    with pytest.raises(ValueError,match='hash'):verify(path)

def test_extra_manifest_field_rejected():
    from pipeline.artifact import SCHEMA
    import jsonschema
    t,s=inputs();dom,_,v,geo=prepare(t,s);payload=build('test','a'*40,dom,{f:x.tolist() for f,x in v.items()},geo)
    m=json.loads(payload['manifest.json']);m['card_id']='forbidden'
    with pytest.raises(jsonschema.ValidationError):jsonschema.validate(m,json.loads(SCHEMA.read_text()))

def test_ledger_retry_crash_and_budget(tmp_path):
    path=tmp_path/'ledger.db'
    assert reserve(path,'r1','identity') is None
    with pytest.raises(ValueError,match='INTERRUPTED'):reserve(path,'r1','identity')
    with pytest.raises(ValueError,match='BUDGET'):reserve(path,'r2','new')
    commit(path,'r1','identity','abc')
    assert reserve(path,'r1','identity')=='abc'
    with pytest.raises(ValueError,match='CONFLICT'):reserve(path,'r1','changed')

def test_concurrent_reservation_serializes(tmp_path):
    path=tmp_path/'ledger.db'
    # Initialise before racing callers; production also tolerates SQLite startup locks.
    from privacy.ledger import connect
    with connect(path): pass
    def call(i):
        try:return reserve(path,str(i),str(i))
        except ValueError as e:return str(e)
    with ThreadPoolExecutor(2) as pool:results=list(pool.map(call,[1,2]))
    assert results.count(None)==1
    assert sum('BUDGET' in str(x) for x in results)==1

def test_inference_edges():
    t,s=inputs()
    t=t.iloc[:3].copy();t['card_id']='one';t['ts']=['2025-10-06 07:00:00','2025-10-06 07:30:00','2025-10-06 09:00:00'];t['stop_id']=['s1','s2','s2']
    domain,raw,_,_=prepare(t,s)
    assert raw['od'][domain['od'].index(('a','b','06-09'))]==1
    assert raw['od'][domain['od'].index(('b','a','09-15'))]==1
    assert raw['od'].sum()==2
    domain,raw,_,_=prepare(t.iloc[:1],s)
    assert raw['od'][domain['od'].index(('a','a','06-09'))]==1
    t['ts']=['2025-10-26 03:00:00']*3
    _,raw,_,_=prepare(t,s)
    assert raw['od'].sum()==0 and raw['line_hour'].sum()==0 and raw['daily'].sum()==3

def test_inventory_false_safe_does_not_change_handling():
    from pipeline.inventory import adapt
    df=pd.DataFrame([{'dataset':'mobility','table':'taps','column':'card_id','privacy_role':'non_sensitive','subtype':'','reason':'deliberate false-safe'}])
    field=adapt(df)['fields'][0]
    assert field['policy']['handling']=='internal_grouping_only'
    assert field['needs_review'] is True

def test_false_privacy_metadata_rejected(tmp_path):
    import jsonschema
    from pipeline.artifact import SCHEMA
    t,s=inputs();dom,_,v,geo=prepare(t,s);payload=build('test','a'*40,dom,{f:x.tolist() for f,x in v.items()},geo)
    m=json.loads(payload['manifest.json']);m['privacy']['families']['od']['cap']=1
    with pytest.raises(jsonschema.ValidationError):jsonschema.validate(m,json.loads(SCHEMA.read_text()))

def test_public_formula_label_rejected():
    t,s=inputs();s.loc[0,'area']='=HYPERLINK("example")'
    with pytest.raises(ValueError,match='unsafe public label'):prepare(t,s)
