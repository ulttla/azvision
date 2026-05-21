from __future__ import annotations

import json
from collections import Counter
from typing import Any, Protocol
from urllib.parse import urljoin

import requests

from app.core.config import Settings
from app.services.cost_analysis import build_cost_recommendations

SECRET_KEY_PARTS = (
    "secret",
    "password",
    "token",
    "key",
    "credential",
    "thumbprint",
    "connectionstring",
    "privatekey",
    "private_key",
)
MAX_CONTEXT_STRING = 500


class CopilotProvider(Protocol):
    provider_name: str

    def answer(self, message: str, resources: list[dict[str, Any]], context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Return a normalized copilot answer payload."""


def _resource_type(resource: dict[str, Any]) -> str:
    return str(resource.get("type") or "unknown")


def _resource_name(resource: dict[str, Any]) -> str:
    name = resource.get("name")
    if isinstance(name, str) and name:
        return name.split("/")[-1]
    resource_id = str(resource.get("id") or "")
    return resource_id.rstrip("/").split("/")[-1] if resource_id else "resource"


def _resource_group(resource: dict[str, Any]) -> str:
    resource_id = str(resource.get("id") or "")
    parts = [part for part in resource_id.split("/") if part]
    lowered = [part.lower() for part in parts]
    if "resourcegroups" in lowered:
        index = lowered.index("resourcegroups")
        if index + 1 < len(parts):
            return parts[index + 1]
    value = resource.get("resource_group") or resource.get("resourceGroup")
    return str(value) if value else "unknown"


def _top_resource_types(resources: list[dict[str, Any]], limit: int = 5) -> list[str]:
    counts = Counter(_resource_type(resource) for resource in resources)
    return [f"{resource_type}: {count}" for resource_type, count in counts.most_common(limit)]


def _is_secret_key(key: str) -> bool:
    normalized = key.replace("_", "").replace("-", "").lower()
    return any(part in normalized for part in SECRET_KEY_PARTS)


def redact_copilot_value(value: Any, *, key: str = "", depth: int = 0) -> Any:
    if _is_secret_key(key):
        return "[redacted]"
    if depth >= 6:
        return "[truncated]"
    if isinstance(value, dict):
        return {str(item_key): redact_copilot_value(item_value, key=str(item_key), depth=depth + 1) for item_key, item_value in value.items()}
    if isinstance(value, list):
        return [redact_copilot_value(item, depth=depth + 1) for item in value[:20]]
    if isinstance(value, str):
        return value if len(value) <= MAX_CONTEXT_STRING else value[:MAX_CONTEXT_STRING] + "…[truncated]"
    return value


def _summarize_resource(resource: dict[str, Any]) -> dict[str, Any]:
    return redact_copilot_value(
        {
            "id": resource.get("id"),
            "name": _resource_name(resource),
            "type": _resource_type(resource),
            "resource_group": _resource_group(resource),
            "location": resource.get("location"),
            "tags": resource.get("tags") or {},
            "evidence": "observed",
        }
    )


def _view_context_metadata(current_view: str | None) -> dict[str, Any]:
    normalized = (current_view or "unknown").strip().lower()
    if normalized in {"architecture", "architecture-view"}:
        return {
            "view_kind": "architecture",
            "focus": "stage layout, service boundaries, topology flows, and architecture risks",
            "preferred_evidence": ["resource groups", "resource types", "locations", "explicit topology edges", "unknown or inferred relationships"],
            "answer_guidance": [
                "Call out unknowns separately from observed facts.",
                "Prefer diagram-reading and evidence-review checks over remediation steps.",
            ],
        }
    if normalized == "simulation":
        return {
            "view_kind": "simulation",
            "focus": "workload planning, recommended resources, fit checks, IaC draft review, and readiness gaps",
            "preferred_evidence": ["simulation recommendations", "existing inventory fit", "missing required resources", "assumptions", "IaC warnings"],
            "answer_guidance": [
                "Keep recommendations read-only and frame them as planning checks.",
                "Do not imply the draft template has been deployed or validated in Azure.",
            ],
        }
    if normalized == "topology":
        return {
            "view_kind": "topology",
            "focus": "graph relationships, connectivity evidence, path-analysis candidates, and network risk triage",
            "preferred_evidence": ["nodes", "edges", "source confidence", "NSG evidence", "route evidence"],
            "answer_guidance": ["Separate explicit Azure evidence from inferred relationships."],
        }
    if normalized in {"cost", "cost-insights"}:
        return {
            "view_kind": "cost-insights",
            "focus": "cost triage, governance gaps, and read-only optimization candidates",
            "preferred_evidence": ["cost recommendation rules", "resource type counts", "governance labels", "inventory scope"],
            "answer_guidance": ["Treat cost output as triage until Cost Management ingestion is configured."],
        }
    return {
        "view_kind": normalized or "unknown",
        "focus": "general inventory summary and read-only infrastructure Q&A",
        "preferred_evidence": ["resource inventory", "resource groups", "resource types"],
        "answer_guidance": ["Use only the summarized context and mark unknowns clearly."],
    }


def build_copilot_context(
    resources: list[dict[str, Any]],
    *,
    workspace_id: str | None = None,
    current_view: str | None = None,
    current_language: str | None = None,
    selected_resource_id: str | None = None,
    view_context: dict[str, Any] | None = None,
    max_resources: int = 8,
) -> dict[str, Any]:
    resource_groups = Counter(_resource_group(resource) for resource in resources)
    selected_resource = None
    if selected_resource_id:
        selected_resource = next((resource for resource in resources if str(resource.get("id") or "") == selected_resource_id), None)

    view_metadata = _view_context_metadata(current_view)

    return {
        "workspace_id": workspace_id or "unknown",
        "inventory_mode": "read-only-summary",
        "current_view": current_view or "unknown",
        "current_language": current_language or "en",
        "view_metadata": view_metadata,
        "facts_label": "observed unless marked unknown",
        "resource_count": len(resources),
        "resource_groups": [f"{name}: {count}" for name, count in resource_groups.most_common(8)],
        "top_resource_types": _top_resource_types(resources),
        "sample_resources": [_summarize_resource(resource) for resource in resources[:max_resources]],
        "selected_resource": _summarize_resource(selected_resource) if selected_resource else None,
        "view_context": redact_copilot_value(view_context or {}),
        "limits": {
            "read_only": True,
            "no_azure_write_or_remediation": True,
            "context_is_summarized": True,
            "view_specific_guidance": view_metadata["answer_guidance"],
        },
    }


def build_rule_based_copilot_answer(
    message: str,
    resources: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized = message.strip().lower()
    recommendations = build_cost_recommendations(resources)
    top_types = _top_resource_types(resources)

    if not normalized:
        normalized = "overview"

    cost_like = any(token in normalized for token in ("cost", "save", "saving", "cheap", "spend", "money", "비용", "절감"))
    network_like = any(token in normalized for token in ("network", "vnet", "subnet", "nsg", "route", "private", "네트워크"))
    path_like = any(token in normalized for token in ("path", "traffic", "reach", "reachable", "allowed", "blocked", "통신", "경로", "차단", "허용"))
    project_like = any(token in normalized for token in ("project", "add", "design", "resource", "구성", "추가", "프로젝트"))

    answer_lines = [
        "Rule-based copilot first pass. LLM provider integration is not configured in this build yet.",
        f"Current scope has {len(resources)} resources.",
    ]
    if top_types:
        answer_lines.append("Top resource types: " + "; ".join(top_types))
    if context and context.get("selected_resource"):
        selected = context["selected_resource"]
        answer_lines.append(f"Selected resource: {selected.get('name')} ({selected.get('type')}).")

    suggestions: list[str] = []
    if cost_like:
        high_or_medium = [item for item in recommendations if item.get("severity") in {"high", "medium"}]
        answer_lines.append(f"Cost triage found {len(recommendations)} rule-based recommendations.")
        for item in high_or_medium[:5]:
            suggestions.append(f"{item['resource_name']}: {item['title']}")

    if network_like:
        suggestions.extend(
            [
                "Turn on network inference only as a supplement; prefer azure-explicit edges when present.",
                "Check NSG, route table, NIC, subnet, private endpoint, and VM edge evidence before trusting the diagram.",
            ]
        )
        if path_like:
            suggestions.append(
                "Use the path-analysis endpoint with source_resource_id and destination_resource_id to get an allowed/blocked/unknown MVP verdict."
            )

    if project_like:
        suggestions.extend(
            [
                "Start with a target workload type, expected users/traffic, data sensitivity, and availability target.",
                "Then map required network, identity, compute, data, monitoring, and backup resources before estimating cost.",
            ]
        )

    if not suggestions:
        suggestions.extend(
            [
                "Review the topology and Cost Insights tabs first, then ask a narrower cost, network, or project-design question.",
                "Use explicit edge evidence for infrastructure understanding; use cost recommendations as triage prompts until Cost Management ingestion is added.",
            ]
        )

    return {
        "copilot_mode": "rule-based",
        "provider": "rule-based",
        "model": None,
        "llm_status": "not_configured",
        "answer": "\n".join(answer_lines),
        "suggestions": suggestions[:8],
        "context": context
        or {
            "resource_count": len(resources),
            "recommendation_count": len(recommendations),
            "top_resource_types": top_types,
        },
    }


def _build_llm_messages(message: str, context: dict[str, Any]) -> list[dict[str, str]]:
    current_language = str(context.get("current_language") or "en").strip().lower()
    language_instruction = "Respond in Korean unless the user explicitly asks for another language." if current_language == "ko" else "Respond in English unless the user explicitly asks for another language."
    view_focus = str((context.get("view_metadata") or {}).get("focus") or "general inventory summary")
    system_prompt = (
        "You are AzVision's read-only infrastructure copilot. Summarize observed evidence, risks, unknowns, "
        "and suggested next read-only checks. Do not propose Azure write/remediation actions, deployments, "
        "or secret exposure. Treat the provided context as summarized evidence, not a full environment dump. "
        f"Current view focus: {view_focus}. "
        + language_instruction
    )
    user_prompt = "Context JSON:\n" + json.dumps(context, ensure_ascii=False, indent=2) + "\n\nUser question:\n" + message
    return [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]


def _normalized_llm_answer(provider: str, model: str, content: str, context: dict[str, Any]) -> dict[str, Any]:
    return {
        "copilot_mode": "llm",
        "provider": provider,
        "model": model,
        "llm_status": "ok",
        "answer": content.strip(),
        "suggestions": [],
        "context": context,
    }


def _provider_error_fallback(provider: str, model: str, message: str, resources: list[dict[str, Any]], context: dict[str, Any]) -> dict[str, Any]:
    fallback = build_rule_based_copilot_answer(message, resources, context)
    fallback.update({"provider": "rule-based", "model": model or None, "llm_status": f"{provider}_provider_error"})
    current_language = str(context.get("current_language") or "en").strip().lower()
    fallback_notice = (
        f"{provider} 제공자를 사용할 수 없어 AzVision이 읽기 전용 규칙 기반 폴백을 사용했습니다."
        if current_language == "ko"
        else f"{provider} provider was unavailable, so AzVision used the read-only rule-based fallback."
    )
    fallback["answer"] = fallback_notice + "\n" + fallback["answer"]
    return fallback


class RuleBasedCopilotProvider:
    provider_name = "rule-based"

    def answer(self, message: str, resources: list[dict[str, Any]], context: dict[str, Any] | None = None) -> dict[str, Any]:
        return build_rule_based_copilot_answer(message, resources, context)


class OllamaCopilotProvider:
    provider_name = "ollama"

    def __init__(self, settings: Settings):
        self.base_url = settings.ollama_base_url.rstrip("/")
        self.model = settings.ollama_model

    @property
    def configured(self) -> bool:
        return bool(self.base_url.strip() and self.model.strip())

    def answer(self, message: str, resources: list[dict[str, Any]], context: dict[str, Any] | None = None) -> dict[str, Any]:
        context = context or build_copilot_context(resources)
        if not self.configured:
            return build_rule_based_copilot_answer(message, resources, context) | {"llm_status": "missing_config", "provider": "rule-based"}
        try:
            response = requests.post(
                urljoin(self.base_url + "/", "api/chat"),
                json={"model": self.model, "messages": _build_llm_messages(message, context), "stream": False},
                timeout=30,
            )
            response.raise_for_status()
            payload = response.json()
            content = str((payload.get("message") or {}).get("content") or payload.get("response") or "")
        except (requests.RequestException, ValueError):
            return _provider_error_fallback("ollama", self.model, message, resources, context)
        return _normalized_llm_answer("ollama", self.model, content, context)


class OpenRouterCopilotProvider:
    provider_name = "openrouter"

    def __init__(self, settings: Settings):
        self.base_url = settings.openrouter_base_url.rstrip("/")
        self.model = settings.openrouter_model
        self.api_key = settings.openrouter_api_key

    @property
    def configured(self) -> bool:
        return bool(self.base_url.strip() and self.model.strip() and self.api_key.strip())

    def answer(self, message: str, resources: list[dict[str, Any]], context: dict[str, Any] | None = None) -> dict[str, Any]:
        context = context or build_copilot_context(resources)
        if not self.configured:
            return build_rule_based_copilot_answer(message, resources, context) | {"llm_status": "missing_config", "provider": "rule-based"}
        try:
            response = requests.post(
                self.base_url + "/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json={"model": self.model, "messages": _build_llm_messages(message, context), "stream": False},
                timeout=45,
            )
            response.raise_for_status()
            payload = response.json()
            choices = payload.get("choices") or []
            content = ""
            if choices:
                content = str(((choices[0] or {}).get("message") or {}).get("content") or "")
        except (requests.RequestException, ValueError):
            return _provider_error_fallback("openrouter", self.model, message, resources, context)
        return _normalized_llm_answer("openrouter", self.model, content, context)


def _probe_ollama_connectivity(settings: Settings) -> str:
    """Probe Ollama endpoint health. Returns 'reachable', 'unreachable', or 'not_configured'."""
    if not settings.ollama_base_url.strip() or not settings.ollama_model.strip():
        return "not_configured"
    try:
        response = requests.get(urljoin(settings.ollama_base_url.rstrip("/") + "/", "api/tags"), timeout=5)
        response.raise_for_status()
        return "reachable"
    except Exception:
        return "unreachable"


def _probe_openrouter_connectivity(settings: Settings) -> str:
    """Probe OpenRouter API health. Returns 'reachable', 'unreachable', or 'not_configured'.
    Uses a lightweight model-list probe without incurring inference cost."""
    if not settings.openrouter_api_key.strip() or not settings.openrouter_model.strip():
        return "not_configured"
    try:
        response = requests.get(
            settings.openrouter_base_url.rstrip("/") + "/models",
            headers={"Authorization": f"Bearer {settings.openrouter_api_key}"},
            timeout=8,
        )
        response.raise_for_status()
        return "reachable"
    except Exception:
        return "unreachable"


def list_copilot_providers(settings: Settings) -> list[dict[str, Any]]:
    return [
        {"id": "rule-based", "label": "Rule-based fallback", "configured": True, "status": "available", "model": None},
        {
            "id": "ollama",
            "label": "Ollama / Ollama Cloud",
            "configured": bool(settings.ollama_base_url.strip() and settings.ollama_model.strip()),
            "status": "available" if settings.ollama_base_url.strip() and settings.ollama_model.strip() else "missing_config",
            "model": settings.ollama_model or None,
        },
        {
            "id": "openrouter",
            "label": "OpenRouter",
            "configured": bool(settings.openrouter_base_url.strip() and settings.openrouter_model.strip() and settings.openrouter_api_key.strip()),
            "status": "available" if settings.openrouter_base_url.strip() and settings.openrouter_model.strip() and settings.openrouter_api_key.strip() else "missing_config",
            "model": settings.openrouter_model or None,
        },
    ]


def probe_provider_health(settings: Settings) -> dict[str, Any]:
    """Probe provider connectivity. Returns smoke signals without secrets or inference cost."""
    ollama_status = _probe_ollama_connectivity(settings)
    openrouter_status = _probe_openrouter_connectivity(settings)
    return {
        "ollama": {
            "configured": bool(settings.ollama_base_url.strip() and settings.ollama_model.strip()),
            "reachable": ollama_status == "reachable",
            "detail": ollama_status,
            "model": settings.ollama_model or None,
        },
        "openrouter": {
            "configured": bool(settings.openrouter_api_key.strip() and settings.openrouter_model.strip()),
            "reachable": openrouter_status == "reachable",
            "detail": openrouter_status,
            "model": settings.openrouter_model or None,
        },
    }


def get_configured_copilot_provider(settings: Settings, provider_override: str | None = None) -> CopilotProvider:
    provider = (provider_override or settings.copilot_default_provider or "rule-based").strip().lower()
    if not settings.copilot_enabled or provider in {"rule-based", "rule_based", "fallback"}:
        return RuleBasedCopilotProvider()
    if provider == "ollama":
        candidate = OllamaCopilotProvider(settings)
        return candidate if candidate.configured else RuleBasedCopilotProvider()
    if provider == "openrouter":
        candidate = OpenRouterCopilotProvider(settings)
        return candidate if candidate.configured else RuleBasedCopilotProvider()
    return RuleBasedCopilotProvider()


def get_default_copilot_provider() -> CopilotProvider:
    from app.core.config import get_settings

    return get_configured_copilot_provider(get_settings())
