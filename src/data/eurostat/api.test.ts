import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { installEurostatStub } from '../../test/eurostatStub'
import { fetchEurostatData } from './api'

const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))

test('one caller giving up does not fail another waiting for the same data', async () => {
  const restore = installEurostatStub(read('dictionary.json'), read('codelists.json'))
  try {
    const q = { filters: { geo: 'MT', unit: 'PC', siec: 'TOTAL' }, lastTimePeriod: 3 }
    const first = new AbortController()
    const a = fetchEurostatData('nrg_ind_id', { ...q, signal: first.signal })
    const b = fetchEurostatData('nrg_ind_id', { ...q, signal: new AbortController().signal })
    first.abort()
    await assert.rejects(a, { name: 'AbortError' })
    const result = await b
    assert.equal(result.code ?? 'nrg_ind_id', 'nrg_ind_id')
  } finally {
    restore()
  }
})

test('a request that fails once on the network is tried again, not reported as an outage', async () => {
  const restore = installEurostatStub(read('dictionary.json'), read('codelists.json'))
  const stub = globalThis.fetch
  let calls = 0
  globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
    calls++
    return calls === 1 ? Promise.reject(new TypeError('net::ERR_TIMED_OUT')) : stub(...args)
  }) as typeof fetch
  try {
    const result = await fetchEurostatData('nrg_ind_id', { filters: { geo: 'ES', unit: 'PC', siec: 'TOTAL' }, lastTimePeriod: 2 })
    assert.ok(result)
    assert.equal(calls, 2)
  } finally {
    globalThis.fetch = stub
    restore()
  }
})
