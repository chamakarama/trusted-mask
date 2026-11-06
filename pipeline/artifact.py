"""Strict aggregate boundary shared by CLI, fixture, and consumer tests."""
from __future__ import annotations
import csv,hashlib,io,json,re
from datetime import datetime,timezone
from pathlib import Path
import jsonschema
from pipeline.mobility import CAPS,EPS,COLUMNS,VALUES,BANDS,DATES

SCHEMA=Path(__file__).resolve().parents[1]/'contracts/manifest.schema.json'
PAYLOADS={'definitions.json','public_areas.geojson','od_matrix.csv','line_hour.csv','daily.csv','statistics.json','README.txt'}
CSVS={'od':'od_matrix.csv','line_hour':'line_hour.csv','daily':'daily.csv'}
ROW_EXTRA=['noisy_value','noise_lower','noise_upper','evidence_status']

def encode(obj): return (json.dumps(obj,ensure_ascii=False,sort_keys=True,indent=2,allow_nan=False)+'\n').encode()
def sha(b): return hashlib.sha256(b).hexdigest()

def build(release_id,source_commit,domains,noisy,geometry,fixture=False):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}',release_id): raise ValueError('INVALID_RELEASE_ID')
    stats={}; payload={}
    for f,domain in domains.items():
        if len(domain)!=len(noisy[f]): raise ValueError('DOMAIN_MISMATCH')
        stats[f]=[]
        for coords,n in zip(domain,noisy[f]):
            row=dict(zip(COLUMNS[f],coords)); row.update({VALUES[f]:max(0,int(n)),'noisy_value':int(n),'noise_lower':None,'noise_upper':None,'evidence_status':'uncertain'})
            stats[f].append(row)
        stream=io.StringIO(newline=''); w=csv.DictWriter(stream,fieldnames=COLUMNS[f]+[VALUES[f]]+ROW_EXTRA,lineterminator='\n'); w.writeheader(); w.writerows(stats[f]); payload[CSVS[f]]=stream.getvalue().encode()
    definitions={
        'od':'Weekday inferred journeys; next retained origin is destination; last closes to first. Whole period, not passengers.',
        'line_hour':'Weekday boardings excluding marked double taps, whole period.',
        'daily':'Recorded tap events including marked double taps, each calendar date.',
        'uncertainty':'Intervals unavailable in E1; null is not zero. All cells uncertain. No ranking-confidence claim.',
        'geometry':'Schematic area points: unweighted centroids of public synthetic stops; no road paths.',
        'boundary':'Only protected aggregates/public reference geometry. Filtering never draws noise.'}
    payload['statistics.json']=encode(stats); payload['definitions.json']=encode(definitions); payload['public_areas.geojson']=encode(geometry)
    payload['README.txt']=b'RouteSafe E1 experimental release. Synthetic data. Pending independent review. Read manifest and definitions. No person-level anonymity or destination-truth claim.\n'
    families={f:{'availability':'released','definition_id':f+'-v1','dimensions':COLUMNS[f],'resource':CSVS[f],'uncertainty':'not_available_in_e1'} for f in CAPS}
    parameters={f:{'cap':CAPS[f],'epsilon':EPS[f],'delta':0,'selection':'card-local SHA256 rank over canonical final count units v1','input_metric':'L1 integer vector','input_distance':CAPS[f],'mechanism':'OpenDP integer vector Laplace','library_version':'0.16.0','scale':CAPS[f]/EPS[f]} for f in CAPS}
    manifest={
        'schema_version':'1.0','release_id':release_id,'created_at':datetime.now(timezone.utc).isoformat(),'data_class':'team_synthetic' if fixture else 'supplied_synthetic','fixture':fixture,
        'period':{'start_date':DATES[0],'end_date_inclusive':DATES[-1],'timezone':'Europe/Helsinki','timestamp_ambiguity_policy':'Naive local wall clock as supplied; repeated DST hour not resolved. Weekday OD excludes the Sunday transition.'},
        'publisher':'Fictional Aura Transit; TrustED PETs Proving Ground 2026, synthetic data by Since AI ry',
        'purpose':'External transport planning research: morning corridor shortlist, line/hour demand, daily taps; no capacity or optimal-route claim.',
        'policy_version':'e1-experimental-32-64-64-epsilon1-v1','source_commit':source_commit,
        'privacy':{'unit':'card','scope':'whole_release_period','adjacency':'add_remove_one_card','epsilon_release':1.0,'delta_release':0,'guarantee_status':'not_claimed' if fixture else 'pending_review','families':parameters,'multiple_identifier_limitation':'One person can have multiple cards; no fixed person-level guarantee.','accounting':'Single private publisher ledger; reserved draws count as spent; changing ledger is not a budget reset.'},
        'families':families,'public_domain_version':'fictional-two-area-v1' if fixture else 'supplied-public-stops-calendar-v1',
        'inference':'Card/day stable time order; remove double taps and weekends; retain >60 minute gaps from previous boarding; close last to first. Tied distinct events canonically ordered by stop/line.',
        'postprocessing':'Integer noisy estimates clamped at zero for display; signed noisy_value retained. No reconciliation.',
        'resources':[{'path':p,'media_type':'text/csv' if p.endswith('.csv') else 'application/geo+json' if p.endswith('.geojson') else 'text/plain' if p.endswith('.txt') else 'application/json','sha256':sha(b)} for p,b in sorted(payload.items())],
        'limitations':['Synthetic benchmark, not real transport findings.','Heuristic destinations are not observed.','E1 parameters are experimental, not final policy.','Mechanism intervals and ranking uncertainty not yet evaluated.','Clipping and clamping introduce bias.','All privacy claims require cross-review; fixture numbers are invented.' if fixture else 'OpenDP noise map does not prove custom preprocessing.'],
        'licenses':['TrustED PETs Proving Ground 2026 data/docs: CC BY 4.0, Since AI ry.','Public synthetic stops use upstream geography attribution; see supplied NOTICE.md.','OpenDP: MIT; upstream toolkit: MIT.']}
    jsonschema.validate(manifest,json.loads(SCHEMA.read_text()))
    payload['manifest.json']=encode(manifest)
    payload['checksums.sha256']=''.join(f'{sha(b)}  {p}\n' for p,b in sorted(payload.items())).encode()
    return payload

