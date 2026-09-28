import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { EurostatResult } from '../data/eurostat'
import { STRINGS } from '../i18n'
import { companionsFor, toWidget } from './companions'
import { planQuestion } from './planner'
import type { Plan, WidgetSpec } from './types'

const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const s = STRINGS.en.dCompanions
const plan = (q: string) => (planQuestion(q, dict, codelists) as { plan: Plan }).plan
const kinds = (q: string) => companionsFor(plan(q), dict, s).map((c) => `${c.dataset}:${c.dim}`)

test('each kind of question gets its related data', () => {
  assert.deepEqual(kinds('Oil consumption in Spain in 2024'), ['nrg_bal_c:nrg_bal'])
  assert.deepEqual(kinds('energy import dependency of Germany'), ['nrg_ind_id:siec', 'nrg_ti_gas:partner'])
  assert.deepEqual(kinds('Renewable energy share in Sweden'), ['nrg_ind_ren:nrg_bal'])
  assert.deepEqual(kinds('electricity prices for households in Germany'), ['nrg_pc_204_c:nrg_prc'])
})

test('several countries: the same related data, compared side by side', () => {
  // Renewable share by sector for each of the three countries (no gas origins or price split).
  assert.deepEqual(kinds('Renewable energy share in Spain, France and Germany'), ['nrg_ind_ren:nrg_bal'])
  assert.deepEqual(kinds('energy import dependency of Germany and France'), ['nrg_ind_id:siec'])
  const c = companionsFor(plan('Renewable energy share in Spain, France and Germany'), dict, s)[0]
  assert.deepEqual([...(c.filters.geo as string[])].sort(), ['DE', 'ES', 'FR'])
})

test('electricity production: gross vs net, by type of plant, by operator, renewables vs the 2030 target', () => {
  const p: Plan = { dataset: 'nrg_ind_peh', filters: { freq: 'A', plants: 'TOTAL', operator: 'TOTAL', nrg_bal: 'GEP', siec: ['CF', 'RA300'], unit: 'GWH', geo: ['DE', 'FR'] }, time: { kind: 'last', n: 10 }, intent: 'mix' }
  const list = companionsFor(p, dict, s)
  assert.deepEqual(list.map((c) => `${c.dim}:${([] as string[]).concat(c.codes as string[]).join(',')}`), [
    'nrg_bal:NEP,GEP', // net → gross (dumbbell for several countries)
    'plants:ELC,CHP',
    'operator:PRR_MAIN,PRR_AUTO',
    'nrg_bal:REN',
  ])
  assert.equal(list.at(-1)?.reference?.value, 42.5)
  // Heat: CHP and heat-only plants.
  const heat = companionsFor({ ...p, filters: { ...p.filters, nrg_bal: 'GHP', unit: 'TJ' } }, dict, s)
  assert.deepEqual(heat.find((c) => c.dim === 'plants')?.codes, ['CHP', 'HEAT'])
})

test('one country: the renewable share is shown next to the EU-27 (the target line needs a comparison)', () => {
  const p: Plan = { dataset: 'nrg_ind_peh', filters: { freq: 'A', plants: 'TOTAL', operator: 'TOTAL', nrg_bal: 'GEP', siec: ['CF', 'RA300'], unit: 'GWH', geo: 'DE' }, time: { kind: 'last', n: 10 }, intent: 'mix' }
  assert.deepEqual(companionsFor(p, dict, s).find((c) => c.dataset === 'nrg_ind_ren')?.filters.geo, ['DE', 'EU27_2020'])
})

test('no renewables-target chart on consumption of one product (not a supply mix)', () => {
  assert.ok(!kinds('Oil consumption in Spain in 2024').includes('nrg_ind_ren:nrg_bal'))
})

test('price components: VAT is not counted twice (taxes include it)', () => {
  const c = companionsFor(plan('electricity prices for households in Germany'), dict, s)[0]
  const codes = ['NRG_SUP', 'NETC', 'TAX_FEE_LEV_CHRG', 'VAT', 'TAX_FEE_LEV_CHRG_ALLOW']
  const values: Record<string, number> = { NRG_SUP: 0.1481, NETC: 0.113, TAX_FEE_LEV_CHRG: 0.1241, VAT: 0.0615, TAX_FEE_LEV_CHRG_ALLOW: 0 }
  const result = {
    code: c.dataset,
    label: '',
    dimensionIds: ['nrg_prc', 'time'],
    dimensions: { nrg_prc: { label: '', codes: codes.map((code) => ({ code, label: code === 'VAT' ? 'Value added tax (VAT)' : code })) }, time: { label: '', codes: [{ code: '2025', label: '2025' }] } },
    observations: codes.map((code) => ({ keys: { nrg_prc: code, time: '2025' }, value: values[code] })),
  } as EurostatResult
  const w = [toWidget(c, result, 'en', (v) => v.toFixed(4))].flat()[0]
  assert.equal(w?.type, 'pie')
  const slices = (w as Extract<WidgetSpec, { type: 'pie' }>).slices
  const total = slices.reduce((n, x) => n + x.y, 0)
  assert.ok(Math.abs(total - 0.3852) < 0.001, `sum ${total}`)
  assert.ok(slices.some((x) => x.name === 'Other taxes and levies' && Math.abs(x.y - 0.0626) < 0.0001))
})
