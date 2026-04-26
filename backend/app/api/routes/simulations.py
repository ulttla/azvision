from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.simulations import SimulationCreateRequest, SimulationListResponse, SimulationRecord
from app.services.simulations import SimulationNotFoundError, SimulationService

router = APIRouter(prefix="/workspaces/{workspace_id}/simulations", tags=["simulations"])
service = SimulationService()


@router.post("", response_model=SimulationRecord)
def create_simulation(workspace_id: str, payload: SimulationCreateRequest) -> SimulationRecord:
    return service.create_simulation(workspace_id, payload)


@router.get("", response_model=SimulationListResponse)
def list_simulations(workspace_id: str) -> SimulationListResponse:
    return SimulationListResponse(workspace_id=workspace_id, items=service.list_simulations(workspace_id))


@router.get("/{simulation_id}", response_model=SimulationRecord)
def get_simulation(workspace_id: str, simulation_id: str) -> SimulationRecord:
    try:
        return service.get_simulation(workspace_id, simulation_id)
    except SimulationNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Simulation not found") from exc
