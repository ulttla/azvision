import assert from 'node:assert/strict'

import { parseCopilotAnswerSections } from '../frontend/src/components/copilotAnswerParser.ts'

// --- existing: basic patterns (unchanged contract) ---
const inlineBoldColon = parseCopilotAnswerSections('**요약:** 현재 토폴로지 기준입니다.\n추가 본문', '답변')
assert.equal(inlineBoldColon.length, 1)
assert.equal(inlineBoldColon[0].heading, '요약')
assert.deepEqual(inlineBoldColon[0].body, ['현재 토폴로지 기준입니다.', '추가 본문'])

const boldOutsideColon = parseCopilotAnswerSections('**Summary**: Read-only checks only.', 'Answer')
assert.equal(boldOutsideColon.length, 1)
assert.equal(boldOutsideColon[0].heading, 'Summary')
assert.deepEqual(boldOutsideColon[0].body, ['Read-only checks only.'])

const headingOnly = parseCopilotAnswerSections('Risks / unknowns:\nNo live packet validation.', 'Answer')
assert.equal(headingOnly.length, 1)
assert.equal(headingOnly[0].heading, 'Risks / unknowns')
assert.deepEqual(headingOnly[0].body, ['No live packet validation.'])

const boldEmphasisBody = parseCopilotAnswerSections('**Bold emphasis** in the middle of a sentence.', 'Answer')
assert.equal(boldEmphasisBody.length, 1)
assert.equal(boldEmphasisBody[0].heading, 'Answer')
assert.deepEqual(boldEmphasisBody[0].body, ['**Bold emphasis** in the middle of a sentence.'])

const plainInlineColonBody = parseCopilotAnswerSections('Note: this is important context.', 'Answer')
assert.equal(plainInlineColonBody.length, 1)
assert.equal(plainInlineColonBody[0].heading, 'Answer')
assert.deepEqual(plainInlineColonBody[0].body, ['Note: this is important context.'])

const fallback = parseCopilotAnswerSections('No markers here.\nSecond line.', 'Answer')
assert.equal(fallback.length, 1)
assert.equal(fallback[0].heading, 'Answer')
assert.deepEqual(fallback[0].body, ['No markers here.', 'Second line.'])

// --- edge: empty / whitespace-only input ---
const emptyStr = parseCopilotAnswerSections('')
assert.deepEqual(emptyStr, [], 'empty string → []')

const whitespaceOnly = parseCopilotAnswerSections('  \n  \n  ')
assert.deepEqual(whitespaceOnly, [], 'whitespace-only → []')

// --- edge: h3 heading (###) ---
const h3 = parseCopilotAnswerSections('### Summary\nBullet one.\nBullet two.', 'Answer')
assert.equal(h3.length, 1)
assert.equal(h3[0].heading, 'Summary')
assert.deepEqual(h3[0].body, ['Bullet one.', 'Bullet two.'])

// --- edge: mix of h2, h3, and h4 ---
const mixedH = parseCopilotAnswerSections('## Risk Analysis\nHigh impact items.\n### Mitigation\nApply NSG rules.\n#### Follow-up\nConfirm routing tables.', 'Answer')
assert.equal(mixedH.length, 3)
assert.equal(mixedH[0].heading, 'Risk Analysis')
assert.deepEqual(mixedH[0].body, ['High impact items.'])
assert.equal(mixedH[1].heading, 'Mitigation')
assert.deepEqual(mixedH[1].body, ['Apply NSG rules.'])
assert.equal(mixedH[2].heading, 'Follow-up')
assert.deepEqual(mixedH[2].body, ['Confirm routing tables.'])

// --- edge: numbered list heading with inline body ---
const numberedHeading = parseCopilotAnswerSections('1. Summary: Found 3 NSG gaps\n2. Risk: No DDoS protection', 'Answer')
assert.equal(numberedHeading.length, 2)
assert.equal(numberedHeading[0].heading, 'Summary')
assert.deepEqual(numberedHeading[0].body, ['Found 3 NSG gaps'])
assert.equal(numberedHeading[1].heading, 'Risk')
assert.deepEqual(numberedHeading[1].body, ['No DDoS protection'])

