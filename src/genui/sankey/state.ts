import { DEFAULT_DISAGGREGATION, type Disaggregation } from './layout'

/** Which nodes of the diagram are opened up, as ENSANKEY keeps it (its 13-bit state), by name. */
export const DISAGG_KEYS = Object.keys(DEFAULT_DISAGGREGATION) as (keyof Disaggregation)[]

/** The node whose click opens or closes each setting (ENSANKEY's stateMap). */
export const NODE_TOGGLE: Record<string, keyof Disaggregation> = {
  N1_1: 'production',
  N1: 'allSources',
  T2: 'transformation',
  N2_1: 'transformation',
  N2_2: 'transformation',
  N6: 'afterTransformation',
  N6_1: 'finalConsumption',
  N6_1_1: 'energyConsumption',
  N6_1_2: 'nonEnergyConsumption',
  N6_1_1_1: 'industry',
  N6_1_1_2: 'transport',
  N6_1_1_3: 'otherSectors',
  E6_5: 'energyBranch',
  T2_6: 'rpiTransformation',
  N2_6_1: 'rpiTransformation',
  N2_6_2: 'rpiTransformation',
  T2_11: 'ehgTransformation',
  N2_11_1: 'ehgTransformation',
  N2_11_2: 'ehgTransformation',
}

export function disaggregationOf(nodes: string | undefined): Disaggregation {
  if (nodes === undefined) return { ...DEFAULT_DISAGGREGATION }
  const on = new Set(nodes.split(',').filter(Boolean))
  return Object.fromEntries(DISAGG_KEYS.map((k) => [k, on.has(k)])) as unknown as Disaggregation
}

/** Every node opened ("expand all"), and back to the first picture. */
export const allOpen = (): Disaggregation => Object.fromEntries(DISAGG_KEYS.map((k) => [k, true])) as unknown as Disaggregation

export const nodesOf = (d: Disaggregation): string => DISAGG_KEYS.filter((k) => d[k]).join(',')

/** Opening or closing a node: what depends on it follows (a node's parts cannot stay open under a closed node). */
export function toggleDisaggregation(d: Disaggregation, key: keyof Disaggregation): Disaggregation {
  const n = { ...d, [key]: !d[key] }
  n.production &&= n.allSources
  n.finalConsumption &&= n.afterTransformation
  n.energyConsumption &&= n.finalConsumption
  n.nonEnergyConsumption &&= n.finalConsumption
  n.industry &&= n.energyConsumption
  n.transport &&= n.energyConsumption
  n.otherSectors &&= n.energyConsumption
  n.energyBranch &&= n.afterTransformation
  n.rpiTransformation &&= n.transformation
  n.ehgTransformation &&= n.transformation
  return n
}

const range = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}_${i + 1}`)

/** The flows (beyond the first picture's) an opened diagram draws, for the balance lines to fetch. */
export function flowsNeeded(d: Disaggregation): string[] {
  const out: string[] = []
  if (d.transformation) for (const x of ['6', '7', '8', '9', '10', '11', '12']) out.push(`F2_${x}_1`, `F2_${x}_2`)
  if (d.rpiTransformation) for (const k of [1, 2, 3]) out.push(`F2_6_${k}_1`, `F2_6_${k}_2`)
  if (d.ehgTransformation) for (const k of [1, 2, 3, 4]) out.push(`F2_11_${k}_1`, `F2_11_${k}_2`)
  if (d.energyConsumption) out.push('F6_1_1_1', 'F6_1_1_2', 'F6_1_1_3')
  if (d.nonEnergyConsumption) out.push(...range('F6_1_2', 3))
  if (d.industry) out.push(...range('F6_1_1_1', 13))
  if (d.transport) out.push(...range('F6_1_1_2', 7))
  if (d.otherSectors) out.push(...range('F6_1_1_3', 5))
  if (d.energyBranch) out.push(...range('F6_5', 16))
  return out
}
