import { fetchEurostatData, type EnergyCodelists, type EnergyDictionary, type EurostatResult } from '../data/eurostat'
import type { Strings } from '../i18n'
import { NoDataError } from './execute'
import { pricesPlanFor } from './prices'
import { detectGeos, detectTime, parse } from './planner/parse'
import type { DashboardControls, DashboardSpec, Insight, KpiSpec, Plan, Suggestion, WidgetSpec } from './types'
import { sanitizeSpec } from './validate'

/**
 * The energy profile of one country, as Eurostat's energy dashboard (ENDASH,
 * https://ec.europa.eu/eurostat/cache/visualisations/energy-dashboard/endash.html): its headline
 * indicators side by side (renewables, efficiency, intensity, productivity, import dependency,
 * fossil share, energy poverty), each against the EU, and how final consumption and electricity
 * are made up. Each indicator is also a dashboard of its own; this is the overview, asked for
 * with "energy profile of Germany" or "energy dashboard".
 */

export type ProfileStrings = Omit<Strings['profile'], 'indicators'> & { indicators: Record<string, string> }

const DATASET = 'nrg_ind_ren'
const EU = 'EU27_2020'
export const PROFILE_GEOS = [EU, 'BE', 'BG', 'CZ', 'DK', 'DE', 'EE', 'IE', 'EL', 'ES', 'FR', 'HR', 'IT', 'CY', 'LV', 'LT', 'LU', 'HU', 'MT', 'NL', 'AT', 'PL', 'PT', 'RO', 'SI', 'SK', 'FI', 'SE', 'IS', 'NO', 'ME', 'MK', 'AL', 'RS', 'TR', 'BA', 'XK', 'MD', 'UA', 'GE']

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '')

// ---------- questions ----------

// "energy profile", "energy dashboard", "country profile", "energy scorecard", "key energy indicators".
const PROFILE =
  / (energy|country|energie|energetique) (profiles?|overview|scorecard|dashboard|fact ?sheet|report card|profil\w*|uebersicht|ubersicht|tableau de bord)| (profiles?|overview|scorecard|fact ?sheet|report card) (of|for|on) | (key|main|headline|all) (the )?(energy )?indicators |energie dashboard| energy (use |consumption )?(per|pro|par) (capita|person|head|kopf|habitant) |energieprofil|energieubersicht|profil energetique|endash /
// "per capita", "per person", "per head", "pro Kopf", "par habitant".
const PER_CAPITA_WORDS = / (per (capita|person|head|inhabitant|citizen)|pro kopf|par habitants?|par personne|per capita) /
// Who consumes: households, or industry (the non-household consumers).
const HOUSEHOLD_WORDS = / (households?|domestic|residential|haushalte?|privathaushalte|menages?) /
const INDUSTRY_WORDS = / (industry|industrial|non households?|non domestic|industrie|industrielle?s?) /
const focusOf = (text: string): 'households' | 'industry' | undefined => (INDUSTRY_WORDS.test(text) ? 'industry' : HOUSEHOLD_WORDS.test(text) ? 'households' : undefined)
const DEFINITION = /^ (what is|what are|define|was ist|qu est ce)\b/

type ProfilePlan = NonNullable<Plan['profile']>
/** The profile settings of a plan with some of them changed (null clears a setting). */
const profileOf = (from: ProfilePlan | undefined, over: { perCapita?: boolean; focus?: ProfilePlan['focus'] | null; compare?: string | null }): ProfilePlan => {
  const perCapita = over.perCapita ?? !!from?.perCapita
  const focus = over.focus === undefined ? from?.focus : (over.focus ?? undefined)
  const compare = over.compare === undefined ? from?.compare : (over.compare ?? undefined)
  return { ...(perCapita ? { perCapita: true as const } : {}), ...(focus ? { focus } : {}), ...(compare ? { compare } : {}) }
}
// "Germany vs France", "compared with France", "gegen Frankreich", "contre la France".
const VERSUS = / (vs|versus|against|compared? (with|to)|comparison with|compare|gegen|im vergleich (mit|zu)|contre|par rapport a|compare a) /

/** The profile a question asks for ("energy profile of Germany"), or null. */
export function profilePlan(text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  if (!dict.datasets[DATASET]) return null
  const p = parse(text.replace(/[-–,]/g, ' '))
  if (!PROFILE.test(p.text) || DEFINITION.test(p.text)) return null
  const places = detectGeos(p, codelists)
  const inList = places.codes.filter((c) => PROFILE_GEOS.includes(c))
  const geo = inList[0] ?? EU
  const compare = inList[1] ?? (inList[0] && places.eu ? EU : undefined)
  const year = detectTime(p).years.at(-1)
  return {
    dataset: DATASET,
    filters: { geo, nrg_bal: 'REN', unit: 'PC', freq: 'A' },
    time: year ? { kind: 'range', since: String(year), until: String(year) } : { kind: 'last', n: 20 },
    focusPeriod: year ? String(year) : undefined,
    intent: 'snapshot',
    profile: profileOf(undefined, { perCapita: PER_CAPITA_WORDS.test(p.text), focus: focusOf(p.text), compare: compare && compare !== geo && compare !== EU ? compare : undefined }),
  }
}

