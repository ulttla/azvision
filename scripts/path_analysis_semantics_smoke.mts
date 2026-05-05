/**
 * Browserless FE semantics smoke — Network Path Analysis contracts.
 * Keeps the peering evidence UI and API type surface covered without live Azure or browser runtime.
 * Run: node --experimental-strip-types scripts/path_analysis_semantics_smoke.mts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const topoPageCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/TopologyPage.tsx'), 'utf8')
const apiCode = readFileSync(path.join(repoRoot, 'frontend/src/lib/api.ts'), 'utf8')
const acceptanceCode = readFileSync(path.join(repoRoot, 'scripts/personal_use_acceptance.sh'), 'utf8')
const packageCode = readFileSync(path.join(repoRoot, 'frontend/package.json'), 'utf8')

// ============================================================
// Section 1: API response contract
// ============================================================
assert.match(apiCode, /export type PathAnalysisVerdict = 'allowed' \| 'blocked' \| 'unknown'/, 'Path analysis verdict union should remain explicit')
assert.match(apiCode, /export type PathAnalysisHop = \{/, 'api.ts should export PathAnalysisHop')
assert.match(apiCode, /is_peering_boundary\?: boolean/, 'PathAnalysisHop should expose peering boundary metadata')
assert.match(apiCode, /route_next_hop_type\?: string/, 'PathAnalysisHop should expose route next-hop type')
assert.match(apiCode, /export type PathAnalysisCandidate = \{/, 'api.ts should export PathAnalysisCandidate')
assert.match(apiCode, /peering_hop_count\?: number/, 'PathAnalysisCandidate should expose peering hop count')
assert.match(apiCode, /is_forwarded_traffic\?: boolean \| null/, 'PathAnalysisCandidate should expose forwarded-traffic evidence')
assert.match(apiCode, /export type PathAnalysisResponse = \{/, 'api.ts should export PathAnalysisResponse')
assert.match(apiCode, /overall_verdict: PathAnalysisVerdict/, 'PathAnalysisResponse should expose overall verdict')
assert.match(apiCode, /warnings: string\[\]/, 'PathAnalysisResponse should expose warnings')

// ============================================================
// Section 2: TopologyPage path-analysis state and controls
// ============================================================
const requiredStateNames = [
  'pathSourceNodeRef',
  'pathDestinationNodeRef',
  'pathAnalysisResult',
  'pathAnalysisLoading',
  'pathProtocolInput',
  'pathSourceAddressInput',
  'pathDestinationAddressInput',
  'pathSourcePortInput',
  'pathDestinationPortInput',
]

for (const stateName of requiredStateNames) {
  assert.match(topoPageCode, new RegExp(stateName), `TopologyPage should track ${stateName}`)
}

assert.match(topoPageCode, /function runPathAnalysis\(/, 'TopologyPage should define runPathAnalysis')
assert.match(topoPageCode, /getPathAnalysis\(/, 'TopologyPage should call getPathAnalysis')
assert.match(topoPageCode, /aria-label="Path analysis protocol"/, 'Protocol input should be accessible')
assert.match(topoPageCode, /aria-label="Path analysis source address prefix"/, 'Source prefix input should be accessible')
assert.match(topoPageCode, /aria-label="Path analysis destination address prefix"/, 'Destination prefix input should be accessible')
assert.match(topoPageCode, /aria-label="Path analysis source port"/, 'Source port input should be accessible')
assert.match(topoPageCode, /aria-label="Path analysis destination port"/, 'Destination port input should be accessible')

// ============================================================
// Section 3: Peering evidence clarity and conservative semantics
// ============================================================
assert.match(topoPageCode, /function formatPeeringTraversalLabel/, 'TopologyPage should define peering traversal labels')
assert.match(topoPageCode, /forwarded peering \(\$\{peeringHopCount\} hops\)/, 'Peering traversal label should distinguish forwarded peering')
assert.match(topoPageCode, /direct peering/, 'Peering traversal label should distinguish direct peering')
assert.match(topoPageCode, /Intra-VNet path; no VNet peering evidence is required\./, 'Intra-VNet path should not require peering evidence')
assert.match(topoPageCode, /Forwarded\/transitive peering candidate/, 'Forwarded/transitive peering hint should be explicit')
assert.match(topoPageCode, /allowForwardedTraffic=true/, 'Forwarded peering hint should require allowForwardedTraffic=true')
assert.match(topoPageCode, /Direct peering candidate; allowForwardedTraffic is not required/, 'Direct peering hint should not require allowForwardedTraffic')
assert.match(topoPageCode, /conservative unknown\/no-path/, 'Path-analysis copy should explain conservative unknown/no-path behavior')
assert.match(topoPageCode, /Peering boundary/, 'Hop list should expose peering boundary chips')

// ============================================================
// Section 4: Smoke chain and acceptance wrapper awareness
// ============================================================
assert.match(packageCode, /path_analysis_semantics_smoke\.mts/, 'frontend smoke:semantics should include the path-analysis contract smoke')
assert.match(acceptanceCode, /personal_use_smoke\.sh/, 'Personal-use acceptance should include the live/conditional path-analysis smoke wrapper')
assert.match(acceptanceCode, /path_analysis_semantics_smoke\.mts/, 'Personal-use acceptance should syntax-check the browserless path-analysis contract smoke')

console.log('✅ path_analysis_semantics_smoke.mts: all assertions passed')
