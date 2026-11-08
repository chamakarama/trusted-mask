"""Fixed-weight task-input ablation. Synthetic diagnostics; no model training."""
import argparse
from collections import Counter, defaultdict
import gc
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
import torch
from mask.ml.privacy_v1.bundle import load_model
from mask.ml.privacy_v1.contracts import DIRECT
from mask.ml.privacy_v1.data import resolve_record, validate_records
from mask.ml.privacy_v1.annotation.tools import compile_records
from mask.ml.privacy_v1.engine import Protector

CONDITIONS = ('explicit', 'vague', 'empty_engine_task', 'ui_first_line', 'web_message_only')
MODELS = ('deberta-v3-base', 'encoder-b', 'custom-a')
COUNT_KEYS = ('records', 'unsupported', 'direct_targets', 'direct_protected',
              'section_targets', 'sections_removed', 'facts', 'facts_retained',
              'keep_characters_changed', 'drop_edits', 'placeholder_edits', 'alias_edits')


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def task_input(record, condition):
    return {'explicit': record['task'], 'vague': 'Help me with this information.',
            'empty_engine_task': '', 'ui_first_line': record['text'].split('\n')[0].strip(),
            'web_message_only': record['text']}[condition]


def covered_text(text, start, end, intervals):
    return all(c.isspace() or any(a <= i < b for a,b in intervals)
               for i,c in enumerate(text[start:end], start))


def measure(record, result):
    text = record['text']
    edits = result.edits
    protected = result.protected_text
    valid = protected is not None
    intervals = [(e.start,e.end) for e in edits]
    drop_intervals = [(e.start,e.end) for e in edits if e.action == 'DROP']
    direct = [s for s in record['spans'] if s['label'] in DIRECT and s['action'] != 'KEEP']
    drops = [s for s in record['spans'] if s['action'] == 'DROP']
    facts = [text[f['start']:f['end']] if isinstance(f,dict) else f for f in record['required_facts']]
    keep = {i for s in record['spans'] if s['action']=='KEEP' for i in range(s['start'],s['end'])}
    changed = {i for e in edits for i in range(e.start,e.end)}
    return dict(records=1, unsupported=int(not valid), direct_targets=len(direct),
                direct_protected=sum(valid and covered_text(text,s['start'],s['end'],intervals) for s in direct),
                section_targets=len(drops), sections_removed=sum(valid and covered_text(text,s['start'],s['end'],drop_intervals) for s in drops),
                facts=len(facts), facts_retained=sum(q in (protected or '') for q in facts),
                keep_characters_changed=len(keep & changed),
                drop_edits=sum(e.action=='DROP' for e in edits),
                placeholder_edits=sum(e.action=='PLACEHOLDER' for e in edits),
                alias_edits=sum(e.action=='ALIAS' for e in edits))


