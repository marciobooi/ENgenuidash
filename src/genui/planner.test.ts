import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { planQuestion } from './planner'
import type { Plan } from './types'

// Questions beyond the hand-written topics: the dictionary search picks the dataset and codes.
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')

function plan(q: string): Plan {
  const r = planQuestion(q, dict, codelists)
  assert.equal(r.kind, 'plan', `${q} → ${r.kind}`)
  return (r as { plan: Plan }).plan
}

const CASES: [string, string | string[], Partial<Record<string, unknown>>?][] = [
  ['gas storage in Germany', 'nrg_stk_gas', { stk_flow: 'STKCL_NAT', geo: 'DE' }],
  ['oil stocks in the EU', 'nrg_stk_oil', { stk_flow: 'STKCL_NAT' }],
  ['heat pumps in Sweden', ['nrg_ind_hpind', 'nrg_inf_hptc']],
  ['solar capacity in Spain', ['nrg_inf_epcrw', 'nrg_inf_epc'], { geo: 'ES' }],
  ['capacité solaire en France', ['nrg_inf_epcrw', 'nrg_inf_epc']],
  ['batteries storage capacity', 'nrg_inf_bt'],
  ['imports of natural gas from Norway', 'nrg_ti_gas', { partner: 'NO', geo: 'EU27_2020' }],
  ['Gasimporte aus Russland', 'nrg_ti_gas', { partner: 'RU' }],
  ['coal imports from Colombia', 'nrg_ti_sff', { partner: 'CO' }],
  ['LNG imports in Spain', 'nrg_ti_gas', { siec: 'G3200', geo: 'ES' }],
  ['wood pellets consumption in Austria', ['nrg_cb_rw', 'nrg_cb_bm'], { siec: 'R5111' }],
  ['peat in Finland', 'nrg_bal_c', { siec: 'P1100' }],
  ['biodiesel production in France', 'nrg_bal_c', { nrg_bal: 'PPRD' }],
  ['energy productivity in Europe', ['nrg_ind_ep', 'sdg_07_30']],
  ['emergency oil stocks in days', 'nrg_stk_oem'],
  ['hydrogen production capacity', 'nrg_inf_h2stpc'],
  ['data centres electricity consumption', 'isoc_env_ict_nrg'],
  ['energy self-reliance', 'nrg_ind_esr'],
  ['rate of electrification', 'nrg_ind_re'],
  // The hand-written routes still win for their topics.
  ['What is the energy import dependency of the EU?', 'nrg_ind_id'],
  ['Oil consumption in Spain in 2024', 'nrg_bal_c', { nrg_bal: 'FC_E', siec: 'O4000XBIO' }],
  ['Renewable energy share in Spain since 2010', 'nrg_ind_ren'],
  ['electricity prices for households', 'nrg_pc_204'],
  ['gas consumption of households in Italy', 'nrg_bal_c', { nrg_bal: 'FC_OTH_HH_E', siec: 'G3000' }],
]

test('questions reach the right dataset and codes', () => {
  const wrong: string[] = []
  for (const [q, datasets, filters] of CASES) {
    const p = plan(q)
    const ok = ([] as string[]).concat(datasets).includes(p.dataset) && Object.entries(filters ?? {}).every(([k, v]) => p.filters[k] === v)
    if (!ok) wrong.push(`${q} → ${p.dataset} ${JSON.stringify(p.filters)}`)
  }
  assert.deepEqual(wrong, [])
})

test('"by country of origin" is a partner breakdown, not every EU country', () => {
  const p = plan('crude oil imports by country of origin')
  assert.ok(Array.isArray(p.filters.partner) && p.filters.partner.length > 3, JSON.stringify(p.filters))
  assert.ok(!Array.isArray(p.filters.geo), JSON.stringify(p.filters.geo))
})

test('"… by fuel" on a dataset with products gives one series per product', () => {
  const p = plan('energy consumption in road transport by fuel')
  assert.ok(Array.isArray(p.filters.siec) && p.filters.siec.length > 3, JSON.stringify(p.filters))
})

test('a topic word nothing knows gives no dashboard instead of a guessed one', () => {
  assert.equal(planQuestion('greenhouse gas emissions from energy', dict, codelists).kind, 'none')
})
