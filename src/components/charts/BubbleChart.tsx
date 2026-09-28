import type Highcharts from 'highcharts'
import { ChartFrame, type ChartFrameProps } from './ChartFrame'
import { PALETTE } from './theme'

export interface BubbleAxis {
  label: string
  unit: string
}

export interface BubbleChartProps extends ChartFrameProps {
  points: { name: string; x: number; y: number; z: number }[]
  x: BubbleAxis
  y: BubbleAxis
  z: BubbleAxis
  /** Dashed lines at reference values (e.g. the EU-27), which split the chart into quadrants. */
  reference?: { x?: number; y?: number; label: string }
  decimals?: number
}

const withUnit = (unit: string) => (unit === '%' ? '%' : unit ? ` ${unit}` : '')

/**
 * Countries placed by two indicators and sized by a third: where each stands on several measures
 * at once. Every bubble is labelled with its name; the tooltip gives the three values.
 * Uses Highcharts' bubble series (Highcharts "more", served by Webtools).
 */
export function BubbleChart({ points, x, y, z, reference, decimals = 1, ...frame }: BubbleChartProps) {
  const line = (value: number | undefined) =>
    value == null
      ? []
      : [{ value, color: 'var(--ecl-color-dark-40)', width: 1, dashStyle: 'Dash' as const, zIndex: 3, label: { text: reference?.label ?? '', style: { color: 'var(--ecl-color-dark-80)', fontSize: '11px' } } }]
  const options: Highcharts.Options = {
    chart: { type: 'bubble', height: 420, zooming: { type: 'xy' } },
    legend: { enabled: false },
    xAxis: {
      title: { text: `${x.label}${x.unit ? ` (${x.unit})` : ''}` },
      gridLineWidth: 1,
      plotLines: line(reference?.x),
      labels: { format: `{value:,.0f}${withUnit(x.unit)}` },
    },
    yAxis: {
      title: { text: `${y.label}${y.unit ? ` (${y.unit})` : ''}` },
      plotLines: line(reference?.y),
      labels: { format: `{value:,.0f}${withUnit(y.unit)}` },
    },
    tooltip: {
      useHTML: true,
      headerFormat: '',
      pointFormat:
        `<b>{point.name}</b><br/>${x.label}: <b>{point.x:,.${decimals}f}${withUnit(x.unit)}</b>` +
        `<br/>${y.label}: <b>{point.y:,.${decimals}f}${withUnit(y.unit)}</b>` +
        `<br/>${z.label}: <b>{point.z:,.0f}${withUnit(z.unit)}</b>`,
    },
    plotOptions: {
      bubble: {
        minSize: 14,
        maxSize: 56,
        color: PALETTE[0],
        marker: { fillOpacity: 0.55, lineWidth: 1, lineColor: PALETTE[0] },
        // Few countries: every bubble keeps its name, even when two overlap.
        dataLabels: { enabled: true, allowOverlap: points.length <= 12, format: '{point.name}', style: { color: 'var(--ecl-color-dark-100)', fontWeight: '400', textOutline: 'none' }, y: -18 },
      },
    },
    series: [{ type: 'bubble', name: frame.title, data: points.map((p) => ({ ...p })) }],
  }
  return <ChartFrame {...frame} options={options} />
}
