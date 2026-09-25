import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { STRINGS } from '../i18n'
import { installEurostatStub } from '../test/eurostatStub'
import { buildDashboard, NoDataError } from './execute'
import { applyFilter } from './filters'
import { planQuestion, refinePlan } from './planner'
import { dashStrings } from './strings'
import type { DashboardSpec, Plan, WidgetSpec } from './types'

// Dashboards built end to end (question → plan → data → widgets) against a stub of the Eurostat
// API (src/test/eurostatStub.ts): which charts each kind of question gets.
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const s = dashStrings(STRINGS.en)
let restore: () => void
before(() => {
  // Empty on purpose: CHP fuels in tonnes (unit fallback), and one dataset with no data at all.
  restore = installEurostatStub(dict, codelists, {
    empty: (ds, p) => (ds === 'nrg_chp_f' && p.get('unit') === 'THS_T') || ds === 'nrg_inf_stcs',
  })
})
after(() => restore())

const plan = (q: string): Plan => {
  const r = planQuestion(q, dict, codelists)
  assert.equal(r.kind, 'plan', `${q} → ${r.kind}`)
  return (r as { plan: Plan }).plan
}
const build = (p: Plan) => buildDashboard(p, dict, 'en', s)
const dash = async (q: string) => build(plan(q))
const charts = (d: DashboardSpec) => d.widgets.filter((w) => !['kpis', 'table', 'answer'].includes(w.type))
const kinds = (d: DashboardSpec): string[] => charts(d).map((w) => w.type)
const titled = (d: DashboardSpec, title: string) => charts(d).find((w) => 'title' in w && w.title.startsWith(title)) as WidgetSpec | undefined
const has = (d: DashboardSpec, type: string) => kinds(d).includes(type)

test('one series (EU import dependency): headline card, change per year, companions by fuel and gas origins', async () => {
  const d = await dash('What is the energy import dependency of the EU?')
  assert.equal(kinds(d)[0], 'hero')
  assert.ok(titled(d, 'Change from the previous period'))
  assert.ok(titled(d, 'Import dependency by fuel'))
  assert.ok(titled(d, 'Where natural gas imports come from'))
  assert.ok(!has(d, 'map'))
  assert.ok(d.insights.length >= 2)
})

test('a year for one series: that year highlighted, ten years of context', async () => {
  const d = await dash('Oil consumption in Spain in 2024')
  const hero = charts(d).find((w) => w.type === 'hero') as Extract<WidgetSpec, { type: 'hero' }>
  assert.equal(hero.categories[hero.highlightIndex], '2024')
  assert.equal(hero.categories.length, 10)
  assert.ok(titled(d, 'Use by sector, 2024'))
})

test('three countries over time: lines, ranking, change since the start; no map, no heatmap', async () => {
  const d = await dash('Renewable energy share in Spain, France and Germany since 2010')
  assert.deepEqual(kinds(d), ['line', 'breakdown', 'bar'])
  assert.equal(d.widgets.find((w) => w.type === 'kpis')?.type, 'kpis')
})

test('all EU countries in a year: map, ranking, change; no evolution (a year was asked)', async () => {
  const d = await dash('Compare energy import dependency of all EU countries in 2023')
  assert.ok(has(d, 'map'))
  assert.ok(titled(d, 'Ranking in 2023'))
  assert.ok(titled(d, 'Change vs 2022'))
  assert.ok(!has(d, 'line') && !has(d, 'heatmap'))
})

test('all EU countries without a year: ranking plus a heatmap of ten years', async () => {
  const d = await dash('Compare energy import dependency of all EU countries')
  assert.ok(has(d, 'map') && has(d, 'heatmap'))
})

test('top 5: no map for five countries, an evolution line, and a note', async () => {
  const d = await dash('top 5 countries for energy import dependency')
  assert.ok(!has(d, 'map'))
  assert.ok(titled(d, 'Evolution over time'))
  assert.match(d.notes.join(' '), /5 highest of 27/)
})

test('a mix: donut with the total, sources ranked, stacked and share areas', async () => {
  const d = await dash('Electricity mix in Germany')
  assert.deepEqual(kinds(d), ['pie', 'breakdown', 'area', 'area'])
  assert.ok((charts(d)[0] as Extract<WidgetSpec, { type: 'pie' }>).centerLabel)
})

test('parts of a whole (capacity by technology): the composition view and share insights', async () => {
  const d = await dash('electricity generating capacity in Italy')
  assert.ok(has(d, 'pie') && has(d, 'area'))
  assert.ok(d.insights.some((i) => i.parts.some((p) => typeof p === 'string' && /share/.test(p))))
})

test('monthly data: change on a year earlier and month by month, by year', async () => {
  const d = await dash('monthly gas imports of Germany')
  assert.ok(titled(d, 'Change from a year earlier'))
  const seasons = titled(d, 'Month by month') as Extract<WidgetSpec, { type: 'line' | 'area' }>
  assert.equal(seasons.categories.length, 12)
  assert.ok(!d.insights.some((i) => i.parts.some((p) => typeof p === 'string' && /in a row/.test(p))))
})

test('half-yearly prices: change on a year earlier, and what the price is made of', async () => {
  const d = await dash('electricity prices for households in Germany')
  assert.ok(titled(d, 'Change from a year earlier'))
  const parts = titled(d, 'What the price is made of') as Extract<WidgetSpec, { type: 'pie' }>
  assert.equal(parts.source?.code, 'nrg_pc_204_c')
  assert.ok(parts.slices.some((x) => x.name === 'Other taxes and levies'))
})

test('partner breakdown: the ten largest origins, their shares and a heatmap', async () => {
  const d = await dash('crude oil imports by country of origin')
  const ranking = charts(d).find((w): w is Extract<WidgetSpec, { type: 'bar' }> => w.type === 'bar')!
  assert.equal(ranking.categories.length, 10)
  assert.ok(has(d, 'pie') && has(d, 'heatmap'))
})

test('no values in the chosen unit: another unit of the dataset is used', async () => {
  const d = await dash('combined heat and power in Denmark')
  assert.notEqual(d.unit, 'thousand t')
  assert.ok(charts(d).length > 0)
})

test('no values at all: a clear "no data" error, not an empty dashboard', async () => {
  await assert.rejects(dash('solar collectors surface in Spain'), NoDataError)
})

test('toolbar: the default period is selected, and a year shows "Period to"', async () => {
  const p = plan('What is the energy import dependency of the EU?')
  const d = await build(p)
  assert.ok(d.controls?.periods?.some((x) => x.label === '15 y' && x.active))
  const y = await build(refinePlan(p, 'in 2018', dict, codelists)!)
  assert.equal(y.controls?.periodsTo, '2018')
})

test('filters: three countries chosen in the toolbar give a three-country trend', async () => {
  const d = await build(applyFilter(plan('Oil consumption in Spain'), 'geo', ['ES', 'FR', 'DE'], dict))
  const kpis = d.widgets.find((w): w is Extract<WidgetSpec, { type: 'kpis' }> => w.type === 'kpis')
  assert.equal(kpis?.items.length, 3)
  assert.ok(has(d, 'line'))
})

test('every dashboard has a title, a summary, insights, a data table and a source', async () => {
  for (const q of ['Gas storage in Germany', 'heat pumps in Sweden', 'imports of natural gas from Norway', 'LNG imports in Spain', 'peat in Finland']) {
    const d = await dash(q)
    assert.ok(d.title && d.summary.length && d.insights.length, q)
    assert.ok(d.widgets.some((w) => w.type === 'table'), q)
    assert.match(d.source.url, /ec\.europa\.eu\/eurostat/, q)
  }
})
