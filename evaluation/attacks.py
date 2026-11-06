"""E4 synthetic trajectory experiment. No raw points/identifiers in shared evidence."""
from pathlib import Path
import json,sys,math
import numpy as np
import pandas as pd
from pipeline.artifact import encode
ROOT=Path('TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026')
sys.path[:0]=[str(ROOT/'toolkit'),str(ROOT/'baselines')]
from pets_eval import io,parse
from pets_eval.privacy import trajectory_unicity
from _common import protect_table,catalog_for

def point_index(df,source_cards):
    ts=parse.to_datetime(df.ts).dt.floor('h');place=df.stop_id.astype(str)
    ok=ts.notna() & df.stop_id.notna() & ~place.str.strip().isin(['','nan','None','<NA>'])
    pts=pd.DataFrame({'u':source_cards.loc[ok].astype(str),'pt':place.loc[ok]+'|'+ts.loc[ok].astype(str)}).drop_duplicates()
    return pts.groupby('u').pt.apply(list).to_dict(),pts.groupby('pt').u.apply(frozenset).to_dict()

def wilson(success,n):
    if not n:return None
    z=1.96;p=success/n;centre=(p+z*z/(2*n))/(1+z*z/n);half=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n)
    return [centre-half,centre+half]

def main():
    t=io.read_table(ROOT/'data/mobility/taps.csv');cat=catalog_for('mobility')
    raw,inv=point_index(t,t.card_id);eligible=sorted(k for k,v in raw.items() if len(v)>=4)
    cohort=list(np.random.default_rng(20261106).choice(eligible,min(1000,len(eligible)),replace=False))
    results={};scene=None
    for level in ['original','b0','b2','b2k']:
        df=t if level=='original' else protect_table('mobility','taps',t,cat,level)
        by_user,index=point_index(df,t.card_id)
        curves=[]
        for k in [2,3,4]:
            rng=np.random.default_rng(20261106+k);counts=[];unavailable=0
            for card in cohort:
                points=by_user.get(card,[])
                if len(points)<k:unavailable+=1;continue
                chosen=[points[i] for i in rng.choice(len(points),k,replace=False)];candidates=None;steps=[]
                for point in chosen:
                    candidates=index[point] if candidates is None else candidates&index[point];steps.append(len(candidates))
                counts.append(len(candidates))
                if level=='original' and k==4 and len(candidates)==1 and scene is None:
                    scene={'data_class':'supplied_synthetic','private_only':True,'card_id':card,'known_points':chosen,'candidate_counts':steps}
            isolated=sum(n==1 for n in counts);n=len(counts)
            curves.append({'known_points':k,'fixed_cohort_size':len(cohort),'tested':n,'unavailable':unavailable,'isolated':isolated,'unicity':isolated/n if n else None,'wilson_95':wilson(isolated,n),'median_candidates':float(np.median(counts)) if n else None})
        native=trajectory_unicity(df,'card_id','ts',place_col='stop_id',p=4,n_users=1000,seed=0)
        results[level]={'fixed_cohort':curves,'native_upstream_p4':native}
        print(level,'completed',flush=True)
    supplied={}
    for level in ['b0','b2','b2k']:
        rep=json.loads((ROOT/f'results/{level}/mobility/scorecard.json').read_text())
        # Copy only aggregate unicity evidence, not whole scorecards or rowmaps.
        def find(x):
            found=[]
            if isinstance(x,dict):
                if 'trajectory_unicity' in x:found.append(x['trajectory_unicity'])
                for v in x.values():found+=find(v)
            elif isinstance(x,list):
                for v in x:found+=find(v)
            return found
        supplied[level]=find(rep)
    report={'experiment':'E4','data_class':'supplied_synthetic','cohort':'1000 cards sampled without replacement from sorted original cards with >=4 distinct nonmissing stop/hour points; seed 20261106. Same source-card cohort for all baselines, mapping kept private.','known_point_sampling':'Each representation own surviving trace, k points without replacement, seeds 20261106+k; not an attack with identically observed raw points across coarsenings.','native_reproduction':'Unmodified pets_eval.privacy.trajectory_unicity, p=4,n_users=1000,seed=0; native cohorts may differ after pseudonym/suppression.','results':results,'supplied_preexisting_results':supplied,'illustrative_original_candidate_counts':scene['candidate_counts'] if scene else None,'routesafe':{'evaluated':False,'status':'not_applicable','reason':'No card-linked row trajectories are released; lookup attack cannot run on aggregate tables. This is not 0% re-identification.'},'limitations':['Singling out a card trace is not learning a person name.','Wilson intervals describe binomial sampling approximation, not privacy guarantee.','B2-k unavailable cards are explicitly excluded from conditional denominator, never counted safe.','Baselines use supplied field labels for evaluation only; production does not.']}
    out=Path('evidence/e4');out.mkdir(parents=True,exist_ok=True);(out/'trajectory.json').write_bytes(encode(report))
    if scene:
        p=Path('private/attack-scene.json');p.parent.mkdir(exist_ok=True);p.write_bytes(encode(scene))
    print(json.dumps({'native':{k:v['native_upstream_p4'] for k,v in results.items()},'illustrative_counts':report['illustrative_original_candidate_counts']},indent=2))
if __name__=='__main__':main()