/** "and France?", "2019": another country or year for the profile on screen. */
export function refineProfile(current: Plan, text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  if (!current.profile || !dict.datasets[DATASET]) return null
  const p = parse(text.replace(/[-–,]/g, ' '))
  const places = detectGeos(p, codelists)
  const inList = places.codes.filter((c) => PROFILE_GEOS.includes(c))
  const named = inList[0] ?? (places.eu ? EU : undefined)
  // "vs France" sets the country to compare with; "and France?" changes the country.
  const versus = VERSUS.test(p.text)
  const geo = versus && !(inList.length > 1) ? undefined : named
  const compare = versus ? (inList.length > 1 ? inList[1] : named) : undefined
  const year = detectTime(p).years.at(-1)
  const per = PER_CAPITA_WORDS.test(p.text) ? true : / (totals?|absolute|gesamt|totaux) /.test(p.text) ? false : undefined
  const consumer = / (all consumers|everyone|everything|alle|tous) /.test(p.text) ? null : focusOf(p.text)
  const rest = p.words.filter((w) => !/^(vs|versus|against|compared?|with|to|comparison|gegen|mit|zu|contre|par|rapport|and|und|et|in|im|en|au|for|fur|pour|of|von|de|du|the|la|le|das|die|der|what|about|wie|ist|es|show|zeige|montre|now|jetzt|maintenant|households?|industry|industrial|consumers?|all|everyone|domestic|residential|haushalte?|industrie|menages?|tous|alle|per|capita|person|head|pro|kopf|par|habitant|habitants|totals|total|totaux|absolute|gesamt|as|it|this|\d{4})$/.test(w))
  const known = rest.every((w) => detectGeos(parse(w), codelists).codes.length > 0 || detectGeos(parse(w), codelists).eu)
  if (!(geo || year || compare || per !== undefined || consumer !== undefined) || (!known && !PROFILE.test(p.text))) return null
  return {
    ...current,
    filters: { ...current.filters, ...(geo ? { geo } : {}) },
    ...(year ? { time: { kind: 'range', since: String(year), until: String(year) }, focusPeriod: String(year) } : {}),
    profile: profileOf(current.profile, { perCapita: per, focus: consumer, compare: compare === undefined ? undefined : compare === EU ? null : compare }),
    notes: [],
  }
}

// ---------- the dashboard ----------

interface Indicator {
  key: string
  dataset: string
  filters: Record<string, string | string[]>
  /** Which observations belong to it (datasets with several series). */
  pick?: (o: EurostatResult['observations'][number]) => boolean
  unit: string
  good: 'up' | 'down' | 'neutral'
  decimals: number
  /** Per capita: the factor from the dataset's unit to the unit shown, per person. */
  per?: number
  /** Half-yearly data (prices): periods like 2025-S2. */
  semester?: true
}

// Half-yearly prices (with taxes): the typical household and business bands of Eurostat's price datasets.
const price = (key: string, dataset: string, nrg_cons: string): Indicator => ({ key, dataset, filters: { nrg_cons, unit: 'KWH', tax: 'I_TAX', currency: 'EUR' }, unit: '€/kWh', good: 'down', decimals: 3, semester: true })
const PRICES = {
  households: [price('elecPrice', 'nrg_pc_204', 'KWH2500-4999'), price('gasPrice', 'nrg_pc_202', 'GJ20-199')],
  industry: [price('elecPriceInd', 'nrg_pc_205', 'MWH500-1999'), price('gasPriceInd', 'nrg_pc_203', 'GJ10000-99999')],
}
const INDICATORS: Indicator[] = [
  { key: 'ren', dataset: 'nrg_ind_ren', filters: { nrg_bal: 'REN', unit: 'PC' }, unit: '%', good: 'up', decimals: 1 },
  { key: 'pec', dataset: 'nrg_ind_eff', filters: { nrg_bal: 'PEC_EED', unit: 'MTOE' }, unit: 'Mtoe', good: 'down', decimals: 1 },
  { key: 'fec', dataset: 'nrg_ind_eff', filters: { nrg_bal: 'FEC_EED', unit: 'MTOE' }, unit: 'Mtoe', good: 'down', decimals: 1 },
  { key: 'ei', dataset: 'nrg_ind_ei', filters: { nrg_bal: 'EI_GDP_CLV05', unit: 'KGOE_TEUR' }, unit: 'kgoe/€1000', good: 'down', decimals: 1 },
  { key: 'ep', dataset: 'nrg_ind_ep', filters: { unit: 'EUR_KGOE' }, unit: '€/kgoe', good: 'up', decimals: 2 },
  { key: 'dep', dataset: 'nrg_ind_id', filters: { siec: 'TOTAL', unit: 'PC' }, unit: '%', good: 'down', decimals: 1 },
  { key: 'fossil', dataset: 'nrg_ind_ffgae', filters: { unit: 'PC' }, unit: '%', good: 'down', decimals: 1 },
  ...PRICES.households,
  { key: 'poverty', dataset: 'ilc_mdes01', filters: { hhcomp: 'TOTAL', rskpovth: 'TOTAL', unit: 'PC' }, unit: '%', good: 'down', decimals: 1 },
]

// Per person: the same consumption and production, divided by the population (1 January).
const PER_CAPITA: Indicator[] = [
  { key: 'pecPc', dataset: 'nrg_ind_eff', filters: { nrg_bal: 'PEC_EED', unit: 'MTOE' }, unit: 'kgoe', good: 'down', decimals: 0, per: 1e9 },
  { key: 'fecPc', dataset: 'nrg_ind_eff', filters: { nrg_bal: 'FEC_EED', unit: 'MTOE' }, unit: 'kgoe', good: 'down', decimals: 0, per: 1e9 },
  { key: 'hhPc', dataset: 'nrg_bal_c', filters: { siec: 'TOTAL', nrg_bal: 'FC_OTH_HH_E', unit: 'KTOE' }, unit: 'kgoe', good: 'down', decimals: 0, per: 1e6 },
  { key: 'traPc', dataset: 'nrg_bal_c', filters: { siec: 'TOTAL', nrg_bal: 'FC_TRA_E', unit: 'KTOE' }, unit: 'kgoe', good: 'down', decimals: 0, per: 1e6 },
  { key: 'indPc', dataset: 'nrg_bal_c', filters: { siec: 'TOTAL', nrg_bal: 'FC_IND_E', unit: 'KTOE' }, unit: 'kgoe', good: 'down', decimals: 0, per: 1e6 },
  { key: 'elcPc', dataset: 'nrg_ind_peh', filters: { siec: 'TOTAL', nrg_bal: 'GEP', plants: 'TOTAL', operator: 'TOTAL', unit: 'GWH' }, unit: 'kWh', good: 'neutral', decimals: 0, per: 1e6 },
]

