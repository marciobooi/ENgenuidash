import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { conceptAnswer, questionKind, type ConceptKind } from './concepts'
import data from './concepts.json'
import { normalize } from './energyScope'
import { setGlossaryFile } from './glossary'

setGlossaryFile(JSON.parse(readFileSync('public/data/eurostat/energy/glossary.json', 'utf8')))

const KINDS: ConceptKind[] = ['what', 'why', 'how', 'data']

test('every concept is written in every language, ends in a sentence and names its sources', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of data.concepts as Record<string, any>[]) {
    assert.ok(KINDS.some((k) => c[k]), `${c.id}: no text`)
    assert.ok(c.sources?.length, `${c.id}: no source`)
    for (const s of c.sources) assert.match(s.url, /^https:\/\/ec\.europa\.eu\/eurostat\//, `${c.id}: source`)
    for (const l of ['en', 'de', 'fr']) assert.ok(c.name[l], `${c.id}: name ${l}`)
    for (const k of KINDS.filter((k) => c[k])) {
      for (const l of ['en', 'de', 'fr']) {
        assert.ok(c[k][l]?.trim(), `${c.id}.${k}: ${l} missing`)
        assert.match(c[k][l], /[.!?]$/, `${c.id}.${k}.${l} ends mid-sentence`)
      }
    }
  }
})

test('no wording belongs to two concepts', () => {
  const seen = new Map<string, string>()
  const clash: string[] = []
  for (const c of data.concepts) {
    for (const a of c.aliases) {
      const k = normalize(a)
      if (seen.has(k) && seen.get(k) !== c.id) clash.push(`${a}: ${seen.get(k)} / ${c.id}`)
      seen.set(k, c.id)
    }
  }
  assert.deepEqual(clash, [])
})

test('the kind of a question: what, why, how or where from', () => {
  const cases: [string, ConceptKind | null][] = [
    ['what is biogas?', 'what'],
    ['Was ist Biogas?', 'what'],
    ["Qu'est-ce que le GNL ?", 'what'],
    ['why are renewables important?', 'why'],
    ['Warum sind erneuerbare Energien wichtig?', 'why'],
    ['Pourquoi les énergies renouvelables sont-elles importantes ?', 'why'],
    ['how is natural gas calculated?', 'how'],
    ['Wie wird der Erdgasverbrauch berechnet?', 'how'],
    ['Comment sont calculés les prix de l’énergie ?', 'how'],
    ['how do we get data on wind power?', 'data'],
    ['where does the wind energy data come from?', 'data'],
    ['Woher kommen die Winddaten?', 'data'],
    ["D'où viennent les données sur l'énergie solaire ?", 'data'],
    ['how often is energy data updated?', 'data'],
    ['gas price Germany 2023', null],
    ['calculate the renewable share for Germany 2023', null],
    ['which countries matter most for gas imports', null],
  ]
  for (const [q, kind] of cases) assert.equal(questionKind(q), kind, q)
})

test('a concept question gets the concept text in the language it was asked', () => {
  const cases: [string, 'en' | 'de' | 'fr', string, ConceptKind, RegExp][] = [
    ['what is biogas?', 'en', 'Biogas', 'what', /methane/],
    ['what is the difference between capacity and generation?', 'en', 'Installed capacity and generation', 'what', /megawatts/],
    ['what is the difference between primary and final energy?', 'en', 'Primary and final energy', 'what', /losses/],
    ['what is the EU target for renewables in 2030?', 'en', 'Renewable Energy Directive', 'what', /42\.5/],
    ['why are renewables important?', 'en', 'Renewable energy', 'why', /greenhouse/],
    ['how is the share of renewables calculated?', 'en', 'Renewable energy', 'how', /final energy consumption/],
    ['how do we get data on wind power?', 'en', 'Wind energy', 'data', /questionnaires/],
    ['how does Eurostat collect energy statistics?', 'en', "Where Eurostat's energy data come from", 'data', /1099\/2008/],
    ['how is gross available energy calculated?', 'en', 'Gross available energy', 'how', /Primary production/],
    ['Was ist Biogas?', 'de', 'Biogas', 'what', /Methan/],
    ['Woher kommen die Winddaten?', 'de', 'Windenergie', 'data', /fragebögen/i],
    ['Wie wird der Erdgasverbrauch berechnet?', 'de', 'Erdgas', 'how', /Energiebilanz/],
    ["Qu'est-ce que le GNL ?", 'fr', 'Gaz naturel liquéfié (GNL)', 'what', /regazéifié/],
    ['Pourquoi les énergies renouvelables sont-elles importantes ?', 'fr', 'Énergies renouvelables', 'why', /gaz à effet de serre/],
  ]
  for (const [q, lang, concept, kind, text] of cases) {
    const a = conceptAnswer([q], lang)
    assert.ok(a, q)
    assert.equal(a.concept, concept, q)
    assert.equal(a.kind, kind, q)
    assert.match(a.text, text, q)
    assert.ok(a.sources.length, `${q}: no source`)
  }
})

test('questions that ask for figures, or for more than the concept, are left to the dashboards and documents', () => {
  for (const q of ['what is the price of gas in Germany?', 'what is the share of renewables in Germany in 2023?', 'what is wind energy in Spain?', 'how much wind power did Spain produce?', 'calculate the renewable share for Germany 2023', 'why is the gas price higher in Germany than in France?']) {
    assert.equal(conceptAnswer([q], 'en'), null, q)
  }
})
