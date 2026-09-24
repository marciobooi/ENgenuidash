import type Highcharts from 'highcharts'
import { ChartFrame, type ChartFrameProps } from './ChartFrame'
import { PALETTE, SURFACE } from './theme'
import { referencePlotLine, type ReferenceLine, type SeriesInput, type ValueFormat } from './types'

export interface BarChartProps extends ChartFrameProps, ValueFormat {
  categories: string[]
  series: SeriesInput[]
  yAxisTitle?: string
  /** 'vertical' = columns, 'horizontal' = bars (better for long category names or ranking). */
  orientation?: 'vertical' | 'horizontal'
  stacked?: boolean | 'percent'
  /** Show the value at the end of each bar (single, unstacked series only). */
  showValues?: boolean
  /** Dashed reference line, e.g. the EU-27 value. */
  reference?: ReferenceLine
  /** Values can be negative (changes): decreases get a second colour and a zero line. */
  signed?: boolean
}

/** Magnitude comparison across categories. 4px rounded ends, 2px gaps between bars. */
export function BarChart({
  categories,
  series,
  yAxisTitle,
  orientation = 'vertical',
  stacked = false,
  showValues = false,
  reference,
  signed = false,
  valueSuffix = '',
  decimals = 1,
  ...frame
}: BarChartProps) {
  const type = orientation === 'horizontal' ? 'bar' : 'column'
  const stacking = stacked === 'percent' ? 'percent' : stacked ? 'normal' : undefined
  const barOptions: Highcharts.PlotColumnOptions & Highcharts.PlotBarOptions = {
    stacking,
    borderWidth: 2,
    borderColor: SURFACE,
    // Round only the data end; the baseline end stays square.
    borderRadius: stacking ? 0 : { radius: 4, where: 'end' },
    // Changes: increases in the first palette colour, decreases in the second (plus the legend-free
    // sign in the value label, so colour is not the only cue).
    ...(signed ? { negativeColor: PALETTE[2] } : {}),
    groupPadding: 0.12,
    pointPadding: 0.04,
    maxPointWidth: 48,
    dataLabels: {
      enabled: showValues && !stacking && series.length === 1,
      format: signed ? `{#if (gt y 0)}+{/if}{y:,.${decimals}f}${valueSuffix}` : `{y:,.${decimals}f}${valueSuffix}`,
      inside: false,
      crop: false,
      overflow: 'allow',
      style: { color: 'var(--ecl-color-dark-80)', fontWeight: '400', textOutline: 'none' },
    },
  }
  const options: Highcharts.Options = {
    // Horizontal value labels sit past the bar end; give them room so they are never clipped.
    chart: { type, ...(showValues && orientation === 'horizontal' ? { spacingRight: 56 } : {}) },
    xAxis: { categories, lineColor: 'var(--ecl-color-dark-40)' },
    yAxis: {
      title: { text: yAxisTitle ?? '' },
      plotLines: [
        ...referencePlotLine(reference, orientation === 'horizontal'),
        ...(signed ? [{ value: 0, color: 'var(--ecl-color-dark-40)', width: 1, zIndex: 4 }] : []),
      ],
      // Headroom so end-of-bar value labels never collide with the plot edge.
      ...(showValues ? { maxPadding: 0.12 } : {}),
      // Never pass `labels: undefined` — Highcharts' merge would wipe the axis label defaults.
      ...(stacking === 'percent' ? { labels: { format: '{value}%' } } : {}),
    },
    tooltip: { shared: series.length > 1, valueSuffix, valueDecimals: decimals },
    legend: { enabled: series.length > 1 },
    plotOptions: { column: barOptions, bar: barOptions },
    series: series.map((s) => ({ type, name: s.name, data: s.data })),
  }
  return <ChartFrame {...frame} options={options} />
}
