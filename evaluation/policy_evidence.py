"""Curate the saved, predeclared policy search without generating new draws."""
import math
from statistics import median


def curate(search):
    assert search['data_class'] == 'supplied_synthetic'
    runs = search['runs']
    assert [r['policy'] for r in runs] == search['specification']['menu']
    candidates = []
    for run in runs:
        draws = run['per_draw']
        assert len(draws) == run['draws'] == search['specification']['development_draws']
        for family, value in run['median_wape'].items():
            assert math.isclose(median(d['wape'][family] for d in draws), value, rel_tol=1e-12, abs_tol=1e-12)
        assert sum(d['overlap'] >= 2 and d['regret'] <= .1 for d in draws) == run['decision_pass_count']
        candidates.append({
            **run['policy'],
            'median_wape': run['median_wape'],
            'decision_pass_count': run['decision_pass_count'],
            'exact_top3_count': sum(d['overlap'] == 3 for d in draws),
            'draws': run['draws'],
            'meets_targets': run['meets_targets'],
        })
    return {
        'data_class': 'supplied_synthetic',
        'synthetic_evaluation_only': True,
        'candidates': candidates,
        'development_cards': search['development_cards'],
        'all_cards': search['all_cards'],
        'status': search['status'],
        'decision_target': 'at least 2 of 3 route overlap and demand regret at most 10%',
        'thresholds': search['specification']['thresholds'],
        'limitations': search['limitations'] + [
            'These are saved development-subset results, not the accuracy of the one full-data release.',
            'Matching the released setting does not make a development draw the published artifact.',
            'Municipality bars answer a coarser question and do not establish area-level accuracy.',
            'Decision-target success does not imply exact top-three equality.',
            'This curation performs no new noise draw, publication or budget-ledger operation.',
        ],
    }
