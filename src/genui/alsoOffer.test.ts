import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { alsoOf } from './alsoOffer'
import { planQuestion } from './planner'
import { renewablesPlan } from './renewables'

// A question that two dashboards read gets the other as a chip: the custom dashboard offers the plain indicator,
// and a plain indicator the custom dashboard that covers it more fully.
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')

test('a custom dashboard offers the plain indicator of the same wording', () => {
  const plan = renewablesPlan(' renewable capacity by technology in spain ', dict, codelists)!
  const other = alsoOf(' solar capacity in spain ', plan, dict, codelists)
  assert.ok(other && !other.renewables)
})

test('a plain indicator offers the dashboard that covers it more fully', () => {
  const efficiency = planQuestion(' primary energy consumption in germany ', dict, codelists)
  assert.equal(efficiency.kind, 'plan')
  if (efficiency.kind === 'plan') assert.equal(alsoOf(' primary energy consumption in germany ', efficiency.plan, dict, codelists)?.reporting?.tab, 'efficiency')
  const capacity = planQuestion(' installed capacity in spain ', dict, codelists)
  if (capacity.kind === 'plan' && /^nrg_inf_epcrw/.test(capacity.plan.dataset)) assert.equal(alsoOf(' installed capacity in spain ', capacity.plan, dict, codelists)?.renewables?.tab, 'capacity')
})

test('rankings and other dashboards are not given an offer', () => {
  const ranked = planQuestion(' top 5 countries for energy import dependency ', dict, codelists)
  assert.equal(ranked.kind, 'plan')
  if (ranked.kind === 'plan') assert.equal(alsoOf(' top 5 countries for energy import dependency ', ranked.plan, dict, codelists), undefined)
})
