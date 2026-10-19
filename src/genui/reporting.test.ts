import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { refineReporting, reportingPlan } from './reporting'

// The efficiency, energy security and energy poverty dashboards: found by wording, tab and country.
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const tab = (q: string) => reportingPlan(q, dict, codelists)?.reporting?.tab

test('each dashboard is asked for by wording', () => {
  assert.equal(tab(' energy efficiency dashboard for germany '), 'efficiency')
  assert.equal(tab(' indicative trajectory of energy consumption '), 'efficiency')
  assert.equal(tab(' energy security dashboard of italy '), 'diversification')
  assert.equal(tab(' diversification of energy sources in spain '), 'diversification')
  assert.equal(tab(' energy dependence on third countries in poland '), 'dependence')
  assert.equal(tab(' energy poverty indicators in greece '), 'poverty')
  assert.equal(tab(' arrears on utility bills in spain '), 'poverty')
  assert.equal(tab(' household electricity and gas prices in france '), 'prices')
  assert.equal(reportingPlan(' energy poverty dashboard of greece ', dict, codelists)?.filters.geo, 'EL')
  assert.equal(reportingPlan(' energy security dashboard ', dict, codelists)?.filters.geo, 'EU27_2020')
})

test('definitions and the plain datasets stay where they were', () => {
  assert.equal(reportingPlan(' what is energy poverty ', dict, codelists), null)
  assert.equal(reportingPlan(' why is energy security important ', dict, codelists), null)
  assert.equal(reportingPlan(' primary and final energy consumption and the 2030 efficiency targets ', dict, codelists), null)
})

test('a follow-up changes the tab, country or period', () => {
  const on = reportingPlan(' energy efficiency dashboard for germany ', dict, codelists)!
  assert.equal(refineReporting(on, 'prices', dict, codelists)?.reporting?.tab, 'prices')
  assert.equal(refineReporting(on, 'and France?', dict, codelists)?.filters.geo, 'FR')
  assert.equal(refineReporting(on, 'poverty in Spain', dict, codelists)?.filters.geo, 'ES')
  assert.equal(refineReporting(on, 'since 2020', dict, codelists)?.reporting?.from, '2020')
  assert.equal(refineReporting(on, 'coal in Poland', dict, codelists), null)
})
