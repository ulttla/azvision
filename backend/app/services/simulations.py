from __future__ import annotations

from typing import Any

from app.repositories.simulations import SimulationRepository
from app.schemas.simulations import SimulationCreateRequest, SimulationFitResponse, SimulationRecord, SimulationTemplateResponse
from app.services.simulation import build_simulation


class SimulationNotFoundError(RuntimeError):
    pass


def _symbolic_name(resource_type: str, index: int) -> str:
    tail = resource_type.split("/")[-1] if resource_type else "resource"
    cleaned = "".join(char for char in tail.title() if char.isalnum())
    return f"resource{cleaned or 'Item'}{index + 1}"


def _resource_name(resource: dict[str, Any]) -> str:
    name = resource.get("name")
    if isinstance(name, str) and name:
        return name.split("/")[-1]
    resource_id = str(resource.get("id") or "")
    return resource_id.rstrip("/").split("/")[-1] if resource_id else "resource"


def _normalize_resource_type(value: str) -> str:
    return str(value or "").lower()


def _build_simulation_fit(
    simulation: SimulationRecord,
    resources: list[dict[str, Any]],
    *,
    mode: str | None = None,
    warning: str | None = None,
) -> SimulationFitResponse:
    resources_by_type: dict[str, list[dict[str, Any]]] = {}
    for resource in resources:
        resource_type = _normalize_resource_type(str(resource.get("type") or ""))
        if not resource_type:
            continue
        resources_by_type.setdefault(resource_type, []).append(resource)

    items = []
    for recommendation in simulation.recommended_resources:
        resource_type = _normalize_resource_type(recommendation.resource_type)
        existing = resources_by_type.get(resource_type, [])
        status = "covered" if existing else "missing"
        if existing:
            action = "Review existing resources for fit before adding a new one."
        elif recommendation.priority == "required":
            action = "Required in the simulated plan and not found in current inventory."
        else:
            action = "Not found in current inventory; evaluate whether this optional/recommended resource is needed."
        items.append(
            {
                "resource_type": recommendation.resource_type,
                "priority": recommendation.priority,
                "status": status,
                "existing_count": len(existing),
                "sample_existing_names": [_resource_name(item) for item in existing[:3]],
                "recommendation": action,
            }
        )

    covered_count = len([item for item in items if item["status"] == "covered"])
    missing_required_count = len([item for item in items if item["status"] == "missing" and item["priority"] == "required"])
    missing_recommended_count = len([item for item in items if item["status"] == "missing" and item["priority"] != "required"])
    return SimulationFitResponse(
        workspace_id=simulation.workspace_id,
        simulation_id=simulation.simulation_id,
        mode=mode,
        warning=warning,
        inventory_resource_count=len(resources),
        covered_count=covered_count,
        missing_required_count=missing_required_count,
        missing_recommended_count=missing_recommended_count,
        items=items,
    )


def _build_bicep_outline(simulation: SimulationRecord) -> SimulationTemplateResponse:
    resources = []
    lines = [
        "// AzVision generated Bicep outline",
        "// This is a planning skeleton, not a deployable template.",
        f"// Simulation: {simulation.simulation_id}",
        f"param location string = resourceGroup().location",
        "",
    ]

    for index, item in enumerate(simulation.recommended_resources):
        symbolic_name = _symbolic_name(item.resource_type, index)
        resources.append(
            {
                "resource_type": item.resource_type,
                "symbolic_name": symbolic_name,
                "name_hint": item.name_hint,
                "priority": item.priority,
            }
        )
        lines.extend(
            [
                f"// {item.priority}: {item.reason}",
                f"resource {symbolic_name} '{item.resource_type}@latest' = {{",
                f"  name: '{item.name_hint}'",
                "  location: location",
                "  // TODO: replace @latest with a pinned API version and fill required properties.",
                "  properties: {}",
                "}",
                "",
            ]
        )

    return SimulationTemplateResponse(
        workspace_id=simulation.workspace_id,
        simulation_id=simulation.simulation_id,
        content="\n".join(lines).rstrip() + "\n",
        resources=resources,
        warnings=[
            "Generated template is intentionally non-deployable until API versions, SKUs, dependencies, and required properties are validated.",
            "Use this outline as an IaC planning checklist, not as production deployment code.",
        ],
    )


class SimulationService:
    def __init__(self, repository: SimulationRepository | None = None):
        self.repository = repository or SimulationRepository()

    def create_simulation(self, workspace_id: str, payload: SimulationCreateRequest) -> SimulationRecord:
        simulation = build_simulation(payload.model_dump())
        record = self.repository.create(workspace_id, simulation)
        return SimulationRecord.model_validate(record)

    def list_simulations(self, workspace_id: str) -> list[SimulationRecord]:
        return [SimulationRecord.model_validate(item) for item in self.repository.list_by_workspace(workspace_id)]

    def get_simulation(self, workspace_id: str, simulation_id: str) -> SimulationRecord:
        simulation = self.repository.get(workspace_id, simulation_id)
        if simulation is None:
            raise SimulationNotFoundError(simulation_id)
        return SimulationRecord.model_validate(simulation)

    def get_simulation_template(self, workspace_id: str, simulation_id: str) -> SimulationTemplateResponse:
        simulation = self.get_simulation(workspace_id, simulation_id)
        return _build_bicep_outline(simulation)

    def compare_simulation_to_inventory(
        self,
        workspace_id: str,
        simulation_id: str,
        resources: list[dict[str, Any]],
        *,
        mode: str | None = None,
        warning: str | None = None,
    ) -> SimulationFitResponse:
        simulation = self.get_simulation(workspace_id, simulation_id)
        return _build_simulation_fit(simulation, resources, mode=mode, warning=warning)