def load_cohorts():
    paths = {
        'dev': ROOT/'mask/ml/privacy_v1/data/training-2026-11-07/dev.jsonl',
        'train_for_gallery': ROOT/'mask/ml/privacy_v1/data/training-2026-11-07/train.jsonl',
        'gallery_ids': ROOT/'demo/web-examples.json',
        'fresh': ROOT/'evidence/privacy-v1/training-2026-11-07/fresh-long-messages.json',
        'documentation_pair': ROOT/'mask/ml/privacy_v1/annotation/example.section-pair.authoring.json'}
    lines = lambda p: [json.loads(x) for x in p.read_text().splitlines() if x.strip()]
    ids = {x['training_record_id'] for x in json.loads(paths['gallery_ids'].read_text())['examples']}
    # Pending documentation fixtures may be compiled only for this explicit diagnostic.
    pair = validate_records([resolve_record(x) for x in json.loads(paths['documentation_pair'].read_text())])
    cohorts = {'dev': lines(paths['dev']), 'gallery': [r for r in lines(paths['train_for_gallery']) if r['id'] in ids],
               'fresh': json.loads(paths['fresh'].read_text()),
               'documentation_pair': compile_records(pair, allow_unreviewed=True)}
    assert {k:len(v) for k,v in cohorts.items()} == {'dev':50,'gallery':6,'fresh':6,'documentation_pair':2}
    return cohorts, paths


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--models', nargs='+', choices=MODELS, default=list(MODELS))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    torch.set_num_threads(4)
    cohorts, paths = load_cohorts()
    for r in [r for rows in cohorts.values() for r in rows]:
        assert r['task'].strip()
    metadata = {'source_commit': subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
                'script_sha256': digest(__file__), 'source_hashes': {str(p.relative_to(ROOT)):digest(p) for p in paths.values()},
                'conditions': list(CONDITIONS), 'section_mode':'legacy','device':'cpu','torch_threads':4,
                'models':{}, 'limitations':[
                    'Same source and gold intent held constant; conditions vary only information supplied as task context.',
                    'Vague/empty conditions cannot be expected to recover an undisclosed intended task.',
                    'UI first-line task and backend whole-message fallback are distinct from an actually empty engine task.',
                    'Dev was used for checkpoint selection; gallery is training data; fresh cases are prior diagnostics.',
                    'Documentation pair was authored after training but is pending model review, not an independent final test.',
                    'Some source texts already state a task, so removing the separate task does not remove all intent clues.',
                    'Metrics assess draft text edits and exact quote retention, not downstream AI answer quality or inference attacks.',
                    'No threshold tuning, weight updates, external model calls or UI changes.']}
    all_summaries = []
    for name in args.models:
        model_path = ROOT/'mask/ml/privacy_v1/artifacts/reviewed-2026-11-07'/name
        model = load_model(model_path,device='cpu')
        metadata['models'][name]={'manifest_sha256':digest(model_path/'manifest.json')}
        protector=Protector(model)
        model_rows=[]
        for cohort, records in cohorts.items():
            start=time.perf_counter()
            rows=[]
            for i,record in enumerate(records):
                outputs={}
                for condition in CONDITIONS:
                    task=task_input(record,condition)
                    result=protector.protect_text(record['text'],task)
                    row={'id':record['id'],'family_id':record['family_id'],'cohort':cohort,'condition':condition,
                         'source_task':record['task'],'supplied_task':task,'text':record['text'],
                         'metrics':measure(record,result),'result':result.as_dict()}
                    outputs[condition]=row
                explicit=outputs['explicit']['result']['protected_text']
                for row in outputs.values():
                    row['source_output_matches_explicit']=row['result']['protected_text']==explicit
                    rows.append(row)
                if (i+1)%10==0:print(name,cohort,i+1,flush=True)
            summaries=[]
            for condition in CONDITIONS:
                subset=[r for r in rows if r['condition']==condition]
                total={k:sum(r['metrics'][k] for r in subset) for k in COUNT_KEYS}
                total.update(model=name,cohort=cohort,condition=condition,
                             source_outputs_different_from_explicit=sum(not r['source_output_matches_explicit'] for r in subset))
                summaries.append(total)
                print(json.dumps(total),flush=True)
            report={'summaries':summaries,'elapsed_seconds':round(time.perf_counter()-start,3),'records':rows}
            (args.output/(name+'-'+cohort+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
            model_rows+=rows;all_summaries+=summaries
        # Same-source task pairs: compare edits, not protected task text.
        groups=defaultdict(list)
        for row in model_rows:
            if row['condition']=='explicit':groups[(row['cohort'],row['text'])].append(row)
        pair_results=[]
        for (cohort,text),rows in groups.items():
            if len(rows)>1 and len({r['source_task'] for r in rows})>1:
                pair_results.append({'cohort':cohort,'record_ids':[r['id'] for r in rows],
                                     'different_source_outputs':len({r['result']['protected_text'] for r in rows})>1})
        (args.output/(name+'-task-pairs.json')).write_text(json.dumps(pair_results,indent=2)+'\n')
        del protector,model;gc.collect()
    (args.output/'summary.json').write_text(json.dumps(all_summaries,indent=2)+'\n')
    (args.output/'provenance.json').write_text(json.dumps(metadata,indent=2)+'\n')


if __name__=='__main__':main()
