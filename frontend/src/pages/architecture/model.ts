import type { TopologyEdge, TopologyNode, TopologyResponse } from '../../lib/api'

export type ArchitectureStage =
  | 'source'
  | 'ingest'
  | 'process'
  | 'store'
  | 'serve'
  | 'infra'
  | 'unclassified'

export type ArchitectureFamily =
  | 'static-web'
  | 'cdn'
  | 'web-app'
  | 'app-plan'
  | 'sql-managed-instance'
  | 'sql-server'
  | 'sql-database'
  | 'synapse-workspace'
  | 'synapse-pool'
  | 'storage'
  | 'cosmos'
  | 'network'
  | 'certificate'
  | 'other'

export type ArchitectureNode = {
  id: string
  label: string
  shortLabel: string
  stage: ArchitectureStage
  family: ArchitectureFamily
  familyLabel: string
  workloadKey: string
  sourceNodeKeys: string[]
  sourceNodes: TopologyNode[]
  nodeCount: number
  childResourceCount: number
  resourceGroups: string[]
  locations: string[]
  resourceTypes: string[]
  description: string
}

export type ArchitectureEdge = {
  id: string
  sourceId: string
  targetId: string
  sourceStage: ArchitectureStage
  targetStage: ArchitectureStage
  count: number
  kinds: Array<'topology' | 'synthetic'>
  relationTypes: string[]
}

export type ArchitectureStageBucket = {
  stage: ArchitectureStage
  label: string
  description: string
  nodes: ArchitectureNode[]
}

export type ArchitectureViewModel = {
  workspaceId: string
  generatedAt?: string
  sourceNodeCount: number
  groupedNodeCount: number
  groupedResourceCount: number
  nodes: ArchitectureNode[]
  edges: ArchitectureEdge[]
  stageBuckets: ArchitectureStageBucket[]
}

export type ArchitectureNodeOverride = {
  displayNameOverride?: string
  stageKeyOverride?: ArchitectureStage
  position?: { order: number }
}

export type ArchitectureAnnotation = {
  id: string
  text: string
  tone: 'note' | 'warning' | 'info'
  updatedAt?: string
}

export type ArchitectureSvgResult = {
  svg: string
  width: number
  height: number
}

export const ARCHITECTURE_STAGE_ORDER: ArchitectureStage[] = [
  'source',
  'ingest',
  'process',
  'store',
  'serve',
  'infra',
  'unclassified',
]

export const ARCHITECTURE_STAGE_META: Record<
  ArchitectureStage,
  { label: string; description: string; color: string; tint: string; accent: string }
> = {
  source: {
    label: 'Source',
    description: 'Client-facing entrypoints and external origins',
    color: '#7dd3fc',
    tint: 'rgba(14, 165, 233, 0.14)',
    accent: '#0ea5e9',
  },
  ingest: {
    label: 'Ingest',
    description: 'Landing, intake, and pipeline entry resources',
    color: '#fbbf24',
    tint: 'rgba(245, 158, 11, 0.14)',
    accent: '#f59e0b',
  },
  process: {
    label: 'Process',
    description: 'Compute, transformation, and analytics execution',
    color: '#c084fc',
    tint: 'rgba(168, 85, 247, 0.14)',
    accent: '#a855f7',
  },
  store: {
    label: 'Store',
    description: 'Databases, storage, and persisted state',
    color: '#34d399',
    tint: 'rgba(16, 185, 129, 0.14)',
    accent: '#10b981',
  },
  serve: {
    label: 'Serve',
    description: 'Apps, APIs, and delivery surfaces',
    color: '#60a5fa',
    tint: 'rgba(59, 130, 246, 0.14)',
    accent: '#3b82f6',
  },
  infra: {
    label: 'Infra',
    description: 'Shared network and platform support resources',
    color: '#94a3b8',
    tint: 'rgba(100, 116, 139, 0.16)',
    accent: '#64748b',
  },
  unclassified: {
    label: 'Unclassified',
    description: 'Safe fallback for resources not yet mapped',
    color: '#fda4af',
    tint: 'rgba(244, 63, 94, 0.14)',
    accent: '#f43f5e',
  },
}

const GROUP_THRESHOLD_DEFAULT = 2

const GENERIC_NAME_TOKENS = new Set([
  'azure',
  'prod',
  'production',
  'dev',
  'test',
  'qa',
  'stage',
  'staging',
  'uat',
  'rg',
  'resource',
  'group',
  'server',
  'sql',
  'mi',
  'synw',
  'synapse',
  'workspace',
  'dataanalyticsresourcegroup',
  'canada',
  'central',
  'cancen',
  'selectwines',
  'sw',
  'default',
  'networkwatcher',
])

const SOURCE_EXPERIENCE_NAME_HINTS = ['portal', 'frontend', 'ui', 'spa', 'dashboard', 'client', 'www']

const TITLE_CASE_TOKEN_MAP: Record<string, string> = {
  api: 'API',
  asp: 'ASP',
  canadacentral: 'Canada Central',
  cdn: 'CDN',
  cosmos: 'Cosmos',
  dataconf: 'Dataconf',
  datalake: 'Data Lake',
  db: 'DB',
  dls: 'DLS',
  fe: 'FE',
  hosting: 'Hosting',
  listhosting: 'List Hosting',
  mi: 'MI',
  nsg: 'NSG',
  pep: 'PEP',
  rg: 'RG',
  rt: 'RT',
  selectwines: 'SelectWines',
  sharepoint: 'SharePoint',
  sparkpool: 'Spark Pool',
  sql: 'SQL',
  sqlmi: 'SQL MI',
  sqlserver: 'SQL Server',
  sw: 'SW',
  synapseworkspace: 'Synapse Workspace',
  synw: 'Synw',
  ui: 'UI',
  vnet: 'VNet',
}

