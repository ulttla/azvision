# Demo Workspace Contract

This contract turns the existing mock inventory path into a public onboarding requirement. It does not expose a hosted demo by itself.

## Purpose

A public beta user should be able to understand AzVision before connecting Azure credentials. The demo workspace must show the main product value while staying clearly separate from live Azure data.

## Backend source

The current backend already has a mock inventory source in `backend/app/collectors/azure_inventory.py`. The demo onboarding API also exposes:

- `GET /api/v1/workspaces/demo-status`: read-only status for the configured default workspace. It reports only non-secret fields: workspace id, whether it is the local demo, resolved topology mode, topology availability, and node/edge counts.
- `POST /api/v1/workspaces/demo-bootstrap`: idempotent local demo workspace bootstrap. It requires manage access to the default workspace, inserts the demo workspace row if missing, returns `status=ready`, and emits `workspace.demo_bootstrapped` with only the workspace id in metadata.

The demo contract requires the mock source to keep enough resources for:

- subscription and resource group navigation
- virtual network and subnet visualization
- NSG and route-table relationship evidence
- app/service node representation
- database or storage node representation
- private endpoint style relationship evidence
- path analysis with both known and conservative unknown outcomes
- cost and simulation pages to show estimated or unknown-cost language

## Minimum sample topology

The mock inventory must include at least:

| Requirement | Minimum |
| --- | --- |
| subscriptions | 1 |
| resource groups | 2 |
| virtual networks | 2 |
| subnets | 1 |
| security groups | 1 |
| route tables | 1 |
| app/service resources | 1 |
| data resources | 1 |
| private endpoints | 1 |
| storage accounts | 1 |

## UX requirements

Future UI onboarding should:

1. Offer "Try demo workspace" before Azure setup.
2. Label all demo data as sample data.
3. Keep cost values clearly marked as estimated or unknown unless real provider data exists.
4. Keep Copilot in read-only mode.
5. Provide a clear switch from demo workspace to Azure read-only setup.

## Safety requirements

- Demo workspaces must not reuse real credential profiles.
- Demo data must not be mixed into live Azure workspaces.
- Demo snapshots and exports must be labeled as sample data.
- Demo mode must not imply Azure write/remediation ability.

## Validation

The mock inventory contract is guarded by backend tests. The tests should fail if the sample topology loses the minimum public onboarding coverage listed above. Demo onboarding route tests also assert that bootstrap is idempotent, viewer accounts cannot bootstrap, and audit metadata does not echo workspace names or secret-like values.
