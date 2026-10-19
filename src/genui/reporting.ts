import { fetchEurostatData, type EnergyCodelists, type EnergyDictionary, type EurostatResult } from '../data/eurostat'
import type { Strings } from '../i18n'
import { NoDataError } from './execute'
import { detectGeos, parse } from './planner/parse'
import { compareChoice, placeNameOf, withVersus } from './compareControl'
import { compareRequest } from './comparing'
import { reportingTabByWords } from './customWords'
import { NATIONAL_FEC_2030, NATIONAL_PEC_2030 } from './nationalTargets'
import { fill, labelOf, minus, sumSeries, valuesOf, yearsOf, type Ask, type Series } from './renewables'
import type { DashboardSpec, Insight, KpiSpec, Plan, ReportingTab, Suggestion, WidgetSpec } from './types'
import { sanitizeSpec } from './validate'

/**
 * The progress dashboards of the national energy and climate plans, five tabs in one dashboard:
 *   efficiency       final and primary energy consumption against the EU 2030 ceilings, and by end-use sector
 *   diversification  gross available energy by fuel: how spread the supply is
 *   dependence       dependence on third countries, by fuel, and the imports behind it
 *   poverty          EU-SILC indicators: homes not kept warm, arrears on utility bills, dwellings in poor repair
 *   prices           household electricity and gas prices, with and without taxes
 * Every number is Eurostat's (nrg_ind_eff, nrg_bal_c, nrg_ind_id3cf, ilc_mdes01, ilc_mdes07, ilc_mdho01, nrg_pc_204,
 * nrg_pc_202). The 2030 ceilings are the EU's (Directive (EU) 2023/1791); national ones are not in Eurostat's data.
 */

export const REPORTING_TABS: ReportingTab[] = ['efficiency', 'diversification', 'dependence', 'poverty', 'prices']
export type ReportingFrom = 'all' | '2010' | '2020'
const EU = 'EU27_2020'
const DATASETS: Record<ReportingTab, string> = { efficiency: 'nrg_ind_eff', diversification: 'nrg_ind_id', dependence: 'nrg_ind_id', poverty: 'ilc_mdes01', prices: 'nrg_pc_204' }
/** EU 2030 ceilings in Mtoe (Directive (EU) 2023/1791): final and primary energy consumption. */
const CEILING = { fec: 763, pec: 992.5 }
const MEMBERS = ['BE', 'BG', 'CZ', 'DK', 'DE', 'EE', 'IE', 'EL', 'ES', 'FR', 'HR', 'IT', 'CY', 'LV', 'LT', 'LU', 'HU', 'MT', 'NL', 'AT', 'PL', 'PT', 'RO', 'SI', 'SK', 'FI', 'SE']

// ---------- questions ----------

const TAB_RE: [ReportingTab, RegExp][] = [
  ['efficiency', / (energy efficiency (dashboard|overview|scorecard|progress|trajectory|contribution|targets? dashboard)|efficiency (dashboard|overview|scorecard|trajectory)|indicative trajectory|national (energy )?(efficiency )?contribution|final energy consumption by (end use |end-use )?sector|energieeffizienz (dashboard|ubersicht|verlauf)|effizienz (dashboard|ubersicht)|efficacite energetique (tableau de bord|apercu)|tableau de bord (de l )?efficacite)/],
  ['dependence', / (energy dependen\w* (on|from) third countries|dependen\w* (on|from) third countries|third countr\w* dependen\w*|dependence by fuel|import dependen\w* by fuel|abhangigkeit von drittlandern|energieabhangigkeit (nach|von drittlandern)|dependance (energetique )?(vis a vis|envers|des) pays tiers|dependance aux pays tiers)/],
  ['diversification', / (energy security (dashboard|overview|scorecard|indicators)|security of supply (dashboard|overview)|diversification of (energy )?(sources|supply|the energy mix)|supply diversification|energy supply diversification|versorgungssicherheit (dashboard|ubersicht)|diversifizierung der (energie)?(quellen|versorgung)|securite (energetique|d approvisionnement) (tableau de bord|apercu)|diversification (des sources|de l approvisionnement)|energy security dashboard)/],
  ['poverty', / (energy poverty (dashboard|overview|indicators|scorecard|statistics|in)|indicators of energy poverty|inability to keep (the |a )?(home|house|dwelling) (adequately )?warm|arrears on (energy |utility )?bills|(energy|utility) bills? arrears|energiearmut (dashboard|ubersicht|indikatoren)|precarite energetique (tableau de bord|indicateurs)|energiearmut in)/],
  ['prices', / (energy poverty (household )?(energy )?prices|prices (for|in) energy poverty|energiearmut (haushalts)?(energie)?preise|haushaltspreise energiearmut|precarite energetique (prix|tarifs)|prix (de la )?precarite energetique)/],
]
const DEFINITION = /^ (what is|what are|define|was ist|qu est ce)\b/
const FROM_WORDS: [ReportingFrom, RegExp][] = [
  ['2020', / (since|from|ab|seit|depuis|des) (the )?(year )?2020 /],
  ['2010', / (since|from|ab|seit|depuis|des) (the )?(year )?2010 /],
  ['all', / (all years|every year|full period|alle jahre|toutes les annees) /],
]
const tabOf = (text: string): ReportingTab | undefined => TAB_RE.find(([, re]) => re.test(text))?.[0]
const SHORT: [ReportingTab, RegExp][] = [
  ['efficiency', / (efficiency|effizienz|efficacite|consumption|verbrauch|consommation)\b/],
  ['dependence', / (dependence|dependency|abhangigkeit|dependance|imports?|importe?)\b/],
  ['diversification', / (diversification|security|sicherheit|securite|mix)\b/],
  ['poverty', / (poverty|armut|precarite|indicators|indikatoren|indicateurs)\b/],
  ['prices', / (prices?|preise|prix|tariffs?)\b/],
]

