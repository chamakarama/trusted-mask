"""Bounded post-publication dev comparison: two epochs, one learning rate."""
import argparse
import gc
import json
from pathlib import Path
import torch
from mask.ml.privacy_v1.bundle import load_model
from mask.ml.privacy_v1.annotation.tools import read
from mask.ml.privacy_v1.section_evaluation import evaluate_rows,GoalAgnostic


def main():
    p=argparse.ArgumentParser();p.add_argument('--run',type=Path,required=True)
    p.add_argument('--track',required=True);p.add_argument('--output',type=Path,required=True)
    p.add_argument('--split',type=Path,default=Path('mask/ml/privacy_v1/data/section-split-20261108-v1'))
    args=p.parse_args();args.output.mkdir(parents=True,exist_ok=False);torch.set_num_threads(4)
    datasets={'original-dev':read(args.split/'dev.authored.jsonl'),
              'supplemental':read(args.split/'supplemental-dev.authored.jsonl')}
    for checkpoint,path in [('epoch-2',args.run/args.track),('epoch-1',args.run/'epoch-1')]:
        model=load_model(path,'cuda')
        variants=[('conditioned',model,None)]
        if checkpoint=='epoch-2':variants.append(('goal-agnostic',GoalAgnostic(model),None))
        for variant,provider,mode in variants:
            for split,records in datasets.items():
                report=evaluate_rows(provider,records,mode)
                name=f'{checkpoint}-{variant}-{split}'
                (args.output/(name+'.json')).write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
                print(json.dumps({'name':name,'counts':report['counts']}),flush=True)
        if checkpoint=='epoch-2':
            model.entity_semantics='legacy'
            for split,records in datasets.items():
                report=evaluate_rows(model,records,'legacy')
                name=f'{checkpoint}-legacy-pipeline-{split}'
                (args.output/(name+'.json')).write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
                print(json.dumps({'name':name,'counts':report['counts']}),flush=True)
        del provider,variants,model;gc.collect();torch.cuda.empty_cache()


if __name__=='__main__':main()
