import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { isCurrentBand } from './filters'
import { createScopeChecker } from '../llm/energyScope'
import { buildKnowledgeIndex } from '../llm/knowledge'
import { buildVocabulary } from '../llm/vocabulary'
import { planQuestion } from './planner'
import { priceDatasetOf } from './prices'
import { routeMessage, type Route } from './route'
import type { Plan } from './types'

// Energy price structure, as Eurostat's entrade-like enprices visualisation: questions about the
// price's components open a dedicated breakdown dashboard; "now in components" pivots a plain
// price dashboard (nrg_pc_20X) to its components dataset (nrg_pc_20X_c) without losing the
// country, year or consumption band; follow-ups change country, year, product or consumer type.
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const { docFreq } = buildKnowledgeIndex(read('knowledge.json').passages)
const scope = createScopeChecker(dict, codelists)
const vocabulary = buildVocabulary(dict, codelists, scope.places)

const route = (text: string, current: Plan | null = null): Route =>
  routeMessage(text, {
    current,
    dict,
    codelists,
    classify: scope.classify,
    unknownWords: (x) => vocabulary.unknownWords(x, docFreq),
    correct: (w) => vocabulary.correct(w, docFreq),
    previous: [],
  })
const planOf = (r: Route) => (r.kind === 'plan' || r.kind === 'refine' ? r.plan : null)

test('obsolete pre-2007 consumption bands are filtered out, current ones kept', () => {
  for (const dataset of ['nrg_pc_202', 'nrg_pc_202_c', 'nrg_pc_203', 'nrg_pc_203_c', 'nrg_pc_204', 'nrg_pc_204_c', 'nrg_pc_205', 'nrg_pc_205_c']) {
    const codes = dict.datasets[dataset].dimensions.find((d: { id: string }) => d.id === 'nrg_cons').codes as string[]
    const kept = codes.filter(isCurrentBand)
    // Every dataset's own default is a current band.
    assert.ok(kept.includes(dict.datasets[dataset].defaults.nrg_cons), dataset)
  }
  // A few concrete cases from the dictionary.
  assert.equal(isCurrentBand('TOT_KWH'), true)
  assert.equal(isCurrentBand('KWH1000-2499'), true)
  assert.equal(isCurrentBand('KWH_GE15000'), true)
  assert.equal(isCurrentBand('KWH600'), false) // pre-2007 band DA
  assert.equal(isCurrentBand('MWH2000'), false) // pre-2007 (not the same as MWH2000-19999)
  assert.equal(isCurrentBand('GJ41860_I31'), false) // pre-2007 industrial load factor
})

test('questions about price components open the breakdown dashboard', () => {
  const cases: [string, { dataset: string; geo?: string; year?: string }][] = [
    ['price breakdown of electricity in Germany 2024', { dataset: 'nrg_pc_204_c', geo: 'DE', year: '2024' }],
    ['what does the gas price consist of in France?', { dataset: 'nrg_pc_202_c', geo: 'FR' }],
    ['network costs and taxes in Italy', { dataset: 'nrg_pc_204_c', geo: 'IT' }],
    ['price components for industry in Spain', { dataset: 'nrg_pc_205_c', geo: 'ES' }],
    ['Preiszusammensetzung von Strom in Österreich', { dataset: 'nrg_pc_204_c', geo: 'AT' }],
    ['composition du prix du gaz en Belgique', { dataset: 'nrg_pc_202_c', geo: 'BE' }],
    ['price components', { dataset: 'nrg_pc_204_c', geo: 'EU27_2020' }],
  ]
  for (const [q, want] of cases) {
    const p = planOf(route(q))
    assert.ok(p?.prices, `${q}: ${route(q).kind}`)
    assert.equal(p.dataset, want.dataset, q)
    if (want.geo) assert.equal(p.filters.geo, want.geo, q)
    if (want.year) assert.equal(p.focusPeriod, want.year, q)
    assert.ok(isCurrentBand(String(p.filters.nrg_cons)), q)
  }
})

test('"now in components" pivots the plain price dashboard on screen', () => {
  const base = planQuestion('electricity prices for households in Germany', dict, codelists)
  assert.equal(base.kind, 'plan')
  const plain = (base as { kind: 'plan'; plan: Plan }).plan
  assert.equal(plain.dataset, 'nrg_pc_204')
  for (const q of ['now in components', 'in components', 'add all taxes', 'show components', 'as components']) {
    const r = route(q, plain)
    assert.equal(r.kind, 'refine', `${q}: ${r.kind}`)
    const p = planOf(r)!
    assert.equal(p.dataset, 'nrg_pc_204_c', q)
    assert.equal(p.filters.geo, plain.filters.geo, q)
    assert.ok(p.prices && p.prices.product === 'electricity' && p.prices.consumer === 'household', q)
  }
  // Already on a components dashboard: toComponentsPlan bows out (current.prices is set).
  const sheet = planOf(route('price breakdown of electricity in Germany'))!
  assert.notEqual(route('now in components', sheet).kind, 'plan')
})

test('follow-ups change the price dashboard on screen', () => {
  const sheet = planOf(route('price breakdown of electricity in Germany 2024'))!
  const cases: [string, (p: Plan) => boolean][] = [
    ['and France?', (p) => p.filters.geo === 'FR'],
    ['2022', (p) => p.focusPeriod === '2022'],
    ['gas', (p) => p.dataset === 'nrg_pc_202_c' && p.prices?.product === 'gas'],
    ['for industry', (p) => p.dataset === 'nrg_pc_205_c' && p.prices?.consumer === 'nonHousehold'],
  ]
  for (const [q, ok] of cases) {
    const r = route(q, sheet)
    assert.equal(r.kind, 'refine', q)
    assert.ok(ok(planOf(r)!), `${q}: ${JSON.stringify(planOf(r))}`)
  }
})

test('priceDatasetOf identifies base and components datasets', () => {
  assert.deepEqual(priceDatasetOf('nrg_pc_204'), { product: 'electricity', consumer: 'household', components: false })
  assert.deepEqual(priceDatasetOf('nrg_pc_204_c'), { product: 'electricity', consumer: 'household', components: true })
  assert.deepEqual(priceDatasetOf('nrg_pc_203_c'), { product: 'gas', consumer: 'nonHousehold', components: true })
  assert.equal(priceDatasetOf('nrg_bal_c'), null)
})

test('a shared price link keeps the breakdown dashboard', async () => {
  const { encodePlan, decodePlan } = await import('../app/shareLink')
  const p = planOf(route('price breakdown of electricity in Germany 2024'))!
  assert.deepEqual(decodePlan(encodePlan(p), dict)?.prices, { product: 'electricity', consumer: 'household' })
})
