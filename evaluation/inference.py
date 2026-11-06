"""E2: source-preserving upstream parity and a conservative last-leg variant."""
from pathlib import Path
import sys,json,time
import numpy as np
from pipeline.mobility import load,prepare
from pipeline.artifact import encode
ROOT=Path('TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026')
sys.path.insert(0,str(ROOT/'toolkit'))
from pets_eval.utility.mobility import _journeys, _od

def main():
    t,s=load(ROOT/'data/mobility');domains,raw,bounded,geo=prepare(t,s)
    j=_journeys(t,s); counts=j.groupby(['area','dest','hour_band']).size()
    upstream=np.array([int(counts.get(key,0)) for key in domains['od']])
    # Remove last-to-first inferred legs, keeping only next observed retained origin.
    last=j.groupby(['card','day']).tail(1).index
    variant=j.drop(index=last).groupby(['area','dest','hour_band']).size()
    conservative=np.array([int(variant.get(key,0)) for key in domains['od']])
    candidates=[i for i,(a,b,h) in enumerate(domains['od']) if a!=b and h=='06-09']
    top=lambda v: sorted(candidates,key=lambda i:(-int(v[i]),domains['od'][i]))[:3]
    a,b=top(upstream),top(conservative);denom=sum(upstream[i] for i in a)
    report={'experiment':'E2','data_class':'supplied_synthetic','upstream_file':'toolkit/pets_eval/utility/mobility.py::_journeys (unmodified)','production_parity':{'exact_vector_equal':bool(np.array_equal(upstream,raw['od'])),'different_cells':int((upstream!=raw['od']).sum()),'l1_difference':int(np.abs(upstream-raw['od']).sum()),'upstream_journeys':int(upstream.sum()),'production_journeys':int(raw['od'].sum())},'withhold_last_leg':{'retained_journeys':int(conservative.sum()),'withheld_journeys':int(upstream.sum()-conservative.sum()),'morning_top3_overlap':len(set(a)&set(b)),'morning_regret':float((denom-sum(upstream[i] for i in b))/denom),'selected':[domains['od'][i] for i in b]},'limitations':['Agreement of heuristics is not destination accuracy.','Last-to-first closure can create false returns and single-event self-loops.','No final inference policy change; variants remain evaluation-only.']}
    out=Path('evidence/e2');out.mkdir(parents=True,exist_ok=True);(out/'inference.json').write_bytes(encode(report));print(json.dumps(report,indent=2))
if __name__=='__main__':main()
