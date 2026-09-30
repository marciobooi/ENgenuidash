import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { conceptAnswer } from '../llm/concepts'
import { questionLanguage } from '../llm/crossLingual'
import { createScopeChecker } from '../llm/energyScope'
import { setGlossaryFile } from '../llm/glossary'
import { buildKnowledgeIndex } from '../llm/knowledge'
import { buildVocabulary } from '../llm/vocabulary'
import { prepareQuestion } from './prepare'
import { routeMessage } from './route'

// The same subject asked in the many ways people ask it: other names for what a view shows
// ("energy passport", "who supplies Germany with gas", "how much does electricity cost"), polite
// and roundabout openers, derivations, German and French. Every one must reach its view instead of
// "I don't understand" (see genui/synonyms.ts, genui/prepare.ts and each view's trigger words).
// "*" after a name: any dataset of that family. Questions that must not change are listed too.
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const { docFreq } = buildKnowledgeIndex(read('knowledge.json').passages)
setGlossaryFile(read('glossary.json'))
const scope = createScopeChecker(dict, codelists)
const vocabulary = buildVocabulary(dict, codelists, scope.places)
const unknownWords = (x: string) => vocabulary.unknownWords(x, docFreq)
const correct = (w: string) => vocabulary.correct(w, docFreq)

function view(q: string): string {
  const concept = conceptAnswer([q], questionLanguage(q, 'en'))
  if (concept) return `Concept ${concept.kind}`
  const text = prepareQuestion(q, { unknownWords, correct })
  const verdict = scope.classify(text, [])
  const r = routeMessage(text, { current: null, dict, codelists, classify: () => verdict, unknownWords, correct, previous: [] })
  if (r.kind !== 'plan') return `(${r.kind})`
  const p = r.plan
  if (p.balance) return 'ENbal'
  if (p.trade) return p.trade.monthly ? 'Entrade monthly' : 'Entrade'
  if (p.prices) return 'Enprices'
  if (p.oil) return 'Enoil'
  if (p.sankey) return p.sankey.scope === 'households' ? 'Ensankey households' : 'Ensankey'
  if (p.profile) return 'Endash profile'
  return p.dataset
}

