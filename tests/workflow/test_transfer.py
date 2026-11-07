import io,json,zipfile,stat
from pathlib import Path
import pytest
from pipeline.transfer import extract_upload,raw_demo_zip,protected_document
from pipeline import artifact,city
from pipeline.workflow import Workflow
import pipeline.workflow as module
from tests.workflow.test_workflow import inputs


def archive(entries):
    s=io.BytesIO()
    with zipfile.ZipFile(s,'w') as z:
        for name,data in entries:z.writestr(name,data)
    return s.getvalue()


def test_upload_rejects_path_traversal_duplicates_and_symlinks(tmp_path):
    for entries in [ [('.. /taps.csv','bad')], [('taps.csv','')]*4, [(n,'') for n in city.INPUTS]+[('../escape','bad')] ]:
        with pytest.raises(ValueError,match='UPLOAD_FILES'):extract_upload(archive(entries),tmp_path)
    s=io.BytesIO()
    with zipfile.ZipFile(s,'w') as z:
        for name in city.INPUTS:
            entry=zipfile.ZipInfo(name);entry.external_attr=(stat.S_IFLNK|0o777)<<16;z.writestr(entry,'/tmp/target')
    with pytest.raises(ValueError,match='UPLOAD_FILES'):extract_upload(s.getvalue(),tmp_path)


def test_registered_upload_is_private_persistent_and_invalidates_previous_steps(tmp_path,monkeypatch):
    source=inputs(tmp_path/'source');digest=city.fingerprint(source)
    monkeypatch.setattr(module,'city_registration',lambda d:('registered',{}) if d==digest else None)
    w=Workflow(tmp_path/'runtime',source);w.state={'revision':4,'completed':6,'candidate':{'old':True}}
    result=w.upload(raw_demo_zip(source),4)
    assert result['completed']==0 and 'candidate' not in result
    assert w.datasets['city']['path'].is_relative_to(w.runtime/'uploads')
    assert city.fingerprint(Workflow(w.runtime).datasets['city']['path'])==digest
    with pytest.raises(ValueError,match='STALE'):w.upload(raw_demo_zip(source),4)
    before=w.state.copy();monkeypatch.setattr(module,'city_registration',lambda _:None)
    with pytest.raises(ValueError,match='UNREGISTERED'):w.upload(raw_demo_zip(source),w.state['revision'])
    assert w.state==before


def test_protected_export_has_only_verified_public_members_and_derived_sums():
    root=Path(__file__).resolve().parents[2];source=root/'releases/city-turku-v1'
    doc=protected_document(source)
    assert set(doc['files'])==artifact.PAYLOADS|{'manifest.json','checksums.sha256'}
    assert doc['manifest_sha256']==artifact.verify(source)
    assert all(doc['files'][name]==(source/name).read_text() for name in doc['files'])
    morning=next(r for r in doc['aggregate_destinations'] if r['destination_area']=='TRK-G18' and r['departure_band']=='06-09')
    assert morning['protected_period_trips']==96392
    text=json.dumps(doc);assert 'SYN-C000001' not in text and 'HACK-C' not in text
