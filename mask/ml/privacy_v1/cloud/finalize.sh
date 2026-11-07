#!/usr/bin/env bash
set -euo pipefail
source .venv/bin/activate
export HF_HUB_OFFLINE=1 TOKENIZERS_PARALLELISM=false OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4
while ! grep -q ' DONE$' out/progress.log; do sleep 15; done
python -m mask.ml.privacy_v1.cloud.verify_final > out/logs/final-cpu-verification.log 2>&1
python -m mask.ml.privacy_v1.cloud.package_results > packaging.json