const LOWERCASE_TITLE_TOKENS = new Set(['and', 'for', 'of', 'to'])

const EXACT_DISPLAY_TOKEN_SPLITS: Record<string, string[]> = {
  canadacentral: ['canada', 'central'],
  pricingcalculator: ['pricing', 'calculator'],
  sharepointlisthosting: ['sharepoint', 'list', 'hosting'],
}

const FAMILY_WORKLOAD_STOP_TOKENS: Partial<Record<ArchitectureFamily, string[]>> = {
  'static-web': ['static', 'web', 'site', 'sites'],
  cdn: ['cdn', 'frontdoor', 'front', 'door', 'edge'],
  'web-app': ['web', 'app', 'api', 'site', 'sites', 'service'],
  'app-plan': ['app', 'service', 'plan', 'serverfarm'],
  'sql-managed-instance': ['sql', 'managed', 'instance', 'managedinstance', 'synapse', 'workspace'],
  'sql-server': ['sql', 'server', 'synapse', 'workspace'],
  'sql-database': ['sql', 'database', 'synapse', 'workspace'],
  'synapse-workspace': ['synapse', 'workspace'],
  'synapse-pool': ['synapse', 'spark', 'pool', 'bigdata', 'workspace'],
  certificate: ['cert', 'certificate', 'tls', 'ssl'],
  network: ['network', 'vnet', 'nsg', 'rt', 'route', 'routes', 'subnet', 'private', 'endpoint', 'pep'],
}

const FAMILY_WORKLOAD_KEY_IGNORE_TOKENS: Partial<Record<ArchitectureFamily, string[]>> = {
  network: [
    'nsg',
    'vnet',
    'rt',
    'pep',
    'private',
    'endpoint',
    'subnet',
    'route',
    'routes',
    'virtualcluster',
    'networkwatcher',
    'default',
    'sqlmi',
    'synw',
    'managedrg',
  ],
  certificate: ['ca', 'com', 'net', 'org', 'www', 'api', 'fe'],
  'app-plan': ['asp'],
}

const TYPE_FAMILY_RULES: Array<{
  family: ArchitectureFamily
  label: string
  prefixes: string[]
}> = [
  { family: 'static-web', label: 'Static Web', prefixes: ['microsoft.web/staticsites'] },
  {
    family: 'cdn',
    label: 'CDN / Front Door',
    prefixes: ['microsoft.cdn/profiles', 'microsoft.cdn/profiles/afdendpoints'],
  },
  {
    family: 'web-app',
    label: 'Web App / API',
    prefixes: ['microsoft.web/sites', 'microsoft.web/sites/slots'],
  },
  { family: 'app-plan', label: 'App Service Plan', prefixes: ['microsoft.web/serverfarms'] },
  {
    family: 'sql-managed-instance',
    label: 'SQL Managed Instance',
    prefixes: ['microsoft.sql/managedinstances'],
  },
  {
    family: 'sql-database',
    label: 'SQL Database',
    prefixes: ['microsoft.sql/servers/databases'],
  },
  { family: 'sql-server', label: 'SQL Server', prefixes: ['microsoft.sql/servers'] },
  {
    family: 'synapse-pool',
    label: 'Spark / Synapse Pool',
    prefixes: ['microsoft.synapse/workspaces/bigdatapools'],
  },
  {
    family: 'synapse-workspace',
    label: 'Synapse Workspace',
    prefixes: ['microsoft.synapse/workspaces'],
  },
  {
    family: 'storage',
    label: 'Storage',
    prefixes: ['microsoft.storage/storageaccounts'],
  },
  {
    family: 'cosmos',
    label: 'Cosmos DB',
    prefixes: ['microsoft.documentdb/databaseaccounts'],
  },
  {
    family: 'network',
    label: 'Network',
    prefixes: [
      'microsoft.network/',
      'microsoft.sql/virtualclusters',
      'microsoft.sql/managedinstances/administrators',
    ],
  },
  {
    family: 'certificate',
    label: 'Certificate',
    prefixes: ['microsoft.web/certificates'],
  },
]

function toArray<T>(values: Iterable<T>): T[] {
  return Array.from(values)
}

function normalizeResourceType(resourceType?: string | null): string {
  return (resourceType ?? '').trim().toLowerCase()
}

function normalizeText(text?: string | null): string {
  return (text ?? '').trim().toLowerCase()
}

function tokenizeName(text: string): string[] {
  const prepared = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_./:-]+/g, ' ')

  return normalizeText(prepared).match(/[a-z0-9]+/g) ?? []
}

function hasAnyToken(text: string, candidates: string[]): boolean {
  const tokens = new Set(tokenizeName(text))
  return candidates.some((candidate) => tokens.has(candidate))
}

