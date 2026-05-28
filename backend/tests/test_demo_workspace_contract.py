from __future__ import annotations

from app.collectors.azure_inventory import _mock_inventory_collection


def _resource_types() -> list[str]:
    collection = _mock_inventory_collection()
    return [str(item.get("type") or "").lower() for item in collection.resources]


def test_mock_inventory_supports_public_onboarding_minimum_shape() -> None:
    collection = _mock_inventory_collection()
    resource_types = _resource_types()

    assert len(collection.subscriptions) >= 1
    assert len(collection.resource_groups) >= 2
    assert len(collection.resources) >= 10
    assert resource_types.count("microsoft.network/virtualnetworks") >= 2
    assert "microsoft.network/virtualnetworks/subnets" in resource_types
    assert "microsoft.network/networksecuritygroups" in resource_types
    assert "microsoft.network/routetables" in resource_types
    assert "microsoft.web/sites" in resource_types
    assert any(item.startswith("microsoft.sql/managedinstances") for item in resource_types)
    assert "microsoft.network/privateendpoints" in resource_types
    assert "microsoft.storage/storageaccounts" in resource_types


def test_mock_inventory_uses_sample_data_markers() -> None:
    collection = _mock_inventory_collection()

    assert {item.get("source") for item in collection.subscriptions} == {"mock"}
    assert {item.get("source") for item in collection.resource_groups} == {"mock"}
    assert {item.get("source") for item in collection.resources} == {"mock"}
    assert all((item.get("tags") or {}).get("environment") == "mock" for item in collection.resources)
