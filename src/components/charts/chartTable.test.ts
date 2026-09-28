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

test('a wide table is turned so the longer dimension runs down the rows', async () => {
  const { readable, transpose } = await import('./chartTable')
  const wide = { head: ['C', '2020', '2021', '2022'], rows: [{ label: 'Malta', cells: [1, 2, 3] }] }
  assert.deepEqual(readable(wide), {
    head: ['C', 'Malta'],
    rows: [
      { label: '2020', cells: [1] },
      { label: '2021', cells: [2] },
      { label: '2022', cells: [3] },
    ],
  })
  assert.deepEqual(transpose(transpose(wide)), wide)
  const tall = transpose(wide)
  assert.equal(readable(tall), tall)
})

test('a bubble drawn at the edge of a shortened axis keeps its real value in the table', () => {
  const t = chartTable(
    fake({
      xAxis: [{ options: { title: { text: 'Import' } } }],
      yAxis: [{ options: { title: { text: 'Renewables' } } }],
      series: [{ type: 'bubble', name: 'Use', options: {}, points: [{ name: 'Norway', x: -135, y: 60, z: 5, realX: -600, realY: 60 }] }],
    }),
    'C',
  )
  assert.deepEqual(t, { head: ['C', 'Import', 'Renewables', 'Use'], rows: [{ label: 'Norway', cells: [-600, 60, 5] }] })
})
