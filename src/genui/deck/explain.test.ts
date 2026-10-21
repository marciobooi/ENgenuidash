import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DashboardSpec } from '../types'
import { dataSentences, howToRead, topicCard } from './explain'

const spec = {
  title: 'Energy prices',
  source: { title: 'Electricity prices', code: 'x', url: '' },
  widgets: [{ type: 'line', title: 'Price', unit: 'EUR/kWh', categories: ['2020', '2021', '2022', '2023'], series: [{ name: 'DE', data: [0.2, 0.25, 0.3, 0.28] }] }],
} as unknown as DashboardSpec

test('sentences follow the data and the language', () => {
  assert.match(dataSentences(spec, 'en')[0], /rose from 0.2 EUR\/kWh in 2020 to 0.28 EUR\/kWh in 2023/)
  assert.match(dataSentences(spec, 'de')[0], /stieg von/)
  assert.match(dataSentences(spec, 'fr')[0], /a augmenté de/)
})

test('chart captions per type, topic card from concepts.json', () => {
  assert.match(howToRead(spec.widgets[0], 'fr') ?? '', /ligne/)
  const t = topicCard(spec, 'en')
  assert.ok(t && t.blocks.length > 0)
})
