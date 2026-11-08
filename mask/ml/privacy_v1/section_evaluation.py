"""End-to-end section/identifier/alias diagnostics; gold enters scoring only."""
import argparse
import json
import time
from collections import Counter, defaultdict
from pathlib import Path
from .contracts import DIRECT
from .engine import Protector, RulesModel
from .bundle import load_model
from .annotation.tools import read
from .sections import section_targets, CLAUSE_MODE


def covered(text,a,b,edits,action=None):
    return all(c.isspace() or any(e.start<=i<e.end and (action is None or e.action==action) for e in edits)
               for i,c in enumerate(text[a:b],a))


class GoalAgnostic:
    def __init__(self,base):self.base=base;self.model_id=base.model_id+'-goal-agnostic'
    def __getattr__(self,name):return getattr(self.base,name)
    def predict(self,text,span,task,context=''):
        return self.base.predict(text,span,'Summarise the information.',context)
    def predict_sections(self,text,units,task,context=''):
        return self.base.predict_sections(text,units,'Summarise the information.',context)


def evaluate_rows(model,records,section_mode=None):
    engine=Protector(model,section_mode=section_mode)
    counts=Counter();outputs=[];latencies=[];source_groups=defaultdict(list)
    for row in records:
        text=row['text'];started=time.perf_counter()
        # No annotations, IDs, required facts or categories reach this call.
        result=engine.protect_text(text,row['task'])
        latencies.append(time.perf_counter()-started)
        counts['records']+=1;counts['unsupported']+=result.protected_text is None
        misses=[];lost=[];aliases=defaultdict(set);reverse=defaultdict(set);expected=set()
        for decision in row['decisions']:
            a,b=decision['start'],decision['end']
            if decision['action']!='KEEP':expected.update(range(a,b))
            if decision['action']=='DROP':
                counts['required_whole_sections']+=1
                counts['whole_sections_removed']+=covered(text,a,b,result.edits,'DROP')
            if decision['label'] in DIRECT and decision['action']!='KEEP':
                counts['direct_identifiers']+=1
                if result.protected_text is None or not covered(text,a,b,result.edits):
                    counts['identifier_misses']+=1;misses.append(decision)
        for fact in row['required_facts']:
            quote=text[fact['start']:fact['end']]
            counts['required_facts']+=1
            if quote not in (result.protected_text or ''):
                counts['lost_required_facts']+=1;lost.append(fact)
        for entity in row['entities']:
            if entity['label']!='PERSON':continue
            a,b=entity['start'],entity['end']
            if covered(text,a,b,result.edits,'DROP'):continue
            counts['retained_person_mentions']+=1
            matching=[e for e in result.edits if e.start<=a and b<=e.end and e.action=='ALIAS']
            if not matching:
                counts['person_alias_misses']+=1
            else:
                token=matching[0].replacement;identity=entity.get('entity_id',entity['id'])
                aliases[identity].add(token);reverse[token].add(identity)
        counts['inconsistent_identity_aliases']+=sum(len(tokens)>1 for tokens in aliases.values())
        counts['erroneous_identity_merges']+=sum(len(ids)>1 for ids in reverse.values())
        changed={i for e in result.edits for i in range(e.start,e.end)}
        counts['unnecessary_changed_characters']+=len(changed-expected)
        targets=section_targets(row,CLAUSE_MODE);false=[]
        for s in targets:
            removed=covered(text,s['start'],s['end'],result.edits,'DROP')
            counts['predicted_removed_clauses']+=removed
            if s['target']=='unnecessary':
                counts['required_clause_removals']+=1;counts['correct_clause_removals']+=removed
            elif removed:
                counts['false_clause_removals']+=1;false.append(s)
        counts['records_with_identifier_misses']+=bool(misses)
        counts['records_with_lost_required_facts']+=bool(lost)
        counts['records_with_false_clause_removals']+=bool(false)
        for trace in result.section_diagnostics:
            target=next((s['target'] for s in targets if (s['start'],s['end'])==(trace['start'],trace['end'])),None)
            if trace.get('raw_class')=='unnecessary' and target is not None:
                counts['raw_unnecessary_on_'+target]+=1
            counts['gate_'+trace['reason']]+=1
        if text==row['approved_output']:
            counts['benign_no_edit_controls']+=1
            counts['benign_controls_changed']+=(result.protected_text!=text)
        output={'id':row['id'],'source_id':row['source_id'],'task':row['task'],'text':text,
                'result':result.as_dict(),'identifier_misses':misses,'lost_required_facts':lost,'false_removals':false,
                'section_targets':targets,'latency_seconds':latencies[-1]}
        outputs.append(output);source_groups[text].append(output)
    for rows in source_groups.values():
        if len({r['task'] for r in rows})<2:continue
        counts['task_pair_groups']+=1
        all_correct=True;switches=0
        for i,left in enumerate(rows):
            for right in rows[i+1:]:
                l={(s['start'],s['end']):s['target'] for s in left['section_targets']}
                r={(s['start'],s['end']):s['target'] for s in right['section_targets']}
                for unit in l:
                    if {l[unit],r[unit]}!={'essential','unnecessary'}:continue
                    switches+=1;counts['gold_task_conditioned_switches']+=1
                    outcomes=[]
                    for row,target in ((left,l[unit]),(right,r[unit])):
                        removed=all(c.isspace() or any(e['action']=='DROP' and e['start']<=k<e['end'] for e in row['result']['edits'])
                                    for k,c in enumerate(row['text'][unit[0]:unit[1]],unit[0]))
                        outcomes.append(removed==(target=='unnecessary') and not row['identifier_misses'] and not row['lost_required_facts'])
                    correct=all(outcomes);counts['correct_task_conditioned_switches']+=correct;all_correct &= correct
        counts['fully_correct_task_pairs']+=bool(switches and all_correct)
    for key in ('identifier_misses','lost_required_facts','false_clause_removals','correct_clause_removals',
                'inconsistent_identity_aliases','erroneous_identity_merges','correct_task_conditioned_switches'):
        counts.setdefault(key,0)
    return {'counts':dict(counts),'outputs':outputs,'latency_seconds':{'median':sorted(latencies)[len(latencies)//2],
            'max':max(latencies)},'runtime_versions':engine.runtime_versions(),'independent_final_test':False,
            'limitations':['Synthetic model-reviewed development evidence, not human-audited final testing.',
                          'Exact fact quotes and gold identity IDs are used only for scoring; runtime gets text and task only.',
                          'Unlabelled-clause deletion is counted as false removal conservatively.']}


def sanity_report(model,authored,pairs):
    report=evaluate_rows(model,authored)
    raw_correct=raw_total=0
    for _,rows,switches in pairs:
        for a,b in switches:
            raw_total+=1
            targets=[{(s['start'],s['end']):s['target'] for s in section_targets(r,CLAUSE_MODE)} for r in rows]
            predictions=[model.predict_sections(r['text'],[(a,b)],r['task'])[0] for r in rows]
            raw_correct+=all(max(p,key=p.get)==t[(a,b)] for p,t in zip(predictions,targets))
    c=report['counts']
    # Keep the identifier miss in headline metrics. Current main explicitly
    # retains business-labelled order numbers for review; a contradictory data
    # target is not permission to remove that safeguard during this head test.
    policy_review_misses=sum(any(p['reason']=='business_number_context' and
                                p['start']<=miss['start'] and miss['end']<=p['end']
                                for p in row['result']['pending_reviews'])
                             for row in report['outputs'] for miss in row['identifier_misses'])
    report.update(evaluation_role='training_only_sanity',raw_correct_switches=raw_correct,raw_switches=raw_total)
    report['documented_business_number_review_misses']=policy_review_misses
    report['sanity_gate_scope']='Correct raw and pipeline task switches, no lost facts/false drops, and no unexplained identifier misses; business-number review exceptions remain counted and reported.'
    report['passed']=bool(raw_total and raw_correct==raw_total and c['correct_task_conditioned_switches']==raw_total
                          and c['identifier_misses']==policy_review_misses and c['lost_required_facts']==0 and c['false_clause_removals']==0)
    return report


def main():
    p=argparse.ArgumentParser();p.add_argument('--model',type=Path);p.add_argument('--data',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True);p.add_argument('--device',default='cpu');p.add_argument('--section-mode')
    p.add_argument('--goal-agnostic',action='store_true');p.add_argument('--threshold',type=float)
    p.add_argument('--legacy-entity-semantics',action='store_true',help='Isolate learned weight gains under the old entity decision rules')
    args=p.parse_args()
    import torch
    torch.set_num_threads(4)
    model=load_model(args.model,args.device) if args.model else RulesModel()
    if args.threshold is not None:model.runtime['section_threshold']=args.threshold
    if args.legacy_entity_semantics:model.entity_semantics='legacy'
    if args.goal_agnostic:model=GoalAgnostic(model)
    report=evaluate_rows(model,read(args.data),args.section_mode)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with args.output.open('x') as f:json.dump(report,f,indent=2,ensure_ascii=False)
    print(json.dumps({'counts':report['counts'],'latency_seconds':report['latency_seconds']}),flush=True)


if __name__=='__main__':main()
