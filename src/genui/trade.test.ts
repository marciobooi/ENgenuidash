import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createScopeChecker } from '../llm/energyScope'
import { buildKnowledgeIndex } from '../llm/knowledge'
import { buildVocabulary } from '../llm/vocabulary'
import { tradeOf } from './trade'
import { routeMessage, type Route } from './route'
import type { Plan } from './types'

// Energy trade by partner, as Eurostat's entrade visualisation: questions about partners open the
// trade dashboard, follow-ups change its country, year, flow or fuel, one named partner stays a
// trend (the planner).
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


test('questions about partners open the trade dashboard', () => {
  const cases: [string, { dataset: string; geo: string; siec?: string; year?: string }][] = [
    ['imports of natural gas by partner country France 2024', { dataset: 'nrg_ti_gas', geo: 'FR', year: '2024' }],
    ['where does Germany import oil from?', { dataset: 'nrg_ti_oil', geo: 'DE' }],
    ['oil exports of the Netherlands by partner', { dataset: 'nrg_te_oil', geo: 'NL' }],
    ['electricity imports of Italy by country of origin', { dataset: 'nrg_ti_eh', geo: 'IT' }],
    ['energy trade of Spain', { dataset: 'nrg_ti_gas', geo: 'ES' }],
    ['crude oil suppliers of Italy', { dataset: 'nrg_ti_oil', geo: 'IT', siec: 'O4100_TOT' }],
    ['Woher bezieht Deutschland sein Erdgas?', { dataset: 'nrg_ti_gas', geo: 'DE' }],
    ['fournisseurs de charbon de la Pologne', { dataset: 'nrg_ti_sff', geo: 'PL' }],
    ['EU imports of coal by partner', { dataset: 'nrg_ti_sff', geo: 'EU27_2020' }],
  ]
  for (const [q, want] of cases) {
    const r = route(q)
    const p = planOf(r)
    assert.ok(p?.trade, `${q}: ${r.kind} ${p?.dataset}`)
    assert.equal(p.dataset, want.dataset, q)
    assert.equal(p.filters.geo, want.geo, q)
    if (want.siec) assert.equal(p.filters.siec, want.siec, q)
    if (want.year) assert.equal(p.focusPeriod, want.year, q)
    assert.deepEqual(tradeOf(p.dataset), p.trade, q)
  }
})

test('one named partner stays a trend', () => {
  const p = planOf(route('coal imports of Poland from Russia'))
  assert.ok(p && !p.trade && p.filters.partner === 'RU')
})

test('follow-ups change the trade dashboard on screen', () => {
  const sheet = planOf(route('natural gas imports of France by partner 2024'))!
  const cases: [string, (p: Plan) => boolean][] = [
    ['and Germany?', (p) => p.filters.geo === 'DE' && p.dataset === 'nrg_ti_gas'],
    ['2019', (p) => p.focusPeriod === '2019'],
    ['exports', (p) => p.dataset === 'nrg_te_gas' && p.trade?.flow === 'exp'],
    ['oil', (p) => p.dataset === 'nrg_ti_oil' && p.filters.siec === 'O4000' && p.filters.unit === 'THS_T'],
  ]
  for (const [q, ok] of cases) {
    const r = route(q, sheet)
    assert.equal(r.kind, 'refine', q)
    assert.ok(ok(planOf(r)!), `${q}: ${JSON.stringify(planOf(r))}`)
  }
})

test('a shared trade link keeps the dashboard', async () => {
  const { encodePlan, decodePlan } = await import('../app/shareLink')
  const p = planOf(route('where does Germany import oil from?'))!
  assert.deepEqual(decodePlan(encodePlan(p), dict)?.trade, { flow: 'imp', fuel: 'oil' })
})
