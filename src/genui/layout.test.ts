import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { decodePlan, encodePlan } from '../app/shareLink'
import { STRINGS } from '../i18n'
import { installEurostatStub } from '../test/eurostatStub'
import { buildDashboard } from './execute'
import { filterControls } from './filters'
import { arrange, describeVariants, topicSeed, variantPrompt } from './layout'
import { planQuestion, refinePlan } from './planner'
import { dashStrings } from './strings'
import type { DashboardSpec, Plan, WidgetSpec } from './types'
import { sanitizeSpec } from './validate'

// Page templates (layout.ts), the toolbar order, shareable links and the model's layout choice.
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const s = dashStrings(STRINGS.en)
let restore: () => void
before(() => {
  restore = installEurostatStub(dict, codelists)
})
after(() => restore())

const plan = (q: string): Plan => {
  const r = planQuestion(q, dict, codelists)
  assert.equal(r.kind, 'plan', `${q} → ${r.kind}`)
  return (r as { plan: Plan }).plan
}
const dash = (q: string) => buildDashboard(plan(q), dict, 'en', s)
const kind = (d: DashboardSpec) => d.presentation.template.replace(/-[ab]$/, '')
const charts = (d: DashboardSpec) => d.widgets.filter((w) => !['kpis', 'table', 'answer', 'text'].includes(w.type))

test('each kind of question gets its own template', async () => {
  const cases: [string, string][] = [
    ['Compare energy import dependency of all EU countries in 2023', 'compare'],
    ['Renewable energy share in Spain, France and Germany since 2010', 'trend'],
    ['Oil consumption in Spain', 'single'],
    ['Electricity mix in Germany', 'mix'],
    ['electricity prices for households in Germany', 'price'],
    ['Which EU country is the most dependent on energy imports?', 'which'],
    ['How has the renewable energy share in Spain changed since 2010?', 'change'],
  ]
  const layouts = new Set<string>()
  for (const [q, expected] of cases) {
    const d = await dash(q)
    assert.equal(kind(d), expected, q)
    layouts.add(JSON.stringify(d.layout))
  }
  // Not one page for everything.
  assert.ok(layouts.size >= 4, `${layouts.size} different layouts`)
})

test('trends open with big numbers; comparisons with the map or the ranking', async () => {
  const trend = await dash('Renewable energy share in Spain, France and Germany since 2010')
  assert.equal(trend.presentation.kpiStyle, 'big')
  assert.ok(trend.layout.flat().indexOf('kpis') < trend.layout.flat().indexOf('charts'))
  const compare = await dash('Compare energy import dependency of all EU countries in 2023')
  assert.ok(['map', 'ranking'].includes(charts(compare)[0].role ?? ''))
  assert.equal(compare.presentation.controls[0], 'geo')
})

test('prices lead with what the price is made of, including its evolution (stacked columns)', async () => {
  const d = await dash('electricity prices for households in Germany')
  const price = charts(d).filter((w) => w.role === 'price')
  assert.ok(price.some((w) => w.type === 'pie'))
  const stacked = price.find((w): w is Extract<WidgetSpec, { type: 'bar' }> => w.type === 'bar')!
  assert.equal(stacked.stacked, true)
  assert.ok(stacked.categories.length >= 3 && stacked.series.length >= 2)
  assert.equal(d.presentation.controls[0], 'nrg_cons')
})

test('the variant follows the topic: stable when the year changes, varied across topics', async () => {
  const p = plan('Compare energy import dependency of all EU countries in 2023')
  const a = await buildDashboard(p, dict, 'en', s)
  const b = await buildDashboard(refinePlan(p, 'in 2019', dict, codelists)!, dict, 'en', s)
  assert.equal(a.presentation.template, b.presentation.template)
  assert.equal(a.presentation.accent, b.presentation.accent)
  const seeds = new Set(
    ['Oil consumption in Spain', 'Gas consumption in Spain', 'Coal consumption in Spain', 'Electricity consumption in Spain', 'Renewable energy share in Spain'].map(
      (q) => topicSeed(plan(q), 'single') % 8,
    ),
  )
  assert.ok(seeds.size >= 3, 'topics get different variants and accents')
})