// One kind of consumer: households, or industry (the non-household consumers), in total and per person.
const consumption = (key: string, nrg_bal: string, per?: number, siec = 'TOTAL', good: Indicator['good'] = 'down'): Indicator => ({ key, dataset: 'nrg_bal_c', filters: { siec, nrg_bal, unit: 'KTOE' }, unit: per ? 'kgoe' : 'ktoe', good, decimals: 0, ...(per ? { per } : {}) })
const FOCUS_INDICATORS: Record<'households' | 'industry', Indicator[]> = {
  households: [...PRICES.households, consumption('hh', 'FC_OTH_HH_E'), consumption('hhPc', 'FC_OTH_HH_E', 1e6), consumption('hhElc', 'FC_OTH_HH_E', undefined, 'E7000', 'neutral'), consumption('hhGas', 'FC_OTH_HH_E', undefined, 'G3000', 'neutral'), INDICATORS.find((i) => i.key === 'poverty')!],
  industry: [...PRICES.industry, consumption('ind', 'FC_IND_E'), consumption('indPc', 'FC_IND_E', 1e6), consumption('indElc', 'FC_IND_E', undefined, 'E7000', 'neutral'), consumption('indGas', 'FC_IND_E', undefined, 'G3000', 'neutral'), INDICATORS.find((i) => i.key === 'ei')!],
}

// Products and sectors of ENDASH's consumption and production charts.
const PRODUCTS = ['C0000X0350-0370', 'C0350-0370', 'P1000', 'S2000', 'G3000', 'O4000XBIO', 'RA000', 'W6100_6220', 'N900H', 'E7000', 'H8000']
const SECTORS = ['FC_IND_E', 'FC_TRA_E', 'FC_OTH_HH_E', 'FC_OTH_CP_E', 'FC_OTH_AF_E', 'FC_OTH_FISH_E', 'FC_OTH_NSP_E']
// RED III (Directive (EU) 2023/2413): a binding 42.5% renewables by 2030, with 2.5 points more as an aim.
const REN_TARGET = 42.5
const REN_AIM = 45
const EU_MEMBERS = PROFILE_GEOS.slice(1, 28)
// The indicators worth ranking: relative ones (shares, intensities, per person), not sizes.
const RANKED = ['elecPrice', 'gasPrice', 'elecPriceInd', 'gasPriceInd', 'ren', 'ei', 'ep', 'dep', 'fossil', 'poverty', 'pecPc', 'fecPc', 'hhPc', 'traPc', 'indPc']
const TRANSPORT_FUELS = ['G3000', 'O4630', 'O4652XR5210B', 'O4671XR5220B', 'R5210P', 'R5210B', 'R5220P', 'R5220B', 'R5290', 'R5300', 'E7000']
const INDUSTRY_FUELS = ['C0000X0350-0370', 'C0350-0370', 'E7000', 'G3000', 'H8000', 'N900H', 'O4000XBIO', 'P1000', 'RA000', 'S2000', 'W6100_6220']
const GHG_SECTORS = ['CRF1A1', 'CRF1A2', 'CRF1A3', 'CRF1A4A', 'CRF1A4B', 'CRF1A4C', 'CRF1A5']
const HOUSEHOLD_USES = ['FC_OTH_HH_E_SH', 'FC_OTH_HH_E_SC', 'FC_OTH_HH_E_WH', 'FC_OTH_HH_E_CK', 'FC_OTH_HH_E_LE', 'FC_OTH_HH_E_OE']
const RENEWABLE_USES = ['REN', 'REN_ELC', 'REN_HEAT_CL', 'REN_TRA']
const DEPENDENCY_FUELS = ['TOTAL', 'G3000', 'O4000XBIO', 'O4100_TOT', 'O4200']
const ELECTRICITY = ['CF', 'RA100', 'RA130', 'RA200', 'RA300', 'RA400', 'RA500', 'N9000', 'X9900', 'X9900H']

const linkFor = (dataset: string, lang: string) => `https://ec.europa.eu/eurostat/databrowser/view/${dataset}/default/table?lang=${lang}`

/** Value per (series key, year) for one country. */
function seriesOf(result: EurostatResult, geo: string, per?: number, population?: EurostatResult | null): Map<string, number> {
  const out = new Map<string, number>()
  const people = new Map<string, number>()
  for (const o of population?.observations ?? []) if (o.keys.geo === geo && o.value) people.set(o.keys.time, o.value)
  for (const o of result.observations) {
    if (o.keys.geo !== geo || o.value == null) continue
    if (!per) out.set(o.keys.time, o.value)
    else if (people.has(o.keys.time)) out.set(o.keys.time, (o.value * per) / people.get(o.keys.time)!)
  }
  return out
}

