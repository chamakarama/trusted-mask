"""Noise-only bounds as postprocessing; never intervals for true unbounded travel demand."""
from math import ceil,isfinite
from opendp.accuracy import discrete_laplacian_scale_to_accuracy

def noise_radius(scale:float,alpha:float=.05)->int:
    if not isfinite(scale) or scale<=0 or not 0<alpha<1:raise ValueError('INVALID_UNCERTAINTY_PARAMETERS')
    # OpenDP documents that floor preserves coverage; ceil adds conservatism.
    return ceil(discrete_laplacian_scale_to_accuracy(float(scale),float(alpha)))

def interval(signed_value:int,scale:float,*,comparisons:int=1,alpha:float=.05):
    if type(signed_value) is not int or type(comparisons) is not int or comparisons<1:raise ValueError('INVALID_UNCERTAINTY_PARAMETERS')
    radius=noise_radius(scale,alpha/comparisons)
    return {'lower':max(0,signed_value-radius),'upper':max(0,signed_value+radius),'radius':radius,'coverage_scope':'mechanism noise around bounded count only','comparisons':comparisons,'alpha':alpha}

def sum_interval(signed_values:list[int],scales:list[float],*,comparisons:int=1,alpha:float=.05):
    """Conservative union bound, valid without an independence assumption. Not a single-cell interval."""
    if not signed_values or len(signed_values)!=len(scales) or type(comparisons) is not int or comparisons<1:raise ValueError('INVALID_UNCERTAINTY_PARAMETERS')
    if any(type(v) is not int for v in signed_values):raise ValueError('INVALID_UNCERTAINTY_PARAMETERS')
    radius=sum(noise_radius(s,alpha/(len(scales)*comparisons)) for s in scales);centre=sum(signed_values)
    return {'lower':max(0,centre-radius),'upper':max(0,centre+radius),'radius':radius,'method':'union_bound_over_summed_cells_and_reported_comparisons','cells':len(scales),'comparisons':comparisons,'alpha':alpha,'coverage_scope':'mechanism noise around sum of bounded counts only'}
