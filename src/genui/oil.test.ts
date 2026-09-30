import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { STRINGS } from '../i18n'
import { installEurostatStub } from '../test/eurostatStub'
import { buildDashboard } from './execute'
import { oilPlan, refineOil } from './oil'
import { dashStrings } from './strings'

// The oil security dashboard: found by wording, built from the oil datasets (against the Eurostat stub).
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const s = dashStrings(STRINGS.en)
let restore: () => void
before(() => {
  restore = installEurostatStub(dict, codelists)
})
after(() => restore())

test('oil security is asked for by wording, with the country', () => {
  assert.ok(oilPlan(' oil security dashboard of germany ', dict, codelists)?.oil)
  assert.equal(oilPlan(' oil security dashboard of germany ', dict, codelists)?.filters.geo, 'DE')
  assert.equal(oilPlan(' how dependent is italy on russian oil ', dict, codelists)?.filters.geo, 'IT')
  assert.equal(oilPlan(' oil crisis in the eu ', dict, codelists)?.filters.geo, 'EU27_2020')
  // the monthly dashboards keep their own questions
  assert.equal(oilPlan(' monthly oil stocks in the eu ', dict, codelists), null)
  assert.equal(oilPlan(' crude oil prices ', dict, codelists), null)
  assert.equal(oilPlan(' what is an oil crisis ', dict, codelists), null)
  const on = oilPlan(' oil security of germany ', dict, codelists)!
  assert.equal(refineOil(on, 'and France?', dict, codelists)?.filters.geo, 'FR')
  assert.equal(refineOil(on, 'coal in Poland', dict, codelists), null)
})

test('the dashboard has the figures, the origins, prices, stocks and the products', async () => {
  const d = await buildDashboard(oilPlan(' oil security dashboard of germany ', dict, codelists)!, dict, 'en', s)
  assert.match(d.title, /Oil security: Germany/)
  const kpis = d.widgets.find((w) => w.type === 'kpis')
  assert.ok(kpis && kpis.type === 'kpis' && kpis.items.length >= 3)
  const titles = d.widgets.map((w) => ('title' in w ? w.title : ''))
  for (const part of ['Crude oil imports by origin', 'Crude oil import price', 'Oil stocks', 'Imports of oil products by type', 'What oil is used for']) assert.ok(titles.some((x) => x.startsWith(part)), part)
  assert.ok(d.widgets.some((w) => w.type === 'gauge'))
})