function formatTitleToken(part: string, index: number): string {
  if (!part) {
    return part
  }

  if (index > 0 && LOWERCASE_TITLE_TOKENS.has(part)) {
    return part
  }

  return TITLE_CASE_TOKEN_MAP[part] ?? (part.charAt(0).toUpperCase() + part.slice(1))
}

function titleCaseWords(text: string): string {
  return text
    .split(' ')
    .filter(Boolean)
    .map((part, index) => formatTitleToken(part, index))
    .join(' ')
}

function splitDisplayToken(token: string): string[] {
  const normalized = normalizeText(token)
  if (!normalized) {
    return []
  }

  const exactSplit = EXACT_DISPLAY_TOKEN_SPLITS[normalized]
  if (exactSplit) {
    return exactSplit
  }

  const sqlMiMatch = normalized.match(/^(sqlmi)(for)?(selectwines|selectwinesdev|selectwinesprod|selectwinestest|selectwinesqa|selectwinesstage|selectwinesstaging)$/)
  if (sqlMiMatch) {
    const workloadMatch = sqlMiMatch[3].match(/^(selectwines)(prod|dev|test|qa|stage|staging)?$/)
    return [sqlMiMatch[1], sqlMiMatch[2], workloadMatch?.[1], workloadMatch?.[2]].filter(
      (value): value is string => Boolean(value),
    )
  }

  const dlsDataconfMatch = normalized.match(/^(dls)(dataconf)(prod|dev|test|qa|stage|staging)?(cancen)?(\d+)?$/)
  if (dlsDataconfMatch) {
    return [
      dlsDataconfMatch[1],
      dlsDataconfMatch[2],
      dlsDataconfMatch[3],
      dlsDataconfMatch[4],
      dlsDataconfMatch[5],
    ].filter((value): value is string => Boolean(value))
  }

  const dataconfMatch = normalized.match(/^(dataconf)(prod|dev|test|qa|stage|staging)?(cancen)?(\d+)?$/)
  if (dataconfMatch) {
    return [dataconfMatch[1], dataconfMatch[2], dataconfMatch[3], dataconfMatch[4]].filter(
      (value): value is string => Boolean(value),
    )
  }

  const synwMatch = normalized.match(/^(synw)(dataconf)(prod|dev|test|qa|stage|staging)?(cancen)?(\d+)?$/)
  if (synwMatch) {
    return [synwMatch[1], synwMatch[2], synwMatch[3], synwMatch[4], synwMatch[5]].filter(
      (value): value is string => Boolean(value),
    )
  }

  const synapseWorkspaceMatch = normalized.match(
    /^(synapseworkspace)(for)?(selectwines)(prod|dev|test|qa|stage|staging)?$/,
  )
  if (synapseWorkspaceMatch) {
    return [
      synapseWorkspaceMatch[1],
      synapseWorkspaceMatch[2],
      synapseWorkspaceMatch[3],
      synapseWorkspaceMatch[4],
    ].filter((value): value is string => Boolean(value))
  }

  const datalakeMatch = normalized.match(/^(datalake)(for)?(synapse)(prod|dev|test|qa|stage|staging)?$/)
  if (datalakeMatch) {
    return [datalakeMatch[1], datalakeMatch[2], datalakeMatch[3], datalakeMatch[4]].filter(
      (value): value is string => Boolean(value),
    )
  }

  const sparkPoolMatch = normalized.match(/^(sparkpool)(sw|selectwines)(prod|dev|test|qa|stage|staging)?$/)
  if (sparkPoolMatch) {
    return [sparkPoolMatch[1], sparkPoolMatch[2], sparkPoolMatch[3]].filter(
      (value): value is string => Boolean(value),
    )
  }

  const swCosmosMatch = normalized.match(/^(sw)(cosmos)(db)?$/)
  if (swCosmosMatch) {
    return [swCosmosMatch[1], swCosmosMatch[2], swCosmosMatch[3]].filter(
      (value): value is string => Boolean(value),
    )
  }

  const appPlanMatch = normalized.match(
    /^(asp)(dataanalytics)(resourcegroup)?(prod|dev|test|qa|stage|staging)?([a-z0-9]+)?$/,
  )
  if (appPlanMatch) {
    return [appPlanMatch[1], 'data', 'analytics', appPlanMatch[3], appPlanMatch[4], appPlanMatch[5]].filter(
      (value): value is string => Boolean(value),
    )
  }

  const cancenMatch = normalized.match(/^(cancen)(\d+)$/)
  if (cancenMatch) {
    return [cancenMatch[1], cancenMatch[2]]
  }

  return [normalized]
}

function mergeDisplayPhrases(tokens: string[]): string[] {
  const merged: string[] = []

  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index]
    const next = tokens[index + 1]

    if (current === 'select' && next === 'wines') {
      merged.push('selectwines')
      index += 1
      continue
    }

    merged.push(current)
  }

  return merged
}

function displayTokens(text: string): string[] {
  const prepared = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_./:-]+/g, ' ')

  const baseTokens = normalizeText(prepared).match(/[a-z0-9]+/g) ?? []
  return mergeDisplayPhrases(baseTokens.flatMap((token) => splitDisplayToken(token)))
}

function prettifyDisplayLabel(text: string): string {
  const tokens = displayTokens(text)
  if (!tokens.length) {
    return text.trim()
  }

  return tokens.map((token, index) => formatTitleToken(token, index)).join(' ')
}

