import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createScopeChecker } from '../llm/energyScope'
import { buildKnowledgeIndex } from '../llm/knowledge'
import { buildVocabulary } from '../llm/vocabulary'
import { prepareQuestion } from './prepare'
import { routeMessage } from './route'

// Many users are not native English speakers: questions as they are really typed (broken
// English, typos, keywords only, lead-ins, German and French, other EU languages) must reach the
// right data. Each case: [question, expected dataset(s) or 'route:<kind>', expected country].
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const { docFreq } = buildKnowledgeIndex(read('knowledge.json').passages)
const scope = createScopeChecker(dict, codelists)
const vocabulary = buildVocabulary(dict, codelists, scope.places)

const CASES: [string, string, string?][] = [
  // Broken English, typos, keywords, mixed and other EU languages
  ['what the energy poverty in portugal', 'ilc_mdes01', 'PT'],
  ['portugal how many people cold house', 'ilc_mdes01', 'PT'],
  ['people cant heat home in bulgaria', 'ilc_mdes01', 'BG'],
  ['how much renewable have germany', 'nrg_ind_ren|nrg_bal_c', 'DE'],
  ['renewables share poland vs spain', 'nrg_ind_ren', 'PL'],
  ['which country more depend of energy import', 'nrg_ind_id'],
  ['which country depend most on russian gas', 'nrg_ti_gas|nrg_ind_id|nrg_ti'],
  ['gas import spain 2023', 'nrg_ti_gas|nrg_cb_gas|nrg_bal', 'ES'],
  ['electricity price france household', 'nrg_pc_204', 'FR'],
  ['price of electricity for home in belgium', 'nrg_pc_204', 'BE'],
  ['oil consume italy last 10 year', 'nrg_bal_c', 'IT'],
  ['emissions energy sector eu', 'env_air_gge'],
  ['co2 from energy in poland', 'env_air_gge', 'PL'],
  ['energy efficiency progress eu', 'nrg_ind_eff'],
  ['nuclear france', 'nrg_bal', 'FR'],
  ['coal poland', 'nrg_bal', 'PL'],
  ['gas italy', 'nrg_bal|nrg_cb_gas', 'IT'],
  ['renewables eu', 'nrg_ind_ren|nrg_bal'],
  ['solar power in greece', 'nrg_bal_peh|nrg_ind_peh|nrg_inf|nrg_bal', 'EL'],
  ['wind electricity denmark', 'nrg_bal_peh|nrg_ind_peh|nrg_bal', 'DK'],
  ['renewabel energy in germany', 'nrg_ind_ren|nrg_bal_c', 'DE'],
  ['enrgy import dependancy of eu', 'nrg_ind_id'],
  ['electrcity prices in france', 'nrg_pc_', 'FR'],
  ['consumtion of gas in italy', 'nrg_bal_c|nrg_cb_gas', 'IT'],
  ['portgal energy poverty', 'ilc_mdes01'],
  ['energy poverty in Deutschland', 'ilc_mdes01', 'DE'],
  ['Stromverbrauch in France', 'nrg_bal|nrg_cb_e', 'FR'],
  ['gas consumption en Espagne', 'nrg_bal_c|nrg_cb_gas', 'ES'],
  ['wie viel strom aus wind in deutschland', 'nrg_bal_peh|nrg_ind_peh|nrg_bal', 'DE'],
  ['wieviel erneuerbare in österreich', 'nrg_ind_ren|nrg_bal', 'AT'],
  ['energiearmut portugal', 'ilc_mdes01', 'PT'],
  ['strompreis deutschland haushalte', 'nrg_pc_204', 'DE'],
  ['gasverbrauch italien seit 2015', 'nrg_bal_c|nrg_cb_gas', 'IT'],
  ['abhängigkeit von energieimporten in ungarn', 'nrg_ind_id', 'HU'],
  ['combien de gaz importe la france', 'nrg_ti_gas|nrg_cb_gas|nrg_bal', 'FR'],
  ["prix de l'électricité en belgique", 'nrg_pc_204', 'BE'],
  ['part des renouvelables en suède', 'nrg_ind_ren', 'SE'],
  ['précarité énergétique portugal', 'ilc_mdes01', 'PT'],
  ['consommation de charbon en pologne', 'nrg_bal_c|nrg_cb_sff', 'PL'],
  ['dépendance énergétique italie 2022', 'nrg_ind_id', 'IT'],
  ['pobreza energética en España', 'ilc_mdes01', 'ES'],
  ['consumo de gas en Italia', 'nrg_bal_c|nrg_cb_gas', 'IT'],
  ['energia renovável em Portugal', 'nrg_ind_ren|nrg_bal_c', 'PT'],
  ['energie rinnovabili in Italia', 'nrg_ind_ren|nrg_bal_c', 'IT'],
  ['zużycie węgla w Polsce', 'nrg_bal_c|nrg_cb_sff', 'PL'],
  ['hernieuwbare energie in Nederland', 'nrg_ind_ren|nrg_bal_c', 'NL'],
  // Request lead-ins ("show me", "mount a dashboard of", "zeig mir", "montre-moi"…), and what must not become a dashboard
  ['whats the renewable share in spain', 'nrg_ind_ren', 'ES'],
  ['show me gas imports of italy', 'nrg_ti_gas|nrg_cb_gas|nrg_bal', 'IT'],
  ['tell me about energy poverty in greece', 'ilc_mdes01', 'EL'],
  ['mount the dashboard of oil consumption in france', 'nrg_bal_c', 'FR'],
  ['mount a dashboard with electricity prices in germany', 'nrg_pc_204', 'DE'],
  ['build a dashboard with electricity prices in germany', 'nrg_pc_204', 'DE'],
  ['create a chart of coal consumption in poland', 'nrg_bal_c|nrg_cb_sff', 'PL'],
  ['make me a dashboard about the energy mix of germany', 'nrg_bal', 'DE'],
  ['I want to see nuclear production in france', 'nrg_bal', 'FR'],
  ['i would like to know the energy intensity of poland', 'nrg_ind_ei', 'PL'],
  ['can you show me the energy mix of germany', 'nrg_bal', 'DE'],
  ['could you please give me the renewables share in sweden', 'nrg_ind_ren', 'SE'],
  ['please display energy imports dependency of hungary', 'nrg_ind_id', 'HU'],
  ['hi, show me energy poverty in portugal please', 'ilc_mdes01', 'PT'],
  ['zeig mir den Gasverbrauch in Italien', 'nrg_bal_c|nrg_cb_gas', 'IT'],
  ['erstelle ein Dashboard zum Strompreis in Deutschland', 'nrg_pc_204', 'DE'],
  ['kannst du mir die Energieimportabhängigkeit von Ungarn zeigen', 'nrg_ind_id', 'HU'],
  ['ich möchte den Anteil erneuerbarer Energien in Österreich sehen', 'nrg_ind_ren', 'AT'],
  ['montre-moi la consommation de pétrole en France', 'nrg_bal_c', 'FR'],
  ["fais un tableau de bord sur la dépendance énergétique de l'Italie", 'nrg_ind_id', 'IT'],
  ['peux-tu me montrer la précarité énergétique en Grèce', 'ilc_mdes01', 'EL'],
  ['je voudrais voir la part des renouvelables en Espagne', 'nrg_ind_ren', 'ES'],
  ['what is energy poverty?', 'route:answer'],
  ['what is the capital of France?', 'route:off-topic'],
  ['tell me a joke', 'route:off-topic|answer'],
  ['show me the weather in Paris', 'route:off-topic|rephrase'],
  // The energy mix, however it is asked
  ['energy mix of germany', 'nrg_bal', 'DE'],
  ['energy mix in germany', 'nrg_bal', 'DE'],
  ['the energy mix of germany', 'nrg_bal', 'DE'],
  ['Electricity mix in Germany', 'nrg_bal', 'DE'],
  ['germany energy mix', 'nrg_bal', 'DE'],
]

