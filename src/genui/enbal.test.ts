import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { planQuestion } from './planner'
import type { Plan } from './types'

// Energy balance questions reach the same cells as Eurostat's energy balances visualisation
// (https://ec.europa.eu/eurostat/cache/visualisations/energy-balances/enbal.html), which reads
// nrg_bal_c from the same API: the same dataset, flow, product, unit and country give the same
// numbers. Each case: question, expected flow (nrg_bal), products (siec), and optionally unit/geo.
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')

type Case = [question: string, nrgBal: string, siec: string | string[], extra?: Record<string, string>]

const CASES: Case[] = [
  // Balance lines (enbal "balances")
  ['total energy supply in Greece', 'NRGSUP', 'TOTAL', { geo: 'EL' }],
  ['transformation input in France', 'TI_E', 'TOTAL', { geo: 'FR' }],
  ['transformation output in Italy 2022', 'TO', 'TOTAL'],
  ['energy sector own use in Poland', 'NRG_E', 'TOTAL'],
  ['distribution losses in Spain', 'DL', 'TOTAL'],
  ['available for final consumption in Austria', 'AFC', 'TOTAL'],
  ['statistical differences in Belgium', 'STATDIFF', 'TOTAL'],
  ['non-energy use in the Netherlands', 'FC_NE', 'TOTAL'],
  // Main fuel families
  ['manufactured gases in Germany', 'GIC', 'C0350-0370'],
  ['oil shale in Estonia', 'GIC', 'S2000'],
  ['renewables in Spain', 'GIC', 'RA000'],
  // Coal, oil, gases, wastes
  ['anthracite in Poland', 'GIC', 'C0110'],
  ['coking coal consumption in the EU', 'FC_E', 'C0121', { geo: 'EU27_2020' }],
  ['lignite in Greece', 'GIC', 'C0220'],
  ['crude oil supply in Italy', 'NRGSUP', 'O4100_TOT'],
  ['natural gas liquids in Norway', 'GIC', 'O4200'],
  ['motor gasoline consumption in France', 'FC_E', 'O4652XR5210B'],
  ['LPG consumption in Poland', 'FC_E', 'O4630'],
  ['fuel oil in Spain', 'GIC', 'O4680'],
  ['naphtha in the Netherlands', 'GIC', 'O4640'],
  ['bitumen in Germany', 'GIC', 'O4695'],
  ['petroleum coke in Belgium', 'GIC', 'O4694'],
  ['renewable municipal waste in Denmark', 'GIC', 'W6210'],
  // Renewables, combustible and not
  ['hydro in Austria', 'GIC', 'RA100'],
  ['geothermal in Italy', 'GIC', 'RA200'],
  ['tide wave and ocean in France', 'GIC', 'RA500'],
  ['charcoal in Portugal', 'GIC', 'R5160'],
  ['biogasoline in the EU', 'GIC', ['R5210P', 'R5210B']],
  ['bio jet kerosene in the EU', 'GIC', ['R5230P', 'R5230B']],
  ['blended biodiesels in France', 'GIC', 'R5220B'],
  ['biogases in Germany', 'GIC', 'R5300'],
  ['what was the Combustible renewables (biofuels), 2022 in spain', 'GIC', 'BIOE', { geo: 'ES' }],
  ['primary solid biofuels in Finland', 'GIC', 'R5110-5150_W6000RI'],
  // Electricity and heat
  ['nuclear heat in France', 'GIC', 'N900H'],
  ['derived heat in Denmark', 'GIC', 'H8000'],
  // Units (enbal: KTOE, GWH, TJ)
  ['electricity in Germany in GWh', 'GIC', 'E7000', { unit: 'GWH' }],
  ['oil consumption in Spain in TJ', 'FC_E', 'O4000XBIO', { unit: 'TJ' }],
]

test('energy balance questions reach the same nrg_bal_c cells as the energy balances tool', () => {
  const wrong: string[] = []
  for (const [q, nrgBal, siec, extra] of CASES) {
    const r = planQuestion(q, dict, codelists)
    const p = r.kind === 'plan' ? (r as { plan: Plan }).plan : null
    const ok =
      p?.dataset === 'nrg_bal_c' &&
      p.filters.nrg_bal === nrgBal &&
      JSON.stringify(p.filters.siec) === JSON.stringify(siec) &&
      Object.entries(extra ?? {}).every(([k, v]) => p.filters[k] === v)
    if (!ok) wrong.push(`${q} → ${p ? `${p.dataset} ${JSON.stringify(p.filters)}` : r.kind}`)
  }
  assert.deepEqual(wrong, [])
})

test('"energy mix" of a country and a unit is the balance mix in that unit', () => {
  const r = planQuestion('energy mix in Spain in TJ', dict, codelists)
  assert.equal(r.kind, 'plan')
  const p = (r as { plan: Plan }).plan
  assert.equal(p.dataset, 'nrg_bal_c')
  assert.equal(p.filters.unit, 'TJ')
  assert.ok(Array.isArray(p.filters.siec) && p.filters.siec.length > 1)
})
