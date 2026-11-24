"""Group-level uncertainty for the Lens release gate."""

from math import sqrt
from statistics import NormalDist

_Z_95 = NormalDist().inv_cdf(0.95)


def clean_group_lower95(clean_groups: int, accepted_groups: int) -> float | None:
    """One-sided Wilson bound for groups with no incorrect accepted result."""
    if not 0 <= clean_groups <= accepted_groups:
        raise ValueError("Clean groups must be a subset of accepted groups.")
    if not accepted_groups:
        return None
    if not clean_groups:
        return 0.0
    n = accepted_groups
    rate = clean_groups / n
    z2 = _Z_95 ** 2
    radius = _Z_95 * sqrt(rate * (1 - rate) / n + z2 / (4 * n * n))
    return (rate + z2 / (2 * n) - radius) / (1 + z2 / n)
