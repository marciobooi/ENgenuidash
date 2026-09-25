import type { Lang } from '../i18n'

/**
 * Answer quality: questions with what a correct answer must be. Two levels:
 *
 * - `expect`: what the app does without the model (npm test): the route and, for written answers,
 *   the facts the text must contain (all of `facts`, case- and accent-insensitive).
 * - `model`: for questions the model may answer (#/eval, in the browser): at least one of
 *   `anyOf` must appear and none of `never` (known wrong claims).
 *
 * Add a case whenever an answer is wrong or missing.
 */
export type AnswerRoute = 'plan' | 'definition' | 'quote' | 'passage' | 'offer' | 'smalltalk' | 'refuse' | 'rephrase' | 'unclear' | 'clarify'

export interface AnswerCase {
  q: string
  lang: Lang
  expect: { route: AnswerRoute | AnswerRoute[]; dataset?: string; facts?: string[] }
  model?: { anyOf: string[]; never?: string[] }
}

export const ANSWER_CASES: AnswerCase[] = [
  // ---------- definitions (glossary, word for word) ----------
  { q: 'What is energy dependency?', lang: 'en', expect: { route: ['definition', 'quote'], facts: ['net energy imports', 'gross available energy'] } },
  { q: 'What does ktoe mean?', lang: 'en', expect: { route: ['definition', 'quote'], facts: ['oil equivalent'] } },
  { q: 'What is SIEC?', lang: 'en', expect: { route: ['definition', 'quote'], facts: ['energy product'] } },
  { q: 'What is a heat pump?', lang: 'en', expect: { route: ['definition', 'quote'], facts: ['ambient heat'] } },
  { q: 'What is combined heat and power?', lang: 'en', expect: { route: ['definition', 'quote'], facts: ['heat', 'electricity'] } },
  { q: 'What is gross available energy?', lang: 'en', expect: { route: ['definition', 'quote'], facts: ['gross available energy'] } },
  { q: 'What is final energy consumption?', lang: 'en', expect: { route: ['definition', 'quote'], facts: ['final energy consumption'] } },
  { q: 'What are heating degree days?', lang: 'en', expect: { route: ['definition', 'quote'], facts: ['heating'] } },
  { q: 'What is an energy balance?', lang: 'en', expect: { route: ['definition', 'quote'], facts: ['produced', 'consumed'] } },
  { q: 'What is energy intensity?', lang: 'en', expect: { route: ['definition', 'quote'], facts: ['gdp'] } },
  { q: 'Was ist Energieabhängigkeit?', lang: 'de', expect: { route: ['definition', 'quote'], facts: ['net energy imports'] } },
  { q: 'Qu’est-ce que la dépendance énergétique ?', lang: 'fr', expect: { route: ['definition', 'quote'], facts: ['net energy imports'] } },
  { q: 'Was ist eine Wärmepumpe?', lang: 'de', expect: { route: ['definition', 'quote'], facts: ['ambient heat'] } },
  { q: 'Qu’est-ce que l’intensité énergétique ?', lang: 'fr', expect: { route: ['definition', 'quote'], facts: ['gdp'] } },

  // ---------- methodology (quotes of Eurostat documents) ----------
  { q: 'How is the energy dependency rate calculated?', lang: 'en', expect: { route: ['quote', 'definition'], facts: ['net energy imports', 'gross available energy'] } },
  { q: 'How is the share of renewable energy calculated?', lang: 'en', expect: { route: ['quote', 'definition', 'passage'], facts: ['gross final energy consumption'] } },

  // ---------- "why" questions: the documents support, the model writes ----------
  {
    q: 'Why do countries with more renewables depend less on energy imports?',
    lang: 'en',
    expect: { route: ['passage', 'quote', 'offer'] },
    model: { anyOf: ['domestic', 'own production', 'produce', 'import less', 'less import', 'self'], never: ['not related'] },
  },
  {
    q: 'Why is natural gas important for electricity generation?',
    lang: 'en',
    expect: { route: ['passage', 'quote', 'offer'] },
    // Invented shares ("nearly all electricity comes from natural gas") are wrong: nuclear and
    // renewables are larger sources in the EU.
    model: { anyOf: ['flexib', 'reliab', 'stable', 'balanc', 'backup', 'demand', 'peak', 'supply'], never: ['renewable', 'sustainable', 'nearly all', 'majority of', 'most of the electricity', 'reducing reliance on fossil'] },
  },
  {
    q: 'Warum ist Erdgas für die Stromerzeugung wichtig?',
    lang: 'de',
    expect: { route: ['passage', 'quote', 'offer'] },
    model: { anyOf: ['strom', 'versorgung', 'stabil', 'flexib', 'zuverl'], never: ['nachhaltig', 'erneuerbare energiequelle'] },
  },
  {
    q: 'Pourquoi le gaz naturel est-il important pour produire de l’électricité ?',
    lang: 'fr',
    expect: { route: ['passage', 'quote', 'offer'] },
    model: { anyOf: ['électricité', 'electricite', 'stab', 'flexib', 'fiab', 'approvisionnement'], never: ['renouvelable'] },
  },

  // ---------- data questions → dashboards ----------
  { q: 'What is the energy import dependency of the EU?', lang: 'en', expect: { route: 'plan', dataset: 'nrg_ind_id' } },
  { q: 'Oil consumption in Spain in 2024', lang: 'en', expect: { route: 'plan', dataset: 'nrg_bal_c' } },
  { q: 'Strompreise für Haushalte in Deutschland', lang: 'de', expect: { route: 'plan', dataset: 'nrg_pc_204' } },
  { q: 'Part des énergies renouvelables en France depuis 2010', lang: 'fr', expect: { route: 'plan', dataset: 'nrg_ind_ren' } },
  { q: 'solar capacity in Spain', lang: 'en', expect: { route: 'plan', dataset: 'nrg_inf_epcrw' } },
  { q: 'imports of natural gas from Norway', lang: 'en', expect: { route: 'plan', dataset: 'nrg_ti_gas' } },
  { q: 'Show me energy prices', lang: 'en', expect: { route: 'clarify' } },

  // ---------- small talk, refusals, nonsense ----------
  { q: 'hello', lang: 'en', expect: { route: 'smalltalk' } },
  { q: 'merci', lang: 'fr', expect: { route: 'smalltalk' } },
  { q: 'Write me a poem about oil', lang: 'en', expect: { route: 'refuse' } },
  { q: 'What is the capital of France?', lang: 'en', expect: { route: 'refuse' } },
  { q: 'Erzähl mir einen Witz', lang: 'de', expect: { route: 'refuse' } },
  { q: 'what is the date of oil', lang: 'en', expect: { route: 'rephrase' } },
  { q: 'what colour is natural gas', lang: 'en', expect: { route: 'rephrase' } },
  // Emissions are not in the energy data: no dashboard; at most an on-topic quote from the documents.
  { q: 'greenhouse gas emissions from energy', lang: 'en', expect: { route: ['rephrase', 'unclear', 'offer', 'passage', 'quote'], facts: ['greenhouse'] } },
  // Quotes never come from legal references or publication boilerplate.
  { q: 'What drives energy prices?', lang: 'en', expect: { route: ['passage', 'offer', 'unclear', 'quote'] } },
  { q: 'What are the main drivers of energy import dependency in Europe?', lang: 'en', expect: { route: ['passage', 'offer', 'quote', 'definition'] } },
  { q: 'Welche Faktoren beeinflussen die Strompreise?', lang: 'de', expect: { route: ['passage', 'offer', 'quote', 'unclear', 'plan'] } },
]
