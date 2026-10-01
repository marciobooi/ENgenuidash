import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createScopeChecker } from '../llm/energyScope'
import { buildKnowledgeIndex } from '../llm/knowledge'
import { buildVocabulary } from '../llm/vocabulary'
import { routeMessage, type Route } from './route'
import type { Plan } from './types'

// "compare with France", "versus the EU", "compared to the EU average" on each view: the ones
// that can compare do (trade, energy flow, profile, the ordinary dashboards), and the ones that
// show a single country (oil, balance) switch to it instead of building from two ("Oil security: DE,FR").
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const { docFreq } = buildKnowledgeIndex(read('knowledge.json').passages)
const scope = createScopeChecker(dict, codelists)
const vocabulary = buildVocabulary(dict, codelists, scope.places)
const route = (text: string, current: Plan | null = null): Route =>
  routeMessage(text, { current, dict, codelists, classify: scope.classify, unknownWords: (x) => vocabulary.unknownWords(x, docFreq), correct: (w) => vocabulary.correct(w, docFreq), previous: ['x'] })
const planOf = (q: string): Plan => {
  const r = route(q)
  assert.equal(r.kind, 'plan', q)
  return (r as Extract<Route, { kind: 'plan' }>).plan
}
const follow = (current: Plan, q: string): Plan => {
  const r = route(q, current)
  assert.ok(r.kind === 'refine' || r.kind === 'plan', `${q}: ${r.kind}`)
  return (r as Extract<Route, { kind: 'refine' }>).plan
}

test('views that show one country switch to the one asked for, never "DE,FR"', () => {
  for (const q of ['oil security in Germany', 'energy balance of Germany']) {
    const p = follow(planOf(q), 'compare with France')
    assert.equal(p.filters.geo, 'FR', q)
    assert.equal(follow(planOf(q), 'compared to the EU average').filters.geo, 'EU27_2020', q)
  }
})

test('the energy flow diagram compares with another country, the EU or earlier years', () => {
  const flow = planOf('energy flow diagram for Germany')
  assert.equal(follow(flow, 'compare with France').sankey?.compare, 'FR')
  assert.equal(follow(flow, 'compared to the EU average').sankey?.compare, 'EU27_2020')
  assert.equal(follow(flow, 'compare with last year').sankey?.compare, 'y1')
  assert.equal(follow(flow, 'compare with 5 years earlier').sankey?.compare, 'y5')
  assert.equal(follow(follow(flow, 'versus France'), 'no comparison').sankey?.compare, undefined)
  // the country stays
  assert.equal(follow(flow, 'compare with France').filters.geo, 'DE')
})

test('the country profile and the trade view keep their country and name the comparison', () => {
  const profile = planOf('energy profile of Germany')
  assert.equal(follow(profile, 'compare with France').profile?.compare, 'FR')
  assert.equal(follow(profile, 'compared to the EU average').filters.geo, 'DE')
  const trade = planOf('imports of natural gas by partner Germany')
  assert.equal(follow(trade, 'compared to the EU average').trade?.compare, 'EU27_2020')
  assert.equal(follow(trade, 'compare with France').trade?.compare, 'FR')
  // ("last year" is not a place: the trade view already shows the change on the year before)
  const lastYear = route('compare with last year', trade)
  assert.ok(!(lastYear.kind === 'refine' && lastYear.plan.trade?.compare))
})

test('an ordinary dashboard compares by adding the place', () => {
  const p = follow(planOf('renewable share in Germany'), 'compared to the EU average')
  assert.deepEqual(p.filters.geo, ['DE', 'EU27_2020'])
})
