import { fetchEurostatData, type EnergyCodelists, type EnergyDictionary, type EurostatResult } from '../data/eurostat'
import type { Strings } from '../i18n'
import { detectGeos, detectTime, parse, requestedUnit, type Parsed } from './planner/parse'
import type { DashboardControls, DashboardSpec, FuelGroup, KpiSpec, Plan, Suggestion, WidgetSpec } from './types'
import { sanitizeSpec } from './validate'

/**
 * Energy balance sheets, as Eurostat's energy balances visualisation (enbal,
 * https://ec.europa.eu/eurostat/cache/visualisations/energy-balances/enbal.html): for one country,
 * year and unit, every balance line of nrg_bal_c (rows, a tree the reader opens) × one group of
 * fuels (columns). The lines, their order and the fuel groups are enbal's (js/codes.js, basics.js).
 */

const DATASET = 'nrg_bal_c'

export const FUEL_GROUPS: Record<FuelGroup, string[]> = {
  main: ['TOTAL', 'C0000X0350-0370', 'C0350-0370', 'P1000', 'S2000', 'G3000', 'O4000XBIO', 'RA000', 'W6100_6220', 'N900H', 'E7000', 'H8000'],
  coal: ['C0110', 'C0121', 'C0129', 'C0210', 'C0220', 'C0311', 'C0312', 'C0320', 'C0330', 'C0340'],
  fossilGases: ['C0350', 'C0360', 'C0371', 'C0379', 'G3000'],
  otherFossil: ['P1100', 'P1200', 'S2000', 'W6100', 'W6220'],
  primaryOil: ['O4100_TOT', 'O4200', 'O4300', 'O4400X4410', 'O4500'],
  mainPetroleum: ['O4610', 'O4630', 'O4640', 'O4652XR5210B', 'O4661XR5230B', 'O4671XR5220B', 'O4680', 'O4695'],
  otherPetroleum: ['O4620', 'O4651', 'O4653', 'O4669', 'O4691', 'O4692', 'O4693', 'O4694', 'O4699'],
  nonCombustible: ['RA100', 'RA200', 'RA300', 'RA410', 'RA420', 'RA500', 'RA600'],
  combustible: ['R5110-5150_W6000RI', 'R5160', 'R5210P', 'R5210B', 'R5220P', 'R5220B', 'R5230P', 'R5230B', 'R5290', 'R5300'],
  electricityHeat: ['N900H', 'E7000', 'H8000'],
}

/** The balance lines at the top of the sheet. */
const LINES = ['NRGSUP', 'TI_E', 'TO', 'NRG_E', 'DL', 'AFC', 'STATDIFF', 'FC_NE', 'FC_E', 'GEP', 'GHP']