/** The progress dashboard a question asks for ("energy efficiency dashboard", "energy dependence on third countries in Italy"), or null. */
export function reportingPlan(text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  const p = parse(text.replace(/[-–,?&]/g, ' '))
  const places = detectGeos(p, codelists)
  const tab = tabOf(p.text) ?? reportingTabByWords(p.text, places.codes.length > 0 || places.eu)
  if (!tab || (DEFINITION.test(p.text) && !(places.codes.length || places.eu)) || !dict.datasets[DATASETS[tab]]) return null
  const geos = dict.datasets[DATASETS[tab]].dimensions.find((d) => d.id === 'geo')?.codes ?? []
  const geo = places.codes.find((c) => geos.includes(c)) ?? EU
  const from = FROM_WORDS.find(([, re]) => re.test(p.text))?.[0]
  return { dataset: DATASETS[tab], filters: { geo }, time: { kind: 'all' }, intent: 'snapshot', reporting: { tab, ...(from && from !== 'all' ? { from } : {}) } }
}

/** "prices", "and France?", "since 2020": a change of the progress dashboard on screen. */
export function refineReporting(current: Plan, text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  if (!current.reporting || !dict.datasets[DATASETS[current.reporting.tab]]) return null
  const p = parse(text.replace(/[-–,?&]/g, ' '))
  const places = detectGeos(p, codelists)
  const geo = places.codes.find((c) => MEMBERS.includes(c) || ['NO', 'IS', 'UK', 'TR'].includes(c)) ?? (places.eu ? EU : undefined)
  const asked = compareRequest(p.text, places, [EU, ...MEMBERS, 'NO', 'IS', 'UK', 'TR'], String(current.filters.geo ?? EU), false)
  if (asked && 'off' in asked) return current.reporting.compare ? { ...current, reporting: { ...current.reporting, compare: undefined }, notes: [] } : null
  if (asked) return { ...current, reporting: { ...current.reporting, compare: asked.target }, notes: [] }
  const tab = tabOf(p.text) ?? reportingTabByWords(p.text, true) ?? SHORT.find(([, re]) => re.test(p.text))?.[0]
  const from = FROM_WORDS.find(([, re]) => re.test(p.text))?.[0]
  const rest = p.words.filter((w) => !/^(and|und|et|in|im|en|au|for|fur|pour|of|von|de|du|the|la|le|das|die|der|what|about|show|zeige|montre|now|jetzt|maintenant|energy|energie\w*|since|from|seit|depuis|year|only|nur|zeigen|anzeigen|afficher)$/.test(w) && !/^\d{4}$/.test(w))
  const known = rest.every((w) => SHORT.some(([, re]) => re.test(` ${w} `)) || detectGeos(parse(w), codelists).codes.length > 0 || detectGeos(parse(w), codelists).eu)
  if (!(geo || tab || from) || !known) return null
  const r = current.reporting
  const nextTab = tab ?? r.tab
  const fromNext = from ?? r.from
  return { ...current, dataset: DATASETS[nextTab], filters: { ...current.filters, ...(geo ? { geo } : {}) }, reporting: { tab: nextTab, ...(r.compare && r.compare !== (geo ?? current.filters.geo) ? { compare: r.compare } : {}), ...(fromNext && fromNext !== 'all' ? { from: fromNext } : {}) }, notes: [] }
}

// ---------- the data of each tab ----------

type Line = { name: string; data: (number | null)[] }
const lines = (years: string[], parts: { name: string; values: Series | undefined }[]): Line[] => parts.filter((x) => x.values?.size).map((x) => ({ name: x.name, data: years.map((y) => x.values!.get(y) ?? null) }))
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d
const last = (s: Series | undefined) => {
  const y = [...(s?.keys() ?? [])].sort().at(-1)
  return y ? { y, v: s!.get(y)! } : null
}
const stripEu = (name: string) => name.replace(/\s*\(.*?\)\s*$/, '')

export type ReportingStrings = Strings['reporting']

