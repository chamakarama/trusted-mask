"""Synthetic-only evaluation; never imported by the publisher."""
from pathlib import Path
import argparse,html,json,subprocess,time
import numpy as np
from pipeline.mobility import load,prepare,COLUMNS,VALUES
from pipeline.artifact import verify,encode

def compare(ref,other):
    ref=np.asarray(ref,dtype=float); other=np.asarray(other,dtype=float); denom=float(ref.sum())
    return {'reference_total':denom,'compared_total':float(other.sum()),'wape':float(np.abs(other-ref).sum()/denom) if denom else None,'mae':float(np.abs(other-ref).mean())}

def run(input_path,release,out):
    start=time.monotonic(); digest=verify(release); domains,raw,bounded,geo=prepare(*load(input_path))
    stats=json.loads((release/'statistics.json').read_text()); manifest=json.loads((release/'manifest.json').read_text())
    if manifest['fixture'] or manifest['data_class']!='supplied_synthetic': raise ValueError('E1 requires actual supplied synthetic release')
    metrics={}
    for f in raw:
        if [tuple(r[c] for c in COLUMNS[f]) for r in stats[f]]!=domains[f]: raise ValueError('DOMAIN_MISMATCH')
        signed=np.array([r['noisy_value'] for r in stats[f]]); display=np.array([r[VALUES[f]] for r in stats[f]])
        metrics[f]={'R1_to_R2_clipping':compare(raw[f],bounded[f]),'R2_to_R3_noise':compare(bounded[f],signed),'R3_to_R4_clamping':{'added_count':int((display-signed).sum())},'R1_to_R4_total':compare(raw[f],display)}
    candidates=[i for i,(a,b,band) in enumerate(domains['od']) if a!=b and band=='06-09']
    actual=np.array([r['trips'] for r in stats['od']]); baseline=raw['od']
    best=sorted(candidates,key=lambda i:(-baseline[i],domains['od'][i]))[:3]
    selected=sorted(candidates,key=lambda i:(-actual[i],domains['od'][i]))[:3]
    denom=int(sum(baseline[i] for i in best))
    decision={'k':3,'top_k_overlap':len(set(best)&set(selected)),'regret':float((denom-sum(baseline[i] for i in selected))/denom) if denom else None,'candidate_definition':'Ordered non-self area pairs, 06-09 weekdays, whole period; count proxy only.','selected':[dict(zip(COLUMNS['od'],domains['od'][i]),trips=int(actual[i])) for i in selected]}
    result={'experiment':'E1','status':'actual first release, not E3 policy validation','data_class':'supplied_synthetic','release_id':manifest['release_id'],'artifact_manifest_sha256':digest,'source_commit':manifest['source_commit'],'command':'python -m evaluation.e1 --input <mobility> --release <release> --output <evidence>','metrics':metrics,'decision':decision,'draws':1,'seed_policy':'OpenDP secure randomness; no public or fixed noise seed; first draw retained','elapsed_seconds':time.monotonic()-start,'limitations':['No independent cross-review yet.','Single release, no repeated-run acceptance claim.','No real destination truth.','Native benchmark adapter/attack evaluation not completed by E1.']}
    out.mkdir(parents=True,exist_ok=True); (out/'e1.json').write_bytes(encode(result))
    # Diagnostic only, contains protected values, no raw references. Opus owns full explorer.
    rows=sorted(stats['od'],key=lambda r:-r['trips'])[:12]; maximum=max([r['trips'] for r in rows]+[1])
    bars=''.join(f'<text x="8" y="{30+i*35}">{html.escape(r["origin_area"]+" → "+r["destination_area"]+" "+r["hour_band"])}</text><rect x="340" y="{15+i*35}" width="{r["trips"]/maximum*380:.2f}" height="20" fill="#087f8c"/><text x="730" y="{30+i*35}">{r["trips"]}</text>' for i,r in enumerate(rows))
    table=''.join('<tr>'+''.join('<td>'+html.escape(str(r[c]))+'</td>' for c in ['origin_area','destination_area','hour_band','trips'])+'</tr>' for r in rows)
    page=f'<!doctype html><html lang="en"><meta charset="utf-8"><title>RouteSafe E1 protected output</title><style>body{{font:16px system-ui;max-width:960px;margin:32px auto;padding:16px}}td,th{{padding:8px;text-align:left}}svg{{width:100%;height:auto}}</style><h1>RouteSafe: actual protected output</h1><p>Supplied synthetic data · inferred weekday journeys · 6 October–2 November 2025 · precomputed · pending review</p><p>Diagnostic chart, not the final planner. Counts are clamped OpenDP outputs. Intervals unavailable; ranking confidence not established.</p><svg role="img" aria-label="Highest released inferred journey counts" viewBox="0 0 850 450">{bars}</svg><table><caption>Same protected values as downloaded statistics.json</caption><tr><th>Origin</th><th>Destination</th><th>Time band</th><th>Inferred journeys</th></tr>{table}</table><p>Release {html.escape(manifest["release_id"])}. Manifest SHA-256 {digest}</p></html>'
    (out/'protected-output.html').write_text(page)
    print(json.dumps({'evidence':str(out/'e1.json'),'decision':decision,'wape':{f:metrics[f]['R1_to_R4_total']['wape'] for f in metrics}}))
if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('--input',type=Path,required=True);p.add_argument('--release',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();run(a.input,a.release,a.output)