const tidy = (name: string) => name.replace(/^Final consumption - (other sectors - )?/i, '').replace(/ - energy use$/i, '').replace(/^./, (c) => c.toUpperCase())
const labelOf = (result: EurostatResult, dim: string, code: string) => tidy(result.dimensions[dim]?.codes.find((c) => c.code === code)?.label ?? code)

/**
 * One country against the EU across the codes of a dimension, in the latest year the country has
 * data for; as shares of the total when `percent` (the structure, not the size, is compared).
 */
function compareBar(result: EurostatResult | null, dim: string, geos: string[], names: string[], percent: boolean, until?: string) {
  if (!result) return null
  const [geo, eu] = geos
  const years = [...new Set(result.observations.filter((o) => o.keys.geo === geo && o.value != null && (!until || o.keys.time <= until)).map((o) => o.keys.time))].sort()
  // The latest year that has (nearly) every category: the newest year is often published for some of them only.
  const count = (y: string) => new Set(result.observations.filter((o) => o.keys.geo === geo && o.keys.time === y && o.value != null).map((o) => o.keys[dim])).size
  const most = Math.max(0, ...years.map(count))
  const year = years.filter((y) => count(y) >= most).at(-1)
  if (!year) return null
  const at = (g: string, code: string) => result.observations.find((o) => o.keys.geo === g && o.keys.time === year && o.keys[dim] === code)?.value ?? null
  const codes = [...new Set(result.observations.map((o) => o.keys[dim]))].filter((c) => at(geo, c) != null)
  if (codes.length < 2) return null
  const total = (g: string) => codes.reduce((sum, c) => sum + (at(g, c) ?? 0), 0)
  const value = (g: string, c: string) => {
    const v = at(g, c)
    if (v == null || !percent) return v
    const t = total(g)
    return t > 0 ? Math.round((1000 * v) / t) / 10 : null
  }
  return {
    year,
    categories: codes.map((c) => labelOf(result, dim, c)),
    series: [{ name: names[0], data: codes.map((c) => value(geo, c)) }, ...(eu && eu !== geo ? [{ name: names[1], data: codes.map((c) => value(eu, c)) }] : [])],
  }
}

/** Latest year with a value in each of the given series, for a pie: name → value. */
function latestSlices(result: EurostatResult, geo: string, dim: string, until?: string, perPerson?: { per: number; population: EurostatResult | null }): { year: string; slices: { name: string; y: number }[] } | null {
  const years = [...new Set(result.observations.filter((o) => o.keys.geo === geo && o.value != null && (!until || o.keys.time <= until)).map((o) => o.keys.time))].sort()
  for (const year of years.reverse()) {
    const slices = result.observations
      .filter((o) => o.keys.geo === geo && o.keys.time === year && o.value != null && o.value > 0)
      .map((o) => ({ name: result.dimensions[dim]?.codes.find((c) => c.code === o.keys[dim])?.label ?? o.keys[dim], y: o.value as number }))
      .map((x) => ({ ...x, name: tidy(x.name) }))
      .map((x) => (perPerson ? { ...x, y: (x.y * perPerson.per) / (perPerson.population?.observations.find((q) => q.keys.geo === geo && q.keys.time === year)?.value ?? NaN) } : x))
      .filter((x) => Number.isFinite(x.y))
      .sort((a, b) => b.y - a.y)
    if (slices.length >= 2) return { year, slices }
  }
  return null
}

function profileControls(plan: Plan, dict: EnergyDictionary, year: string, t: ProfileStrings, countries: { code: string; label: string }[]): DashboardControls {
  const end = Number(dict.datasets[DATASET]?.dataEnd) || Number(year)
  const at = (y: string): Plan => ({ ...plan, time: { kind: 'range', since: y, until: y }, focusPeriod: y })
  const years = Array.from({ length: 15 }, (_, k) => String(end - k))
  if (!years.includes(year)) years.push(year)
  const per = !!plan.profile?.perCapita
  const focus = plan.profile?.focus
  return {
    years: years.map((y) => ({ label: y, plan: at(y), active: y === year })),
    choices: [
      {
        key: 'view',
        label: t.view,
        options: [
          { label: t.viewTotals, plan: { ...plan, profile: profileOf(plan.profile, { perCapita: false }) }, active: !per },
          { label: t.viewPerCapita, plan: { ...plan, profile: profileOf(plan.profile, { perCapita: true }) }, active: per },
        ],
      },
      {
        key: 'compare',
        label: t.compareWith,
        options: [
          { label: t.compareEu, plan: { ...plan, profile: profileOf(plan.profile, { compare: null }) }, active: !plan.profile?.compare },
          ...countries.map((c) => ({ label: c.label, plan: { ...plan, profile: profileOf(plan.profile, { compare: c.code }) }, active: plan.profile?.compare === c.code })),
        ],
      },
      {
        key: 'consumer',
        label: t.consumer,
        options: [
          { label: t.consumerAll, plan: { ...plan, profile: profileOf(plan.profile, { focus: null }) }, active: !focus },
          { label: t.consumerHouseholds, plan: { ...plan, profile: profileOf(plan.profile, { focus: 'households' }) }, active: focus === 'households' },
          { label: t.consumerIndustry, plan: { ...plan, profile: profileOf(plan.profile, { focus: 'industry' }) }, active: focus === 'industry' },
        ],
      },
    ],
  }
}

