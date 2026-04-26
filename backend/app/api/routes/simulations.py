from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from app.services.simulation import build_simulation

router = APIRouter(prefix="/workspaces/{workspace_id}/simulations", tags=["simulations"])

_SIMULATION_STORE: dict[str, list[dict[str, Any]]] = {}


@router.post("")
def create_simulation(workspace_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    simulation = build_simulation(payload)
    _SIMULATION_STORE.setdefault(workspace_id, []).insert(0, simulation)
    return {
        "ok": True,
        "workspace_id": workspace_id,
        **simulation,
    }


@router.get("")
def list_simulations(workspace_id: str) -> dict[str, Any]:
    return {
        "ok": True,
        "workspace_id": workspace_id,
        "items": _SIMULATION_STORE.get(workspace_id, []),
    }


@router.get("/{simulation_id}")
def get_simulation(workspace_id: str, simulation_id: str) -> dict[str, Any]:
    for simulation in _SIMULATION_STORE.get(workspace_id, []):
        if simulation.get("simulation_id") == simulation_id:
            return {
                "ok": True,
                "workspace_id": workspace_id,
                **simulation,
            }
    raise HTTPException(status_code=404, detail="Simulation not found")
