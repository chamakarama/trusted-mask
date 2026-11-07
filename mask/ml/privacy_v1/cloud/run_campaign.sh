#!/usr/bin/env bash
set -uo pipefail
export TOKENIZERS_PARALLELISM=false OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 HF_HUB_DISABLE_XET=1
export HF_HOME="$PWD/.cache/huggingface"
export MASK_SOURCE_COMMIT="$(cat SOURCE_COMMIT)"
mkdir -p out/logs
python -m pip freeze > out/environment.lock
nvidia-smi > out/nvidia-smi.txt
uname -a > out/machine.txt
run() {
  local name="$1"; shift
  printf '%s START %s\n' "$(date -u +%FT%TZ)" "$name" | tee -a out/progress.log
  if "$@" > "out/logs/$name.log" 2>&1; then
    printf '%s PASS %s\n' "$(date -u +%FT%TZ)" "$name" | tee -a out/progress.log
  else
    local code=$?
    printf '%s FAIL %s exit=%s\n' "$(date -u +%FT%TZ)" "$name" "$code" | tee -a out/progress.log
    return "$code"
  fi
}
run rules python -m mask.ml.privacy_v1.experiment --track rules --output out/rules
run rules-inspect python -m mask.ml.privacy_v1.inspect_campaign --output out/rules-inspect
if run custom-smoke timeout 600 python -m mask.ml.privacy_v1.experiment --track custom-a --smoke --output out/custom-a-smoke; then
  if run custom-full timeout 1200 python -m mask.ml.privacy_v1.experiment --track custom-a --output out/custom-a; then
    selected=$(python -c 'import json; print(json.load(open("out/custom-a/selection.json"))["selected"]["bundle"])')
    run custom-inspect python -m mask.ml.privacy_v1.inspect_campaign --model "$selected" --output out/custom-a-inspect
  fi
fi
for track in encoder-b deberta-v3-base; do
  if ! run "$track-fetch" python -m mask.ml.privacy_v1.fetch_encoder --track "$track" --output ".cache/$track"; then continue; fi
  export HF_HUB_OFFLINE=1
  if run "$track-smoke" timeout 1800 python -m mask.ml.privacy_v1.experiment --track "$track" --base ".cache/$track" --device cuda --smoke --output "out/$track-smoke"; then
    if run "$track-full" timeout 7200 python -m mask.ml.privacy_v1.experiment --track "$track" --base ".cache/$track" --device cuda --epochs 2 --learning-rates 0.00002 0.00005 --output "out/$track"; then
      selected=$(python -c 'import json,sys; print(json.load(open(sys.argv[1]))["selected"]["bundle"])' "out/$track/selection.json")
      run "$track-inspect" timeout 1800 python -m mask.ml.privacy_v1.inspect_campaign --model "$selected" --device cuda --output "out/$track-inspect"
    fi
  fi
  unset HF_HUB_OFFLINE
 done
printf '%s DONE\n' "$(date -u +%FT%TZ)" | tee -a out/progress.log
