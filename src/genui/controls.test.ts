import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { STRINGS } from '../i18n'
import { controlsFor, type DashStrings } from './execute'
import { planQuestion, refinePlan } from './planner'
import type { Plan } from './types'

// The period / year buttons must reflect the time the question asked for.
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const t = STRINGS.en
const s = { yearsShort: t.dYearsShort, monthsShort: t.dMonthsShort, allYears: t.dAllYears } as DashStrings

const plan = (q: string) => (planQuestion(q, dict, codelists) as { plan: Plan }).plan
const refine = (p: Plan, q: string) => refinePlan(p, q, dict, codelists) as Plan
const periods = (p: Plan) => controlsFor(p, dict, s, 'en').periods!.map((o) => `${o.label}${o.active ? '*' : ''}`)

test('a plain question: the default period is one of the buttons, selected', () => {
  assert.deepEqual(periods(plan('What is the energy import dependency of the EU?')), ['5 y', '10 y', '15 y*', '20 y', 'All'])
})

test('"since 2010" and "2015 to 2020" show their own selected button', () => {
  const since = periods(plan('energy import dependency of the EU since 2010'))
  assert.match(since[0], /^2010–\d{4}\*$/)
  const range = periods(plan('energy import dependency of the EU from 2015 to 2020'))
  assert.equal(range[0], '2015–2020*')
})

test('"last 7 years" shows a 7 y button, selected', () => {
  assert.equal(periods(plan('energy import dependency of the EU in the last 7 years'))[0], '7 y*')
})

test('a year: the period buttons count back from it, none selected, and the year is selected', () => {
  const p = refine(plan('What is the energy import dependency of the EU?'), 'in 2018')
  const c = controlsFor(p, dict, s, 'en')
  assert.equal(c.periodsTo, '2018')
  assert.deepEqual(c.periods!.find((o) => o.label === '5 y')?.plan.time, { kind: 'range', since: '2014', until: '2018' })
  assert.ok(c.periods!.every((o) => !o.active))
  assert.equal(c.years!.find((y) => y.active)?.label, '2018')
  // "Over time" goes back to the latest years.
  assert.deepEqual(c.overTime?.time, { kind: 'last', n: 10 })
})

test('an old year is added to the year list', () => {
  const p = refine(plan('What is the energy import dependency of the EU?'), 'in 2002')
  assert.equal(controlsFor(p, dict, s, 'en').years!.find((y) => y.active)?.label, '2002')
})

test('clicking "5 y" after picking a year gives that span, selected', () => {
  const inYear = refine(plan('What is the energy import dependency of the EU?'), 'in 2018')
  const five = controlsFor(inYear, dict, s, 'en').periods!.find((o) => o.label === '5 y')!.plan
  assert.ok(controlsFor(five, dict, s, 'en').periods!.find((o) => o.label === '5 y')!.active)
})

test('monthly data: "in 2022" reads as 2022, selected', () => {
  const p = refine(plan('monthly gas imports of Germany'), 'in 2022')
  assert.equal(periods(p)[0], '2022*')
})
