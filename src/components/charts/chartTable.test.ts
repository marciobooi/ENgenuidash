import assert from 'node:assert/strict'
import { test } from 'node:test'
import type Highcharts from 'highcharts'
import { chartTable } from './chartTable'

const fake = (c: object) => c as unknown as Highcharts.Chart

test('categories become rows and series columns', () => {
  const t = chartTable(
    fake({
      xAxis: [{ categories: ['2022', '2023'] }],
      yAxis: [{}],
      series: [
        { type: 'column', name: 'Gas', options: {}, points: [{ category: '2022', y: 1 }, { category: '2023', y: 2 }] },
        { type: 'column', name: 'Coal', options: {}, points: [{ category: '2023', y: 3 }] },
      ],
    }),
    'Category',
  )
  assert.deepEqual(t.head, ['Category', 'Gas', 'Coal'])
  assert.deepEqual(t.rows, [
    { label: '2022', cells: [1, null] },
    { label: '2023', cells: [2, 3] },
  ])
})

test('pie slices and heat map cells', () => {
  const pie = chartTable(fake({ xAxis: [], yAxis: [], series: [{ type: 'pie', name: 'Share', options: {}, points: [{ name: 'Gas', y: 60 }] }] }), 'C')
  assert.deepEqual(pie.rows, [{ label: 'Gas', cells: [60] }])
  const heat = chartTable(
    fake({
      xAxis: [{ categories: ['2022', '2023'] }],
      yAxis: [{ categories: ['Malta'] }],
      series: [{ type: 'heatmap', name: 'h', options: {}, points: [{ x: 1, y: 0, value: 5 }] }],
    }),
    'C',
  )
  assert.deepEqual(heat, { head: ['C', '2022', '2023'], rows: [{ label: 'Malta', cells: [null, 5] }] })
})

test('the decorative range of a dumbbell is left out', () => {
  const t = chartTable(
    fake({
      xAxis: [{ categories: ['Malta'] }],
      yAxis: [{}],
      series: [
        { type: 'columnrange', name: 'a – b', options: { showInLegend: false, enableMouseTracking: false }, points: [{ category: 'Malta', y: 1 }] },
        { type: 'scatter', name: '2010', options: {}, points: [{ category: 'Malta', y: 1 }] },
      ],
    }),
    'C',
  )
  assert.deepEqual(t.head, ['C', '2010'])
})

test('broken template endings from Webtools translations are repaired', async () => {
  const { repairTemplates } = await import('./chartLang')
  const lang = { a: { b: '{#eq series.points.length 1}Punkt{else}Punkte{/eq }' }, c: 'ok' }
  assert.equal(repairTemplates(lang), true)
  assert.equal(lang.a.b, '{#eq series.points.length 1}Punkt{else}Punkte{/eq}')
  assert.equal(repairTemplates(lang), false)
})
