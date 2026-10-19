import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { documentAnswer } from './answers'
import { searchQuery } from './crossLingual'
import { setGlossaryFile } from './glossary'
import { buildKnowledgeIndex, searchKnowledge, setKnowledgePassages } from './knowledge'

// Eurostat's methodology documents (reporting instructions, the SHARES manual, the energy balance guide...) are
// extra passages of the knowledge base (kind "document", build-eurostat-knowledge.mjs): they answer the "how is
// it reported / calculated" questions the articles do not, and they never push an article or metadata answer out.
const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const knowledge = read('knowledge.json')
setKnowledgePassages(knowledge.passages)
setGlossaryFile(read('glossary.json'))

test('the documents are in the knowledge base, each passage with its title, source link and page', () => {
  const docs = knowledge.passages.filter((p: { kind: string }) => p.kind === 'document')
  assert.ok(docs.length > 1000)
  assert.ok(new Set(docs.map((p: { title: string }) => p.title)).size >= 25)
  for (const p of docs) {
    assert.match(p.url, /^https:\/\/(ec\.europa\.eu\/eurostat|eur-lex\.europa\.eu)\//)
    // (a page of a PDF, or a section heading of a supplementary article)
    assert.ok(p.section == null || typeof p.section === 'string')
    if (/\.pdf|documents\//.test(p.url)) assert.match(p.section, /^p\. \d+$/)
  }
})

test('questions only a document answers are answered from it, quoted with its page', async () => {
  for (const [q, title] of [
    ['how are heat pumps counted in the renewable share?', /SHARES manual/],
    ['how are monthly crude oil imports reported?', /Monthly crude oil imports/],
    ['how are energy cost compensation subsidies reported in prices?', /compensation/],
  ] as const) {
    const a = await documentAnswer(searchQuery(q))
    assert.equal(a.kind, 'quote', q)
    assert.match(a.sources[0].title, title, q)
  }
})

test('the documents do not change the scores of the articles and metadata, nor make nonsense words known', async () => {
  const core = knowledge.passages.filter((p: { kind: string }) => p.kind !== 'document')
  const withDocs = buildKnowledgeIndex(knowledge.passages)
  const without = buildKnowledgeIndex(core)
  assert.equal(withDocs.coreCount, without.coreCount)
  assert.deepEqual([...withDocs.docFreq].length, [...without.docFreq].length)
  setKnowledgePassages(core)
  const before = await searchKnowledge('how much electricity does an EU household use per person', { limit: 1 })
  setKnowledgePassages(knowledge.passages)
  const after = await searchKnowledge('how much electricity does an EU household use per person', { limit: 1 })
  assert.equal(after[0].score, before[0].score)
})

test('German and French questions about methodology find a passage in the English documents', async () => {
  for (const q of [
    'wie wird der Anteil erneuerbarer Energien berechnet?', 'was ist eine Energiebilanz?', 'wie oft werden Energiestatistiken revidiert?', 'welche Verordnung verpflichtet zur Meldung von Energiestatistiken?', 'was sind Energiekonten?',
    'wie werden CO2-Emissionen aus Energie geschätzt?', 'was ist der Unterschied zwischen Primär- und Endenergie?', 'wie werden Strompreise erhoben?',
    "qu'est-ce qu'un bilan énergétique ?", 'à quelle fréquence les statistiques de l’énergie sont-elles révisées ?', "quel règlement oblige à déclarer les statistiques de l'énergie ?", 'comment sont collectés les prix de l’électricité ?',
  ]) {
    const a = await documentAnswer(searchQuery(q))
    assert.notEqual(a.kind, 'unclear', q)
  }
})
