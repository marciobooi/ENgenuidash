import assert from 'node:assert/strict'
import { test } from 'node:test'
import { outlierCap } from './scale'

test('one extreme change caps the axis near the typical values', () => {
  const cap = outlierCap([3, -6, 9, 12, -4, 8, 606710])
  assert.ok(cap != null && cap > 12 && cap < 100, String(cap))
})

test('ordinary changes and short lists keep the full axis', () => {
  assert.equal(outlierCap([3, -6, 9, 12, -4, 8, 20]), null)
  assert.equal(outlierCap([1, 9000]), null)
})
