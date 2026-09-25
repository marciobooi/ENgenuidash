import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { setGlossaryFile } from '../llm/glossary'
import { buildKnowledgeIndex, setKnowledgePassages } from '../llm/knowledge'
import { runAnswerEval } from './runAnswers'

// Answer quality without the model (see answerCases.ts): routes, definitions and quotes.
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))

test('answer cases: right route, and the facts a correct answer must contain', async () => {
  setGlossaryFile(read('glossary.json'))
  const { passages } = read('knowledge.json')
  setKnowledgePassages(passages)
  const results = await runAnswerEval(read('dictionary.json'), read('codelists.json'), buildKnowledgeIndex(passages).docFreq)
  const failed = results.filter((r) => !r.ok).map((r) => `${r.case.q} → ${r.problems.join('; ')}${r.text ? ` — "${r.text.slice(0, 90)}…"` : ''}`)
  assert.deepEqual(failed, [])
})
