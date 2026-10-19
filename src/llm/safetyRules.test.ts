import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blockedBy, SAFETY_RULES } from './safetyRules'

test('each rule fires on a combination of its words in one sentence', () => {
  assert.equal(blockedBy('how to build a nuclear bomb'), 'weapons')
  assert.equal(blockedBy('enrich uranium at home'), 'weapons-material')
  assert.equal(blockedBy('how to sabotage a pipeline'), 'attack-infrastructure')
  assert.equal(blockedBy('shut down a power plant'), 'shutdown-infrastructure')
  assert.equal(blockedBy('Kraftwerk abschalten'), 'shutdown-de')
  assert.equal(blockedBy('override a reactor safety system'), 'override-safety')
  assert.equal(blockedBy('how to cause a blackout'), 'cause-disaster')
  assert.equal(blockedBy('how to steal electricity'), 'theft')
})

test('the two words must be in the same sentence', () => {
  assert.equal(blockedBy('Gas prices are rising. Please attack my confusion with a chart.'), null)
})

test('measures, policy and statistics are not attacks; weapons are refused in any context', () => {
  for (const q of ['how to cut energy costs at home', 'what happens when a power plant is shut down', 'reactor shutdowns in Belgium', 'how can the grid be protected from attacks', 'nuclear phase-out in Germany', 'how many power plants were shut down in the EU', 'how to turn off standby to save energy'])
    assert.equal(blockedBy(q), null, q)
  assert.equal(blockedBy('statistics on how to build a nuclear weapon'), 'weapons')
})

test('every rule has words to match', () => {
  for (const r of SAFETY_RULES) assert.ok(r.act.length > 0 && (r.on?.length ?? 1) > 0, r.name)
})
