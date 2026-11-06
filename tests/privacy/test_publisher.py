"""Exercise publication, immutable retry and interruption with invented input only."""
import json
from pathlib import Path
import pandas as pd
import pytest
import pipeline.__main__ as publisher
from pipeline.artifact import verify

def small_inputs(path):
    path.mkdir()
    pd.DataFrame({'stop_id':['s1','s2'],'area':['a','b'],'municipality':['town','town'],'lat':['60','60.1'],'lon':['22','22.1'],'lines':['1','1']}).to_csv(path/'stops.csv',index=False)
    pd.DataFrame([{'card_id':'invented','ts':f'2025-10-06 {h:02d}:00:00','stop_id':'s1' if h==7 else 's2','line':'1','fare_product':'season'} for h in [7,9]]).to_csv(path/'taps.csv',index=False)

def test_publish_reuses_bytes_without_second_draw(tmp_path,monkeypatch):
    # Provenance is tested separately; this test intentionally supports an uncommitted dev tree.
    monkeypatch.setattr(publisher,'publisher_revision',lambda:'a'*40)
    inp=tmp_path/'input';small_inputs(inp);out=tmp_path/'release';ledger=tmp_path/'ledger'
    original=publisher.draw;calls=[]
    def counted(values):
        calls.append(True)
        return original(values)
    monkeypatch.setattr(publisher,'draw',counted)
    first=publisher.publish(inp,out,ledger,'toy');before={p.name:p.read_bytes() for p in out.iterdir()}
    second=publisher.publish(inp,out,ledger,'toy')
    assert not first['reused'] and second['reused']
    assert first['manifest_sha256']==second['manifest_sha256']==verify(out)
    assert before=={p.name:p.read_bytes() for p in out.iterdir()} and len(calls)==1
    with pytest.raises(ValueError,match='CONFLICT'):publisher.publish(inp,tmp_path/'other',ledger,'renamed')
    monkeypatch.setattr(publisher,'publisher_revision',lambda:'b'*40)
    with pytest.raises(ValueError,match='BUDGET'):publisher.publish(inp,tmp_path/'new',ledger,'new')
    assert len(calls)==1

def test_failure_after_draw_stays_charged(tmp_path,monkeypatch):
    monkeypatch.setattr(publisher,'publisher_revision',lambda:'a'*40)
    inp=tmp_path/'input';small_inputs(inp);out=tmp_path/'release';ledger=tmp_path/'ledger'
    original=publisher.draw;calls=[]
    def interrupted(values):
        calls.append(True);original(values)
        raise RuntimeError('simulated interruption after draw')
    monkeypatch.setattr(publisher,'draw',interrupted)
    with pytest.raises(RuntimeError):publisher.publish(inp,out,ledger,'toy')
    with pytest.raises(ValueError,match='INTERRUPTED'):publisher.publish(inp,out,ledger,'toy')
    assert len(calls)==1 and not out.exists()
