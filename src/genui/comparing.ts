/**
 * "Compare with France", "versus the EU", "compared to last year", "no comparison": what a follow-up
 * asks to set a dashboard against, shared by the views that compare (balance, oil; trade and the energy
 * flow diagram have the same rules inline). A comparison is a place (another country, or the EU) or
 * earlier years ("y1", "y5", "y10").
 */
export const COMPARE = /\b(compare|compared|comparing|comparison|versus|vs|against|gegen|vergleich\w*|verglichen|comparer|compar\w*|par rapport|rapport)\b/
export const NO_COMPARE = /\b(no comparison|without comparison|remove (the )?comparison|stop comparing|ohne vergleich|sans comparaison)\b/
/** "last year", "previous year", "5 years earlier"… → how many years back. */
export function yearsBack(text: string): 'y1' | 'y5' | 'y10' | undefined {
  if (/\b(last year|previous year|prior year|year before|year earlier|1 year (earlier|ago|before)|vorjahr\w*|letztes jahr|letzten jahr|annee precedente|annee derniere|an dernier|un an avant)\b/.test(text)) return 'y1'
  if (/\b(5|five|fünf|funf|cinq) years? (earlier|ago|before|zuvor|fruher|avant)\b/.test(text)) return 'y5'
  if (/\b(10|ten|zehn|dix) years? (earlier|ago|before|zuvor|fruher|avant)\b/.test(text)) return 'y10'
  return undefined
}

export type CompareRequest = { target: string } | { off: true } | null

/**
 * What the message asks of the comparison of a dashboard on `here`: a place or earlier years to
 * compare with (a bare "compare" means the EU), "off", or nothing. `allowed`: the places the view
 * has; `years`: whether the view can compare with earlier years (otherwise those are left to the
 * caller: null).
 */
export function compareRequest(text: string, places: { codes: string[]; eu?: boolean }, allowed: string[], here: string, years: boolean): CompareRequest {
  if (NO_COMPARE.test(text)) return { off: true }
  if (!COMPARE.test(text)) return null
  const back = yearsBack(text)
  if (back) return years ? { target: back } : null
  const other = places.eu ? 'EU27_2020' : places.codes.find((c) => c !== here && allowed.includes(c))
  const target = other ?? (here !== 'EU27_2020' ? 'EU27_2020' : undefined)
  return target && target !== here ? { target } : null
}
