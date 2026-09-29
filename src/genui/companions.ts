import { fetchEurostatData, type EnergyDictionary, type EurostatResult } from '../data/eurostat'
import { EU27 } from './concepts'
import type { Plan, WidgetSpec } from './types'

/**
 * Related data shown next to the main dashboard, from the same or another dataset, when it
 * answers the natural next question:
 *
 *   oil consumption in Spain            → which sectors use it (industry, transport, households…)
 *   import dependency of a country      → dependency by fuel, and where its natural gas comes from
 *   renewable share of a country        → the share in electricity, heating & cooling, transport
 *   household or industry prices        → what the price is made of (energy, network, taxes, VAT)
 *   electricity or heat production      → gross vs net, by type of plant (CHP), by operator
 *   production or supply of energy      → the renewable share against the EU 2030 target
 *
 * With several countries each companion compares them: parts of a whole (sectors, plant types,
 * price components) as 100% bars per country, separate measures (shares by sector, gross and net)
 * as grouped bars.
 *
 * Each companion is one request and one chart; one that fails or has no data is left out.
 */

export interface CompanionStrings {
  bySector: string
  byFuel: string
  gasOrigins: string
  renBySector: string
  priceParts: string
  /** The same parts over the years (stacked columns). */
  pricePartsOverTime: string
  /** Taxes, fees, levies and charges other than VAT. */
  otherTaxes: string
  grossNet: string
  byPlant: string
  byOperator: string
  renTarget: string
  /** Label of the EU 2030 renewable target line. */
  renTargetLine: string
  /** The bubble chart: import dependency × renewable share, sized by energy use per person. */
  bubble: string
  bubbleX: string
  bubbleY: string
  bubbleZ: string
  /** Unit of energy use per person ("kgoe per person"). */
  perPerson: string
  /** "No data for {names} in this selection." */
  noDataFor: string
  /** The ranking of countries by the total of a breakdown. */
  countriesRanking: string
  countriesEmit: string
  /** Each country's mix (100% bars). */
  mixAcrossCountries: string
  /** Renewables and the EU 2030 target: the gap of each country, and the way there. */
  renGap: string
  renGapNote: string
  renProgress: string
  /** "Straight path to {target}% in 2030". */
  renPath: string
  /** "Needs +{need} pp a year from {year}; +{recent} pp a year over the last five years." */
  renPace: string
  renPaceReached: string
  /** Energy efficiency: the way to the 2030 levels. */
  effProgress: string
  /** "{measure}: straight path to {target} Mtoe in 2030". */
  effPath: string
  /** "{measure}: {need} Mtoe a year from {year} to reach {target} Mtoe in 2030; {recent} a year over the last five years." */
  effPace: string
  /** The gauge and the bullet chart of the renewable share against the 2030 target. */
  renGauge: string
  renGaugeNote: string
  /** "{value}% binding" / "{value}% aim": the marks on the scale. */
  renBinding: string
  renAim: string
  /** Consumption as a percentage of its 2030 level (bullet). */
  effAgainst: string
  effAgainstNote: string
  effLevel: string
  /** Greenhouse gas emissions against the EU's 2030 target (net emissions, -55% against 1990). */
  ghgGap: string
  ghgGapNote: string
  ghgGauge: string
  ghgGaugeNote: string
  ghgMark: string
  ghgProgress: string
  /** "Straight path to {value} in 2030 (1990 = 100)". */
  ghgPath: string
  ghgPace: string
  ghgReached: string
}

export interface Companion {
  dataset: string
  filters: Record<string, string | string[]>
  /** The dimension whose codes are the slices or bars. */
  dim: string
  /** Codes to show; all two-letter partner countries when 'partners'. */
  codes: string[] | 'partners'
  title: string
  /** 'dumbbell': two codes per country joined (the first → the second), for several countries. */
  view: 'pie' | 'bar' | 'dumbbell'
  /** Price components: taxes other than VAT are derived (see PRICE_PARTS). */
  priceSplit?: { otherTaxes: string; overTime: string }
  unit?: string
  top?: number
  /** Only the first N rows (a ranking), without an "Others" bar. */
  rank?: number
  /** The dataset has no total across the products asked for: add their values up (per plant type, per operator). */
  sum?: boolean
  /** Dashed reference line (e.g. the EU 2030 renewable target). */
  reference?: { value: number; label: string }
}

const SECTORS = ['FC_IND_E', 'FC_TRA_E', 'FC_OTH_HH_E', 'FC_OTH_CP_E', 'FC_OTH_AF_E', 'FC_NE']
const FUELS = ['C0000X0350-0370', 'O4000XBIO', 'G3000']
const REN_SECTORS = ['REN_ELC', 'REN_HEAT_CL', 'REN_TRA']
// "Taxes, fees, levies and charges" includes VAT (and allowances reduce it): the price is
// energy and supply + network costs + (taxes − VAT − allowances) + VAT.
const PRICE_PARTS = ['NRG_SUP', 'NETC', 'TAX_FEE_LEV_CHRG', 'VAT', 'TAX_FEE_LEV_CHRG_ALLOW']
const PRICE_COMPONENTS: Record<string, string> = { nrg_pc_204: 'nrg_pc_204_c', nrg_pc_205: 'nrg_pc_205_c', nrg_pc_202: 'nrg_pc_202_c', nrg_pc_203: 'nrg_pc_203_c' }

// The EU's 2030 target for the share of renewables in gross final energy consumption
// (Directive (EU) 2023/2413): a binding 42.5%.
const EU_REN_TARGET_2030 = 42.5
// Producing or supplying energy (a mix of sources), where the renewable share is the next
// question: electricity production, and the balances' supply flows by product.
const PRODUCTION_DATASETS = ['nrg_ind_peh', 'nrg_bal_peh']
const SUPPLY_FLOWS = ['GAE', 'GIC', 'NRGSUP', 'PPRD']
// Several countries: up to this many compared in a companion.
const MAX_COUNTRIES = 8

