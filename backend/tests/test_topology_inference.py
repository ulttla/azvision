from __future__ import annotations

from app.services.topology_inference import infer_explicit_network_relationship_edges


SUBSCRIPTION = "00000000-0000-0000-0000-000000000001"
RG = "rg-network"
BASE = f"/subscriptions/{SUBSCRIPTION}/resourceGroups/{RG}/providers"
VNET_ID = f"{BASE}/Microsoft.Network/virtualNetworks/vnet-app"
PEER_VNET_ID = f"{BASE}/Microsoft.Network/virtualNetworks/vnet-peer"
SUBNET_ID = f"{VNET_ID}/subnets/snet-app"
NSG_ID = f"{BASE}/Microsoft.Network/networkSecurityGroups/nsg-app"
RT_ID = f"{BASE}/Microsoft.Network/routeTables/rt-app"
NIC_ID = f"{BASE}/Microsoft.Network/networkInterfaces/nic-app"
PIP_ID = f"{BASE}/Microsoft.Network/publicIPAddresses/pip-app"
LB_ID = f"{BASE}/Microsoft.Network/loadBalancers/lb-app"
APPGW_ID = f"{BASE}/Microsoft.Network/applicationGateways/agw-app"
VM_ID = f"{BASE}/Microsoft.Compute/virtualMachines/vm-app"
PEP_ID = f"{BASE}/Microsoft.Network/privateEndpoints/pep-storage"
STORAGE_ID = f"{BASE}/Microsoft.Storage/storageAccounts/stapp"


def _resource(resource_id: str, resource_type: str, properties: dict | None = None) -> dict:
    return {
        "subscription_id": SUBSCRIPTION,
        "resource_group": RG,
        "name": resource_id.rstrip("/").split("/")[-1],
        "type": resource_type,
        "id": resource_id,
        "properties": properties or {},
        "source": "azure",
    }


def _edge_keys(edges: list[dict]) -> set[tuple[str, str, str]]:
    return {
        (edge["source_node_key"], edge["target_node_key"], edge["relation_type"])
        for edge in edges
    }


