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
const topoFormatCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/topology/formatting.ts'), 'utf8')
const dictCode = readFileSync(path.join(repoRoot, 'frontend/src/i18n/dict.ts'), 'utf8')
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
assert.match(topoPageCode, /aria-label=\{t\('topology\.detail\.pathProtocol'\)\}/, 'Protocol input should use localized accessible label')
assert.match(topoPageCode, /aria-label=\{t\('topology\.placeholder\.sourcePrefix'\)\}/, 'Source prefix input should use localized accessible label')
assert.match(topoPageCode, /aria-label=\{t\('topology\.placeholder\.destinationPrefix'\)\}/, 'Destination prefix input should use localized accessible label')
assert.match(topoPageCode, /aria-label=\{t\('topology\.detail\.pathSourcePort'\)\}/, 'Source port input should use localized accessible label')
assert.match(topoPageCode, /aria-label=\{t\('topology\.detail\.pathDestinationPort'\)\}/, 'Destination port input should use localized accessible label')

// ============================================================
// Section 3: Peering evidence clarity and conservative semantics
// ============================================================
assert.match(topoFormatCode, /function formatPeeringTraversalLabel/, 'topology/formatting should define peering traversal labels')
assert.match(topoFormatCode, /forwarded peering \(\$\{peeringHopCount\} hops\)/, 'Peering traversal label should distinguish forwarded peering')
assert.match(topoFormatCode, /direct peering/, 'Peering traversal label should distinguish direct peering')
assert.match(topoFormatCode, /topology\.detail\.peeringIntraVNet/, 'topology/formatting should reference Intra-VNet peering i18n key')
assert.match(topoFormatCode, /topology\.detail\.peeringForwarded/, 'topology/formatting should reference forwarded peering i18n key')
assert.match(topoFormatCode, /topology\.detail\.peeringDirect/, 'topology/formatting should reference direct peering i18n key')
assert.match(topoPageCode, /topology\.detail\.pathMvpNote/, 'Path-analysis UI should render localized MVP note copy')
assert.match(dictCode, /conservative unknown\/no-path/, 'Path-analysis copy should explain conservative unknown/no-path behavior')
assert.match(topoPageCode, /topology\.detail\.pathPeeringBoundary/, 'Hop list should expose peering boundary chips via i18n key')
assert.match(dictCode, /'topology\.detail\.pathPeeringBoundary': 'Peering boundary'/, 'i18n dict should include peering boundary chip copy')

// ============================================================
// Section 4: Smoke chain and acceptance wrapper awareness
// ============================================================
assert.match(packageCode, /path_analysis_semantics_smoke\.mts/, 'frontend smoke:semantics should include the path-analysis contract smoke')
assert.match(acceptanceCode, /personal_use_smoke\.sh/, 'Personal-use acceptance should include the live/conditional path-analysis smoke wrapper')
assert.match(acceptanceCode, /path_analysis_semantics_smoke\.mts/, 'Personal-use acceptance should syntax-check the browserless path-analysis contract smoke')

console.log('✅ path_analysis_semantics_smoke.mts: all assertions passed')
