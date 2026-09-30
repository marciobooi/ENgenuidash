import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { conceptAnswer } from '../llm/concepts'
import { questionLanguage } from '../llm/crossLingual'
import { createScopeChecker } from '../llm/energyScope'
import { setGlossaryFile } from '../llm/glossary'
import { buildKnowledgeIndex } from '../llm/knowledge'
import { buildVocabulary } from '../llm/vocabulary'
import { isMonthlyDataset } from './monthly'
import { routeMessage, type Route } from './route'
import type { Plan } from './types'

// docs/prompts.md lists the questions people try, section by section (one section per tool). Every one is
// run through the router and must reach the view it is listed for; a question added to the file needs a
// line here too, so the list stays a real test of the routing.
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const { docFreq } = buildKnowledgeIndex(read('knowledge.json').passages)
setGlossaryFile(read('glossary.json'))
const scope = createScopeChecker(dict, codelists)
const vocabulary = buildVocabulary(dict, codelists, scope.places)

const route = (text: string, current: Plan | null = null): Route =>
  routeMessage(text, { current, dict, codelists, classify: scope.classify, unknownWords: (x) => vocabulary.unknownWords(x, docFreq), correct: (w) => vocabulary.correct(w, docFreq), previous: [] })

/** The view a route reaches: the tool's name, or the dataset of an ordinary dashboard. */
function view(r: Route): string {
  if (r.kind !== 'plan' && r.kind !== 'refine') return `(${r.kind})`
  const p = r.plan
  if (p.balance) return 'ENbal'
  if (p.trade) return p.trade.monthly ? 'Entrade monthly' : 'Entrade'
  if (p.prices) return 'Enprices'
  if (p.oil) return 'Enoil'
  if (p.sankey) return p.sankey.scope === 'households' ? 'Ensankey households' : 'Ensankey'
  if (p.profile) return 'Endash profile'
  return isMonthlyDataset(p.dataset) ? `Enmonthly ${p.dataset}` : p.dataset
}

