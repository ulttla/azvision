# Public Onboarding Design

AzVision needs a first-run path that shows value before a user connects Azure credentials. This document defines the public onboarding target without implementing a hosted flow yet.

## Goals

- Let a new user see topology, snapshots, path analysis, cost signals, simulation, and Copilot prompts without Azure setup.
- Keep Azure credential setup clearly read-only.
- Avoid asking for secrets before the user understands the product value.
- Keep demo mode separate from real user workspaces.

## First-run flow

1. Welcome screen explains two modes:
   - Demo workspace: no Azure credentials required.
   - Azure read-only workspace: user configures read-only credentials.
2. Demo workspace loads a sample topology.
3. Guided checklist highlights:
   - topology graph navigation
   - node details
   - manual note/modeling path
   - snapshot save/restore
   - path analysis
   - cost insight caveats
   - simulation report
   - read-only Copilot prompts
4. Azure setup path opens only after the user chooses to connect real data.

## Demo workspace requirements

The sample topology should include:

- At least one virtual network and subnet.
- One app/service node.
- One database or storage node.
- One public ingress or load balancer style node.
- Network security group or route-style edge evidence.
- Enough metadata for path analysis to show both known and unknown conclusions.
- Cost data marked as estimated or unknown, never real billing.

## UX copy rules

- Say "read-only" whenever describing Azure credential setup.
- Label demo data clearly.
- Label cost data as estimated or unavailable unless real provider data exists.
- Keep Copilot copy read-only and non-remediating.
- Avoid implying the app will change Azure resources.

## Data separation

Demo workspace data must be marked as sample data and should not mix with live Azure workspaces.

Future account-based public beta should store:

- account id
- workspace id
- workspace type: demo or azure-readonly
- credential profile id only for live Azure workspaces
- onboarding completion state

## Acceptance checks

Public onboarding should be considered ready when:

- A fresh user can open the app and load demo topology without Azure credentials.
- The user can save and restore a demo snapshot.
- Path analysis and simulation views have meaningful sample outputs.
- Copilot fallback answers a demo question without external provider setup.
- The UI clearly separates demo data from live Azure data.
