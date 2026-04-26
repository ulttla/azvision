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
    architecture_notes: list[str] = Field(default_factory=list)
    cost_considerations: list[str] = Field(default_factory=list)
    security_considerations: list[str] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)


class SimulationTemplateResource(BaseModel):
    resource_type: str
    symbolic_name: str
    name_hint: str
    priority: str


class SimulationTemplateResponse(BaseModel):
    ok: bool = True
    workspace_id: str
    simulation_id: str
    format: str = "bicep-outline"
    deployable: bool = False
    content: str
    resources: list[SimulationTemplateResource] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class SimulationFitResource(BaseModel):
    resource_type: str
    priority: str
    status: str
    existing_count: int = Field(default=0, ge=0)
    sample_existing_names: list[str] = Field(default_factory=list)
    recommendation: str


class SimulationFitResponse(BaseModel):
    ok: bool = True
    workspace_id: str
    simulation_id: str
    mode: str | None = None
    warning: str | None = None
    inventory_resource_count: int = Field(default=0, ge=0)
    covered_count: int = Field(default=0, ge=0)
    missing_required_count: int = Field(default=0, ge=0)
    missing_recommended_count: int = Field(default=0, ge=0)
    items: list[SimulationFitResource] = Field(default_factory=list)


class SimulationReportResponse(BaseModel):
    ok: bool = True
    workspace_id: str
    simulation_id: str
    report_type: str = "markdown"
    title: str
    content: str
    warnings: list[str] = Field(default_factory=list)


class SimulationListResponse(BaseModel):
    ok: bool = True
    workspace_id: str
    items: list[SimulationRecord]