const PHRASINGS: [string, string][] = [
  ["Endash profile", "energy passport of Germany"],
  ["Endash profile", "country energy passport France"],
  ["Endash profile", "show me the energy passport for Spain"],
  ["Endash profile", "energy factsheet Italy"],
  ["Endash profile", "energy fact sheet of Poland"],
  ["Endash profile", "energy snapshot of Denmark"],
  ["Endash profile", "energy card Portugal"],
  ["Endash profile", "country card for Austria"],
  ["Endash profile", "give me an overview of Germany's energy"],
  ["Endash profile", "how is Germany doing on energy"],
  ["Endash profile", "energy situation in Spain"],
  ["Endash profile", "the energy picture of Sweden"],
  ["Endash profile", "everything about energy in Italy"],
  ["Endash profile", "tell me about the energy of Greece"],
  ["Endash profile", "can you show me France's energy profile"],
  ["Endash profile", "I would like to see the energy profile of Belgium"],
  ["Endash profile", "energy in numbers Netherlands"],
  ["Endash profile", "energy summary for Finland"],
  ["Endash profile", "energy at a glance Ireland"],
  ["Endash profile", "national energy profile of Romania"],
  ["Endash profile", "energy country report Czechia"],
  ["Endash profile", "Germany energy overview"],
  ["Endash profile", "Energiepass Deutschland"],
  ["Endash profile", "Energiesteckbrief Österreich"],
  ["Endash profile", "Energieprofil von Frankreich"],
  ["Endash profile", "wie steht Deutschland energetisch da"],
  ["Endash profile", "Energiesituation in Spanien"],
  ["Endash profile", "zeig mir alles zur Energie in Italien"],
  ["Endash profile", "passeport énergétique France"],
  ["Endash profile", "fiche énergie Allemagne"],
  ["Endash profile", "profil énergétique de l'Espagne"],
  ["Endash profile", "situation énergétique de l'Italie"],
  ["Endash profile", "aperçu énergétique de la Belgique"],
  ["Ensankey", "energy flow diagram for Germany"],
  ["Ensankey", "energy flows of France"],
  ["Ensankey", "sankey Spain"],
  ["Ensankey", "show me a sankey of Italy"],
  ["Ensankey", "where does the energy in Germany come from and go"],
  ["Ensankey", "from production to consumption in Poland"],
  ["Ensankey", "energy supply to use diagram for the EU"],
  ["Ensankey", "energy flow chart Netherlands"],
  ["Ensankey", "Energieflussdiagramm Deutschland"],
  ["Ensankey", "Energiefluss Österreich"],
  ["Ensankey", "diagramme des flux d'énergie France"],
  ["Ensankey", "flux énergétiques Espagne"],
  ["Ensankey households", "household energy flow diagram EU"],
  ["Ensankey households", "sankey for households in Germany"],
  ["Ensankey households", "where does household energy go in France"],
  ["Ensankey households/nrg_d_hhq", "how do households use energy in Spain"],
  ["Ensankey households", "flux d'énergie des ménages"],
  ["Ensankey households", "Energiefluss Haushalte Deutschland"],
  ["Enoil", "oil security in the EU"],
  ["Enoil", "oil dependency Europe"],
  ["Enoil", "how much oil does Europe import from Russia"],
  ["Enoil", "oil imports from Russia"],
  ["Enoil", "crude oil supply crisis Germany"],
  ["Enoil", "are we running out of oil in Europe"],
  ["Enoil/nrg_stk_oil", "oil stocks Spain"],
  ["nrg_bal_c", "petrol and diesel supply Italy"],
  ["Enoil", "Russian oil in the EU"],
  ["Enoil", "oil supply risk France"],
  ["Enoil", "Ölabhängigkeit Deutschland"],
  ["Enoil", "Ölimporte aus Russland"],
  ["Enoil", "dépendance pétrolière France"],
  ["Enoil", "pétrole russe Europe"],
  ["Enoil", "approvisionnement en pétrole Espagne"],
  ["Entrade", "where does Germany import gas from"],
  ["Entrade", "who supplies Germany with gas"],
  ["Entrade", "gas suppliers of France"],
  ["Entrade", "main gas partners of Italy"],
  ["Entrade", "Germany gas imports by country of origin"],
  ["Entrade", "where does Spain get its oil from"],
  ["Entrade", "where does the EU buy coal from"],
  ["Entrade", "electricity imports France by partner"],
  ["Entrade", "woher bezieht Deutschland sein Gas"],
  ["Entrade", "Gaslieferanten Deutschland"],
  ["Entrade", "d'où vient le gaz de la France"],
  ["Entrade", "fournisseurs de gaz de l'Italie"],
  ["Entrade monthly", "gas imports of Germany in July 2025"],
  ["Entrade monthly", "how much gas did France import in March 2024 and from where"],
  ["Enprices/nrg_pc_*", "electricity prices in Germany"],
  ["Enprices/nrg_pc_*", "how much does electricity cost in France"],
  ["Enprices/nrg_pc_*", "is electricity expensive in Spain"],
  ["Enprices/nrg_pc_*", "cheapest electricity in Europe"],
  ["Enprices/nrg_pc_*", "gas price for households Italy"],
  ["Enprices/nrg_pc_*", "what do households pay for electricity in Poland"],
  ["(clarify)", "energy bills in Greece"],
  ["Enprices/nrg_pc_*", "Strompreise Deutschland"],
  ["Enprices/nrg_pc_*", "wie teuer ist Strom in Österreich"],
  ["Enprices/nrg_pc_*", "prix de l'électricité en France"],
  ["Enprices/nrg_pc_*", "combien coûte le gaz en Espagne"],
  ["ENbal", "energy balance of Germany"],
  ["ENbal", "energy balance sheet France"],
  ["ENbal", "Energiebilanz Deutschland"],
  ["ENbal", "bilan énergétique de la France"],
  ["nrg_bal_c", "how much energy does Germany produce and consume"],
  ["Concept what", "can you explain what biogas is"],
  ["Concept what", "tell me what LNG is"],
  ["Concept what", "explain wind energy"],
  ["Concept what", "define energy security"],
  ["Concept what", "I'd like to understand energy poverty"],
  ["Concept what", "what's hydropower"],
  ["Concept what", "hydropower meaning"],
  ["Concept what", "biogas definition"],
  ["Concept why", "why does renewable energy matter"],
  ["Concept why", "why should we care about energy efficiency"],
  ["Concept why", "why is energy dependence a risk"],
  ["Concept why", "what is the importance of renewables"],
  ["Concept how", "how do you calculate the renewable share"],
  ["Concept how", "how does Eurostat calculate energy dependency"],
  ["Concept how", "how is the price of gas determined"],
  ["Concept data", "where do you get the wind data"],
  ["Concept data", "what is the source of the energy data"],
  ["Concept data", "how does Eurostat know how much wind power there is"],
  ["Concept data", "how current is the data"],
  ["Concept data", "when is the data updated"],
  ["nrg_bal_c", "oil consumption in Spain"],
  ["nrg_ind_ren", "renewable share in Germany"],
  ["nrg_bal_c", "energy consumption of France in 2020"],
  ["nrg_ind_id", "energy import dependency of Italy"],
  ["nrg_bal_peh", "electricity generation in Poland"],
  ["(off-topic)", "what is the capital of France"],
  ["(off-topic)", "tell me about the weather in Germany"],
  ["(off-topic)", "who won the football game"],
  ["Endash profile", "energy in Spain"],
  ["Endash profile", "Greece's energy"],
  ["Endash profile", "energy of Sweden"],
  ["nrg_bal_c", "coal production in Germany"],
  ["nrg_pc_204", "electricity prices for households in Germany"],
  ["nrg_ind_eff", "energy efficiency in the EU"],
  ["(off-topic)", "how much does a car cost"],
  ["(off-topic)", "I need a pass for the train"],
  ["Endash profile", "Energy profile of households in Germany (or \"industry energy profile of France\")"],
  ["Endash profile", "Portugal profile"],
  ["Endash profile", "show me the energy scorecard of Spain in 2022"],
  ["Endash profile", "fetch the energy overview of ue"],
  ["Endash profile", "grab the key indicators for France"],
  ["Endash profile", "hey, could you pull up the energy profile for Belgium please"],
  ["Endash profile", "i wonder how Croatia is doing energy-wise"],
  ["Endash profile", "do you have an energy overview for Hungary"],
  ["Endash profile", "I need the country profile of Slovakia"],
  ["Endash profile", "quick question: energy profile Lithuania?"],
  ["Endash profile", "energy profil of Germany"],
  ["Endash profile", "enrgy profile Spain"],
  ["Endash profile", "Germany energy profile per capita"],
  ["Endash profile", "compare the energy profile of Germany and France"],
  ["Endash profile", "give me the energy dashboard of Sweden"],
  ["Endash profile", "Energieprofil Polen bitte"],
  ["Endash profile", "kannst du mir das Energieprofil von Italien zeigen"],
  ["Endash profile", "ich möchte das Energieprofil von Spanien sehen"],
  ["Endash profile", "montre-moi le profil énergétique de la Grèce"],
  ["Endash profile", "je voudrais un aperçu énergétique de l'Autriche"],
  ["Endash profile", "pourriez-vous me donner le profil énergétique du Portugal"],
  ["Ensankey", "can you show me the energy flows in Germany"],
  ["Ensankey", "I'd like to see a sankey diagram for Spain"],
  ["Ensankey", "energy sankey EU 2022"],
  ["Ensankey", "sankey diagram of France for 2020"],
  ["Ensankey", "zeig mir das Energieflussdiagramm für Österreich"],
  ["Ensankey", "je voudrais voir le diagramme de flux d'énergie de l'Italie"],
  ["Ensankey households", "sankey diagram households EU"],
  ["Ensankey households", "show me the household sankey for Germany"],
  ["Ensankey households", "Energiefluss der Haushalte in Frankreich"],
  ["Enoil", "show me the oil security dashboard"],
  ["Enoil", "how dependent is Europe on Russian oil"],
  ["Enoil", "what happens to oil supply if Russia stops"],
  ["Enoil", "is Germany vulnerable to an oil crisis"],
  ["Enoil", "oil emergency stocks Germany"],
  ["Enoil", "days of oil stock cover in Italy"],
  ["Enoil", "Ölkrise Europa"],
  ["Enoil", "wie abhängig ist Deutschland von russischem Öl"],
  ["Enoil", "crise pétrolière Europe"],
  ["Enoil/nrg_stk_oil", "stocks de pétrole en France"],
  ["Entrade", "who does Germany buy gas from"],
  ["Entrade", "where does France get its gas"],
  ["Entrade", "biggest suppliers of oil to the EU"],
  ["Entrade", "show me the oil importers of Spain"],
  ["Entrade", "gas imports by country of origin for Italy 2023"],
  ["Entrade", "Germany's coal suppliers"],
  ["Entrade", "trade between France and Germany"],
  ["Entrade", "Erdgasimporte Deutschlands nach Herkunftsland"],
  ["Entrade", "woher importiert Frankreich Erdöl"],
  ["Entrade", "les importations de gaz de l'Italie par pays d'origine"],
  ["Enprices/nrg_pc_*", "how much are households paying for gas in Germany"],
  ["Enprices/nrg_pc_*", "electricity price France"],
  ["Enprices/nrg_pc_*", "is gas getting cheaper in Italy"],
  ["Enprices/nrg_pc_*", "price of electricity for industry in Spain"],
  ["(clarify)", "what does a kWh cost in Poland"],
  ["Enprices/nrg_pc_*", "Stromkosten Deutschland"],
  ["Enprices/nrg_pc_*", "Gaspreise für Haushalte Frankreich"],
  ["Enprices/nrg_pc_*", "le prix du gaz pour les ménages en Espagne"],
  ["Enprices", "electricity price components Germany"],
  ["Enprices", "what taxes are in the electricity price in France"],
  ["Enprices", "breakdown of gas prices in Italy"],
  ["ENbal", "energy balance sheet of Germany 2022"],
  ["ENbal", "show me the energy balance for Spain"],
  ["nrg_bal_c", "how much oil does Germany consume"],
  ["nrg_bal_c", "Spain's total energy consumption"],
  ["nrg_cb_gasm", "monthly gas balance Germany"],
  ["nrg_stk_gas", "gas storage levels in the EU"],
  ["nrg_cb_cosm", "crude oil prices"],
  ["Concept what", "what does LNG stand for"],
  ["Concept what", "can you tell me what biogas is"],
  ["Concept what", "hydropower, what is it"],
  ["Concept what", "explain to me what energy poverty is"],
  ["Concept what", "Was bedeutet Energiearmut"],
  ["Concept what", "c'est quoi le biogaz"],
  ["Concept why", "why is wind power important"],
  ["Concept why", "why do we need renewables"],
  ["Concept why", "pourquoi l'efficacité énergétique est-elle importante"],
  ["Concept how", "how is gas measured"],
  ["Concept how", "how do they calculate the share of renewables"],
  ["Concept how", "wie wird die Energieabhängigkeit berechnet"],
  ["Concept data", "where does the solar data come from"],
  ["Concept data", "who collects the energy data"],
  ["Concept data", "how up to date is the data"],
  ["Concept data", "d'où viennent les données sur le gaz"],
]

test('every way of asking reaches its view', () => {
  const wrong: string[] = []
  for (const [expected, q] of PHRASINGS) {
    const got = view(q)
    const ok = expected.split('/').some((e) => (e.endsWith('*') ? got.startsWith(e.slice(0, -1)) : got === e))
    if (!ok) wrong.push(`${q}
    expected ${expected}, got ${got}`)
  }
  assert.deepEqual(wrong, [])
})
