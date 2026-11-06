from pathlib import Path
import zipfile
import pytest
from pipeline.bundle import bundle

FIX=Path(__file__).resolve().parents[2]/'fixtures/protected-v1'

def test_packaging_is_repeatable_and_contains_only_verified_members(tmp_path):
    first=tmp_path/'first.zip';second=tmp_path/'second.zip'
    a=bundle(FIX,first);b=bundle(FIX,second)
    assert a==b and first.read_bytes()==second.read_bytes()
    assert a['noise_draws']==0 and a['members']==9
    with zipfile.ZipFile(first) as z:assert all('/' not in name for name in z.namelist())
    with pytest.raises(FileExistsError):bundle(FIX,first)

def test_packaging_cannot_modify_immutable_release():
    with pytest.raises(ValueError,match='OUTSIDE_IMMUTABLE'):bundle(FIX,FIX/'extra.zip')

def test_offline_packager_rejects_unlisted_build_data(tmp_path):
    import shutil,json
    from pipeline.offline import package
    root=tmp_path/'dist'; (root/'releases').mkdir(parents=True);(root/'contract').mkdir();(root/'assets').mkdir()
    shutil.copytree(FIX,root/'releases/fixture-only-001')
    (root/'releases/index.json').write_text(json.dumps({'releases':[{'release_id':'fixture-only-001'}]}))
    (root/'contract/manifest.schema.json').write_text('{}')
    (root/'index.html').write_text('<html>fixture</html>');(root/'assets/index-test.js').write_text('console.log("fixture")')
    receipt=package(root,tmp_path/'okay.zip');assert receipt['noise_draws']==0
    (root/'releases/raw.csv').write_text('private_canary\nNEVER_COPY\n')
    with pytest.raises(ValueError,match='UNEXPECTED_BUILD_PATH'):package(root,tmp_path/'bad.zip')
