import assert from 'node:assert/strict'
import { test } from 'node:test'
import { smallTalkReply } from './answers'

const s = { hello: 'HELLO', thanks: 'THANKS' }

test('thanks get "you are welcome", greetings get the introduction', () => {
  for (const t of ['thanks', 'thank you!', 'thanks, that is great', 'Danke, super', 'merci beaucoup', 'ok']) assert.equal(smallTalkReply(t, s), 'THANKS', t)
  for (const t of ['hello', 'Guten Morgen', 'bonjour', 'help']) assert.equal(smallTalkReply(t, s), 'HELLO', t)
})