/** The lines under a line (enbal's "expandables"). */
const SUB_LINES: Record<string, string[]> = {
  NRGSUP: ['PPRD', 'RCV_RCY', 'IMP', 'EXP', 'STK_CHG', 'GAE', 'INTMARB', 'GIC', 'INTAVI'],
  TI_E: ['TI_EHG_E', 'TI_CO_E', 'TI_BF_E', 'TI_GW_E', 'TI_RPI_E', 'TI_PF_E', 'TI_BKBPB_E', 'TI_CL_E', 'TI_BNG_E', 'TI_LBB_E', 'TI_CPP_E', 'TI_GTL_E', 'TI_NSP_E'],
  TI_RPI_E: ['TI_RPI_RI_E', 'TI_RPI_BPI_E', 'TI_RPI_PT_E', 'TI_RPI_IT_E', 'TI_RPI_DU_E', 'TI_RPI_PII_E'],
  TI_EHG_E: ['TI_EHG_MAPE_E', 'TI_EHG_MAPCHP_E', 'TI_EHG_MAPH_E', 'TI_EHG_APE_E', 'TI_EHG_APCHP_E', 'TI_EHG_APH_E', 'TI_EHG_EDHP', 'TI_EHG_EB', 'TI_EHG_EPS', 'TI_EHG_DHEP', 'TI_EHG_CB'],
  TO: ['TO_EHG', 'TO_CO', 'TO_BF', 'TO_GW', 'TO_RPI', 'TO_PF', 'TO_CL', 'TO_BKBPB', 'TO_BNG', 'TO_CPP', 'TO_LBB', 'TO_GTL', 'TO_NSP'],
  TO_RPI: ['TO_RPI_RO', 'TO_RPI_BKFLOW', 'TO_RPI_PT', 'TO_RPI_IT', 'TO_RPI_PPR', 'TO_RPI_PIR'],
  TO_EHG: ['TO_EHG_MAPE', 'TO_EHG_MAPCHP', 'TO_EHG_MAPH', 'TO_EHG_APE', 'TO_EHG_APCHP', 'TO_EHG_APH', 'TO_EHG_EDHP', 'TO_EHG_EB', 'TO_EHG_PH', 'TO_EHG_OTH'],
  NRG_E: ['NRG_EHG_E', 'NRG_CM_E', 'NRG_OIL_NG_E', 'NRG_PF_E', 'NRG_CO_E', 'NRG_BKBPB_E', 'NRG_GW_E', 'NRG_BF_E', 'NRG_PR_E', 'NRG_NI_E', 'NRG_CL_E', 'NRG_LNG_E', 'NRG_BIOG_E', 'NRG_GTL_E', 'NRG_CPP_E', 'NRG_NSP_E'],
  FC_E: ['FC_OTH_E', 'FC_TRA_E', 'FC_IND_E'],
  FC_IND_E: ['FC_IND_IS_E', 'FC_IND_CPC_E', 'FC_IND_NFM_E', 'FC_IND_NMM_E', 'FC_IND_TE_E', 'FC_IND_MAC_E', 'FC_IND_MQ_E', 'FC_IND_FBT_E', 'FC_IND_PPP_E', 'FC_IND_WP_E', 'FC_IND_CON_E', 'FC_IND_TL_E', 'FC_IND_NSP_E'],
  FC_TRA_E: ['FC_TRA_RAIL_E', 'FC_TRA_ROAD_E', 'FC_TRA_DAVI_E', 'FC_TRA_DNAVI_E', 'FC_TRA_PIPE_E', 'FC_TRA_NSP_E'],
  FC_OTH_E: ['FC_OTH_CP_E', 'FC_OTH_HH_E', 'FC_OTH_AF_E', 'FC_OTH_FISH_E', 'FC_OTH_NSP_E'],
}

/** Every line of the sheet in reading order, with its depth and the line it belongs to. */
export function balanceLines(): { code: string; level: number; parent?: string }[] {
  const out: { code: string; level: number; parent?: string }[] = []
  const walk = (code: string, level: number, parent?: string) => {
    out.push({ code, level, parent })
    for (const child of SUB_LINES[code] ?? []) walk(child, level + 1, code)
  }
  for (const line of LINES) walk(line, 0)
  return out
}

/** Countries of enbal's list (EU, members, neighbours). */
const GEOS = ['EU27_2020', 'BE', 'BG', 'CZ', 'DK', 'DE', 'EE', 'IE', 'EL', 'ES', 'FR', 'HR', 'IT', 'CY', 'LV', 'LT', 'LU', 'HU', 'MT', 'NL', 'AT', 'PL', 'PT', 'RO', 'SI', 'SK', 'FI', 'SE', 'IS', 'NO', 'ME', 'MK', 'AL', 'RS', 'TR', 'BA', 'XK', 'MD', 'UA', 'GE']

const UNIT_SYMBOL: Record<string, string> = { KTOE: 'ktoe', GWH: 'GWh', TJ: 'TJ' }

// ---------- questions ----------

// "energy balance(s)", "balance sheet", "Energiebilanz", "bilan énergétique", "fuel families", "enbal".
const BALANCE = / (energy balances?|energetic balances?|balance sheets?|energiebilanz(en)?|bilans? energetiques?|enbal|(main )?fuel famil(y|ies)|brennstofffamilien|familles de combustibles) /
// "What is an energy balance?": a definition, answered from the glossary.
const DEFINITION = /^ (what is|what are|what s|define|definition|meaning of|was ist|was sind|was bedeutet|qu est ce qu|qu est ce que|que signifie|definition d)\b/

