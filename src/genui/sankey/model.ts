import type { EurostatResult } from '../../data/eurostat'
import tables from './tables.json'

/**
 * The data behind the energy flow diagram, as Eurostat's Energy Sankey (ENSANKEY): every flow of
 * the diagram is a formula over the balance lines of nrg_bal_c (flowFormulas), worked out product
 * by product on the elementary fuels, some clamped at zero (a stock change is a draw or a build),
 * and then added up into the fuel families (aggregateFuels) that colour the flows.
 */

export const FUEL_COLORS = tables.fuelColors as Record<string, string>
export const FUEL_TABLE = tables.fuelCodeTable as Record<string, string[]>
export const FLOW_FORMULAS = tables.flowFormulas as Record<string, { operand1: string[]; operand2?: string[]; operand3?: string[]; operand4?: string[] }>
export const FUEL_LOSSES_COLOR = '#DCDCDC'
export const FUEL_BACKGROUND = '#DCDCDC'

/** The flows are zero at one side of the balance: a stock change, a statistical difference. */
const CLAMPS: Record<string, (v: number) => number> = {
  F1_3: (v) => Math.max(v, 0),
  F1_4: (v) => -Math.min(v, 0),
  F6_2: (v) => -Math.min(v, 0),
  F6_8: (v) => Math.max(v, 0),
  F3: (v) => Math.max(v, 0),
}

/** The elementary fuels under a family (a fuel that is not a family is its own). */
export function leafFuels(fuel: string): string[] {
  const children = FUEL_TABLE[fuel]
  return children ? children.flatMap(leafFuels) : [fuel]
}

/** The fuels a diagram shows: the family chosen, or its parts when the flows are split by fuel. */
export function displayedFuels(selected: string, byFuel: boolean): string[] {
  return byFuel ? (FUEL_TABLE[selected] ?? [selected]) : [selected]
}

/** The families the fuel selector offers, as ENSANKEY's (its TOTAL first). */
export const FUEL_FAMILIES = ['TOTAL', 'SFF_P1000', 'O4000', 'G3000_C0350-370', 'RA000', 'W6100_6220', 'N900H', 'H8000', 'E7000']

export interface FlowData {
  code: string
  /** Fuel codes shown in this flow (one, or the parts of a family). */
  fuels: string[]
  values: number[]
  colors: string[]
  value: number
  isTiny: boolean
}

export const THRESHOLD = 0.5

const isTooSmall = (values: number[]) => values.every((v) => v < THRESHOLD)

export function makeFlow(code: string, fuels: string[], values: number[], colors: string[]): FlowData {
  return { code, fuels, values, colors, value: values.reduce((a, b) => a + b, 0), isTiny: isTooSmall(values) }
}

/** The values of Eurostat's balance lines: by line, product and year. */
export class BalanceTable {
  private index = new Map<string, number>()
  years: string[]
  /** "line|product" → value per year (null when Eurostat has none). */
  rows: Record<string, (number | null)[]>
  constructor(years: string[], rows: Record<string, (number | null)[]>) {
    this.years = years
    this.rows = rows
    years.forEach((y, i) => this.index.set(y, i))
  }
  get(line: string, siec: string, year: string): number {
    return this.rows[`${line}|${siec}`]?.[this.index.get(year) ?? -1] ?? 0
  }
}

/** The balance as rows by line and product, from Eurostat's answer (small enough to keep in the widget). */
export function rowsOf(result: EurostatResult): { years: string[]; rows: Record<string, (number | null)[]> } {
  const years = [...new Set(result.observations.map((o) => o.keys.time))].sort()
  const at = new Map(years.map((y, i) => [y, i]))
  const rows: Record<string, (number | null)[]> = {}
  for (const o of result.observations) {
    if (o.value == null) continue
    const key = `${o.keys.nrg_bal}|${o.keys.siec}`
    ;(rows[key] ??= years.map(() => null))[at.get(o.keys.time)!] = o.value
  }
  return { years, rows }
}

/** Every flow of the diagram for one elementary fuel and year, in the order ENSANKEY works them out. */
function flowsOfLeaf(table: BalanceTable, fuel: string, year: string): Record<string, number> {
  const out: Record<string, number> = {}
  const operand = (list: string[]) => list.reduce((sum, name) => sum + (name in FLOW_FORMULAS || name in out ? (out[name] ?? 0) : table.get(name, fuel, year)), 0)
  for (const [flow, f] of Object.entries(FLOW_FORMULAS)) {
    let result = operand(f.operand1)
    if (f.operand4) result -= operand(f.operand2!) - (operand(f.operand3!) - operand(f.operand4))
    else if (f.operand3) result -= operand(f.operand2!) - operand(f.operand3)
    else if (f.operand2) result -= operand(f.operand2)
    result = result || 0
    out[flow] = CLAMPS[flow] ? CLAMPS[flow](result) : result
  }
  return out
}

export interface SankeyModel {
  years: string[]
  fuels: string[]
  colors: string[]
  /** All flows of a year (by code): Flow objects for the diagram. */
  flows(year: string): Map<string, FlowData>
  /** The largest of "available from all sources" and "available after transformation", over the years. */
  scaleMax: number
}

