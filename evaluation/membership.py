"""Predeclared E7 fixed-neighbour diagnostic; synthetic simulation, never publication."""
from pathlib import Path
import hashlib
import importlib.metadata as metadata
import json
import math
from fractions import Fraction
import subprocess
import numpy as np
from scipy.stats import rankdata
from pipeline.mobility import CAPS, EPS, load, prepare
from pipeline.artifact import encode

ROOT = Path('TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026')
SEED, CALIBRATION, TEST = 20261106, 4000, 10000
RATES = {f: Fraction(str(EPS[f])) / CAPS[f] for f in CAPS}
DENOMINATOR = math.lcm(*(r.denominator for r in RATES.values()))


def auc(negative, positive):
    ranks = rankdata(np.concatenate([negative, positive]), method='average')
    n, m = len(negative), len(positive)
    return float((ranks[n:].sum() - m * (m + 1) / 2) / (m * n))


def rate(successes, n):
    z = 1.959963984540054
    p = successes / n
    centre = (p + z*z/(2*n)) / (1 + z*z/n)
    radius = z * math.sqrt(p*(1-p)/n + z*z/(4*n*n)) / (1 + z*z/n)
    return {'successes': int(successes), 'trials': n, 'rate': p,
            'wilson_95': [max(0., centre-radius), min(1., centre+radius)]}


def scores(rng, vector, scales, weights, present, n):
    # Difference of geometric variables has pmf proportional to exp(-abs(z)/scale).
    p = -np.expm1(-1 / scales)
    noise = rng.geometric(p, size=(n, len(vector))) - rng.geometric(p, size=(n, len(vector)))
    y = noise + (vector if present else 0)
    # The policy has rational inverse scales. Sum integer numerators first so
    # mathematically identical scores remain ties for AUC and thresholding.
    return ((np.abs(y) - np.abs(y-vector)) * weights).sum(axis=1) / DENOMINATOR


def main():
    assert auc(np.array([0, 1]), np.array([2, 3])) == 1
    assert auc(np.array([0, 0]), np.array([0, 0])) == .5
    taps, stops = load(ROOT / 'data/mobility')
    selected = sorted(taps.card_id.unique(), key=lambda c: hashlib.sha256(('routesafe-e7-v1:'+c).encode()).digest())[:3]
    rng = np.random.Generator(np.random.PCG64(SEED))
    results = []
    for index, card in enumerate(selected, 1):
        _, _, bounded, _ = prepare(taps[taps.card_id == card].copy(), stops)
        totals = {f: int(v.sum()) for f, v in bounded.items()}
        assert all(0 <= totals[f] <= CAPS[f] for f in CAPS)
        vector = np.concatenate([v[v != 0] for v in bounded.values()])
        scales = np.concatenate([np.full(np.count_nonzero(v), CAPS[f]/EPS[f]) for f, v in bounded.items()])
        weights = np.concatenate([np.full(np.count_nonzero(v), int(RATES[f]*DENOMINATOR), dtype=np.int64) for f, v in bounded.items()])
        effective_epsilon = float((vector*weights).sum() / DENOMINATOR)
        calibration = scores(rng, vector, scales, weights, False, CALIBRATION)
        threshold = float(np.quantile(calibration, .99, method='higher'))
        negative = scores(rng, vector, scales, weights, False, TEST)
        positive = scores(rng, vector, scales, weights, True, TEST)
        maximum = float(max(np.abs(calibration).max(), np.abs(negative).max(), np.abs(positive).max()))
        assert maximum <= effective_epsilon + 1e-10 and effective_epsilon <= 1 + 1e-10
        result = {'target_index': index, 'bounded_totals': totals, 'affected_coordinates': len(vector),
                  'effective_epsilon': effective_epsilon, 'maximum_observed_absolute_log_likelihood_ratio': maximum,
                  'calibration_threshold': threshold, 'auc': auc(negative, positive),
                  'false_positive': rate(int((negative > threshold).sum()), TEST),
                  'true_positive': rate(int((positive > threshold).sum()), TEST)}
        results.append(result)
        print(json.dumps(result), flush=True)
    protocol = Path('evaluation/E7_PROTOCOL.md')
    report = {'experiment': 'E7 fixed-neighbour membership likelihood-ratio diagnostic',
              'data_class': 'supplied_synthetic', 'status': 'executed; pending independent review',
              'command': 'python -m evaluation.membership', 'seed': SEED,
              'likelihood_score_arithmetic': 'integer numerator with common denominator '+str(DENOMINATOR)+'; exact policy-rational ties',
              'calibration_absent_per_target': CALIBRATION, 'test_per_hypothesis_per_target': TEST,
              'protocol_sha256': hashlib.sha256(protocol.read_bytes()).hexdigest(),
              'evaluator_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'git_head_at_run': subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
              'versions': {k: metadata.version(k) for k in ['numpy','scipy','pandas']},
              'results': results,
              'limitations': ['Simulated neighbouring outputs, not repeated attacks on the single committed artifact.',
                              'Exact discrete-Laplace law simulated with geometric differences, not OpenDP publisher execution.',
                              'All other contributions and target bounded history are known; fixed-pair hypotheses only.',
                              'Three preselected synthetic targets do not cover all users or attacks.',
                              'Low AUC does not prove privacy; finite sample estimates are not universal bounds.',
                              'No new publication, privacy spend, policy retuning or ledger operation.']}
    Path('evidence/e7').mkdir(exist_ok=True)
    Path('evidence/e7/membership.json').write_bytes(encode(report))


if __name__ == '__main__':
    main()
