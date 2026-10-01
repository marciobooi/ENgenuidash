import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alternatePlan, withAlternates } from './execute'
import type { DashboardSpec, Plan, WidgetSpec } from './types'

const bar = (title: string, role?: WidgetSpec['role'], extra: Partial<WidgetSpec> = {}) => ({ type: 'bar', title, categories: ['a'], series: [{ name: 's', data: [1] }], role, ...extra }) as WidgetSpec
const spec = (widgets: WidgetSpec[], compareNames?: [string, string]) => ({ widgets, compareNames }) as DashboardSpec

test('with a comparison on, the charts of the other place are attached to the matching ones, and the comparison chart has none', () => {
  const main = spec([{ type: 'kpis', items: [] }, bar('Compare', 'ranking', { cmp: true }), bar('Top Hungary', 'ranking'), bar('Mix Hungary', 'composition')], ['Hungary', 'France'])
  const other = spec([{ type: 'kpis', items: [] }, bar('Top France', 'ranking'), bar('Mix France', 'composition')])
  const out = withAlternates(main, other).widgets
  assert.equal(out[1].alt, undefined)
  assert.equal(out[2].alt?.label, 'France')
  assert.equal(out[2].alt?.mainLabel, 'Hungary')
  assert.equal((out[2].alt?.widget as { title: string }).title, 'Top France')
  assert.equal((out[3].alt?.widget as { title: string }).title, 'Mix France')
  assert.equal(out[0].alt, undefined)
})

test('a chart with no twin (a different kind or role) is left as it is, and no comparison means no toggle', () => {
  const main = spec([bar('Only here', 'evolution')], ['Hungary', 'France'])
  assert.equal(withAlternates(main, spec([bar('Other', 'ranking')])).widgets[0].alt, undefined)
  assert.equal(withAlternates(spec([bar('x')]), spec([bar('y')])).widgets[0].alt, undefined)
  const plain = { dataset: 'x', filters: { geo: 'HU' }, trade: { flow: 'imp', fuel: 'gas' } } as unknown as Plan
  assert.equal(alternatePlan(plain), null)
})

test('the other place is built from the plan with its country and no comparison; earlier years need the year of the sheet', () => {
  const trade = { dataset: 'nrg_ti_gas', filters: { geo: 'HU' }, trade: { flow: 'imp', fuel: 'gas', compare: 'FR' } } as unknown as Plan
  const alt = alternatePlan(trade)!
  assert.equal(alt.filters.geo, 'FR')
  assert.equal(alt.trade?.compare, undefined)
  const sheet = { dataset: 'nrg_bal_c', filters: { geo: 'DE' }, focusPeriod: '2024', balance: { fuels: 'main', compare: 'y1' } } as unknown as Plan
  assert.equal(alternatePlan(sheet)?.focusPeriod, '2023')
  assert.equal(alternatePlan({ ...sheet, focusPeriod: undefined }), null)
})
