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
    assert.match(p.section, /^p\. \d+$/)
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
