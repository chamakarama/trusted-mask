"""Package a previously fitted checkpoint selected on frozen development data."""
import argparse
import json
from pathlib import Path
from mask.ml.privacy_v1.section_training import package


def main():
    p=argparse.ArgumentParser();p.add_argument('--run',type=Path,required=True)
    p.add_argument('--epoch',type=int,required=True);p.add_argument('--pretrained',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True);args=p.parse_args()
    metadata=json.loads((args.run/'run.json').read_text())
    progress=json.loads((args.run/'training-progress.json').read_text())
    metadata.update(training=progress[:args.epoch],selected_epoch=args.epoch,
                    evaluation_status='dev_selected_cpu_verification_pending',
                    selection='Frozen dev: prioritize required-fact retention and false-removal avoidance over raw deletion count.')
    args.output.mkdir(parents=True,exist_ok=False)
    package(args.run/f'epoch-{args.epoch}',args.output,metadata['track'],metadata,args.pretrained)


if __name__=='__main__':main()
