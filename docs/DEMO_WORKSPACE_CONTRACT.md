# Demo Workspace Contract

This contract turns the existing mock inventory path into a public onboarding requirement. It does not expose a hosted demo by itself.

## Purpose

A public beta user should be able to understand AzVision before connecting Azure credentials. The demo workspace must show the main product value while staying clearly separate from live Azure data.

## Backend source

The current backend already has a mock inventory source in `backend/app/collectors/azure_inventory.py`. The demo contract requires that source to keep enough resources for:

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

The mock inventory contract is guarded by backend tests. The tests should fail if the sample topology loses the minimum public onboarding coverage listed above.
