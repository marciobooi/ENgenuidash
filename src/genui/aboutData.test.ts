import assert from 'node:assert/strict'
import { test } from 'node:test'
import { specToCsv } from './aboutData'
import type { DashboardSpec } from './types'

// The values behind a dashboard's charts and tables, as CSV: quoted where needed, missing values empty.
const spec = {
  title: 'T',
  widgets: [
    { type: 'line', title: 'Share, %', categories: ['2023', '2024'], series: [{ name: 'Germany', data: [1.5, null] }] },
    { type: 'pie', title: 'Mix', slices: [{ name: 'Wind "on"', y: 3 }] },
    { type: 'table', title: 'All', columns: ['2024'], rows: [{ label: 'Solar', values: [7] }] },
  ],
} as unknown as DashboardSpec

test('specToCsv writes one row per value', () => {
  const lines = specToCsv(spec).split('\n')
  assert.equal(lines[0], 'chart,category,series,value')
  assert.equal(lines[1], '"Share, %",2023,Germany,1.5')
  assert.equal(lines[2], '"Share, %",2024,Germany,')
  assert.equal(lines[3], 'Mix,"Wind ""on""",,3')
  assert.equal(lines[4], 'All,2024,Solar,7')
})
