"""Re-run evaluation of a saved ModelArtifact on an exported example table.

  python3 -I ml/evaluate.py --model ml/runs/<run-id>/model.json [--data ml/data] [--out eval.json]

Maps the artifact's features by name onto examples.jsonl, masks invalid candidates and classes the model does not
have, applies the stored temperature and reports the same metrics as train.py (teacher agreement, acceptable hit,
abstention, ECE, breakdowns, recipe confusion) plus the fixed-policy baseline when policy_baseline.jsonl exists.
Refuses artifacts whose feature spec or registry version differs from the data.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import mask_ml as M  # noqa: E402


def logits_from_artifact(art: dict, d: M.Data) -> tuple[np.ndarray, np.ndarray]:
    pos = {n: i for i, n in enumerate(d.feature_names)}
    missing = [n for n in art["featureSpec"]["baseFeatures"] if n not in pos]
    if missing:
        raise SystemExit(f"artifact uses features not in the data: {missing[:5]}")
    X = d.X[:, [pos[n] for n in art["featureSpec"]["baseFeatures"]]]
    W = np.array(art["weights"], dtype=float)
    b = np.array(art["bias"], dtype=float)
    Zm = X @ W.T + b
    # map model classes onto data classes; data classes the model lacks are masked
    ci = {c["key"]: i for i, c in enumerate(art["classes"])}
    Z = np.full((len(d.rows), len(d.classes)), M.NEG)
    has = np.zeros(len(d.classes), dtype=bool)
    for j, k in enumerate(d.classes):
        if k in ci:
            Z[:, j] = Zm[:, ci[k]]
            has[j] = True
    return Z, has


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", required=True)
    ap.add_argument("--data", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"))
    ap.add_argument("--out")
    a = ap.parse_args()
    with open(a.model) as f:
        art = json.load(f)
    with open(os.path.join(a.data, "meta.json")) as f:
        meta = json.load(f)
    if art["featureSpec"]["version"] != meta["featureSpecVersion"]:
        raise SystemExit(f"feature spec mismatch: model {art['featureSpec']['version']} vs data {meta['featureSpecVersion']}")
    if art["registryVersion"] != meta["registryVersion"]:
        raise SystemExit(f"registry mismatch: model {art['registryVersion']} vs data {meta['registryVersion']}")
    d = M.load_data(a.data)
    Z, has = logits_from_artifact(art, d)
    d.mask = d.mask & has[None, :]
    T = art["calibration"]["temperature"] if art["calibration"]["method"] == "temperature" else 1.0
    policy = M.load_policy(a.data)
    out = {"model": art["modelId"], "temperature": T, "dataHash": meta["dataHash"],
           "sameDataAsTraining": meta["dataHash"] == art["training"]["dataHash"], "splits": {}}
    for s in ("train", "val", "test"):
        idx = M.split_indices(d, s)
        sub = d.subset(idx)
        out["splits"][s] = {"learned": M.model_metrics(Z[idx], sub, T), "fixed policy": M.policy_metrics(policy, sub)}
    text = json.dumps(out, indent=1, default=float)
    if a.out:
        with open(a.out, "w") as f:
            f.write(text)
    for s in ("val", "test"):
        m = out["splits"][s]["learned"]
        if m.get("n"):
            print(f"{s}: top1 {m['top1']:.3f} acceptable {m['acceptableHit']:.3f} abstain {m['abstention']:.3f} ECE {m['ece']:.3f} (n={m['n']})")
        else:
            print(f"{s}: no examples")
    if not a.out:
        print(text[:4000])


if __name__ == "__main__":
    main()
