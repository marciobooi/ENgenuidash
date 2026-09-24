import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ThinkingFilter } from './thinking'

/** Feeds chunks through a filter (calling forceAnswer before chunk `force`) and joins the output. */
function run(chunks: string[], force = -1) {
  const f = new ThinkingFilter()
  return chunks.map((c, i) => (i === force && f.forceAnswer(), f.push(c))).join('')
}

test('hides the reasoning and shows the answer', () => {
  assert.equal(run(['<thi', 'nk>\nThe user asks', ' about imports.\n</thi', 'nk>\n\nThe EU', ' imports 58%.']), 'The EU imports 58%.')
})
test('shows a reply without a thinking block as it arrives', () => {
  assert.equal(run(['The EU', ' imports 58%.']), 'The EU imports 58%.')
  assert.equal(run(['\n\n', 'Hello']), 'Hello')
  assert.equal(run(['<b>bold</b> text']), '<b>bold</b> text')
})
test('skips the empty block of thinking-off templates', () => {
  assert.equal(run(['<think>\n\n</think>\n\n', 'Answer.']), 'Answer.')
})
test('after forceAnswer, the forced closing tag is hidden and the answer shown', () => {
  assert.equal(run(['<think>\nlong reasoning', ' more reasoning', '\n</think>\n\n', 'Short answer.'], 2), 'Short answer.')
})
test('shows nothing while the model is still thinking', () => {
  const f = new ThinkingFilter()
  assert.equal(f.push('<think>reasoning'), '')
  assert.equal(f.thinking, true)
  assert.equal(f.answering, false)
})
