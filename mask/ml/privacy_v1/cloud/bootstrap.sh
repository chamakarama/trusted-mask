#!/usr/bin/env bash
# Run inside the unpacked source directory on the pinned Google DLVM image.
set -euo pipefail
sudo apt-get update -qq
sudo apt-get install -y -qq python3.12-venv
python3 -m venv --system-site-packages .venv
# CUDA PyTorch is supplied by the exact image, not replaced by the macOS lock.
python3 - <<'PY'
from pathlib import Path
p = Path('mask/ml/privacy_v1/requirements.lock')
Path('requirements-cloud.txt').write_text('\n'.join(line for line in p.read_text().splitlines() if not line.startswith('torch==')) + '\n')
PY
.venv/bin/python -m pip install -r requirements-cloud.txt
.venv/bin/python - <<'PY'
import torch
assert torch.__version__ == '2.9.1+cu129', torch.__version__
assert torch.cuda.is_available()
print(torch.__version__, torch.cuda.get_device_name(0))
PY
