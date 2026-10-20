import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ART, artCatalog, artPrompt, flagsOf, knownArt, matchArt } from './registry'

// The art of the presentation has ids; slides name them, or they are chosen from the words and places of the data.
test('the catalogue has 24 pictograms and 32 flags, each id once', () => {
  assert.equal(ART.filter((a) => a.kind === 'pictogram').length, 24)
  assert.equal(ART.filter((a) => a.kind === 'flag').length, 32)
  assert.equal(new Set(ART.map((a) => a.id)).size, ART.length)
  assert.equal(artCatalog().length, ART.length)
  assert.match(artPrompt(), /wind-turbine: Wind turbine/)
})

test('a pictogram is chosen from what a figure measures, in English, German and French', () => {
  assert.equal(matchArt('Wind and solar capacity'), 'wind-turbine')
  assert.equal(matchArt('Solar share'), 'solar-panel')
  assert.equal(matchArt('Erneuerbarer Strom'), 'pylon')
  assert.equal(matchArt('Electricity'), 'pylon')
  assert.equal(matchArt('Heating and cooling'), 'heat-pump')
  assert.equal(matchArt('Prix du gaz'), 'euro-coin')
  assert.equal(matchArt('Dependence on third countries'), 'shield')
  assert.equal(matchArt('Weather'), undefined)
})

test('flags come from the geo codes of the data, and an id a model invents is dropped', () => {
  assert.deepEqual(flagsOf(['DE', 'FR']), ['flag-de', 'flag-fr'])
  assert.deepEqual(flagsOf(['EU27_2020', undefined, 'EL']), ['flag-eu', 'flag-el'])
  assert.deepEqual(flagsOf([['PL', 'XX']]), ['flag-pl'])
  assert.deepEqual(knownArt(['wind-turbine', 'dragon', undefined, 'flag-de']), ['wind-turbine', 'flag-de'])
})
