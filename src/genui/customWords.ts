import type { RenewablesTab, ReportingTab } from './types'

/**
 * Words in any order: the custom dashboards (renewables, efficiency, security, poverty) are also found when a question
 * has their words but not the classic English phrase ("security energetic Italy", "capacity installed of wind in
 * Germany", "energy dependency of third countries Spain"). People who write English as a second language put the words
 * in the order of their own language, so these rules look at which words are there, not at their order. They only apply
 * when a place is named, so a general question without one ("primary and final energy consumption and the 2030
 * efficiency targets") keeps its general dashboard. The text is the prepared question (lower case, no accents), padded
 * with a space on both sides.
 */
const has = (text: string, re: RegExp) => re.test(text)
const ENERGY = /\b(energy|energies|power|electricity|supply|fuels?)\b/
const RENEW = /\b(renewables?|renewable|green|clean|solar|wind|hydro\w*|geothermal|biomass|tidal|ocean|photovoltaic)\b/
const TECH = /\b(solar|wind|hydro\w*|geothermal|biomass|ocean|tidal|photovoltaic)\b/

export function reportingTabByWords(t: string, placed: boolean): ReportingTab | undefined {
  if (!placed) return undefined
  // dependence on third countries (not plain import dependency: that has its own dataset and ranking)
  if (has(t, /\b(dependen\w*|depend|reliance|reliant|independen\w*|imports?|imported)\b/) && has(t, /\b(third|non ?eu|outside (the )?eu|foreign|external)\b/) && has(t, ENERGY)) return 'dependence'
  if (has(t, /\bdivers\w*\b/) && has(t, ENERGY)) return 'diversification'
  if (has(t, /\b(secur\w*|safe\w*|resilien\w*|risks?)\b/) && has(t, /\b(energy|energies|supply)\b/) && !has(t, /\b(oil|petrol|diesel|fuel|crude|gas|nuclear|cyber|food|water)\b/)) return 'diversification'
  if (has(t, /\bpoverty\b/) && has(t, /\b(energy|energies|fuel|heating|households?)\b/)) return 'poverty'
  if (has(t, /\barrears\b/) && has(t, /\b(bills?|utility|utilities|energy|electricity|gas|heating)\b/)) return 'poverty'
  if (has(t, /\b(afford|cannot|can t|unable|problems?|struggl\w*|difficult\w*|without)\b/) && has(t, /\b(heat|heating|warm|heated)\b/)) return 'poverty'
  if (has(t, /\b(cold|damp|moldy|mouldy|leaking)\b/) && has(t, /\b(homes?|houses?|dwellings?|flats?|apartments?|roofs?)\b/)) return 'poverty'
  if (has(t, /\b(efficien\w*|saving|savings|save)\b/) && has(t, /\benergy\b/) && !has(t, /\b(per capita|productivity|intensity|labels?|buildings?)\b/)) return 'efficiency'
  if (has(t, /\b(consum\w*|demand|use)\b/) && has(t, /\b(targets?|trajector\w*|ceilings?|2030)\b/) && has(t, /\benergy\b/) && !has(t, /\b(renewable\w*|share|emissions?)\b/)) return 'efficiency'
  return undefined
}

export function renewablesTabByWords(t: string, placed: boolean): RenewablesTab | undefined {
  if (!placed || !has(t, RENEW)) return undefined
  // a share asked as a share ("renewable share in Spain", "percent renewable") keeps the plain dashboards
  if (has(t, /\b(shares?|percent\w*|proportion|ratio|vs|versus|compare\w*|price\w*|cost\w*|subsid\w*|invest\w*|jobs?|emissions?)\b/)) return undefined
  if (has(t, /\b(capacity|capacities|installed|gigawatts?|megawatts?|gw|mw)\b/)) return 'capacity'
  if (has(t, /\b(buildings?|dwellings?)\b/)) return 'buildings'
  if (has(t, /\b(technolog\w*|sources?|mix|breakdown|per technology)\b/) || has(t, /\bwind and solar|solar and wind\b/)) {
    if (has(t, /\b(heating|cooling|heat)\b/)) return 'heating'
    if (has(t, /\b(transport|mobility|vehicles?)\b/)) return 'transport'
    if (has(t, /\bbuildings?|households?|homes?\b/)) return 'buildings'
    if (has(t, /\b(electricity|power|generation|generated)\b/) || has(t, TECH)) return 'electricity'
    return 'shares'
  }
  if (has(t, /\b(dashboard|overview|scorecard|progress|panel)\b/) || has(t, /\b(by|per|each) (sector|sectors)\b/)) return 'shares'
  return undefined
}