function clip(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`
}

function clipWords(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }

  const words = text.split(/\s+/).filter(Boolean)
  let current = ''

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxLength) {
      break
    }
    current = next
  }

  if (current.length >= Math.max(8, maxLength - 8)) {
    return `${current}…`
  }

  return clip(text, maxLength)
}

function compactArchitectureLabel(label: string, family: ArchitectureFamily): string {
  let compact = label.trim()

  if (family === 'web-app') {
    compact = compact.replace(/\s+Web App API$/i, '')
  }

  if (family === 'cdn') {
    compact = compact
      .replace(/\bCDN\s*\/\s*Front Door\b/gi, 'CDN')
      .replace(/\bCDN Front Door\b/gi, 'CDN')
  }

  if (family === 'certificate') {
    compact = compact.replace(/\s+Certificate$/i, '')
  }

  if (family === 'app-plan') {
    compact = compact
      .replace(/\bApp Service Plan\b/gi, 'App Plan')
      .replace(/\bResource Group\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }

  if (family === 'sql-managed-instance') {
    compact = compact.replace(/\bManaged Instance\b/gi, 'MI')
  }

  if (family === 'synapse-workspace') {
    compact = compact.replace(/\bSynapse Workspace\b/gi, 'Synapse WS')
  }

  if (family === 'synapse-pool') {
    compact = compact.replace(/\bSpark Pool\b/gi, 'Spark')
  }

  if (family === 'network') {
    compact = compact
      .replace(/\bManaged Instance\b/gi, 'MI')
      .replace(/\bfor SelectWines\b/gi, 'SW')
      .replace(/\bSupport Network\b/gi, 'Support Net')
      .replace(/\bNetwork\b/gi, 'Net')
  }

  return clipWords(compact.replace(/\s{2,}/g, ' ').trim(), 30)
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function familyForResourceType(resourceType?: string | null): {
  family: ArchitectureFamily
  label: string
} {
  const normalized = normalizeResourceType(resourceType)

  for (const rule of TYPE_FAMILY_RULES) {
    if (rule.prefixes.some((prefix) => normalized.startsWith(prefix))) {
      return { family: rule.family, label: rule.label }
    }
  }

  return { family: 'other', label: 'Other Resource' }
}

function stageForNode(node: TopologyNode): ArchitectureStage {
  const resourceType = normalizeResourceType(node.resource_type)
  const name = normalizeText(node.display_name)
  const family = familyForResourceType(resourceType).family
  const isSourceExperience =
    hasAnyToken(node.display_name, SOURCE_EXPERIENCE_NAME_HINTS) ||
    name.endsWith('-fe') ||
    name.includes('frontdoor')

  if (!resourceType) {
    return 'unclassified'
  }

  if (family === 'network' || family === 'certificate' || family === 'app-plan') {
    return 'infra'
  }

  if (family === 'cdn' || family === 'static-web') {
    return 'source'
  }

  if (
    resourceType.startsWith('microsoft.network/') ||
    resourceType.startsWith('microsoft.web/certificates') ||
    resourceType.startsWith('microsoft.sql/virtualclusters')
  ) {
    return 'infra'
  }

  if (
    resourceType.startsWith('microsoft.cdn/profiles') ||
    resourceType.startsWith('microsoft.web/staticsites')
  ) {
    return 'source'
  }

  if (
    resourceType.startsWith('microsoft.datafactory/') ||
    resourceType.startsWith('microsoft.eventhub/') ||
    resourceType.startsWith('microsoft.servicebus/') ||
    name.includes('ingest') ||
    name.includes('landing') ||
    name.includes('raw')
  ) {
    return 'ingest'
  }

  if (
    resourceType.startsWith('microsoft.synapse/workspaces/bigdatapools') ||
    resourceType.startsWith('microsoft.synapse/workspaces/sqlpools') ||
    resourceType.startsWith('microsoft.databricks/') ||
    resourceType.startsWith('microsoft.compute/') ||
    resourceType.startsWith('microsoft.containerinstance/') ||
    resourceType.startsWith('microsoft.containerservice/')
  ) {
    return 'process'
  }

  if (
    resourceType.startsWith('microsoft.synapse/workspaces') &&
    !resourceType.startsWith('microsoft.synapse/workspaces/bigdatapools') &&
    !resourceType.startsWith('microsoft.synapse/workspaces/sqlpools')
  ) {
    return 'process'
  }

  if (
    resourceType.startsWith('microsoft.sql/') ||
    resourceType.startsWith('microsoft.storage/storageaccounts') ||
    resourceType.startsWith('microsoft.documentdb/databaseaccounts') ||
    resourceType.startsWith('microsoft.dbfor')
  ) {
    if (name.includes('landing') || name.includes('raw') || name.includes('ingest')) {
      return 'ingest'
    }
    return 'store'
  }

  if (
    resourceType.startsWith('microsoft.web/sites') ||
    resourceType.startsWith('microsoft.web/serverfarms') ||
    resourceType.startsWith('microsoft.apimanagement/')
  ) {
    if (resourceType.startsWith('microsoft.web/serverfarms')) {
      return 'infra'
    }
    if (isSourceExperience) {
      return 'source'
    }
    return 'serve'
  }

  return 'unclassified'
}

function compactWorkloadKeyForNode(node: TopologyNode, family: ArchitectureFamily): string | null {
  const resourceType = normalizeResourceType(node.resource_type)

  if (family === 'network') {
    if (
      resourceType.startsWith('microsoft.network/serviceendpointpolicies') ||
      resourceType.startsWith('microsoft.sql/virtualclusters')
    ) {
      return 'managed instance support'
    }

    if (resourceType.startsWith('microsoft.network/networkwatchers')) {
      return 'shared operations'
    }
  }

  return null
}

function workloadKeyForNode(node: TopologyNode): string {
  const family = familyForResourceType(node.resource_type).family
  const compactWorkloadKey = compactWorkloadKeyForNode(node, family)
  if (compactWorkloadKey) {
    return compactWorkloadKey
  }

  const familyIgnoreTokens = new Set(FAMILY_WORKLOAD_KEY_IGNORE_TOKENS[family] ?? [])

  const displayTokens = tokenizeName(node.display_name).filter(
    (token) => token.length > 2 && !GENERIC_NAME_TOKENS.has(token) && !familyIgnoreTokens.has(token),
  )

  if (displayTokens.length) {
    return displayTokens.slice(0, 2).join(' ')
  }

  const resourceGroupTokens = tokenizeName(node.resource_group ?? '').filter(
    (token) => token.length > 2 && !GENERIC_NAME_TOKENS.has(token) && !familyIgnoreTokens.has(token),
  )

  if (!resourceGroupTokens.length) {
    return 'shared'
  }

  return resourceGroupTokens.slice(0, 2).join(' ')
}

function workloadLabel(workloadKey: string): string {
  if (!workloadKey || workloadKey === 'shared') {
    return 'Shared'
  }
  return titleCaseWords(workloadKey)
}

function prettifyWorkloadLabel(workloadKey: string, family: ArchitectureFamily): string {
  if (!workloadKey || workloadKey === 'shared') {
    return ''
  }

  const familyStopTokens = new Set(FAMILY_WORKLOAD_STOP_TOKENS[family] ?? [])
  const tokens = displayTokens(workloadKey).filter((token) => !familyStopTokens.has(token))

  if (!tokens.length) {
    return ''
  }

  return tokens.map((token, index) => formatTitleToken(token, index)).join(' ')
}

function composeGroupedArchitectureLabel(
  workloadKey: string,
  family: ArchitectureFamily,
  familyLabel: string,
): string {
  const prettyWorkload = prettifyWorkloadLabel(workloadKey, family)
  if (!prettyWorkload) {
    return familyLabel
  }

  if (normalizeText(prettyWorkload) === normalizeText(familyLabel)) {
    return familyLabel
  }

  return `${prettyWorkload} ${familyLabel}`
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return toArray(new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value!.trim()))).sort(
    (left, right) => left.localeCompare(right),
  )
}

function createArchitectureNode(
  id: string,
  stage: ArchitectureStage,
  family: ArchitectureFamily,
  familyLabel: string,
  workloadKey: string,
  sourceNodes: TopologyNode[],
  forcedLabel?: string,
): ArchitectureNode {
  const sourceNodeKeys = sourceNodes.map((node) => node.node_key)
  const resourceTypes = uniqueSorted(sourceNodes.map((node) => node.resource_type))
  const resourceGroups = uniqueSorted(sourceNodes.map((node) => node.resource_group))
  const locations = uniqueSorted(sourceNodes.map((node) => node.location))
  const childResourceCount = sourceNodes.reduce((sum, node) => sum + (node.child_summary?.total ?? 0), 0)

  const label = forcedLabel
    ? prettifyDisplayLabel(forcedLabel)
    : sourceNodes.length >= GROUP_THRESHOLD_DEFAULT
      ? composeGroupedArchitectureLabel(workloadKey, family, familyLabel)
      : prettifyDisplayLabel(sourceNodes[0]?.display_name ?? familyLabel)

  const descriptionParts = [`${familyLabel}`]
  if (sourceNodes.length > 1) {
    descriptionParts.push(`${sourceNodes.length} resources grouped`)
  }
  if (childResourceCount > 0) {
    descriptionParts.push(`${childResourceCount} child resources hidden behind source topology nodes`)
  }

  return {
    id,
    label,
    shortLabel: compactArchitectureLabel(label, family),
    stage,
    family,
    familyLabel,
    workloadKey,
    sourceNodeKeys,
    sourceNodes,
    nodeCount: sourceNodes.length,
    childResourceCount,
    resourceGroups,
    locations,
    resourceTypes,
    description: descriptionParts.join(' • '),
  }
}

function buildArchitectureNodes(
  topology: TopologyResponse,
  groupThreshold: number,
  nodeOverrides: Record<string, ArchitectureNodeOverride>,
): ArchitectureNode[] {
  const resourceNodes = topology.nodes.filter((node) => node.node_type === 'resource')
  const grouped = new Map<string, TopologyNode[]>()

  for (const node of resourceNodes) {
    const stage = nodeOverrides[node.node_key]?.stageKeyOverride ?? stageForNode(node)
    const { family, label } = familyForResourceType(node.resource_type)
    const workloadKey = workloadKeyForNode(node)
    const groupKey = `${stage}|${family}|${workloadKey}`
    const bucket = grouped.get(groupKey)
    if (bucket) {
      bucket.push(node)
    } else {
      grouped.set(groupKey, [node])
    }
  }

  const architectureNodes: ArchitectureNode[] = []

  for (const [groupKey, nodes] of grouped.entries()) {
    const [stageValue, familyValue, workloadKey] = groupKey.split('|') as [
      ArchitectureStage,
      ArchitectureFamily,
      string,
    ]
    const familyLabel = familyForResourceType(nodes[0]?.resource_type).label

    const displayNameOverrides = nodes
      .map((node) => nodeOverrides[node.node_key]?.displayNameOverride?.trim())
      .filter((value): value is string => Boolean(value))
    const sharedDisplayNameOverride =
      displayNameOverrides.length === nodes.length && new Set(displayNameOverrides).size === 1
        ? displayNameOverrides[0]
        : undefined

    if (nodes.length >= groupThreshold) {
      architectureNodes.push(
        createArchitectureNode(
          `group:${stageValue}:${familyValue}:${workloadKey}`,
          stageValue,
          familyValue,
          familyLabel,
          workloadKey,
          nodes,
          sharedDisplayNameOverride ?? composeGroupedArchitectureLabel(workloadKey, familyValue, familyLabel),
        ),
      )
      continue
    }

    for (const node of nodes) {
      architectureNodes.push(
        createArchitectureNode(
          `node:${node.node_key}`,
          stageForNode(node),
          familyForResourceType(node.resource_type).family,
          familyForResourceType(node.resource_type).label,
          workloadKeyForNode(node),
          [node],
          nodeOverrides[node.node_key]?.displayNameOverride?.trim() || node.display_name,
        ),
      )
    }
  }

  return architectureNodes.sort((left, right) => {
    const stageDiff =
      ARCHITECTURE_STAGE_ORDER.indexOf(left.stage) - ARCHITECTURE_STAGE_ORDER.indexOf(right.stage)
    if (stageDiff !== 0) {
      return stageDiff
    }
    if (left.nodeCount !== right.nodeCount) {
      return right.nodeCount - left.nodeCount
    }
    return left.label.localeCompare(right.label)
  })
}

function addEdgeRecord(
  map: Map<string, ArchitectureEdge>,
  source: ArchitectureNode,
  target: ArchitectureNode,
  kind: 'topology' | 'synthetic',
  relationType: string,
) {
  if (source.id === target.id) {
    return
  }

  const key = `${source.id}->${target.id}`
  const current = map.get(key)
  if (current) {
    current.count += 1
    if (!current.kinds.includes(kind)) {
      current.kinds.push(kind)
    }
    if (relationType && !current.relationTypes.includes(relationType)) {
      current.relationTypes.push(relationType)
    }
    return
  }

  map.set(key, {
    id: key,
    sourceId: source.id,
    targetId: target.id,
    sourceStage: source.stage,
    targetStage: target.stage,
    count: 1,
    kinds: [kind],
    relationTypes: relationType ? [relationType] : [],
  })
}

function buildArchitectureEdges(
  architectureNodes: ArchitectureNode[],
  topologyEdges: TopologyEdge[],
): ArchitectureEdge[] {
  const edgeMap = new Map<string, ArchitectureEdge>()
  const sourceNodeToArch = new Map<string, ArchitectureNode>()

  for (const node of architectureNodes) {
    for (const sourceNodeKey of node.sourceNodeKeys) {
      sourceNodeToArch.set(sourceNodeKey, node)
    }
  }

  for (const edge of topologyEdges) {
    const source = sourceNodeToArch.get(edge.source_node_key)
    const target = sourceNodeToArch.get(edge.target_node_key)
    if (!source || !target) {
      continue
    }
    addEdgeRecord(edgeMap, source, target, 'topology', edge.relation_type)
  }

  const byWorkload = new Map<string, ArchitectureNode[]>()
  for (const node of architectureNodes) {
    const bucket = byWorkload.get(node.workloadKey)
    if (bucket) {
      bucket.push(node)
    } else {
      byWorkload.set(node.workloadKey, [node])
    }
  }

  for (const nodes of byWorkload.values()) {
    const distinctStages = nodes
      .slice()
      .sort(
        (left, right) =>
          ARCHITECTURE_STAGE_ORDER.indexOf(left.stage) - ARCHITECTURE_STAGE_ORDER.indexOf(right.stage),
      )

    for (let index = 0; index < distinctStages.length - 1; index += 1) {
      const source = distinctStages[index]
      const target = distinctStages[index + 1]
      if (source.stage === target.stage) {
        continue
      }
      addEdgeRecord(edgeMap, source, target, 'synthetic', 'stage-flow')
    }
  }

  return toArray(edgeMap.values()).sort((left, right) => {
    const stageDiff =
      ARCHITECTURE_STAGE_ORDER.indexOf(left.sourceStage) -
      ARCHITECTURE_STAGE_ORDER.indexOf(right.sourceStage)
    if (stageDiff !== 0) {
      return stageDiff
    }
    return right.count - left.count
  })
}

export function buildArchitectureViewModel(
  topology: TopologyResponse | null | undefined,
  options?: { groupThreshold?: number; nodeOverrides?: Record<string, ArchitectureNodeOverride> },
): ArchitectureViewModel {
  if (!topology) {
    return {
      workspaceId: '',
      generatedAt: undefined,
      sourceNodeCount: 0,
      groupedNodeCount: 0,
      groupedResourceCount: 0,
      nodes: [],
      edges: [],
      stageBuckets: ARCHITECTURE_STAGE_ORDER.map((stage) => ({
        stage,
        label: ARCHITECTURE_STAGE_META[stage].label,
        description: ARCHITECTURE_STAGE_META[stage].description,
        nodes: [],
      })),
    }
  }

  const groupThreshold = Math.max(2, options?.groupThreshold ?? GROUP_THRESHOLD_DEFAULT)
  const nodes = buildArchitectureNodes(topology, groupThreshold, options?.nodeOverrides ?? {})
  const edges = buildArchitectureEdges(nodes, topology.edges)
  const stageBuckets = ARCHITECTURE_STAGE_ORDER.map((stage) => ({
    stage,
    label: ARCHITECTURE_STAGE_META[stage].label,
    description: ARCHITECTURE_STAGE_META[stage].description,
    nodes: nodes.filter((node) => node.stage === stage),
  }))

  return {
    workspaceId: topology.workspace_id,
    generatedAt: topology.generated_at,
    sourceNodeCount: topology.nodes.filter((node) => node.node_type === 'resource').length,
    groupedNodeCount: nodes.length,
    groupedResourceCount: nodes.reduce((sum, node) => sum + node.nodeCount, 0),
    nodes,
    edges,
    stageBuckets,
  }
}

function renderSvgTextLines(x: number, y: number, lines: string[], color: string, fontSize: number): string {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * (fontSize + 4)}" fill="${color}" font-size="${fontSize}" font-family="Inter, Arial, sans-serif">${escapeXml(line)}</text>`,
    )
    .join('')
}

