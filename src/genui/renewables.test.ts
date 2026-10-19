import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { STRINGS } from '../i18n'
import { installEurostatStub } from '../test/eurostatStub'
import { buildDashboard } from './execute'
import { refineRenewables, renewablesPlan } from './renewables'
import { dashStrings } from './strings'

// The renewables (SHARES) dashboard: found by wording, with a tab, and built against the Eurostat stub.
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const s = dashStrings(STRINGS.en)
let restore: () => void
before(() => {
  restore = installEurostatStub(dict, codelists)
})
after(() => restore())

const tab = (q: string) => renewablesPlan(q, dict, codelists)?.renewables?.tab

test('the renewables dashboard is asked for by wording, with its tab and country', () => {
  assert.equal(tab(' renewable energy dashboard for germany '), 'shares')
  assert.equal(renewablesPlan(' renewable energy dashboard for germany ', dict, codelists)?.filters.geo, 'DE')
  assert.equal(tab(' renewable capacity by technology in germany '), 'capacity')
  assert.equal(tab(' installed renewable capacity in spain '), 'capacity')
  assert.equal(tab(' renewable electricity by technology in france '), 'electricity')
  assert.equal(tab(' renewable heating and cooling by technology in sweden '), 'heating')
  assert.equal(tab(' renewables in transport in spain '), 'transport')
  assert.equal(tab(' biomass supply for energy in germany '), 'biomass')
  assert.equal(tab(' solid biomass use in austria '), 'solid')
  assert.equal(tab(' renewables in buildings in poland '), 'buildings')
  assert.equal(tab(' shares tool overview '), 'shares')
  assert.equal(renewablesPlan(' renewables dashboard ', dict, codelists)?.filters.geo, 'EU27_2020')
})

test('ordinary renewable questions and definitions stay where they were', () => {
  assert.equal(renewablesPlan(' renewable share in germany ', dict, codelists), null)
  assert.equal(renewablesPlan(' renewable energy share vs the 2030 target in the eu ', dict, codelists), null)
  assert.equal(renewablesPlan(' what is a renewables dashboard ', dict, codelists), null)
  assert.equal(renewablesPlan(' research on gas ', dict, codelists), null)
})

test('a follow-up changes the tab, the country or the period of the dashboard on screen', () => {
  const on = renewablesPlan(' renewable energy dashboard for germany ', dict, codelists)!
  assert.equal(refineRenewables(on, 'and France?', dict, codelists)?.filters.geo, 'FR')
  assert.equal(refineRenewables(on, 'capacity', dict, codelists)?.renewables?.tab, 'capacity')
  assert.equal(refineRenewables(on, 'transport in Italy', dict, codelists)?.filters.geo, 'IT')
  assert.equal(refineRenewables(on, 'since 2020', dict, codelists)?.renewables?.from, '2020')
  assert.equal(refineRenewables(on, 'as a share', dict, codelists)?.renewables?.pct, true)
  assert.equal(refineRenewables(on, 'coal in Poland', dict, codelists), null)
})

test('the dashboard has tabs, key figures and a table of all values', async () => {
  const d = await buildDashboard(renewablesPlan(' renewable energy dashboard for germany ', dict, codelists)!, dict, 'en', s)
  assert.match(d.title, /Renewable energy: /)
  assert.equal(d.controls?.tabs?.length, 8)
  assert.equal(d.controls?.tabs?.filter((t) => t.active).length, 1)
  assert.ok(d.widgets.some((w) => w.type === 'table'))
})

test('"show me the shares of Poland" opens the shares tab, with or without a dashboard on screen', () => {
  assert.equal(tab(' show me the shares of poland '), 'shares')
  assert.equal(renewablesPlan(' show me the shares of poland ', dict, codelists)?.filters.geo, 'PL')
  const on = renewablesPlan(' renewable capacity by technology in germany ', dict, codelists)!
  const next = refineRenewables(on, 'show me the shares of poland', dict, codelists)
  assert.equal(next?.renewables?.tab, 'shares')
  assert.equal(next?.filters.geo, 'PL')
})

test('"compare with France" sets a country against the one on screen, and "no comparison" clears it', () => {
  const on = renewablesPlan(' renewable energy dashboard for germany ', dict, codelists)!
  const compared = refineRenewables(on, 'compare with France', dict, codelists)
  assert.equal(compared?.renewables?.compare, 'FR')
  assert.equal(compared?.filters.geo, 'DE')
  assert.equal(refineRenewables(compared!, 'capacity', dict, codelists)?.renewables?.compare, 'FR')
  assert.equal(refineRenewables(compared!, 'no comparison', dict, codelists)?.renewables?.compare, undefined)
  assert.equal(refineRenewables(on, 'compare with the EU', dict, codelists)?.renewables?.compare, 'EU27_2020')
})