// "How the mix differs by country": the EU-27 and the larger economies (plus the country asked for).
const MIX_COUNTRIES = ['EU27_2020', 'DE', 'FR', 'IT', 'ES', 'PL', 'NL', 'BE', 'SE', 'AT', 'RO', 'CZ', 'PT', 'EL', 'FI', 'DK', 'IE', 'HU']
const UNIT_TEXT: Record<string, string> = { KTOE: 'ktoe', MTOE: 'Mtoe', GWH: 'GWh', TJ: 'TJ', TJ_GCV: 'TJ (GCV)', THS_T: 'thousand t', MIO_T: 'Mt', MIO_M3: 'million m³' }
// The measures with a breakdown by parts: what the parts are (dim), their total, the dimensions fixed for it.
const BREAKDOWNS = [
  { dim: 'siec', total: 'TOTAL', fixed: ['nrg_bal', 'unit'], min: 5, emission: false },
  { dim: 'src_crf', total: 'TOTXMEMO', fixed: ['airpol', 'unit'], min: 4, emission: true },
]

/** Greenhouse gas emissions: net emissions against the EU's 2030 target. */
function needsEmissionsTarget(plan: Plan): boolean {
  return plan.dataset === 'env_air_gge' && plan.filters.airpol === 'GHG'
}

// The European Climate Law: net greenhouse gas emissions down by 55% by 2030 against 1990.
const EU_GHG_CUT_2030 = 55

/** Energy efficiency: primary and final energy consumption against the 2030 levels. */
function needsEfficiencyTarget(plan: Plan): boolean {
  const flows = ([] as string[]).concat(plan.filters.nrg_bal ?? [])
  return plan.dataset === 'nrg_ind_eff' && flows.some((f) => f === 'FEC_EED' || f === 'PEC_EED')
}

/** Producing or supplying energy as a mix of sources, or the renewable share itself. */
function needsRenewableTarget(plan: Plan): boolean {
  const f = plan.filters
  const siecs = ([] as string[]).concat(f.siec ?? [])
  const flow = Array.isArray(f.nrg_bal) ? undefined : f.nrg_bal
  return (
    PRODUCTION_DATASETS.includes(plan.dataset) ||
    (['nrg_bal_c', 'ten00121', 'ten00122'].includes(plan.dataset) && siecs.length > 1 && SUPPLY_FLOWS.includes(flow ?? '')) ||
    (plan.dataset === 'nrg_ind_ren' && flow === 'REN')
  )
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? undefined : v)
const list = (v: string | string[] | undefined) => ([] as string[]).concat(v ?? [])

export function companionsFor(plan: Plan, dict: EnergyDictionary, s: CompanionStrings): Companion[] {
  const f = plan.filters
  // One country (or the EU), or up to MAX_COUNTRIES compared side by side.
  const geos = list(f.geo)
  if (!geos.length || geos.length > MAX_COUNTRIES) return []
  const several = geos.length > 1
  const geo: string | string[] = several ? geos : geos[0]
  const has = (dataset: string, dim: string, code: string) => dict.datasets[dataset]?.dimensions.find((d) => d.id === dim)?.codes.includes(code) ?? false
  const out: Companion[] = []

  // A product's consumption or supply in the balances → use by sector.
  if (plan.dataset === 'nrg_bal_c' && one(f.siec) && ['FC_E', 'GIC', 'GAE'].includes(one(f.nrg_bal) ?? '')) {
    out.push({ dataset: 'nrg_bal_c', filters: { siec: f.siec as string, unit: f.unit as string, geo }, dim: 'nrg_bal', codes: SECTORS, title: s.bySector, view: 'pie' })
  }
  // Import dependency → by fuel, and the origins of natural gas imports.
  if (plan.dataset === 'nrg_ind_id' && one(f.siec) === 'TOTAL') {
    out.push({ dataset: 'nrg_ind_id', filters: { unit: 'PC', geo }, dim: 'siec', codes: FUELS, title: s.byFuel, view: 'bar', unit: '%' })
    if (!several && has('nrg_ti_gas', 'geo', geos[0])) {
      out.push({ dataset: 'nrg_ti_gas', filters: { siec: 'G3000', unit: 'MIO_M3', geo }, dim: 'partner', codes: 'partners', title: s.gasOrigins, view: 'pie', unit: 'million m³', top: 6 })
    }
  }
  // Overall renewable share → the three sector shares.
  if (plan.dataset === 'nrg_ind_ren' && one(f.nrg_bal) === 'REN') {
    out.push({ dataset: 'nrg_ind_ren', filters: { unit: 'PC', geo }, dim: 'nrg_bal', codes: REN_SECTORS, title: s.renBySector, view: 'bar', unit: '%' })
  }
  // Prices → their components (annual data, same consumption band and currency).
  const parts = PRICE_COMPONENTS[plan.dataset]
  if (parts && dict.datasets[parts] && !several) {
    const ds = dict.datasets[parts]
    const band = one(f.nrg_cons)
    const filters: Record<string, string> = { geo: geos[0], currency: one(f.currency) ?? 'EUR' }
    filters.nrg_cons = band && has(parts, 'nrg_cons', band) ? band : (ds.defaults.nrg_cons ?? '')
    if (ds.dimensions.some((d) => d.id === 'unit')) filters.unit = ds.defaults.unit ?? 'KWH'
    out.push({ dataset: parts, filters, dim: 'nrg_prc', codes: PRICE_PARTS, title: s.priceParts, view: 'pie', priceSplit: { otherTaxes: s.otherTaxes, overTime: s.pricePartsOverTime } })
  }
  // Electricity or heat production by type of plant and operator: the dataset's own breakdowns,
  // for the total of all fuels. Electricity comes from electricity-only and CHP plants, heat from
  // CHP and heat-only plants ("CHP full mode" is part of CHP, so it is left out).
  if (plan.dataset === 'nrg_ind_peh' && one(f.plants) === 'TOTAL' && one(f.operator) === 'TOTAL') {
    const flow = one(f.nrg_bal) ?? 'GEP'
    const electricity = flow === 'GEP' || flow === 'NEP'
    const base = { siec: 'TOTAL', unit: one(f.unit) ?? (electricity ? 'GWH' : 'TJ'), geo }
    const unit = electricity ? 'GWh' : 'TJ'
    // Net → gross: the gap is what the plants use themselves.
    out.push({ dataset: plan.dataset, filters: { ...base, plants: 'TOTAL', operator: 'TOTAL' }, dim: 'nrg_bal', codes: electricity ? ['NEP', 'GEP'] : ['NHP', 'GHP'], title: s.grossNet, view: 'dumbbell', unit })
    out.push({ dataset: plan.dataset, filters: { ...base, nrg_bal: flow, operator: 'TOTAL' }, dim: 'plants', codes: electricity ? ['ELC', 'CHP'] : ['CHP', 'HEAT'], title: s.byPlant, view: 'pie', unit })
    out.push({ dataset: plan.dataset, filters: { ...base, nrg_bal: flow, plants: 'TOTAL' }, dim: 'operator', codes: ['PRR_MAIN', 'PRR_AUTO'], title: s.byOperator, view: 'pie', unit })
  }
  // The same for the combustible fuels' own dataset (no total across fuels: the ones asked for are added up).
  if (plan.dataset === 'nrg_ind_pehcf' && one(f.plants) === 'TOTAL' && one(f.operator) === 'TOTAL' && ['GEP', 'GHP'].includes(one(f.nrg_bal) ?? '') && list(f.siec).length >= 1) {
    const flow = one(f.nrg_bal) as string
    const electricity = flow === 'GEP'
    const base = { siec: list(f.siec), unit: one(f.unit) ?? (electricity ? 'GWH' : 'TJ'), geo }
    const unit = UNIT_TEXT[String(base.unit)] ?? String(base.unit)
    out.push({ dataset: plan.dataset, filters: { ...base, nrg_bal: flow, operator: 'TOTAL' }, dim: 'plants', codes: electricity ? ['ELC', 'CHP'] : ['CHP', 'HEAT'], title: s.byPlant, view: 'pie', unit, sum: true })
    out.push({ dataset: plan.dataset, filters: { ...base, nrg_bal: flow, plants: 'TOTAL' }, dim: 'operator', codes: ['PRR_MAIN', 'PRR_AUTO'], title: s.byOperator, view: 'pie', unit, sum: true })
  }
  // (Producing or supplying energy → the renewable share against the 2030 target is its own section:
  // buildRenewableTarget, with a gauge, a bullet chart, the gap of every country and the way there.)
  // A full breakdown of one measure (products of an energy flow; source sectors of an emission): which
  // countries have the most, and how each country's mix differs. Not for a specific question (a few parts,
  // or another chart type asked for).
  for (const b of BREAKDOWNS) {
    const parts = list(f[b.dim])
    const fixed = Object.fromEntries(b.fixed.map((k) => [k, one(f[k])]))
    const info = dict.datasets[plan.dataset]
    if (several || parts.length < b.min || plan.chart || !info || !b.fixed.every((k) => fixed[k]) || !has(plan.dataset, b.dim, b.total) || PRODUCTION_DATASETS.includes(plan.dataset)) continue
    const geoCodes = info.dimensions.find((d) => d.id === 'geo')?.codes ?? []
    const unit = String(fixed.unit)
    out.push({ dataset: plan.dataset, filters: { ...(fixed as Record<string, string>), [b.dim]: b.total }, dim: 'geo', codes: 'partners', title: b.emission ? s.countriesEmit : s.countriesRanking, view: 'bar', rank: 12, ...(UNIT_TEXT[unit] ? { unit: UNIT_TEXT[unit] } : {}) })
    const countries = [...new Set([...MIX_COUNTRIES, ...geos])].filter((c) => geoCodes.includes(c))
    if (countries.length >= 5) out.push({ dataset: plan.dataset, filters: { ...(fixed as Record<string, string>), geo: countries }, dim: b.dim, codes: parts.filter((c) => c !== b.total), title: s.mixAcrossCountries, view: 'pie' })
  }
  return out
}