export async function buildReportingDashboard(plan: Plan, dict: EnergyDictionary, lang: string, s: { reporting: ReportingStrings; sugExplain: string }, signal?: AbortSignal): Promise<DashboardSpec> {
  const t = s.reporting
  const tab = plan.reporting?.tab ?? 'efficiency'
  if (!dict.datasets[DATASETS[tab]]) throw new NoDataError(DATASETS[tab])
  const from = plan.reporting?.from ?? 'all'
  const compareGeo = plan.reporting?.compare && plan.reporting.compare !== String(plan.filters.geo ?? EU) ? plan.reporting.compare : undefined
  const geo = String(plan.filters.geo ?? EU)
  const since = from === 'all' ? '2005' : from
  const ask: Ask = (dataset, filters, sinceYear) =>
    fetchEurostatData(dataset, { filters, lang, signal, ...(sinceYear ? { sinceTimePeriod: sinceYear } : {}) }).catch(() => null) as Promise<EurostatResult | null>
  const nf = (d: number) => new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d })
  const num = (v: number, d = 1) => nf(d).format(v)
  const widgets: WidgetSpec[] = []
  const kpis: KpiSpec[] = []
  const insights: Insight[] = []
  const summary: string[] = []
  const notes: string[] = []
  const geoLabel = async (r: EurostatResult | null) => (geo === EU ? t.eu : stripEu(labelOf(r, 'geo', geo) || geo))
  let geoName = geo === EU ? t.eu : geo
  let source: { code: string; title: string }

  if (tab === 'efficiency') {
    const [r, sec] = await Promise.all([
      ask('nrg_ind_eff', { geo, unit: 'MTOE', nrg_bal: ['FEC_EED', 'PEC_EED', 'FEC_DT2030', 'PEC_DT2030'] }, since),
      ask('nrg_bal_c', { geo, siec: 'TOTAL', unit: 'KTOE', nrg_bal: ['FC_IND_E', 'FC_TRA_E', 'FC_OTH_HH_E', 'FC_OTH_CP_E', 'FC_OTH_AF_E', 'FC_OTH_FISH_E', 'FC_OTH_NSP_E'] }, since),
    ])
    if (!r) throw new NoDataError('nrg_ind_eff')
    geoName = await geoLabel(r)
    source = { code: 'nrg_ind_eff', title: r.label }
    const v = valuesOf(r, (k) => k.nrg_bal)
    const fec = v.get('FEC_EED')
    const pec = v.get('PEC_EED')
    if (!fec?.size && !pec?.size) throw new NoDataError('nrg_ind_eff')
    const years = yearsOf([...(fec ? [fec] : []), ...(pec ? [pec] : [])])
    const lastY = years.at(-1)!
    const euLevel = geo === EU
    // A ceiling for final energy: the EU's, or the country's indicative contribution (primary energy has the EU's only).
    const fecCeiling = euLevel ? CEILING.fec : NATIONAL_FEC_2030[geo]
    const pecCeiling = euLevel ? CEILING.pec : NATIONAL_PEC_2030[geo]
    const ceilings = { fec: fecCeiling, pec: pecCeiling }
    const axis = fecCeiling != null ? Array.from({ length: 2030 - Number(years[0]) + 1 }, (_, i) => String(Number(years[0]) + i)) : years
    const path = (series: Series | undefined, ceiling: number) => {
      const base = series?.get('2020')
      return base == null ? null : axis.map((y) => (Number(y) >= 2020 ? round(base + ((ceiling - base) * (Number(y) - 2020)) / 10) : null))
    }
    const one = (key: 'fec' | 'pec', series: Series | undefined, title: string, name: string) => {
      if (!series?.size) return
      const p = ceilings[key] != null ? path(series, ceilings[key]!) : null
      widgets.push({
        type: 'line',
        title,
        subtitle: `${geoName} · Mtoe`,
        categories: axis,
        series: [{ name, data: axis.map((y) => (Number(y) <= Number(lastY) ? (series.get(y) ?? null) : null)) }, ...(p ? [{ name: t.path, data: p }] : [])],
        highlight: lastY,
        unit: 'Mtoe',
        size: 'half',
        role: 'headline',
      })
    }
    one('fec', fec, t.chartFec, t.fec)
    one('pec', pec, t.chartPec, t.pec)
    if (fecCeiling != null && fec?.has(lastY)) widgets.push({ type: 'gauge', title: euLevel ? t.gaugeFec : t.gaugeFecNat, subtitle: t.gaugeSub, value: round(fec.get(lastY)!, euLevel ? 0 : 1), label: `${geoName}, ${lastY}`, max: Math.ceil(Math.max(fecCeiling, fec.get(lastY)!) * 1.3), targets: [{ value: fecCeiling, label: `${fecCeiling}` }], goal: 'stay-under', unit: 'Mtoe', size: 'half', role: 'headline' })
    if (pecCeiling != null && pec?.has(lastY)) widgets.push({ type: 'gauge', title: euLevel ? t.gaugePec : t.gaugePecNat, subtitle: t.gaugeSub, value: round(pec.get(lastY)!, euLevel ? 0 : 1), label: `${geoName}, ${lastY}`, max: Math.ceil(Math.max(pecCeiling, pec.get(lastY)!) * 1.3), targets: [{ value: pecCeiling, label: `${pecCeiling}` }], goal: 'stay-under', unit: 'Mtoe', size: 'half', role: 'headline' })
    // Final energy consumption by end-use sector.
    const sv = valuesOf(sec, (k) => k.nrg_bal)
    const g = (codes: string[]) => sumSeries(codes.map((c) => sv.get(c)), 1000)
    const sectors = [
      { name: t.sectors.industry, values: g(['FC_IND_E']) },
      { name: t.sectors.transport, values: g(['FC_TRA_E']) },
      { name: t.sectors.households, values: g(['FC_OTH_HH_E']) },
      { name: t.sectors.services, values: g(['FC_OTH_CP_E']) },
      { name: t.sectors.agriculture, values: g(['FC_OTH_AF_E', 'FC_OTH_FISH_E']) },
      { name: t.sectors.other, values: g(['FC_OTH_NSP_E']) },
    ].filter((x) => x.values.size && [...x.values.values()].some((n) => n > 0))
    const secYears = yearsOf(sectors.map((x) => x.values))
    if (sectors.length) {
      widgets.push({ type: 'bar', title: t.sectorsTitle, subtitle: `${geoName} · Mtoe`, categories: secYears, series: lines(secYears, sectors).map((x) => ({ ...x, data: x.data.map((n) => (n == null ? null : round(n, 1))) })), stacked: true, unit: 'Mtoe', decimals: 1, size: 'full', role: 'composition' })
      const top = [...sectors].sort((a, b) => (b.values.get(secYears.at(-1)!) ?? 0) - (a.values.get(secYears.at(-1)!) ?? 0))[0]
      const tot = sectors.reduce((a, x) => a + (x.values.get(secYears.at(-1)!) ?? 0), 0)
      if (tot > 0) insights.push({ tone: 'neutral', parts: [fill(t.insTop, { name: top.name.toLowerCase(), share: `${num((100 * (top.values.get(secYears.at(-1)!) ?? 0)) / tot)}%`, year: secYears.at(-1)! })] })
    }
    // Key figures, summary, insights.
    const stat = (series: Series | undefined, label: string, dt?: Series) => {
      const l = last(series)
      if (!l) return
      const prev = series!.get(String(Number(l.y) - 1))
      const base = series!.get('2005')
      const gap = dt?.get(l.y)
      kpis.push({ label, value: round(l.v, 0), unit: 'Mtoe', decimals: 0, caption: l.y, goodDirection: 'down', ...(prev != null ? { delta: round(((l.v - prev) / prev) * 100), deltaUnit: '%', deltaLabel: String(Number(l.y) - 1) } : {}), trend: years.map((y) => series!.get(y) ?? null) })
      if (base != null && l.y !== '2005') kpis.push({ label: fill(t.kpiSince, { label: label.toLowerCase(), year: '2005' }), value: round(((l.v - base) / base) * 100), unit: '%', decimals: 1, goodDirection: 'down' })
      if (gap != null && euLevel) kpis.push({ label: fill(t.kpiGap, { label: label.toLowerCase() }), value: round(gap, 0), unit: 'Mtoe', decimals: 0, caption: l.y, goodDirection: 'down' })
    }
    stat(fec, t.fec, v.get('FEC_DT2030'))
    stat(pec, t.pec, v.get('PEC_DT2030'))
    if (!euLevel && fecCeiling != null && last(fec)) kpis.push({ label: fill(t.kpiGap, { label: t.fec.toLowerCase() }), value: round(last(fec)!.v - fecCeiling, 1), unit: 'Mtoe', decimals: 1, caption: last(fec)!.y, goodDirection: 'down' })
    const fl = last(fec)
    const pl = last(pec)
    if (fl && pl) summary.push(fill(t.sumEff, { geo: geoName, year: fl.y, fec: `${num(fl.v, 0)} Mtoe`, pec: `${num(pl.v, 0)} Mtoe` }))
    if (fecCeiling != null && fl) {
      const gap = fl.v - fecCeiling
      insights.push({ tone: gap > 0 ? 'down' : 'up', parts: [fill(gap > 0 ? t.insAbove : t.insBelow, { label: t.fec.toLowerCase(), gap: `${num(Math.abs(gap), euLevel ? 0 : 1)} Mtoe`, ceiling: `${num(fecCeiling, euLevel ? 1 : 2)} Mtoe`, who: euLevel ? t.whoEu : geoName })] })
      const b = fec?.get('2020')
      if (b != null && Number(fl.y) > 2020) insights.push({ tone: fl.v < b ? 'up' : 'down', parts: [fill(t.insNeedCut, { pct: `${num(Math.max(((fl.v - fecCeiling) / (Number(2030) - Number(fl.y))) / fl.v * 100, 0), 1)}%`, year: fl.y })] })
    }
    notes.push(t.noteEff, euLevel ? t.noteCeiling : fecCeiling != null ? t.noteNational : t.noteNoCeiling)
    widgets.push({
      type: 'table',
      title: t.tableAll,
      columns: years,
      rows: [
        ...(fec ? [{ label: `${t.fec} (Mtoe)`, values: years.map((y) => fec.get(y) ?? null) }] : []),
        ...(pec ? [{ label: `${t.pec} (Mtoe)`, values: years.map((y) => pec.get(y) ?? null) }] : []),
        ...(euLevel ? [{ label: `${t.fec}: ${t.distance} (Mtoe)`, values: years.map((y) => v.get('FEC_DT2030')?.get(y) ?? null) }, { label: `${t.pec}: ${t.distance} (Mtoe)`, values: years.map((y) => v.get('PEC_DT2030')?.get(y) ?? null) }] : []),
        ...sectors.map((x) => ({ label: `${x.name} (Mtoe)`, values: years.map((y) => (x.values.has(y) ? round(x.values.get(y)!, 2) : null)) })),
      ],
    })
  } else if (tab === 'diversification' || tab === 'dependence') {
    const FUELS = [
      { key: 'solid', codes: ['C0000X0350-0370'] },
      { key: 'oil', codes: ['O4000XBIO'] },
      { key: 'gas', codes: ['G3000'] },
      { key: 'nuclear', codes: ['N900H'] },
      { key: 'renewables', codes: ['RA000'] },
    ] as const
    const all = FUELS.flatMap((f) => f.codes)
    if (tab === 'diversification') {
      const r = await ask('nrg_bal_c', { geo, siec: ['TOTAL', ...all], nrg_bal: 'GAE', unit: 'KTOE' }, since)
      if (!r) throw new NoDataError('nrg_bal_c')
      geoName = await geoLabel(r)
      source = { code: 'nrg_bal_c', title: r.label }
      const v = valuesOf(r, (k) => k.siec)
      const parts = FUELS.map((f) => ({ key: f.key, name: t.fuels[f.key], values: sumSeries(f.codes.map((c) => v.get(c)), 1000) }))
      const total = sumSeries([v.get('TOTAL')], 1000)
      const other = minus(total, sumSeries(parts.map((x) => x.values)))
      const groups = [...parts, ...(other.size && [...other.values()].some((n) => n > 0.5) ? [{ key: 'other', name: t.fuels.other, values: other }] : [])].filter((x) => x.values.size)
      const years = yearsOf(groups.map((x) => x.values))
      if (!years.length) throw new NoDataError('nrg_bal_c')
      const y = years.at(-1)!
      widgets.push({ type: 'bar', title: t.mixTitle, subtitle: `${geoName} · Mtoe`, categories: years, series: lines(years, groups).map((x) => ({ ...x, data: x.data.map((n) => (n == null ? null : round(n, 1))) })), stacked: true, unit: 'Mtoe', decimals: 1, size: 'full', role: 'composition' })
      widgets.push({ type: 'bar', title: t.mixShareTitle, subtitle: `${geoName} · %`, categories: years, series: lines(years, groups).map((x) => ({ ...x, data: x.data.map((n, i) => (n == null || !total.get(years[i]) ? null : round((100 * n) / total.get(years[i])!, 1))) })), stacked: 'percent', unit: '%', decimals: 1, size: 'half', role: 'change' })
      const slices = groups.map((x) => ({ name: x.name, y: round(x.values.get(y) ?? 0, 1) })).filter((x) => x.y > 0)
      if (slices.length > 1) widgets.push({ type: 'pie', title: fill(t.pieTitle, { year: y }), subtitle: `${geoName} · Mtoe`, slices, centerLabel: `${num(total.get(y) ?? 0, 0)} Mtoe`, unit: 'Mtoe', size: 'half', role: 'change' })
      const shares = groups.map((x) => ({ x, s: (x.values.get(y) ?? 0) / (total.get(y) || 1) })).sort((a, b) => b.s - a.s)
      const hhi = shares.reduce((a, b) => a + b.s * b.s, 0)
      const diversity = Math.round((1 - hhi) * 100)
      kpis.push({ label: t.kpiTotal, value: round(total.get(y) ?? 0, 0), unit: 'Mtoe', decimals: 0, caption: y, goodDirection: 'neutral', trend: years.map((yy) => total.get(yy) ?? null) })
      kpis.push({ label: t.kpiTop, value: round(shares[0].s * 100), unit: '%', decimals: 1, caption: shares[0].x.name, goodDirection: 'down' })
      kpis.push({ label: t.kpiDiversity, value: diversity, unit: '', decimals: 0, caption: t.kpiDiversityNote, goodDirection: 'up' })
      const gas = groups.find((x) => x.key === 'gas')
      const ren = groups.find((x) => x.key === 'renewables')
      if (gas) kpis.push({ label: t.fuels.gas, value: round(((gas.values.get(y) ?? 0) / (total.get(y) || 1)) * 100), unit: '%', decimals: 1, caption: y, goodDirection: 'down' })
      if (ren) kpis.push({ label: t.fuels.renewables, value: round(((ren.values.get(y) ?? 0) / (total.get(y) || 1)) * 100), unit: '%', decimals: 1, caption: y, goodDirection: 'up' })
      summary.push(fill(t.sumMix, { geo: geoName, year: y, total: `${num(total.get(y) ?? 0, 0)} Mtoe`, top: shares[0].x.name, share: `${num(shares[0].s * 100)}%`, second: shares[1]?.x.name.toLowerCase() ?? '', share2: `${num((shares[1]?.s ?? 0) * 100)}%` }))
      const ago = years.find((yy) => Number(yy) === Number(y) - 10)
      if (ago) {
        const best = groups.map((x) => ({ x, d: (100 * (x.values.get(y) ?? 0)) / (total.get(y) || 1) - (100 * (x.values.get(ago) ?? 0)) / (total.get(ago) || 1) })).sort((a, b) => b.d - a.d)[0]
        if (best.d > 0.5) insights.push({ tone: 'up', parts: [fill(t.insGained, { name: best.x.name.toLowerCase(), pp: num(best.d), year: ago })] })
        const worst = groups.map((x) => ({ x, d: (100 * (x.values.get(y) ?? 0)) / (total.get(y) || 1) - (100 * (x.values.get(ago) ?? 0)) / (total.get(ago) || 1) })).sort((a, b) => a.d - b.d)[0]
        if (worst.d < -0.5) insights.push({ tone: 'neutral', parts: [fill(t.insLost, { name: worst.x.name.toLowerCase(), pp: num(Math.abs(worst.d)), year: ago })] })
      }
      notes.push(t.noteMix, t.noteDiversity)
      widgets.push({ type: 'table', title: t.tableAll, columns: years, rows: [...groups.map((x) => ({ label: `${x.name} (Mtoe)`, values: years.map((yy) => (x.values.has(yy) ? round(x.values.get(yy)!, 2) : null)) })), { label: `${t.kpiTotal} (Mtoe)`, values: years.map((yy) => (total.has(yy) ? round(total.get(yy)!, 2) : null)) }] })
    } else {
      const [r, imp] = await Promise.all([
        ask('nrg_ind_id3cf', { geo, siec: ['TOTAL', 'C0000X0350-0370', 'G3000', 'O4000XBIO', 'E7000'], partner: 'THRD', unit: 'PC' }, since),
        ask('nrg_bal_c', { geo, siec: ['C0000X0350-0370', 'O4000XBIO', 'G3000', 'E7000', 'RA000'], nrg_bal: 'IMP', unit: 'KTOE' }, since),
      ])
      if (!r) throw new NoDataError('nrg_ind_id3cf')
      geoName = await geoLabel(r)
      source = { code: 'nrg_ind_id3cf', title: r.label }
      const v = valuesOf(r, (k) => k.siec)
      const dep = [
        { name: t.fuels.total, values: v.get('TOTAL') },
        { name: t.fuels.solid, values: v.get('C0000X0350-0370') },
        { name: t.fuels.gas, values: v.get('G3000') },
        { name: t.fuels.oil, values: v.get('O4000XBIO') },
        { name: t.fuels.electricity, values: v.get('E7000') },
      ].filter((x) => x.values?.size)
      const years = yearsOf(dep.map((x) => x.values!))
      if (!years.length) throw new NoDataError('nrg_ind_id3cf')
      const y = years.at(-1)!
      widgets.push({ type: 'line', title: t.depTitle, subtitle: `${geoName} · %`, categories: years, series: lines(years, dep).map((x) => ({ ...x, data: x.data.map((n) => (n == null ? null : round(n, 1))) })), unit: '%', highlight: y, size: 'full', role: 'evolution' })
      const iv = valuesOf(imp, (k) => k.siec)
      const impParts = [
        { name: t.fuels.solid, values: sumSeries([iv.get('C0000X0350-0370')], 1000) },
        { name: t.fuels.oil, values: sumSeries([iv.get('O4000XBIO')], 1000) },
        { name: t.fuels.gas, values: sumSeries([iv.get('G3000')], 1000) },
        { name: t.fuels.electricity, values: sumSeries([iv.get('E7000')], 1000) },
        { name: t.fuels.renewables, values: sumSeries([iv.get('RA000')], 1000) },
      ].filter((x) => x.values.size && [...x.values.values()].some((n) => n > 0))
      const iy = yearsOf(impParts.map((x) => x.values))
      if (impParts.length) {
        widgets.push({ type: 'bar', title: t.importsTitle, subtitle: `${geoName} · Mtoe`, categories: iy, series: lines(iy, impParts).map((x) => ({ ...x, data: x.data.map((n) => (n == null ? null : round(n, 1))) })), stacked: true, unit: 'Mtoe', decimals: 1, size: 'half', role: 'composition' })
        const slices = impParts.map((x) => ({ name: x.name, y: round(x.values.get(iy.at(-1)!) ?? 0, 1) })).filter((x) => x.y > 0)
        if (slices.length > 1) widgets.push({ type: 'pie', title: fill(t.pieImportsTitle, { year: iy.at(-1)! }), subtitle: `${geoName} · Mtoe`, slices, unit: 'Mtoe', size: 'half', role: 'change' })
      }
      // All countries: dependence on third countries, latest year.
      const rank = await ask('nrg_ind_id3cf', { geo: MEMBERS, siec: 'TOTAL', partner: 'THRD', unit: 'PC' }, y)
      const rows = (rank?.observations ?? []).filter((o) => o.value != null && o.keys.time === y).map((o) => ({ code: o.keys.geo, name: stripEu(labelOf(rank, 'geo', o.keys.geo)), value: o.value as number })).sort((a, b) => b.value - a.value)
      if (rows.length >= 10) {
        widgets.push({ type: 'bar', title: fill(t.rankTitle, { year: y }), subtitle: '%', categories: rows.map((x) => x.name), series: [{ name: t.fuels.total, data: rows.map((x) => round(x.value, 1)) }], horizontal: true, unit: '%', decimals: 1, size: 'full', role: 'ranking' })
        const at = rows.findIndex((x) => x.code === geo)
        if (at >= 0) insights.push({ tone: 'neutral', parts: [fill(t.insRank, { geo: geoName, rank: String(at + 1), of: String(rows.length), year: y })] })
      }
      for (const x of dep) {
        const l = last(x.values)
        if (!l) continue
        const prev = x.values!.get(String(Number(l.y) - 1))
        kpis.push({ label: x.name, value: round(l.v, 1), unit: '%', decimals: 1, caption: l.y, goodDirection: 'down', ...(prev != null ? { delta: round(l.v - prev), deltaUnit: 'pp', deltaLabel: String(Number(l.y) - 1) } : {}), trend: years.map((yy) => x.values!.get(yy) ?? null) })
      }
      const tot = last(v.get('TOTAL'))
      const gas = last(v.get('G3000'))
      const oil = last(v.get('O4000XBIO'))
      if (tot) summary.push(fill(t.sumDep, { geo: geoName, year: tot.y, total: `${num(tot.v)}%`, gas: gas ? `${num(gas.v)}%` : '–', oil: oil ? `${num(oil.v)}%` : '–' }))
      const peak = [...(v.get('TOTAL') ?? new Map())].sort((a, b) => b[1] - a[1])[0]
      if (tot && peak && peak[0] !== tot.y) insights.push({ tone: tot.v < peak[1] ? 'up' : 'neutral', parts: [fill(t.insPeak, { geo: geoName, peak: `${num(peak[1])}%`, year: peak[0], now: `${num(tot.v)}%` })] })
      const worstFuel = dep.filter((x) => x.name !== t.fuels.total).map((x) => ({ x, l: last(x.values) })).filter((x) => x.l).sort((a, b) => b.l!.v - a.l!.v)[0]
      if (worstFuel) insights.push({ tone: 'down', parts: [fill(t.insWorstFuel, { fuel: worstFuel.x.name.toLowerCase(), value: `${num(worstFuel.l!.v)}%`, year: worstFuel.l!.y })] })
      notes.push(t.noteDep, t.noteImports)
      widgets.push({ type: 'table', title: t.tableAll, columns: years, rows: [...dep.map((x) => ({ label: `${t.depPrefix} ${x.name.toLowerCase()} (%)`, values: years.map((yy) => x.values!.get(yy) ?? null) })), ...impParts.map((x) => ({ label: `${t.importsPrefix} ${x.name.toLowerCase()} (Mtoe)`, values: years.map((yy) => (x.values.has(yy) ? round(x.values.get(yy)!, 2) : null)) }))] })
    }
  } else if (tab === 'poverty') {
    const base = { geo, hhcomp: 'TOTAL', rskpovth: ['TOTAL', 'B_60'], unit: 'PC' }
    const [warm, arrears, dwelling] = await Promise.all([
      ask('ilc_mdes01', base, since),
      ask('ilc_mdes07', base, since),
      ask('ilc_mdho01', { ...base, sex: 'T', age: 'TOTAL' }, since),
    ])
    const indicators = [
      { key: 'warm', title: t.indicators.warm, r: warm },
      { key: 'arrears', title: t.indicators.arrears, r: arrears },
      { key: 'dwelling', title: t.indicators.dwelling, r: dwelling },
    ]
    if (!indicators.some((x) => x.r)) throw new NoDataError('ilc_mdes01')
    geoName = await geoLabel(warm ?? arrears ?? dwelling)
    source = { code: 'ilc_mdes01', title: warm?.label ?? '' }
    const tableRows: { label: string; values: Series }[] = []
    const allYears: string[] = []
    for (const ind of indicators) {
      const v = valuesOf(ind.r, (k) => k.rskpovth)
      const tot = v.get('TOTAL')
      const poor = v.get('B_60')
      const years = yearsOf([...(tot ? [tot] : []), ...(poor ? [poor] : [])])
      if (!years.length) continue
      allYears.push(...years)
      widgets.push({ type: 'line', title: ind.title, subtitle: `${geoName} · %`, categories: years, series: lines(years, [{ name: t.allHouseholds, values: tot }, { name: t.belowPoverty, values: poor }]), unit: '%', highlight: years.at(-1), size: 'half', role: 'evolution' })
      tableRows.push({ label: `${ind.title}: ${t.allHouseholds} (%)`, values: tot ?? new Map() }, { label: `${ind.title}: ${t.belowPoverty} (%)`, values: poor ?? new Map() })
      const l = last(tot)
      if (l) {
        const prev = tot!.get(String(Number(l.y) - 1))
        kpis.push({ label: ind.title, value: round(l.v, 1), unit: '%', decimals: 1, caption: l.y, goodDirection: 'down', ...(prev != null ? { delta: round(l.v - prev), deltaUnit: 'pp', deltaLabel: String(Number(l.y) - 1) } : {}), trend: years.map((y) => tot!.get(y) ?? null) })
      }
    }
    // Countries side by side: homes not kept warm.
    const rank = await ask('ilc_mdes01', { geo: MEMBERS, hhcomp: 'TOTAL', rskpovth: 'TOTAL', unit: 'PC' }, '2015')
    const lastYear = [...new Set((rank?.observations ?? []).filter((o) => o.value != null).map((o) => o.keys.time))].sort().at(-1)
    const rows = (rank?.observations ?? []).filter((o) => o.value != null && o.keys.time === lastYear).map((o) => ({ code: o.keys.geo, name: stripEu(labelOf(rank, 'geo', o.keys.geo)), value: o.value as number })).sort((a, b) => b.value - a.value)
    if (rows.length >= 10 && lastYear) {
      widgets.push({ type: 'bar', title: fill(t.rankWarm, { year: lastYear }), subtitle: '%', categories: rows.map((x) => x.name), series: [{ name: t.indicators.warm, data: rows.map((x) => round(x.value, 1)) }], horizontal: true, unit: '%', decimals: 1, size: 'full', role: 'ranking' })
      const at = rows.findIndex((x) => x.code === geo)
      if (at >= 0 && geo !== EU) insights.push({ tone: 'neutral', parts: [fill(t.insRankWarm, { geo: geoName, rank: String(at + 1), of: String(rows.length), year: lastYear })] })
    }
    const w = valuesOf(warm, (k) => (k.rskpovth === 'TOTAL' ? 'T' : k.rskpovth === 'B_60' ? 'P' : null))
    const wl = last(w.get('T'))
    const pl = last(w.get('P'))
    if (wl) summary.push(fill(t.sumPoverty, { geo: geoName, year: wl.y, warm: `${num(wl.v)}%`, poor: pl ? `${num(pl.v)}%` : '–' }))
    if (wl && pl && wl.v > 0) insights.push({ tone: 'neutral', parts: [fill(t.insRatio, { ratio: num(pl.v / wl.v), year: pl.y })] })
    const peak = [...(w.get('T') ?? new Map())].sort((a, b) => b[1] - a[1])[0]
    if (wl && peak && peak[0] !== wl.y) insights.push({ tone: wl.v < peak[1] ? 'up' : 'down', parts: [fill(t.insPeakWarm, { peak: `${num(peak[1])}%`, year: peak[0], now: `${num(wl.v)}%` })] })
    notes.push(t.noteSilc, t.notePovertyLine)
    const years = [...new Set(allYears)].sort()
    widgets.push({ type: 'table', title: t.tableAll, columns: years, rows: tableRows.map((x) => ({ label: x.label, values: years.map((y) => x.values.get(y) ?? null) })) })
  } else {
    const start = from === 'all' ? '2007-S1' : `${from}-S1`
    const common = { geo, currency: 'EUR', unit: 'KWH', tax: ['I_TAX', 'X_TAX'] }
    const [elc, gas] = await Promise.all([
      ask('nrg_pc_204', { ...common, siec: 'E7000', nrg_cons: 'KWH2500-4999' }, start),
      ask('nrg_pc_202', { ...common, siec: 'G3000', nrg_cons: 'GJ20-199' }, start),
    ])
    if (!elc && !gas) throw new NoDataError('nrg_pc_204')
    geoName = await geoLabel(elc ?? gas)
    source = { code: 'nrg_pc_204', title: elc?.label ?? '' }
    const ev = valuesOf(elc, (k) => k.tax)
    const gv = valuesOf(gas, (k) => k.tax)
    const half = (a: Series | undefined, b: Series | undefined) => yearsOf([...(a ? [a] : []), ...(b ? [b] : [])])
    const tableRows: { label: string; values: Series }[] = []
    let years: string[] = []
    for (const [title, v, unit] of [[t.elcTitle, ev, t.fuels.electricity], [t.gasTitle, gv, t.fuels.gas]] as const) {
      const incl = v.get('I_TAX')
      const excl = v.get('X_TAX')
      const ys = half(incl, excl)
      if (!ys.length) continue
      years = [...new Set([...years, ...ys])].sort()
      widgets.push({ type: 'line', title: title, subtitle: `${geoName} · EUR/kWh`, categories: ys, series: lines(ys, [{ name: t.inclTax, values: incl }, { name: t.exclTax, values: excl }]).map((x) => ({ ...x, data: x.data.map((n) => (n == null ? null : round(n, 4))) })), unit: 'EUR/kWh', highlight: ys.at(-1), size: 'half', role: 'price' })
      tableRows.push({ label: `${unit}: ${t.inclTax} (EUR/kWh)`, values: incl ?? new Map() }, { label: `${unit}: ${t.exclTax} (EUR/kWh)`, values: excl ?? new Map() })
      const l = last(incl)
      const x = last(excl)
      if (l) {
        const prev = incl!.get(`${Number(l.y.slice(0, 4)) - 1}${l.y.slice(4)}`)
        kpis.push({ label: unit, value: round(l.v, 3), unit: 'EUR/kWh', decimals: 3, caption: l.y, goodDirection: 'down', ...(prev != null ? { delta: round(((l.v - prev) / prev) * 100), deltaUnit: '%', deltaLabel: `${Number(l.y.slice(0, 4)) - 1}${l.y.slice(4)}` } : {}), trend: ys.map((yy) => incl!.get(yy) ?? null) })
        if (x && l.v > 0) kpis.push({ label: fill(t.kpiTaxShare, { fuel: unit.toLowerCase() }), value: round(((l.v - x.v) / l.v) * 100), unit: '%', decimals: 1, caption: l.y, goodDirection: 'neutral' })
      }
    }
    // Both fuels in one picture: how much more a household pays now than at the start of the period shown.
    const e = ev.get('I_TAX')
    const g = gv.get('I_TAX')
    const el = last(e)
    const gl = last(g)
    if (el || gl) summary.push(fill(t.sumPrices, { geo: geoName, elc: el ? `${num(el.v, 3)} EUR/kWh (${el.y})` : '–', gas: gl ? `${num(gl.v, 3)} EUR/kWh (${gl.y})` : '–' }))
    for (const [name, series] of [[t.fuels.electricity, e], [t.fuels.gas, g]] as const) {
      const l = last(series)
      const first = [...(series ?? new Map())].sort()[0]
      if (l && first && first[0] !== l.y) insights.push({ tone: l.v > first[1] ? 'down' : 'up', parts: [fill(l.v > first[1] ? t.insPriceUp : t.insPriceDown, { fuel: name.toLowerCase(), pct: `${num(Math.abs(((l.v - first[1]) / first[1]) * 100), 0)}%`, year: first[0] })] })
    }
    notes.push(t.notePrices)
    widgets.push({ type: 'table', title: t.tableAll, columns: years, rows: tableRows.map((x) => ({ label: x.label, values: years.map((y) => (x.values.has(y) ? round(x.values.get(y)!, 4) : null)) })) })
  }

  widgets.unshift({ type: 'kpis', items: kpis })
  const versusName = compareGeo ? await placeNameOf(dict, DATASETS[tab], compareGeo, lang) : undefined
  const title = withVersus(fill(t.titles[tab], { geo: geoName }), versusName, lang)
  const cmp = compareGeo ? { compare: compareGeo } : {}
  const compare = await compareChoice({ plan, dict, dataset: DATASETS[tab], lang, current: compareGeo, set: (c) => ({ ...plan, reporting: { tab, ...(from !== 'all' ? { from } : {}), ...(c ? { compare: c } : {}) } }), t })
  const link = (code: string) => `https://ec.europa.eu/eurostat/databrowser/view/${code}/default/table?lang=${lang}`
  const { spec } = sanitizeSpec({
    title,
    subtitle: t.tabs[tab],
    ...(versusName ? { compareNames: [geoName, versusName] as [string, string] } : {}),
    summary,
    insights: insights.slice(0, 5),
    notes,
    widgets,
    layout: ['summary', 'notes', 'toolbar', 'kpis', 'charts', 'insights', 'table', 'suggestions'],
    presentation: { template: 'reporting', kpiStyle: 'cards', controls: ['geo', 'compare', 'period'], primaryControls: 2, accent: tab === 'efficiency' ? 'blue' : tab === 'poverty' || tab === 'prices' ? 'violet' : 'orange' },
    source: { code: source.code, title: source.title || source.code, url: link(source.code) },
    suggestions: suggestions(plan, s, tab),
    controls: {
      tabs: REPORTING_TABS.map((k) => ({ label: t.tabs[k], plan: { ...plan, dataset: DATASETS[k], reporting: { tab: k, ...cmp, ...(from !== 'all' ? { from } : {}) } }, active: k === tab })),
      periods: (['all', '2010', '2020'] as ReportingFrom[]).map((f) => ({ label: t.from[f], plan: { ...plan, reporting: { tab, ...cmp, ...(f !== 'all' ? { from: f } : {}) } }, active: f === from })),
      choices: [compare],
    },
    context: [title, t.tabs[tab], ...summary, ...kpis.map((k) => `${k.label}: ${k.value} ${k.unit ?? ''}`)].join('\n'),
    plan,
    shown: { geo: [geo] },
  })
  return spec
}

function suggestions(plan: Plan, s: { reporting: ReportingStrings; sugExplain: string }, tab: ReportingTab): Suggestion[] {
  const t = s.reporting
  const at = (k: ReportingTab): Plan => ({ ...plan, dataset: DATASETS[k], reporting: { tab: k } })
  const out: Suggestion[] = []
  const next: ReportingTab[] = tab === 'efficiency' ? ['diversification', 'poverty'] : tab === 'diversification' || tab === 'dependence' ? ['efficiency', 'poverty'] : ['efficiency', 'dependence']
  for (const k of next) out.push({ label: t.tabs[k], plan: at(k) })
  if (plan.filters.geo !== EU) out.push({ label: t.eu, plan: { ...plan, filters: { ...plan.filters, geo: EU } } })
  out.push({ label: s.sugExplain, explain: true })
  return out
}
