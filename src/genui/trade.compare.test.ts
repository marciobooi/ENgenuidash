import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { refineTrade, tradePlan } from './trade'

// The partners' shares of one country against the EU (or another country): the plans of the
// questions and their follow-ups (the dashboard itself is checked live, see trade.monthly.test.ts).
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const hungary = () => tradePlan(' imports of natural gas by partner hungary 2024 ', dict, codelists)!

test('"compare with the EU" on a country\'s trade sets the EU as the comparison, "no comparison" takes it off', () => {
  const p = hungary()
  assert.equal(p.trade?.compare, undefined)
  for (const q of ['compare with eu', 'compare with the EU', 'versus the EU', 'vs eu', 'gegen die EU', 'par rapport à l’UE', 'compare']) {
    const c = refineTrade(p, q, dict, codelists)
    assert.equal(c?.trade?.compare, 'EU27_2020', q)
    assert.equal(c?.filters.geo, 'HU', q)
  }
  const on = refineTrade(p, 'compare with eu', dict, codelists)!
  assert.equal(refineTrade(on, 'no comparison', dict, codelists)?.trade?.compare, undefined)
})

test('another country can be the comparison, and a country change keeps it unless it is that country', () => {
  const p = refineTrade(hungary(), 'compare with Germany', dict, codelists)!
  assert.equal(p.trade?.compare, 'DE')
  assert.equal(refineTrade(p, 'and France?', dict, codelists)?.trade?.compare, 'DE')
  assert.equal(refineTrade(p, 'Germany', dict, codelists)?.trade?.compare, undefined)
})

test('the question can ask for the comparison itself', () => {
  assert.equal(tradePlan(' imports of natural gas by partner hungary versus the eu ', dict, codelists)?.trade?.compare, 'EU27_2020')
  assert.equal(tradePlan(' imports of natural gas by partner hungary ', dict, codelists)?.trade?.compare, undefined)
})
