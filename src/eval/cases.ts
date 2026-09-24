import type { DashboardSpec } from '../genui/types'
import type { Lang } from '../i18n'

/**
 * Follow-up messages with the action they should map to, on a fixed dashboard (EU energy import
 * dependency, 2018). Expected ids are those of dashboardActions: 'top', 'bottom', 'all', 'trend',
 * 'explain', 'bar', 'line', 'table', 'year-2015', 'add-DE', 'only-DE', or 'none'.
 * Add cases here whenever a real message is misunderstood.
 */
export const EVAL_DASHBOARD = {
  title: 'Energy imports dependency',
  subtitle: 'Total · EU-27 · %',
  plan: {
    dataset: 'nrg_ind_id',
    filters: { geo: 'EU27_2020', unit: 'PC', siec: 'TOTAL' },
    time: { kind: 'range', since: '2009', until: '2018' },
    intent: 'snapshot',
    focusPeriod: '2018',
  },
} as unknown as DashboardSpec

export const EVAL_CASES: { text: string; lang: Lang; expect: string }[] = [
  // English
  { lang: 'en', text: 'show the trend', expect: 'trend' },
  { lang: 'en', text: 'how has it changed over the years?', expect: 'trend' },
  { lang: 'en', text: 'what did it look like before?', expect: 'trend' },
  { lang: 'en', text: 'which countries depend the most on imports?', expect: 'top' },
  { lang: 'en', text: 'who are the most dependent countries', expect: 'top' },
  { lang: 'en', text: 'which member states are least dependent?', expect: 'bottom' },
  { lang: 'en', text: 'the least dependent ones', expect: 'bottom' },
  { lang: 'en', text: 'how do all the countries compare?', expect: 'all' },
  { lang: 'en', text: 'show every member state', expect: 'all' },
  { lang: 'en', text: 'what do these numbers mean?', expect: 'explain' },
  { lang: 'en', text: 'can you interpret this for me?', expect: 'explain' },
  { lang: 'en', text: 'why is it so high?', expect: 'explain' },
  { lang: 'en', text: 'bars please', expect: 'bar' },
  { lang: 'en', text: 'I prefer columns', expect: 'bar' },
  { lang: 'en', text: 'draw it as a line', expect: 'line' },
  { lang: 'en', text: 'just give me the raw numbers in a grid', expect: 'table' },
  { lang: 'en', text: 'what about Germany?', expect: 'add-DE' },
  { lang: 'en', text: 'show Germany instead', expect: 'only-DE' },
  { lang: 'en', text: 'Germany alone', expect: 'only-DE' },
  { lang: 'en', text: 'go back to 2015', expect: 'year-2015' },
  { lang: 'en', text: 'what was it in 2015?', expect: 'year-2015' },
  { lang: 'en', text: 'thanks!', expect: 'none' },
  { lang: 'en', text: 'what is the weather tomorrow', expect: 'none' },
  // German
  { lang: 'de', text: 'wie hat sich das entwickelt?', expect: 'trend' },
  { lang: 'de', text: 'welche Länder sind am abhängigsten?', expect: 'top' },
  { lang: 'de', text: 'welche Länder sind am wenigsten abhängig?', expect: 'bottom' },
  { lang: 'de', text: 'alle Mitgliedstaaten vergleichen', expect: 'all' },
  { lang: 'de', text: 'was bedeuten diese Zahlen?', expect: 'explain' },
  { lang: 'de', text: 'lieber als Balken', expect: 'bar' },
  { lang: 'de', text: 'als Tabelle bitte', expect: 'table' },
  { lang: 'de', text: 'nur Deutschland', expect: 'only-DE' },
  { lang: 'de', text: 'und 2015?', expect: 'year-2015' },
  // French
  { lang: 'fr', text: 'comment ça a évolué ?', expect: 'trend' },
  { lang: 'fr', text: 'quels pays sont les plus dépendants ?', expect: 'top' },
  { lang: 'fr', text: 'quels pays sont les moins dépendants ?', expect: 'bottom' },
  { lang: 'fr', text: 'compare tous les pays', expect: 'all' },
  { lang: 'fr', text: 'que signifient ces chiffres ?', expect: 'explain' },
  { lang: 'fr', text: 'en barres s’il te plaît', expect: 'bar' },
  { lang: 'fr', text: 'sous forme de tableau', expect: 'table' },
  { lang: 'fr', text: 'seulement l’Allemagne', expect: 'only-DE' },
  { lang: 'fr', text: 'et en 2015 ?', expect: 'year-2015' },
]
