import type Highcharts from 'highcharts'
import { ChartFrame, type ChartFrameProps } from './ChartFrame'
import { PALETTE } from './theme'
import type { SeriesInput, ValueFormat } from './types'

export interface SeasonalChartProps extends ChartFrameProps, ValueFormat {
  /** The twelve months, in the reader's language. */
  months: string[]
  /** This year, month by month (the months not yet reported are empty). */
  latest: SeriesInput
  /** The year before, for the eye. */
  previous?: SeriesInput
  /** The average of the earlier years for each month. */
  average?: SeriesInput
  /** The lowest and highest value of the earlier years for each month: the band this year is read against. */
  range: { name: string; min: (number | null)[]; max: (number | null)[] }
}

/**
 * How this year compares with earlier ones, month by month (as Eurostat's monthly energy tool): the
 * range the same month has had in the earlier years as a band, their average, and this year and the
 * one before as lines. Above the band is a record. Drawn with a range area (Highcharts "more").
 */
export function SeasonalChart({ months, latest, previous, average, range, valueSuffix = '', decimals = 1, ...frame }: SeasonalChartProps) {
  const band = months.map((_, i) => (range.min[i] == null || range.max[i] == null ? null : [range.min[i], range.max[i]]))
  const options: Highcharts.Options = {
    chart: { type: 'line', height: 380 },
    xAxis: { categories: months, lineColor: 'var(--ecl-color-dark-40)' },
    yAxis: { title: { text: '' }, labels: { format: `{value:,.0f}${valueSuffix}` } },
    legend: { enabled: true },
    tooltip: { shared: true, headerFormat: '<b>{point.key}</b><br/>', valueDecimals: decimals, valueSuffix },
    plotOptions: { series: { animation: false } },
    series: [
      // (the range series types are not in Highcharts' core type definitions)
      { type: 'arearange', name: range.name, data: band, color: PALETTE[0], fillOpacity: 0.16, lineWidth: 0, marker: { enabled: false }, zIndex: 0, enableMouseTracking: true } as unknown as Highcharts.SeriesOptionsType,
      ...(average ? [{ type: 'line', name: average.name, data: average.data, color: 'var(--ecl-color-dark-60)', dashStyle: 'Dash', lineWidth: 2, marker: { enabled: false }, zIndex: 1 } as unknown as Highcharts.SeriesOptionsType] : []),
      ...(previous ? [{ type: 'line', name: previous.name, data: previous.data, color: PALETTE[1], lineWidth: 2, marker: { radius: 3 }, zIndex: 2 } as unknown as Highcharts.SeriesOptionsType] : []),
      { type: 'line', name: latest.name, data: latest.data, color: PALETTE[0], lineWidth: 4, marker: { radius: 5 }, zIndex: 3 },
    ],
  }
  return <ChartFrame {...frame} options={options} />
}
