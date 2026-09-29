import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { STRINGS } from '../i18n'
import { installEurostatStub } from '../test/eurostatStub'
import { buildDashboard } from './execute'
import { refineProfile } from './profile'
import { dashStrings } from './strings'

// The energy profile of a country (ENDASH): headline indicators against the EU, in totals or per capita.
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const s = dashStrings(STRINGS.en)
let restore: () => void
before(() => {
  restore = installEurostatStub(dict, codelists)
  // Population is not in the dictionary: a small stand-in for demo_pjan.
  const stubbed = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    if (!url.pathname.endsWith('/demo_pjan')) return stubbed(input, init)
    const geos = url.searchParams.getAll('geo')
    const years = Array.from({ length: 30 }, (_, i) => String(1995 + i))
    const value: Record<string, number> = {}
    geos.forEach((g, gi) => years.forEach((_, ti) => (value[String(gi * years.length + ti)] = g === 'EU27_2020' ? 447e6 : 83e6)))
    const body = {
      version: '2.0', class: 'dataset', label: 'Population', id: ['geo', 'time'], size: [geos.length, years.length],
      dimension: {
        geo: { label: 'geo', category: { index: Object.fromEntries(geos.map((g, i) => [g, i])), label: Object.fromEntries(geos.map((g) => [g, g])) } },
        time: { label: 'time', category: { index: Object.fromEntries(years.map((y, i) => [y, i])), label: Object.fromEntries(years.map((y) => [y, y])) } },
      },
      value,
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  const inner = restore
  restore = () => {
    globalThis.fetch = stubbed
    inner()
  }
})
after(() => restore())

test('profile questions are recognised, with the country and year', async () => {
  const { profilePlan } = await import('./profile')
  const p = profilePlan(' energy profile of germany 2022 ', dict, codelists)
  assert.ok(p?.profile)
  assert.equal(p?.filters.geo, 'DE')
  assert.equal(p?.focusPeriod, '2022')
  assert.equal(profilePlan(' what is an energy profile ', dict, codelists), null)
  assert.equal(profilePlan(' coal consumption in poland ', dict, codelists), null)
  assert.equal(profilePlan(' energy dashboard for the eu ', dict, codelists)?.filters.geo, 'EU27_2020')
})

test('a profile shows the headline indicators against the EU and how consumption is made up', async () => {
  const { profilePlan } = await import('./profile')
  const d = await buildDashboard(profilePlan(' energy profile of germany ', dict, codelists)!, dict, 'en', s)
  const kpis = d.widgets.find((w) => w.type === 'kpis')
  assert.ok(kpis && kpis.type === 'kpis' && kpis.items.length >= 6)
  assert.ok(kpis.items.every((k) => k.caption?.includes('EU:')))
  assert.ok(d.widgets.some((w) => w.type === 'line'))
  assert.ok(d.widgets.filter((w) => w.type === 'pie').length >= 2)
  assert.match(d.title, /Germany/)
})

test('per capita divides by the population and offers the way back', async () => {
  const { profilePlan } = await import('./profile')
  const base = profilePlan(' energy profile of germany ', dict, codelists)!
  const d = await buildDashboard({ ...base, profile: { perCapita: true } }, dict, 'en', s)
  const kpis = d.widgets.find((w) => w.type === 'kpis')
  assert.ok(kpis && kpis.type === 'kpis')
  assert.ok(kpis.items.some((k) => k.label === 'Households, per person' && k.unit === 'kgoe'))
  assert.ok(d.suggestions.some((x) => x.plan && !x.plan.profile?.perCapita))
})

test('another country or year keeps the profile; other questions do not', async () => {
  const { profilePlan } = await import('./profile')
  const base = profilePlan(' energy profile of germany ', dict, codelists)!
  assert.equal(refineProfile(base, 'and France?', dict, codelists)?.filters.geo, 'FR')
  assert.equal(refineProfile(base, 'coal in Poland', dict, codelists), null)
  assert.equal(profilePlan(' energy dashboard of spain ', dict, codelists)?.filters.geo, 'ES')
})

test('per capita is asked for by wording, and toggled on the profile on screen', async () => {
  const { profilePlan } = await import('./profile')
  assert.deepEqual(profilePlan(' energy profile of france per capita ', dict, codelists)?.profile, { perCapita: true })
  assert.deepEqual(profilePlan(' energy use per person in spain ', dict, codelists)?.profile, { perCapita: true })
  const base = profilePlan(' energy profile of germany ', dict, codelists)!
  const per = refineProfile(base, 'per capita', dict, codelists)
  assert.deepEqual(per?.profile, { perCapita: true })
  assert.deepEqual(refineProfile(per!, 'totals', dict, codelists)?.profile, {})
})

test('households and industry are their own profile, in totals and per person', async () => {
  const { profilePlan } = await import('./profile')
  const hh = profilePlan(' energy profile of households in germany ', dict, codelists)!
  assert.equal(hh.profile?.focus, 'households')
  assert.equal(profilePlan(' industry energy profile of france ', dict, codelists)?.profile?.focus, 'industry')
  const d = await buildDashboard(hh, dict, 'en', s)
  assert.match(d.title, /^Households/)
  const kpis = d.widgets.find((w) => w.type === 'kpis')
  assert.ok(kpis && kpis.type === 'kpis' && kpis.items.some((k) => k.label === 'Households, per person'))
  assert.ok(d.widgets.some((w) => w.type === 'pie' && w.title.includes('by purpose')))
  const base = profilePlan(' energy profile of germany ', dict, codelists)!
  assert.equal(refineProfile(base, 'households', dict, codelists)?.profile?.focus, 'households')
  assert.equal(refineProfile(hh, 'all consumers', dict, codelists)?.profile?.focus, undefined)
  const ind = await buildDashboard({ ...base, profile: { focus: 'industry' } }, dict, 'en', s)
  assert.match(ind.title, /^Industry/)
})