/** Short names: "Final consumption - industry sector - energy use" → "industry sector". */
function shortLabel(label: string): string {
  const parts = label.split(/\s+-\s+/)
  const core = parts.length > 2 ? parts.slice(1, -1) : parts.length === 2 ? parts.slice(1) : parts
  const text = core.filter((p) => !/^(other sectors|sonstige sektoren|autres secteurs)$/i.test(p)).join(' – ') || label
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Fetches the companions (in parallel) and builds their charts, for the year the dashboard shows
 * (`year`) or the latest year with data.
 */
export async function buildCompanions(
  plan: Plan,
  dict: EnergyDictionary,
  lang: string,
  s: CompanionStrings,
  year: string | undefined,
  format: (v: number) => string,
  signal?: AbortSignal,
): Promise<WidgetSpec[]> {
  const list = companionsFor(plan, dict, s)
  const results = await Promise.allSettled(
    list.map((c) =>
      fetchEurostatData(c.dataset, {
        filters: { ...c.filters, ...(Array.isArray(c.codes) ? { [c.dim]: c.codes } : {}) },
        // Price components: several years, for their evolution; the others: one year.
        ...(c.priceSplit
          ? year
            ? { sinceTimePeriod: String(Number(year) - 7), untilTimePeriod: year }
            : { lastTimePeriod: 8 }
          : year
            ? { sinceTimePeriod: year, untilTimePeriod: year }
            : { lastTimePeriod: 3 }),
        lang,
        signal,
      }),
    ),
  )
  const widgets: WidgetSpec[] = []
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return
    const w = toWidget(list[i], r.value, lang, format)
    if (w) widgets.push(...([] as WidgetSpec[]).concat(w))
  })
  const bubble = await buildBubble(plan, dict, lang, s, year, signal).catch(() => null)
  if (bubble) widgets.push(bubble)
  if (needsRenewableTarget(plan)) widgets.push(...(await buildRenewableTarget(plan, dict, lang, s, signal).catch(() => [])))
  if (needsEmissionsTarget(plan)) widgets.push(...(await buildEmissionsTarget(plan, dict, lang, s, signal).catch(() => [])))
  if (needsEfficiencyTarget(plan)) widgets.push(...(await buildEfficiencyTarget(plan, dict, lang, s, signal).catch(() => [])))
  return widgets
}

// ---------- renewables and the EU 2030 target ----------

/**
 * Where the renewable share stands against the EU's 2030 target: each country's gap to it (the
 * target is EU-wide and the countries' own contributions differ, so this is an indication), and
 * the way there - the share so far, and the straight path from today to the target in 2030, with
 * the pace it needs against the pace of the last five years.
 */
