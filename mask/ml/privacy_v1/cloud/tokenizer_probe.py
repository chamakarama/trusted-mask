"""Inspect a saved tokenizer without loading weights or contacting the network."""
import argparse
import hashlib
import json
from pathlib import Path
from transformers import AutoTokenizer


def main():
    p=argparse.ArgumentParser();p.add_argument('--bundle',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True);args=p.parse_args()
    tokenizer=AutoTokenizer.from_pretrained(args.bundle,local_files_only=True,trust_remote_code=False)
    backend=json.loads((args.bundle/'tokenizer.json').read_text())
    config=json.loads((args.bundle/'config.json').read_text())
    markers=tokenizer.convert_tokens_to_ids(['[unused0]','[unused1]','[unused2]','[unused3]'])
    assert len(set(markers))==4 and tokenizer.unk_token_id not in markers
    assert max(tokenizer.get_vocab().values())<config['vocab_size']
    cases=[('Zoë O’Connell earned 18,750 euros; her café is open.','Zoë O’Connell'),
           ('The rate is 99.95%, not 95%.','99.95%'),
           ('名字: 李明. Email: li.ming@example.invalid.','李明'),
           ('First line.\n\nNora Lindholm\tcalled Tomas Ek.','Nora Lindholm')]
    outputs=[]
    for text,target in cases:
        encoded=tokenizer(text,return_offsets_mapping=True)
        offsets=encoded['offset_mapping'];assert all(0<=a<=b<=len(text) for a,b in offsets)
        a=text.index(target);b=a+len(target)
        selected=[(x,y) for x,y in offsets if x<b and a<y]
        assert all(c.isspace() or any(x<=i<y for x,y in selected) for i,c in enumerate(text[a:b],a))
        marked=text[:a]+' [unused2] '+text[a:b]+' [unused3] '+text[b:]
        ids=tokenizer('Intended task: Preserve useful facts.',marked)['input_ids']
        assert ids.count(markers[2])==ids.count(markers[3])==1
        assert ids.index(markers[2])+1<ids.index(markers[3]) and len(ids)<=512
        outputs.append({'text':text,'target':target,'target_offsets':[a,b],'token_offsets':offsets,
                        'covered_by_token_offsets':True,'section_markers_unambiguous':True})
    result={'model_type':config['model_type'],'transformers_version':config['transformers_version'],
            'tokenizer_class':type(tokenizer).__name__,'is_fast':tokenizer.is_fast,
            'tokenizer_sha256':hashlib.sha256((args.bundle/'tokenizer.json').read_bytes()).hexdigest(),
            'tokenizer_backend_model':backend['model']['type'],'pre_tokenizer':backend['pre_tokenizer'],
            'normalizer_type':backend['normalizer']['type'],'vocabulary_size':len(tokenizer),
            'embedding_rows':config['vocab_size'],'marker_ids':markers,'probes':outputs,
            'mistral_regex_fix_applied':False}
    args.output.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='probes'}))


if __name__=='__main__':main()
