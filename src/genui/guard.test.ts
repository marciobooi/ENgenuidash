import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { withEveryDimension } from './execute'
import type { WidgetSpec } from './types'
import { MAX_CATEGORIES, widgetProblem } from './validate'

// Guards against runaway dashboards: a plan that leaves a big dimension open, or a chart with
// thousands of bars, never reaches the page.
const dict = JSON.parse(readFileSync('public/data/eurostat/energy/dictionary.json', 'utf8'))

test('an open dimension gets its total, not all its codes', () => {
  const plan = withEveryDimension({ dataset: 'nrg_bal_c', filters: { geo: 'DE', unit: 'GWH' }, time: { kind: 'last', n: 1 }, intent: 'snapshot' }, dict)
  assert.equal(plan.filters.siec, 'TOTAL')
  assert.equal(typeof plan.filters.nrg_bal, 'string')
  assert.equal(plan.filters.geo, 'DE')
  assert.equal(plan.filters.unit, 'GWH')
})

test('a plan with every dimension set is unchanged', () => {
  const plan = { dataset: 'nrg_bal_c', filters: { geo: 'DE', unit: 'GWH', siec: ['G3000', 'E7000'], nrg_bal: 'GIC', freq: 'A' }, time: { kind: 'last' as const, n: 5 }, intent: 'trend' as const }
  assert.equal(withEveryDimension(plan, dict), plan)
})

test('a chart with thousands of bars is left out', () => {
  const n = MAX_CATEGORIES + 1
  const bar: WidgetSpec = { type: 'bar', title: 'x', categories: Array.from({ length: n }, (_, i) => `c${i}`), series: [{ name: 's', data: Array(n).fill(1) }] }
  assert.match(widgetProblem(bar) ?? '', /too large/)
  const ok: WidgetSpec = { ...bar, categories: bar.categories.slice(0, 27), series: [{ name: 's', data: Array(27).fill(1) }] }
  assert.equal(widgetProblem(ok), null)
})
