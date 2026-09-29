import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isCrowdedBar, MAX_BARS } from './crowded'
import type { WidgetSpec } from './types'

const bar = (n: number): WidgetSpec => ({ type: 'bar', title: 't', categories: Array.from({ length: n }, (_, i) => `c${i}`), series: [{ name: 's', data: Array(n).fill(1) }], horizontal: true, size: 'half' })

test('a bar chart of more than ten categories is a full-row column chart; ten or fewer stay horizontal bars', () => {
  assert.equal(MAX_BARS, 10)
  assert.equal(isCrowdedBar(bar(10)), false)
  assert.equal(isCrowdedBar(bar(11)), true)
  assert.equal(isCrowdedBar(bar(27)), true)
  assert.equal(isCrowdedBar({ type: 'pie', title: 't', slices: [] } as unknown as WidgetSpec), false)
})
