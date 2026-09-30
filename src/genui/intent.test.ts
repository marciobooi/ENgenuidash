import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { INTENT_CASES } from '../eval/intentCases'
import { INTENT_HOLDOUT } from '../eval/intentHoldout'
import { summarizeIntent, type IntentResult } from '../eval/runIntent'
import { createScopeChecker } from '../llm/energyScope'
import { buildKnowledgeIndex } from '../llm/knowledge'
import { buildVocabulary } from '../llm/vocabulary'
import { INTENTS, MAX_BUTTONS, NONE_OPTION, intentMessages, intentOfPlan, planForIntent, rankIntents, readableParts } from './intent'
import { routeMessage } from './route'

const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const { docFreq } = buildKnowledgeIndex(read('knowledge.json').passages)
const scope = createScopeChecker(dict, codelists)
const vocabulary = buildVocabulary(dict, codelists, scope.places)
const unknownWords = (x: string) => vocabulary.unknownWords(x, docFreq)
const correct = (w: string) => vocabulary.correct(w, docFreq)
const route = (text: string) => routeMessage(text, { current: null, dict, codelists, classify: scope.classify, unknownWords, correct, previous: [] })

test('the model is asked to choose between numbered kinds, and "none" is the last option', () => {
  const [system, user] = intentMessages('how is Spain doing?')
  assert.equal(system.role, 'system')
  assert.match(user.content, /Question: "how is Spain doing\?"/)
  for (let n = 1; n <= NONE_OPTION; n++) assert.match(user.content, new RegExp(`^${n}\\. `, 'm'))
  assert.equal(NONE_OPTION, INTENTS.length + 1)
})

test('the kinds offered are the likely ones, best first, at most three, never "none"', () => {
  const probs = [0.02, 0.5, 0.03, 0.01, 0.2, 0.1, 0.02, 0.1, 0.02] // 8 kinds + none
  assert.deepEqual(rankIntents(probs).map((c) => c.id), ['flow', 'trade'])
  assert.deepEqual(rankIntents([0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.6]), [])
  assert.ok(rankIntents([0.2, 0.2, 0.2, 0.2, 0.2, 0, 0, 0, 0]).slice(0, MAX_BUTTONS).length <= MAX_BUTTONS)
})

test('only the parts of a question the rules can read are kept, in any language', () => {
  assert.equal(readableParts('is my bill going to be high in Spain in 2023', codelists), 'spain 2023')
  assert.match(readableParts('was zahlt ein Haushalt in Österreich für Strom?', codelists), /osterreich.*(haushalt|households)|households.*austria|osterreich/)
})

test('with the kind known, the rules build that dashboard for every question of both sets', () => {
  const wrong: string[] = []
  let n = 0
  for (const c of [...INTENT_CASES, ...INTENT_HOLDOUT]) {
    if (c.intent === 'none') continue
    n++
    const plan = planForIntent(c.intent, c.text, route, codelists)
    const got = plan ? intentOfPlan(plan) : 'null'
    if (got !== c.intent) wrong.push(`${c.intent} → ${got}: ${c.text}`)
  }
  assert.ok(n > 60)
  assert.deepEqual(wrong, [])
})

test('the summary counts what the model got right, what it offered and what it would open', () => {
  const at = (top: string, prob: number, offered: string[]): Pick<IntentResult, 'top' | 'prob' | 'offered' | 'handledByRules'> => ({ top: top as never, prob, offered: offered.map((id) => ({ id: id as never, prob: 0.5 })), handledByRules: false })
  const r: IntentResult[] = [
    { case: { text: 'a', lang: 'en', intent: 'oil' }, ...at('oil', 0.9, ['oil']) },
    { case: { text: 'b', lang: 'en', intent: 'trade', alt: ['flow'] }, ...at('flow', 0.95, ['flow']) },
    { case: { text: 'c', lang: 'en', intent: 'prices' }, ...at('none', 0.99, []) },
    { case: { text: 'd', lang: 'en', intent: 'none' }, ...at('profile', 0.6, ['profile']) },
    { case: { text: 'e', lang: 'en', intent: 'oil' }, handledByRules: true },
  ]
  const s = summarizeIntent(r)
  assert.equal(s.population, 4)
  assert.equal(s.handledByRules, 1)
  assert.equal(s.top1, 2)
  assert.equal(s.offeredRecall, 2)
  assert.equal(s.realQuestions, 3)
  assert.equal(s.falseOffers, 1)
  assert.deepEqual(s.thresholds.find((t) => t.p === 0.9), { p: 0.9, opened: 2, right: 2 })
})
