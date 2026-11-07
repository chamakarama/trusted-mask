"""Synthetic utility simulation; never creates a release or accesses a privacy ledger.

Uses independent seeded differences of geometric draws for the discrete Laplace
law. This is a reproducible distribution simulation, not OpenDP runtime validation
or additional production releases. All predeclared population seeds are retained.
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from pipeline.city import prepare_city, fingerprint
from pipeline.mobility import BANDS, CAPS, EPS
from privacy.uncertainty import noise_radius
from simulation.generate import generate, load_config

ROOT=Path(__file__).resolve().parents[1]
DRAWS=100
SIMULATION_SEED=2026110701  # Declared before executing this simulation.


def score(raw, signed, domain, indices):
    denom=float(raw[indices].sum())
    if not denom: return {'wape':None,'top3_overlap':None,'regret':None}
    best=sorted(indices,key=lambda i:(-int(raw[i]),domain[i]))[:3]
    chosen=sorted(indices,key=lambda i:(-max(0,int(signed[i])),domain[i]))[:3]
    best_value=sum(int(raw[i]) for i in best)
    return {'wape':float(np.abs(np.maximum(0,signed[indices])-raw[indices]).sum()/denom),
            'top3_overlap':len(set(best)&set(chosen)),
            'regret':float(1-sum(int(raw[i]) for i in chosen)/best_value) if best_value else None}


def simulate(raw,bounded,domain,seed):
    rng=np.random.default_rng(np.random.SeedSequence([SIMULATION_SEED,seed]))
    scale=CAPS['od']/EPS['od'];p=-np.expm1(-1/scale)
    noise=rng.geometric(p,size=(DRAWS,len(raw)))-rng.geometric(p,size=(DRAWS,len(raw)))
    signed=bounded+noise
    radius=noise_radius(scale,.05/len(raw))
    bands={}
    for band in BANDS:
        ids=np.array([i for i,(a,b,t) in enumerate(domain) if t==band and a!=b])
        scores=[score(raw,s,domain,ids) for s in signed]
        wapes=[x['wape'] for x in scores if x['wape'] is not None]
        regrets=[x['regret'] for x in scores if x['regret'] is not None]
        bands[band]={'nonself_raw_trips':int(raw[ids].sum()),'median_wape':float(np.median(wapes)) if wapes else None,
                     'wape_95th_percentile':float(np.quantile(wapes,.95)) if wapes else None,
                     'top3_exact_count':sum(x['top3_overlap']==3 for x in scores) if wapes else None,
                     'decision_pass_count':sum(x['top3_overlap']>=2 and x['regret']<=.1 for x in scores) if regrets else None,
                     'median_regret':float(np.median(regrets)) if regrets else None,
                     'mean_top3_uncertain_count':float(np.mean([sum(s[i]<=radius for i in sorted(ids,key=lambda i:(-max(0,int(s[i])),domain[i]))[:3]) for s in signed]))}
    overall=np.abs(np.maximum(0,signed)-raw).sum(axis=1)/raw.sum()
    return {'draws':DRAWS,'od_wape_median':float(np.median(overall)),'od_wape_95th_percentile':float(np.quantile(overall,.95)),
            'od_wape_target_pass_count':int(np.sum(overall<=.2)),'od_cap_loss':float(1-bounded.sum()/raw.sum()),
            'simultaneous_cell_radius':radius,'bands':bands}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--demo-input',type=Path,required=True);parser.add_argument('--report',type=Path,required=True);args=parser.parse_args()
    config=load_config();seeds=[config['demo_seed'],*config['evaluation_seeds']]
    report={'scope':'OD-family synthetic utility only; no real-city validation, other-family evaluation or production privacy release',
            'simulator':'difference of independent geometric variates; discrete Laplace law',
            'simulation_seed':SIMULATION_SEED,'numpy_version':np.__version__,'draws_per_population':DRAWS,'production_release_draws':0,'ledger_operations':0,
            'configuration_sha256':hashlib.sha256((ROOT/'simulation/config/turku-grid-v1.json').read_bytes()).hexdigest(),
            'evaluator_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'targets':{'od_wape_max':.2,'decision_min_top3_overlap':2,'decision_max_regret':.1},
            'limitations':['Simulation assesses noise and cap effects on inferred journeys, not destination truth.','Separate generator evidence reports multi-card destination inference errors.','Night has no true demand in this constructed scenario; undefined relative error is null.','No seed or failed time band is excluded.','mean_top3_uncertain_count counts selected cells whose bounded-count noise interval includes zero; it is not ranking confidence.'], 'populations':[]}
    for seed in seeds:
        folder=args.demo_input if seed==config['demo_seed'] else ROOT/f'simulation/private/workflow-confirmation-{seed}'
        if not folder.exists():generate(folder,seed=seed,cards=config['cards'])
        metadata=json.loads((folder/'metadata.json').read_text())
        if metadata['population_seed']!=seed or metadata['configured_cards']!=config['cards'] or metadata['configuration']!=config: raise ValueError('Population identity mismatch')
        dom,raw,bounded,_=prepare_city(folder)
        result={'population_seed':seed,'input_fingerprint':fingerprint(folder),**simulate(raw['od'],bounded['od'],dom['od'],seed)}
        report['populations'].append(result)
        args.report.parent.mkdir(parents=True,exist_ok=True)
        args.report.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
        print(json.dumps({'seed':seed,'median_od_wape':result['od_wape_median'],'target_passes':result['od_wape_target_pass_count']}),flush=True)
    print('Complete: all six declared populations retained.',flush=True)

if __name__=='__main__':main()
