export type CopilotSection = { heading: string; body: string[]; isSuggestions?: boolean }
type CopilotHeadingMatch = { heading: string; inlineBody?: string }

/**
 * Parse a copilot answer into structured sections.
 * Detects common heading patterns: `## Heading`, `### Heading`, `**Heading:**`, `**Heading:** inline text`,
 * `**Heading**: inline text`, `1. Heading: inline text`, `- Heading: inline text`,
 * and standalone Korean/English `Heading:` labels.
 * Falls back to a single-section rendering when no markers are found.
 * Returns an empty array for empty or whitespace-only input.
 */
export function parseCopilotAnswerSections(answer: string, fallbackHeading = 'Answer'): CopilotSection[] {
  const trimmed = answer.trim()
  if (trimmed.length === 0) return []

  const lines = trimmed.split('\n').map((line) => line.trimEnd())
  const sections: CopilotSection[] = []
  let current: CopilotSection | null = null

  const headingPatterns: Array<{ regex: RegExp; extract: (match: RegExpMatchArray) => CopilotHeadingMatch }> = [
    // Markdown h2/h3 headings: ## Heading, ### Heading
    { regex: /^#{2,3}\s+(.+?)(?:#+)?$/, extract: (match) => ({ heading: match[1].trim() }) },
    // Bold colon with inline body: **Heading:** inline text
    {
      regex: /^\*\*(.+?):\*\*\s*(.*)$/,
      extract: (match) => ({ heading: match[1].trim(), inlineBody: match[2]?.trim() }),
    },
    // Bold outside colon: **Heading**: inline text
    {
      regex: /^\*\*(.+?)\*\*\s*:\s*(.*)$/,
      extract: (match) => ({ heading: match[1].trim(), inlineBody: match[2]?.trim() }),
    },
    // Numbered/bullet heading with optional inline body: 1. Heading: inline, - Heading:
    {
      regex: /^(?:\d+[\.\)]\s*|-\s*)(?![\*\d])([A-Za-z가-힣][A-Za-z가-힣\s/·-]{1,60}):\s*(.*)$/u,
      extract: (match) => ({ heading: match[1].trim(), inlineBody: match[2]?.trim() }),
    },
    // Standalone heading label: Heading:
    {
      regex: /^([A-Za-z가-힣][A-Za-z가-힣\s/·-]{1,60}):\s*$/u,
      extract: (match) => ({ heading: match[1].trim() }),
    },
  ]

  function finalizeSection() {
    if (current && current.body.length > 0) {
      sections.push(current)
    }
    current = null
  }

  for (const line of lines) {
    let matched = false
    for (const { regex, extract } of headingPatterns) {
      const match = line.match(regex)
      if (match) {
        finalizeSection()
        const headingMatch = extract(match)
        current = { heading: headingMatch.heading.replace(/:$/, ''), body: [] }
        if (headingMatch.inlineBody) {
          current.body.push(headingMatch.inlineBody)
        }
        matched = true
        break
      }
    }
    if (matched) continue

    if (line.length === 0) {
      if (current && current.body.length > 0) {
        current.body.push('')
      }
      continue
    }

    if (!current) {
      current = { heading: fallbackHeading, body: [] }
    }
    current.body.push(line)
  }
  finalizeSection()

  if (sections.length === 0) {
    const body = lines.filter((line) => line.length > 0)
    return body.length > 0 ? [{ heading: fallbackHeading, body }] : []
  }

  return sections
}