// --- edge: bullet heading with inline body ---
const bulletHeading = parseCopilotAnswerSections('- Architecture risks: Single region deployment\n- Cost risks: Reserved instances not used', 'Answer')
assert.equal(bulletHeading.length, 2)
assert.equal(bulletHeading[0].heading, 'Architecture risks')
assert.deepEqual(bulletHeading[0].body, ['Single region deployment'])
assert.equal(bulletHeading[1].heading, 'Cost risks')
assert.deepEqual(bulletHeading[1].body, ['Reserved instances not used'])

// --- edge: numbered heading followed by body on next line ---
const numberedHeadingBodyNextLine = parseCopilotAnswerSections('1. Architecture Risks:\nSingle region deployment.\nNo availability zones.', 'Answer')
assert.equal(numberedHeadingBodyNextLine.length, 1)
assert.equal(numberedHeadingBodyNextLine[0].heading, 'Architecture Risks')
assert.deepEqual(numberedHeadingBodyNextLine[0].body, ['Single region deployment.', 'No availability zones.'])

// --- edge: Korean heading with longer text ---
const koreanLongHeading = parseCopilotAnswerSections('아키텍처 리스크 평가 결과:\n현재 가용성 영역 미사용 상태입니다.', '답변')
assert.equal(koreanLongHeading.length, 1)
assert.equal(koreanLongHeading[0].heading, '아키텍처 리스크 평가 결과')
assert.deepEqual(koreanLongHeading[0].body, ['현재 가용성 영역 미사용 상태입니다.'])

// --- edge: multi-section with various patterns ---
const multiSection = parseCopilotAnswerSections(
  '## 관찰된 증거\n' +
  'NSG 규칙이 모든 포트를 허용합니다.\n' +
  '### 위험 요소\n' +
  'DDoS 공격에 취약합니다.\n' +
  '1. 권장 조치: 포트 범위 최소화\n' +
  '- 추가 확인: WAF 정책 검토',
  '답변'
)
assert.equal(multiSection.length, 4)
assert.equal(multiSection[0].heading, '관찰된 증거')
assert.equal(multiSection[1].heading, '위험 요소')
assert.equal(multiSection[2].heading, '권장 조치')
assert.equal(multiSection[3].heading, '추가 확인')

// --- edge: bold heading without colon is not parsed as heading ---
const boldWithoutColon = parseCopilotAnswerSections('**Important risk** detected in the topology.', 'Answer')
assert.equal(boldWithoutColon.length, 1)
assert.equal(boldWithoutColon[0].heading, 'Answer')
assert.ok(boldWithoutColon[0].body[0].includes('**Important risk**'))

// --- edge: numbered bullet without heading text is not split ---
const plainNumberedList = parseCopilotAnswerSections('1. First item\n2. Second item\n3. Third item', 'Answer')
assert.equal(plainNumberedList.length, 1)
assert.equal(plainNumberedList[0].heading, 'Answer')

// --- edge: dashes without heading colon ---
const plainDasheList = parseCopilotAnswerSections('- First bullet\n- Second bullet', 'Answer')
assert.equal(plainDasheList.length, 1)
assert.equal(plainDasheList[0].heading, 'Answer')

// --- edge: colon in body text (not heading) ---
const colonInBody = parseCopilotAnswerSections('Key insight: this is not a heading because it lacks an initial character set match pattern.', 'Answer')
assert.equal(colonInBody.length, 1)
assert.equal(colonInBody[0].heading, 'Answer')
assert.ok(colonInBody[0].body[0].includes('Key insight:'))

console.log('✅ copilot_answer_parser_smoke.mts: all assertions passed')
