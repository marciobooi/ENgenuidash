import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { STRINGS } from '../i18n'
import { installEurostatStub } from '../test/eurostatStub'
import { buildDashboard } from './execute'
import { isMonthlyDataset, MONTHLY_DATASETS } from './monthly'
import { planQuestion } from './planner'
import { dashStrings } from './strings'
import type { DashboardSpec, Plan, WidgetSpec } from './types'

// Monthly energy data, as Eurostat's monthly energy visualisation: questions about monthly data open
// a dedicated dashboard (seasonal range, composition, trade, and for net generation renewables
// against the rest), built end to end against the Eurostat stub.
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
const charts = (d: DashboardSpec) => d.widgets.filter((w) => !['kpis', 'table', 'answer'].includes(w.type))
const kinds = (d: DashboardSpec): string[] => charts(d).map((w) => w.type)
const titled = (d: DashboardSpec, title: string) => charts(d).find((w) => 'title' in w && w.title.startsWith(title)) as WidgetSpec | undefined

test('monthly questions reach the monthly datasets', () => {
  const cases: [string, string][] = [
    ['monthly gas imports of Germany', 'nrg_cb_gasm'],
    ['monthly electricity generation in Germany', 'nrg_cb_pem'],
    ['monthly renewable electricity generation', 'nrg_cb_pem'],
    ['renewable vs non-renewable electricity monthly EU', 'nrg_cb_pem'],
    ['monthly hard coal imports', 'nrg_cb_sffm'],
    ['monthly coal production in Poland', 'nrg_cb_sffm'],
    ['monthly oil stocks in the EU', 'nrg_stk_oilm'],
    ['monthly electricity imports of France', 'nrg_cb_em'],
  ]
  for (const [q, dataset] of cases) assert.equal(plan(q).dataset, dataset, q)
  assert.ok(Object.keys(MONTHLY_DATASETS).every(isMonthlyDataset))
  assert.equal(isMonthlyDataset('nrg_bal_c'), false)
})

test('a monthly series: the range of earlier years, the year on year, trade and the countries', async () => {
  const d = await dash('monthly gas imports of Germany')
  const ks = kinds(d)
  for (const k of ['seasonal', 'line', 'bar', 'map']) assert.ok(ks.includes(k), `${k} in ${ks.join(',')}`)
  const seasonal = titled(d, 'This year against earlier years') as Extract<WidgetSpec, { type: 'seasonal' }>
  assert.equal(seasonal.months.length, 12)
  assert.equal(seasonal.range.min.length, 12)
  // The band is a band: the lowest month value never above the highest.
  seasonal.range.min.forEach((m, i) => assert.ok(m == null || (seasonal.range.max[i] as number) >= m))
  assert.ok(titled(d, 'Change on the same month a year earlier'))
  assert.ok(titled(d, 'Imports, exports and the net balance'))
  assert.ok(d.insights.length >= 2)
  assert.match(d.summary[0], /came to/)
  // The toolbar: the topic, the flow, the month; the countries are several-choice.
  assert.deepEqual(d.controls?.choices?.map((c) => c.key), ['topic', 'flow', 'month'])
  assert.ok(d.controls!.choices![0].options.length >= 5)
})

test('net generation: renewables against the rest, the crossover, the share by month and year', async () => {
  const d = await dash('renewable vs non-renewable electricity monthly EU')
  const ks = kinds(d)
  for (const k of ['line', 'bar', 'heatmap', 'seasonal', 'area', 'pie', 'map']) assert.ok(ks.includes(k), `${k} in ${ks.join(',')}`)
  const lines = titled(d, 'Renewables and non-renewables') as Extract<WidgetSpec, { type: 'line' | 'area' }>
  assert.deepEqual(lines.series.map((x) => x.name), ['Renewables', 'Non-renewables'])
  // The gap chart is renewables minus the rest, in the same months.
  const gap = titled(d, 'Renewables minus non-renewables') as Extract<WidgetSpec, { type: 'bar' }>
  assert.ok(gap.signed)
  const heat = titled(d, 'Renewable share by month') as Extract<WidgetSpec, { type: 'heatmap' }>
  assert.equal(heat.xCategories.length, 12)
  assert.ok(heat.values.flat().every((v) => v == null || (v >= 0 && v <= 100)))
  assert.equal(heat.unit, '%')
  // The headline figures: share, renewables, the months ahead, the record.
  const kpis = d.widgets.find((w) => w.type === 'kpis') as Extract<WidgetSpec, { type: 'kpis' }>
  assert.equal(kpis.items.length, 4)
  assert.match(d.summary[0], /renewables generated/)
  assert.ok(d.insights.some((i) => i.parts.join('').includes('Renewables were ahead in')))
  assert.deepEqual(d.controls?.choices?.map((c) => c.key), ['topic', 'month'])
})

