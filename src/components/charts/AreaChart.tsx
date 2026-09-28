import type Highcharts from 'highcharts'
import { ChartFrame, type ChartFrameProps } from './ChartFrame'
import { SURFACE } from './theme'
import { highlightPlotBand, PERCENT_POINT, referencePlotLine, type ReferenceLine, type SeriesInput, type ValueFormat } from './types'

export interface AreaChartProps extends ChartFrameProps, ValueFormat {
  categories: (string | number)[]
  series: SeriesInput[]
  yAxisTitle?: string
  /** Dashed reference line, e.g. the average over the period. */
  reference?: ReferenceLine
  /** Category to highlight, e.g. the year asked about. */
  highlight?: string
  /** Stack series to show composition of a total over time. */
  stacked?: boolean | 'percent'
}

/** Volume or composition over time. Stacked areas are separated by a 2px surface line. */
export function AreaChart({
  categories,
  series,
  yAxisTitle,
  reference,
  highlight,
  stacked = false,
  valueSuffix = '',
  decimals = 1,
  ...frame
}: AreaChartProps) {
  const stacking = stacked === 'percent' ? 'percent' : stacked ? 'normal' : undefined
  const options: Highcharts.Options = {
    chart: { type: 'area' },
    xAxis: {
      categories: categories.map(String),
      crosshair: { color: 'var(--ecl-color-dark-20)', width: 1 },
      plotBands: highlightPlotBand(categories, highlight),
    },
    yAxis: {
      title: { text: yAxisTitle ?? '' },
      plotLines: referencePlotLine(reference),
      // Never pass `labels: undefined` — Highcharts' merge would wipe the axis label defaults.
      ...(stacking === 'percent' ? { labels: { format: '{value}%' } } : {}),
    },
    tooltip: {
      shared: true,
      valueSuffix,
      valueDecimals: decimals,
      // Shares: the tooltip shows each part's percentage of the total, not the raw value.
      ...(stacking === 'percent' ? { pointFormat: PERCENT_POINT } : {}),
    },
    legend: { enabled: series.length > 1 },
    plotOptions: {
      area: {
        stacking,
        lineWidth: 2,
        fillOpacity: stacking ? 0.85 : 0.18,
        marker: { enabled: false, radius: 4, symbol: 'circle', lineWidth: 2, lineColor: SURFACE },
        // Surface-coloured edge between stacked fills.
        ...(stacking ? { lineColor: SURFACE } : {}),
      },
    },
    series: series.map((s) => ({ type: 'area', name: s.name, data: s.data })),
  }
  return <ChartFrame {...frame} options={options} />
}
