export type CopilotSection = { heading: string; body: string[]; isSuggestions?: boolean }
type CopilotHeadingMatch = { heading: string; inlineBody?: string }

/**
 * Parse a copilot answer into structured sections.
 * Detects common heading patterns: `## Heading`, `**Heading:**`, `**Heading:** inline text`,
 * `**Heading**: inline text`, and standalone Korean/English `Heading:` labels.
 * Falls back to a single-section rendering when no markers are found.
 */
export function parseCopilotAnswerSections(answer: string, fallbackHeading = 'Answer'): CopilotSection[] {
  const lines = answer.split('\n').map((line) => line.trimEnd())
  const sections: CopilotSection[] = []
  let current: CopilotSection | null = null

  const headingPatterns: Array<{ regex: RegExp; extract: (match: RegExpMatchArray) => CopilotHeadingMatch }> = [
    { regex: /^##\s+(.+?)(?:#+)?$/, extract: (match) => ({ heading: match[1].trim() }) },
    {
      regex: /^\*\*(.+?):\*\*\s*(.*)$/,
      extract: (match) => ({ heading: match[1].trim(), inlineBody: match[2]?.trim() }),
    },
    {
      regex: /^\*\*(.+?)\*\*\s*:\s*(.*)$/,
      extract: (match) => ({ heading: match[1].trim(), inlineBody: match[2]?.trim() }),
    },
    {
      regex: /^([A-Za-z가-힣][A-Za-z가-힣\s/·-]{1,40}):\s*$/u,
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
    return [{ heading: fallbackHeading, body: lines.filter((line) => line.length > 0) }]
  }

  return sections
}
