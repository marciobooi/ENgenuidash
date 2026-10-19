import assert from 'node:assert/strict'
import { test } from 'node:test'
import { peerChips } from './peers'

// The two countries nearest on the ranked indicator, never the country itself, never the EU.
const rank = [
  { code: 'SE', name: 'Sweden', value: 66 },
  { code: 'EU27_2020', name: 'EU-27', value: 25 },
  { code: 'ES', name: 'Spain', value: 24 },
  { code: 'DE', name: 'Germany', value: 23 },
  { code: 'FR', name: 'France', value: 22.5 },
  { code: 'PL', name: 'Poland', value: 18 },
]

test('peerChips picks the nearest two countries', () => {
  const chips = peerChips(rank, 'DE', (n, v) => `${n}: ${v}`, (c) => ({ dataset: c, filters: {}, time: { kind: 'all' }, intent: 'snapshot' }))
  assert.deepEqual(chips.map((c) => c.label), ['France: 22.5', 'Spain: 24.0'])
  assert.equal(chips[0].plan?.dataset, 'FR')
  assert.deepEqual(peerChips(rank, 'XX', (n) => n, () => undefined), [])
})
