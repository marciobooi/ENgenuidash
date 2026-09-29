import type Highcharts from 'highcharts'
import { ChartFrame, type ChartFrameProps } from './ChartFrame'
import { PALETTE } from './theme'
import { referencePlotLine, type ReferenceLine, type ValueFormat } from './types'

export interface ProgressChartProps extends ChartFrameProps, ValueFormat {
  categories: string[]
  values: (number | null)[]
  /** The target(s) marked on the scale, e.g. a binding target and an indicative aim. */
  targets: ReferenceLine[]
  /** The scale ends here (default: a little past the largest target or value). */
  max?: number
}

/**
 * Progress to a target (a bullet chart): one thin bar per category for where it stands, with the
 * target(s) marked as lines. The gap between the bar and the line is the message. Drawn with the
 * Highcharts "bullet" module (served by Webtools as the "bullet" plugin).
 */
export function ProgressChart({ categories, values, targets, max, valueSuffix = '', decimals = 1, ...frame }: ProgressChartProps) {
  const known = [...targets.map((t) => t.value), ...values.filter((v): v is number => v != null)]
  const top = max ?? Math.ceil((Math.max(...known) * 1.1) / 5) * 5
  const options: Highcharts.Options = {
    chart: { type: 'bullet', inverted: true, height: Math.max(190, categories.length * 60 + 110) },
    xAxis: { categories, lineColor: 'var(--ecl-color-dark-40)' },
    yAxis: {
      min: 0,
      max: top,
      title: { text: '' },
      labels: { format: `{value:,.0f}${valueSuffix}` },
      plotLines: targets.flatMap((t) => referencePlotLine(t, true)),
    },
    legend: { enabled: false },
    tooltip: { headerFormat: '<b>{point.key}</b><br/>', pointFormat: `<b>{point.y:,.${decimals}f}${valueSuffix}</b>` },
    plotOptions: { series: { animation: false, borderWidth: 0, dataLabels: { enabled: true, format: `{y:,.${decimals}f}${valueSuffix}` } } },
    // (the "more" series types are not in Highcharts' core type definitions)
    series: [{ type: 'bullet', name: frame.title ?? '', data: values, color: PALETTE[0], pointPadding: 0.28 } as unknown as Highcharts.SeriesOptionsType],
  }
  return <ChartFrame {...frame} options={options} plugins={['bullet']} />
}
