import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runEval, summarize } from '../eval/runEval'
import { createScopeChecker } from '../llm/energyScope'
import { buildKnowledgeIndex } from '../llm/knowledge'
import { buildVocabulary } from '../llm/vocabulary'
import { routeMessage, type Route } from './route'
import type { Plan } from './types'

// The same local data the app loads (public/data), read from disk.
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const { docFreq } = buildKnowledgeIndex(read('knowledge.json').passages)
const scope = createScopeChecker(dict, codelists)
const vocabulary = buildVocabulary(dict, codelists, scope.places)

function route(text: string, current: Plan | null = null, previous: string[] = []): Route {
  return routeMessage(text, { current, dict, codelists, classify: scope.classify, unknownWords: (x) => vocabulary.unknownWords(x, docFreq), previous })
}
const planOf = (text: string) => {
  const r = route(text)
  assert.equal(r.kind, 'plan', `${text} → ${r.kind}`)
  return (r as Extract<Route, { kind: 'plan' }>).plan
}

// ---------- first questions → dashboards ----------

test('data questions build a dashboard from the right dataset', () => {
  assert.equal(planOf('What is the energy import dependency of the EU?').dataset, 'nrg_ind_id')
  assert.equal(planOf('Which countries depend the most on energy imports?').dataset, 'nrg_ind_id')
  assert.equal(planOf('Renewable energy share in Spain since 2010').dataset, 'nrg_ind_ren')
  assert.equal(planOf('Wie hoch ist die Energieimportabhängigkeit in Deutschland?').dataset, 'nrg_ind_id')
  assert.equal(planOf('Dépendance énergétique de la France').dataset, 'nrg_ind_id')
})

test('"top 5" and superlatives rank all EU countries', () => {
  assert.deepEqual(planOf('top 5 countries for energy import dependency').top, { n: 5 })
  assert.deepEqual(planOf('the 3 least dependent countries on energy imports').top, { n: 3, lowest: true })
  const p = planOf('Which countries depend the most on energy imports?')
  assert.equal(p.intent, 'compare')
  assert.deepEqual(p.top, { n: 5 })
})

test('a year in the question focuses the dashboard on that year', () => {
  const p = planOf('energy import dependency of Spain, France and Italy in 2022')
  assert.equal(p.focusPeriod, '2022')
  assert.equal(p.intent, 'compare')
})

// ---------- guards ----------

test('off-topic and creative requests never reach the planner or the model', () => {
  for (const text of ['Write me a poem', 'write me a poem about oil', 'What is the capital of France?', 'tell me a joke', 'Erzähl mir einen Witz', 'raconte-moi une blague', 'what is the weather tomorrow']) {
    const r = route(text)
    assert.ok(r.kind === 'off-topic' || r.kind === 'rephrase', `${text} → ${r.kind}`)
  }
})

test('energy words about something the data does not cover ask to rephrase', () => {
  for (const text of ['what is the date of oil', 'what colour is natural gas']) assert.equal(route(text).kind, 'rephrase', text)
})

test('greetings and thanks are small talk, not dashboards', () => {
  for (const text of ['hello', 'thanks!', 'merci', 'danke']) {
    const r = route(text)
    assert.ok(r.kind === 'answer' && r.smallTalk, `${text} → ${r.kind}`)
  }
})

test('with no dashboard, "explain these figures" is not an explain request', () => {
  assert.notEqual(route('Explain these figures').kind, 'explain')
})

// ---------- follow-ups on a dashboard (src/eval/cases.ts) ----------

test('labelled follow-ups: no wrong action, every case handled by the rules', async () => {
  const results = await runEval(dict, codelists, undefined, undefined, docFreq)
  const wrong = results.filter((r) => r.verdict === 'wrong').map((r) => `${r.text} → ${r.outcome} (expected ${r.expect})`)
  assert.deepEqual(wrong, [])
  const s = summarize(results)
  assert.equal(s.correct, s.total, `${s.asked} messages fall back to buttons`)
})

test('German and French "why" questions are answered, not refused', () => {
  for (const text of ['Warum ist Erdgas für die Stromerzeugung wichtig?', 'Pourquoi l’énergie nucléaire est-elle importante en France ?']) {
    const r = route(text)
    assert.ok(r.kind === 'answer' || r.kind === 'plan', `${text} → ${r.kind}${r.kind === 'rephrase' ? ` (${r.unknown})` : ''}`)
  }
})

