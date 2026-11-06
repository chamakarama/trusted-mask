"""Retrospective rank checks for the existing synthetic artifact; never redraw it."""
from pathlib import Path
import hashlib,json,subprocess
from pipeline.artifact import verify,encode
from pipeline.mobility import BANDS,COLUMNS,load,prepare

ROOT=Path('TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data/mobility')
RELEASE=Path('releases/e1-aura-001')


def main():
    digest=verify(RELEASE)
    manifest=json.loads((RELEASE/'manifest.json').read_text())
    assert manifest['data_class']=='supplied_synthetic' and not manifest['fixture']
    domains,raw,bounded,_=prepare(*load(ROOT))
    rows=json.loads((RELEASE/'statistics.json').read_text())['od']
    keys=domains['od']
    assert [tuple(r[c] for c in COLUMNS['od']) for r in rows]==keys
    shown=[r['trips'] for r in rows]
    e1=json.loads(Path('evidence/e1/e1.json').read_text())
    assert int(sum(raw['od']))==e1['metrics']['od']['R1_to_R2_clipping']['reference_total']
    assert int(sum(bounded['od']))==e1['metrics']['od']['R1_to_R2_clipping']['compared_total']
    results={}
    for band in BANDS:
        candidates=[i for i,(a,b,t) in enumerate(keys) if a!=b and t==band]
        def rank(values,k):return sorted(candidates,key=lambda i:(-int(values[i]),keys[i]))[:k]
        exact3=rank(raw['od'],3); capped3=rank(bounded['od'],3); actual3=rank(shown,3)
        denom=int(sum(raw['od'][i] for i in exact3))
        def check(selected):
            return {'top3_overlap':len(set(exact3)&set(selected)) if denom else None,
                    'regret':float((denom-sum(raw['od'][i] for i in selected))/denom) if denom else None}
        exact10=rank(raw['od'],10); actual10=rank(shown,10)
        def describe(indices,values):return [dict(zip(COLUMNS['od'],keys[i]),count=int(values[i])) for i in indices]
        results[band]={
            'k':3,**check(actual3),
            'top10_overlap':len(set(exact10)&set(actual10)) if denom else None,
            'candidate_cells':len(candidates),'positive_reference_cells':sum(int(raw['od'][i])>0 for i in candidates),
            'exact_top3_total':denom,'reference_nonself_total':int(sum(raw['od'][i] for i in candidates)),
            'cap_only_check':check(capped3),
            'exact_top3':describe(exact3,raw['od']),
            'capped_top3':describe(capped3,bounded['od']),
            'protected_top3':describe(actual3,shown),
            'informative':denom>0,
        }
    morning=results['06-09']
    assert morning['top3_overlap']==e1['decision']['top_k_overlap']
    assert morning['regret']==e1['decision']['regret']
    report={
        'data_class':'supplied_synthetic','synthetic_evaluation_only':True,
        'release_id':manifest['release_id'],'release_manifest_sha256':digest,
        'scope':'Retrospective check of this one existing release, all origins, non-self area pairs, each time band; not repeated-draw confirmation.',
        'reference':'R1 exact inferred journeys, not observed destination truth',
        'tie_break':'Descending count, then public domain key (origin,destination,band).',
        'results':results,'noise_draws':0,'publication_operations':0,
        'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
        'evaluator_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'limitations':['Requested after viewing the released artifact; exploratory, not predeclared confirmation.','No utility guarantee for other releases, real populations or origin filters.','Top-k overlap is null when exact top-three reference volume is zero; ranking zeros is not useful evidence.','Cap-only comparisons isolate the deterministic cap stage, not noise or destination inference accuracy.','Equivalent private-data reference diagnostics must not be published automatically.'],
    }
    Path('evidence/e3/actual-band-checks.json').write_bytes(encode(report))
    print(json.dumps({b:{k:r[k] for k in ['top3_overlap','top10_overlap','regret','positive_reference_cells','informative']} for b,r in results.items()}))

if __name__=='__main__':main()
