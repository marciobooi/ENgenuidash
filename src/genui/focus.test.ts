import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { STRINGS } from '../i18n'
import { installEurostatStub } from '../test/eurostatStub'
import { buildDashboard } from './execute'
import { OVERVIEW_LAYOUT } from './layout'
import { planQuestion, refinePlan } from './planner'
import { dashStrings } from './strings'
import type { DashboardSpec, Plan, WidgetSpec } from './types'
import { sanitizeSpec } from './validate'

// Generated pages: the question's focus ("which…?", "how has it changed?") decides what the
// dashboard opens with (a direct answer from the numbers) and in what order the rest follows.
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const s = dashStrings(STRINGS.en)
let restore: () => void
const warnings: unknown[][] = []
const warn = console.warn
before(() => {
  restore = installEurostatStub(dict, codelists)
  console.warn = (...args: unknown[]) => void warnings.push(args)
})
after(() => {
  restore()
  console.warn = warn
})

type Answer = Extract<WidgetSpec, { type: 'answer' }>
const plan = (q: string): Plan => {
  const r = planQuestion(q, dict, codelists)
  assert.equal(r.kind, 'plan', `${q} → ${r.kind}`)
  return (r as { plan: Plan }).plan
}
const build = (p: Plan) => buildDashboard(p, dict, 'en', s)
const dash = async (q: string) => build(plan(q))
const answerOf = (d: DashboardSpec) => d.widgets.find((w): w is Answer => w.type === 'answer')
const charts = (d: DashboardSpec) => d.widgets.filter((w) => !['kpis', 'table', 'answer'].includes(w.type))

test('focus is read from the question, in English, German and French', () => {
  assert.deepEqual(plan('Which EU country is the most dependent on energy imports?').focus, { kind: 'which' })
  assert.deepEqual(plan('Welches Land ist am stärksten von Energieimporten abhängig?').focus, { kind: 'which' })
  assert.deepEqual(plan('Quel pays a la plus forte dépendance énergétique ?').focus, { kind: 'which' })
  assert.deepEqual(plan('Which countries have the lowest share of renewable energy?').focus, { kind: 'which', lowest: true })
  assert.deepEqual(plan('In which year was oil consumption in Spain the highest?').focus, { kind: 'which', period: true })
  assert.deepEqual(plan('How has the renewable energy share in Spain changed since 2010?').focus, { kind: 'change' })
  assert.deepEqual(plan('Wie hat sich der Gasverbrauch in Deutschland entwickelt?').focus, { kind: 'change' })
  assert.deepEqual(plan('Comment a évolué la consommation de pétrole en France ?').focus, { kind: 'change' })
  assert.equal(plan('Oil consumption in Spain').focus, undefined)
  assert.equal(plan('Compare energy import dependency of all EU countries').focus, undefined)
})

test('which country: the answer names the leader of the ranking, and the ranking comes first', async () => {
  const d = await dash('Which EU country is the most dependent on energy imports?')
  const answer = answerOf(d)!
  assert.equal(d.layout[0], 'answer')
  const ranking = charts(d)[0] as Extract<WidgetSpec, { type: 'bar' }>
  assert.equal(ranking.role, 'ranking')
  assert.equal(answer.headline, ranking.categories[0])
  assert.match(answer.text, new RegExp(`^${answer.headline} has the highest value in \\d{4}: `))
  assert.ok(answer.facts?.some((f) => f.label === 'EU-27'))
})

test('which country, lowest: the last of the ranking', async () => {
  const d = await dash('Which countries have the lowest share of renewable energy?')
  const answer = answerOf(d)!
  const ranking = charts(d).find((w): w is Extract<WidgetSpec, { type: 'bar' }> => w.role === 'ranking')!
  assert.equal(answer.headline, ranking.categories.at(-1))
  assert.match(answer.text, /lowest/)
})

test('which year (one series): the peak of the series', async () => {
  const d = await dash('In which year was oil consumption in Spain the highest?')
  const answer = answerOf(d)!
  const hero = d.widgets.find((w): w is Extract<WidgetSpec, { type: 'hero' }> => w.type === 'hero')!
  const values = hero.data.filter((v): v is number => v != null)
  const peak = hero.categories[hero.data.indexOf(Math.max(...values))]
  assert.equal(answer.headline, peak)
})

