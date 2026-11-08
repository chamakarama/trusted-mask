"""Score saved outputs and enumerate every fact loss/false deletion for review."""
import argparse
import json
from collections import Counter
from pathlib import Path
from types import SimpleNamespace
from .annotation.tools import read
from .contracts import DIRECT
from .section_evaluation import covered


def audit(report,records):
    rows={r['id']:r for r in records};counts=Counter();failures=[]
    for output in report['outputs']:
        row=rows[output['id']];text=row['text'];result=output['result']
        edits=[SimpleNamespace(**e) for e in result['edits']]
        gold_drop={i for d in row['decisions'] if d['action']=='DROP' for i in range(d['start'],d['end'])}
        for edit in edits:
            if edit.action!='DROP':continue
            counts['predicted_drop_regions']+=1
            valid=all(i in gold_drop or text[i].isspace() or text[i] in '.!?;'
                      for i in range(edit.start,edit.end))
            counts['drop_regions_within_gold_drop']+=valid
            counts['drop_regions_outside_gold_drop']+=not valid
        placeholders=[]
        for target in row['decisions']:
            if target['action']!='PLACEHOLDER':continue
            a,b=target['start'],target['end'];counts['placeholder_targets']+=1
            matching=[e for e in edits if e.start<=a and b<=e.end and e.action=='PLACEHOLDER']
            correct=any(e.replacement=='['+target['label']+']' for e in matching)
            counts['exact_placeholder_type_correct']+=correct
            if target['relevance']=='essential' and target['label'] not in DIRECT:
                counts['essential_nondirect_placeholder_targets']+=1
                counts['essential_nondirect_placeholder_correct']+=correct
            if not correct:placeholders.append({'quote':text[a:b],'target':target,'overlapping_edits':[
                vars(e) for e in edits if e.start<b and a<e.end]})
        lost=[]
        for fact in output['lost_required_facts']:
            a,b=fact['start'],fact['end']
            lost.append({'quote':text[a:b],'overlapping_edits':[vars(e) for e in edits if e.start<b and a<e.end]})
        if lost or output['false_removals'] or output['identifier_misses'] or placeholders:
            failures.append({'id':row['id'],'task':row['task'],'text':text,'protected_text':result['protected_text'],
                'identifier_misses':output['identifier_misses'],'lost_required_facts':lost,
                'false_clause_removals':output['false_removals'],'placeholder_errors':placeholders,
                'pending_reviews':result['pending_reviews']})
    return {'counts':dict(counts),'failures':failures,
            'scope':'Post-hoc scoring only; annotations never enter inference. Type-exact placeholder scoring is stricter than identifier coverage. Drop-region precision requires every removed non-whitespace/non-delimiter character to lie in a gold DROP span; whole-section recall is scored separately in the evaluation report.'}


def main():
    p=argparse.ArgumentParser();p.add_argument('--report',type=Path,required=True)
    p.add_argument('--data',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    args=p.parse_args();result=audit(json.loads(args.report.read_text()),read(args.data))
    with args.output.open('x') as f:json.dump(result,f,indent=2,ensure_ascii=False)
    print(json.dumps(result['counts']))


if __name__=='__main__':main()
