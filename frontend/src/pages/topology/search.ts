import type { TopologyNode } from '../../lib/api'

import { SEARCH_GROUP_ORDER, UI_TEXT, type ResourceCategory, type SearchResult, type SearchResultGroup, type SearchScope } from './model'
import { getResourceCategory, isManagedInstanceNode } from './topology-helpers'

function normalizeSearchValue(value?: string | null) {
  return String(value ?? '').trim().toLowerCase()
}

export function searchTopologyNodes(nodes: TopologyNode[], query: string, scope: SearchScope): SearchResult[] {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery) {
    return []
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
  if (!tokens.length) {
    return []
  }

  const results: SearchResult[] = []

  for (const node of nodes) {
    const childSampleNames = (node.child_summary?.sample_names ?? []).filter(
      (item): item is string => typeof item === 'string' && Boolean(item.trim()),
    )

    if (scope === 'child-only' && !node.parent_resource_id) {
      continue
    }

    if (scope === 'collapsed-preview') {
      if (!node.child_summary?.collapsed || !childSampleNames.length) {
        continue
      }

      let score = 0
      let matchedAllTokens = true
      const matchedPreviewNames = new Set<string>()

      for (const token of tokens) {
        let matchedThisToken = false

        for (const sampleName of childSampleNames) {
          const normalizedSampleName = normalizeSearchValue(sampleName)
          if (!normalizedSampleName) {
            continue
          }

          if (normalizedSampleName.startsWith(token)) {
            score += 34
            matchedPreviewNames.add(sampleName)
            matchedThisToken = true
            continue
          }

          if (normalizedSampleName.includes(token)) {
            score += 22
            matchedPreviewNames.add(sampleName)
            matchedThisToken = true
          }
        }

        if (!matchedThisToken) {
          matchedAllTokens = false
          break
        }
      }

      if (!matchedAllTokens) {
        continue
      }

      if (childSampleNames.some((sampleName) => normalizeSearchValue(sampleName) === normalizedQuery)) {
        score += 18
      }

      if (isManagedInstanceNode(node)) {
        score += 8
      }

      results.push({
        node,
        score,
        matchedFields: ['child preview'],
        matchedPreviewNames: [...matchedPreviewNames].slice(0, 3),
      })

      continue
    }

    const displayName = normalizeSearchValue(node.display_name)
    const nodeKey = normalizeSearchValue(node.node_key)
    const nodeType = normalizeSearchValue(node.node_type)
    const nodeRef = normalizeSearchValue(node.node_ref)
    const resourceType = normalizeSearchValue(node.resource_type)
    const resourceGroup = normalizeSearchValue(node.resource_group)
    const location = normalizeSearchValue(node.location)

    let score = 0
    const matchedFields = new Set<string>()
    let matchedAllTokens = true

    for (const token of tokens) {
      let matchedThisToken = false

      if (displayName.startsWith(token)) {
        score += 36
        matchedFields.add('name')
        matchedThisToken = true
      } else if (displayName.includes(token)) {
        score += 24
        matchedFields.add('name')
        matchedThisToken = true
      }

      if (resourceGroup && resourceGroup.includes(token)) {
        score += 16
        matchedFields.add('resource group')
        matchedThisToken = true
      }

      if (resourceType && resourceType.includes(token)) {
        score += 14
        matchedFields.add('resource type')
        matchedThisToken = true
      }

      if (location && location.includes(token)) {
        score += 10
        matchedFields.add('location')
        matchedThisToken = true
      }

      if (nodeType && nodeType.includes(token)) {
        score += 8
        matchedFields.add('node type')
        matchedThisToken = true
      }

      if (nodeKey.includes(token)) {
        score += 7
        matchedFields.add('node key')
        matchedThisToken = true
      }

      if (nodeRef.includes(token)) {
        score += 6
        matchedFields.add('node ref')
        matchedThisToken = true
      }

      if (!matchedThisToken) {
        matchedAllTokens = false
        break
      }
    }

    if (!matchedAllTokens) {
      continue
    }

    if (displayName === normalizedQuery) {
      score += 18
    }

    if (isManagedInstanceNode(node)) {
      score += 12
    }

    if (String(node.resource_type ?? '').toLowerCase().includes('managedinstance')) {
      score += 6
    }

    if (node.node_type === 'resourcegroup') {
      score += 4
    }

    results.push({
      node,
      score,
      matchedFields: [...matchedFields],
    })
  }

  return results.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }
    return left.node.display_name.localeCompare(right.node.display_name)
  })
}

function getSearchGroupLabel(category: ResourceCategory) {
  if (category === 'data') {
    return 'Data'
  }
  if (category === 'network') {
    return 'Network'
  }
  if (category === 'web') {
    return 'Web'
  }
  if (category === 'compute') {
    return 'Compute'
  }
  if (category === 'scope') {
    return 'Scope'
  }
  return 'Other'
}

export function buildSearchResultGroups(results: SearchResult[]): SearchResultGroup[] {
  const grouped = new Map<ResourceCategory, SearchResult[]>()

  for (const result of results) {
    const category = getResourceCategory(result.node)
    grouped.set(category, [...(grouped.get(category) ?? []), result])
  }

  return SEARCH_GROUP_ORDER.map((category) => ({
    key: category,
    label: getSearchGroupLabel(category),
    results: grouped.get(category) ?? [],
  })).filter((group) => group.results.length > 0)
}

export function getSearchScopeMeta(scope: SearchScope) {
  if (scope === 'child-only') {
    return {
      label: 'Expanded child nodes',
      placeholder: 'child database name, type, location, node key...',
      hint: UI_TEXT.searchScopes.childOnly.hint,
      empty: UI_TEXT.searchScopes.childOnly.empty,
    }
  }

  if (scope === 'collapsed-preview') {
    return {
      label: 'Collapsed child previews',
      placeholder: 'collapsed child sample name...',
      hint: UI_TEXT.searchScopes.collapsedPreview.hint,
      empty: UI_TEXT.searchScopes.collapsedPreview.empty,
    }
  }

  return {
    label: 'Visible nodes',
    placeholder: 'name, resource group, type, location, node key...',
    hint: UI_TEXT.searchScopes.visible.hint,
    empty: UI_TEXT.searchScopes.visible.empty,
  }
}
