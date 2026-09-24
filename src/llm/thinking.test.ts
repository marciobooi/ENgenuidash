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
test('a reasoning block opened by the prompt (Qwen3.5) stays hidden', () => {
  const f = new ThinkingFilter({ promptOpened: true })
  assert.equal(f.thinking, true)
  const out = ['Thinking Process:\n1. Analyze', ' the request.\n</thi', 'nk>\n\nHello! Ask me', ' about energy.'].map((c) => f.push(c)).join('')
  assert.equal(out, 'Hello! Ask me about energy.')
})
test('the thinking budget still forces an answer when the prompt opened the block', () => {
  const f = new ThinkingFilter({ promptOpened: true })
  f.push('Thinking Process: long reasoning')
  f.forceAnswer()
  assert.equal(f.push('The EU imports 58%.'), 'The EU imports 58%.')
})
