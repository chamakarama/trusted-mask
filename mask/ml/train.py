"""Train the Mask recipe selector (goal-conditioned masked softmax).

  python3 -I ml/train.py --data ml/data --out ml/runs [--config cfg.json] [--l2 1e-3] [--epochs 800] [--lr 0.05]
                         [--hidden 0] [--seed 0] [--ablate-goal] [--no-embedding] [--limit N] [--run-id ID]
                         [--no-compare]

Trains on split=train, early-stops on split=val (weighted soft-target CE), fits the softmax temperature on val,
evaluates on val and test. hidden=0 (multinomial logistic regression) writes model.json in the exact
contracts/model.ts ModelArtifact shape; hidden>0 (one-hidden-layer MLP) is evaluated for comparison only, because the
v1 artifact contract is linear. Unless --no-compare, also trains the goal-agnostic ablation with the same config and
reports it with the fixed policy and a class-prior baseline.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I does not add the script directory

import numpy as np  # noqa: E402

import mask_ml as M  # noqa: E402

DEFAULTS = {"l2": 1e-3, "epochs": 800, "lr": 0.05, "hidden": 0, "seed": 0, "patience": 60, "chosenMass": 0.7,
            "ablateGoal": False, "noEmbedding": False, "limit": None}


def parse() -> tuple[dict, argparse.Namespace]:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"))
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "runs"))
    ap.add_argument("--config")
    ap.add_argument("--run-id")
    ap.add_argument("--l2", type=float)
    ap.add_argument("--epochs", type=int)
    ap.add_argument("--lr", type=float)
    ap.add_argument("--hidden", type=int)
    ap.add_argument("--seed", type=int)
    ap.add_argument("--patience", type=int)
    ap.add_argument("--chosen-mass", type=float, dest="chosenMass")
    ap.add_argument("--limit", type=int, help="use at most N examples per split (smoke runs)")
    ap.add_argument("--ablate-goal", action="store_true", dest="ablateGoal", help="drop goal.* and x.* features (goal-agnostic baseline)")
    ap.add_argument("--no-embedding", action="store_true", dest="noEmbedding", help="drop goal.emb.* features")
    ap.add_argument("--no-compare", action="store_true", dest="noCompare")
    a = ap.parse_args()
    cfg = dict(DEFAULTS)
    if a.config:
        with open(a.config) as f:
            cfg.update(json.load(f))
    for k in DEFAULTS:
        v = getattr(a, k, None)
        if v not in (None, False):
            cfg[k] = v
    return cfg, a


def feature_subset(d: M.Data, train_idx: np.ndarray, cfg: dict) -> list[str]:
    """Drop ablated groups and features that are zero on every training example (their weights would be 0)."""
    nz = np.abs(d.X[train_idx]).sum(0) > 0
    keep = []
    for i, n in enumerate(d.feature_names):
        if not nz[i]:
            continue
        if cfg["ablateGoal"] and M.goal_feature(n):
            continue
        if cfg["noEmbedding"] and n.startswith("goal.emb:"):
            continue
        keep.append(n)
    return keep


def fit(d_all: M.Data, cfg: dict, log=print):
    tr, va, te = (M.split_indices(d_all, s, cfg["limit"]) for s in ("train", "val", "test"))
    if len(tr) == 0:
        raise SystemExit("no training examples (split=train)")
    names = feature_subset(d_all, tr, cfg)
    d = d_all.select_features(names)
    train, val, test = d.subset(tr), d.subset(va), d.subset(te)
    log(f"  {len(names)} features, {len(d.classes)} classes; examples train {len(tr)} val {len(va)} test {len(te)}")
    model, info = M.train_model(train, val if len(va) else None, cfg, log)
    T = M.fit_temperature(model.logits(val.X), val) if len(va) else 1.0
    metrics = {s: M.model_metrics(model.logits(x.X), x, T) for s, x in (("train", train), ("val", val), ("test", test))}
    return model, names, T, info, metrics, (train, val, test)


def artifact(model, names, T, info, metrics, baselines, cfg, meta, run_id, counts, val_n, notes) -> dict:
    d_classes = meta["_classes"]
    emb = [n for n in names if n.startswith("goal.emb:")]
    embedder = meta.get("embedder")
    return {
        "version": 1,
        "modelId": f"mask-selector-{run_id}",
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "registryVersion": meta["registryVersion"],
        "featureSpec": {"version": meta["featureSpecVersion"], "baseFeatures": names},
        "embedding": ({"model": embedder["model"], "dims": int(embedder["dims"])} if (emb and isinstance(embedder, dict)) else None),
        "classes": [{"key": k, "recipeId": d_classes[k]["recipeId"], "params": d_classes[k]["params"]} for k in meta["_classOrder"]],
        "weights": [[round(float(w), 6) for w in row] for row in model.p["W"]],
        "bias": [round(float(b), 6) for b in model.p["b"]],
        "calibration": {"method": "temperature", "temperature": round(float(T), 6), "fittedOn": f"val ({val_n} examples)"} if val_n
        else {"method": "none", "temperature": 1.0, "fittedOn": "none"},
        "training": {
            "codeRevision": meta.get("codeRevision", "unknown"), "dataHash": meta["dataHash"], "splitHash": meta["splitHash"],
            "config": {**cfg, **{"bestEpoch": info["bestEpoch"], "epochsRun": info["epochsRun"]}},
            "examples": counts, "environment": M.environment(),
        },
        "evaluation": {"heldOut": {"split": "test", "test": strip(metrics["test"]), "validationForTuningOnly": strip(metrics["val"])},
                       "baselines": baselines, "notes": notes},
    }


def strip(m: dict) -> dict:
    return {k: v for k, v in m.items() if k not in ("confusionRecipe",)}


def summary_line(m: dict | None) -> str:
    if not m or not m.get("n"):
        return "n/a"
    s = f"top1 {m['top1']:.3f}, acceptable {m['acceptableHit']:.3f}, abstain {m['abstention']:.3f}"
    if "ece" in m:
        s += f", ECE {m['ece']:.3f}"
    return s + f" (n={m['n']}, labels={m.get('labels', '?')})"


def report(run_id, cfg, metrics, baselines, meta, T, info, names, notes, exportable) -> str:
    L = [f"# Mask selector run {run_id}", "",
         "Agreement below is agreement with **teacher labels** (agent annotations and benchmark-selected targets, split by source),",
         "not measured privacy or utility of the learned selector's own plans. Outcome evaluation of its plans is separate.", "",
         f"- model: {'multinomial logistic regression' if cfg['hidden'] == 0 else 'MLP hidden=' + str(cfg['hidden'])}"
         f"{' (goal-agnostic ablation)' if cfg['ablateGoal'] else ''}; features used: {len(names)}; temperature {T:.3f} (fitted on val)",
         f"- best epoch {info['bestEpoch']} of {info['epochsRun']}; data hash `{meta['dataHash'][:16]}`, split hash `{meta['splitHash'][:16]}`, "
         f"code `{meta.get('codeRevision', '?')}`",
         f"- model.json written: {'yes' if exportable else 'no (MLP is not representable in ModelArtifact v1)'}", "",
         "## Held-out comparison (frozen test split only)", "",
         "The test split is the held-out customer_service domain (ml/SPLITS.json). It was not used for training, early stopping,",
         "temperature fitting or any tuning. Only this table is a held-out result.", "",
         "| Selector | Test result |", "|---|---|",
         f"| learned | {summary_line(metrics['test'])} |"]
    for b, bm in baselines.items():
        L.append(f"| {b} | {summary_line(bm.get('test') if isinstance(bm, dict) else None)} |")
    L += ["", "## Label sources (reported separately)", "",
          "`annotation` = agreement with agent teacher labels; `benchmark` = agreement with targets selected from executed plans",
          "under ml/CONSTRAINTS.json. Neither is a privacy or utility outcome of the learned selector's own plans: those require",
          "running its proposals through the benchmark adapter (ml/bench).", "", "| Split | Source | n | top1 | acceptable |", "|---|---|---|---|---|"]
    for s in ("val", "test"):
        for src, v in metrics[s].get("bySource", {}).items():
            L.append(f"| {s} | {src} | {v['n']} | {v['top1']:.3f} | {v['acceptableHit']:.3f} |")
    L += ["", "## Validation (tuning data, not held out)", "", "| Selector | Val result |", "|---|---|",
          f"| learned | {summary_line(metrics['val'])} |"]
    for b, bm in baselines.items():
        L.append(f"| {b} | {summary_line(bm.get('val') if isinstance(bm, dict) else None)} |")
    for s in ("val", "test"):
        m = metrics[s]
        if not m.get("n"):
            continue
        L += ["", f"## {s}: breakdown", "", "| Group | n | top1 | acceptable |", "|---|---|---|---|"]
        for key in ("byDataset", "byScenario", "byUnitKind"):
            for g, v in m[key].items():
                L.append(f"| {g} | {v['n']} | {v['top1']:.3f} | {v['acceptableHit']:.3f} |")
        gs = m.get("goalSensitivity", {})
        if gs.get("unitsWithSeveralScenarios"):
            L += ["", f"Goal sensitivity ({gs['unitsWithSeveralScenarios']} units seen under several scenarios): teacher label changes for "
                  f"{gs['teacherChangesWithGoal']:.2f}, model choice changes for {gs['modelChangesWithGoal']:.2f}."]
        L += ["", "Recipe confusion (rows teacher, columns predicted):", "", "```", json.dumps(m["confusionRecipe"]["counts"], indent=1), "```"]
    L += ["", "## Notes", ""] + [f"- {n}" for n in notes]
    return "\n".join(L) + "\n"


def main():
    cfg, a = parse()
    with open(os.path.join(a.data, "meta.json")) as f:
        meta = json.load(f)
    d_all = M.load_data(a.data, cfg["chosenMass"])
    meta["_classes"] = d_all.class_params
    meta["_classOrder"] = d_all.classes
    actual = M.file_sha256(os.path.join(a.data, "examples.jsonl"))
    if actual != meta["dataHash"]:
        raise SystemExit(f"examples.jsonl hash {actual[:12]} does not match meta.json {meta['dataHash'][:12]}: re-run export_features")
    run_id = a.run_id or dt.datetime.now().strftime("%Y%m%d-%H%M%S") + f"-s{cfg['seed']}" + ("-mlp" if cfg["hidden"] else "") + ("-nogoal" if cfg["ablateGoal"] else "")
    out = os.path.join(a.out, run_id)
    os.makedirs(out, exist_ok=True)
    print(f"run {run_id}: training {'goal-agnostic ' if cfg['ablateGoal'] else ''}model")
    model, names, T, info, metrics, (train, val, test) = fit(d_all, cfg)

    baselines: dict = {}
    policy = M.load_policy(a.data)
    if policy:
        baselines["fixed policy"] = {s: M.policy_metrics(policy, x) for s, x in (("val", val), ("test", test))}
    baselines["class prior"] = {s: M.prior_metrics(train, x) for s, x in (("val", val), ("test", test))}
    if not a.noCompare and not cfg["ablateGoal"]:
        print("training goal-agnostic ablation for comparison")
        _, _, _, _, m_ng, _ = fit(d_all, {**cfg, "ablateGoal": True}, log=lambda *_: None)
        baselines["goal-agnostic"] = {"val": m_ng["val"], "test": m_ng["test"]}
    baselines_slim = {k: {s: (strip(v) if v else None) for s, v in b.items()} for k, b in baselines.items()}

    counts = {s: int(len(x.rows)) for s, x in (("train", train), ("val", val), ("test", test))}
    weak = sum(1 for r in train.rows if r.get("weak"))
    notes = [
        "Top-1/acceptable agreement is measured against teacher labels (agent annotations and benchmark-selected targets, reported separately by source), not privacy or utility outcomes of the learned selector's plans.",
        f"{weak} of {counts['train']} training examples come from weak (unreviewed or disputed) labels; weights: agreement/approved 1.0, unreviewed 0.6, disagreement 0.3, shared across goal variants.",
        "Test = held-out customer_service domain: never used for training, early stopping or temperature fitting.",
        "Preference is the model's ranking among valid candidates, not a probability of anonymity.",
        "Goal paraphrase variants of one scenario are not independent examples; per-label counts are reported as 'labels'.",
    ]
    exportable = cfg["hidden"] == 0
    metrics_out = {"runId": run_id, "config": cfg, "temperature": T, "training": info, "features": len(names),
                   "metrics": metrics, "baselines": baselines, "meta": {k: v for k, v in meta.items() if not k.startswith("_")}}
    with open(os.path.join(out, "metrics.json"), "w") as f:
        json.dump(metrics_out, f, indent=1, default=float)
    with open(os.path.join(out, "report.md"), "w") as f:
        f.write(report(run_id, cfg, metrics, baselines, meta, T, info, names, notes, exportable))
    if exportable:
        art = artifact(model, names, T, info, metrics, baselines_slim, cfg, meta, run_id, counts, len(val.rows), notes)
        with open(os.path.join(out, "model.json"), "w") as f:
            json.dump(art, f, default=float)
    print(f"val (tuning):     {summary_line(metrics['val'])}")
    print(f"test (held out):  {summary_line(metrics['test'])}")
    for k, b in baselines.items():
        print(f"{k:14s} test: {summary_line(b.get('test'))}")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
