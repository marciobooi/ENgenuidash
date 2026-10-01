import { codeLabel, loadEnergyCodelists, type EnergyDictionary } from '../data/eurostat'
import type { Plan } from './types'

/**
 * What a dashboard that compares shows of it: the title says what it is set against ("… (vs France)")
 * and the toolbar has a "Compare with" select (nothing, earlier years where the view can, the EU and
 * the countries of the dataset), so a comparison is visible and can be changed without typing.
 */
export const withVersus = (title: string, other: string | undefined, lang: string) => (other ? `${title} (${lang === 'de' ? 'gegen' : lang === 'fr' ? 'contre' : 'vs'} ${other})` : title)

export interface CompareStrings {
  compareWith: string
  compareNone: string
  /** Earlier years, when the view can compare with them. */
  yearsEarlier1?: string
  yearsEarlierN?: string
}

/** The "Compare with" choice: `set` is the plan with that comparison (undefined: none). */
export async function compareChoice({ plan, dict, dataset, lang, current, set, t, years = false }: { plan: Plan; dict: EnergyDictionary; dataset: string; lang: string; current: string | undefined; set: (code: string | undefined) => Plan; t: CompareStrings; years?: boolean }) {
  // (the names come from the codelists the browser loads; without them, in tests, the codes stand in)
  const codelists = await loadEnergyCodelists().catch(() => null)
  const dim = dict.datasets[dataset]?.dimensions.find((d) => d.id === 'geo')
  const here = String(plan.filters.geo ?? 'EU27_2020')
  const name = (code: string) => (code === 'EU27_2020' ? 'EU-27' : (codelists ? codeLabel(codelists, dim?.codelist ?? null, code, lang) : code).replace(/\s*\(.*?\)\s*$/, ''))
  const countries = (dim?.codes ?? [])
    .filter((c) => c !== here && /^[A-Z]{2}$/.test(c))
    .map((c) => ({ code: c, label: name(c) }))
    .sort((a, b) => a.label.localeCompare(b.label, lang))
  const places = [...(here !== 'EU27_2020' && dim?.codes.includes('EU27_2020') ? [{ code: 'EU27_2020', label: 'EU-27' }] : []), ...countries]
  return {
    key: 'compare',
    label: t.compareWith,
    options: [
      { label: t.compareNone, plan: set(undefined), active: !current },
      ...(years && t.yearsEarlier1 && t.yearsEarlierN
        ? [1, 5, 10].map((n) => ({ label: n === 1 ? t.yearsEarlier1! : t.yearsEarlierN!.replace('{n}', String(n)), plan: set(`y${n}`), active: current === `y${n}` }))
        : []),
      ...places.map((c) => ({ label: c.label, plan: set(c.code), active: current === c.code })),
    ],
  }
}