test('a mix variant shows the shares over time as stacked percent columns', () => {
  const mix = plan('Electricity mix in Germany')
  const area: WidgetSpec = { type: 'area', title: 'Shares', categories: ['2022', '2023'], series: [{ name: 'Wind', data: [30, 32] }], stacked: 'percent', role: 'evolution' }
  const [a, b] = [arrange([area], mix, 'mix', 0), arrange([area], mix, 'mix', 1)]
  assert.equal(a.widgets[0].type, 'area')
  assert.equal(b.widgets[0].type, 'bar')
  assert.equal((b.widgets[0] as Extract<WidgetSpec, { type: 'bar' }>).stacked, 'percent')
  assert.equal(b.presentation.chosenBy, 'model')
})

test('the model can only choose between the two valid variants, and the choice is checked', async () => {
  const p = plan('Which EU country is the most dependent on energy imports?')
  const asked: string[] = []
  const d = await buildDashboard(p, dict, 'en', s, undefined, async (k) => {
    asked.push(k)
    return 1
  })
  assert.deepEqual(asked, ['which'])
  assert.equal(d.presentation.template, 'which-b')
  assert.deepEqual(sanitizeSpec(d).problems, [])
  // No answer (or a failing model) keeps the topic's variant.
  const kept = await buildDashboard(p, dict, 'en', s, undefined, async () => {
    throw new Error('busy')
  })
  assert.equal(kept.presentation.chosenBy, 'topic')
  const [a, b] = describeVariants('which')
  assert.notEqual(a, b)
  assert.match(variantPrompt('Which country…?', 'which')[1].content, /1\. Starts with the direct answer/)
})

test('filters: a "top 5" dashboard shows its 5 countries selected, not all 27', async () => {
  const d = await dash('top 5 countries for energy import dependency')
  assert.equal(d.shown?.geo.length, 5)
  const geo = filterControls(d.plan, dict, codelists, 'en', STRINGS.en.filters, d.shown).find((f) => f.dim === 'geo')!
  assert.deepEqual(geo.selected, d.shown?.geo)
})

test('shareable links: the plan survives the URL, and anything else is refused', () => {
  const p = refinePlan(plan('Which EU country is the most dependent on energy imports?'), 'in 2020', dict, codelists)!
  const back = decodePlan(encodePlan(p), dict)!
  assert.equal(back.dataset, p.dataset)
  assert.deepEqual(back.filters, p.filters)
  assert.deepEqual(back.time, p.time)
  assert.deepEqual(back.focus, p.focus)
  assert.equal(back.focusPeriod, '2020')

  const encode = (x: unknown) => Buffer.from(JSON.stringify(x)).toString('base64url')
  const base = { dataset: 'nrg_ind_id', filters: { geo: 'DE', siec: 'TOTAL', unit: 'PC' }, time: { kind: 'last', n: 10 }, intent: 'trend' }
  assert.ok(decodePlan(encode(base), dict))
  assert.equal(decodePlan(encode({ ...base, dataset: 'nope' }), dict), null)
  assert.equal(decodePlan(encode({ ...base, filters: { geo: '<script>' } }), dict), null)
  assert.equal(decodePlan(encode({ ...base, filters: { colour: 'red' } }), dict), null)
  assert.equal(decodePlan(encode({ ...base, time: { kind: 'range', since: 'yesterday' } }), dict), null)
  assert.equal(decodePlan(encode({ ...base, intent: 'delete' }), dict), null)
  assert.equal(decodePlan('%%%not-base64', dict), null)
})

test('the runtime check covers the presentation and rows of sections', async () => {
  const d = await dash('Oil consumption in Spain')
  assert.deepEqual(sanitizeSpec(d).problems, [])
  const bad = sanitizeSpec({ ...d, layout: [['charts', 'kpis', 'table', 'insights']], presentation: { ...d.presentation, accent: 'pink' as 'blue' } })
  assert.deepEqual(bad.problems, ['layout', 'presentation'])
  assert.equal(bad.spec.presentation.accent, 'blue')
})

test('"Electricity mix in France" on the price dashboard is a new question (the mix), not prices for France', () => {
  const prices = plan('electricity prices for households in Germany')
  assert.equal(refinePlan(prices, 'Electricity mix in France', dict, codelists), null)
  assert.equal(plan('Electricity mix in France').dataset, 'nrg_bal_peh')
})

test('comparing all countries shows the map, next to the ranking', async () => {
  const d = await dash('Compare renewable energy share of all EU countries')
  const map = charts(d).find((w): w is Extract<WidgetSpec, { type: 'map' }> => w.type === 'map')!
  assert.ok(map.data.length >= 20)
  const i = charts(d).indexOf(map)
  assert.ok(i <= 1 && ['map', 'ranking'].includes(charts(d)[i === 0 ? 1 : 0].role ?? ''))
})
