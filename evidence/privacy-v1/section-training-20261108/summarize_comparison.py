"""Recompute the comparison from saved actual-pipeline development reports."""
import json
from pathlib import Path

ROOT=Path('evidence/privacy-v1/section-training-20261108')
def error_keys(report,field):
    return {(r['id'],e['start'],e['end']) for r in report['outputs'] for e in r[field]}
def metrics(report,baseline):
    c=report['counts'];out=dict(c)
    for field in ['identifier_misses','lost_required_facts']:
        new,old=error_keys(report,field),error_keys(baseline,field)
        out['new_'+field+'_vs_old_deberta']=len(new-old)
        out['fixed_'+field+'_vs_old_deberta']=len(old-new)
    predicted=c.get('predicted_removed_clauses',0)
    out['clause_drop_precision']=c['correct_clause_removals']/predicted if predicted else None
    out['clause_drop_recall']=c['correct_clause_removals']/c['required_clause_removals']
    out['whole_section_drop_recall']=c.get('whole_sections_removed',0)/c['required_whole_sections']
    out['prototype_acceptance_passed']=bool(c['correct_clause_removals']>baseline['counts']['correct_clause_removals']
        and not c['false_clause_removals'] and not out['new_identifier_misses_vs_old_deberta']
        and not out['new_lost_required_facts_vs_old_deberta'])
    return out
out={'evaluation_role':'development_selection_not_independent_final_test','splits':{}}
for split in ['original-dev','supplemental']:
    oldpath=ROOT/'baselines'/('deberta-original-dev.json' if split=='original-dev' else 'deberta-original-supplemental.json')
    baseline=json.loads(oldpath.read_text())
    paths={'old-deberta':oldpath,'rules':ROOT/'baselines'/('rules-'+split+'.json'),
           'minilm':ROOT/'baselines'/('minilm-'+split+'.json')}
    for size in ['base','large']:
        folder=ROOT/size/'cloud/evaluation'/size
        for epoch in [1,2]:paths[f'{size}-epoch-{epoch}']=folder/f'epoch-{epoch}-conditioned-{split}.json'
        paths[size+'-goal-agnostic']=folder/f'epoch-2-goal-agnostic-{split}.json'
        paths[size+'-legacy-pipeline']=folder/f'epoch-2-legacy-pipeline-{split}.json'
        for threshold in ['0.999','0.9999']:
            paths[size+'-threshold-'+threshold]=ROOT/size/'cloud/evaluation'/(size+'-thresholds')/(threshold+'-'+split+'.json')
    out['splits'][split]={name:metrics(json.loads(path.read_text()),baseline) for name,path in paths.items() if path.exists()}
(ROOT/'comparison.json').write_text(json.dumps(out,indent=2)+'\n')
for split,models in out['splits'].items():
    print(split)
    for name,c in models.items():
        print(name,{k:c.get(k,0) for k in ['identifier_misses','lost_required_facts','correct_clause_removals','false_clause_removals','correct_task_conditioned_switches','new_identifier_misses_vs_old_deberta','new_lost_required_facts_vs_old_deberta','prototype_acceptance_passed']})
