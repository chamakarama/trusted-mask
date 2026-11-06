"""OpenDP integer vector Laplace. Custom preprocessing proof is separately reviewed."""
import opendp.prelude as dp
from pipeline.mobility import CAPS, EPS

def measurement(family):
    dp.enable_features('contrib')
    m=dp.m.make_laplace(dp.vector_domain(dp.atom_domain(T=int)), dp.l1_distance(T=int),scale=CAPS[family]/EPS[family])
    if not m.check(CAPS[family],EPS[family]): raise ValueError('PRIVACY_MAP_FAILED')
    return m

def draw(vectors):
    return {f:measurement(f)([int(x) for x in v]) for f,v in vectors.items()}
