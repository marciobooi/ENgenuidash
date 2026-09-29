import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dropEmptyRows } from './empty'
import type { WidgetSpec } from './types'

const NOTE = 'No data for {names} in this selection.'

test('countries without any value leave the chart and are named under it', () => {
  const w: WidgetSpec = { type: 'bar', title: 'Mix', categories: ['Belgium', 'Albania', 'Estonia', 'Spain'], series: [{ name: 'Wind', data: [5, null, 0, 7] }, { name: 'Nuclear', data: [9, null, 0, 1] }], stacked: 'percent' }
  const out = dropEmptyRows(w, NOTE) as Extract<WidgetSpec, { type: 'bar' }>
  assert.deepEqual(out.categories, ['Belgium', 'Spain'])
  assert.deepEqual(out.series[0].data, [5, 7])
  assert.equal(out.note, 'No data for Albania, Estonia in this selection.')
})

test('a change of 0 is a value; years are never dropped; nothing to drop leaves the chart as is', () => {
  const change: WidgetSpec = { type: 'bar', title: 'Change', categories: ['A', 'B'], series: [{ name: 'x', data: [0, 3] }], signed: true }
  assert.equal(dropEmptyRows(change, NOTE), change)
  const years: WidgetSpec = { type: 'bar', title: 'Shares', categories: ['2022', '2023'], series: [{ name: 'x', data: [null, 3] }], stacked: 'percent' }
  assert.equal(dropEmptyRows(years, NOTE), years)
})

test('dumbbell rows with neither value leave the chart', () => {
  const w: WidgetSpec = { type: 'dumbbell', title: 'd', categories: ['A', 'B', 'C'], from: { name: '2022', data: [1, null, 3] }, to: { name: '2023', data: [2, null, 4] } }
  const out = dropEmptyRows(w, NOTE) as Extract<WidgetSpec, { type: 'dumbbell' }>
  assert.deepEqual(out.categories, ['A', 'C'])
  assert.equal(out.note, 'No data for B in this selection.')
})

test('a ranking drops the rows that are zero everywhere and names them; a chart that shrinks to a few bars is half a row again', () => {
  const countries = Array.from({ length: 14 }, (_, i) => `C${i}`)
  const values = countries.map((_, i) => (i < 3 ? 100 - i : 0))
  const w = dropEmptyRows({ type: 'bar', title: 'r', categories: countries, series: [{ name: 's', data: values }], horizontal: true, size: 'full', role: 'ranking' }, 'No data for {names}.', 'Zero: {names}.') as Extract<WidgetSpec, { type: 'bar' }>
  assert.deepEqual(w.categories, ['C0', 'C1', 'C2'])
  assert.equal(w.size, 'half')
  assert.match(w.note ?? '', /^Zero: C3, C4/)
  // A change (signed) of zero is a value, not an absence.
  const change = dropEmptyRows({ type: 'bar', title: 'c', categories: countries, series: [{ name: 's', data: values }], signed: true, role: 'change' }, 'No data for {names}.', 'Zero: {names}.') as Extract<WidgetSpec, { type: 'bar' }>
  assert.equal(change.categories.length, 14)
  // Switchable views lose the countries with no value in that view.
  const views = [{ label: '2015', title: 'x', categories: ['A', 'B', 'C'], data: [5, null, -2] as (number | null)[] }]
  const v = dropEmptyRows({ type: 'bar', title: 'v', categories: ['A', 'B', 'C'], series: [{ name: 's', data: [5, null, -2] }], views } as unknown as WidgetSpec, 'No data for {names}.', 'Zero: {names}.') as Extract<WidgetSpec, { type: 'bar' }>
  assert.deepEqual(v.categories, ['A', 'C'])
  assert.deepEqual(v.views?.[0].categories, ['A', 'C'])
})