test('real-world phrasings reach the right data (or the right refusal)', () => {
  const wrong: string[] = []
  for (const [q, want, geo] of CASES) {
    const r = routeMessage(q, {
      current: null,
      dict,
      codelists,
      classify: (x) => scope.classify(x, []),
      unknownWords: (x) => vocabulary.unknownWords(x, docFreq),
      correct: (w) => vocabulary.correct(w, docFreq),
      previous: [],
    })
    const plan = r.kind === 'plan' ? r.plan : null
    const ok = want.startsWith('route:')
      ? want.slice(6).split('|').includes(r.kind)
      : !!plan && want.split('|').some((w) => plan.dataset.startsWith(w)) && (!geo || ([] as string[]).concat(plan.filters.geo ?? []).includes(geo))
    if (!ok) wrong.push(`${q} → ${r.kind} ${plan?.dataset ?? ''} ${JSON.stringify(plan?.filters.geo ?? '')}`)
  }
  assert.deepEqual(wrong, [])
})

test('preparing a question: lead-ins, other languages, typing slips', () => {
  const prep = (q: string) => prepareQuestion(q, { unknownWords: (x) => vocabulary.unknownWords(x, docFreq), correct: (w) => vocabulary.correct(w, docFreq) })
  assert.equal(prep('Please, can you show me the gas imports of Italy?'), 'the gas imports of italy?')
  assert.equal(prep('mount the dashboard of oil consumption in France'), 'oil consumption in france')
  assert.equal(prep('Zeig mir bitte den Gasverbrauch in Italien'), 'den gasverbrauch in italien')
  assert.equal(prep('montre-moi la consommation de pétrole en France'), 'la consommation de petrole en france')
  assert.equal(prep('pobreza energética en España'), 'energy poverty en spain')
  assert.equal(prep('zużycie węgla w Polsce'), 'consumption coal in poland')
  // ("dependancy" is read by its stem "depend…" already, so it is left as typed.)
  assert.equal(prep('enrgy import dependancy of eu'), 'energy import dependancy of eu')
  assert.equal(prep('electrcity prices in france'), 'electricity prices in france')
  // "diese" is German for "these", not a slip of "diesel".
  assert.equal(prep('was bedeuten diese Zahlen?'), 'was bedeuten diese zahlen?')
  assert.equal(prep('whats energy poverty'), 'what is energy poverty')
  // Words of their own are not "corrected": "capital" is not "capita".
  assert.equal(prep('what is the capital of France'), 'what is the capital of france')
})