export async function buildProfileDashboard(
  plan: Plan,
  dict: EnergyDictionary,
  lang: string,
  s: { profile: ProfileStrings; sugExplain: string },
  signal?: AbortSignal,
): Promise<DashboardSpec> {
  const t = s.profile
  const geo = String(plan.filters.geo ?? EU)
  const until = plan.focusPeriod
  const ref = plan.profile?.compare && plan.profile.compare !== geo ? plan.profile.compare : EU
  const geos = geo === ref ? [geo] : [geo, ref]
  // Eurostat refuses "the last N" together with an end: a year asked for is a window ending there.
  const window = (n: number) => (until ? { sinceTimePeriod: String(Number(until) - n + 1), untilTimePeriod: until } : { lastTimePeriod: n })
  const timeQuery = window(30)
  const halfYears = until ? { sinceTimePeriod: `${Number(until) - 14}-S1`, untilTimePeriod: `${until}-S2` } : { lastTimePeriod: 30 }
  const ask = (dataset: string, filters: Record<string, string | string[]>, query: Record<string, unknown> = timeQuery) =>
    dict.datasets[dataset] ? fetchEurostatData(dataset, { filters: { geo: geos, ...filters }, lang, signal, ...query }).catch(() => null) : Promise.resolve(null)

  const perCapita = !!plan.profile?.perCapita
  const focus = plan.profile?.focus
  const list = focus ? FOCUS_INDICATORS[focus] : perCapita ? PER_CAPITA : INDICATORS
  // Population on 1 January (demo_pjan is not in the dictionary: asked for directly).
  const population = perCapita || focus ? await fetchEurostatData('demo_pjan', { filters: { geo: geos, age: 'TOTAL', sex: 'T', unit: 'NR' }, lang, signal, ...timeQuery }).catch(() => null) : null
  const [indicatorData, sectors, products, electricity] = await Promise.all([
    Promise.all(list.map((i) => ask(i.dataset, i.filters, i.semester ? halfYears : timeQuery))),
    focus ? null : ask('nrg_bal_c', { siec: 'TOTAL', nrg_bal: SECTORS, unit: 'KTOE' }, window(4)),
    focus ? null : ask('nrg_bal_c', { siec: PRODUCTS, nrg_bal: 'FC_E', unit: 'KTOE' }, window(4)),
    focus ? null : ask('nrg_ind_peh', { geo: [geo], siec: ELECTRICITY, nrg_bal: 'GEP', plants: 'TOTAL', operator: 'TOTAL', unit: 'GWH' }, window(20)),
  ])
  // The rest of ENDASH's breakdowns (totals view): how the country compares with the EU, and what its consumption is made of.
  const more = perCapita || focus
    ? []
    : await Promise.all([
        ask('nrg_ind_ren', { nrg_bal: RENEWABLE_USES, unit: 'PC' }, window(4)),
        ask('nrg_ind_id', { siec: DEPENDENCY_FUELS, unit: 'PC' }, window(4)),
        ask('env_air_gge', { geo: [geo], src_crf: GHG_SECTORS, airpol: 'GHG', unit: 'THS_T' }, window(4)),
        ask('nrg_d_hhq', { geo: [geo], siec: 'TOTAL', nrg_bal: HOUSEHOLD_USES, unit: 'TJ' }, window(4)),
        ask('nrg_bal_c', { geo: [geo], siec: TRANSPORT_FUELS, nrg_bal: 'FC_TRA_E', unit: 'KTOE' }, window(4)),
        ask('nrg_bal_c', { geo: [geo], siec: INDUSTRY_FUELS, nrg_bal: 'FC_IND_E', unit: 'KTOE' }, window(4)),
        ask('nrg_bal_c', { geo: [geo], siec: PRODUCTS, nrg_bal: 'GAE', unit: 'KTOE' }, window(4)),
      ])
  // One kind of consumer: what it uses, by purpose (households) and by fuel, against the EU.
  const [uses, fuels] = focus
    ? await Promise.all([
        focus === 'households' ? ask('nrg_d_hhq', { geo: [geo], siec: 'TOTAL', nrg_bal: HOUSEHOLD_USES, unit: 'TJ' }, window(4)) : Promise.resolve(null),
        ask('nrg_bal_c', { siec: focus === 'households' ? PRODUCTS : INDUSTRY_FUELS, nrg_bal: focus === 'households' ? 'FC_OTH_HH_E' : 'FC_IND_E', unit: 'KTOE' }, window(4)),
      ])
    : [null, null]
  const [renewablesByUse, dependencyByFuel, ghg, households, transport, industry, available] = more
  // Distance to the 2030 energy efficiency targets (Eurostat carries them as *_DT2030 next to each measure).
  const efficiency = perCapita || focus ? null : await ask('nrg_ind_eff', { nrg_bal: ['FEC_EED', 'PEC_EED', 'FEC_DT2030', 'PEC_DT2030'], unit: 'MTOE' }, timeQuery)
  const geoName = (indicatorData.find(Boolean)?.dimensions.geo?.codes.find((c) => c.code === geo)?.label ?? geo).replace(/\s*\(.*?\)\s*$/, '')
  const nameOf = (code: string) => (indicatorData.find(Boolean)?.dimensions.geo?.codes.find((c) => c.code === code)?.label ?? code).replace(/\s*\(.*?\)\s*$/, '')
  const refName = ref === EU ? t.eu : nameOf(ref)
  // "EU: 26.2 %", or "France: 23.0 %" when another country is the reference.
  const refValue = ref === EU ? t.euValue : `${refName}: {value}`
  const nf = (d: number) => new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d })

  const kpis: KpiSpec[] = []
  const kpiKeys: string[] = []
  // Country names for the "compare with" list: they come with the ranking's answers.
  const geoLabels = new Map<string, string>()
  const widgets: WidgetSpec[] = []
  const summary: string[] = []
  const insights: Insight[] = []
  const trendCharts: WidgetSpec[] = []
  let latestYear = ''
  const values: Record<string, { value: number; eu?: number; year: string; delta?: number; ind: Indicator }> = {}

  list.forEach((ind, n) => {
    const result = indicatorData[n]
    if (!result) return
    // Consumption datasets carry the two series in one result: filtered by the query already.
    const own = seriesOf(result, geo, ind.per, population)
    const years = [...own.keys()].sort()
    const year = years.at(-1)
    if (!year) return
    const value = own.get(year)!
    const eu = geo === ref ? undefined : seriesOf(result, ref, ind.per, population).get(year)
    const first = years.length > 1 ? years[Math.max(0, years.length - 11)] : undefined
    const delta = first && first !== year ? value - own.get(first)! : undefined
    values[ind.key] = { value, eu, year, delta, ind }
    if (!ind.semester && year > latestYear) latestYear = year
    kpiKeys.push(ind.key)
    kpis.push({
      label: t.indicators[ind.key],
      value,
      unit: ind.unit,
      decimals: ind.decimals,
      ...(delta != null ? { delta, deltaUnit: ind.unit, deltaLabel: fill(t.since, { year: first! }) } : {}),
      caption: [year, eu != null ? fill(refValue, { value: `${nf(ind.decimals).format(eu)} ${ind.unit}` }) : ''].filter(Boolean).join(' · '),
      goodDirection: ind.good === 'up' || ind.good === 'down' ? ind.good : 'neutral',
      trend: years.slice(-15).map((y) => own.get(y) ?? null),
    })
    if (years.length > 2 && ['ren', 'dep', 'fossil', 'ei', 'pecPc', 'hhPc', 'elcPc', 'hh', 'ind', 'indPc', 'elecPrice', 'gasPrice', 'elecPriceInd', 'gasPriceInd'].includes(ind.key)) {
      const euSeries = seriesOf(result, ref, ind.per, population)
      const shown = years.slice(-20)
      trendCharts.push({
        type: 'line',
        title: fill(t.trend, { indicator: t.indicators[ind.key] }),
        subtitle: `${shown[0]}–${shown.at(-1)}`,
        categories: shown,
        series: [{ name: geoName, data: shown.map((y) => own.get(y) ?? null) }, ...(geo !== ref ? [{ name: refName, data: shown.map((y) => euSeries.get(y) ?? null) }] : [])],
        unit: ind.unit,
        size: 'half',
        role: 'evolution',
        source: { code: ind.dataset, url: linkFor(ind.dataset, lang) },
      })
    }
  })
  if (!kpis.length) throw new NoDataError(DATASET)

  // Where the country stands among the EU-27 in the same year (indicators that are not just a matter of size).
  if (EU_MEMBERS.includes(geo)) {
    const peers = EU_MEMBERS.filter((g) => g !== geo)
    await Promise.all(
      list.map(async (ind) => {
        const item = values[ind.key]
        const k = kpiKeys.indexOf(ind.key)
        if (!item || k < 0 || !RANKED.includes(ind.key) || ind.good === 'neutral') return
        const exact = { sinceTimePeriod: item.year, untilTimePeriod: item.year }
        const [all, people] = await Promise.all([
          ask(ind.dataset, { ...ind.filters, geo: EU_MEMBERS }, exact),
          ind.per ? fetchEurostatData('demo_pjan', { filters: { geo: EU_MEMBERS, age: 'TOTAL', sex: 'T', unit: 'NR' }, lang, signal, ...exact }).catch(() => null) : Promise.resolve(null),
        ])
        if (!all) return
        for (const c of all.dimensions.geo?.codes ?? []) geoLabels.set(c.code, c.label.replace(/\s*\(.*?\)\s*$/, ''))
        const at = (g: string) => seriesOf(all, g, ind.per, people).get(item.year)
        const mine = at(geo)
        const others = peers.map(at).filter((x): x is number => x != null)
        if (mine == null || others.length < 5) return
        const better = others.filter((x) => (ind.good === 'up' ? x > mine : x < mine)).length
        kpis[k].caption = [kpis[k].caption, fill(t.rank, { n: String(better + 1), total: String(others.length + 1) })].filter(Boolean).join(' · ')
      }),
    )
  }

  // Consumption and production: how they are made up.
  const parts: [string, EurostatResult | null, string, string, string][] = [
    [t.bySector, sectors, 'nrg_bal', 'nrg_bal_c', 'ktoe'],
    [t.byProduct, products, 'siec', 'nrg_bal_c', 'ktoe'],
    [t.electricity, electricity, 'siec', 'nrg_ind_peh', 'GWh'],
  ]
  const pies: WidgetSpec[] = []
  for (const [title, result, dim, dataset, unit] of parts) {
    const found = result ? latestSlices(result, geo, dim, until, perCapita ? { per: unit === 'GWh' ? 1e6 : 1e6, population } : undefined) : null
    if (found) pies.push({ type: 'pie', title, subtitle: `${geoName} · ${found.year}${perCapita ? ` · ${t.perPerson}` : ''}`, slices: found.slices, unit: perCapita ? (unit === 'GWh' ? 'kWh' : 'kgoe') : unit, size: 'half', source: { code: dataset, url: linkFor(dataset, lang) } })
  }

  // Against the EU: what the renewables are used for, where the imports are, and the structure of consumption.
  const bars: WidgetSpec[] = []
  const names = [geoName, refName]
  const addBar = (title: string, result: EurostatResult | null, dim: string, dataset: string, unit: string, percent: boolean) => {
    const found = compareBar(result, dim, geos, names, percent, until)
    if (found) bars.push({ type: 'bar', title, subtitle: found.year, categories: found.categories, series: found.series, unit, size: 'half', role: 'related', source: { code: dataset, url: linkFor(dataset, lang) }, ...(found.categories.length > 6 ? { horizontal: true } : {}) })
  }
  if (focus) {
    addBar(focus === 'households' ? t.householdFuelShare : t.industryFuelShare, fuels, 'siec', 'nrg_bal_c', '%', true)
  }
  if (!perCapita && !focus) {
    addBar(t.renewablesByUse, renewablesByUse, 'nrg_bal', 'nrg_ind_ren', '%', false)
    addBar(t.dependencyByFuel, dependencyByFuel, 'siec', 'nrg_ind_id', '%', false)
    addBar(t.sectorShare, sectors, 'nrg_bal', 'nrg_bal_c', '%', true)
    addBar(t.productShare, products, 'siec', 'nrg_bal_c', '%', true)
  }
  const extraPies: WidgetSpec[] = []
  const addPie = (title: string, result: EurostatResult | null, dim: string, dataset: string, unit: string) => {
    const found = result ? latestSlices(result, geo, dim, until) : null
    if (found) extraPies.push({ type: 'pie', title, subtitle: `${geoName} · ${found.year}`, slices: found.slices, unit, size: 'half', source: { code: dataset, url: linkFor(dataset, lang) } })
  }
  if (focus === 'households') addPie(t.households, uses, 'nrg_bal', 'nrg_d_hhq', 'TJ')
  if (focus) addPie(focus === 'households' ? t.householdFuels : t.industry, fuels, 'siec', 'nrg_bal_c', 'ktoe')
  addPie(t.ghg, ghg ?? null, 'src_crf', 'env_air_gge', 'kt CO₂e')
  addPie(t.households, households ?? null, 'nrg_bal', 'nrg_d_hhq', 'TJ')
  addPie(t.transport, transport ?? null, 'siec', 'nrg_bal_c', 'ktoe')
  addPie(t.industry, industry ?? null, 'siec', 'nrg_bal_c', 'ktoe')
  addPie(t.available, available ?? null, 'siec', 'nrg_bal_c', 'ktoe')

  // Gauges: how far from the EU's 2030 goals (renewables share; final and primary energy consumption).
  const gauges: WidgetSpec[] = []
  if (!perCapita && !focus) {
    const r = values.ren
    if (r) {
      const gap = r.value - REN_TARGET
      gauges.push({
        type: 'gauge',
        title: t.gaugeRenewables,
        subtitle: `${fill(t.gaugeRenewablesNote, { target: nf(1).format(REN_TARGET), aim: nf(1).format(REN_AIM) })}. ${fill(gap < 0 ? t.pointsBelow : t.pointsAbove, { value: nf(1).format(Math.abs(gap)) })}`,
        value: r.value,
        label: `${geoName}, ${r.year}`,
        max: Math.max(50, Math.ceil((r.value + 1) / 10) * 10),
        targets: [{ value: REN_TARGET, label: `${nf(1).format(REN_TARGET)}%` }, { value: REN_AIM, label: '' }],
        unit: '%',
        goal: 'reach',
        size: 'half',
        source: { code: 'nrg_ind_ren', url: linkFor('nrg_ind_ren', lang) },
      })
    }
    for (const m of ['FEC', 'PEC'] as const) {
      const at = (code: string) => {
        const byYear = new Map<string, number>()
        for (const o of efficiency?.observations ?? []) if (o.keys.geo === EU && o.keys.nrg_bal === code && o.value != null) byYear.set(o.keys.time, o.value)
        return byYear
      }
      const now = at(`${m}_EED`)
      const distance = at(`${m}_DT2030`)
      const year = [...now.keys()].filter((y) => distance.has(y)).sort().at(-1)
      if (!year) continue
      const value = now.get(year)!
      const target = value - distance.get(year)!
      if (!(target > 0)) continue
      const over = value - target
      gauges.push({
        type: 'gauge',
        title: m === 'FEC' ? t.gaugeFinal : t.gaugePrimary,
        subtitle: `${t.gaugeConsumptionNote}. ${fill(over > 0 ? t.aboveTarget : t.underTarget, { value: nf(1).format(Math.abs(over)), pct: nf(1).format(Math.abs((100 * over) / target)) })}`,
        value,
        label: `${t.eu}, ${year}`,
        max: Math.ceil((Math.max(value, target) * 1.25) / 10) * 10,
        targets: [{ value: Math.round(target * 10) / 10, label: `${nf(1).format(target)} Mtoe` }],
        unit: 'Mtoe',
        goal: 'stay-under',
        size: 'half',
        source: { code: 'nrg_ind_eff', url: linkFor('nrg_ind_eff', lang) },
      })
    }
  }

  // Electricity generation by source over the years: what the mix moved to (wind, solar, gas, coal, nuclear…).
  const generation: WidgetSpec[] = []
  if (electricity) {
    const years = [...new Set(electricity.observations.filter((o) => o.keys.geo === geo && o.value != null).map((o) => o.keys.time))].sort()
    const codes = ELECTRICITY.filter((c) => electricity.observations.some((o) => o.keys.geo === geo && o.keys.siec === c && o.value != null && o.value > 0))
    if (years.length > 2 && codes.length > 1) {
      generation.push({
        type: 'area',
        title: t.generationOverTime,
        subtitle: `${years[0]}–${years.at(-1)} · GWh`,
        categories: years,
        series: codes.map((c) => ({ name: labelOf(electricity, 'siec', c), data: years.map((y) => electricity.observations.find((o) => o.keys.geo === geo && o.keys.siec === c && o.keys.time === y)?.value ?? null) })),
        stacked: true,
        unit: 'GWh',
        size: 'full',
        role: 'composition',
        source: { code: 'nrg_ind_peh', url: linkFor('nrg_ind_peh', lang) },
      })
    }
  }

  widgets.push({ type: 'kpis', items: kpis }, ...gauges, ...generation, ...trendCharts, ...bars, ...pies, ...extraPies)

  // Summary and insights: what stands out, from the numbers.
  const v = values
  const lead = focus === 'households' ? v.hh : focus === 'industry' ? v.ind : undefined
  if (lead) summary.push(fill(focus === 'households' ? t.leadHouseholds : t.leadIndustry, { geo: geoName, year: lead.year, value: `${nf(0).format(lead.value)} ktoe`, eu: lead.eu != null ? `(${fill(refValue, { value: `${nf(0).format(lead.eu)} ktoe` })})` : '' }).replace(/\s+\./, '.'))
  if (perCapita && v.pecPc) summary.push(fill(t.leadPerCapita, { geo: geoName, year: v.pecPc.year, value: `${nf(0).format(v.pecPc.value)} kgoe`, eu: v.pecPc.eu != null ? `(${fill(refValue, { value: `${nf(0).format(v.pecPc.eu)} kgoe` })})` : '' }).replace(/\s+\./, '.'))
  if (v.ren) summary.push(fill(t.leadRenewables, { geo: geoName, year: v.ren.year, value: `${nf(1).format(v.ren.value)} %`, eu: v.ren.eu != null ? `(${fill(refValue, { value: `${nf(1).format(v.ren.eu)} %` })})` : '' }).replace(/\s+\./, '.'))
  if (v.dep) summary.push(fill(t.leadDependency, { geo: geoName, year: v.dep.year, value: `${nf(1).format(v.dep.value)} %` }))
  for (const item of Object.values(v)) {
    const { ind, value, eu, delta } = item
    if (eu != null) {
      if (ind.good === 'neutral') continue
      const better = ind.good === 'up' ? value > eu : value < eu
      insights.push({ tone: better ? 'up' : 'down', parts: [fill(ref === EU ? (better ? t.betterThanEu : t.worseThanEu) : better ? t.betterThanRef : t.worseThanRef, { ref: refName, indicator: t.indicators[ind.key], geo: geoName, value: `${nf(ind.decimals).format(value)} ${ind.unit}`, eu: `${nf(ind.decimals).format(eu)} ${ind.unit}` })] })
    } else if (delta != null && Math.abs(delta) > 0) {
      const better = ind.good === 'up' ? delta > 0 : delta < 0
      insights.push({ tone: better ? 'up' : 'down', parts: [fill(t.movedTowards, { indicator: t.indicators[ind.key], dir: delta > 0 ? t.rose : t.fell, delta: `${nf(ind.decimals).format(Math.abs(delta))} ${ind.unit}` })] })
    }
  }

  const title = fill(focus === 'households' ? t.titleHouseholds : focus === 'industry' ? t.titleIndustry : perCapita ? t.titlePerCapita : t.title, { geo: geoName })
  const suggestions: Suggestion[] = []
  if (geo !== EU) suggestions.push({ label: t.sugEu, plan: { ...plan, filters: { ...plan.filters, geo: EU } } })
  else suggestions.push({ label: t.sugCountry, plan: { ...plan, filters: { ...plan.filters, geo: 'DE' } } })
  suggestions.push({ label: perCapita ? t.sugTotals : t.sugPerCapita, plan: { ...plan, profile: profileOf(plan.profile, { perCapita: !perCapita }) } })
  if (focus !== 'households') suggestions.push({ label: t.sugHouseholds, plan: { ...plan, profile: profileOf(plan.profile, { focus: 'households' }) } })
  if (focus !== 'industry') suggestions.push({ label: t.sugIndustry, plan: { ...plan, profile: profileOf(plan.profile, { focus: 'industry' }) } })
  // The details are a click away: the price dashboards of this country.
  const consumerKind = focus === 'industry' ? 'nonHousehold' : 'household'
  const elec = pricesPlanFor('electricity', consumerKind, geo, dict)
  const gas = pricesPlanFor('gas', consumerKind, geo, dict)
  if (elec) suggestions.push({ label: t.sugElectricityPrices, plan: elec })
  if (gas) suggestions.push({ label: t.sugGasPrices, plan: gas })
  const sugPlans = suggestions
  sugPlans.push({ label: s.sugExplain, explain: true })

  const { spec } = sanitizeSpec({
    title,
    subtitle: t.subtitle,
    summary,
    insights: insights.slice(0, 6),
    notes: [],
    widgets,
    layout: ['summary', 'toolbar', 'kpis', 'charts', 'insights', 'suggestions'],
    presentation: { template: 'profile', kpiStyle: 'cards', controls: ['geo', 'year', 'compare', 'consumer', 'view'], primaryControls: 5, accent: 'teal' },
    source: { code: DATASET, title: t.sourceTitle, url: linkFor(DATASET, lang) },
    suggestions: sugPlans,
    controls: profileControls(plan, dict, until ?? latestYear, t, EU_MEMBERS.filter((c) => c !== geo).map((code) => ({ code, label: geoLabels.get(code) ?? code })).sort((a, b) => a.label.localeCompare(b.label, lang))),
    context: [title, ...summary, ...kpis.map((k) => `${k.label}: ${nf(k.decimals ?? 1).format(k.value)} ${k.unit ?? ''} (${k.caption ?? ''})`)].join('\n'),
    plan: { ...plan, focusPeriod: until ?? latestYear },
    shown: { geo: [geo] },
  })
  return spec
}
