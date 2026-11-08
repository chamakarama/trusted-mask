"""Two conservative dev-only threshold alternatives; never fit on dev."""
import argparse
import json
from pathlib import Path
import torch
from mask.ml.privacy_v1.bundle import load_model
from mask.ml.privacy_v1.annotation.tools import read
from mask.ml.privacy_v1.section_evaluation import evaluate_rows


def main():
    p=argparse.ArgumentParser();p.add_argument('--model',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True);args=p.parse_args()
    args.output.mkdir(parents=True,exist_ok=False);torch.set_num_threads(4)
    model=load_model(args.model,'cuda')
    root=Path('mask/ml/privacy_v1/data/section-split-20261108-v1')
    for threshold in (.999,.9999):
        model.runtime['section_threshold']=threshold
        for split,name in [('original-dev','dev'),('supplemental','supplemental-dev')]:
            report=evaluate_rows(model,read(root/(name+'.authored.jsonl')))
            report['threshold']=threshold
            (args.output/f'{threshold}-{split}.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
            print(json.dumps({'threshold':threshold,'split':split,'counts':report['counts']}),flush=True)


if __name__=='__main__':main()
