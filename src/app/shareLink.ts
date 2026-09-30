import type { EnergyDictionary } from '../data/eurostat'
import type { Plan, TimeRange } from '../genui/types'
import { FUEL_GROUPS } from '../genui/balance'
import { COMPUTED_GEOS } from '../genui/monthly'
import { priceDatasetOf } from '../genui/prices'
import { tradeOf } from '../genui/trade'
import { FUEL_FAMILIES } from '../genui/sankey/model'
import { UNIT_TABLE } from '../genui/sankey/state'

/**
 * Shareable dashboards: the URL carries the question (readable) and the plan (exact, including
 * filters chosen in the toolbar): `?q=Which%20country…&p=<base64url JSON>`. A link is untrusted
 * input, so a plan read from it is checked against the dictionary (dataset, dimensions, codes,
 * periods) before it is run; a plan that does not check out falls back to asking the question.
 */

const INTENTS: Plan['intent'][] = ['trend', 'compare', 'mix', 'snapshot']
const CHARTS = ['line', 'bar', 'area', 'pie', 'table']
const PERIOD = /^\d{4}(-(0[1-9]|1[0-2]|S[12]|Q[1-4]))?$/

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(raw: string): string {
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

/** The plan in its shareable form: what is needed to rebuild the dashboard, nothing else. */
export function encodePlan(plan: Plan): string {
  const { dataset, filters, time, intent, focusPeriod, allCountries, top, monthlyDataset, chart, focus, parts, balance, trade, prices, profile, sankey } = plan
  return toBase64Url(JSON.stringify({ dataset, filters, time, intent, focusPeriod, allCountries, top, monthlyDataset, chart, focus, parts, balance, trade, prices, profile, sankey }))
}

/** The plan from a link, or null when it is not a valid plan for our datasets. */
export function decodePlan(raw: string, dict: EnergyDictionary): Plan | null {
  let data: unknown
  try {
    data = JSON.parse(fromBase64Url(raw))
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const p = data as Record<string, unknown>
  const ds = typeof p.dataset === 'string' ? dict.datasets[p.dataset] : undefined
  if (!ds) return null

  // Filters: known dimensions of the dataset, and codes those dimensions have.
  if (!p.filters || typeof p.filters !== 'object' || Array.isArray(p.filters)) return null
  const filters: Plan['filters'] = {}
  for (const [dim, value] of Object.entries(p.filters as Record<string, unknown>)) {
    const codes = [...(ds.dimensions.find((d) => d.id === dim)?.codes ?? []), ...(dim === 'geo' ? (COMPUTED_GEOS[ds.code] ?? []) : []), ...(dim === 'unit' && p.sankey ? Object.keys(UNIT_TABLE) : [])]
    const list = Array.isArray(value) ? value : [value]
    if (!codes.length || !list.length || list.length > 60 || !list.every((c) => typeof c === 'string' && codes.includes(c))) return null
    filters[dim] = Array.isArray(value) ? (list as string[]) : (value as string)
  }

  // Every dimension but the countries has its codes (the planner always sets them). A link that
  // leaves one open is incomplete (e.g. a balance sheet shared before sheets were in links):
  // asking its question again gives the right dashboard.
  const balance = p.balance as Plan['balance']
  const isSheet = !!balance && typeof balance.fuels === 'string' && balance.fuels in FUEL_GROUPS
  // A trade dashboard asks for every partner on purpose; it must match its dataset.
  const traded = tradeOf(ds.code)
  const tradeIn = p.trade as Plan['trade']
  const isTrade = !!traded && !!tradeIn && tradeIn.flow === traded.flow && tradeIn.fuel === traded.fuel
  // A price dashboard's own dimension (nrg_prc) is set per widget, not per filter.
  const priced = priceDatasetOf(ds.code)
  const pricesIn = p.prices as Plan['prices']
  // Its components view reads the components dataset; its tax view the base one.
  const isPrices = !!priced && !!pricesIn && pricesIn.product === priced.product && pricesIn.consumer === priced.consumer && priced.components === (pricesIn.view !== 'taxes')
  if (p.profile && typeof p.profile === 'object' && filters.geo !== undefined && ds.code === 'nrg_ind_ren') {
    const pf = p.profile as { perCapita?: unknown; focus?: unknown; compare?: unknown }
    const time0 = p.time as TimeRange | undefined
    if (time0) return { dataset: ds.code, filters, time: time0, intent: 'snapshot', profile: { ...(pf.perCapita === true ? { perCapita: true as const } : {}), ...(pf.focus === 'households' || pf.focus === 'industry' ? { focus: pf.focus } : {}), ...(typeof pf.compare === 'string' && /^[A-Z]{2}$/.test(pf.compare) ? { compare: pf.compare } : {}) }, ...(typeof p.focusPeriod === 'string' && PERIOD.test(p.focusPeriod) ? { focusPeriod: p.focusPeriod } : {}) }
  }
  const sankeyIn = p.sankey as { fuel?: unknown; byFuel?: unknown } | undefined
  const isSankey = ds.code === 'nrg_bal_c' && !!sankeyIn && typeof sankeyIn === 'object'
  if (!isSheet && !isTrade && !isSankey && !isPrices && ds.dimensions.some((d) => d.id !== 'geo' && d.codes.length > 1 && filters[d.id] === undefined)) return null

  const time = p.time as TimeRange | undefined
  const timeOk =
    !!time &&
    (time.kind === 'all' ||
      (time.kind === 'last' && Number.isInteger(time.n) && time.n >= 1 && time.n <= 400) ||
      (time.kind === 'range' && [time.since, time.until].every((x) => x === undefined || (typeof x === 'string' && PERIOD.test(x)))))
  if (!timeOk || !INTENTS.includes(p.intent as Plan['intent'])) return null

  const plan: Plan = { dataset: ds.code, filters, time: time!, intent: p.intent as Plan['intent'] }
  if (typeof p.focusPeriod === 'string' && PERIOD.test(p.focusPeriod)) plan.focusPeriod = p.focusPeriod
  if (p.allCountries === true) plan.allCountries = true
  const top = p.top as Plan['top']
  if (top && Number.isInteger(top.n) && top.n >= 1 && top.n <= 27) plan.top = { n: top.n, ...(top.lowest ? { lowest: true } : {}) }
  if (typeof p.monthlyDataset === 'string' && dict.datasets[p.monthlyDataset]) plan.monthlyDataset = p.monthlyDataset
  if (typeof p.chart === 'string' && CHARTS.includes(p.chart)) plan.chart = p.chart as Plan['chart']
  if (p.parts === false) plan.parts = false
  // An energy balance sheet (without it, the link would ask for every line × every fuel).
  if (isSheet) plan.balance = { fuels: balance.fuels }
  if (isTrade) plan.trade = traded
  if (isSankey) plan.sankey = { ...((sankeyIn as { scope?: unknown }).scope === 'households' ? { scope: 'households' as const } : {}), ...(typeof (sankeyIn as { compare?: unknown }).compare === 'string' && /^(y\d{1,2}|[A-Z0-9_]{2,10})$/.test((sankeyIn as { compare: string }).compare) ? { compare: (sankeyIn as { compare: string }).compare } : {}), ...(typeof (sankeyIn as { nodes?: unknown }).nodes === 'string' && /^[A-Za-z,]*$/.test((sankeyIn as { nodes: string }).nodes) ? { nodes: (sankeyIn as { nodes: string }).nodes } : {}), ...(typeof sankeyIn!.fuel === 'string' && FUEL_FAMILIES.includes(sankeyIn!.fuel) ? { fuel: sankeyIn!.fuel } : {}), ...(sankeyIn!.byFuel === true ? { byFuel: true as const } : {}) }
  if (isPrices) plan.prices = { product: pricesIn.product, consumer: pricesIn.consumer, ...(pricesIn.view === 'taxes' ? { view: 'taxes' as const } : {}) }
  const focus = p.focus as Plan['focus']
  if (focus?.kind === 'change') plan.focus = { kind: 'change' }
  else if (focus?.kind === 'which') plan.focus = { kind: 'which', ...(focus.lowest ? { lowest: true } : {}), ...(focus.period ? { period: true } : {}) }
  return plan
}

/** The page URL for a dashboard (the app's own routes, e.g. #/eval, are kept). */
export function shareUrl(question: string, plan: Plan, base = window.location.href): string {
  const url = new URL(base)
  url.searchParams.set('q', question.slice(0, 300))
  url.searchParams.set('p', encodePlan(plan))
  return url.toString()
}

/** The question and plan of the link the page was opened with, if any. */
export function readShareLink(search = window.location.search): { question?: string; plan?: string } {
  const params = new URLSearchParams(search)
  return { question: params.get('q')?.trim() || undefined, plan: params.get('p') || undefined }
}

/** The URL without a dashboard (after "New chat"). */
export function clearShareLink() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('q') && !url.searchParams.has('p')) return
  url.searchParams.delete('q')
  url.searchParams.delete('p')
  window.history.replaceState(null, '', url)
}
