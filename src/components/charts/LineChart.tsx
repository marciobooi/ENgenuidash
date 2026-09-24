import type Highcharts from 'highcharts'
import { ChartFrame, type ChartFrameProps } from './ChartFrame'
import { SURFACE } from './theme'
import { highlightPlotBand, referencePlotLine, type ReferenceLine, type SeriesInput, type ValueFormat } from './types'

export interface LineChartProps extends ChartFrameProps, ValueFormat {
  categories: (string | number)[]
  series: SeriesInput[]
  yAxisTitle?: string
  /** Dashed reference line, e.g. the average over the period. */
  reference?: ReferenceLine
  /** Category to highlight, e.g. the year asked about. */
  highlight?: string
}

/** Change over time for up to 6 series. Crosshair + shared tooltip; last point labelled. */
export function LineChart({ categories, series, yAxisTitle, reference, highlight, valueSuffix = '', decimals = 1, ...frame }: LineChartProps) {
  const directLabels = series.length <= 4
  const options: Highcharts.Options = {
    // Reserve room on the right so end-of-line labels sit outside the plot.
    chart: { type: 'line', ...(directLabels && series.length > 1 ? { marginRight: 96 } : {}) },
    xAxis: {
      categories: categories.map(String),
      crosshair: { color: 'var(--ecl-color-dark-20)', width: 1 },
      plotBands: highlightPlotBand(categories, highlight),
    },
    yAxis: { title: { text: yAxisTitle ?? '' }, plotLines: referencePlotLine(reference) },
    tooltip: { shared: true, valueSuffix, valueDecimals: decimals },
    legend: { enabled: series.length > 1 },
    plotOptions: {
      series: {
        lineWidth: 2,
        marker: { radius: 4, lineWidth: 2, lineColor: SURFACE, symbol: 'circle' },
        states: { hover: { lineWidthPlus: 0 } },
      },
    },
    series: series.map((s) => ({
      type: 'line',
      name: s.name,
      data: s.data,
      // Direct label on the last point only (identity is never colour-alone).
      dataLabels: {
        enabled: directLabels,
        crop: false,
        overflow: 'allow',
        filter: { property: 'x', operator: '===', value: categories.length - 1 },
        format: series.length > 1 ? '{series.name}' : `{y:,.${decimals}f}${valueSuffix}`,
        align: 'left',
        x: 6,
        verticalAlign: 'middle',
        style: { color: 'var(--ecl-color-dark-80)', fontWeight: '400', textOutline: 'none' },
      },
    })),
  }
  return <ChartFrame {...frame} options={options} />
}
