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
  // German and French, with compounds and accents
  ['Wie viel Strom produziert Frankreich aus Kernenergie?', 'nrg_bal_peh', { siec: 'N900H', geo: 'FR' }],
  ['Stromerzeugung aus Wind in Dänemark', 'nrg_bal_peh', { siec: 'RA300', geo: 'DK' }],
  ['Gasverbrauch der Haushalte in Deutschland seit 2015', 'nrg_bal_c', { nrg_bal: 'FC_OTH_HH_E', siec: 'G3000' }],
  ['Kohleverbrauch in Polen 2023', 'nrg_bal_c', { nrg_bal: 'FC_E', siec: 'C0000X0350-0370', geo: 'PL' }],
  ['Erdölimporte aus Norwegen', 'nrg_ti_oil', { partner: 'NO' }],
  ['Anteil erneuerbarer Energien im Verkehr in Schweden', 'nrg_ind_ren', { nrg_bal: 'REN_TRA' }],
  ['Energieintensität in Polen', 'nrg_ind_ei', { geo: 'PL' }],
  ['Consommation de gaz naturel en Italie', 'nrg_bal_c', { nrg_bal: 'FC_E', siec: 'G3000' }],
  ['Production d électricité solaire en Espagne', 'nrg_bal_peh', { siec: 'RA420' }],
  ['Prix du gaz pour les ménages en France', 'nrg_pc_202', { geo: 'FR' }],
  ['Part des renouvelables dans l électricité en Portugal', 'nrg_ind_ren', { nrg_bal: 'REN_ELC' }],
  ['Dépendance aux importations de pétrole de la Grèce', 'nrg_ind_id', { siec: 'O4000XBIO', geo: 'EL' }],
  ['Stocks de gaz en Allemagne', 'nrg_stk_gas', { geo: 'DE' }],
  // More topics
  ['How much electricity does Norway export?', 'nrg_bal_c', { nrg_bal: 'EXP', siec: 'E7000', geo: 'NO' }],
  ['Electricity imports of Italy', 'nrg_bal_c', { nrg_bal: 'IMP', siec: 'E7000' }],
  ['Final energy consumption per capita in Luxembourg', 'nrg_ind_esc', { geo: 'LU' }],
  ['Hydrogen production in the EU', ['nrg_ind_psth2', 'nrg_cb_h2']],
  ['Hydro power production in Austria', 'nrg_bal_peh', { siec: 'RA100' }],
  ['Heating degree days in Finland', 'nrg_chdd_a', { indic_nrg: 'HDD' }],
  ['Cooling degree days in Spain monthly', 'nrg_chdd_m', { indic_nrg: 'CDD' }],
  ['Biogas production in Germany since 2012', 'nrg_bal_c', { nrg_bal: 'PPRD', siec: 'R5300' }],
  ['Share of renewables in heating and cooling in Sweden', 'nrg_ind_ren', { nrg_bal: 'REN_HEAT_CL' }],
  ['Primary energy consumption of the EU', 'sdg_07_10'],
  ['Wind power capacity in Germany', ['nrg_inf_epcrw', 'nrg_inf_epc'], { siec: 'RA300' }],
  ['batteries storage capacity', 'nrg_inf_bt', { plant_tec: 'CAP_BAST' }],
  ['Diesel consumption in road transport in Poland', 'ten00127', { geo: 'PL' }],
  ['Industrial electricity prices in Italy without taxes', 'nrg_pc_205', { tax: 'X_TAX' }],
  ['Gas prices for households in Spain in PPS', 'nrg_pc_202', { currency: 'PPS' }],
  ['Natural gas imports from Russia to the EU monthly', 'nrg_ti_gasm', { partner: 'RU' }],
  ['Energy consumption in Spain', 'nrg_bal_c', { geo: 'ES' }],
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

test('"nuclear share of electricity" shows the electricity mix, with nuclear among the sources', () => {
  const p = plan('Nuclear share of electricity in France')
  assert.equal(p.dataset, 'nrg_bal_peh')
  assert.equal(p.intent, 'mix')
  assert.ok(Array.isArray(p.filters.siec) && p.filters.siec.includes('N900H'))
})

test('words that look alike are not confused', () => {
  // hydrogen ≠ hydro, productivity ≠ production, important ≠ imports, pétrole ≠ petrol
  assert.notEqual(plan('Hydrogen production in the EU').filters.siec, 'RA100')
  assert.notEqual(plan('energy productivity in Europe').dataset, 'nrg_bal_c')
  assert.equal(planQuestion('Why is gas important?', dict, codelists).kind, 'explain')
  assert.equal(plan('consommation de pétrole en France').filters.siec, 'O4000XBIO')
})

test('a topic word nothing knows gives no dashboard instead of a guessed one', () => {
  assert.equal(planQuestion('noise from wind turbines', dict, codelists).kind, 'none')
  assert.equal(planQuestion('jobs in the solar industry', dict, codelists).kind, 'none')
  // Emissions from energy use are in the data now (env_air_gge, the energy sectors' combustion).
  assert.equal((planQuestion('greenhouse gas emissions from energy', dict, codelists) as { plan: { dataset: string } }).plan.dataset, 'env_air_gge')
})
