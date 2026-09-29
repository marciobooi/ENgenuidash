import type Highcharts from 'highcharts'
import { ChartFrame, type ChartFrameProps } from './ChartFrame'
import { PALETTE } from './theme'
import type { ReferenceLine, ValueFormat } from './types'

export interface GaugeChartProps extends ChartFrameProps, ValueFormat {
  value: number
  /** What the value is ("EU-27, 2025"), shown under it. */
  label: string
  /** The scale runs from 0 to this. */
  max: number
  /** Marks on the scale; only the ones with a label are named. */
  targets: ReferenceLine[]
}

/**
 * One value against its target(s) (a solid gauge, a speedometer): how far along it is. Drawn with
 * the Highcharts "solid-gauge" module (served by Webtools as the "solid-gauge" plugin).
 */
export function GaugeChart({ value, label, max, targets, valueSuffix = '', decimals = 1, ...frame }: GaugeChartProps) {
  const named = targets.filter((t) => t.label)
  const options: Highcharts.Options = {
    chart: { type: 'solidgauge', height: 300 },
    pane: {
      center: ['50%', '78%'],
      size: '150%',
      startAngle: -90,
      endAngle: 90,
      background: [{ backgroundColor: 'var(--ecl-color-dark-10)', borderWidth: 0, innerRadius: '62%', outerRadius: '100%', shape: 'arc' }],
    },
    yAxis: {
      min: 0,
      max,
      lineWidth: 0,
      minorTickInterval: undefined,
      tickWidth: 0,
      tickPositions: [0, ...named.map((t) => t.value), max],
      labels: {
        y: 18,
        style: { fontSize: '0.75rem' },
        formatter() {
          const t = named.find((x) => x.value === this.value)
          return t ? t.label : `${this.value}${valueSuffix}`
        },
      },
      plotLines: targets.map((t) => ({ value: t.value, width: 3, color: 'var(--ecl-color-dark-80)', zIndex: 5 })),
    },
    legend: { enabled: false },
    tooltip: { enabled: false },
    plotOptions: {
      solidgauge: {
        innerRadius: '62%',
        radius: '100%',
        animation: false,
        dataLabels: {
          y: -26,
          borderWidth: 0,
          useHTML: true,
          format: `<div style="text-align:center"><span style="font-size:2rem;font-weight:700">{y:,.${decimals}f}${valueSuffix}</span><br/><span style="font-size:0.85rem">${label}</span></div>`,
        },
      },
    },
    // (the gauge series types are not in Highcharts' core type definitions)
    series: [{ type: 'solidgauge', name: label, data: [value], color: PALETTE[0] } as unknown as Highcharts.SeriesOptionsType],
  }
  return <ChartFrame {...frame} options={options} plugins={['solid-gauge']} />
}
