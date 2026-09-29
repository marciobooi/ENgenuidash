import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { STRINGS } from '../i18n'
import { installEurostatStub } from '../test/eurostatStub'
import { buildDashboard, NoDataError } from './execute'
import { applyFilter } from './filters'
import { planQuestion, refinePlan } from './planner'
import { PRESETS } from './presets'
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
  // (the order depends on the page variant, see layout.ts; the evolution always leads)
  assert.equal(kinds(d)[0], 'line')
  // (plus the renewable share by sector of each country, where each started and ended, and the
  // big picture of the three countries: related charts)
  assert.deepEqual([...kinds(d)].sort(), ['bar', 'bar', 'breakdown', 'bubble', 'dumbbell', 'line'])
  const db = charts(d).find((w) => w.type === 'dumbbell') as Extract<WidgetSpec, { type: 'dumbbell' }>
  assert.equal(db.title, `${db.from.name} → ${db.to.name}`)
  assert.deepEqual([...db.categories].sort(), ['France', 'Germany', 'Spain'])
  assert.ok(titled(d, 'Renewable share by sector'))
  assert.equal(d.widgets.find((w) => w.type === 'kpis')?.type, 'kpis')
})

test('all EU countries in a year: map, ranking, change; no evolution (a year was asked)', async () => {
  const d = await dash('Compare energy import dependency of all EU countries in 2023')
  assert.ok(has(d, 'map'))
  assert.ok(titled(d, 'Ranking in 2023'))
  assert.ok(titled(d, 'Change from 2022 to 2023'))
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
  // (…and how the mix shifted since the first year, next to the shares over time.)
  assert.deepEqual(kinds(d), ['pie', 'breakdown', 'area', 'area', 'dumbbell', 'bar'])
  assert.ok((charts(d)[0] as Extract<WidgetSpec, { type: 'pie' }>).centerLabel)
  // Related: the renewable share next to the EU-27, with the EU 2030 target line.
  const ren = titled(d, 'Renewable share of energy consumption') as Extract<WidgetSpec, { type: 'bar' }>
  assert.equal(ren.reference?.value, 42.5)
  assert.deepEqual([...ren.categories].sort(), ['EU-27', 'Germany'])
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

test('the data given to the model has the precision the dashboard shows, not all of Eurostat\'s digits', async () => {
  const d = await dash('Renewable energy share in Spain, France and Germany since 2010')
  const numbers = [...d.context.matchAll(/: (\d+(?:\.\d+)?)/g)].map((m) => m[1])
  assert.ok(numbers.length > 10)
  assert.ok(numbers.every((n) => (n.split('.')[1] ?? '').length <= 1), numbers.join(' '))
})

test('mix: the donut and the shares over time give each source the same percentage, none left out', async () => {
  const d = await build({ ...PRESETS.production, time: { kind: 'last', n: 10 } })
  const pie = charts(d).find((w) => w.type === 'pie') as Extract<WidgetSpec, { type: 'pie' }>
  const shares = charts(d).find((w) => 'stacked' in w && w.stacked === 'percent') as Extract<WidgetSpec, { type: 'area' | 'bar' }>
  const stacked = charts(d).find((w) => 'stacked' in w && w.stacked === true) as Extract<WidgetSpec, { type: 'area' | 'bar' }>
  assert.ok(pie && shares && stacked)
  const last = shares.categories.length - 1
  const pieTotal = pie.slices.reduce((n, x) => n + x.y, 0)
  const barTotal = shares.series.reduce((n, x) => n + (x.data[last] ?? 0), 0)
  // Same total everywhere (every source of the preset, the small ones grouped as "Other").
  assert.ok(Math.abs(pieTotal - barTotal) < 1e-6, `${pieTotal} vs ${barTotal}`)
  assert.deepEqual(stacked.series.map((x) => x.name), shares.series.map((x) => x.name))
  for (const slice of pie.slices) {
    const bar = shares.series.find((x) => x.name === slice.name)
    assert.ok(bar, `${slice.name} missing from the shares over time`)
    assert.equal(((bar.data[last] ?? 0) / barTotal).toFixed(4), (slice.y / pieTotal).toFixed(4), slice.name)
  }
  assert.ok(shares.series.length <= 6)
})

// ---------- several countries on any dashboard (a filter, or "… in Germany and France") ----------

const PLACES = ['EU27_2020', 'DE', 'FR']
const withPlaces = (p: Plan, geo: string | string[]): Plan => ({ ...p, filters: { ...p.filters, geo } })
const tableOf = (d: DashboardSpec) => d.widgets.find((w) => w.type === 'table') as Extract<WidgetSpec, { type: 'table' }>

for (const [id, preset] of Object.entries(PRESETS)) {
  const geoCodes: string[] = dict.datasets[preset.dataset]?.dimensions.find((x: { id: string }) => x.id === 'geo')?.codes ?? []
  if (!PLACES.every((c) => geoCodes.includes(c))) continue
  test(`several countries on "${id}": each country its own values, named in the subtitle`, async () => {
    const d = await build(withPlaces(preset, PLACES))
    // Never "EU-27" alone when three countries are shown.
    assert.ok(/Germany/.test(d.subtitle) || charts(d).some((w) => 'categories' in w && w.categories.includes('Germany')) || tableOf(d).rows.some((r) => r.label.includes('Germany')), d.subtitle)
    // One row per country (or country × part), and no two countries with the same figures.
    const rows = tableOf(d).rows
    for (const c of ['Germany', 'France']) assert.ok(rows.some((r) => r.label.includes(c)), `${c} missing: ${rows.map((r) => r.label)}`)
    const byCountry = (c: string) => JSON.stringify(rows.filter((r) => r.label.includes(c)).map((r) => r.values))
    assert.notEqual(byCountry('Germany'), byCountry('France'))
    // Summable mixes: a country's total is the total of its own single-country dashboard.
    if (Array.isArray(preset.filters.siec) || Array.isArray(preset.filters.nrg_bal) || Array.isArray(preset.filters.src_crf)) {
      const one = await build(withPlaces(preset, 'DE'))
      const pie = charts(one).find((w) => w.type === 'pie') as Extract<WidgetSpec, { type: 'pie' }> | undefined
      const de = rows.find((r) => r.label === 'Germany')
      if (pie && de) {
        const total = pie.slices.reduce((n, x) => n + x.y, 0)
        const col = tableOf(d).columns.indexOf(tableOf(one).columns.at(-1)!)
        assert.ok(Math.abs((de.values[col] ?? 0) - total) < 1e-6 * total, `Germany ${de.values[col]} vs its own dashboard ${total}`)
        assert.ok(charts(d).some((w) => w.type === 'bar' && w.stacked === 'percent' && w.categories.includes('Germany')), 'mix by country')
      }
    }
  })
}

test('"electricity mix in Germany, France and Italy": the mix per country, not one country labelled EU-27', async () => {
  const d = await dash('electricity mix in Germany, France and Italy')
  assert.match(d.subtitle, /Germany, France, Italy/)
  const shares = charts(d).find((w) => w.type === 'bar' && w.stacked === 'percent') as Extract<WidgetSpec, { type: 'bar' }>
  assert.deepEqual([...shares.categories].sort(), ['France', 'Germany', 'Italy'])
})

test('mix of several countries: EU-27 is the reference, never a slice next to its own members', async () => {
  const p = PRESETS.production
  const year = await build({ ...p, filters: { ...p.filters, geo: ['EU27_2020', 'DE', 'FR', 'IT'] }, focusPeriod: '2022', time: { kind: 'range', since: '2021', until: '2022' } })
  for (const w of charts(year)) if (w.type === 'pie') assert.ok(!w.slices.some((x) => x.name === 'EU-27'), 'EU-27 in a pie of countries')
  const ranking = charts(year).find((w) => w.type === 'bar' && w.title.startsWith('Ranking')) as Extract<WidgetSpec, { type: 'bar' }>
  assert.equal(ranking.reference?.label, 'EU-27')
  // Over time: each country's share of its largest sources.
  const overTime = await build({ ...p, filters: { ...p.filters, geo: ['EU27_2020', 'DE', 'FR', 'IT'] } })
  assert.ok(charts(overTime).some((w) => w.type === 'line' && w.title.startsWith('Share of')))
})

test('electricity production, four countries in one year: gross vs net, plant types, operators, renewables vs target', async () => {
  const p = PRESETS.production
  const d = await build({ ...p, filters: { ...p.filters, geo: ['EU27_2020', 'DE', 'FR', 'IT'] }, focusPeriod: '2022', time: { kind: 'range', since: '2021', until: '2022' } })
  const bar = (title: string) => titled(d, title) as Extract<WidgetSpec, { type: 'bar' }>
  // Gross and net side by side per country; plant types and operators as 100% bars per country.
  const gn = titled(d, 'Gross and net production') as Extract<WidgetSpec, { type: 'dumbbell' }>
  assert.equal(gn.type, 'dumbbell')
  assert.deepEqual([gn.from.name, gn.to.name], ['Net electricity production', 'Gross electricity production'])
  assert.equal(bar('By type of plant').stacked, 'percent')
  assert.deepEqual(bar('By operator').categories, ['EU-27', 'Germany', 'France', 'Italy'])
  assert.equal(bar('Renewable share of energy consumption').reference?.label, 'EU 2030 target')
})

test('bubble chart: three or more countries on energy topics, never for prices or two countries', async () => {
  const three = await dash('Renewable energy share in Spain, France and Germany since 2010')
  const bubble = charts(three).find((w) => w.type === 'bubble') as Extract<WidgetSpec, { type: 'bubble' }>
  assert.deepEqual(bubble.points.map((p) => p.name).sort(), ['France', 'Germany', 'Spain'])
  assert.equal(bubble.reference?.label, 'EU-27')
  assert.ok(bubble.points.every((p) => p.x >= 0 && p.y >= 0 && p.z > 0))
  // Two countries: two dots are not a picture.
  assert.ok(!charts(await dash('Renewable energy share in Spain and France since 2010')).some((w) => w.type === 'bubble'))
  // Prices are not about how a country gets its energy.
  const prices = await dash('electricity prices for households in Germany, France and Italy')
  assert.ok(!charts(prices).some((w) => w.type === 'bubble'))
})

test('one year, several countries (not summable): each country from the previous year to this one (dumbbell)', async () => {
  const d = await dash('Compare energy import dependency of Germany, France and Italy in 2023')
  const db = charts(d).find((w) => w.type === 'dumbbell') as Extract<WidgetSpec, { type: 'dumbbell' }>
  assert.equal(db.title, '2022 → 2023')
  assert.equal(db.categories.length, 3)
})
