import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sentences } from './knowledge'

test('abbreviations such as "e.g." do not end a sentence', () => {
  assert.deepEqual(sentences('It excludes non-energy use (e.g. natural gas for chemicals). “Final energy” covers end users. Done!'), [
    'It excludes non-energy use (e.g. natural gas for chemicals).',
    '“Final energy” covers end users.',
    'Done!',
  ])
})

test('every edited description matches a passage and is written in every language', async () => {
  const { readFileSync } = await import('node:fs')
  const { DESCRIPTIONS } = await import('./descriptions')
  const { passages } = JSON.parse(readFileSync('public/data/eurostat/energy/knowledge.json', 'utf8')) as { passages: { id: string }[] }
  const ids = new Set(passages.map((p) => p.id))
  for (const [id, d] of Object.entries(DESCRIPTIONS)) {
    assert.ok(ids.has(id), `${id} is not in knowledge.json`)
    for (const l of ['en', 'de', 'fr'] as const) {
      assert.ok(d.title[l].trim() && d.text[l].trim(), `${id}: ${l}`)
      assert.match(d.text[l], /[.!?]$/, `${id}: ${l} ends mid-sentence`)
    }
  }
})
