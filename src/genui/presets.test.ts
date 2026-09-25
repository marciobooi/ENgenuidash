import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { decodePlan, encodePlan } from '../app/shareLink'
import { STRINGS } from '../i18n'
import { installEurostatStub } from '../test/eurostatStub'
import { buildDashboard } from './execute'
import { pickPresets, presetPlan, PRESET_IDS, PRESETS } from './presets'
import { dashStrings } from './strings'
import { sanitizeSpec } from './validate'

// The starter questions: each one's plan is valid for our dictionary and builds a dashboard.
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
let restore: () => void
before(() => {
  restore = installEurostatStub(dict, codelists)
})
after(() => restore())

test('every preset uses a dataset, dimensions and codes of the dictionary', () => {
  for (const id of PRESET_IDS) {
    const plan = PRESETS[id]
    const ds = dict.datasets[plan.dataset]
    assert.ok(ds, `${id}: ${plan.dataset}`)
    for (const [dim, value] of Object.entries(plan.filters)) {
      const codes = ds.dimensions.find((d: { id: string }) => d.id === dim)?.codes
      assert.ok(codes, `${id}: no dimension ${dim}`)
      for (const code of ([] as string[]).concat(value)) assert.ok(codes.includes(code), `${id}: ${dim}=${code}`)
    }
    // Every dimension is chosen (no "all codes" by accident), except time.
    for (const d of ds.dimensions) if (d.id !== 'time' && d.codes.length > 1) assert.ok(d.id in plan.filters, `${id}: ${d.id} not set`)
  }
})

test('every preset builds a dashboard that passes the runtime check', async () => {
  const s = dashStrings(STRINGS.en)
  for (const id of PRESET_IDS) {
    const d = await buildDashboard(PRESETS[id], dict, 'en', s)
    assert.deepEqual(sanitizeSpec(d).problems, [], id)
    assert.ok(d.widgets.some((w) => !['kpis', 'table', 'text'].includes(w.type)), `${id}: no chart`)
  }
  // Parts of a whole get the composition view; indicators a trend.
  const parts = await buildDashboard(PRESETS.bySector, dict, 'en', s)
  assert.ok(parts.widgets.some((w) => w.type === 'pie'))
  const ren = await buildDashboard(PRESETS.renewables, dict, 'en', s)
  assert.ok(ren.widgets.some((w) => w.type === 'line'))
})

test('every preset has its question in English, German and French', () => {
  for (const lang of ['en', 'de', 'fr'] as const) {
    for (const id of PRESET_IDS) assert.ok(STRINGS[lang].starterQuestions[id]?.length > 10, `${lang}: ${id}`)
  }
})

test('four different starter topics, a new set each time', () => {
  const a = pickPresets(4)
  assert.equal(new Set(a).size, 4)
  let seed = 1
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const sets = new Set(Array.from({ length: 20 }, () => pickPresets(4, random).join()))
  assert.ok(sets.size > 15)
})

test('typed in the chat, in any language, each starter question opens its topic', () => {
  for (const id of PRESET_IDS) {
    for (const lang of ['en', 'de', 'fr'] as const) {
      const plan = presetPlan(STRINGS[lang].starterQuestions[id], dict, codelists)
      assert.equal(plan?.dataset, PRESETS[id].dataset, `${lang}: ${id}`)
      assert.deepEqual(plan?.filters.siec, PRESETS[id].filters.siec, `${lang}: ${id}`)
      assert.deepEqual(plan?.filters.nrg_bal, PRESETS[id].filters.nrg_bal, `${lang}: ${id}`)
    }
  }
})

test('the places and period of a typed topic question are applied; other questions are left alone', () => {
  const ne = presetPlan('Final non-energy consumption by type of fuel in Germany since 2010', dict, codelists)!
  assert.equal(ne.filters.nrg_bal, 'FC_NE')
  assert.equal(ne.filters.geo, 'DE')
  assert.equal(ne.time.kind === 'range' && ne.time.since, '2010')
  assert.equal(presetPlan('Endenergieverbrauch nach Sektor in Frankreich', dict, codelists)?.filters.geo, 'FR')
  for (const q of ['What is the energy import dependency of the EU?', 'Oil consumption in Spain', 'Energy intensity in France', 'Electricity mix in Germany', 'top 5 countries for energy import dependency']) {
    assert.equal(presetPlan(q, dict, codelists), null, q)
  }
})

test('energy efficiency: primary and final consumption as two lines, never as shares of a total', async () => {
  const d = await buildDashboard(PRESETS.efficiency, dict, 'en', dashStrings(STRINGS.en))
  assert.ok(d.widgets.some((w) => w.type === 'line'))
  assert.ok(!d.widgets.some((w) => w.type === 'pie' || (w.type === 'area' && w.stacked)))
  assert.equal(decodePlan(encodePlan(PRESETS.efficiency), dict)?.parts, false)
})

test('a typed topic question keeps its focus: "how has … developed?" opens with the change', () => {
  assert.deepEqual(presetPlan('How has energy efficiency developed in the EU?', dict, codelists)?.focus, { kind: 'change' })
  assert.equal(presetPlan('Final energy consumption by sector in the EU', dict, codelists)?.focus, undefined)
})
