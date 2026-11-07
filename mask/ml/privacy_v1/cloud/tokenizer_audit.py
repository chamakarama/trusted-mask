"""Full text-tokenization export parity and explicit Unicode/source-offset probes."""
import json
import tempfile
from pathlib import Path
from transformers import AutoTokenizer, AutoConfig
from mask.ml.privacy_v1.experiment import canonical
from mask.ml.privacy_v1.encoder import EncoderModel

train, dev = canonical()
probes = ['Zoë Bennett 😀 paid €35. Email: zoe@example.invalid.',
          'First line.\n\nSecond\tline with café and a — dash.',
          'Name: [unused0] Nadia Vale [unused1].']
report = {}
for track in ('encoder-b', 'deberta-v3-base'):
    base = Path('.cache') / track
    tok = AutoTokenizer.from_pretrained(base, local_files_only=True, trust_remote_code=False)
    tok.add_special_tokens({'additional_special_tokens': ['[unused0]', '[unused1]']})
    all_texts = [r['text'] for r in train + dev] + probes
    checks, unknown = [], 0
    with tempfile.TemporaryDirectory() as tmp:
        tok.save_pretrained(tmp)
        reloaded = AutoTokenizer.from_pretrained(tmp, local_files_only=True, trust_remote_code=False)
        for text in all_texts:
            before = tok(text, return_offsets_mapping=True)
            assert before == reloaded(text, return_offsets_mapping=True)
            unknown += before['input_ids'].count(tok.unk_token_id)
            if text in probes:
                checks.append({'text': text, 'tokens': [
                    {'token': tok.convert_ids_to_tokens(token), 'offset': [a, b],
                     'source': text[a:b], 'trimmed_offset': list(EncoderModel._offset(text, a, b))}
                    for token, (a, b) in zip(before['input_ids'], before['offset_mapping'])]})
    backend = json.loads(tok.backend_tokenizer.to_str())
    config = AutoConfig.from_pretrained(base, local_files_only=True, trust_remote_code=False)
    report[track] = {'model_type': config.model_type, 'tokenizer_class': type(tok).__name__,
        'pre_tokenizer': backend['pre_tokenizer'], 'tokenizer_model_type': backend['model']['type'],
        'texts_with_identical_ids_and_offsets_after_reload': len(all_texts),
        'unknown_tokens_including_unicode_probes': unknown, 'probes': checks,
        'byte_fallback_note': 'Fast SentencePiece may emit UNK for characters that slow tokenizer represents as byte tokens; source offsets are preserved.'}
Path('out/tokenizer-audit.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({k: {f: v[f] for f in ('model_type', 'tokenizer_class', 'texts_with_identical_ids_and_offsets_after_reload', 'unknown_tokens_including_unicode_probes')} for k,v in report.items()}))
