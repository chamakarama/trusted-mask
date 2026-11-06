"""Compact synthetic-only evidence for human review; never a protected release resource."""
from pathlib import Path
import hashlib,json,subprocess
from pipeline.artifact import encode

def main():
    def read(p):return json.loads(Path(p).read_text())
    paths={'e1':'evidence/e1/e1.json','scanner':'evidence/e1s/opus-handoff-review.json','inference':'evidence/e2/inference.json','repeated':'evidence/e3/initial-policy-100.json','search':'evidence/e3/policy-search.json','coarse':'evidence/e3/municipality-postprocessing.json','attack':'evidence/e4/trajectory.json','benchmark':'evidence/e5/benchmark.json','identity':'evidence/identity/multiple-cards.json'}
    data={k:read(p) for k,p in paths.items()}
    e=data['e1'];m=e['metrics']
    result={'schema_version':'1.0','data_class':'supplied_synthetic','synthetic_evaluation_only':True,'release_id':e['release_id'],'release_manifest_sha256':e['artifact_manifest_sha256'],'notice':'Contains exact synthetic reference statistics. Do not automatically publish equivalent real-data evidence. Not a protected release table or an assistant input.','source_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'provenance':{k:{'path':p,'sha256':hashlib.sha256(Path(p).read_bytes()).hexdigest()} for k,p in paths.items()},'cap_loss_fraction':{f:1-v['R1_to_R2_clipping']['compared_total']/v['R1_to_R2_clipping']['reference_total'] for f,v in m.items()},'actual_release_wape':{f:v['R1_to_R4_total']['wape'] for f,v in m.items()},'actual_release_decision':e['decision'],'initial_policy_100_draws':{k:v for k,v in data['repeated'].items() if k in ['draw_count','wape_quantiles','decision_pass_count','od_wape_target_pass_count']},'policy_search_status':data['search']['status'],'municipality_postprocessing':data['coarse'],'upstream_inference_exact_parity':data['inference']['production_parity'],'trajectory_native_four_point':{k:v['native_upstream_p4'] for k,v in data['attack']['results'].items()},'route_safe_attack_applicability':data['attack']['routesafe'],'native_MOB_U1':data['benchmark']['native_MOB_U1'],'adapted_MOB_U2':data['benchmark']['adapted_MOB_U2'],'adapted_MOB_U3':data['benchmark']['adapted_MOB_U3'],'multiple_cards':data['identity'],'limitations':['Initial policy fails area-level OD error target; do not claim full MOB-S1 utility acceptance.','All privacy claims pending cross-review.','Native and adapted toolkit results are distinct.','No universal anonymity, zero-risk, certification, real-world demand, or optimal-route claim.']}
    result['initial_policy_100_draws']['exact_top3_count']=sum(d['top3_overlap']==3 for d in data['repeated']['draws'])
    result['initial_policy_100_draws']['decision_target']='at least 2/3 overlap and demand regret <=10%'
    result['publisher_source_commit']=read('releases/e1-aura-001/manifest.json')['source_commit']
    result['trajectory_fixed_cohort']={k:v['fixed_cohort'] for k,v in data['attack']['results'].items()}
    result['trajectory_curve_context']={k:data['attack'][k] for k in ['cohort','known_point_sampling','limitations','illustrative_original_candidate_counts']}
    Path('evidence/evidence-summary.json').write_bytes(encode(result));print('Wrote synthetic-only evidence summary, separate from releases/')
if __name__=='__main__':main()
