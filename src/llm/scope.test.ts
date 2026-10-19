import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { SCOPE_CASES, SCOPE_HOLDOUT } from '../eval/scopeCases'
import { createScopeChecker } from './energyScope'

const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const scope = createScopeChecker(read('dictionary.json'), read('codelists.json'))

for (const [name, set] of [['tuning', SCOPE_CASES], ['holdout', SCOPE_HOLDOUT]] as const) {
  test(`the topic guard on the ${name} set: energy passes, everything else is refused`, () => {
    const wrong = set.filter((c) => (scope.classify(c.q, []) === 'off-topic') !== (c.want === 'off')).map((c) => `${c.want}: ${c.q} -> ${scope.classify(c.q, [])}`)
    assert.deepEqual(wrong, [])
  })
}
