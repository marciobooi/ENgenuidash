import assert from 'node:assert/strict'
import { test } from 'node:test'
import { comparableSum } from './sums'

test('a period missing a part that is reported now has no total (not a small one)', () => {
  // 1990: only fuels; solar reported from 2000 on.
  const fuels = [50, 52, 55, 54]
  const solar = [null, 1, 3, 6]
  assert.deepEqual(comparableSum([fuels, solar]), [null, 53, 58, 60])
})

test('a part that stopped earlier still counts while it was there', () => {
  const coal = [10, 5, null, null]
  const wind = [1, 2, 3, 4]
  assert.deepEqual(comparableSum([coal, wind]), [11, 7, 3, 4])
})

test('an incomplete latest year does not decide which parts are required', () => {
  // 2024 provisional: only wind so far; 2023 is the latest complete year.
  const gas = [20, 21, 22, null]
  const wind = [3, 4, 5, 6]
  assert.deepEqual(comparableSum([gas, wind]), [23, 25, 27, null])
})

test('no values at all', () => {
  assert.deepEqual(comparableSum([[null, null]]), [null, null])
})
