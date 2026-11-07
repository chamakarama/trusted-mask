"""Pre-training DeBERTa compatibility probe on CPU; never calls an optimizer."""
import json
import tempfile
from pathlib import Path
import torch
from mask.ml.privacy_v1.bundle import write_manifest
from mask.ml.privacy_v1.encoder import EncoderModel
from mask.ml.privacy_v1.experiment import canonical, preflight, parity

torch.set_num_threads(2)
train, dev = canonical()
model = EncoderModel.from_pretrained('.cache/deberta-v3-base', 'cpu')
checks = preflight(model, train + dev)
with tempfile.TemporaryDirectory() as tmp:
    bundle = Path(tmp) / 'bundle'
    model.save(bundle)
    write_manifest(bundle, {'track': 'deberta-v3-base'})
    checks['parity'] = parity(model, bundle, dev[:2])
Path('out/deberta-compatibility.json').write_text(json.dumps(checks, indent=2) + '\n')
print(json.dumps(checks), flush=True)