const EXPECTED: [string, string][] = [
  // Entrade
  ['Entrade', 'Imports of oil and petroleum products by partner: Eu , 2024'],
  ['Entrade', 'Imports of natural gas by partner: France, 2024'],
  // a month asked for: the monthly trade by partner (gas and oil have monthly data)
  ['Entrade monthly', 'Imports: Natural gas, Germany, July 2025'],
  ['Entrade monthly', 'Exports of oil and petroleum products by partner, EU, March 2023'],
  ['Entrade monthly', 'where does France import gas from in May 2024'],
  // the monthly gas balance keeps its own questions
  ['Enmonthly nrg_cb_gasm', 'monthly gas imports of Germany'],
  ['Enmonthly nrg_cb_gasm', 'gas balance Germany July 2025'],
  ['Entrade', 'show energy trade between spain and germany'],
  ['Entrade', 'Oil and petroleum products trade between france and germany, 2022'],
  ['Enmonthly nrg_cb_cosm', 'Crude oil imports: price and volume, 27 countries selected (weighted average), July 2026'],
  ['Entrade monthly', 'monthly imports of natural gas by partner Germany'],
  // ENbal
  ['ENbal', 'energy balance of the EU 2024'],
  ['ENbal', 'European Union (27 countries), Total - main fuel families, 2024'],
  // Enprices
  ['Enprices', 'what does the electricity price consist of'],
  ['nrg_pc_204', 'show all available countries for Electricity prices for household consumers'],
  ['nrg_pc_203', 'Gas price for non-household: Netherlands, 2025'],
  ['Enmonthly nrg_cb_cosm', 'crude oil prices'],
  // Endash
  ['nrg_ind_ren', 'Share of energy from renewable sources'],
  ['nrg_ind_ei', 'Energy intensity'],
  ['nrg_bal_c', 'Final energy consumption in services by type of fuel'],
  ['Endash profile', 'Energy profile: Germany'],
  ['Endash profile', 'energy profile of households in Germany'],
  ['Endash profile', 'industry energy profile of France'],
  ['Endash profile', 'energy profile of Germany per capita'],
  ['Endash profile', 'energy profile of Germany vs France'],
  ['Endash profile', 'country energy dashboard for Spain'],
  ['Endash profile', 'Energieprofil Deutschland'],
  ['Endash profile', 'profil énergétique de la France'],
  ['Endash profile', 'key energy indicators Italy'],
  // Ensankey
  ['Ensankey', 'Energy flow diagram: European Union - 27 countries, 2024'],
  ['Ensankey households', 'Energy flow diagram, households: Germany, 2024'],
  ['Ensankey', 'sankey Germany 2022'],
  ['Ensankey', 'energy flow diagram of Germany in GWh'],
  ['Ensankey', 'energy flows of the EU by fuel'],
  ['Ensankey', 'Energieflussdiagramm Deutschland'],
  ['Ensankey', 'show me the energy flows of Poland'],
  ['Ensankey households', 'energy flow diagram household'],
  ['Ensankey households', 'the energy flow for house hold in ue in 2020'],
  ['Ensankey households', 'energy flow of homes in France'],
  ['Ensankey households', 'sankey diagram for households Spain 2023'],
  // Enmonthly
  ['Enmonthly nrg_cb_gasm', 'Supply, transformation and consumption of gas - monthly data'],
  ['Enmonthly nrg_cb_pem', 'Renewables vs non-renewables electricity monthly EU'],
  ['Enmonthly nrg_cb_pem', 'Net electricity generation, renewables and non-renewables: EU-27, June 2026'],
  ['Enmonthly nrg_cb_pem', 'Net electricity generation, renewables and non-renewables: Germany, Spain, France, July 2026'],
  ['Enmonthly nrg_stk_oilm', 'Closing stock - national territory: Oil and petroleum products, EU-27, June 2026'],
  ['Enmonthly nrg_stk_oilm', 'monthly oil stocks in the EU'],
  // Enoil
  ['Enoil', 'oil security dashboard for Germany'],
  ['Enoil', 'How dependent is Italy on Russian oil?'],
  ['Enoil', 'Oil crisis in the EU'],
  ['Enoil', 'Oil stock cover in Germany'],
  ['Enoil', 'Russian oil in the EU'],
  ['Enoil', 'Petroleum situation in Spain'],
  ['Enoil', 'Ölversorgung Krise Deutschland'],
  ['Enoil', 'sécurité pétrolière France'],
  ['Enoil', 'how many days of oil stocks does Germany have'],
  ['Enoil', 'how much oil does Europe import from Russia'],
  // Geral
  ['nrg_ind_peh', 'Gross and net production of electricity and derived heat by type of plant and operator'],
  ['nrg_ind_ren', 'Renewable share vs the 2030 target in eu'],
  ['nrg_d_hhq', 'Disaggregated final energy consumption in households - quantities'],
  ['nrg_ind_ren', 'Renewable energy share Germany vs France and the 2030 target'],
  ['nrg_ind_eff', 'Primary and final energy consumption and the 2030 efficiency targets'],
  ['ten00126', 'Final energy consumption in transport by type of fuel'],
  ['nrg_ind_pehcf', 'Gross production of electricity and derived heat from combustible fuels by type of plant and operator'],
  // definitions and how-it-works questions: answered from src/llm/concepts.json in the chat
  ['Concept what', 'what is biogas?'],
  ['Concept what', 'what is wind energy?'],
  ['Concept what', 'what is LNG?'],
  ['Concept what', 'what is energy poverty?'],
  ['Concept what', 'what is the difference between capacity and generation?'],
  ['Concept what', 'what is the difference between primary and final energy?'],
  ['Concept what', 'what is the EU target for renewables in 2030?'],
  ['Concept why', 'why are renewables important?'],
  ['Concept why', 'why is energy security important?'],
  ['Concept why', 'why is energy efficiency important?'],
  ['Concept how', 'how is natural gas calculated?'],
  ['Concept how', 'how is the share of renewables calculated?'],
  ['Concept how', 'how is energy dependency calculated?'],
  ['Concept how', 'how is gross available energy calculated?'],
  ['Concept how', 'how are energy prices calculated?'],
  ['Concept data', 'how do we get data on wind power?'],
  ['Concept data', 'where does Eurostat get energy data?'],
  ['Concept data', 'how often is energy data updated?'],
  ['Concept what', 'Was ist Biogas?'],
  ['Concept why', 'Warum sind erneuerbare Energien wichtig?'],
  ['Concept data', 'Woher kommen die Winddaten?'],
  ['Concept what', "Qu'est-ce que l'énergie éolienne ?"],
  ['Concept how', "Comment sont calculés les prix de l'énergie ?"],
  ['Endash profile', 'Energy profile of households in Germany (or "industry energy profile of France")'],
  ['Endash profile', 'Portugal profile'],
  ['Endash profile', 'show me the energy scorecard of Spain in 2022'],
  ['Endash profile', 'fetch the energy overview of ue'],
  ['Endash profile', 'grab the key indicators for France'],
  // words that look like a view's words but ask for something else
  ['nrg_bal_c', 'oil consumption in Spain'],
  ['(off-topic)', 'what is a sankey diagram'],
]

test('every question of docs/prompts.md reaches the view it is listed for', () => {
  const wrong: string[] = []
  for (const [expected, question] of EXPECTED) {
    // (a definition is answered in the chat before the router is asked)
    const concept = conceptAnswer([question], questionLanguage(question, 'en'))
    const got = concept ? `Concept ${concept.kind}` : view(route(question))
    if (got !== expected) wrong.push(`${question}\n    expected ${expected}, got ${got}`)
  }
  assert.deepEqual(wrong, [])
})

test('the file and this list agree: a question added to docs/prompts.md needs its expected view here', () => {
  const listed = new Set(EXPECTED.map(([, q]) => q.trim().toLowerCase()))
  const missing = readFileSync('docs/prompts.md', 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*-\s*(.+)$/)?.[1].trim())
    .filter((q): q is string => !!q)
    // (a follow-up, asked with a dashboard on screen: tested below)
    .filter((q) => q.toLowerCase() !== 'now components')
    .filter((q) => !listed.has(q.toLowerCase()))
  assert.deepEqual(missing, [])
})

test('"now components" on the price dashboard on screen switches it to its components', () => {
  // (the plain price dashboard first, as in the file's order: all countries for household electricity prices)
  const first = route('show all available countries for Electricity prices for household consumers')
  assert.equal(first.kind, 'plan')
  const next = route('now components', (first as Extract<Route, { kind: 'plan' }>).plan)
  assert.equal(next.kind, 'refine')
  assert.equal(view(next), 'Enprices')
})