// Most specific first: "non-combustible renewables" before "combustible", "other petroleum" before "petroleum".
const GROUP_WORDS: [FuelGroup, RegExp][] = [
  ['main', / (main fuel|fuel famil|hauptbrennstoff|familles de combustibles|all fuels|alle brennstoffe|tous les combustibles) /],
  ['nonCombustible', / (non combustible|non-combustible|nicht brennbare?n?|renouvelables non combustibles|solar|wind|hydro|geothermal|solaire|eolien|geothermie) /],
  ['combustible', / (combustible renewables?|brennbare?n? erneuerbare?n?|renouvelables combustibles|biofuels?|bioenergy|biomass|biokraftstoffe?|biocarburants?|biomasse) /],
  ['otherPetroleum', / (other petroleum|sonstige mineralol\w*|autres produits petroliers) /],
  ['mainPetroleum', / (petroleum products?|oil products?|mineralolprodukte|produits petroliers|gasoline|diesel|kerosene|lpg) /],
  ['primaryOil', / (primary oil|crude( oil)?|primarol|rohol|petrole (brut|primaire)) /],
  ['otherFossil', / (other fossil|wastes?|peat|oil shale|abfalle?|torf|dechets|tourbe) /],
  ['fossilGases', / (fossil gas(es)?|fossil based gas(es)?|manufactured gas(es)?|fossile gase|gaz (d origine )?fossiles?) /],
  ['coal', / (coal|lignite|anthracite|coke|kohle|braunkohle|charbon|houille) /],
  ['electricityHeat', / (electricity|heat|strom|warme|electricite|chaleur) /],
]

/** The group of fuels a question names, if any. */
export function fuelGroupOf(p: Parsed): FuelGroup | undefined {
  return GROUP_WORDS.find(([, re]) => re.test(p.text))?.[0]
}

/**
 * The balance sheet a question asks for ("energy balance of Germany 2023", "show me energy balances
 * for Total - main fuel families, 2024 in europe"), or null. The latest year and the EU by default.
 */
export function balancePlan(text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  const ds = dict.datasets[DATASET]
  if (!ds) return null
  const p = parse(text.replace(/[-–,]/g, ' '))
  if (!BALANCE.test(p.text) || DEFINITION.test(p.text)) return null
  const places = detectGeos(p, codelists)
  const geo = places.codes.find((c) => GEOS.includes(c)) ?? 'EU27_2020'
  const year = detectTime(p).years.at(-1)
  return {
    dataset: DATASET,
    filters: { geo, unit: requestedUnit(p, ds) ?? 'KTOE' },
    time: year ? { kind: 'range', since: String(year), until: String(year) } : { kind: 'last', n: 1 },
    focusPeriod: year ? String(year) : undefined,
    intent: 'snapshot',
    balance: { fuels: fuelGroupOf(p) ?? 'main' },
  }
}

/**
 * A follow-up to the balance sheet on screen: another country, year, unit or group of fuels ("and
 * Germany?", "2019", "in GWh", "renewables"). Null when the message changes none of them.
 */
export function refineBalance(current: Plan, text: string, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | null {
  if (!current.balance) return null
  const ds = dict.datasets[DATASET]
  const p = parse(text.replace(/[-–,]/g, ' '))
  const places = detectGeos(p, codelists)
  const geo = places.codes.find((c) => GEOS.includes(c)) ?? (places.eu ? 'EU27_2020' : undefined)
  const year = detectTime(p).years.at(-1)
  const unit = requestedUnit(p, ds)
  const fuels = fuelGroupOf(p)
  // Anything else in the message (e.g. "coal consumption in Poland over time") is a new question.
  const rest = p.words.filter((w) => !/^(and|und|et|in|im|en|au|for|fur|pour|of|von|de|du|the|la|le|das|die|der|what|about|wie|ist|es|mit|avec|with|show|zeige|montre|now|jetzt|maintenant|\d{4}|ktoe|gwh|tj)$/.test(w))
  const known = rest.every((w) => GROUP_WORDS.some(([, re]) => re.test(` ${w} `)) || detectGeos(parse(w), codelists).codes.length > 0 || detectGeos(parse(w), codelists).eu)
  if (!(geo || year || unit || fuels) || (!known && !BALANCE.test(p.text))) return null
  return {
    ...current,
    filters: { ...current.filters, ...(geo ? { geo } : {}), ...(unit ? { unit } : {}) },
    ...(year ? { time: { kind: 'range', since: String(year), until: String(year) }, focusPeriod: String(year) } : {}),
    balance: { fuels: fuels ?? current.balance.fuels },
    notes: [],
  }
}

// ---------- the dashboard ----------

export type BalanceStrings = Strings['balance']

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '')