async function buildRenewableTarget(plan: Plan, dict: EnergyDictionary, lang: string, s: CompanionStrings, signal?: AbortSignal): Promise<WidgetSpec[]> {
  const geos = list(plan.filters.geo)
  const geoCodes = dict.datasets.nrg_ind_ren?.dimensions.find((d) => d.id === 'geo')?.codes ?? []
  if (!geos.length || !geos.every((g) => geoCodes.includes(g))) return []
  // Every country ("compare all"): the gap to the target; a few: the way there as well.
  const many = geos.length > MAX_COUNTRIES
  // The countries asked for, with the EU-27 as the reference; two countries (A against B) are treated alike.
  const shown = many ? [] : [...new Set([...geos, 'EU27_2020'])].filter((g) => geoCodes.includes(g))
  const focusGeos = geos.length <= 2 ? geos : geos.slice(0, 1)
  const [history, everyone] = await Promise.all([
    many ? Promise.resolve(null) : fetchEurostatData('nrg_ind_ren', { filters: { nrg_bal: 'REN', unit: 'PC', geo: shown }, lang, signal }),
    fetchEurostatData('nrg_ind_ren', { filters: { nrg_bal: 'REN', unit: 'PC', geo: EU27 }, lastTimePeriod: 4, lang, signal }),
  ])
  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  const target = EU_REN_TARGET_2030
  const source = { code: 'nrg_ind_ren', url: `https://ec.europa.eu/eurostat/databrowser/view/nrg_ind_ren/default/table?lang=${lang}` }
  const widgets: WidgetSpec[] = []
  const name = (code: string, label: string) => (code === 'EU27_2020' ? 'EU-27' : label.replace(/\s*\(.*?\)\s*$/, ''))

  // 1. The gap of every EU country to the target, in percentage points (ahead is positive).
  const times = (everyone.dimensions.time?.codes ?? []).map((t) => t.code).sort()
  const at = (geo: string, t: string) => everyone.observations.find((o) => o.keys.geo === geo && o.keys.time === t)?.value ?? null
  const latest = [...times].reverse().find((t) => EU27.filter((g) => at(g, t) != null).length >= 20)
  if (latest) {
    const rows = EU27.map((g) => ({ name: name(g, everyone.dimensions.geo?.codes.find((c) => c.code === g)?.label ?? g), gap: at(g, latest) == null ? null : Math.round(((at(g, latest) as number) - target) * 10) / 10 }))
      .filter((r): r is { name: string; gap: number } => r.gap != null)
      .sort((a, b) => b.gap - a.gap)
    widgets.push({
      type: 'bar',
      title: `${s.renGap} (${latest})`,
      subtitle: s.renGapNote.replace('{target}', nf.format(target)),
      categories: rows.map((r) => r.name),
      series: [{ name: s.renGap, data: rows.map((r) => r.gap) }],
      horizontal: true,
      unit: 'pp',
      decimals: 1,
      size: 'half',
      source,
      role: 'related',
    })
  }

  // 0. Where it stands: a gauge for each country asked for (one or two: A against B), and one bar per
  // country shown, against the binding 42.5% and the indicative aim of 45% (RED III: 42.5% binding,
  // with 2.5 points more as an aim).
  if (history) {
    const aim = 45
    const year0 = [...(history.dimensions.time?.codes ?? []).map((t) => t.code)].sort().reverse().find((y) => shown.every((g) => history.observations.some((o) => o.keys.geo === g && o.keys.time === y && o.value != null)))
    const label = (g: string) => name(g, history.dimensions.geo?.codes.find((c) => c.code === g)?.label ?? g)
    if (year0) {
      const val = (g: string) => history.observations.find((o) => o.keys.geo === g && o.keys.time === year0)?.value ?? null
      const note = s.renGaugeNote.replace('{target}', nf.format(target)).replace('{aim}', nf.format(aim))
      for (const g of focusGeos) {
        widgets.push({
          type: 'gauge',
          title: s.renGauge,
          goal: 'reach',
          subtitle: note,
          value: val(g) as number,
          label: `${label(g)}, ${year0}`,
          max: 50,
          targets: [{ value: target, label: `${nf.format(target)}%` }, { value: aim, label: '' }],
          unit: '%',
          size: 'half',
          source,
          role: 'related',
        })
      }
      widgets.push({
        type: 'progress',
        title: `${s.renGauge} (${year0})`,
        subtitle: note,
        categories: shown.map(label),
        values: shown.map(val),
        targets: [
          { value: target, label: s.renBinding.replace('{value}', nf.format(target)) },
          { value: aim, label: s.renAim.replace('{value}', nf.format(aim)) },
        ],
        max: 50,
        unit: '%',
        size: focusGeos.length === 2 ? 'full' : 'half',
        source,
        role: 'related',
      })
    }

    // 2. The way there: the share so far, and for each country asked for the straight path from
    // the latest year to the target in 2030, with the pace it needs against the last five years.
    const years = (history.dimensions.time?.codes ?? []).map((t) => t.code).sort().filter((y) => y >= '2010')
    const valueAt = (geo: string, y: string) => history.observations.find((o) => o.keys.geo === geo && o.keys.time === y)?.value ?? null
    const lastOf = (g: string) => [...years].reverse().find((y) => valueAt(g, y) != null)
    if (years.length > 3 && focusGeos.every((g) => lastOf(g))) {
      const categories = [...years, ...Array.from({ length: Math.max(0, 2030 - Number(years[years.length - 1])) }, (_, i) => String(Number(years[years.length - 1]) + i + 1))]
      const series = shown.map((g) => ({ name: label(g), data: categories.map((y) => (years.includes(y) ? valueAt(g, y) : null)) }))
      const pace: string[] = []
      for (const g of focusGeos) {
        const lastYear = lastOf(g) as string
        const last = Number(lastYear)
        const now = valueAt(g, lastYear) as number
        const pathName = s.renPath.replace('{target}', nf.format(target))
        series.push({ name: focusGeos.length > 1 ? `${label(g)}: ${pathName}` : pathName, data: categories.map((y) => (Number(y) < last || Number(y) > 2030 ? null : Math.round((now + ((target - now) * (Number(y) - last)) / Math.max(1, 2030 - last)) * 10) / 10)) })
        const before = valueAt(g, String(last - 5))
        const need = last < 2030 ? (target - now) / (2030 - last) : 0
        const text = now >= target ? s.renPaceReached : before == null ? '' : s.renPace.replace('{need}', nf.format(need)).replace('{year}', lastYear).replace('{recent}', nf.format((now - before) / 5))
        if (text) pace.push(focusGeos.length > 1 ? `${label(g)}: ${text}` : text)
      }
      widgets.push({
        type: 'line',
        title: s.renProgress,
        subtitle: pace.join(' '),
        categories,
        series,
        unit: '%',
        size: 'full',
        role: 'related',
      })
    }
  }
  return widgets
}

