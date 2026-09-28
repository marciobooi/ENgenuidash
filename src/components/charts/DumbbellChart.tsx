import type Highcharts from 'highcharts'
import { ChartFrame, type ChartFrameProps } from './ChartFrame'
import { PALETTE } from './theme'
import type { SeriesInput, ValueFormat } from './types'

export interface DumbbellChartProps extends ChartFrameProps, ValueFormat {
  categories: string[]
  /** First value of each pair (earlier year, net…), drawn as the hollow end. */
  from: SeriesInput
  /** Second value (later year, gross…), drawn as the filled end. */
  to: SeriesInput
}

/**
 * Two values per category joined by a line: the gap between them is the message (a country's
 * change between two years, gross vs net). Horizontal, one row per category, sorted as given.
 * Drawn with a thin column range (Highcharts "more", served by Webtools) and two dot series,
 * so each end has its own legend entry and tooltip.
 */
export function DumbbellChart({ categories, from, to, valueSuffix = '', decimals = 1, ...frame }: DumbbellChartProps) {
  const ranges = categories.map((_, i) => {
    const a = from.data[i]
    const b = to.data[i]
    return a == null || b == null ? null : [Math.min(a, b), Math.max(a, b)]
  })
  const options: Highcharts.Options = {
    chart: { type: 'columnrange', inverted: true, height: Math.max(220, categories.length * 34 + 110) },
    xAxis: { categories, lineColor: 'var(--ecl-color-dark-40)' },
    yAxis: { title: { text: '' }, labels: { format: `{value:,.0f}${valueSuffix}` } },
    legend: { enabled: true },
    tooltip: { shared: true, valueSuffix, valueDecimals: decimals },
    plotOptions: { series: { animation: false } },
    series: [
      // (the "more" series types are not in Highcharts' core type definitions)
      {
        type: 'columnrange',
        name: `${from.name} – ${to.name}`,
        data: ranges,
        color: 'var(--ecl-color-dark-20)',
        pointWidth: 3,
        enableMouseTracking: false,
        showInLegend: false,
      } as unknown as Highcharts.SeriesOptionsType,
      {
        type: 'scatter',
        name: from.name,
        data: from.data,
        color: PALETTE[0],
        marker: { symbol: 'circle', radius: 6, fillColor: '#ffffff', lineWidth: 3, lineColor: PALETTE[0] },
      },
      {
        type: 'scatter',
        name: to.name,
        data: to.data,
        color: PALETTE[0],
        marker: { symbol: 'circle', radius: 7, lineWidth: 0 },
      },
    ],
  }
  return <ChartFrame {...frame} options={options} />
}
