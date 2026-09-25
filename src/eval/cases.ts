import type { DashboardSpec } from '../genui/types'
import type { Lang } from '../i18n'

/**
 * Follow-up messages with the action they should map to, on a fixed dashboard (EU energy import
 * dependency, 2018). Expected ids are those of dashboardActions: 'top', 'bottom', 'all', 'trend',
 * 'explain', 'bar', 'line', 'table', 'year-2015', 'add-DE', 'only-DE', 'back' (previous dashboard),
 * 'other' (a valid change that is
 * not in the menu, e.g. "since 2015") or 'none' (nothing to change: off-topic, thanks, nonsense).
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

  // ---------- edge cases ----------
  // Explicit numbers (the menu's top/bottom option uses the number in the message)
  { lang: 'en', text: 'top 3', expect: 'top' },
  { lang: 'en', text: 'show the 10 lowest', expect: 'bottom' },
  { lang: 'de', text: 'die 5 höchsten Länder', expect: 'top' },
  { lang: 'fr', text: 'les 3 derniers pays', expect: 'bottom' },
  // Case, missing accents and umlauts, punctuation
  { lang: 'en', text: 'WHICH COUNTRIES ARE THE MOST DEPENDENT?!', expect: 'top' },
  { lang: 'de', text: 'welche lander sind am abhangigsten', expect: 'top' },
  { lang: 'fr', text: 'quels pays sont les plus dependants', expect: 'top' },
  { lang: 'en', text: '   bars   please   ', expect: 'bar' },
  // A bare year or place
  { lang: 'en', text: '2015', expect: 'year-2015' },
  { lang: 'en', text: 'Germany', expect: 'only-DE' },
  { lang: 'de', text: 'Deutschland?', expect: 'only-DE' },
  // Mixed languages
  { lang: 'en', text: 'show me Deutschland', expect: 'only-DE' },
  { lang: 'en', text: 'add Allemagne', expect: 'add-DE' },
  // Valid changes that are not menu options
  { lang: 'en', text: 'since 2015', expect: 'other' },
  { lang: 'en', text: 'last 5 years', expect: 'other' },
  { lang: 'de', text: 'seit 2015', expect: 'other' },
  { lang: 'fr', text: 'depuis 2015', expect: 'other' },
  { lang: 'en', text: 'in 2015 as a table', expect: 'other' },
  // Nothing to change: off-topic, small talk, nonsense (must never trigger an action)
  { lang: 'en', text: 'write me a poem about oil', expect: 'none' },
  { lang: 'en', text: 'what is the capital of France', expect: 'none' },
  { lang: 'en', text: 'tell me a joke', expect: 'none' },
  { lang: 'en', text: 'asdfgh qwerty', expect: 'none' },
  { lang: 'en', text: 'ok', expect: 'none' },
  { lang: 'en', text: 'which source is the largest', expect: 'none' },
  { lang: 'de', text: 'danke schön', expect: 'none' },
  { lang: 'de', text: 'erzähl mir einen Witz', expect: 'none' },
  { lang: 'fr', text: 'merci beaucoup', expect: 'none' },
  { lang: 'fr', text: 'quelle est la capitale de la France', expect: 'none' },

  // ---------- more follow-ups ----------
  // Adding countries on a single year: a comparison for that year
  { lang: 'en', text: 'add Italy and Spain', expect: 'other' },
  { lang: 'de', text: 'und Frankreich?', expect: 'add-FR' },
  { lang: 'fr', text: 'et l’Espagne ?', expect: 'add-ES' },
  { lang: 'en', text: 'compare with Italy', expect: 'add-IT' },
  { lang: 'en', text: 'only Germany and France', expect: 'other' },
  // Another product, same indicator
  { lang: 'en', text: 'what about oil?', expect: 'other' },
  { lang: 'en', text: 'and for natural gas', expect: 'other' },
  { lang: 'fr', text: 'et pour le pétrole ?', expect: 'other' },
  // Time
  { lang: 'en', text: 'more years', expect: 'trend' },
  { lang: 'en', text: 'all years', expect: 'trend' },
  { lang: 'en', text: 'the latest year', expect: 'other' },
  { lang: 'en', text: 'from 2010 to 2015', expect: 'other' },
  { lang: 'de', text: 'nur Polen seit 2010', expect: 'other' },
  // Rankings and views
  { lang: 'en', text: 'top 10', expect: 'top' },
  { lang: 'en', text: 'the 3 lowest', expect: 'bottom' },
  { lang: 'en', text: 'I want a map', expect: 'all' },
  { lang: 'en', text: 'show it as a pie', expect: 'other' }, // applied; the pie is not among the 8 menu options
  // Back to the previous dashboard
  { lang: 'en', text: 'go back', expect: 'back' },
  { lang: 'en', text: 'undo', expect: 'back' },
  { lang: 'de', text: 'zurück', expect: 'back' },
  { lang: 'fr', text: 'retour', expect: 'back' },
  // Questions about the figures on screen: explained
  { lang: 'en', text: 'is that good?', expect: 'explain' },
  { lang: 'en', text: 'why did it rise in 2022?', expect: 'explain' },
  { lang: 'de', text: 'ist das viel?', expect: 'explain' },
  { lang: 'fr', text: 'pourquoi est-ce que ça a baissé ?', expect: 'explain' },
  // Nothing to change
  { lang: 'en', text: 'thanks, that is great', expect: 'none' },
  { lang: 'de', text: 'Danke, super', expect: 'none' },
  { lang: 'en', text: 'Why is gas important for electricity?', expect: 'none' },
]
