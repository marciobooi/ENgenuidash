import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { STRINGS } from '../i18n'
import { applyFilter, filterControls } from './filters'
import { planQuestion } from './planner'
import type { Plan } from './types'

const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const plan = (q: string) => (planQuestion(q, dict, codelists) as { plan: Plan }).plan
const controls = (p: Plan) => filterControls(p, dict, codelists, 'en', STRINGS.en.filters)
const byDim = (p: Plan, dim: string) => controls(p).find((c) => c.dim === dim)

test('a balance question gets country, product and flow filters with the current choice', () => {
  const p = plan('Oil consumption in Spain')
  assert.deepEqual(controls(p).map((c) => c.dim), ['geo', 'siec', 'nrg_bal'])
  assert.deepEqual(byDim(p, 'geo')?.selected, ['ES'])
  assert.equal(byDim(p, 'geo')?.options[0].code, 'EU27_2020') // the EU first, then countries by name
  assert.ok((byDim(p, 'siec')?.options.length ?? 0) <= 12) // the main fuel families (as in enbal), not all 72
  assert.equal(byDim(p, 'nrg_bal')?.multiple, false)
})

test('several countries: a trend (few) or a comparison (many); products can still be several', () => {
  const p = applyFilter(plan('Oil consumption in Spain'), 'geo', ['ES', 'FR', 'DE'], dict)
  assert.deepEqual(p.filters.geo, ['ES', 'FR', 'DE'])
  assert.equal(p.intent, 'trend')
  // Countries × products is a valid view (each country's mix): products stay a multiple choice.
  assert.equal(byDim(p, 'siec')?.multiple, true)
  const many = applyFilter(p, 'geo', ['ES', 'FR', 'DE', 'IT', 'PL', 'NL', 'BE', 'AT'], dict)
  assert.equal(many.intent, 'compare')
})

test('several products on one country: countries stay a multiple choice, flows become single', () => {
  const p = applyFilter(plan('Energy consumption in Spain'), 'siec', ['O4000XBIO', 'G3000', 'RA000'], dict)
  assert.equal(byDim(p, 'geo')?.multiple, true)
  assert.equal(byDim(p, 'siec')?.multiple, true)
  const flow = byDim(p, 'nrg_bal')
  if (flow) assert.equal(flow.multiple, false)
})

test('several countries on a mix keep its products: a mix per country', () => {
  const mix = plan('Electricity mix in Germany')
  const p = applyFilter(mix, 'geo', ['DE', 'FR'], dict)
  assert.deepEqual(p.filters.siec, mix.filters.siec)
  assert.equal(p.intent, 'mix')
})

test('several products on several countries: the countries are kept, other dimensions single', () => {
  const p = applyFilter(applyFilter(plan('Energy consumption in Spain'), 'geo', ['ES', 'FR'], dict), 'siec', ['O4000XBIO', 'G3000'], dict)
  assert.deepEqual(p.filters.geo, ['ES', 'FR'])
  assert.deepEqual(p.filters.siec, ['O4000XBIO', 'G3000'])
  for (const [k, v] of Object.entries(p.filters)) if (!['geo', 'siec'].includes(k)) assert.ok(!Array.isArray(v), k)
})

test('price datasets offer their small dimensions: band, taxes, currency', () => {
  const dims = controls(plan('electricity prices for households in Germany')).map((c) => c.dim)
  for (const d of ['nrg_cons', 'tax', 'currency']) assert.ok(dims.includes(d), dims.join())
})

test('partner datasets offer partner countries', () => {
  assert.ok(byDim(plan('imports of natural gas from Norway'), 'partner')?.selected.includes('NO'))
})

test('a dataset with its own product codes offers all of them, not the balances\' short list', () => {
  const p = plan('Gross production of electricity and derived heat from combustible fuels by type of plant and operator')
  const products = byDim(p, 'siec')
  assert.ok(products, 'a product filter')
  assert.ok(products.options.length > 30, `${products.options.length} products`)
  assert.ok(products.options.some((o) => o.code === 'C0110') && products.options.some((o) => o.code === 'G3000'))
  // The balances keep their curated main products.
  assert.ok((byDim(plan('Oil consumption in Spain'), 'siec')?.options.length ?? 99) <= 13)
})

test('a dataset\'s own dimensions are filters (type of plant, pollutant, source sectors...), read from the dictionary', () => {
  const pehcf = plan('Gross production of electricity and derived heat from combustible fuels by type of plant and operator')
  assert.deepEqual(controls(pehcf).map((c) => c.dim), ['geo', 'siec', 'nrg_bal', 'plants', 'operator'])
  assert.equal(byDim(pehcf, 'plants')?.options.length, 4)
  const ghg = plan('Greenhouse gas emissions by source sector')
  assert.deepEqual(controls(ghg).map((c) => c.dim), ['geo', 'airpol', 'src_crf'])
  // The sectors are a short curated list (several can be chosen), not the 166 codes.
  const sectors = byDim(ghg, 'src_crf')
  assert.ok(sectors && sectors.multiple && sectors.options.length <= 16)
})

test('every starter topic gets a working toolbar: every filter offers a choice and includes the current one', async () => {
  const { PRESETS } = await import('./presets')
  for (const [id, p] of Object.entries(PRESETS)) {
    for (const c of controls(p)) {
      assert.ok(c.options.length >= 2, `${id}: ${c.dim} has ${c.options.length} options`)
      const codes = c.options.map((o) => o.code)
      assert.ok(c.selected.every((x) => codes.includes(x)), `${id}: ${c.dim} selection is not among its options`)
    }
  }
})
