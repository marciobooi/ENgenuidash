import assert from 'node:assert/strict'
import { test } from 'node:test'
import { englishTerms, questionLanguage, searchQuery } from './crossLingual'

test('German and French questions get English search terms', () => {
  const de = englishTerms('Warum ist Erdgas für die Stromerzeugung wichtig?')
  for (const t of ['natural gas', 'electricity generation', 'why', 'important']) assert.ok(de.includes(t), `${t} in ${de}`)
  const fr = englishTerms('Pourquoi l’énergie nucléaire est-elle importante en France ?')
  for (const t of ['nuclear', 'why', 'important']) assert.ok(fr.includes(t), `${t} in ${fr}`)
})

test('an English question is searched as it is', () => {
  assert.equal(searchQuery('Why is natural gas important for electricity generation?'), 'Why is natural gas important for electricity generation?')
})

test('the language of a question comes from its function words', () => {
  assert.equal(questionLanguage('Warum ist Erdgas für die Stromerzeugung wichtig?', 'en'), 'de')
  assert.equal(questionLanguage('Pourquoi le nucléaire est-il important ?', 'en'), 'fr')
  assert.equal(questionLanguage('Why is gas important?', 'de'), 'en')
  assert.equal(questionLanguage('Erdgas 2024', 'de'), 'de') // unclear → UI language
  assert.equal(questionLanguage('What is the share of wind in the EU?', 'en'), 'en')
})

test('English questions are never expanded', () => {
  const q = 'Why do countries with more renewables depend less on energy imports?'
  assert.equal(searchQuery(q), q)
})
