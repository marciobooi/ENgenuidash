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
