import subprocess
from pathlib import Path
import pytest
from privacy.provenance import publisher_revision,runtime_identity
from privacy.ledger import reserve

def test_publisher_requires_clean_versioned_production_code(tmp_path):
    def git(*args):return subprocess.run(['git','-C',str(tmp_path),*args],check=True,capture_output=True,text=True).stdout.strip()
    git('init','-q');(tmp_path/'pipeline').mkdir();code=tmp_path/'pipeline/a.py';code.write_text('original')
    git('add','pipeline');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','fixture')
    head=publisher_revision(tmp_path);assert len(head)==40
    (tmp_path/'evaluation').mkdir();(tmp_path/'evaluation/uncommitted.txt').write_text('not publisher code')
    assert publisher_revision(tmp_path)==head
    code.write_text('changed')
    with pytest.raises(ValueError,match='UNCOMMITTED_PUBLISHER'):publisher_revision(tmp_path)
    code.write_text('original');(tmp_path/'privacy').mkdir();(tmp_path/'privacy/new.py').write_text('new code')
    with pytest.raises(ValueError,match='UNCOMMITTED_PUBLISHER'):publisher_revision(tmp_path)

def test_runtime_noise_implementation_is_pinned():
    assert runtime_identity()['opendp']=='0.16.0'

@pytest.mark.parametrize('epsilon',[0,-1,float('nan'),float('inf')])
def test_invalid_budget_cannot_create_credit(tmp_path,epsilon):
    with pytest.raises(ValueError,match='INVALID_BUDGET'):reserve(tmp_path/'db','id','input',epsilon=epsilon)
