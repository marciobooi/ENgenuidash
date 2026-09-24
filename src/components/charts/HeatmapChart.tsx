import type Highcharts from 'highcharts'
import { ChartFrame, type ChartFrameProps } from './ChartFrame'
import { SEQUENTIAL_STOPS, SURFACE } from './theme'
import type { ValueFormat } from './types'

export interface HeatmapChartProps extends ChartFrameProps, ValueFormat {
  /** Columns, e.g. years. */
  xCategories: string[]
  /** Rows, e.g. countries. */
  yCategories: string[]
  /** values[row][column]; null = no data. */
  values: (number | null)[][]
}

/** Grid of a value by two categories (country × year): patterns across many series at a glance. */
export function HeatmapChart({ xCategories, yCategories, values, valueSuffix = '', decimals = 1, ...frame }: HeatmapChartProps) {
  const points = values.flatMap((row, y) => row.map((v, x) => [x, y, v] as [number, number, number | null]))
  const showLabels = points.length <= 140
  const options: Highcharts.Options = {
    chart: { type: 'heatmap', height: Math.max(260, yCategories.length * 30 + 110) },
    xAxis: { categories: xCategories, lineWidth: 0 },
    yAxis: { categories: yCategories, title: { text: '' }, reversed: true, gridLineWidth: 0 },
    colorAxis: { stops: SEQUENTIAL_STOPS, labels: { format: `{value:,.0f}${valueSuffix}` } },
    legend: { enabled: true, align: 'right', layout: 'vertical', verticalAlign: 'middle', symbolHeight: 160 },
    tooltip: {
      headerFormat: '',
      pointFormatter(this: Highcharts.Point & { value?: number | null }) {
        const row = yCategories[this.y ?? 0]
        const col = xCategories[this.x ?? 0]
        const v = this.value == null ? '–' : `${this.value.toLocaleString(undefined, { maximumFractionDigits: decimals })}${valueSuffix}`
        return `<b>${row}</b>, ${col}: <b>${v}</b>`
      },
    },
    series: [
      {
        type: 'heatmap',
        name: frame.title,
        data: points,
        nullColor: 'var(--ecl-color-dark-5)',
        borderWidth: 2,
        borderColor: SURFACE,
        dataLabels: {
          enabled: showLabels,
          format: `{point.value:,.${Math.min(decimals, 1)}f}`,
          style: { fontSize: '10px', fontWeight: '400', textOutline: 'none' },
        },
      },
    ],
  }
  return <ChartFrame {...frame} options={options} plugins={['heatmap']} />
}
