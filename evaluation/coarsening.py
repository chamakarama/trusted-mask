"""Public municipality postprocessing of the existing E1 release, no new draw/budget."""
from pathlib import Path
from itertools import product
import json
import numpy as np
from pipeline.mobility import load,prepare,BANDS
from pipeline.artifact import encode

def main():
    root=Path('TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data/mobility');t,s=load(root)
    domains,raw,bounded,geo=prepare(t,s);mapping=s.drop_duplicates('area').set_index('area').municipality.to_dict()
    towns=sorted(set(mapping.values()));domain=list(product(towns,towns,BANDS));index={k:i for i,k in enumerate(domain)}
    def group(v):
        out=np.zeros(len(domain))
        for (a,b,h),n in zip(domains['od'],v):out[index[(mapping[a],mapping[b],h)]]+=n
        return out
    rows=json.loads(Path('releases/e1-aura-001/statistics.json').read_text())['od']
    reference=group(raw['od']);signed=group([r['noisy_value'] for r in rows]);display=np.maximum(0,signed)
    candidates=[i for i,(a,b,h) in enumerate(domain) if a!=b and h=='06-09'];rank=lambda v:sorted(candidates,key=lambda i:(-v[i],domain[i]))[:3]
    a,b=rank(reference),rank(display);denom=sum(reference[i] for i in a)
    result={'experiment':'E3 fallback diagnostic','data_class':'supplied_synthetic','release_id':'e1-aura-001','method':'Sum already released signed noisy_value by public municipality then clamp at zero; do NOT sum separately clamped trips. No new measurement.','area_cells':len(rows),'municipality_cells':len(domain),'wape':float(np.abs(display-reference).sum()/reference.sum()),'top3_overlap':len(set(a)&set(b)),'regret':float((denom-sum(reference[i] for i in b))/denom),'limitations':['Different coarser decision domain, not improved area-level fidelity.','No cell interval reuse: sums have different noise distribution.','One existing draw, not a new selected policy.','UI change requires Opus agreement.']}
    p=Path('evidence/e3');p.mkdir(parents=True,exist_ok=True);(p/'municipality-postprocessing.json').write_bytes(encode(result));print(json.dumps(result,indent=2))
if __name__=='__main__':main()
