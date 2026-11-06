"""Curated exact/protected charts from supplied synthetic E1; never a release resource."""
from pathlib import Path
import hashlib,json,subprocess
import numpy as np
from pipeline.mobility import load,prepare,COLUMNS,VALUES
from pipeline.artifact import verify,encode
from evaluation.e1 import compare
ROOT=Path('TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026')
RELEASE=Path('releases/e1-aura-001')

def main():
 digest=verify(RELEASE)
 manifest=json.loads((RELEASE/'manifest.json').read_text())
 assert manifest['data_class']=='supplied_synthetic' and not manifest['fixture']
 domains,raw,bounded,_=prepare(*load(ROOT/'data/mobility'))
 stats=json.loads((RELEASE/'statistics.json').read_text())
 e1=json.loads(Path('evidence/e1/e1.json').read_text())
 stages={}
 for family in raw:
  assert [tuple(r[c] for c in COLUMNS[family]) for r in stats[family]]==domains[family]
  signed=np.array([r['noisy_value'] for r in stats[family]])
  shown=np.array([r[VALUES[family]] for r in stats[family]])
  current={'cap':compare(raw[family],bounded[family]),'noise':compare(bounded[family],signed),'total':compare(raw[family],shown)}
  names={'cap':'R1_to_R2_clipping','noise':'R2_to_R3_noise','total':'R1_to_R4_total'}
  for k,v in current.items():
   for metric in ['reference_total','compared_total','wape','mae']:
    assert np.isclose(v[metric],e1['metrics'][family][names[k]][metric],rtol=1e-12,atol=1e-12),(family,k,metric)
  stages[family]={k:v['wape'] for k,v in current.items()}
 candidates=[i for i,(a,b,band) in enumerate(domains['od']) if a!=b and band=='06-09']
 top=sorted(candidates,key=lambda i:(-raw['od'][i],domains['od'][i]))[:10]
 result={'data_class':'supplied_synthetic','synthetic_evaluation_only':True,'release_id':manifest['release_id'],'release_manifest_sha256':digest,
  'daily':[{'date':d[0],'exact':int(raw['daily'][i]),'protected':int(stats['daily'][i]['tap_events'])} for i,d in enumerate(domains['daily'])],
  'morning_top10':[{'origin_area':domains['od'][i][0],'destination_area':domains['od'][i][1],'exact':int(raw['od'][i]),'protected':int(stats['od'][i]['trips']),'exact_rank':rank} for rank,i in enumerate(top,1)],
  'error_sources':stages,'error_sources_additive':False,
  'error_sources_definitions':{'cap':'WAPE R1 inferred/exact -> R2 bounded, denominator sum(R1)','noise':'WAPE R2 bounded -> R3 signed noisy, denominator sum(R2)','total':'WAPE R1 inferred/exact -> R4 displayed, denominator sum(R1)'},
  'limitations':['Exact references are supplied synthetic evaluation only, not protected release tables or assistant inputs. Never publish equivalent real-data references automatically.','Top ten selected by exact morning count, not by protected count; individual routes may change rank.','Stage WAPEs are separate comparisons with different denominators, not additive error components; do not stack.','No new noise draw or canonical ledger operation.'],
  'command':'python -m evaluation.utility_comparison','source_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'evaluator_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'e1_metrics_reproduced':True}
 Path('evidence/e5/utility-comparison.json').write_bytes(encode(result))
 print(json.dumps({'daily_rows':len(result['daily']),'morning_rows':len(result['morning_top10']),'all_E1_stage_metrics_match':True,'noise_draws':0}))
if __name__=='__main__':main()
