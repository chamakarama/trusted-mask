import numpy as np
from pipeline.planning_task import area_counts,task_score,evaluate_areas


def test_signed_sums_include_self_and_respect_direction_and_band():
    domain=[('A','A','06-09'),('B','A','06-09'),('A','B','06-09'),('A','A','15-18')]
    values=np.array([100,-80,50,900])
    areas,count=area_counts(values,domain,'06-09')
    assert areas==['A','B'] and count.tolist()==[20,50]
    assert area_counts(values,domain,'06-09','starts')[1].tolist()==[150,-80]
    assert area_counts(values,domain,'15-18')[1].tolist()==[900,0]


def test_no_demand_is_undefined_not_success():
    s=task_score(np.zeros(4),np.array([100,-100,20,10]),list('ABCD'))
    assert s['wape'] is None and s['regret'] is None and not s['pass']
    assert s['status']=='no_reference_demand'


def test_equal_demand_can_have_zero_regret_without_matching_arbitrary_ties():
    s=task_score(np.array([10]*6),np.arange(6),list('ABCDEF'))
    assert s['regret']==0 and s['top3_overlap']==0 and not s['pass']


def test_regret_rejects_bad_selection_even_with_two_matches():
    s=task_score(np.array([100,99,98,1]),np.array([100,99,-1,10]),list('ABCD'))
    assert s['top3_overlap']==2 and s['regret']>.1 and not s['pass']
