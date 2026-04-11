from __future__ import annotations

import base64
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings

router = APIRouter(prefix="/workspaces/{workspace_id}/exports", tags=["exports"])

SUPPORTED_EXPORT_FORMATS = {"png", "pdf"}
SUPPORTED_EXPORT_MIME_TYPES = {"image/png", "application/pdf", "application/octet-stream"}


class ExportError(RuntimeError):
    pass


def _workspace_export_dir(workspace_id: str) -> Path:
    settings = get_settings()
    base_dir = Path(settings.export_root).expanduser()
    target_dir = base_dir / workspace_id
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir


def _export_record_from_path(workspace_id: str, export_path: Path) -> dict[str, Any]:
    stat = export_path.stat()
    return {
        "id": export_path.stem,
        "workspace_id": workspace_id,
        "format": export_path.suffix.lstrip("."),
        "status": "completed",
        "output_path": str(export_path),
        "created_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        "size_bytes": stat.st_size,
    }


def _decode_data_url(data_url: str) -> tuple[str, bytes]:
    if not data_url.startswith("data:") or ";base64," not in data_url:
        raise ExportError("image_data_url must be a base64 data URL")

    header, encoded = data_url.split(",", 1)
    mime_type = header[5:].split(";")[0]
    try:
        raw_bytes = base64.b64decode(encoded, validate=True)
    except Exception as exc:  # noqa: BLE001
        raise ExportError("image_data_url is not valid base64") from exc

    return mime_type, raw_bytes


@router.post("")
def create_export(workspace_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    export_format = str(payload.get("format") or "png").lower()
    if export_format not in SUPPORTED_EXPORT_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported export format. Supported: {', '.join(sorted(SUPPORTED_EXPORT_FORMATS))}",
        )

    image_data_url = payload.get("image_data_url")
    if not image_data_url:
        raise HTTPException(status_code=400, detail="image_data_url is required")

    try:
        mime_type, raw_bytes = _decode_data_url(image_data_url)
    except ExportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if mime_type not in SUPPORTED_EXPORT_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported export MIME type")

    export_id = payload.get("export_id") or f"export_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{uuid4().hex[:6]}"
    export_dir = _workspace_export_dir(workspace_id)
    extension = export_format
    export_path = export_dir / f"{export_id}.{extension}"
    export_path.write_bytes(raw_bytes)

    record = _export_record_from_path(workspace_id, export_path)
    record["format"] = export_format
    return record


@router.get("")
def list_exports(workspace_id: str) -> dict[str, list[dict[str, Any]]]:
    export_dir = _workspace_export_dir(workspace_id)
    items = [
        _export_record_from_path(workspace_id, path)
        for path in sorted(export_dir.iterdir(), key=lambda item: item.stat().st_mtime, reverse=True)
        if path.is_file() and path.suffix.lstrip(".") in SUPPORTED_EXPORT_FORMATS
    ]
    return {"items": items}


@router.get("/{export_id}")
def get_export(workspace_id: str, export_id: str) -> dict[str, Any]:
    export_dir = _workspace_export_dir(workspace_id)
    for supported_ext in SUPPORTED_EXPORT_FORMATS:
        candidate = export_dir / f"{export_id}.{supported_ext}"
        if candidate.exists():
            return _export_record_from_path(workspace_id, candidate)

    raise HTTPException(status_code=404, detail="Export not found")