import assert from 'node:assert/strict'

import { parseCopilotAnswerSections } from '../frontend/src/components/copilotAnswerParser.ts'

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

console.log('✅ copilot_answer_parser_smoke.mts: all assertions passed')