test('"produire" is understood in a French question', () => {
  const r = route('Pourquoi le gaz naturel est-il important pour produire de l’électricité ?')
  assert.notEqual(r.kind, 'rephrase', JSON.stringify(r))
})

test('German price compounds ("Strompreise") plan a price dashboard', () => {
  assert.match(planOf('Strompreise für Haushalte in Deutschland').dataset, /^nrg_pc_204/)
  assert.match(planOf('Gaspreise für die Industrie in Frankreich').dataset, /^nrg_pc_203/)
})

test('questions about any energy dataset pass the guards and build a dashboard', () => {
  const blocked: string[] = []
  for (const q of [
    'gas storage in Germany', 'heat pumps in Sweden', 'solar capacity in Spain', 'imports of natural gas from Norway',
    'wood pellets consumption in Austria', 'peat in Finland', 'LNG imports in Spain', 'batteries storage capacity',
    'emergency oil stocks in days', 'hydrogen production capacity', 'data centres electricity consumption',
    'energy self-reliance', 'rate of electrification', 'crude oil imports by country of origin', 'Gasimporte aus Russland',
    'Holzpellets in Österreich', 'capacité solaire en France', 'stocks de pétrole en France',
  ]) {
    const r = route(q)
    if (r.kind !== 'plan') blocked.push(`${q} → ${r.kind}${r.kind === 'rephrase' ? ` (${r.unknown})` : ''}`)
  }
  assert.deepEqual(blocked, [])
})

// ---------- follow-ups on a dashboard ----------

const onDependency = (text: string) => route(text, planOf('What is the energy import dependency of the EU?'), ['What is the energy import dependency of the EU?'])
const refined = (text: string) => {
  const r = onDependency(text)
  assert.equal(r.kind, 'refine', `${text} → ${r.kind}`)
  return (r as Extract<Route, { kind: 'refine' }>).plan
}

test('"what about oil?" keeps the indicator and switches the product', () => {
  const p = refined('what about oil?')
  assert.equal(p.dataset, 'nrg_ind_id')
  assert.equal(p.filters.siec, 'O4000XBIO')
  assert.equal(refined('et pour le gaz ?').filters.siec, 'G3000')
})

test('"oil consumption in Spain" on the dependency dashboard is a new question', () => {
  assert.equal(onDependency('oil consumption in Spain').kind, 'plan')
})

test('go back / undo / zurück / retour return to the previous dashboard', () => {
  for (const t of ['go back', 'undo', 'zurück', 'retour', 'previous dashboard']) assert.equal(onDependency(t).kind, 'back', t)
})

test('questions about the figures on screen are explained; general questions are answered', () => {
  for (const t of ['is that good?', 'why did it rise?', 'why is it so high?', 'ist das viel?', 'pourquoi ça a baissé ?']) assert.equal(onDependency(t).kind, 'explain', t)
  assert.equal(onDependency('Why is gas important for electricity?').kind, 'answer')
})

test('more years, all years and the latest year change the period', () => {
  assert.deepEqual(refined('more years').time, { kind: 'all' })
  const latest = refined('the latest year')
  assert.ok(latest.focusPeriod && Number(latest.focusPeriod) >= 2023, latest.focusPeriod)
})

test('"I want a map" shows all countries (the comparison has the map)', () => {
  const p = refined('I want a map')
  assert.ok(Array.isArray(p.filters.geo) && p.filters.geo.length === 27)
})

test('thanks with a compliment is small talk, not off-topic', () => {
  for (const t of ['thanks, that is great', 'Danke, super', 'merci, c’est parfait']) {
    const r = onDependency(t)
    assert.ok(r.kind === 'answer' && r.smallTalk, `${t} → ${r.kind}`)
  }
})

test('"add all available countries to this daash": all countries, despite the words in between and the typo', () => {
  const current = planOf('What is the energy import dependency of the EU?')
  for (const text of [
    'add all available countries to this daash',
    'add all available countries to this dashboard',
    'show every EU member state',
    'alle verfügbaren Länder anzeigen',
    'ajoute tous les pays disponibles',
  ]) {
    const r = route(text, current, ['What is the energy import dependency of the EU?'])
    assert.equal(r.kind, 'refine', text)
    assert.equal((r as Extract<Route, { kind: 'refine' }>).plan.allCountries, true, text)
  }
  // Typo tolerance is narrow: a doubled letter or two swapped letters, not any missing one.
  assert.deepEqual(vocabulary.unknownWords('dashbaord countriess'), [])
  assert.deepEqual(vocabulary.unknownWords('capital'), ['capital'])
})
