"""Tests for AgenticPay AI negotiation orchestrator and bidding endpoints."""
import pytest
from app.modules.bidding.orchestrator import NegotiationOrchestrator


def test_agentic_orchestrator_sync_convergence():
    """Verify that NegotiationOrchestrator produces converging offers within limits."""
    orchestrator = NegotiationOrchestrator(
        hirer_target=1000.0,
        hirer_max=2000.0,
        worker_min=1200.0,
        worker_target=2500.0,
        job_category="plumber",
        job_description="Fix leaking bathroom pipe",
        max_rounds=5,
        converge_pkr=500.0,
    )

    outcome = orchestrator.run_negotiation_sync()

    assert outcome["status"] in ("agreed", "failed")
    assert outcome["engine_used"] in ("agenticpay_hf_local", "agenticpay_local")
    assert len(outcome["rounds"]) > 0

    first_round = outcome["rounds"][0]
    assert first_round["hirer_offer"] == 1000.0
    assert first_round["worker_offer"] == 2500.0
    assert first_round["hirer_message"] != ""
    assert first_round["worker_message"] != ""
    assert first_round["reasoning"] != ""

    if outcome["status"] == "agreed":
        assert outcome["final_price"] is not None
        assert 1000.0 <= outcome["final_price"] <= 2500.0


def test_agentic_bidding_endpoint_flow(client, hirer, worker):
    """Test start endpoint with use_agentic flag."""
    # Create a job with hirer user
    job_res = client.post(
        "/api/v1/jobs",
        json={
            "category": "electrician",
            "description": "Short circuit repair",
            "budget_target": 1500.0,
            "budget_max": 2500.0,
            "address": "Islamabad",
        },
        headers=hirer["headers"],
    )
    assert job_res.status_code == 201
    job_id = job_res.json()["id"]

    # Set rates on worker profile
    client.put(
        "/api/v1/profiles/me/worker",
        json={
            "category": "electrician",
            "rate_min": 1400.0,
            "rate_target": 2200.0,
        },
        headers=worker["headers"],
    )

    # Start bidding session with use_agentic=True
    bid_res = client.post(
        "/api/v1/bidding/start",
        json={
            "job_id": job_id,
            "worker_id": worker["id"],
            "use_agentic": True,
        },
        headers=hirer["headers"],
    )

    assert bid_res.status_code == 200
    session_data = bid_res.json()

    assert session_data["job_id"] == job_id
    assert session_data["status"] in ("agreed", "failed")
    assert len(session_data["rounds"]) > 0

    first_r = session_data["rounds"][0]
    assert "hirer_message" in first_r
    assert "worker_message" in first_r