function wrapNodeLabel(label: string): string[] {
  if (label.length <= 22) {
    return [label]
  }

  const words = label.split(/\s+/).filter(Boolean)
  if (words.length < 2) {
    return [clip(label, 22), clip(label.slice(22), 22)]
  }

  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= 22) {
      current = next
      continue
    }
    lines.push(current)
    current = word
    if (lines.length === 1) {
      continue
    }
    break
  }
  if (current) {
    lines.push(current)
  }
  return lines.slice(0, 2).map((line, index, array) => (index === array.length - 1 ? clip(line, 22) : line))
}

export function renderArchitectureSvg(
  stageBuckets: ArchitectureStageBucket[],
  edges: ArchitectureEdge[],
  options?: { annotations?: ArchitectureAnnotation[] },
): ArchitectureSvgResult {
  const visibleBuckets = stageBuckets.filter((bucket) => bucket.nodes.length > 0)
  const buckets = visibleBuckets.length
    ? visibleBuckets
    : stageBuckets.filter((bucket) => ['source', 'process', 'store', 'serve'].includes(bucket.stage))

  const stageWidth = 220
  const stageGap = 28
  const stageHeaderHeight = 46
  const stagePadding = 14
  const nodeHeight = 72
  const nodeGap = 12
  const canvasPadding = 28
  const footerHeight = 24
  const annotationRows = Math.ceil(Math.min(options?.annotations?.length ?? 0, 6) / 3)
  const annotationHeight = annotationRows ? annotationRows * 86 + 20 : 0
  const innerHeight = Math.max(
    320,
    ...buckets.map(
      (bucket) =>
        stageHeaderHeight +
        stagePadding * 2 +
        Math.max(bucket.nodes.length, 1) * nodeHeight +
        Math.max(bucket.nodes.length - 1, 0) * nodeGap,
    ),
  )
  const width = canvasPadding * 2 + buckets.length * stageWidth + Math.max(0, buckets.length - 1) * stageGap
  const height = canvasPadding * 2 + innerHeight + annotationHeight + footerHeight

  const stageX = new Map<ArchitectureStage, number>()
  const nodePosition = new Map<string, { x: number; y: number; width: number; height: number }>()

  const stageRects = buckets
    .map((bucket, index) => {
      const x = canvasPadding + index * (stageWidth + stageGap)
      const y = canvasPadding
      stageX.set(bucket.stage, x)
      const meta = ARCHITECTURE_STAGE_META[bucket.stage]
      const stageHeight = innerHeight

      const empty = !bucket.nodes.length
      const nodesMarkup = empty
        ? `<rect x="${x + stagePadding}" y="${y + stageHeaderHeight + stagePadding}" width="${stageWidth - stagePadding * 2}" height="${nodeHeight}" rx="14" fill="rgba(15, 23, 42, 0.35)" stroke="rgba(148, 163, 184, 0.18)" /><text x="${x + stagePadding + 14}" y="${y + stageHeaderHeight + stagePadding + 28}" fill="#94a3b8" font-size="13" font-family="Inter, Arial, sans-serif">No mapped resources</text>`
        : bucket.nodes
            .map((node, nodeIndex) => {
              const nodeX = x + stagePadding
              const nodeY = y + stageHeaderHeight + stagePadding + nodeIndex * (nodeHeight + nodeGap)
              const nodeWidth = stageWidth - stagePadding * 2
              nodePosition.set(node.id, { x: nodeX, y: nodeY, width: nodeWidth, height: nodeHeight })
              const labelLines = wrapNodeLabel(node.shortLabel)
              const metaLine = `${node.familyLabel} • ${node.nodeCount} item${node.nodeCount > 1 ? 's' : ''}`
              const detailLine = node.resourceGroups[0] ? clip(node.resourceGroups[0], 28) : 'shared scope'
              return `
                <rect x="${nodeX}" y="${nodeY}" width="${nodeWidth}" height="${nodeHeight}" rx="14" fill="rgba(15, 23, 42, 0.92)" stroke="rgba(148, 163, 184, 0.18)" />
                <rect x="${nodeX + 12}" y="${nodeY + 12}" width="8" height="${nodeHeight - 24}" rx="4" fill="${meta.accent}" />
                ${renderSvgTextLines(nodeX + 30, nodeY + 28, labelLines, '#eff6ff', 13)}
                <text x="${nodeX + 30}" y="${nodeY + 52}" fill="#9fb0c9" font-size="11" font-family="Inter, Arial, sans-serif">${escapeXml(clip(metaLine, 30))}</text>
                <text x="${nodeX + 30}" y="${nodeY + 66}" fill="#7dd3fc" font-size="11" font-family="Inter, Arial, sans-serif">${escapeXml(detailLine)}</text>
              `
            })
            .join('')

      return `
        <g>
          <rect x="${x}" y="${y}" width="${stageWidth}" height="${stageHeight}" rx="24" fill="${meta.tint}" stroke="rgba(148, 163, 184, 0.18)" />
          <text x="${x + 18}" y="${y + 28}" fill="${meta.color}" font-size="16" font-weight="700" font-family="Inter, Arial, sans-serif">${escapeXml(meta.label)}</text>
          <text x="${x + 18}" y="${y + 44}" fill="#9fb0c9" font-size="11" font-family="Inter, Arial, sans-serif">${escapeXml(clip(bucket.description, 34))}</text>
          ${nodesMarkup}
        </g>
      `
    })
    .join('')

  const arrowMarker = `
    <defs>
      <marker id="arch-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#7dd3fc" />
      </marker>
    </defs>
  `

  const edgeMarkup = edges
    .filter((edge) => edge.sourceStage !== edge.targetStage)
    .map((edge) => {
      const source = nodePosition.get(edge.sourceId)
      const target = nodePosition.get(edge.targetId)
      if (!source || !target) {
        return ''
      }

      const sourceCenterX = source.x + source.width
      const sourceCenterY = source.y + source.height / 2
      const targetCenterX = target.x
      const targetCenterY = target.y + target.height / 2
      const midX = sourceCenterX + Math.max(28, (targetCenterX - sourceCenterX) / 2)
      const meta = ARCHITECTURE_STAGE_META[edge.sourceStage]
      const labelX = midX + 4
      const labelY = (sourceCenterY + targetCenterY) / 2 - 6
      const countLabel = edge.count > 1 ? `${edge.count} links` : edge.kinds.includes('synthetic') ? 'flow' : '1 link'

      return `
        <path d="M ${sourceCenterX} ${sourceCenterY} H ${midX} V ${targetCenterY} H ${targetCenterX - 8}" fill="none" stroke="${meta.color}" stroke-width="2.5" stroke-linecap="round" marker-end="url(#arch-arrow)" opacity="0.92" />
        <rect x="${labelX - 4}" y="${labelY - 11}" width="52" height="16" rx="8" fill="rgba(15, 23, 42, 0.82)" />
        <text x="${labelX}" y="${labelY}" fill="#dbeafe" font-size="10" font-family="Inter, Arial, sans-serif">${escapeXml(countLabel)}</text>
      `
    })
    .join('')

  const annotationMarkup = (options?.annotations ?? [])
    .slice(0, 6)
    .map((annotation, index) => {
      const cardWidth = 260
      const cardHeight = 68
      const col = index % 3
      const row = Math.floor(index / 3)
      const x = canvasPadding + col * (cardWidth + 18)
      const y = canvasPadding + innerHeight + 18 + row * (cardHeight + 16)
      const toneColor = annotation.tone === 'warning' ? '#fb923c' : annotation.tone === 'info' ? '#60a5fa' : '#facc15'
      const lines = wrapNodeLabel(annotation.text).map((line) => clip(line, 28))
      return `
        <g>
          <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="14" fill="rgba(15, 23, 42, 0.9)" stroke="${toneColor}" opacity="0.96" />
          <text x="${x + 14}" y="${y + 22}" fill="${toneColor}" font-size="11" font-weight="700" font-family="Inter, Arial, sans-serif">${escapeXml(annotation.tone.toUpperCase())}</text>
          ${renderSvgTextLines(x + 14, y + 42, lines, '#e2e8f0', 12)}
        </g>
      `
    })
    .join('')

  const legend = ARCHITECTURE_STAGE_ORDER.map((stage) => ARCHITECTURE_STAGE_META[stage])
    .map(
      (meta, index) => `
        <rect x="${canvasPadding + index * 108}" y="${height - 18}" width="10" height="10" rx="5" fill="${meta.color}" />
        <text x="${canvasPadding + index * 108 + 16}" y="${height - 9}" fill="#9fb0c9" font-size="10" font-family="Inter, Arial, sans-serif">${escapeXml(meta.label)}</text>
      `,
    )
    .join('')

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
      <rect width="${width}" height="${height}" fill="#0b1220" rx="28" />
      ${arrowMarker}
      ${edgeMarkup}
      ${stageRects}
      ${annotationMarkup}
      ${legend}
    </svg>
  `

  return { svg, width, height }
}
