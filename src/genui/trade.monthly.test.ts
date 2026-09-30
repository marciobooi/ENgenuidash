import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { refineTrade, tradePlan } from './trade'

// Monthly trade by partner (gas and oil): the plans of the questions and their follow-ups.
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')

test('gas and oil have monthly trade by partner: months asked for, months shown, a switch back to years', () => {
  const p = tradePlan(' imports natural gas germany july 2025 ', dict, codelists)!
  assert.ok(p.trade?.monthly)
  assert.equal(p.dataset, 'nrg_ti_gasm')
  assert.equal(p.focusPeriod, '2025-07')
  // a year or "yearly" on the monthly view, and a fuel without monthly data, go back to years
  assert.equal(refineTrade(p, 'yearly', dict, codelists)?.dataset, 'nrg_ti_gas')
  assert.equal(refineTrade(p, 'coal', dict, codelists)?.trade?.monthly, undefined)
  assert.equal(refineTrade(p, 'exports', dict, codelists)?.dataset, 'nrg_te_gasm')
  assert.equal(refineTrade(p, 'March 2024', dict, codelists)?.focusPeriod, '2024-03')
  // the trade between two countries is yearly
  const two = tradePlan(' trade between spain and germany july 2025 ', dict, codelists)!
  assert.equal(two.trade?.monthly, undefined)
})
