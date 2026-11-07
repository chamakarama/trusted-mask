"""Shared numpy code for training and evaluating the Mask recipe selector.

Model: logits = W[class] . x + b[class] (hidden=0, multinomial logistic regression) or a one-hidden-layer MLP.
Invalid candidates are masked before the softmax; the loss is cross-entropy on raw logits over valid classes with
soft targets (chosen 0.7, acceptable alternatives share 0.3; 1.0 on chosen when there are none).
Features are computed in TypeScript (scripts/labels/export_features.ts) and never recomputed here.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import platform
import sys
from dataclasses import dataclass, field

import numpy as np

NEG = -1e9
GOAL_PREFIXES = ("goal.", "x.")


# ---------------------------------------------------------------- data

@dataclass
class Data:
    feature_names: list[str]
    classes: list[str]
    class_params: dict[str, dict]
    X: np.ndarray            # N x F
    mask: np.ndarray         # N x C bool (valid candidate with a class)
    Q: np.ndarray            # N x C soft targets
    target: np.ndarray       # N int (chosen class)
    acceptable: list[set]    # per example: class indices accepted (chosen included)
    weight: np.ndarray       # N
    rows: list[dict]         # example metadata (no features)
    header: dict = field(default_factory=dict)

    def subset(self, idx: np.ndarray) -> "Data":
        return Data(self.feature_names, self.classes, self.class_params, self.X[idx], self.mask[idx], self.Q[idx], self.target[idx],
                    [self.acceptable[i] for i in idx], self.weight[idx], [self.rows[i] for i in idx], self.header)

    def select_features(self, names: list[str]) -> "Data":
        pos = {n: i for i, n in enumerate(self.feature_names)}
        cols = [pos[n] for n in names]
        return Data(list(names), self.classes, self.class_params, self.X[:, cols], self.mask, self.Q, self.target, self.acceptable,
                    self.weight, self.rows, self.header)


def soft_targets(chosen: int, acc: list[int], C: int, chosen_mass: float = 0.7) -> np.ndarray:
    q = np.zeros(C)
    acc = [a for a in acc if a != chosen]
    if acc:
        q[chosen] = chosen_mass
        q[acc] = (1.0 - chosen_mass) / len(acc)
    else:
        q[chosen] = 1.0
    return q


def load_data(data_dir: str, chosen_mass: float = 0.7) -> Data:
    ex_file = os.path.join(data_dir, "examples.jsonl")
    classes_file = os.path.join(data_dir, "classes.json")
    with open(classes_file) as f:
        class_entries = json.load(f)["classes"]
    class_params = {c["key"]: {"recipeId": c["recipeId"], "params": c["params"]} for c in class_entries}
    header = None
    rows, feats = [], []
    with open(ex_file) as f:
        for line in f:
            if not line.strip():
                continue
            o = json.loads(line)
            if o.get("type") == "header":
                header = o
                continue
            feats.append(o.pop("features"))
            rows.append(o)
    if header is None:
        raise SystemExit(f"{ex_file}: missing header line")
    classes = header["classes"]
    cidx = {k: i for i, k in enumerate(classes)}
    N, C = len(rows), len(classes)
    F = len(header["featureNames"])
    X = np.array(feats, dtype=np.float64).reshape(N, F)
    mask = np.zeros((N, C), dtype=bool)
    Q = np.zeros((N, C))
    target = np.zeros(N, dtype=np.int64)
    acceptable, weight = [], np.zeros(N)
    for n, r in enumerate(rows):
        for c in r["classes"]:
            if c["valid"]:
                mask[n, cidx[c["key"]]] = True
        t = cidx[r["target"]]
        acc = [cidx[k] for k in r.get("acceptable", []) if k in cidx and mask[n, cidx[k]]]
        if not mask[n, t]:
            raise SystemExit(f"{r['exampleId']}: target {r['target']} is not a valid candidate")
        target[n] = t
        Q[n] = soft_targets(t, acc, C, chosen_mass)
        acceptable.append(set(acc) | {t})
        weight[n] = float(r.get("weight", 1.0))
    return Data(header["featureNames"], classes, class_params, X, mask, Q, target, acceptable, weight, rows, header)


def split_indices(d: Data, split: str, limit: int | None = None) -> np.ndarray:
    idx = np.array([i for i, r in enumerate(d.rows) if r["split"] == split], dtype=np.int64)
    return idx[:limit] if limit else idx


def file_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------- model

class Model:
    """hidden == 0: logits = X W^T + b. hidden > 0: logits = relu(X A^T + a) V^T + v."""

    def __init__(self, F: int, C: int, hidden: int, rng: np.random.Generator):
        self.hidden = hidden
        if hidden == 0:
            self.p = {"W": np.zeros((C, F)), "b": np.zeros(C)}
        else:
            self.p = {"A": rng.normal(0, 1 / math.sqrt(max(F, 1)), (hidden, F)), "a": np.zeros(hidden),
                      "V": rng.normal(0, 1 / math.sqrt(hidden), (C, hidden)), "v": np.zeros(C)}

    def logits(self, X: np.ndarray) -> np.ndarray:
        if self.hidden == 0:
            return X @ self.p["W"].T + self.p["b"]
        H = np.maximum(X @ self.p["A"].T + self.p["a"], 0)
        return H @ self.p["V"].T + self.p["v"]

    def grads(self, X: np.ndarray, G: np.ndarray) -> dict:
        """G = dLoss/dlogits (N x C)."""
        if self.hidden == 0:
            return {"W": G.T @ X, "b": G.sum(0)}
        Z = X @ self.p["A"].T + self.p["a"]
        H = np.maximum(Z, 0)
        dH = (G @ self.p["V"]) * (Z > 0)
        return {"A": dH.T @ X, "a": dH.sum(0), "V": G.T @ H, "v": G.sum(0)}

    def copy(self) -> dict:
        return {k: v.copy() for k, v in self.p.items()}


def masked_softmax(Z: np.ndarray, mask: np.ndarray, T: float = 1.0) -> np.ndarray:
    Zm = np.where(mask, Z / T, NEG)
    Zm = Zm - Zm.max(1, keepdims=True)
    E = np.exp(Zm) * mask
    s = E.sum(1, keepdims=True)
    s[s == 0] = 1.0   # all-masked rows: zeros, caller treats as abstention
    return E / s


def loss_and_grad(model: Model, d: Data, l2: float):
    Z = model.logits(d.X)
    P = masked_softmax(Z, d.mask)
    w = d.weight / max(d.weight.sum(), 1e-12)
    logP = np.log(np.where(d.mask, P, 1.0) + 1e-300)
    loss = -(w[:, None] * d.Q * logP).sum()
    G = (P - d.Q) * w[:, None]          # CE gradient on raw logits; masked entries are 0 - 0
    g = model.grads(d.X, G)
    for k in ("W", "A", "V"):
        if k in model.p:
            loss += l2 * float((model.p[k] ** 2).sum())
            g[k] = g[k] + 2 * l2 * model.p[k]
    return float(loss), g


def train_model(train: Data, val: Data | None, cfg: dict, log=print) -> tuple[Model, dict]:
    rng = np.random.default_rng(cfg["seed"])
    model = Model(train.X.shape[1], len(train.classes), cfg["hidden"], rng)
    m = {k: np.zeros_like(v) for k, v in model.p.items()}
    s = {k: np.zeros_like(v) for k, v in model.p.items()}
    b1, b2, eps = 0.9, 0.999, 1e-8
    best, best_p, best_epoch, wait = math.inf, model.copy(), 0, 0
    history = []
    for epoch in range(1, cfg["epochs"] + 1):
        loss, g = loss_and_grad(model, train, cfg["l2"])
        for k in model.p:
            m[k] = b1 * m[k] + (1 - b1) * g[k]
            s[k] = b2 * s[k] + (1 - b2) * g[k] ** 2
            model.p[k] -= cfg["lr"] * (m[k] / (1 - b1 ** epoch)) / (np.sqrt(s[k] / (1 - b2 ** epoch)) + eps)
        vloss = weighted_nll(model.logits(val.X), val) if val is not None and len(val.rows) else loss
        history.append({"epoch": epoch, "train": loss, "val": vloss})
        if vloss < best - 1e-6:
            best, best_p, best_epoch, wait = vloss, model.copy(), epoch, 0
        else:
            wait += 1
            if wait >= cfg["patience"]:
                break
        if epoch % 50 == 0:
            log(f"  epoch {epoch}: train {loss:.4f} val {vloss:.4f}")
    model.p = best_p
    return model, {"bestEpoch": best_epoch, "bestValLoss": best, "epochsRun": len(history), "history": history[-5:]}


def weighted_nll(Z: np.ndarray, d: Data, T: float = 1.0) -> float:
    P = masked_softmax(Z, d.mask, T)
    w = d.weight / max(d.weight.sum(), 1e-12)
    logP = np.log(np.where(d.mask, P, 1.0) + 1e-300)
    return float(-(w[:, None] * d.Q * logP).sum())


def fit_temperature(Z: np.ndarray, d: Data) -> float:
    """Temperature minimising NLL of the chosen label on validation data (grid, then local refine)."""
    if len(d.rows) == 0:
        return 1.0

    def nll(T):
        P = masked_softmax(Z, d.mask, T)
        return float(-np.mean(np.log(P[np.arange(len(d.rows)), d.target] + 1e-300)))
    grid = np.exp(np.linspace(math.log(0.05), math.log(20), 121))
    T = float(min(grid, key=nll))
    for step in (1.05, 1.01):
        for _ in range(20):
            cand = [T / step, T, T * step]
            T = float(min(cand, key=nll))
    return T


# ---------------------------------------------------------------- evaluation

def predict(Z: np.ndarray, d: Data, T: float = 1.0):
    """Deterministic argmax over valid classes; ties go to the lower class key. Abstain (-1) if none valid."""
    key_rank = np.argsort(np.argsort(np.array(d.classes)))
    P = masked_softmax(Z, d.mask, T)
    pred = np.full(len(d.rows), -1, dtype=np.int64)
    for n in range(len(d.rows)):
        valid = np.where(d.mask[n])[0]
        if len(valid) == 0:
            continue
        zs = Z[n, valid]
        top = valid[zs >= zs.max() - 1e-12]
        pred[n] = int(top[np.argmin(key_rank[top])])
    conf = np.array([P[n, pred[n]] if pred[n] >= 0 else 0.0 for n in range(len(d.rows))])
    return pred, conf, P


def ece(conf: np.ndarray, correct: np.ndarray, bins: int = 10) -> float:
    if len(conf) == 0:
        return float("nan")
    e = 0.0
    edges = np.linspace(0, 1, bins + 1)
    for i in range(bins):
        sel = (conf > edges[i]) & (conf <= edges[i + 1]) if i else (conf >= 0) & (conf <= edges[1])
        if sel.any():
            e += sel.mean() * abs(conf[sel].mean() - correct[sel].mean())
    return float(e)


def choice_metrics(pred_keys: list, d: Data, conf: np.ndarray | None = None) -> dict:
    """Metrics for a list of predicted class keys (None = abstained) against teacher labels."""
    n = len(d.rows)
    if n == 0:
        return {"n": 0}
    tgt = [d.classes[t] for t in d.target]
    acc_sets = [{d.classes[i] for i in a} for a in d.acceptable]
    top1 = np.array([p == t for p, t in zip(pred_keys, tgt)], dtype=float)
    hit = np.array([p in a for p, a in zip(pred_keys, acc_sets)], dtype=float)
    abst = np.array([p is None for p in pred_keys], dtype=float)
    out = {"n": n, "labels": len({r["labelId"] for r in d.rows}), "top1": float(top1.mean()), "acceptableHit": float(hit.mean()),
           "abstention": float(abst.mean())}
    if conf is not None:
        out["ece"] = ece(conf, top1)
        out["meanPreference"] = float(conf.mean())
    out["byDataset"] = breakdown(d, top1, hit, "sourceGroup")
    out["byScenario"] = breakdown(d, top1, hit, "scenarioId")
    out["byUnitKind"] = breakdown(d, top1, hit, "unitKind")
    # label source kept apart: agreement with agent annotations vs with benchmark-selected targets
    out["bySource"] = breakdown(d, top1, hit, "source")
    conf_m: dict = {}
    for p, t in zip(pred_keys, tgt):
        pr = d.class_params.get(p, {}).get("recipeId", "abstain") if p else "abstain"
        tr = d.class_params[t]["recipeId"]
        conf_m.setdefault(tr, {}).setdefault(pr, 0)
        conf_m[tr][pr] += 1
    out["confusionRecipe"] = {"rows": "teacher recipe", "cols": "predicted recipe", "counts": conf_m}
    return out


def breakdown(d: Data, top1, hit, key: str) -> dict:
    groups: dict = {}
    for i, r in enumerate(d.rows):
        g = groups.setdefault(r.get(key, "annotation" if key == "source" else "?"), [0, 0.0, 0.0])
        g[0] += 1
        g[1] += top1[i]
        g[2] += hit[i]
    return {k: {"n": v[0], "top1": v[1] / v[0], "acceptableHit": v[2] / v[0]} for k, v in sorted(groups.items())}


def goal_sensitivity(pred_keys: list, d: Data) -> dict:
    """Same unit under different scenarios/goal texts: how often do predictions and teacher labels differ?"""
    by_unit: dict = {}
    for p, r, t in zip(pred_keys, d.rows, d.target):
        u = by_unit.setdefault((r["sourceGroup"], r["unitId"]), {"pred": set(), "teacher": set(), "scen": set()})
        u["pred"].add(p)
        u["teacher"].add(d.classes[t])
        u["scen"].add(r["scenarioId"])
    multi = [u for u in by_unit.values() if len(u["scen"]) > 1]
    if not multi:
        return {"units": 0}
    return {"unitsWithSeveralScenarios": len(multi),
            "teacherChangesWithGoal": sum(len(u["teacher"]) > 1 for u in multi) / len(multi),
            "modelChangesWithGoal": sum(len(u["pred"]) > 1 for u in multi) / len(multi)}


def model_metrics(Z: np.ndarray, d: Data, T: float) -> dict:
    pred, conf, P = predict(Z, d, T)
    keys = [d.classes[p] if p >= 0 else None for p in pred]
    out = choice_metrics(keys, d, conf)
    if len(d.rows):
        out["nllChosen"] = float(-np.mean(np.log(P[np.arange(len(d.rows)), d.target] + 1e-300)))
    out["goalSensitivity"] = goal_sensitivity(keys, d)
    return out


def load_policy(data_dir: str) -> dict:
    f = os.path.join(data_dir, "policy_baseline.jsonl")
    if not os.path.exists(f):
        return {}
    out = {}
    with open(f) as fh:
        for line in fh:
            if line.strip():
                o = json.loads(line)
                out[o["exampleId"]] = o.get("policyKey")
    return out


def policy_metrics(policy: dict, d: Data) -> dict | None:
    if not policy:
        return None
    keys = [policy.get(r["exampleId"]) for r in d.rows]
    if all(k is None for k in keys) and len(keys):
        return None
    out = choice_metrics(keys, d)
    out["goalSensitivity"] = goal_sensitivity(keys, d)
    return out


def prior_metrics(train: Data, d: Data) -> dict:
    """Goal- and data-agnostic prior: the most frequent training target among the unit's valid classes."""
    freq = np.bincount(train.target, minlength=len(train.classes)).astype(float)
    keys = []
    for n in range(len(d.rows)):
        valid = np.where(d.mask[n])[0]
        keys.append(d.classes[int(valid[np.argmax(freq[valid])])] if len(valid) else None)
    return choice_metrics(keys, d)


def environment() -> str:
    return f"python {sys.version.split()[0]}; numpy {np.__version__}; {platform.platform()}; cpu"


def goal_feature(name: str) -> bool:
    return name.startswith(GOAL_PREFIXES)
