"""E3: eight predeclared candidates, card-level development split, frozen full-data check."""
from pathlib import Path
from itertools import product
import hashlib,json,time
import numpy as np
import opendp.prelude as dp
from pipeline.mobility import load,prepare,BANDS
from pipeline.artifact import encode

# Frozen before execution. Selection thresholds are team engineering targets only.
MENU=[{'id':f'areas-c{c}-eps{e}','geography':'area','caps':{'od':c,'line_hour':2*c,'daily':2*c},'epsilon':e} for c in [16,32,64] for e in [1.,2.]]+[
 {'id':f'municipalities-c32-eps{e}','geography':'municipality','caps':{'od':32,'line_hour':64,'daily':64},'epsilon':e} for e in [1.,2.]]
SPLIT={'od':.6,'line_hour':.3,'daily':.1}

def coarsen(domains,raw,bounded,stops):
    mapping=stops.drop_duplicates('area').set_index('area').municipality.to_dict();towns=sorted(set(mapping.values()));domain=list(product(towns,towns,BANDS));idx={k:i for i,k in enumerate(domain)}
    def agg(v):
        out=np.zeros(len(domain),dtype=int)
        for (a,b,h),n in zip(domains['od'],v):out[idx[(mapping[a],mapping[b],h)]]+=n
        return out
    return {**domains,'od':domain},{**raw,'od':agg(raw['od'])},{**bounded,'od':agg(bounded['od'])}

def draws(policy,domains,raw,bounded,n):
    dp.enable_features('contrib');m={}
    for f,c in policy['caps'].items():
        eps=policy['epsilon']*SPLIT[f];scale=float(np.nextafter(c/eps,np.inf))
        m[f]=dp.m.make_laplace(dp.vector_domain(dp.atom_domain(T=int)),dp.l1_distance(T=int),scale=scale)
        assert m[f].check(c,eps)
    vectors={f:[int(x) for x in v] for f,v in bounded.items()}
    choices=[i for i,(a,b,h) in enumerate(domains['od']) if a!=b and h=='06-09'];rank=lambda v:sorted(choices,key=lambda i:(-float(v[i]),domains['od'][i]))[:3]
    best=rank(raw['od']);denom=sum(raw['od'][i] for i in best);rows=[]
    for k in range(n):
        values={f:np.maximum(0,m[f](v)) for f,v in vectors.items()};selected=rank(values['od'])
        rows.append({'draw':k+1,'wape':{f:float(np.abs(values[f]-raw[f]).sum()/raw[f].sum()) for f in raw},'overlap':len(set(best)&set(selected)),'regret':float((denom-sum(raw['od'][i] for i in selected))/denom) if denom else None})
    median={f:float(np.median([r['wape'][f] for r in rows])) for f in raw}
    decision=sum(r['overlap']>=2 and r['regret'] is not None and r['regret']<=.1 for r in rows)
    return {'policy':policy,'draws':n,'median_wape':median,'wape_p95':{f:float(np.quantile([r['wape'][f] for r in rows],.95)) for f in raw},'decision_pass_count':decision,'meets_targets':median['od']<=.2 and median['line_hour']<=.15 and median['daily']<=.1 and decision>=.9*n,'per_draw':rows}

def main():
    out=Path('evidence/e3');out.mkdir(parents=True,exist_ok=True)
    specification={'menu':MENU,'selection':'First candidate meeting all targets sorted by epsilon, prefer area geography, then lower OD cap; no candidate if none passes.','split':'First hex byte of SHA256(routesafe-dev-v1 + card_id) <128; complete cards, ~50% population.','thresholds':{'median_wape':{'od':.2,'line_hour':.15,'daily':.1},'decision_at_least_90_percent':'top3 overlap>=2 and regret<=.1'},'development_draws':20,'confirmation_draws':100,'postprocessing':'nonnegative clamp','seed_policy':'OpenDP secure draws; no selected publication; synthetic benchmark only'}
    # Persist menu before touching private record values or drawing mechanism samples.
    (out/'policy-search-spec.json').write_bytes(encode(specification))
    t,s=load(Path('TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data/mobility'))
    cards={c:hashlib.sha256(('routesafe-dev-v1'+c).encode()).digest()[0]<128 for c in t.card_id.unique()};dev=t[t.card_id.map(cards)].copy()
    cache={};runs=[]
    for policy in MENU:
        cap=policy['caps']['od']
        if cap not in cache:cache[cap]=prepare(dev,s,evaluation_caps=policy['caps'])[:3]
        domains,raw,bounded=cache[cap]
        if policy['geography']=='municipality':domains,raw,bounded=coarsen(domains,raw,bounded,s)
        result=draws(policy,domains,raw,bounded,20);runs.append(result)
        print(policy['id'],result['median_wape'],'pass',result['meets_targets'],flush=True)
    eligible=sorted([r for r in runs if r['meets_targets']],key=lambda r:(r['policy']['epsilon'],r['policy']['geography']!='area',r['policy']['caps']['od']))
    confirmation=None
    if eligible:
        chosen=eligible[0]['policy'];domains,raw,bounded,_=prepare(t,s,evaluation_caps=chosen['caps'])
        if chosen['geography']=='municipality':domains,raw,bounded=coarsen(domains,raw,bounded,s)
        confirmation=draws(chosen,domains,raw,bounded,100)
    result={'experiment':'E3 policy search','specification':specification,'data_class':'supplied_synthetic','development_cards':sum(cards.values()),'all_cards':len(cards),'development_rows':len(dev),'runs':runs,'confirmation':confirmation,'status':'candidate requires cross-review; existing E1 publication unchanged' if confirmation else 'no candidate passes all targets; use scoped fallback, no hidden retuning','limitations':['Development uses half the cards and therefore lower density.','Full supplied data already inspected in E1; confirmation is a benchmark, not a blind real-world test.','Municipality domain sacrifices area resolution; do not assign original area-level MOB-U1 score.','No epsilon increase or new production release without explicit coordination/review.']}
    (out/'policy-search.json').write_bytes(encode(result));print(json.dumps({'status':result['status'],'selected':confirmation['policy'] if confirmation else None,'confirmation':{k:v for k,v in confirmation.items() if k!='per_draw'} if confirmation else None},indent=2))
if __name__=='__main__':main()