test('which source (a mix): the largest part and its share of the total', async () => {
  const d = await dash('Which source is the largest in the electricity mix of Germany?')
  const answer = answerOf(d)!
  const pie = charts(d)[0] as Extract<WidgetSpec, { type: 'pie' }>
  assert.equal(pie.type, 'pie')
  assert.equal(answer.headline, [...pie.slices].sort((a, b) => b.y - a.y)[0].name)
  assert.match(answer.value ?? '', /%$/)
})

test('how has it changed (one series): the change over the period, with both values', async () => {
  const d = await dash('How has the renewable energy share in Spain changed since 2010?')
  const answer = answerOf(d)!
  assert.match(answer.headline, /^[+-−]?\d+(\.\d)? pp$/)
  assert.equal(answer.facts?.[0].label, '2010')
  assert.ok(answer.direction)
  assert.equal(charts(d)[0].type, 'hero')
})

test('how has it changed (several countries): who changed the most', async () => {
  const d = await dash('How has gas consumption changed in Germany, France and Italy since 2015?')
  const answer = answerOf(d)!
  assert.ok(['Germany', 'France', 'Italy'].includes(answer.headline))
  assert.equal(answer.facts?.length, 2)
  assert.equal(charts(d)[0].role, 'evolution')
})

test('a plain request keeps the overview layout, without an answer', async () => {
  const d = await dash('Oil consumption in Spain')
  assert.ok(!d.layout.flat().includes('answer'))
  assert.equal(answerOf(d), undefined)
})

test('follow-ups: a new focus is applied; "which source…?" on one series is not a change', () => {
  const eu = plan('What is the energy import dependency of the EU?')
  assert.equal(refinePlan(eu, 'which source is the largest', dict, codelists), null)
  assert.deepEqual(refinePlan(eu, 'how has it changed?', dict, codelists)?.focus, { kind: 'change' })
  assert.deepEqual(refinePlan(eu, 'when was it the highest?', dict, codelists)?.focus, { kind: 'which', period: true })
  const all = refinePlan(eu, 'which countries are the most dependent?', dict, codelists)!
  assert.deepEqual(all.focus, { kind: 'which' })
  // A plain change keeps the focus.
  assert.deepEqual(refinePlan(all, 'in 2020', dict, codelists)?.focus, { kind: 'which' })
})

test('German and French answers', async () => {
  const p = plan('Which EU country is the most dependent on energy imports?')
  const de = await buildDashboard(p, dict, 'de', dashStrings(STRINGS.de))
  const fr = await buildDashboard(p, dict, 'fr', dashStrings(STRINGS.fr))
  assert.match(answerOf(de)!.text, /hat \d{4} den höchsten Wert/)
  assert.match(answerOf(fr)!.text, /a la valeur la plus élevée en \d{4}/)
})

test('runtime check: broken widgets are left out, a bad layout falls back to the overview', async () => {
  const d = await dash('Oil consumption in Spain')
  const broken: DashboardSpec = {
    ...d,
    layout: ['charts', 'charts'],
    widgets: [
      ...d.widgets,
      { type: 'line', title: 'x', categories: ['2020', '2021'], series: [{ name: 'a', data: [1] }] },
      { type: 'map', title: 'm', data: [{ code: 'Spain', name: 'Spain', value: 1 }] },
      { type: 'pie', title: 'p', slices: [{ name: 'a', y: Number.NaN }] },
      { type: 'sparkline' } as unknown as WidgetSpec,
    ],
  }
  const { spec, problems } = sanitizeSpec(broken)
  assert.equal(problems.length, 5)
  assert.equal(spec.widgets.length, d.widgets.length)
  assert.deepEqual(spec.layout, OVERVIEW_LAYOUT)
})

test('generated dashboards pass the runtime check untouched', async () => {
  for (const q of [
    'Which EU country is the most dependent on energy imports?',
    'How has the renewable energy share in Spain changed since 2010?',
    'Which source is the largest in the electricity mix of Germany?',
    'Compare energy import dependency of all EU countries in 2023',
    'monthly gas imports of Germany',
    'crude oil imports by country of origin',
  ]) {
    const d = await dash(q)
    assert.deepEqual(sanitizeSpec(d).problems, [], q)
  }
  assert.deepEqual(warnings, [])
})