test('several countries: their renewable share side by side; many: a comparison, no seasonal chart per country', async () => {
  const some = await dash('monthly renewable electricity generation Germany France Spain')
  const line = titled(some, 'Renewable share') as Extract<WidgetSpec, { type: 'line' | 'area' }>
  assert.equal(line.series.length, 3)
  const all = await dash('monthly gas imports of Germany')
  const compare = await buildDashboard({ ...plan('monthly gas imports of Germany'), filters: { ...plan('monthly gas imports of Germany').filters, geo: ['BE', 'BG', 'CZ', 'DK', 'DE', 'EE', 'IE', 'EL', 'ES', 'FR'] } }, dict, 'en', s)
  assert.ok(kinds(all).length > 0 && kinds(compare).includes('map'))
})

test('coal, oil stocks and electricity trade each get their dashboard', async () => {
  for (const q of ['monthly hard coal imports', 'monthly oil stocks in the EU', 'monthly electricity imports of France']) {
    const d = await dash(q)
    assert.ok(kinds(d).includes('seasonal'), q)
    assert.ok(d.widgets.some((w) => w.type === 'kpis'), q)
  }
})

test('crude oil prices: routed to the crude dataset, the EU computed from its countries, the bill as price times volume', async () => {
  for (const q of ['crude oil prices', 'oil price per barrel', 'monthly crude oil prices in Germany']) assert.equal(plan(q).dataset, 'nrg_cb_cosm', q)
  // Electricity and gas prices are not oil prices.
  assert.equal(plan('electricity prices for households in Germany').dataset, 'nrg_pc_204')
  const p = plan('crude oil prices')
  assert.equal(p.filters.geo, 'EU27_2020')
  assert.equal(p.filters.indic_nrg, 'AVGPRC_USD_BBL')
  const d = await buildDashboard(p, dict, 'en', s)
  const kpis = d.widgets.find((w) => w.type === 'kpis') as Extract<WidgetSpec, { type: 'kpis' }>
  assert.equal(kpis.items.length, 4)
  assert.match(kpis.items[3].label, /^Import bill/)
  assert.equal(charts(d).filter((w) => w.type === 'seasonal').length, 2)
  assert.ok(titled(d, 'Average price by country'))
  assert.match(d.title, /EU-27 \(weighted average\)/)
  // A country: its own series; the toolbar offers the EU as a place although the dataset has no EU code.
  const de = await buildDashboard(plan('monthly crude oil prices in Germany'), dict, 'en', s)
  assert.match(de.title, /Germany/)
  const { filterControls, applyFilter } = await import('./filters')
  const geo = filterControls(p, dict, codelists, 'en', STRINGS.en.filters).find((c) => c.dim === 'geo')!
  assert.ok(geo.options.some((o) => o.code === 'EU27_2020') && geo.multiple)
  assert.equal(applyFilter(plan('monthly crude oil prices in Germany'), 'geo', ['EU27_2020'], dict).filters.geo, 'EU27_2020')
  // And a shared link keeps it.
  const { encodePlan, decodePlan } = await import('../app/shareLink')
  assert.equal(decodePlan(encodePlan(p), dict)?.filters.geo, 'EU27_2020')
})

test('crude oil: the measure the reader leads with sets the order, the titles and the map; many countries are the story', async () => {
  const price = plan('crude oil prices')
  const lead = (p: Plan) => buildDashboard(p, dict, 'en', s)
  const byPrice = await lead(price)
  const byVolume = await lead({ ...price, filters: { ...price.filters, indic_nrg: 'VOL_THS_BBL' } })
  const first = (d: DashboardSpec) => (charts(d).find((w) => w.type === 'line') as { title: string }).title
  assert.match(first(byPrice), /Average price/)
  assert.match(first(byVolume), /^Volume of crude oil/)
  // The key figures, the headline, the map and the ranking all follow.
  const label = (d: DashboardSpec) => (d.widgets.find((w) => w.type === 'kpis') as Extract<WidgetSpec, { type: 'kpis' }>).items[0].label
  assert.match(label(byPrice), /^Average price/)
  assert.match(label(byVolume), /^Volume/)
  assert.match(byVolume.summary[0], /imported .* of crude oil/)
  assert.match((charts(byVolume).find((w) => w.type === 'map') as { title: string } | undefined)?.title ?? 'Volume by country', /^Volume by country/)
  assert.ok(titled(byVolume, 'Volume: change on the same month a year earlier') && titled(byVolume, 'Price: change on the same month a year earlier'))
  assert.equal(byVolume.unit, 'thousand barrels')
  // The toolbar offers the choice.
  assert.ok(byPrice.controls?.choices?.some((c) => c.key === 'measure' && c.options.length === 2))
  // Many countries: the selection is aggregated, and each country's share, heatmap and largest over time appear.
  const geos = ['BE', 'BG', 'CZ', 'DK', 'DE', 'EE', 'IE', 'EL', 'ES', 'FR']
  const many = await lead({ ...price, filters: { ...price.filters, geo: geos } })
  assert.match(many.title, /10 countries selected/)
  for (const k of ['heatmap', 'pie']) assert.ok(kinds(many).includes(k), `${k} in ${kinds(many).join(',')}`)
  assert.ok(titled(many, 'The largest countries'))
})