/** The sheet's values: code of line → code of fuel → value (and Eurostat flag). */
function cells(result: EurostatResult) {
  const out = new Map<string, { value: number | null; flag?: string }>()
  for (const o of result.observations) out.set(`${o.keys.nrg_bal}|${o.keys.siec}`, { value: o.value, flag: o.flag })
  return out
}

export async function buildBalanceDashboard(
  plan: Plan,
  dict: EnergyDictionary,
  lang: string,
  s: { balance: BalanceStrings; sugExplain: string },
  signal?: AbortSignal,
): Promise<DashboardSpec> {
  const ds = dict.datasets[DATASET]
  const group = plan.balance?.fuels ?? 'main'
  const fuels = FUEL_GROUPS[group]
  const lines = balanceLines()
  const geo = String(plan.filters.geo ?? 'EU27_2020')
  const unit = String(plan.filters.unit ?? 'KTOE')
  const result = await fetchEurostatData(DATASET, {
    filters: { geo, unit, nrg_bal: lines.map((l) => l.code), siec: fuels },
    ...(plan.focusPeriod ? { sinceTimePeriod: plan.focusPeriod, untilTimePeriod: plan.focusPeriod } : { lastTimePeriod: 1 }),
    lang,
    signal,
  })
  const year = result.dimensions.time?.codes.at(-1)?.code ?? plan.focusPeriod ?? String(ds.dataEnd)
  const label = (dim: string, code: string) => result.dimensions[dim]?.codes.find((c) => c.code === code)?.label ?? code
  const geoName = label('geo', geo).replace(/\s*\(.*?\)\s*$/, '')
  const symbol = UNIT_SYMBOL[unit] ?? unit
  const values = cells(result)
  const cell = (line: string, fuel: string) => values.get(`${line}|${fuel}`)?.value ?? null
  const columns = fuels.filter((f) => result.dimensions.siec?.codes.some((c) => c.code === f)).map((code) => ({ code, label: label('siec', code) }))
  const rows = lines.map((l) => ({
    ...l,
    label: label('nrg_bal', l.code),
    values: columns.map((c) => cell(l.code, c.code)),
    flags: columns.map((c) => values.get(`${l.code}|${c.code}`)?.flag),
  }))
  const decimals = 0
  const fmt = new Intl.NumberFormat(lang, { maximumFractionDigits: decimals })
  const title = fill(s.balance.title, { geo: geoName, year })
  const groupName = s.balance.groups[group]

  // Key figures and charts (whole-energy view: the TOTAL column, when the group has it).
  const widgets: WidgetSpec[] = []
  const hasTotal = columns.some((c) => c.code === 'TOTAL')
  const kpis: KpiSpec[] = hasTotal
    ? ['PPRD', 'IMP', 'GIC', 'FC_E']
        .flatMap((code): KpiSpec[] => {
          const value = cell(code, 'TOTAL')
          return value == null ? [] : [{ label: label('nrg_bal', code), value, unit: symbol, decimals, goodDirection: 'neutral' }]
        })
    : []
  if (kpis.length) widgets.push({ type: 'kpis', items: kpis })
  widgets.push({ type: 'balance', title: `${title} · ${groupName}`, unit: symbol, decimals, columns, rows })
  const parts = columns.filter((c) => c.code !== 'TOTAL')
  const slices = parts.map((c) => ({ name: c.label, y: cell('GIC', c.code) ?? 0 })).filter((x) => x.y > 0)
  if (slices.length >= 2) {
    widgets.push({ type: 'pie', title: group === 'main' ? s.balance.gicByFuel : `${label('nrg_bal', 'GIC')}: ${groupName}`, subtitle: `${geoName}, ${year}`, slices, unit: symbol, size: 'half', role: 'composition' })
  }
  const total = hasTotal ? 'TOTAL' : columns[0]?.code
  const sectors = (SUB_LINES.FC_E ?? []).map((code) => ({ name: label('nrg_bal', code), value: total ? cell(code, total) : null })).filter((x) => x.value != null && x.value > 0)
  if (total && sectors.length >= 2) {
    widgets.push({
      type: 'bar',
      title: s.balance.finalBySector,
      subtitle: `${geoName}, ${year} · ${label('siec', total)}`,
      categories: sectors.map((x) => x.name),
      series: [{ name: label('nrg_bal', 'FC_E'), data: sectors.map((x) => x.value) }],
      horizontal: true,
      unit: symbol,
      decimals,
      size: 'half',
      role: 'detail',
    })
  }

  const supply = hasTotal ? cell('NRGSUP', 'TOTAL') : null
  const final = hasTotal ? cell('FC_E', 'TOTAL') : null
  const summary = supply != null && final != null ? [fill(s.balance.summary, { year, geo: geoName, supply: fmt.format(supply), final: fmt.format(final), unit: symbol })] : []

  const { spec } = sanitizeSpec({
    title,
    subtitle: `${groupName} · ${label('unit', unit)}`,
    summary,
    insights: [],
    notes: [],
    widgets,
    layout: ['summary', 'toolbar', 'kpis', 'charts', 'suggestions'],
    presentation: { template: 'balance', kpiStyle: 'cards', controls: ['geo', 'year', 'fuels', 'unit'], primaryControls: 4, accent: 'blue' },
    unit: symbol,
    source: { code: DATASET, title: result.label, url: `https://ec.europa.eu/eurostat/databrowser/view/${DATASET}/default/table?lang=${lang}` },
    suggestions: balanceSuggestions(plan, s),
    controls: balanceControls(plan, ds.dataStart ?? undefined, ds.dataEnd ?? undefined, year, s.balance),
    context: balanceContext(title, groupName, symbol, columns, rows.filter((r) => r.level === 0 || r.parent === 'NRGSUP')),
    plan: { ...plan, focusPeriod: year },
    shown: { geo: [geo] },
  })
  return spec
}

