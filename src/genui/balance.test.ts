import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createScopeChecker } from '../llm/energyScope'
import { buildKnowledgeIndex } from '../llm/knowledge'
import { buildVocabulary } from '../llm/vocabulary'
import { balanceLines, FUEL_GROUPS } from './balance'
import { routeMessage, type Route } from './route'
import type { Plan } from './types'

// Energy balance sheets, as Eurostat's enbal visualisation: questions open the sheet, follow-ups
// change its country, year, unit or fuels, and every enbal line and fuel is in nrg_bal_c.
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

test('every enbal line and fuel is in nrg_bal_c', () => {
  const dims = Object.fromEntries(dict.datasets.nrg_bal_c.dimensions.map((d: { id: string; codes: string[] }) => [d.id, d.codes]))
  const lines = balanceLines()
  assert.equal(lines.length, 122)
  assert.deepEqual(lines.filter((l) => !dims.nrg_bal.includes(l.code)), [])
  assert.deepEqual(Object.values(FUEL_GROUPS).flat().filter((c) => !dims.siec.includes(c)), [])
})

test('balance sheet questions open the sheet', () => {
  const cases: [string, Partial<{ geo: string; year: string; unit: string; fuels: string }>][] = [
    ['show me energy balances for Total - main fuel families, 2024 in europe', { geo: 'EU27_2020', year: '2024', fuels: 'main' }],
    ['energy balance of Germany 2023', { geo: 'DE', year: '2023', fuels: 'main' }],
    ['energy balance for coal in Poland', { geo: 'PL', fuels: 'coal' }],
    ['Energiebilanz Frankreich 2022 in GWh', { geo: 'FR', year: '2022', unit: 'GWH' }],
    ['bilan énergétique de l’Espagne en TJ', { geo: 'ES', unit: 'TJ' }],
    ['energy balance of Austria for combustible renewables', { geo: 'AT', fuels: 'combustible' }],
    ['energy balance of Italy for non-combustible renewables', { geo: 'IT', fuels: 'nonCombustible' }],
    ['energy balance of Belgium, electricity and heat', { geo: 'BE', fuels: 'electricityHeat' }],
  ]
  for (const [q, want] of cases) {
    const p = planOf(route(q))
    assert.ok(p?.balance, `${q}: ${route(q).kind}`)
    if (want.geo) assert.equal(p.filters.geo, want.geo, q)
    if (want.year) assert.equal(p.focusPeriod, want.year, q)
    assert.equal(p.filters.unit, want.unit ?? 'KTOE', q)
    if (want.fuels) assert.equal(p.balance.fuels, want.fuels, q)
  }
})

test('a definition of the energy balance stays a written answer', () => {
  assert.equal(route('what is an energy balance?').kind, 'answer')
})

test('follow-ups change the sheet on screen', () => {
  const sheet = planOf(route('energy balance of the EU 2024'))!
  const cases: [string, (p: Plan) => boolean][] = [
    ['and Germany?', (p) => p.filters.geo === 'DE' && p.focusPeriod === '2024'],
    ['2019', (p) => p.focusPeriod === '2019' && p.filters.geo === 'EU27_2020'],
    ['in GWh', (p) => p.filters.unit === 'GWH'],
    ['coal', (p) => p.balance?.fuels === 'coal'],
  ]
  for (const [q, ok] of cases) {
    const r = route(q, sheet)
    assert.equal(r.kind, 'refine', q)
    assert.ok(ok(planOf(r)!), q)
  }
  // A new question is not a change of the sheet.
  const other = planOf(route('household electricity prices in Spain', sheet))
  assert.ok(other && !other.balance)
})

test('a shared link keeps the balance sheet', async () => {
  const { encodePlan, decodePlan } = await import('../app/shareLink')
  const sheet = planOf(route('energy balance of Germany 2023 for coal'))!
  assert.deepEqual(decodePlan(encodePlan(sheet), dict)?.balance, { fuels: 'coal' })
})

test('an older balance link without the sheet is asked again, not drawn with one flow', async () => {
  const { encodePlan, decodePlan } = await import('../app/shareLink')
  const old = planOf(route('energy balance of Germany 2023'))!
  delete old.balance
  assert.equal(decodePlan(encodePlan(old), dict), null)
})