def write(path,payload):
    path.mkdir(parents=True,exist_ok=False)
    for p,b in payload.items(): (path/p).write_bytes(b)

def verify(path):
    expected=PAYLOADS|{'manifest.json','checksums.sha256'}
    if {p.name for p in path.iterdir()}!=expected or any(p.is_symlink() or not p.is_file() for p in path.iterdir()): raise ValueError('ARTIFACT_INVALID: file allowlist')
    manifest=json.loads((path/'manifest.json').read_text()); jsonschema.validate(manifest,json.loads(SCHEMA.read_text()))
    resources=manifest['resources']
    if len(resources)!=len(PAYLOADS) or {r['path'] for r in resources}!=PAYLOADS: raise ValueError('ARTIFACT_INVALID: resources')
    for r in resources:
        if sha((path/r['path']).read_bytes())!=r['sha256']: raise ValueError('ARTIFACT_INVALID: hash')
    checks=''.join(f'{sha((path/p).read_bytes())}  {p}\n' for p in sorted(expected-{'checksums.sha256'}))
    if (path/'checksums.sha256').read_text()!=checks: raise ValueError('ARTIFACT_INVALID: checksums')
    stats=json.loads((path/'statistics.json').read_text())
    if set(stats)!=set(CAPS): raise ValueError('ARTIFACT_INVALID: families')
    geo=json.loads((path/'public_areas.geojson').read_text())
    if set(geo)!={'type','features'} or geo['type']!='FeatureCollection': raise ValueError('ARTIFACT_INVALID: geometry')
    areas=[]
    for feature in geo['features']:
        if set(feature)!={'type','properties','geometry'} or set(feature['properties'])!={'area_id','name','municipality','source'}: raise ValueError('ARTIFACT_INVALID: geometry fields')
        if set(feature['geometry'])!={'type','coordinates'} or feature['geometry']['type']!='Point': raise ValueError('ARTIFACT_INVALID: geometry type')
        lon,lat=feature['geometry']['coordinates']
        if not (-180<=lon<=180 and -90<=lat<=90): raise ValueError('ARTIFACT_INVALID: coordinates')
        areas.append(feature['properties']['area_id'])
    if len(areas)!=len(set(areas)): raise ValueError('ARTIFACT_INVALID: duplicate area')
    for f,rows in stats.items():
        seen=set()
        for row in rows:
            if set(row)!=set(COLUMNS[f]+[VALUES[f]]+ROW_EXTRA): raise ValueError('ARTIFACT_INVALID: columns')
            key=tuple(row[c] for c in COLUMNS[f])
            if key in seen: raise ValueError('ARTIFACT_INVALID: duplicate cell')
            seen.add(key)
            if type(row['noisy_value']) is not int or type(row[VALUES[f]]) is not int or row[VALUES[f]]!=max(0,row['noisy_value']): raise ValueError('ARTIFACT_INVALID: counts')
            if row['noise_lower'] is not None or row['noise_upper'] is not None or row['evidence_status']!='uncertain': raise ValueError('ARTIFACT_INVALID: unsupported uncertainty')
            if f=='od' and (key[0] not in areas or key[1] not in areas or key[2] not in BANDS): raise ValueError('DOMAIN_MISMATCH')
            if f=='line_hour' and (type(key[1]) is not int or not 0<=key[1]<24): raise ValueError('DOMAIN_MISMATCH')
            if f=='daily' and key[0] not in DATES: raise ValueError('DOMAIN_MISMATCH')
        if f=='od' and len(rows)!=len(areas)**2*len(BANDS): raise ValueError('DOMAIN_MISMATCH')
        if f=='daily' and len(rows)!=len(DATES): raise ValueError('DOMAIN_MISMATCH')
        if f=='line_hour' and len(rows)!=len({r['line'] for r in rows})*24: raise ValueError('DOMAIN_MISMATCH')
        with (path/CSVS[f]).open(newline='') as fp: csvrows=list(csv.DictReader(fp))
        expected_rows=[{k:'' if v is None else str(v) for k,v in row.items()} for row in rows]
        if csvrows!=expected_rows: raise ValueError('ARTIFACT_INVALID: CSV JSON disagreement')
    return sha((path/'manifest.json').read_bytes())