function balanceControls(plan: Plan, dataStart: string | undefined, dataEnd: string | undefined, year: string, s: BalanceStrings): DashboardControls {
  const end = Number(dataEnd) || Number(year)
  const start = Number(dataStart) || end - 14
  const at = (y: string): Plan => ({ ...plan, time: { kind: 'range', since: y, until: y }, focusPeriod: y })
  const years = Array.from({ length: Math.min(15, end - start + 1) }, (_, k) => String(end - k))
  if (!years.includes(year)) years.push(year)
  return {
    years: years.map((y) => ({ label: y, plan: at(y), active: y === year })),
    units: Object.keys(UNIT_SYMBOL).map((u) => ({ label: UNIT_SYMBOL[u], plan: { ...plan, filters: { ...plan.filters, unit: u } }, active: plan.filters.unit === u })),
    fuels: (Object.keys(FUEL_GROUPS) as FuelGroup[]).map((g) => ({ label: s.groups[g], plan: { ...plan, balance: { fuels: g } }, active: (plan.balance?.fuels ?? 'main') === g })),
  }
}

function balanceSuggestions(plan: Plan, s: { balance: BalanceStrings; sugExplain: string }): Suggestion[] {
  const out: Suggestion[] = []
  if (plan.filters.geo !== 'EU27_2020') out.push({ label: s.balance.sugEu, plan: { ...plan, filters: { ...plan.filters, geo: 'EU27_2020' } } })
  out.push({ label: s.sugExplain, explain: true })
  return out
}

/** Plain-text version for the model ("explain these figures"): the main lines only. */
function balanceContext(title: string, group: string, unit: string, columns: { label: string }[], rows: { label: string; values: (number | null)[] }[]): string {
  const head = `${title} (${group}, ${unit})\nLine | ${columns.map((c) => c.label).join(' | ')}`
  return [head, ...rows.map((r) => `${r.label} | ${r.values.map((v) => (v == null ? '-' : Math.round(v))).join(' | ')}`)].join('\n')
}

/** The geo codes a balance sheet can show. */
export const BALANCE_GEOS = GEOS
