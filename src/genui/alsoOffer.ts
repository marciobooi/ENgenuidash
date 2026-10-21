import type { EnergyCodelists, EnergyDictionary } from '../data/eurostat'
import { balancePlan } from './balance'
import { planQuestion } from './planner'
import { sankeyPlan } from './sankey/sankeyDashboard'
import type { Plan, RenewablesTab, ReportingTab } from './types'

/**
 * Two readings of one question. Some questions fit two dashboards: "energy efficiency in Germany" is the Eurostat
 * indicator and also the efficiency dashboard with the national targets; "renewable capacity" is a dataset and also the
 * renewables dashboard; "supply and use of energy" is the balance sheet or the flow diagram. The router picks one and
 * offers the other as a chip under the dashboard (Plan.also, shown by buildDashboard), so nobody has to rephrase.
 */
const EU = 'EU27_2020'

const RENEWABLES_TABS: [RegExp, RenewablesTab][] = [
  [/^nrg_inf_epcrw/, 'capacity'],
  [/^nrg_ind_ured/, 'electricity'],
  [/^nrg_ind_urhcd/, 'heating'],
  [/^nrg_ind_urtd/, 'transport'],
  [/^nrg_cb_bm/, 'biomass'],
  [/^nrg_cb_rw/, 'solid'],
  [/^(nrg_ind_ren|nrg_ind_share|nrg_ind_rcaebt)/, 'shares'],
]
const REPORTING_TABS: [RegExp, ReportingTab][] = [
  [/^(nrg_ind_eff|sdg_07_10|sdg_07_11|nrg_ind_cotd)/, 'efficiency'],
  [/^(nrg_ind_id3cf)/, 'dependence'],
  [/^(nrg_ind_id|sdg_07_50)/, 'dependence'],
  [/^(ilc_mdes01|sdg_07_60)/, 'poverty'],
]
const SUPPLY_USE = /\b(supply and (use|consumption|uses)|sources and uses|where (does|do) .{0,30}energy (come|go)|energy supply and consumption)\b/

const geoOf = (plan: Plan): string => {
  const g = plan.filters.geo
  const first = Array.isArray(g) ? g[0] : g
  return typeof first === 'string' && /^(EU27_2020|[A-Z]{2})$/.test(first) ? first : EU
}
const custom = (p: Plan) => !!(p.balance || p.trade || p.prices || p.oil || p.sankey || p.profile || p.renewables || p.reporting)

/** The other dashboard that reads the same question, or undefined. */
export function alsoOf(text: string, plan: Plan, dict: EnergyDictionary, codelists: EnergyCodelists): Plan | undefined {
  if (plan.also) return undefined
  // a custom dashboard of the progress kind → the plain indicator the wording also names
  if (plan.renewables || plan.reporting) {
    const general = planQuestion(text, dict, codelists)
    if (general.kind === 'plan' && !custom(general.plan) && general.plan.dataset !== plan.dataset) {
      // (the energy balances of a place are the balance sheet dashboard, not a plain chart of one line)
      if (general.plan.dataset === 'nrg_bal_c') return balancePlan(` energy balance ${text}`, dict, codelists) ?? general.plan
      return general.plan
    }
    return undefined
  }
  // the balance sheet and the flow diagram answer "supply and use of energy" alike
  if ((plan.sankey || plan.balance) && SUPPLY_USE.test(text)) {
    const other = plan.sankey ? balancePlan(` energy balance ${text}`, dict, codelists) : sankeyPlan(` energy flow diagram ${text}`, dict, codelists)
    return other ?? undefined
  }
  // a plain indicator that a custom dashboard covers more fully
  if (!custom(plan) && !plan.allCountries && !plan.top) {
    const geo = geoOf(plan)
    const tab = RENEWABLES_TABS.find(([re]) => re.test(plan.dataset))?.[1]
    if (tab && dict.datasets.nrg_ind_ren) return { dataset: 'nrg_ind_ren', filters: { geo }, time: { kind: 'all' }, intent: 'snapshot', renewables: { tab } }
    const rep = REPORTING_TABS.find(([re]) => re.test(plan.dataset))?.[1]
    if (rep) {
      const dataset = rep === 'efficiency' ? 'nrg_ind_eff' : rep === 'poverty' ? 'ilc_mdes01' : 'nrg_ind_id'
      if (dict.datasets[dataset]) return { dataset, filters: { geo }, time: { kind: 'all' }, intent: 'snapshot', reporting: { tab: rep } }
    }
  }
  return undefined
}
