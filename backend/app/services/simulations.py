from __future__ import annotations

from app.repositories.simulations import SimulationRepository
from app.schemas.simulations import SimulationCreateRequest, SimulationRecord, SimulationTemplateResponse
from app.services.simulation import build_simulation


class SimulationNotFoundError(RuntimeError):
    pass


def _symbolic_name(resource_type: str, index: int) -> str:
    tail = resource_type.split("/")[-1] if resource_type else "resource"
    cleaned = "".join(char for char in tail.title() if char.isalnum())
    return f"resource{cleaned or 'Item'}{index + 1}"


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