/**
 * Energy efficiency against the EU's 2030 levels. Eurostat's own "distance to 2030 target" series
 * give the level (consumption minus its distance to the target), so nothing is written in here:
 * the way from the latest year to 2030 for primary and final energy consumption (and the pace
 * it needs against the last five years), and where each measure stands against its level.
 */
async function buildEfficiencyTarget(plan: Plan, dict: EnergyDictionary, lang: string, s: CompanionStrings, signal?: AbortSignal): Promise<WidgetSpec[]> {
  const geos = list(plan.filters.geo)
  const geoCodes = dict.datasets.nrg_ind_eff?.dimensions.find((d) => d.id === 'geo')?.codes ?? []
  if (!geos.length || !geoCodes.includes(geos[0])) return []
  const focus = geos[0]
  const measures = ['FEC', 'PEC'] as const
  const history = await fetchEurostatData('nrg_ind_eff', { filters: { nrg_bal: ['FEC_EED', 'PEC_EED', 'FEC_DT2030', 'PEC_DT2030'], unit: 'MTOE', geo: focus }, lang, signal })
  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${nf.format(Math.abs(v))}`
  const short = (label: string) => label.split(/\s+-\s+/)[0]
  const widgets: WidgetSpec[] = []

  // 1. The way to 2030 for each measure.
  const years = (history.dimensions.time?.codes ?? []).map((t) => t.code).sort().filter((y) => y >= '2005')
  const at = (code: string, y: string) => history.observations.find((o) => o.keys.nrg_bal === code && o.keys.time === y)?.value ?? null
  const lastYear = [...years].reverse().find((y) => measures.every((m) => at(`${m}_EED`, y) != null && at(`${m}_DT2030`, y) != null))
  if (lastYear && years.length > 3) {
    const last = Number(lastYear)
    const end = Math.max(2030, last)
    const categories = [...years.filter((y) => Number(y) <= last), ...Array.from({ length: end - last }, (_, i) => String(last + i + 1))]
    const series: { name: string; data: (number | null)[] }[] = []
    const pace: string[] = []
    for (const m of measures) {
      const now = at(`${m}_EED`, lastYear) as number
      const target = Math.round((now - (at(`${m}_DT2030`, lastYear) as number)) * 10) / 10
      const name = short(history.dimensions.nrg_bal?.codes.find((c) => c.code === `${m}_EED`)?.label ?? m)
      series.push({ name, data: categories.map((y) => (Number(y) <= last ? at(`${m}_EED`, y) : null)) })
      series.push({ name: s.effPath.replace('{measure}', name).replace('{target}', nf.format(target)), data: categories.map((y) => (Number(y) < last ? null : Math.round((now + ((target - now) * (Number(y) - last)) / Math.max(1, 2030 - last)) * 10) / 10)) })
      const before = at(`${m}_EED`, String(last - 5))
      pace.push(s.effPace.replace('{measure}', name).replace('{need}', signed((target - now) / Math.max(1, 2030 - last))).replace('{year}', lastYear).replace('{target}', nf.format(target)).replace('{recent}', before == null ? '–' : signed((now - before) / 5)))
    }
    // Where each measure stands against its 2030 level: 100% is the level to reach.
    const against = measures.map((m) => {
      const now = at(`${m}_EED`, lastYear) as number
      const target = now - (at(`${m}_DT2030`, lastYear) as number)
      return { name: short(history.dimensions.nrg_bal?.codes.find((c) => c.code === `${m}_EED`)?.label ?? m), pct: target > 0 ? Math.round((now / target) * 1000) / 10 : null }
    })
    if (against.every((x) => x.pct != null)) {
      widgets.push({
        type: 'progress',
        title: `${s.effAgainst} (${lastYear})`,
        subtitle: s.effAgainstNote,
        categories: against.map((x) => x.name),
        values: against.map((x) => x.pct),
        targets: [{ value: 100, label: s.effLevel }],
        unit: '%',
        size: 'half',
        role: 'related',
      })
    }
    widgets.push({ type: 'line', title: s.effProgress, subtitle: pace.join(' '), categories, series, unit: 'Mtoe', size: 'half', role: 'related' })
  }

  // (Eurostat reports the distance to the 2030 levels for the EU as a whole only, so there is no ranking of countries.)
  return widgets
}

// ---------- greenhouse gas emissions and the EU 2030 target ----------

/**
 * Net greenhouse gas emissions (with land use) against the EU's 2030 target, a cut of 55% on 1990
 * (European Climate Law): where each country asked for stands (a gauge, and a bullet chart with the
 * EU-27), the gap of every EU country, and the way there - emissions as an index (1990 = 100) with
 * the straight path to 45 in 2030 and the pace it needs against the last five years. The target is
 * EU-wide, so the countries' gaps are an indication.
 */
async function buildEmissionsTarget(plan: Plan, dict: EnergyDictionary, lang: string, s: CompanionStrings, signal?: AbortSignal): Promise<WidgetSpec[]> {
  const geos = list(plan.filters.geo)
  const geoCodes = dict.datasets.env_air_gge?.dimensions.find((d) => d.id === 'geo')?.codes ?? []
  if (!geos.length || !geos.every((g) => geoCodes.includes(g))) return []
  const many = geos.length > MAX_COUNTRIES
  const shown = many ? [] : [...new Set([...geos, 'EU27_2020'])].filter((g) => geoCodes.includes(g))
  const focusGeos = geos.length <= 2 ? geos : geos.slice(0, 1)
  const all = await fetchEurostatData('env_air_gge', { filters: { airpol: 'GHG', src_crf: 'TOTXMEMO', unit: 'MIO_T', geo: [...new Set([...shown, ...EU27])] }, lang, signal })
  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  const target = EU_GHG_CUT_2030
  const source = { code: 'env_air_gge', url: `https://ec.europa.eu/eurostat/databrowser/view/env_air_gge/default/table?lang=${lang}` }
  const years = (all.dimensions.time?.codes ?? []).map((t) => t.code).sort()
  const value = (g: string, y: string) => all.observations.find((o) => o.keys.geo === g && o.keys.time === y)?.value ?? null
  const label = (g: string) => (g === 'EU27_2020' ? 'EU-27' : (all.dimensions.geo?.codes.find((c) => c.code === g)?.label ?? g).replace(/\s*\(.*?\)\s*$/, ''))
  const index = (g: string, y: string) => {
    const base = value(g, '1990')
    const v = value(g, y)
    return base && v != null ? Math.round((v / base) * 1000) / 10 : null
  }
  const cut = (g: string, y: string) => {
    const i = index(g, y)
    return i == null ? null : Math.round((100 - i) * 10) / 10
  }
  const latestOf = (g: string) => [...years].reverse().find((y) => y > '1990' && index(g, y) != null)
  const widgets: WidgetSpec[] = []
  const name = (g: string) => label(g)

  // 1. The gap of every EU country to the target cut (ahead is positive).
  const year = [...years].reverse().find((y) => EU27.filter((g) => cut(g, y) != null).length >= 20)
  if (year) {
    const rows = EU27.map((g) => ({ name: name(g), gap: cut(g, year) == null ? null : Math.round(((cut(g, year) as number) - target) * 10) / 10 }))
      .filter((r): r is { name: string; gap: number } => r.gap != null)
      .sort((a, b) => b.gap - a.gap)
    widgets.push({
      type: 'bar',
      title: `${s.ghgGap} (${year})`,
      subtitle: s.ghgGapNote.replace('{target}', nf.format(target)),
      categories: rows.map((r) => r.name),
      series: [{ name: s.ghgGap, data: rows.map((r) => r.gap) }],
      horizontal: true,
      unit: 'pp',
      decimals: 1,
      size: 'half',
      source,
      role: 'related',
    })
  }
  if (many) return widgets

  // 0. Where each country asked for stands: a gauge each (one or two: A against B), and a bullet
  // chart of all shown against the target cut.
  const note = s.ghgGaugeNote.replace('{target}', nf.format(target))
  for (const g of focusGeos) {
    const y = latestOf(g)
    const v = y ? cut(g, y) : null
    if (!y || v == null) continue
    widgets.push({ type: 'gauge', goal: 'stay-under', title: s.ghgGauge, subtitle: note, value: Math.max(0, v), label: `${label(g)}, ${y}`, max: 70, targets: [{ value: target, label: s.ghgMark.replace('{value}', nf.format(target)) }], unit: '%', size: 'half', source, role: 'related' })
  }
  const common = [...years].reverse().find((y) => y > '1990' && shown.every((g) => cut(g, y) != null))
  if (common) {
    widgets.push({
      type: 'progress',
      title: `${s.ghgGauge} (${common})`,
      subtitle: note,
      categories: shown.map(label),
      values: shown.map((g) => cut(g, common)),
      targets: [{ value: target, label: s.ghgMark.replace('{value}', nf.format(target)) }],
      max: 70,
      unit: '%',
      size: focusGeos.length === 2 ? 'full' : 'half',
      source,
      role: 'related',
    })
  }

  // 2. The way there: the index (1990 = 100) and the straight path to 45 in 2030 for each country asked for.
  const upTo = years.filter((y) => y >= '1990')
  const lastYear = upTo[upTo.length - 1]
  if (upTo.length > 5 && focusGeos.every((g) => latestOf(g))) {
    const categories = [...upTo, ...Array.from({ length: Math.max(0, 2030 - Number(lastYear)) }, (_, i) => String(Number(lastYear) + i + 1))]
    const series = shown.map((g) => ({ name: label(g), data: categories.map((y) => (upTo.includes(y) ? index(g, y) : null)) }))
    const aim = 100 - target
    const pace: string[] = []
    for (const g of focusGeos) {
      const y = latestOf(g) as string
      const last = Number(y)
      const now = index(g, y) as number
      const pathName = s.ghgPath.replace('{value}', nf.format(aim))
      series.push({ name: focusGeos.length > 1 ? `${label(g)}: ${pathName}` : pathName, data: categories.map((c) => (Number(c) < last || Number(c) > 2030 ? null : Math.round((now + ((aim - now) * (Number(c) - last)) / Math.max(1, 2030 - last)) * 10) / 10)) })
      const before = index(g, String(last - 5))
      const text = now <= aim ? s.ghgReached : before == null ? '' : s.ghgPace.replace('{need}', nf.format((aim - now) / Math.max(1, 2030 - last))).replace('{year}', y).replace('{recent}', nf.format((now - before) / 5))
      if (text) pace.push(focusGeos.length > 1 ? `${label(g)}: ${text}` : text)
    }
    widgets.push({ type: 'line', title: s.ghgProgress, subtitle: pace.join(' '), categories, series, size: 'full', role: 'related' })
  }
  return widgets
}

