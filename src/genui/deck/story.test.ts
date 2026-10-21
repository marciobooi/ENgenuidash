import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DashboardSpec } from '../types'
import { howKey, storyOf } from './story'

// The story is read from the spec: the first series over time, the first ranking, the first breakdown.
const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
const spec = {
  unit: '%',
  widgets: [
    { type: 'line', title: 'Share', categories: ['2020', '2021', '2022', '2023'], series: [{ name: 'DE', data: [10, 20, null, 15] }, { name: 'Path', data: [1, 2, 3, 4] }] },
    { type: 'bar', title: 'Ranking, 2023', categories: names, series: [{ name: 'x', data: names.map((_, i) => 100 - i * 10) }] },
    { type: 'pie', title: 'Mix', slices: [{ name: 'Gas', y: 30 }, { name: 'Wind', y: 70 }] },
  ],
} as unknown as DashboardSpec

test('how it changed, who is highest and lowest, what it is made of', () => {
  const s = storyOf(spec)
  assert.deepEqual([s.change?.from.value, s.change?.to.value, s.change?.peak.year, s.change?.low.year], [10, 15, '2021', '2020'])
  assert.equal(s.change?.pct, 50)
  assert.deepEqual(s.ranking?.top.map((r) => r.name), ['A', 'B', 'C'])
  assert.deepEqual(s.ranking?.bottom.map((r) => r.name), ['J', 'I', 'H'])
  assert.equal(s.ranking?.year, '2023')
  assert.deepEqual(s.makeup?.parts.map((p) => [p.name, Math.round(p.share)]), [['Wind', 70], ['Gas', 30]])
})

test('bars over years are not a ranking of countries', () => {
  const years = Array.from({ length: 12 }, (_, i) => String(2010 + i))
  const s = storyOf({ widgets: [{ type: 'bar', title: 'Change', categories: years, series: [{ name: 'x', data: years.map((_, i) => i) }] }] } as unknown as DashboardSpec)
  assert.equal(s.ranking, undefined)
})

test('a dashboard without those charts has no story, and charts name how they are read', () => {
  assert.deepEqual(storyOf({ widgets: [{ type: 'kpis', items: [] }] } as unknown as DashboardSpec), { change: undefined, ranking: undefined, makeup: undefined })
  assert.equal(howKey(spec.widgets[0]), 'line')
  assert.equal(howKey(spec.widgets[1]), 'rank')
  assert.equal(howKey(spec.widgets[2]), 'pie')
})
