from __future__ import annotations

from app.repositories.simulations import SimulationRepository
from app.schemas.simulations import SimulationCreateRequest, SimulationRecord
from app.services.simulation import build_simulation


class SimulationNotFoundError(RuntimeError):
    pass


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
