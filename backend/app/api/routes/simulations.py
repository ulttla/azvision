from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.collectors.azure_inventory import resolve_resource_items
from app.core.config import get_settings
from app.schemas.simulations import SimulationCreateRequest, SimulationDeleteResponse, SimulationFitResponse, SimulationListResponse, SimulationRecord, SimulationReportResponse, SimulationTemplateResponse
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


@router.delete("/{simulation_id}", response_model=SimulationDeleteResponse)
def delete_simulation(workspace_id: str, simulation_id: str) -> SimulationDeleteResponse:
    try:
        service.delete_simulation(workspace_id, simulation_id)
    except SimulationNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Simulation not found") from exc
    return SimulationDeleteResponse(workspace_id=workspace_id, simulation_id=simulation_id)


@router.get("/{simulation_id}/template", response_model=SimulationTemplateResponse)
def get_simulation_template(workspace_id: str, simulation_id: str) -> SimulationTemplateResponse:
    try:
        return service.get_simulation_template(workspace_id, simulation_id)
    except SimulationNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Simulation not found") from exc


@router.get("/{simulation_id}/report", response_model=SimulationReportResponse)
def get_simulation_report(workspace_id: str, simulation_id: str) -> SimulationReportResponse:
    try:
        return service.get_simulation_report(workspace_id, simulation_id)
    except SimulationNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Simulation not found") from exc


@router.get("/{simulation_id}/fit", response_model=SimulationFitResponse)
def get_simulation_fit(
    workspace_id: str,
    simulation_id: str,
    subscription_id: str | None = Query(default=None),
    resource_group_name: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
) -> SimulationFitResponse:
    settings = get_settings()
    resolution = resolve_resource_items(
        settings,
        subscription_id=subscription_id,
        resource_group_name=resource_group_name,
        limit=limit,
    )
    try:
        return service.compare_simulation_to_inventory(
            workspace_id,
            simulation_id,
            resolution.items,
            mode=resolution.mode,
            warning=resolution.warning,
        )
    except SimulationNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Simulation not found") from exc
