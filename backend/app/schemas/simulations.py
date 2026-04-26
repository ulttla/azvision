from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

SIMULATION_TEXT_MAX_LENGTH = 4000
SIMULATION_NAME_MAX_LENGTH = 120


class SimulationCreateRequest(BaseModel):
    workload_name: str = Field(default="workload", max_length=SIMULATION_NAME_MAX_LENGTH)
    environment: str = Field(default="dev", max_length=80)
    description: str = Field(default="", max_length=SIMULATION_TEXT_MAX_LENGTH)
    message: str = Field(default="", max_length=SIMULATION_TEXT_MAX_LENGTH)

    @field_validator("workload_name", "environment", "description", "message", mode="before")
    @classmethod
    def _normalize_strings(cls, value: object) -> str:
        return str(value or "").strip()


class SimulationResourceRecommendation(BaseModel):
    resource_type: str
    name_hint: str
    reason: str
    priority: str


class SimulationRecord(BaseModel):
    ok: bool = True
    simulation_id: str
    workspace_id: str
    created_at: str
    status: str
    mode: str
    workload_name: str
    environment: str
    description: str
    matched_rules: list[str] = Field(default_factory=list)
    recommended_resources: list[SimulationResourceRecommendation] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)


class SimulationListResponse(BaseModel):
    ok: bool = True
    workspace_id: str
    items: list[SimulationRecord]
