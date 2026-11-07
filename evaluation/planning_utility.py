"""Prospective area-shortlist evaluation. No publisher or ledger operations."""
import hashlib,json
from pathlib import Path
import numpy as np
from pipeline.city import prepare_city,fingerprint
from pipeline.mobility import CAPS,EPS,BANDS
from pipeline.planning_task import area_counts,task_score,evaluate_areas
from simulation.generate import generate,load_config
ROOT=Path(__file__).resolve().parents[1]
SEEDS=[7071101,7071102,7071103]
SIMULATION_SEED=2026110717
DRAWS=100


def simulations(raw,bounded,domain,seed):
    rng=np.random.default_rng(np.random.SeedSequence([SIMULATION_SEED,seed]));p=-np.expm1(-EPS['od']/CAPS['od'])
    signed=bounded+rng.geometric(p,size=(DRAWS,len(raw)))-rng.geometric(p,size=(DRAWS,len(raw)))
    results={}
    for direction in ('destinations','starts'):
        results[direction]={}
        for band in BANDS:
            areas,r=area_counts(raw,domain,band,direction)
            scores=[task_score(r,area_counts(s,domain,band,direction)[1],areas) for s in signed]
            evaluated=[s for s in scores if s['wape'] is not None]
            results[direction][band]={'evaluated_draws':len(evaluated),'decision_pass_count':sum(s['pass'] for s in scores),
                'median_wape':float(np.median([s['wape'] for s in evaluated])) if evaluated else None,
                'count_target_pass_count':sum(s['wape']<=.2 for s in evaluated),
                'median_regret':float(np.median([s['regret'] for s in evaluated])) if evaluated else None,
                'worst_regret':max((s['regret'] for s in evaluated),default=None),
                'exact_top3_count':sum(s['top3_overlap']==3 for s in evaluated)}
    return results


def main():
    report={'protocol_commit':'fe1f24c','task':'weekday-morning destination-area top-three exploratory shortlist','new_population_seeds':SEEDS,'simulation_seed':SIMULATION_SEED,'draws_per_population':DRAWS,'minimum_passes_per_population':95,'numpy_version':np.__version__,'production_publications':0,'ledger_operations':0,
        'evaluator_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'scoring_sha256':hashlib.sha256((ROOT/'pipeline/planning_task.py').read_bytes()).hexdigest(),
        'limitations':['Three new population seeds under the same synthetic model; not new models or real-city validation.','Destination inference, cap bias and route assignment remain separate limitations.','Original fine-pair utility failures remain unchanged.','Simulation tests the distribution, not the OpenDP runtime.'], 'populations':[]}
    output=ROOT/'evidence/workflow-city/planning-utility.json'
    config=load_config()
    for seed in SEEDS:
        folder=ROOT/f'simulation/private/planning-holdout-{seed}'
        if not folder.exists():generate(folder,seed=seed,cards=config['cards'])
        metadata=json.loads((folder/'metadata.json').read_text())
        if metadata['population_seed']!=seed or metadata['configured_cards']!=20000 or metadata['configuration']!=config:raise ValueError('Holdout identity mismatch')
        domains,raw,bounded,_=prepare_city(folder)
        result={'seed':seed,'input_fingerprint':fingerprint(folder),'scores':simulations(raw['od'],bounded['od'],domains['od'],seed)}
        report['populations'].append(result);output.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
        print(json.dumps({'seed':seed,'morning_destination':result['scores']['destinations']['06-09']}),flush=True)
    folder=ROOT/'simulation/private/workflow-demo-20251106'
    domains,raw,_,_=prepare_city(folder)
    release=ROOT/'releases/city-turku-v1';stats=json.loads((release/'statistics.json').read_text())
    if [(r['origin_area'],r['destination_area'],r['hour_band']) for r in stats['od']]!=domains['od']:raise ValueError('Release domain mismatch')
    report['actual_release']={'release_id':'city-turku-v1','manifest_sha256':hashlib.sha256((release/'manifest.json').read_bytes()).hexdigest(),'scores':evaluate_areas(raw['od'],np.array([r['noisy_value'] for r in stats['od']]),domains['od'])}
    report['primary_pass']=all(p['scores']['destinations']['06-09']['decision_pass_count']>=95 for p in report['populations'])
    output.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
    print('Complete; primary_pass='+str(report['primary_pass']),flush=True)

if __name__=='__main__':main()
