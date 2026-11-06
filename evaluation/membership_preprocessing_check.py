"""Check E7's card-local subtraction assumption on the full supplied synthetic input."""
from pathlib import Path
import hashlib,json,subprocess
import numpy as np
from pipeline.mobility import load,prepare,CAPS
from pipeline.artifact import encode

ROOT=Path('TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data/mobility')
def main():
 taps,stops=load(ROOT)
 selected=sorted(taps.card_id.unique(),key=lambda c:hashlib.sha256(('routesafe-e7-v1:'+c).encode()).digest())[:3]
 _,_,full,_=prepare(taps,stops)
 _,_,background,_=prepare(taps[~taps.card_id.isin(selected)].copy(),stops)
 individual=[prepare(taps[taps.card_id==c].copy(),stops)[2] for c in selected]
 result={}
 for family in CAPS:
  summed=sum((v[family] for v in individual),np.zeros_like(full[family]))
  delta=full[family]-background[family]
  assert np.array_equal(delta,summed),family
  assert all(int(v[family].sum())<=CAPS[family] for v in individual)
  result[family]={'coordinates':len(delta),'difference_equals_sum_of_three_individual_vectors':True,'removed_total':int(delta.sum()),'each_card_within_cap':True}
 report={'experiment':'E7 full-data preprocessing locality check','data_class':'supplied_synthetic','git_head_at_run':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'targets':'same three deterministic targets as predeclared E7; identifiers omitted','families':result,'passed':True,'scope':'Exact bounded-vector arithmetic, no noise draw, no publisher ledger operation; empirical check supports but does not replace card-local sensitivity proof.'}
 Path('evidence/e7/preprocessing.json').write_bytes(encode(report));print(json.dumps(report))
if __name__=='__main__':main()
