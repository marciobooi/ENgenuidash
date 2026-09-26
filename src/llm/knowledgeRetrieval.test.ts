import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { answerProblems, missingFacts, MODEL_CASES } from '../eval/modelCases'
import { documentAnswer } from './answers'
import { searchQuery } from './crossLingual'
import { setGlossaryFile } from './glossary'
import { setKnowledgePassages, stem } from './knowledge'
import { modelPrompt } from './prompt'

// The knowledge-base questions (src/eval/modelCases.ts): the facts that answer them must reach
// the model's prompt, and a quote shown as "From Eurostat" must state them. Measured when tuned
// (September 2026): facts in the prompt 12 → 23 of 24 (the 24th is a "why" question without a
// single fact); quotes right 5 → 12, wrong 9 → 0. End to end (quote, else the model): 23-24 of 24
// with Qwen3-1.7B (computers), 20 with Qwen3-0.6B (phones).
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
setKnowledgePassages(read('knowledge.json').passages)
setGlossaryFile(read('glossary.json'))

test('word families share a stem', () => {
  assert.equal(stem('production'), stem('produce'))
  assert.equal(stem('produced'), stem('produce'))
  assert.equal(stem('heating'), 'heat')
  assert.equal(stem('households'), stem('household'))
  assert.equal(stem('2025'), '2025')
})

test('the facts of the knowledge-base questions reach the model', async () => {
  const missing: string[] = []
  for (const c of MODEL_CASES) {
    const { prompt } = await modelPrompt(c.q, dict, codelists, c.lang, { conceptual: true })
    if (missingFacts(c, prompt).length) missing.push(c.q)
  }
  assert.ok(missing.length <= 1, `facts missing for ${missing.length}: ${missing.join(' | ')}`)
})

test('quotes shown as "From Eurostat" answer the question', async () => {
  const wrong: string[] = []
  let right = 0
  for (const c of MODEL_CASES) {
    const a = await documentAnswer(searchQuery(c.q))
    if (a.kind !== 'quote') continue
    if (answerProblems(c, a.text).length) wrong.push(`${c.q} → ${a.text.slice(0, 80)}`)
    else right++
  }
  assert.ok(right >= 12, `only ${right} right quotes`)
  assert.ok(wrong.length === 0, `wrong quotes:\n${wrong.join('\n')}`)
})

test('a number in an answer must be in its sources, however it is written', async () => {
  const { unsupportedNumbers } = await import('../eval/modelCases')
  assert.deepEqual(unsupportedNumbers('1.6 MWh (1,545 kWh) in 2024; a 42,5 % target', 'was 1.6 MWh per capita (1 545 kWh) in 2024 … from 32% to 42.5%'), [])
  assert.deepEqual(unsupportedNumbers('The EU produced 19 billion tons of hard coal in 2025.', 'In 2025, the EU production of hard coal was 44 million tonnes.'), ['19'])
})