/** Flow of a code for the fuels displayed, added up from the elementary fuels. */
export function buildModel(table: BalanceTable, selected: string, byFuel: boolean): SankeyModel {
  const fuels = displayedFuels(selected, byFuel)
  const leaves = fuels.map(leafFuels)
  const allLeaves = [...new Set(leaves.flat())]
  const colors = fuels.map((f) => FUEL_COLORS[f] ?? FUEL_BACKGROUND)
  const cache = new Map<string, Map<string, FlowData>>()
  const totalLeaves = leafFuels('TOTAL')

  const flows = (year: string): Map<string, FlowData> => {
    const hit = cache.get(year)
    if (hit) return hit
    const perLeaf = new Map<string, Record<string, number>>()
    for (const leaf of allLeaves) perLeaf.set(leaf, flowsOfLeaf(table, leaf, year))
    const out = new Map<string, FlowData>()
    for (const code of Object.keys(FLOW_FORMULAS)) {
      const values = leaves.map((ls) => ls.reduce((sum, leaf) => sum + (perLeaf.get(leaf)?.[code] ?? 0), 0))
      out.set(code, makeFlow(code, fuels, values, colors))
    }
    // Transformation losses (F4, F4_x): only for all products, worked out from the totals: input less output.
    const totalOf = (code: string) => (selected === 'TOTAL' ? (out.get(code)?.value ?? 0) : totalLeaves.reduce((s, l) => s + (flowsOfLeaf(table, l, year)[code] ?? 0), 0))
    const lose = (code: string, input: string, output: string) => {
      const v = selected === 'TOTAL' ? Math.max(totalOf(input) - totalOf(output), 0) : 0
      out.set(code, makeFlow(code, [''], [v], [FUEL_LOSSES_COLOR]))
    }
    lose('F4', 'F2_1', 'F2_2')
    for (const code of Object.keys(FLOW_FORMULAS)) {
      const m = /^F2_(\d+(?:_\d+)*)_1$/.exec(code)
      if (m) lose(`F4_${m[1]}`, code, `F2_${m[1]}_2`)
    }
    cache.set(year, out)
    return out
  }

  let scaleMax = 0
  for (const y of table.years) {
    const f = flows(y)
    scaleMax = Math.max(scaleMax, f.get('N1')?.value ?? 0, f.get('N6')?.value ?? 0)
  }
  return { years: table.years, fuels, colors, flows, scaleMax }
}

/** The balance lines the diagram needs (the ones its formulas read that are lines of nrg_bal_c). */
export function balanceLinesFor(codes: string[], allLines: string[]): string[] {
  const lines = new Set<string>()
  const visit = (flow: string) => {
    const f = FLOW_FORMULAS[flow]
    if (!f) return
    for (const op of [f.operand1, f.operand2, f.operand3, f.operand4]) for (const name of op ?? []) (name in FLOW_FORMULAS ? visit : (n: string) => lines.add(n))(name)
  }
  codes.forEach(visit)
  return [...lines].filter((l) => allLines.includes(l))
}

/** The balance of each country of an answer that has several (rows as in rowsOf). */
export function rowsByGeo(result: EurostatResult): Record<string, { years: string[]; rows: Record<string, (number | null)[]> }> {
  const geos = [...new Set(result.observations.map((o) => o.keys.geo))]
  const out: Record<string, { years: string[]; rows: Record<string, (number | null)[]> }> = {}
  for (const g of geos) out[g] = rowsOf({ ...result, observations: result.observations.filter((o) => o.keys.geo === g) })
  return out
}

/** The node a flow arrives at or leaves from (its name is the flow's name in the pies and details). */
export function nodeOfFlow(code: string): string {
  const special: Record<string, string> = { N1: 'N1', N6: 'N6', F1_1: 'N1_1', F1_2: 'E1_2', F1_3: 'E1_3', F1_4: 'E1_4', F2_1: 'T2', F2_2: 'N2_2', F4: 'E4', F3: 'N3', F5_1: 'N5', F5_2: 'N5', F6_1: 'N6_1', F6_1_1: 'N6_1_1', F6_1_2: 'N6_1_2', F6_1_1_1: 'N6_1_1_1', F6_1_1_2: 'N6_1_1_2', F6_1_1_3: 'N6_1_1_3' }
  return special[code] ?? `E${code.slice(1)}`
}

/** What a flow is a part of, for its share ("42 % of available energy"); null for the whole. */
export function parentOfFlow(code: string): string | null {
  const top: Record<string, string> = { F1_1: 'N1', F1_2: 'N1', F1_3: 'N1', F1_4: 'N1', F2_1: 'N1', F5_1: 'N1', F3: 'N1', F2_2: 'N6', F5_2: 'N6', F6_1: 'N6', F6_2: 'N6', F6_3: 'N6', F6_4: 'N6', F6_5: 'N6', F6_6: 'N6', F6_7: 'N6', F6_8: 'N6', F4: 'F2_1' }
  if (code === 'N1' || code === 'N6') return null
  if (top[code]) return top[code]
  let m = /^F2_(\d+)_(\d)_([12])$/.exec(code)
  if (m) return `F2_${m[1]}_${m[3]}`
  m = /^F2_(\d+)_([12])$/.exec(code)
  if (m) return `F2_${m[2]}`
  m = /^F4_(\d+)/.exec(code)
  if (m) return 'F4'
  const i = code.lastIndexOf('_')
  return i > 2 ? code.slice(0, i) : null
}
