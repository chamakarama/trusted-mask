from math import exp
import pytest
from privacy.uncertainty import noise_radius,interval,sum_interval

@pytest.mark.parametrize('scale',[32/.6,64/.3,64/.1])
@pytest.mark.parametrize('alpha',[.05,.05/420])
def test_radius_bounds_discrete_laplace_tail(scale,alpha):
    r=noise_radius(scale,alpha)
    # Exact two-sided geometric tail P(|Z|>r), not a seeded simulation.
    q=exp(-1/scale)
    tail=2*q**(r+1)/(1+q)
    assert tail<=alpha

def test_simultaneous_and_sum_are_not_single_cell_bounds():
    marginal=interval(100,32/.6); simultaneous=interval(100,32/.6,comparisons=420)
    assert simultaneous['radius']>marginal['radius']
    combined=sum_interval([100,200],[32/.6,32/.6])
    assert combined['radius']>2*marginal['radius']
    assert interval(-10000,1.)['upper']==0
    with pytest.raises(ValueError):noise_radius(float('nan'))
