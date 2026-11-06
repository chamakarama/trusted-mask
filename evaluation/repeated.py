"""Initial-policy diagnostic on synthetic data; not policy selection or new publication."""
import json
from pathlib import Path
import numpy as np
from pipeline.mobility import load,prepare,CAPS,EPS
from pipeline.artifact import encode
from privacy.mechanism import measurement

def main():
    root=Path('TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026')
    domains,raw,bounded,geo=prepare(*load(root/'data/mobility'))
    mechanisms={f:measurement(f) for f in CAPS}; inputs={f:[int(x) for x in bounded[f]] for f in CAPS}
    candidates=[i for i,(a,b,h) in enumerate(domains['od']) if a!=b and h=='06-09']
    top=lambda v: sorted(candidates,key=lambda i:(-float(v[i]),domains['od'][i]))[:3]
    reference=top(raw['od']);denom=sum(raw['od'][i] for i in reference)
    draws=[]
    for i in range(100):
        protected={f:np.maximum(0,mechanisms[f](inputs[f])) for f in CAPS}
        selected=top(protected['od']); regret=float((denom-sum(raw['od'][i] for i in selected))/denom)
        draws.append({'draw':i+1,'wape':{f:float(np.abs(protected[f]-raw[f]).sum()/raw[f].sum()) for f in CAPS},'top3_overlap':len(set(reference)&set(selected)),'regret':regret})
    result={'experiment':'E3 initial policy diagnostic','status':'not a policy search or final acceptance; policy unchanged','data_class':'supplied_synthetic','policy':'e1-experimental-32-64-64-epsilon1-v1','draw_count':100,'seed_policy':'100 fresh OpenDP mechanism draws; no chosen lucky release; E1 artifact unchanged','scope':'full supplied dataset; no development/validation search performed','privacy_context':'Evaluation on entirely synthetic records; these draws are not an unaccounted real-data release workflow.','wape_quantiles':{f:{str(q):float(np.quantile([d['wape'][f] for d in draws],q)) for q in [0.05,0.5,0.95]} for f in CAPS},'decision_pass_count':sum(d['top3_overlap']>=2 and d['regret']<=.1 for d in draws),'od_wape_target_pass_count':sum(d['wape']['od']<=.2 for d in draws),'draws':draws,'limitations':['Policy not ratified by Opus.','No independent real-world generalization claim.','Utility targets are engineering targets, not official scoring.']}
    p=Path('evidence/e3');p.mkdir(parents=True,exist_ok=True);(p/'initial-policy-100.json').write_bytes(encode(result));print(json.dumps({k:v for k,v in result.items() if k!='draws'},indent=2))
if __name__=='__main__':main()
