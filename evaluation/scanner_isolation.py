"""Run frozen scanner production modules without evaluation/label resources in its root."""
from pathlib import Path
import tempfile,shutil,subprocess,sys,json,hashlib
from pipeline.artifact import encode

def main():
    source=Path('TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data/mobility')
    root=Path(tempfile.mkdtemp(prefix='routesafe-scanner-isolation-'));(root/'petpilot').mkdir();(root/'data').mkdir()
    modules=['__init__.py','scan.py','validators.py','inventory.py']
    for name in modules:shutil.copyfile(Path('petpilot')/name,root/'petpilot'/name)
    files=sorted(source.glob('*.csv'))
    for path in files:shutil.copyfile(path,root/'data'/path.name)
    code="from pathlib import Path; from petpilot.inventory import build_inventory; import json,sys; inv=build_inventory(Path('data'),'mobility'); Path('private-inventory.json').write_text(json.dumps(inv)); print(json.dumps({'fields':len(inv['fields']),'unknown':sum(f['role']=='unknown' for f in inv['fields']),'review':sum(f['needs_review'] for f in inv['fields']),'evaluation_imported':'petpilot.evaluate' in sys.modules}))"
    run=subprocess.run([sys.executable,'-c',code],cwd=root,capture_output=True,text=True,check=True)
    observed=json.loads(run.stdout);assert observed['fields']==48 and not observed['evaluation_imported']
    full=json.loads((root/'private-inventory.json').read_text());existing=json.loads(Path('web/operator-data/mobility-inventory.json').read_text())
    strip=lambda f:{k:v for k,v in f.items() if k!='policy'}
    assert full['fields']==[strip(f) for f in existing['fields']]
    report={'experiment':'E1S scanner resource isolation','data_class':'supplied_synthetic','observed':observed,'same_fields_as_operator_inventory':True,'production_modules':{name:hashlib.sha256((root/'petpilot'/name).read_bytes()).hexdigest() for name in modules},'input_tables':[p.name for p in files],'absent_from_isolated_root':['metadata','truth','adversary','holdout','evaluation','field_catalog','petpilot.evaluate'],'scope':'Separate working root containing four production modules and supplied data only. This is a dependency check, not an operating-system sandbox or blind detector-quality test. Raw inventory remains local and private.'}
    Path('evidence/e1s/scanner-isolation.json').write_bytes(encode(report));print(json.dumps(report))
if __name__=='__main__':main()
