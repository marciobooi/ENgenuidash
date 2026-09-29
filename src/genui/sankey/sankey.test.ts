import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { STRINGS } from '../../i18n'
import { installEurostatStub } from '../../test/eurostatStub'
import { buildDashboard } from '../execute'
import { dashStrings } from '../strings'
import { DEFAULT_DISAGGREGATION, layoutSankey } from './layout'
import { BalanceTable, buildModel } from './model'
import { refineSankey, sankeyPlan } from './sankeyDashboard'

// The energy flow diagram (ENSANKEY): questions, the flows worked out of the balance lines, the picture.
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const s = dashStrings(STRINGS.en)
let restore: () => void
before(() => {
  restore = installEurostatStub(dict, codelists)
})
after(() => restore())

test('questions about energy flows open the diagram, with country, year and product', () => {
  const p = sankeyPlan(' energy flow diagram of germany 2022 ', dict, codelists)
  assert.ok(p?.sankey)
  assert.equal(p?.filters.geo, 'DE')
  assert.equal(p?.focusPeriod, '2022')
  assert.equal(sankeyPlan(' sankey for the eu ', dict, codelists)?.filters.geo, 'EU27_2020')
  assert.equal(sankeyPlan(' natural gas flows sankey ', dict, codelists)?.sankey?.fuel, 'G3000_C0350-370')
  assert.equal(sankeyPlan(' what is a sankey diagram ', dict, codelists), null)
  assert.equal(sankeyPlan(' coal consumption in poland ', dict, codelists), null)
  const on = sankeyPlan(' energy flow diagram of germany ', dict, codelists)!
  assert.equal(refineSankey(on, 'and France?', dict, codelists)?.filters.geo, 'FR')
  assert.equal(refineSankey(on, 'in GWh', dict, codelists)?.filters.unit, 'GWH')
  assert.equal(refineSankey(on, 'renewables', dict, codelists)?.sankey?.fuel, 'RA000')
  assert.equal(refineSankey(on, 'coal consumption in poland', dict, codelists), null)
})

test('the flows of a balance add up as in ENSANKEY: available energy in, consumption and losses out', () => {
  // Two products, one year: gas (draws stock, statistical difference out) and oil (builds stock).
  const rows = {
    'PPRD|G3000': [100], 'IMP|G3000': [400], 'STK_CHG|G3000': [30], 'STATDIFF|G3000': [5], 'TI_E|G3000': [200], 'TO|G3000': [120], 'FC_E|G3000': [250], 'EXP|G3000': [20], 'NRG_E|G3000': [10], 'DL|G3000': [5], 'INTMARB|G3000': [0], 'INTAVI|G3000': [0], 'FC_NE|G3000': [0], 'RCV_RCY|G3000': [0],
    'PPRD|O4100_TOT': [50], 'IMP|O4100_TOT': [300], 'STK_CHG|O4100_TOT': [-10], 'STATDIFF|O4100_TOT': [-2], 'TI_E|O4100_TOT': [100], 'TO|O4100_TOT': [90], 'FC_E|O4100_TOT': [240], 'EXP|O4100_TOT': [30], 'NRG_E|O4100_TOT': [0], 'DL|O4100_TOT': [0], 'INTMARB|O4100_TOT': [0], 'INTAVI|O4100_TOT': [0], 'FC_NE|O4100_TOT': [0], 'RCV_RCY|O4100_TOT': [0],
  }
  const table = new BalanceTable(['2024'], rows)
  const flows = buildModel(table, 'G3000_C0350-370', false).flows('2024')
  const v = (c: string) => flows.get(c)!.value
  // gas alone: available = production + imports + stock draw + negative statistical difference (none here)
  assert.equal(v('N1'), 100 + 400 + 30)
  assert.equal(v('F1_3'), 30)
  assert.equal(v('F6_8'), 5)
  assert.equal(v('N6'), 250 + 0 + 20 + 0 + 10 + 5 + 0 + 5)
  assert.equal(v('F4'), 0, 'losses are worked out for all products only')
  const oil = buildModel(table, 'O4000', false).flows('2024')
  assert.equal(oil.get('F6_2')!.value, 10)
  assert.equal(oil.get('F1_4')!.value, 2)
})

test('the picture places the nodes of the original and stacks each node with what flows through it', () => {
  const rows: Record<string, (number | null)[]> = {}
  const set = (line: string, value: number) => (rows[`${line}|G3000`] = [value])
  Object.entries({ PPRD: 550, IMP: 1180, STK_CHG: 20, STATDIFF: -15, TI_E: 1140, TO: 920, FC_E: 900, FC_NE: 56, EXP: 420, NRG_E: 60, DL: 22, INTMARB: 40, INTAVI: 41, RCV_RCY: 0 }).forEach(([l, n]) => set(l, n))
  const model = buildModel(new BalanceTable(['2024'], rows), 'G3000_C0350-370', false)
  const layout = layoutSankey({ flows: model.flows('2024'), width: 1200, height: 660, scaleMax: model.scaleMax, disaggregation: DEFAULT_DISAGGREGATION, transformationShift: 0, name: (c) => c, format: (n) => String(Math.round(n)), unit: 'ktoe', measure: (t) => t.length * 6 })
  const codes = layout.nodes.map((n) => n.code)
  for (const c of ['N1', 'N6', 'N1_1', 'E1_2', 'E1_3', 'T2', 'N5', 'N6_1', 'E6_3']) assert.ok(codes.includes(c), c)
  assert.ok(layout.flows.every((f) => f.paths.every((p) => p.d.startsWith('M ') && !p.d.includes('NaN'))))
  const n1 = layout.nodes.find((n) => n.code === 'N1')!
  assert.equal(n1.value, 550 + 1180 + 20 + 15)
})

test('the diagram is built from the balance, with the year, the products and the toolbar choices', async () => {
  const plan = sankeyPlan(' energy flow diagram of germany ', dict, codelists)!
  const d = await buildDashboard(plan, dict, 'en', s)
  const w = d.widgets.find((x) => x.type === 'sankey')
  assert.ok(w && w.type === 'sankey')
  assert.ok(w.years.length > 10 && Object.values(w.table).every((r) => r.length === w.years.length))
  assert.match(d.title, /Energy flow diagram: Germany/)
  assert.ok(d.controls?.choices?.some((c) => c.key === 'fuel') && d.controls?.choices?.some((c) => c.key === 'view'))
  const coloured = await buildDashboard({ ...plan, sankey: { fuel: 'RA000', byFuel: true } }, dict, 'en', s)
  assert.match(coloured.widgets.find((x) => x.type === 'sankey')!.type, /sankey/)
})
