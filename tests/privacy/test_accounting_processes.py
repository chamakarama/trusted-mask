"""Ledger guarantees across process exit and independent worker processes."""
import subprocess,sys
from pathlib import Path
import pytest
from privacy.ledger import reserve,connect

ROOT=Path(__file__).resolve().parents[2]

def test_crashed_process_keeps_budget_reserved(tmp_path):
    ledger=tmp_path/'ledger.sqlite'
    code="from pathlib import Path; from privacy.ledger import reserve; import os,sys; reserve(Path(sys.argv[1]),'crashed','snapshot'); os._exit(17)"
    run=subprocess.run([sys.executable,'-c',code,str(ledger)],cwd=ROOT)
    assert run.returncode==17
    with pytest.raises(ValueError,match='INTERRUPTED'):reserve(ledger,'crashed','snapshot')
    with pytest.raises(ValueError,match='BUDGET'):reserve(ledger,'retry-new-name','new-snapshot')

def test_two_publisher_processes_cannot_both_reserve(tmp_path):
    ledger=tmp_path/'ledger.sqlite'
    with connect(ledger):pass
    code="from pathlib import Path; from privacy.ledger import reserve; import sys; reserve(Path(sys.argv[1]),sys.argv[2],sys.argv[2])"
    processes=[subprocess.Popen([sys.executable,'-c',code,str(ledger),str(i)],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for i in range(2)]
    results=[p.communicate(timeout=30) for p in processes]
    assert sorted(p.returncode for p in processes)==[0,1]
    assert sum('BUDGET_EXHAUSTED' in err for out,err in results)==1