// ---------- the big picture: several countries on three indicators ----------

// Three official indicators, for the same countries and year: where each country stands.
const BUBBLE = {
  x: { dataset: 'nrg_ind_id', filters: { siec: 'TOTAL', unit: 'PC' }, unit: '%' },
  y: { dataset: 'nrg_ind_ren', filters: { nrg_bal: 'REN', unit: 'PC' }, unit: '%' },
  z: { dataset: 'nrg_ind_esc', filters: { siec: 'TOTAL', nrg_bal: 'FC_E', unit: 'KGOE_HAB' }, unit: 'kgoe' },
} as const
// Prices and living conditions are not about how a country gets its energy: no bubble there.
const NO_BUBBLE = /^(nrg_pc_|ilc_)/

/** Whether a dashboard gets the bubble chart, and for which countries (two-letter codes). */
export function bubbleCountries(plan: Plan, dict: EnergyDictionary): string[] | null {
  if (NO_BUBBLE.test(plan.dataset)) return null
  const countries = list(plan.filters.geo).filter((c) => /^[A-Z]{2}$/.test(c))
  if (countries.length < 3) return null // two countries are two dots, not a picture
  const has = (dataset: string) => new Set(dict.datasets[dataset]?.dimensions.find((d) => d.id === 'geo')?.codes ?? [])
  const all = [BUBBLE.x, BUBBLE.y, BUBBLE.z].map((i) => has(i.dataset))
  const shared = countries.filter((c) => all.every((set) => set.has(c)))
  return shared.length >= 3 ? shared : null
}

