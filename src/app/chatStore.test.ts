import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createChatStore, MAX_MESSAGES, MAX_SESSIONS, RETENTION_DAYS, titleOf, type Session } from './chatStore'

class FakeStorage {
  data = new Map<string, string>()
  limit = Infinity
  get length() {
    return this.data.size
  }
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    const size = [...this.data].reduce((n, [key, val]) => n + (key === k ? 0 : val.length), 0) + v.length
    if (size > this.limit) throw new DOMException('full', 'QuotaExceededError')
    this.data.set(k, v)
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
}
const fake = () => new FakeStorage() as unknown as Storage & FakeStorage

const session = (id: string, question = `question ${id}`, extra: Partial<Session> = {}): Session => ({
  id,
  title: '',
  created: 1,
  updated: 0,
  messages: [
    { role: 'user', content: question },
    { role: 'assistant', content: 'an answer', sources: [{ code: 'x', title: 't', url: 'https://ec.europa.eu/eurostat/' }], card: { index: 0, title: 'Dash' } },
  ],
  dashboards: [{ plan: { dataset: 'nrg_ind_ren' } as never, question }],
  active: 0,
  ...extra,
})

test('a conversation is saved, listed and loaded again', () => {
  const store = createChatStore(fake())
  assert.equal(store.save(session('a', 'Energy prices in France')), true)
  const [summary] = store.list()
  assert.equal(summary.title, 'Energy prices in France')
  assert.equal(summary.messages, 2)
  const loaded = store.load('a')
  assert.equal(loaded?.messages[1].content, 'an answer')
  assert.equal(loaded?.messages[1].card?.index, 0)
  assert.equal(loaded?.dashboards[0].question, 'Energy prices in France')
})

test('what is still being built, and the text the model was given, are not kept', () => {
  const store = createChatStore(fake())
  const s = session('a')
  s.messages.push({ role: 'user', content: 'more', prompt: 'question + a lot of Eurostat context' }, { role: 'assistant', content: 'Building…', pending: true })
  store.save(s)
  const loaded = store.load('a')!
  assert.equal(loaded.messages.length, 3)
  assert.equal('prompt' in loaded.messages[2], false)
})

test('a conversation with no question is not saved, and the newest come first', () => {
  let time = 1000
  const store = createChatStore(fake(), () => time++)
  assert.equal(store.save({ ...session('empty'), messages: [{ role: 'assistant', content: 'hello' }] }), false)
  store.save(session('a'))
  store.save(session('b'))
  assert.deepEqual(store.list().map((s) => s.id), ['b', 'a'])
})

test('saving the same conversation again replaces it, and only the last messages are kept', () => {
  const store = createChatStore(fake())
  const s = session('a')
  for (let i = 0; i < MAX_MESSAGES + 20; i++) s.messages.push({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` })
  store.save(s)
  store.save(s)
  assert.equal(store.list().length, 1)
  assert.equal(store.load('a')?.messages.length, MAX_MESSAGES)
})

test('the oldest conversations make room over the limit', () => {
  let time = 1
  const storage = fake()
  const store = createChatStore(storage, () => time++)
  for (let i = 0; i < MAX_SESSIONS + 3; i++) store.save(session(`s${i}`))
  const ids = store.list().map((s) => s.id)
  assert.equal(ids.length, MAX_SESSIONS)
  assert.ok(!ids.includes('s0') && ids.includes(`s${MAX_SESSIONS + 2}`))
  assert.equal(storage.getItem('engenui.chat.s.s0'), null)
})

test('a full storage drops the oldest conversations instead of failing', () => {
  let time = 1
  const storage = fake()
  const store = createChatStore(storage, () => time++)
  store.save(session('old'))
  storage.limit = JSON.stringify(session('x')).length * 2 + 400
  assert.equal(store.save(session('new-one')), true)
  assert.ok(store.load('new-one'))
})

test('conversations expire after the retention period and are deleted', () => {
  let time = 1_000_000
  const storage = fake()
  const store = createChatStore(storage, () => time)
  store.save(session('a'))
  time += (RETENTION_DAYS - 1) * 86_400_000
  assert.equal(store.list().length, 1)
  time += 2 * 86_400_000
  assert.equal(store.list().length, 0)
  assert.equal(storage.getItem('engenui.chat.s.a'), null)
})

test('one conversation, or all of them, can be deleted', () => {
  const storage = fake()
  const store = createChatStore(storage)
  store.save(session('a'))
  store.save(session('b'))
  store.remove('a')
  assert.deepEqual(store.list().map((s) => s.id), ['b'])
  store.clear()
  assert.deepEqual(store.list(), [])
  assert.equal(storage.length, 0)
})

test('switching saving off deletes what was saved and stops saving; switching on saves again', () => {
  const store = createChatStore(fake())
  store.save(session('a'))
  store.setEnabled(false)
  assert.equal(store.enabled(), false)
  assert.deepEqual(store.list(), [])
  assert.equal(store.save(session('b')), false)
  store.setEnabled(true)
  assert.equal(store.save(session('b')), true)
})

test('without storage, or with corrupt data, nothing throws', () => {
  const none = createChatStore(null)
  assert.equal(none.enabled(), false)
  assert.equal(none.save(session('a')), false)
  assert.deepEqual(none.list(), [])
  const storage = fake()
  storage.setItem('engenui.chat.index', '{not json')
  storage.setItem('engenui.chat.s.a', '[]')
  const store = createChatStore(storage)
  assert.deepEqual(store.list(), [])
  assert.equal(store.load('a'), null)
  storage.setItem('engenui.chat.index', JSON.stringify([{ id: 'a', title: 't', updated: Date.now(), messages: 1 }]))
  storage.setItem('engenui.chat.s.a', JSON.stringify({ id: 'a', messages: [{ role: 'user', content: 'ok' }, { role: 'x' }, 5], dashboards: 'no' }))
  const loaded = store.load('a')!
  assert.equal(loaded.messages.length, 1)
  assert.deepEqual(loaded.dashboards, [])
})

test('the title is the first question, shortened', () => {
  assert.equal(titleOf([{ role: 'user', content: '  gas   prices\nin France ' }]), 'gas prices in France')
  assert.ok(titleOf([{ role: 'user', content: 'x'.repeat(200) }]).length <= 70)
})
