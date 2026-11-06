"""Reproduce supplied row-baseline mobility utility, using labels only in evaluation."""
from pathlib import Path
import sys,json,hashlib,subprocess
import importlib.metadata as metadata
from pipeline.artifact import encode
ROOT=Path('TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026')
sys.path[:0]=[str(ROOT/'toolkit'),str(ROOT/'baselines')]
from pets_eval import io
from pets_eval.utility.mobility import _od,_line_hour,_daily
from _common import protect_table,catalog_for

def main():
    orig={name:io.read_table(ROOT/f'data/mobility/{name}.csv') for name in ['taps','stops']};catalog=catalog_for('mobility');rows={}
    for level in ['original','b0','b2','b2k']:
        protected=orig if level=='original' else {'taps':protect_table('mobility','taps',orig['taps'],catalog,level)}
        rows[level]={'MOB-U1':_od(orig,protected),'MOB-U2':_line_hour(orig,protected),'MOB-U3':_daily(orig,protected)}
        print(level,rows[level],flush=True)
    result={'experiment':'E5 reproduced row baselines','data_class':'supplied_synthetic','status':'executed unmodified baseline protection and native task functions','command':'python -m evaluation.baselines','evaluator_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'git_head_at_run':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'package_manifest_sha256':hashlib.sha256((ROOT/'MANIFEST.json').read_bytes()).hexdigest(),'versions':{k:metadata.version(k) for k in ['pandas','numpy','scipy','opendp']},'results':rows,'limitations':['Baselines use the supplied field catalog, a label-informed oracle. Publisher never does.','This runs MOB-U1/U2/U3 only, not the entire nine-domain scorecard.','Toolkit scores are self-assessment, not an official competition rubric.','Row-baseline utility and trajectory risk must be considered together.']}
    differences=[]
    for level in ['b0','b2','b2k']:
        saved=json.loads((ROOT/'results'/level/'mobility/scorecard.json').read_text())
        for task in saved['utility']:
            if task['id'] in rows[level] and any(rows[level][task['id']][k]!=task[k] for k in ['score','detail']):differences.append([level,task['id']])
    result['saved_scorecard_comparison']={'tasks_compared':9,'different_tasks':differences,'note':'Compare scores and detail objects. B2 utility 0.9797 in the plan is the mean of eight mobility tasks; its MOB-U1 alone is 0.8457823456.'}
    Path('evidence/e5/baselines-reproduced.json').write_bytes(encode(result))
if __name__=='__main__':main()
