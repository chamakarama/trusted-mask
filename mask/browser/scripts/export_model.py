"""Export our three-head encoder, not a stock Hugging Face classification head.

Run from the repository root with the training environment. ONNX dependencies
may be installed in mask/browser/.tools/python; no training files are modified.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[3]
BROWSER = ROOT / 'mask/browser'
from source_snapshot import snapshot
SOURCE_ROOT = snapshot()
sys.path.insert(0, str(SOURCE_ROOT))
sys.path.insert(0, str(BROWSER / '.tools/python'))
os.environ.setdefault('HF_HUB_OFFLINE', '1')
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')

import numpy as np
import torch
import onnx
import onnxruntime as ort
from mask.ml.privacy_v1.bundle import load_model, verify
from mask.ml.privacy_v1.contracts import LABELS, ACTIONS, RELEVANCE, PIPELINE_VERSION
from mask.ml.privacy_v1.encoder import TAGS
from mask.ml.privacy_v1.policy import POLICY_VERSION


def sha(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def unpack_current():
    archives = ROOT / 'mask/ml/privacy_v1/bundled_weights/training-2026-11-07'
    archive = archives / 'deberta-v3-base.tar.gz'
    expected = next(line.split()[0] for line in (archives / 'SHA256SUMS').read_text().splitlines()
                    if line.split()[-1] == archive.name)
    if sha(archive) != expected:
        raise ValueError('Archive checksum mismatch')
    destination = BROWSER / '.cache/reference'
    model = destination / 'deberta-v3-base'
    if not model.exists():
        destination.mkdir(parents=True, exist_ok=True)
        with tarfile.open(archive) as source:
            source.extractall(destination, filter='data')
    return model


class ExportNetwork(torch.nn.Module):
    def __init__(self, net):
        super().__init__()
        self.net = net

    def forward(self, input_ids, attention_mask, token_type_ids, section_mask=None):
        hidden = self.net.backbone(input_ids=input_ids, attention_mask=attention_mask,
                                   token_type_ids=token_type_ids).last_hidden_state
        outputs = (self.net.tag(hidden), self.net.action(hidden[:, 0]), self.net.relevance(hidden[:, 0]))
        if hasattr(self.net, 'section'):
            weights = section_mask.unsqueeze(-1).to(hidden.dtype)
            pooled = (hidden * weights).sum(1) / weights.sum(1).clamp_min(1)
            outputs += (self.net.section(torch.cat((hidden[:, 0], pooled), -1)),)
        return outputs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', type=Path)
    parser.add_argument('--key', choices=['mask1','mask2','maskmini'], required=True)
    parser.add_argument('--quantize', action='store_true')
    parser.add_argument('--half-storage', action='store_true', help='Store large weights in FP16, compute in FP32')
    args = parser.parse_args()
    torch.set_num_threads(4)
    directory = args.model or unpack_current()
    metadata = verify(directory)
    if metadata['track'] in ('encoder-b', 'deberta-v3-base'):
        model = load_model(directory)
    else:
        # A final DeBERTa Large / MiniLM checkpoint may use a new track name,
        # but must still have our exact three-head state dict and contract.
        from mask.ml.privacy_v1.encoder import EncoderModel
        config = json.loads((directory / 'config.json').read_text())
        if config.get('model_type') not in ('deberta-v2', 'bert'):
            raise ValueError('Unsupported encoder architecture; add and validate an adapter first')
        model = EncoderModel.load(directory)
        model.training_policy_version = metadata['policy_version']
        model.bundle_sha256 = sha(directory / 'manifest.json')
    net = ExportNetwork(model.net).eval()
    export = BROWSER / '.cache/exports' / model.bundle_sha256[:16]
    export.mkdir(parents=True, exist_ok=True)
    fp32 = export / 'model.fp32.onnx'
    sample = model.tokenizer('Please summarise this record. Name: Jane Smith. Email: jane@example.invalid.', return_tensors='pt')
    sample.setdefault('token_type_ids', torch.zeros_like(sample['input_ids']))
    inputs = ['input_ids','attention_mask','token_type_ids']
    outputs = ['tag_logits','action_logits','relevance_logits']
    if hasattr(model.net, 'section'):
        sample['section_mask'] = sample['attention_mask'].clone()
        inputs.append('section_mask')
        outputs.append('section_logits')
    if not fp32.exists() or not (export / 'source.sha256').exists() or (export / 'source.sha256').read_text().strip() != model.bundle_sha256:
        print('Exporting full backbone and all trained heads', flush=True)
        torch.onnx.export(net, tuple(sample[k] for k in inputs),
                          str(fp32), input_names=inputs, output_names=outputs,
                          dynamic_axes={k: {0: 'batch', 1: 'sequence'} for k in
                                        [*inputs, 'tag_logits']} |
                                       {k: {0: 'batch'} for k in outputs[1:]},
                          opset_version=17, dynamo=False, external_data=False)
        (export / 'source.sha256').write_text(model.bundle_sha256)
    onnx.checker.check_model(str(fp32))
    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    session = ort.InferenceSession(str(fp32), sess_options=options, providers=['CPUExecutionProvider'])
    errors = []
    for length in (8, 37, 128, 332, 512):
        ids = torch.tensor([[1] + [100] * (length - 2) + [2]])
        batch = {'input_ids': ids, 'attention_mask': torch.ones_like(ids), 'token_type_ids': torch.zeros_like(ids)}
        if 'section_mask' in inputs:
            batch['section_mask'] = torch.zeros_like(ids)
            batch['section_mask'][:, 2:-2] = 1
        with torch.inference_mode():
            reference = net(**batch)
        values = session.run(None, {x.name: batch[x.name].numpy() for x in session.get_inputs()})
        for key, a, b in zip(outputs, reference, values):
            error = float(np.max(np.abs(a.numpy() - b)))
            np.testing.assert_allclose(a.numpy(), b, rtol=1e-3, atol=2e-4)
            errors.append({'length': length, 'head': key, 'max_error': error})
    variant = fp32
    if args.quantize:
        from onnxruntime.quantization import quantize_dynamic, QuantType
        variant = export / 'model.q8.onnx'
        print('Quantizing MatMul and embedding Gather weights', flush=True)
        quantize_dynamic(str(fp32), str(variant), weight_type=QuantType.QInt8,
                         op_types_to_quantize=['MatMul', 'Gather'], per_channel=False)
    if args.half_storage:
        if args.quantize:
            raise ValueError('Choose one storage format')
        variant = export / 'model.half-storage.onnx'
        graph = onnx.load(str(fp32))
        casts = []
        for weight in graph.graph.initializer:
            if weight.data_type == onnx.TensorProto.FLOAT and np.prod(weight.dims) > 4096:
                name = weight.name
                array = onnx.numpy_helper.to_array(weight).astype(np.float16)
                weight.CopyFrom(onnx.numpy_helper.from_array(array, name=name+'__fp16_storage'))
                casts.append(onnx.helper.make_node('Cast',[weight.name],[name],to=onnx.TensorProto.FLOAT))
        nodes = list(graph.graph.node)
        del graph.graph.node[:]
        graph.graph.node.extend(casts + nodes)
        onnx.save(graph,str(variant))
    # Include all paired artifacts: unchanged weights with a changed tokenizer
    # or policy must never overwrite a previously cached release.
    identity = [sha(variant), sha(directory / 'tokenizer.json'), PIPELINE_VERSION, POLICY_VERSION]
    for name in ('contracts','engine','policy','candidates','editing','rules','features','identifiers','validators','sections','section_pipeline'):
        identity.append(sha(SOURCE_ROOT / 'mask/ml/privacy_v1' / f'{name}.py'))
    release_hash = hashlib.sha256('\n'.join(identity).encode()).hexdigest()[:12]
    release_id = f'{args.key}-{release_hash}'
    release = BROWSER / 'public/models' / release_id
    release.mkdir(parents=True, exist_ok=True)
    import shutil
    shutil.copyfile(variant, release / 'model.onnx')
    shutil.copyfile(directory / 'tokenizer.json', release / 'tokenizer.json')
    license_name = 'MiniLM-MIT.txt' if model.source.get('repository','').startswith('microsoft/MiniLM') else 'DeBERTa-MIT.txt'
    shutil.copyfile(BROWSER / 'licenses' / license_name, release / 'LICENSE')
    if (directory / 'third_party').exists():
        shutil.copytree(directory / 'third_party', release / 'third_party', dirs_exist_ok=True)
    assets = {name: {'path': name, 'bytes': (release / name).stat().st_size, 'sha256': sha(release / name)}
              for name in ('model.onnx', 'tokenizer.json')}
    manifest = {
        'schema': 2, 'id': release_id, 'name': args.key,
        'source_commit': json.loads((BROWSER / 'runtime-source.json').read_text())['commit'],
        'training_policy': model.training_policy_version, 'runtime': model.runtime,
        'reference_bundle_sha256': model.bundle_sha256,
        'precision': 'int8' if args.quantize else 'float16-storage-float32-compute' if args.half_storage else 'float32',
        'pipeline': PIPELINE_VERSION, 'policy': POLICY_VERSION,
        'labels': list(LABELS), 'tags': list(TAGS), 'actions': list(ACTIONS), 'relevance': list(RELEVANCE),
        'max_tokens': 512, 'stride': 64, 'pad_id': model.tokenizer.pad_token_id,
        'marker_ids': model.tokenizer.convert_tokens_to_ids(['[unused0]', '[unused1]']),
        'inputs': [x.name for x in session.get_inputs()],
        'outputs': outputs,
        'section_marker_ids': model.tokenizer.convert_tokens_to_ids(['[unused2]', '[unused3]']) if model.runtime else None,
        'tokenizers_version': '0.22.2', 'onnxruntime_version': '1.24.3',
        'assets': assets, 'release_validated': False,
    }
    (release / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (BROWSER / f'public/models/{args.key}.json').write_text(json.dumps({'manifest': f'./{release_id}/manifest.json'}, indent=2) + '\n')
    (export / 'onnx-parity.json').write_text(json.dumps(errors, indent=2) + '\n')
    print(json.dumps({'release': str(release), 'bytes': assets['model.onnx']['bytes'], 'max_error': max(x['max_error'] for x in errors)}), flush=True)


if __name__ == '__main__':
    main()
