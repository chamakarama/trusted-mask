"""Browser adapter. Rust supplies exact code-point offsets; ONNX supplies logits."""
import json
import math
from types import SimpleNamespace
from privacy_core.contracts import Prediction
from privacy_core.features import decode_bio
from privacy_core.engine import Protector


def softmax(values):
    top = max(values)
    exps = [math.exp(x - top) for x in values]
    total = sum(exps)
    return [x / total for x in exps]


class BrowserModel:
    def __init__(self, manifest, encode, infer):
        self.manifest, self.encode, self.infer = manifest, encode, infer
        self.model_id = manifest['id']
        self.bundle_sha256 = manifest['reference_bundle_sha256']
        self.training_policy_version = manifest['training_policy']
        self.runtime = manifest.get('runtime') or {}
        self.default_section_mode = self.runtime.get('section_mode', 'legacy')
        self.entity_semantics = self.runtime.get('entity_semantics', 'legacy')
        self.net = SimpleNamespace(backbone=SimpleNamespace(config=SimpleNamespace(max_position_embeddings=manifest['max_tokens'])))
        self.tokenizer = self.tokenize

    def tokenize(self, text, **kwargs):
        return json.loads(self.encode(text, None, False))['windows'][0]

    @staticmethod
    def offset(text, start, end):
        while start < end and text[start].isspace():
            start += 1
        while end > start and text[end - 1].isspace():
            end -= 1
        return start, end

    async def detect(self, text):
        encoded = json.loads(self.encode(text, None, True))['windows']
        values = {}
        for window in encoded:
            logits = json.loads(await self.infer(json.dumps(window), 'tag'))
            for vector, (a, b) in zip(logits, window['offset_mapping'], strict=True):
                a, b = self.offset(text, a, b)
                if a != b:
                    values.setdefault((a, b), []).append(vector)
        sequence, labels = [], []
        for (a, b), vectors in sorted(values.items()):
            average = [sum(x) / len(vectors) for x in zip(*vectors, strict=True)]
            sequence.append((text[a:b], a, b))
            labels.append(self.manifest['tags'][max(range(len(average)), key=average.__getitem__)])
        return decode_bio(sequence, labels, 'encoder-tagger')

    async def predict(self, text, span, task, context=''):
        marked = text[:span.start] + ' [unused0] ' + text[span.start:span.end] + ' [unused1] ' + text[span.end:]
        pair = task + '\n' + context + '\nType: ' + span.label
        batch = json.loads(self.encode(pair, marked, False))['windows'][0]
        if len(batch['input_ids']) > self.manifest['max_tokens']:
            raise ValueError('Action context exceeds encoder window')
        action, relevance = json.loads(await self.infer(json.dumps(batch), 'action'))
        return Prediction(dict(zip(self.manifest['actions'], softmax(action), strict=True)),
                          dict(zip(self.manifest['relevance'], softmax(relevance), strict=True)))

    async def predict_sections(self, text, units, task, context=''):
        results = []
        left_id, right_id = self.manifest['section_marker_ids']
        for start, end in units:
            if not 0 <= start < end <= len(text):
                raise ValueError('Invalid section offsets')
            source = text[:start] + ' [unused2] ' + text[start:end] + ' [unused3] ' + text[end:]
            pair = 'Intended task: ' + task + '\nContext: ' + context
            batch = json.loads(self.encode(pair, source, False))['windows'][0]
            ids = batch['input_ids']
            if len(ids) > self.manifest['max_tokens'] or ids.count(left_id) != 1 or ids.count(right_id) != 1:
                raise ValueError('Section task/source exceeds window or contains ambiguous markers')
            left, right = ids.index(left_id), ids.index(right_id)
            if left >= right - 1:
                raise ValueError('Empty or reversed section markers')
            batch['section_mask'] = [int(left < i < right) for i in range(len(ids))]
            logits = json.loads(await self.infer(json.dumps(batch), 'section'))
            results.append(dict(zip(self.manifest['relevance'], softmax(logits), strict=True)))
        return results


def configure(manifest_json, encode, infer):
    global protector
    protector = Protector(BrowserModel(json.loads(manifest_json), encode, infer))


async def protect(text, task):
    result = await protector.protect_text(text, task, language='en')
    return json.dumps(result.as_dict())