def test_explicit_network_edges_follow_arm_id_references() -> None:
    resources = [
        _resource(
            VNET_ID,
            "Microsoft.Network/virtualNetworks",
            {
                "subnets": [{"id": SUBNET_ID}],
                "virtualNetworkPeerings": [
                    {"properties": {"remoteVirtualNetwork": {"id": PEER_VNET_ID}}}
                ],
            },
        ),
        _resource(PEER_VNET_ID, "Microsoft.Network/virtualNetworks"),
        _resource(
            SUBNET_ID,
            "Microsoft.Network/virtualNetworks/subnets",
            {
                "networkSecurityGroup": {"id": NSG_ID},
                "routeTable": {"id": RT_ID},
            },
        ),
        _resource(
            NSG_ID,
            "Microsoft.Network/networkSecurityGroups",
            {"subnets": [{"id": SUBNET_ID}], "networkInterfaces": [{"id": NIC_ID}]},
        ),
        _resource(RT_ID, "Microsoft.Network/routeTables", {"subnets": [{"id": SUBNET_ID}]}),
        _resource(
            PIP_ID,
            "Microsoft.Network/publicIPAddresses",
            {"ipConfiguration": {"id": f"{NIC_ID}/ipConfigurations/ipconfig1"}},
        ),
        _resource(
            NIC_ID,
            "Microsoft.Network/networkInterfaces",
            {
                "networkSecurityGroup": {"id": NSG_ID},
                "ipConfigurations": [
                    {
                        "name": "ipconfig1",
                        "properties": {
                            "subnet": {"id": SUBNET_ID},
                            "publicIPAddress": {"id": PIP_ID},
                        },
                    }
                ],
            },
        ),
        _resource(
            LB_ID,
            "Microsoft.Network/loadBalancers",
            {
                "frontendIPConfigurations": [
                    {"properties": {"subnet": {"id": SUBNET_ID}, "publicIPAddress": {"id": PIP_ID}}}
                ],
                "backendAddressPools": [
                    {"properties": {"backendIPConfigurations": [{"id": f"{NIC_ID}/ipConfigurations/ipconfig1"}]}}
                ],
            },
        ),
        _resource(
            APPGW_ID,
            "Microsoft.Network/applicationGateways",
            {
                "frontendIPConfigurations": [
                    {"properties": {"subnet": {"id": SUBNET_ID}, "publicIPAddress": {"id": PIP_ID}}}
                ],
                "backendAddressPools": [
                    {"properties": {"backendIPConfigurations": [{"id": f"{NIC_ID}/ipConfigurations/ipconfig1"}]}}
                ],
            },
        ),
        _resource(
            VM_ID,
            "Microsoft.Compute/virtualMachines",
            {"networkProfile": {"networkInterfaces": [{"id": NIC_ID}]}},
        ),
        _resource(STORAGE_ID, "Microsoft.Storage/storageAccounts"),
        _resource(
            PEP_ID,
            "Microsoft.Network/privateEndpoints",
            {
                "subnet": {"id": SUBNET_ID},
                "privateLinkServiceConnections": [
                    {"properties": {"privateLinkServiceId": STORAGE_ID}}
                ],
            },
        ),
    ]

    edges = infer_explicit_network_relationship_edges(resources)
    keys = _edge_keys(edges)

    assert (f"resource:{VNET_ID}", f"resource:{SUBNET_ID}", "connects_to") in keys
    assert (f"resource:{VNET_ID}", f"resource:{PEER_VNET_ID}", "connects_to") in keys
    assert (f"resource:{NSG_ID}", f"resource:{SUBNET_ID}", "secures") in keys
    assert (f"resource:{NSG_ID}", f"resource:{NIC_ID}", "secures") in keys
    assert (f"resource:{RT_ID}", f"resource:{SUBNET_ID}", "routes") in keys
    assert (f"resource:{SUBNET_ID}", f"resource:{NIC_ID}", "connects_to") in keys
    assert (f"resource:{PIP_ID}", f"resource:{NIC_ID}", "connects_to") in keys
    assert (f"resource:{NIC_ID}", f"resource:{VM_ID}", "connects_to") in keys
    assert (f"resource:{LB_ID}", f"resource:{NIC_ID}", "connects_to") in keys
    assert (f"resource:{SUBNET_ID}", f"resource:{LB_ID}", "connects_to") in keys
    assert (f"resource:{PIP_ID}", f"resource:{LB_ID}", "connects_to") in keys
    assert (f"resource:{APPGW_ID}", f"resource:{NIC_ID}", "connects_to") in keys
    assert (f"resource:{SUBNET_ID}", f"resource:{APPGW_ID}", "connects_to") in keys
    assert (f"resource:{PIP_ID}", f"resource:{APPGW_ID}", "connects_to") in keys
    assert (f"resource:{SUBNET_ID}", f"resource:{PEP_ID}", "connects_to") in keys
    assert (f"resource:{PEP_ID}", f"resource:{STORAGE_ID}", "connects_to") in keys
    pip_to_nic_edge = next(
        edge
        for edge in edges
        if edge["source_node_key"] == f"resource:{PIP_ID}"
        and edge["target_node_key"] == f"resource:{NIC_ID}"
        and edge["relation_type"] == "connects_to"
    )
    assert set(pip_to_nic_edge["evidence"]) == {
        "networkInterface.ipConfigurations[].publicIPAddress.id",
        "publicIPAddress.ipConfiguration.id",
    }
    assert all(edge["source"] == "azure-explicit" for edge in edges)
    assert all(edge["confidence"] == 1.0 for edge in edges)
    assert all(edge["resolver"] == "network-explicit-v1" for edge in edges)


def test_explicit_network_edges_are_conservative_when_target_is_absent() -> None:
    resources = [
        _resource(
            NIC_ID,
            "Microsoft.Network/networkInterfaces",
            {
                "ipConfigurations": [
                    {"properties": {"subnet": {"id": SUBNET_ID}}}
                ]
            },
        )
    ]

    assert infer_explicit_network_relationship_edges(resources) == []
