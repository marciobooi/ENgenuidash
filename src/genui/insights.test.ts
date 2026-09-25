import assert from 'node:assert/strict'
import { test } from 'node:test'
import { STRINGS } from '../i18n'
import { computeInsights, type InsightInput } from './insights'
import type { Insight } from './types'

const fmt = {
  value: (v: number, unit?: string) => `${v.toFixed(1)}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`,
  number: (v: number, d = 1) => v.toFixed(d),
  signed: (v: number, unit: string) => `${v > 0 ? '+' : ''}${v.toFixed(1)}${unit === '%' ? '%' : ` ${unit}`}`,
}
const text = (i: Insight) => i.parts.map((p) => (typeof p === 'string' ? p : p.strong)).join('')
const base = (over: Partial<InsightInput>): InsightInput => ({
  intent: 'snapshot', multi: false, series: [], periodLabels: [], focusIndex: 0, perYear: 1, isPercent: true, unit: '%', fmt, ...over,
})
const s = STRINGS.en.dInsights

test('a record is stated for the years shown, not "on record"', () => {
  const years = ['2014', '2015', '2016', '2017', '2018']
  const out = computeInsights(base({ series: [{ code: '', name: 'EU', data: [50, 52, 54, 56, 58] }], periodLabels: years, focusIndex: 4, focusPeriod: '2018' }), s).map(text)
  assert.ok(out.some((t) => t.includes('2014–2018') && t.includes('58.0%')), out.join(' | '))
  assert.ok(!out.some((t) => /on record/.test(t)))
})

test('the largest move is taken from the years up to the one shown', () => {
  const out = computeInsights(base({ series: [{ code: '', name: 'EU', data: [50, 51, 52, 53, 90] }], periodLabels: ['1', '2', '3', '4', '5'], focusIndex: 3, focusPeriod: '4' }), s).map(text)
  assert.ok(!out.some((t) => t.includes('+37.0')), out.join(' | '))
})

test('"N of N above the EU value" is skipped for a top-N selection', () => {
  const series = ['MT', 'LU', 'CY'].map((code, k) => ({ code, name: code, data: [90 - k, 95 - k] }))
  const input = { intent: 'compare' as const, multi: true, series, euRef: { code: 'EU27_2020', name: 'EU-27', data: [55, 58] }, periodLabels: ['2017', '2018'], focusIndex: 1 }
  const aboveEu = (ranked: boolean) => computeInsights(base({ ...input, ranked }), s).map(text).filter((t) => t.includes('above the EU'))
  assert.equal(aboveEu(true).length, 0)
  assert.equal(aboveEu(false).length, 1)
})

test('monthly data: no "N periods in a row" streak, and moves are measured on a year earlier', () => {
  // Two years of a seasonal series: winter high, summer low, 10% lower in the second year.
  const season = [10, 9, 8, 6, 5, 4, 4, 5, 6, 8, 9, 10]
  const data = [...season, ...season.map((v) => v * 0.9)]
  const labels = data.map((_, k) => `${2024 + Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`)
  const out = computeInsights(base({ isPercent: false, unit: 'million m³', series: [{ code: '', name: 'DE', data }], periodLabels: labels, focusIndex: 23, perYear: 12, lag: 12 }), s).map(text)
  assert.ok(!out.some((t) => /in a row/.test(t)), out.join(' | '))
  const move = out.find((t) => /on a year earlier/.test(t))
  assert.ok(move?.includes('-10.0%'), out.join(' | '))
})
