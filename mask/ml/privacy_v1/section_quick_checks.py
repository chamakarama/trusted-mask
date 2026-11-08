"""Fresh long messages, identity/restoration checks and real adapter round trips."""
import argparse
import json
import re
from pathlib import Path
import torch
from .bundle import load_model
from .engine import Protector
from .section_evaluation import covered
from .inspect_campaign import cells
from .tables import protect_table
from .data import digest
from mask.web.server import _person_map,ModelService
from mask.web.restore import restore_text


def check_fresh(model,examples):
    engine=Protector(model);service=ModelService(engine);outputs=[]
    for example in examples:
        text,task=example['text'],example['task']
        result=engine.protect_text(text,task)
        missing=[]
        for value in example.get('identifiers',[]):
            for match in re.finditer(r'(?<!\w)'+re.escape(value)+r'(?!\w)',text):
                if not covered(text,*match.span(),result.edits):missing.append({'value':value,'start':match.start(),'end':match.end()})
        lost=[value for value in example.get('expected_preserved',[]) if value not in (result.protected_text or '')]
        missed_drops=[]
        for value in example.get('expected_removed',[]):
            start=text.index(value)
            if not covered(text,start,start+len(value),result.edits,'DROP'):missed_drops.append(value)
        groups=[]
        for forms in example.get('person_groups',[]):
            aliases=set()
            for form in forms:
                for match in re.finditer(r'(?<!\w)'+re.escape(form)+r'(?!\w)',text):
                    aliases.update(e.replacement for e in result.edits if e.action=='ALIAS' and e.start<=match.start() and match.end()<=e.end)
            groups.append(sorted(aliases))
        inconsistent=sum(len(g)>1 for g in groups)
        merged=any(set(a)&set(b) for i,a in enumerate(groups) for b in groups[i+1:])
        mapping=_person_map(text,[vars(e) for e in result.edits],result.protected_text or '')
        mock=' '.join(mapping)+' [PERSON_999] [EMAIL]'
        preview=service.preview(text,task)
        outputs.append({'id':example['id'],'word_count':len(text.split()),'text':text,'task':task,'result':result.as_dict(),
                        'identifier_misses':missing,'lost_expected_facts':lost,'missed_expected_sections':missed_drops,
                        'person_group_aliases':groups,'inconsistent_person_groups':inconsistent,'erroneous_person_merge':merged,
                        'expected_no_edit':example.get('expected_no_edit',False),'no_edit':result.protected_text==text,
                        'real_app_supported':preview['protected_text'] is not None,'real_app_protected_text':preview['protected_text'],
                        'local_mock_reply':mock,'locally_restored_reply':restore_text(mock,mapping)})
    return {'evaluation_role':'fresh_agent_authored_diagnostics_not_training_or_selection','outputs':outputs,
            'counts':{'cases':len(outputs),'identifier_misses':sum(len(r['identifier_misses']) for r in outputs),
                      'lost_expected_facts':sum(len(r['lost_expected_facts']) for r in outputs),
                      'missed_expected_sections':sum(len(r['missed_expected_sections']) for r in outputs),
                      'inconsistent_person_groups':sum(r['inconsistent_person_groups'] for r in outputs),
                      'erroneous_person_merges':sum(r['erroneous_person_merge'] for r in outputs)}}


def main():
    p=argparse.ArgumentParser();p.add_argument('--model',type=Path,required=True);p.add_argument('--inputs',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True);p.add_argument('--fixtures',type=Path);p.add_argument('--gallery',type=Path)
    p.add_argument('--device',default='cpu');args=p.parse_args();args.output.mkdir(parents=True,exist_ok=False);torch.set_num_threads(4)
    model=load_model(args.model,args.device);engine=Protector(model)
    fresh=check_fresh(model,json.loads(args.inputs.read_text()))
    (args.output/'fresh.json').write_text(json.dumps(fresh,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'fresh':fresh['counts']}),flush=True)
    if args.fixtures:
        adapters=[]
        for fixture in json.loads((args.fixtures/'manifest.json').read_text())['fixtures']:
            source=args.fixtures/fixture['file'];assert digest(source)==fixture['sha256']
            target=args.output/('protected-'+source.name)
            row={'file':source.name,'training_demonstration':True,'before':cells(source)}
            try:
                row['report']=protect_table(engine,source,target,fixture['intended_use']);row['after']=cells(target)
                expected=fixture.get('expected_cells',{})|fixture.get('unchanged_cells',{})
                if fixture.get('expected_file'):expected=cells(args.fixtures/fixture['expected_file'])
                row['expected']=expected
                row['mismatches']={c:{'expected':v,'actual':row['after'].get(c)} for c,v in expected.items() if row['after'].get(c)!=v}
                row['parse_transform_export_round_trip']=True
            except Exception as error:row['error']=type(error).__name__+': '+str(error)
            adapters.append(row)
        (args.output/'adapters.json').write_text(json.dumps(adapters,indent=2,ensure_ascii=False)+'\n')
        print(json.dumps({'adapters':len(adapters),'exceptions':sum('error'in r for r in adapters),
                          'exact_fixture_matches':sum(not r.get('mismatches') and 'error'not in r for r in adapters)}),flush=True)
    if args.gallery:
        gallery=[]
        for example in json.loads(args.gallery.read_text())['examples']:
            result=engine.protect_text(example['text'],example['intended_use'])
            gallery.append({'id':example['id'],'training_demonstration':True,'text':example['text'],'task':example['intended_use'],
                            'expected':example['expected_protected_text'],'result':result.as_dict()})
        (args.output/'gallery.json').write_text(json.dumps(gallery,indent=2,ensure_ascii=False)+'\n')


if __name__=='__main__':main()
