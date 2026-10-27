"""Stress-test regression suite (STRESS round, Oct 2026).

Every test here guards a concurrency or hardening fix found by hammering
the live server: shield-buy TOCTOU, sitter-water brake TOCTOU, quiz-id
duplication, above-cap watering, species-query bounding, and the
once-per-day / triage-coherence races. All tests restore shared
in-memory state they mutate, because the app uses a process-global
plant store.
"""
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

import main
from data.seed_10k_species import SPECIES
from services.timeseries_vpd import pot_factor

client = TestClient(main.app)


def _plant(pid):
    return main.PLANTS[pid]


def _save(pid):
    p = _plant(pid)
    return {
        "hp": p.hp, "xp": p.xp, "level": p.level, "streak_days": p.streak_days,
        "moisture_pct": p.moisture_pct, "mulch_shields": p.mulch_shields,
        "next_water_iso": p.next_water_iso,
        "watering_interval_days": p.watering_interval_days,
        "last_watered_date": p.last_watered_date,
        "history": list(p.history),
        # Telemetry + brake state: a leaked vpd_kpa once tripped the
        # root-rot brake mid-race in this suite (see test_fixes _save).
        "vpd_kpa": p.vpd_kpa, "lux": p.lux,
        "watering_locked": p.watering_locked, "lock_reason": p.lock_reason,
    }


def _hermetic_unlocked(pid):
    """Reset brake-relevant telemetry so a race never depends on
    leaked suite state: healthy VPD/lux, brake disengaged."""
    p = _plant(pid)
    p.vpd_kpa, p.lux = 1.1, 2500.0
    p.watering_locked, p.lock_reason = False, None


def _restore(pid, snap):
    p = _plant(pid)
    for k, v in snap.items():
        setattr(p, k, v)


def _barrier_threads(n, fn):
    """Run fn() on n threads released simultaneously; return results."""
    barrier = threading.Barrier(n)
    results = []

    def run():
        barrier.wait(timeout=10)
        results.append(fn())

    threads = [threading.Thread(target=run) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return results


def test_shield_buy_never_negative_under_concurrency():
    """STRESS FIX: affordability check used to run outside _STORE_LOCK,
    so concurrent buyers could all pass and drive XP negative. Now the
    check and the deduction are atomic: 8 buyers at 620 XP must yield
    exactly 6 successes, XP 20, shields 8, level still 4."""
    snap = _save("serpentina-snake")
    try:
        for _ in range(3):
            p = _plant("serpentina-snake")
            p.xp, p.mulch_shields, p.level = 620, 2, 4

            def buy():
                with TestClient(main.app) as c:
                    return c.post("/api/v1/plants/serpentina-snake/shield/buy").json()

            results = _barrier_threads(8, buy)
            assert sum(1 for r in results if r["success"]) == 6
            assert _plant("serpentina-snake").xp == 20
            assert _plant("serpentina-snake").mulch_shields == 8
            assert _plant("serpentina-snake").level == 4
    finally:
        _restore("serpentina-snake", snap)


def test_sitter_water_locked_stays_blocked_under_concurrency():
    """Locked plants must refuse every concurrent sitter watering and
    award no sitter XP (Callie is brake-locked by default)."""
    snap = _save("callie-calathea")
    try:
        token = client.post("/api/v1/plants/callie-calathea/sitter").json()["sitter_token"]

        def water():
            with TestClient(main.app) as c:
                return c.post("/api/v1/sitter/callie-calathea/water",
                              json={"token": token})

        results = _barrier_threads(10, water)
        assert all(r.status_code == 200 and r.json()["watered"] is False for r in results)
        assert all(r.json()["sitter_xp_awarded"] == 0 for r in results)
        view = client.get(f"/api/v1/sitter/callie-calathea?token={token}").json()
        assert view["sitter_xp"] == 0
    finally:
        _restore("callie-calathea", snap)
        main.SITTER_XP["callie-calathea"] = 0


def test_quiz_ids_unique_under_concurrency():
    """STRESS FIX: the quiz counter used to increment outside the lock,
    so concurrent callers could mint duplicate quiz_ids. 20 simultaneous
    fetches must yield 20 distinct ids."""

    def fetch():
        with TestClient(main.app) as c:
            return c.get("/api/v1/quiz").json()["quiz_id"]

    ids = _barrier_threads(20, fetch)
    assert len(set(ids)) == 20


def test_watering_never_pushes_overwatered_plant_higher():
    """STRESS FIX: watering a plant already above its species cap used
    to push moisture HIGHER (uncapped branch). Now it holds flat at the
    current level; watering below the cap still tops up to the cap."""
    snap = _save("monty-monstera")
    try:
        sp = next(s for s in SPECIES if s.scientific_name == "Monstera deliciosa")
        cap = sp.max_soil_moisture_pct + 10.0
        p = _plant("monty-monstera")
        _hermetic_unlocked("monty-monstera")
        p.moisture_pct = cap + 5.0
        p.last_watered_date = None
        resp = client.post("/api/v1/plants/monty-monstera/water").json()
        assert resp["watered"] is True
        assert _plant("monty-monstera").moisture_pct == cap + 5.0
        p.moisture_pct = cap - 15.0
        p.last_watered_date = None
        expected = min(cap - 15.0 + 25.0 * pot_factor(p.pot_material), cap)
        client.post("/api/v1/plants/monty-monstera/water")
        assert _plant("monty-monstera").moisture_pct == expected
    finally:
        _restore("monty-monstera", snap)


def test_species_query_too_long_400():
    """STRESS FIX: species search work is O(docs x tokens); bound it."""
    assert client.get("/api/v1/species", params={"q": "x" * 2001}).status_code == 400
    assert client.get("/api/v1/species", params={"q": "x" * 2000}).status_code == 200


def test_concurrent_water_single_credit():
    """Once-per-day guard under concurrency: 20 simultaneous waters must
    credit exactly one +20 XP and one streak day."""
    snap = _save("monty-monstera")
    try:
        p = _plant("monty-monstera")
        p.last_watered_date = None
        _hermetic_unlocked("monty-monstera")
        xp0, streak0 = p.xp, p.streak_days

        def water():
            with TestClient(main.app) as c:
                return c.post("/api/v1/plants/monty-monstera/water").json()

        results = _barrier_threads(20, water)
        assert sum(1 for r in results if "+20 XP" in r["message"]) == 1
        assert sum(1 for r in results if "already watered today" in r["message"]) == 19
        assert _plant("monty-monstera").xp == xp0 + 20
        assert _plant("monty-monstera").streak_days == streak0 + 1
    finally:
        _restore("monty-monstera", snap)


def test_concurrent_triage_schedule_coherent():
    """Concurrent triages on one plant must all succeed with 6 steps and
    leave a stored schedule equal to one of the proposed values.
    (6, not 5: the botanical-engine pathology step was added to triage
    after the stress round; the concurrency assertions are unchanged.)"""
    snap = _save("monty-monstera")
    try:
        _hermetic_unlocked("monty-monstera")

        def triage():
            with TestClient(main.app) as c:
                return c.post("/api/v1/agent/triage", json={"plant_id": "monty-monstera"})

        results = _barrier_threads(10, triage)
        assert all(r.status_code == 200 for r in results)
        bodies = [r.json() for r in results]
        assert all(len(b["agent_trace"]) == 6 for b in bodies)
        proposed = {b["actions"]["next_water_iso"] for b in bodies}
        assert _plant("monty-monstera").next_water_iso in proposed
    finally:
        _restore("monty-monstera", snap)