/**
 * Import dependency (x) against the renewable share (y), each bubble sized by final energy
 * consumption per person, for the dashboard's countries in one year: import-dependent countries
 * with little renewable energy sit bottom right. Dashed lines at the EU-27 values split it into
 * quadrants. Left out when fewer than three countries have all three values in a common year.
 */
async function buildBubble(plan: Plan, dict: EnergyDictionary, lang: string, s: CompanionStrings, year: string | undefined, signal?: AbortSignal): Promise<WidgetSpec | null> {
  const countries = bubbleCountries(plan, dict)
  if (!countries) return null
  const geo = [...countries, 'EU27_2020']
  const [x, y, z] = await Promise.all(
    [BUBBLE.x, BUBBLE.y, BUBBLE.z].map((i) =>
      fetchEurostatData(i.dataset, {
        filters: { ...i.filters, geo },
        ...(year ? { sinceTimePeriod: year, untilTimePeriod: year } : { lastTimePeriod: 4 }),
        lang,
        signal,
      }),
    ),
  )
  const at = (r: EurostatResult, geoCode: string, time: string) => r.observations.find((o) => o.keys.geo === geoCode && o.keys.time === time)?.value ?? null
  const years = [...new Set((x.dimensions.time?.codes ?? []).map((t) => t.code))].sort().reverse()
  const complete = (t: string) => countries.filter((c) => [x, y, z].every((r) => at(r, c, t) != null))
  const time = years.find((t) => complete(t).length >= 3)
  if (!time) return null
  const names = new Map((x.dimensions.geo?.codes ?? []).map((g) => [g.code, g.label.replace(/\s*\(.*?\)\s*$/, '')]))
  const points = complete(time).map((c) => ({ name: names.get(c) ?? c, x: at(x, c, time)!, y: at(y, c, time)!, z: at(z, c, time)! }))
  // Countries without all three values that year: named under the chart.
  const missing = countries.filter((c) => !complete(time).includes(c)).map((c) => names.get(c) ?? c)
  const euX = at(x, 'EU27_2020', time)
  const euY = at(y, 'EU27_2020', time)
  const label = x.dimensions.time?.codes.find((t) => t.code === time)?.label ?? time
  return {
    type: 'bubble',
    title: s.bubble.replace('{period}', label),
    points,
    x: { label: s.bubbleX, unit: BUBBLE.x.unit },
    y: { label: s.bubbleY, unit: BUBBLE.y.unit },
    z: { label: s.bubbleZ, unit: s.perPerson },
    ...(euX != null || euY != null ? { reference: { ...(euX != null ? { x: euX } : {}), ...(euY != null ? { y: euY } : {}), label: 'EU-27' } } : {}),
    ...(missing.length ? { note: s.noDataFor.replace('{names}', missing.join(', ')) } : {}),
    size: 'full',
    source: { code: `${BUBBLE.x.dataset}, ${BUBBLE.y.dataset}, ${BUBBLE.z.dataset}`, url: `https://ec.europa.eu/eurostat/databrowser/view/${BUBBLE.x.dataset}/default/table?lang=${lang}` },
    role: 'related',
  }
}

export function toWidget(c: Companion, result: EurostatResult, lang: string, format: (v: number) => string): WidgetSpec | WidgetSpec[] | null {
  const codes = result.dimensions[c.dim]?.codes ?? []
  const times = result.dimensions.time?.codes ?? []
  const places = Array.isArray(c.filters.geo) ? (result.dimensions.geo?.codes ?? []) : []
  if (places.length > 1) return compareCountries(c, result, lang, places)
  const value = (code: string, time: string) => {
    const found = result.observations.filter((o) => o.keys[c.dim] === code && o.keys.time === time && o.value != null)
    if (!c.sum) return result.observations.find((o) => o.keys[c.dim] === code && o.keys.time === time)?.value ?? null
    return found.length ? found.reduce((n, o) => n + (o.value as number), 0) : null
  }
  // The latest period where most codes have a value.
  const time = [...times].reverse().find((t) => codes.filter((k) => value(k.code, t.code) != null).length >= Math.max(2, Math.ceil(codes.length / 2)))
  if (!time) return null
  if (c.priceSplit) {
    const labelOf = (code: string) => shortLabel(codes.find((k) => k.code === code)?.label ?? code)
    const partsAt = (t: string) => {
      const v = (code: string) => value(code, t) ?? 0
      const other = v('TAX_FEE_LEV_CHRG') - v('VAT') - v('TAX_FEE_LEV_CHRG_ALLOW')
      return [
        { name: labelOf('NRG_SUP'), y: v('NRG_SUP') },
        { name: labelOf('NETC'), y: v('NETC') },
        { name: c.priceSplit!.otherTaxes, y: Math.round(other * 10000) / 10000 },
        { name: labelOf('VAT'), y: v('VAT') },
      ]
    }
    const rows = partsAt(time.code).filter((x) => x.y > 0)
    if (rows.length < 2) return null
    const total = rows.reduce((n, x) => n + x.y, 0)
    const source = sourceOf(c, lang)
    const pie: WidgetSpec = { type: 'pie', title: c.title.replace('{period}', time.label), slices: rows, centerLabel: format(total), size: 'half', source, role: 'price' }
    // The parts over the years with data, stacked: how the price and what it is made of changed.
    const years = times.filter((t) => value('NRG_SUP', t.code) != null && t.code <= time.code)
    if (years.length < 3) return pie
    const names = rows.map((x) => x.name)
    const byYear = years.map((t) => partsAt(t.code))
    const stacked: WidgetSpec = {
      type: 'bar',
      title: c.priceSplit.overTime,
      categories: years.map((t) => t.label),
      series: names.map((name) => ({ name, data: byYear.map((parts) => Math.max(0, parts.find((x) => x.name === name)?.y ?? 0)) })),
      stacked: true,
      size: 'half',
      source,
      role: 'price',
    }
    return [pie, stacked]
  }
  let rows = codes
    .filter((k) => (c.codes === 'partners' ? /^[A-Z]{2}$/.test(k.code) && k.code !== 'EU' : true))
    .map((k) => ({ name: c.dim === 'nrg_bal' || c.dim === 'nrg_prc' ? shortLabel(k.label) : k.label.replace(/\s*\(.*?\)\s*$/, ''), y: value(k.code, time.code) }))
    .filter((x): x is { name: string; y: number } => x.y != null && x.y > 0)
    .sort((a, b) => b.y - a.y)
  if (c.rank) rows = rows.slice(0, c.rank)
  if (c.top && rows.length > c.top) {
    const rest = rows.slice(c.top - 1).reduce((n, x) => n + x.y, 0)
    rows = [...rows.slice(0, c.top - 1), { name: lang === 'de' ? 'Andere' : lang === 'fr' ? 'Autres' : 'Others', y: rest }]
  }
  if (rows.length < 2) return null
  const title = c.title.replace('{period}', time.label)
  const source = sourceOf(c, lang)
  if (c.view === 'pie') {
    const total = rows.reduce((n, x) => n + x.y, 0)
    return { type: 'pie', title, slices: rows, centerLabel: format(total), size: 'half', source, ...(c.unit ? { unit: c.unit } : {}) }
  }
  return {
    type: 'bar',
    title,
    categories: rows.map((x) => x.name),
    series: [{ name: title, data: rows.map((x) => x.y) }],
    horizontal: true,
    size: 'half',
    source,
    ...(c.unit ? { unit: c.unit } : {}),
  }
}

