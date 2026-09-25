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
  assert.ok((byDim(p, 'siec')?.options.length ?? 0) <= 11) // the main products, not all 72
  assert.equal(byDim(p, 'nrg_bal')?.multiple, false)
})

test('several countries: a trend (few) or a comparison (many); products become a single choice', () => {
  const p = applyFilter(plan('Oil consumption in Spain'), 'geo', ['ES', 'FR', 'DE'], dict)
  assert.deepEqual(p.filters.geo, ['ES', 'FR', 'DE'])
  assert.equal(p.intent, 'trend')
  assert.equal(byDim(p, 'siec')?.multiple, false)
  const many = applyFilter(p, 'geo', ['ES', 'FR', 'DE', 'IT', 'PL', 'NL', 'BE', 'AT'], dict)
  assert.equal(many.intent, 'compare')
})

test('several products on one country: countries become a single choice', () => {
  const p = applyFilter(plan('Energy consumption in Spain'), 'siec', ['O4000XBIO', 'G3000', 'RA000'], dict)
  assert.equal(byDim(p, 'geo')?.multiple, false)
  assert.equal(byDim(p, 'siec')?.multiple, true)
})

test('choosing several of one dimension keeps only the first of another', () => {
  const mix = plan('Electricity mix in Germany')
  const p = applyFilter(mix, 'geo', ['DE', 'FR'], dict)
  assert.ok(!Array.isArray(p.filters.siec), JSON.stringify(p.filters.siec))
})

test('price datasets offer their small dimensions: band, taxes, currency', () => {
  const dims = controls(plan('electricity prices for households in Germany')).map((c) => c.dim)
  for (const d of ['nrg_cons', 'tax', 'currency']) assert.ok(dims.includes(d), dims.join())
})

test('partner datasets offer partner countries', () => {
  assert.ok(byDim(plan('imports of natural gas from Norway'), 'partner')?.selected.includes('NO'))
})
