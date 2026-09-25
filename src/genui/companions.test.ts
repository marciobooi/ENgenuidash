import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { EurostatResult } from '../data/eurostat'
import { STRINGS } from '../i18n'
import { companionsFor, toWidget } from './companions'
import { planQuestion } from './planner'
import type { Plan } from './types'

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

test('no companions for several countries (they describe one country)', () => {
  assert.deepEqual(kinds('Renewable energy share in Spain, France and Germany'), [])
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
  const w = toWidget(c, result, 'en', (v) => v.toFixed(4))
  assert.equal(w?.type, 'pie')
  const slices = (w as Extract<typeof w, { type: 'pie' }>).slices
  const total = slices.reduce((n, x) => n + x.y, 0)
  assert.ok(Math.abs(total - 0.3852) < 0.001, `sum ${total}`)
  assert.ok(slices.some((x) => x.name === 'Other taxes and levies' && Math.abs(x.y - 0.0626) < 0.0001))
})
