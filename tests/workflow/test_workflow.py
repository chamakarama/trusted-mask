"""Regressions for review invalidation, immutable inputs and verified handoff."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import numpy as np
import pytest
from pipeline import artifact, city
from pipeline.geography import zone_centres
from pipeline.snapshot import snapshot, fingerprint
import pipeline.workflow as module
from pipeline.workflow import Workflow


def inputs(folder):
    folder.mkdir(parents=True)
    import csv
    from simulation.generate import load_config, public_domain
    config=load_config();geo,stops=public_domain(config)
    (folder/'taps.csv').write_text('card_id,ts,stop_id,line,fare_product\nc1,2025-10-06 07:00:00,SYN-TRK-G01-1,SYN-NET,season\nc1,2025-10-06 17:00:00,SYN-TRK-G02-1,SYN-NET,season\n')
    with (folder/'stops.csv').open('w',newline='') as stream:
        writer=csv.DictWriter(stream,fieldnames=['stop_id','area','municipality','lat','lon','lines']);writer.writeheader();writer.writerows(stops)
    (folder/'public-zones.geojson').write_text(json.dumps(geo))
    (folder/'metadata.json').write_text(json.dumps({'dataset_class':'team-generated-synthetic','generator_version':'workflow-test-v1','population_seed':7,'period':config['period'],'geography_provenance':config['geography'],'configuration':config,'configuration_sha256':hashlib.sha256((json.dumps(config,indent=2,sort_keys=True,ensure_ascii=False)+'\n').encode()).hexdigest(),'generator_source_sha256':'a'*64,'files':{name:{'sha256':hashlib.sha256((folder/name).read_bytes()).hexdigest(),'bytes':(folder/name).stat().st_size} for name in ('taps.csv','stops.csv','public-zones.geojson')}}))
    return folder


def action(w, name, **kw): return w.action(name, {'revision':w.state['revision'],**kw})


def ready(tmp_path, monkeypatch):
    folder=inputs(tmp_path/'source')
    monkeypatch.setattr(module,'BUNDLED_CITY',tmp_path/'unbundled')
    w=Workflow(tmp_path/'runtime',folder)
    action(w,'select',dataset_id='city'); action(w,'validate'); action(w,'review',acknowledged=True); action(w,'purpose',purpose='aggregate_transport_planning')
    def publish(folder,output,ledger,ident):
        dom,_,bounded,geo=city.prepare_city(folder)
        artifact.write(output,artifact.build(ident,'a'*40,dom,{k:v.tolist() for k,v in bounded.items()},geo,city=True,city_provenance=city.public_provenance(folder)))
        return {'release_id':ident,'manifest_sha256':artifact.verify(output),'reused':False}
    monkeypatch.setattr(city,'publish',publish)
    monkeypatch.setattr(module,'sync_release',lambda *_: None)
    return w,folder


def test_city_validation_and_snapshot(tmp_path):
    folder=inputs(tmp_path/'source')
    dom,raw,bounded,geo=city.prepare_city(folder)
    assert len(dom['od'])==3125 and sum(raw['od'])==2
    snap,digest=snapshot(folder,city.INPUTS,tmp_path/'snapshots')
    (folder/'taps.csv').write_text('changed')
    assert fingerprint(snap,city.INPUTS)==digest
    assert fingerprint(folder,city.INPUTS)!=digest
    broken=copy.deepcopy(geo);broken['features'][1]['geometry']=broken['features'][0]['geometry']
    with pytest.raises(ValueError,match='overlapping'):zone_centres(broken,polygons=True)


def test_failed_revalidation_revokes_old_release(tmp_path,monkeypatch):
    w,folder=ready(tmp_path,monkeypatch)
    action(w,'publish');action(w,'accept',acknowledged=True);action(w,'share')
    (folder/'taps.csv').write_text('invalid')
    with pytest.raises(ValueError):action(w,'validate')
    assert w.state['completed']==0 and not {'candidate','evaluation','acceptance','package'} & w.state.keys()
    assert json.loads(w.state_file.read_text())['completed']==0
    with pytest.raises(ValueError):w.package_bytes()


def test_added_scanner_input_invalidates_review(tmp_path,monkeypatch):
    w,folder=ready(tmp_path,monkeypatch)
    (folder/'extra.csv').write_text('sensitive\nchanged\n')
    with pytest.raises(ValueError,match='INPUT_CHANGED'):action(w,'publish')
    assert w.state['completed']==0


def test_evaluation_failure_cannot_reuse_previous_approval(tmp_path,monkeypatch):
    w,_=ready(tmp_path,monkeypatch)
    action(w,'publish');action(w,'accept',acknowledged=True)
    monkeypatch.setattr(module,'prepare',lambda *_: (_ for _ in ()).throw(ValueError('forced failure')))
    with pytest.raises(ValueError,match='forced failure'):action(w,'publish')
    assert w.state['completed']==4 and 'evaluation' not in w.state and 'acceptance' not in w.state
    with pytest.raises(ValueError,match='EVALUATION_INCOMPLETE'):action(w,'accept',acknowledged=True)


def test_archive_corruption_never_becomes_ready(tmp_path,monkeypatch):
    w,_=ready(tmp_path,monkeypatch)
    action(w,'publish');action(w,'accept',acknowledged=True)
    path=w.runtime/'packages/city-turku-v1.zip';path.parent.mkdir();path.write_bytes(b'partial zip')
    with pytest.raises(ValueError,match='PACKAGE_INVALID'):action(w,'share')
    assert w.state['completed']==5
    path.unlink();action(w,'share')
    assert w.package_bytes().startswith(b'PK')
    path.write_bytes(b'changed')
    with pytest.raises(ValueError,match='PACKAGE_CHANGED'):w.package_bytes()


def test_evaluation_bound_to_exact_artifact(tmp_path,monkeypatch):
    w,_=ready(tmp_path,monkeypatch);action(w,'publish')
    w.state['evaluation']['identity']['manifest_sha256']='0'*64
    with pytest.raises(ValueError,match='EVALUATION_STALE'):action(w,'accept',acknowledged=True)


def test_public_id_and_geography_rejected_after_rehash(tmp_path):
    folder=inputs(tmp_path/'source');dom,_,v,geo=city.prepare_city(folder)
    payload=artifact.build('safe-id','a'*40,dom,{k:x.tolist() for k,x in v.items()},geo,city=True,city_provenance=city.public_provenance(folder))
    manifest=json.loads(payload['manifest.json']);manifest['release_id']='../escaped'
    payload['manifest.json']=json.dumps(manifest).encode()
    payload['checksums.sha256']=''.join(f'{artifact.sha(b)}  {name}\n' for name,b in sorted(payload.items()) if name!='checksums.sha256').encode()
    output=tmp_path/'release';artifact.write(output,payload)
    with pytest.raises(Exception,match='release_id|does not match'):artifact.verify(output)
    from pipeline.public import sync_release
    with pytest.raises(Exception):sync_release(output,tmp_path/'public')
    assert not (tmp_path/'public/escaped').exists()


def test_metadata_checksum_and_municipality_gate(tmp_path):
    folder=inputs(tmp_path/'source')
    metadata=json.loads((folder/'metadata.json').read_text());metadata['files']['public-zones.geojson']['sha256']='0'*64
    (folder/'metadata.json').write_text(json.dumps(metadata))
    with pytest.raises(ValueError,match='input checksum'):city.prepare_city(folder)


def test_revision_prevents_stale_actions(tmp_path,monkeypatch):
    w,_=ready(tmp_path,monkeypatch)
    with pytest.raises(ValueError,match='STALE_REVISION'):w.action('publish',{'revision':0})


def test_bundled_city_reused_in_fresh_runtime_without_draw(tmp_path,monkeypatch):
    w,folder=ready(tmp_path,monkeypatch);action(w,'publish')
    receipt=tmp_path/'bundled-receipt.json'
    receipt.write_text(json.dumps({'fingerprint':w.state['fingerprint'],'receipt':{k:w.state['candidate'][k] for k in ('release_id','manifest_sha256')}}))
    monkeypatch.setattr(module,'BUNDLED_CITY',w.source());monkeypatch.setattr(module,'BUNDLED_RECEIPT',receipt)
    monkeypatch.setattr(city,'publish',lambda *_: (_ for _ in ()).throw(AssertionError('must not redraw')))
    other=Workflow(tmp_path/'other-runtime',folder)
    action(other,'select',dataset_id='city');action(other,'validate');action(other,'review',acknowledged=True);action(other,'purpose',purpose='aggregate_transport_planning');action(other,'publish')
    assert other.state['candidate']['reused'] is True
    assert not (other.runtime/'city-ledger.sqlite').exists()