/**
 * A companion for several countries: one bar per country. Parts of a whole (the pie views:
 * sectors, plant types, operators) as 100% stacked bars, so countries of any size compare;
 * separate measures (shares by sector, gross and net) side by side; one measure (the renewable
 * share) as a ranking with its reference line.
 */
function compareCountries(c: Companion, result: EurostatResult, lang: string, places: { code: string; label: string }[]): WidgetSpec | null {
  const codes = (result.dimensions[c.dim]?.codes ?? []).filter((k) => (Array.isArray(c.codes) ? c.codes.includes(k.code) : false))
  const times = result.dimensions.time?.codes ?? []
  const value = (geo: string, code: string, time: string) => {
    if (!c.sum) return result.observations.find((o) => o.keys.geo === geo && o.keys[c.dim] === code && o.keys.time === time)?.value ?? null
    const found = result.observations.filter((o) => o.keys.geo === geo && o.keys[c.dim] === code && o.keys.time === time && o.value != null)
    return found.length ? found.reduce((n, o) => n + (o.value as number), 0) : null
  }
  // The latest period where most countries have every part.
  // (A mix of many parts: a part a country does not report is zero, so a few parts are enough.)
  const enough = c.view === 'pie' && codes.length > 6 ? 3 : codes.length
  const complete = (t: string) => places.filter((p) => codes.filter((k) => value(p.code, k.code, t) != null).length >= enough).length
  const time = [...times].reverse().find((t) => complete(t.code) >= Math.max(2, Math.ceil(places.length / 2)))
  if (!time || !codes.length) return null
  const shown = places.filter((p) => codes.some((k) => value(p.code, k.code, time.code) != null))
  const placeName = (p: { code: string; label: string }) => (p.code === 'EU27_2020' ? 'EU-27' : p.label.replace(/\s*\(.*?\)\s*$/, ''))
  const partName = (k: { label: string }) => (c.dim === 'nrg_bal' || c.dim === 'nrg_prc' ? shortLabel(k.label) : k.label.replace(/\s*\(.*?\)\s*$/, ''))
  const title = c.title.replace('{period}', time.label)
  const source = sourceOf(c, lang)
  const unit = c.unit ? { unit: c.unit } : {}
  // Two measures per country joined (net → gross): the gap is the message.
  if (c.view === 'dumbbell' && codes.length === 2) {
    const [a, b] = Array.isArray(c.codes) ? c.codes.map((code) => codes.find((k) => k.code === code)!) : codes
    const rows = shown
      .map((p) => ({ name: placeName(p), a: value(p.code, a.code, time.code), b: value(p.code, b.code, time.code) }))
      .sort((x, y) => (y.b ?? 0) - (x.b ?? 0))
    return {
      type: 'dumbbell', title, categories: rows.map((r) => r.name),
      from: { name: partName(a), data: rows.map((r) => r.a) }, to: { name: partName(b), data: rows.map((r) => r.b) },
      size: 'half', source, ...unit, role: 'related',
    }
  }
  if (codes.length === 1) {
    const ranked = shown.map((p) => ({ name: placeName(p), y: value(p.code, codes[0].code, time.code) })).sort((a, b) => (b.y ?? 0) - (a.y ?? 0))
    return {
      type: 'bar', title, categories: ranked.map((x) => x.name), series: [{ name: partName(codes[0]), data: ranked.map((x) => x.y) }],
      horizontal: true, size: 'half', source, ...unit, ...(c.reference ? { reference: c.reference } : {}), role: 'related',
    }
  }
  let series = codes.map((k) => ({ name: partName(k), data: shown.map((p) => value(p.code, k.code, time.code)) }))
  let order = shown.map((_, i) => i)
  if (c.view === 'pie') {
    const sum = (d: (number | null)[]) => d.reduce<number>((n, v) => n + (v ?? 0), 0)
    // More parts than colours: the five largest overall, the rest as "Other".
    if (series.length > 6) {
      series = [...series].sort((x, y) => sum(y.data) - sum(x.data))
      const rest = series.slice(5)
      series = [...series.slice(0, 5), { name: lang === 'de' ? 'Andere' : lang === 'fr' ? 'Autres' : 'Other', data: shown.map((_, i) => (rest.every((r) => r.data[i] == null) ? null : rest.reduce((n, r) => n + (r.data[i] ?? 0), 0))) }]
    }
    // Many countries: the EU-27 first, then by the share of the largest part.
    const share = (i: number) => (series[0].data[i] ?? 0) / (series.reduce((n, x) => n + (x.data[i] ?? 0), 0) || 1)
    if (shown.length > 6) order = order.sort((x, y) => (shown[x].code === 'EU27_2020' ? -1 : 0) - (shown[y].code === 'EU27_2020' ? -1 : 0) || share(y) - share(x))
  }
  return {
    type: 'bar',
    title,
    categories: order.map((i) => placeName(shown[i])),
    series: series.map((x) => ({ name: x.name, data: order.map((i) => x.data[i]) })),
    horizontal: c.view === 'pie',
    ...(c.view === 'pie' ? { stacked: 'percent' as const } : {}),
    size: 'half',
    source,
    ...unit,
    role: 'related',
  }
}

const sourceOf = (c: Companion, lang: string) => ({ code: c.dataset, url: `https://ec.europa.eu/eurostat/databrowser/view/${c.dataset}/default/table?lang=${lang}` })
