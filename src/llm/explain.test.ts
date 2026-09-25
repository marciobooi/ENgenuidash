import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EXPLAIN_SYSTEM_PROMPT, explainPrompt } from './prompt'
import { withoutUnfinishedSentence } from './useLocalLLM'

// "Explain these figures" with the model: it gets the dashboard's own facts, nothing else.
test('the explanation prompt carries the indicator, its description, the key facts and the data', () => {
  const prompt = explainPrompt(
    { title: 'Gross available energy', subtitle: 'EU-27 · ktoe', summary: ['Oil is the largest share in 2024: 37.8%.'], context: 'Eurostat: Gross available energy\n- Oil: 2023: 500; 2024: 490' },
    { description: 'Gross available energy is the overall supply of energy.', insights: ['Renewables gained the most share since 2013 (+7.2 pp).'] },
    'de',
  )
  assert.match(prompt, /Explain this dashboard: Gross available energy \(EU-27 · ktoe\)/)
  assert.match(prompt, /What the indicator measures \(Eurostat\): Gross available energy is/)
  assert.match(prompt, /- Renewables gained the most share since 2013/)
  assert.match(prompt, /2024: 490/)
  assert.match(prompt, /Write in German\.$/)
  assert.match(EXPLAIN_SYSTEM_PROMPT, /never invent numbers/)
})

test('a reply cut by the length limit loses its unfinished last sentence', () => {
  assert.equal(withoutUnfinishedSentence('Spain rose. Germany rose too.\n\nO'), 'Spain rose. Germany rose too.')
  assert.equal(withoutUnfinishedSentence('Spain rose. Germany rose by 12.2 pp since'), 'Spain rose.')
  assert.equal(withoutUnfinishedSentence('A complete answer.'), 'A complete answer.')
  assert.equal(withoutUnfinishedSentence('no sentence end at all'), 'no sentence end at all')
})
