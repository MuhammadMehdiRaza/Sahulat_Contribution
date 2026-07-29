"""Deterministic bilateral concession engine (Boulware vs. Conceder).

Pure function, no I/O, no LLM — cheap, deterministic, auditable, unit-testable.
Mirrors the LangGraph negotiation workflow in the project brief; can be wrapped in
LangGraph's MemorySaver for checkpointed resumability without changing the math.

    beta(t) = (t/T)^kappa
    hirer offer  p_H(t) = target_H + beta_H(t) * (max_H  - target_H)   # rises toward max
    worker offer p_W(t) = target_W - beta_W(t) * (target_W - min_W)    # falls toward min

Convergence when |p_W - p_H| <= converge_pkr (or the offers cross); settle at the
midpoint of the two converging offers ("average of the last two offers").
"""
from typing import Optional, TypedDict


class Round(TypedDict):
    round_no: int
    hirer_offer: float
    worker_offer: float
    gap: float
    converged: bool


class Outcome(TypedDict):
    status: str            # "agreed" | "failed"
    final_price: Optional[float]
    rounds: list


def _beta(t: int, T: int, kappa: float) -> float:
    return (t / T) ** kappa


def run_negotiation(
    *, hirer_target: float, hirer_max: float, worker_min: float, worker_target: float,
    max_rounds: int = 5, converge_pkr: float = 500.0,
    kappa_hirer: float = 1 / 1.5, kappa_worker: float = 1 / 0.8,
) -> Outcome:
    T = max_rounds if max_rounds and max_rounds > 0 else 5
    rounds: list = []
    status, final_price = "failed", None

    for t in range(0, T + 1):
        bH = _beta(t, T, kappa_hirer)
        bW = _beta(t, T, kappa_worker)
        p_h = hirer_target + bH * (hirer_max - hirer_target)
        p_w = worker_target - bW * (worker_target - worker_min)
        gap = p_w - p_h
        converged = abs(gap) <= converge_pkr or p_h >= p_w
        rounds.append(Round(round_no=t, hirer_offer=round(p_h, 2), worker_offer=round(p_w, 2),
                            gap=round(abs(gap), 2), converged=converged))
        if converged:
            status, final_price = "agreed", round((p_h + p_w) / 2, 2)
            break

    return Outcome(status=status, final_price=final_price, rounds=rounds)
