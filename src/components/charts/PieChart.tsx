import type Highcharts from 'highcharts'
import { ChartFrame, type ChartFrameProps } from './ChartFrame'
import { MAX_SERIES, SURFACE } from './theme'
import type { ValueFormat } from './types'

export interface PieSlice {
  name: string
  y: number
}

export interface PieChartProps extends ChartFrameProps, ValueFormat {
  data: PieSlice[]
  /** Series name used in tooltips and the data table, e.g. "Share of gross electricity". */
  seriesName?: string
  /** Render as a donut; `centerLabel` is shown in the hole. */
  donut?: boolean
  centerLabel?: string
  /** Label for the folded remainder when there are more slices than colours. */
  otherLabel?: string
}

/** Part-to-whole with ≤ 6 slices; extra slices fold into "Other". Every slice is labelled. */
export function PieChart({
  data,
  seriesName = 'Value',
  donut = false,
  centerLabel,
  otherLabel = 'Other',
  valueSuffix = '',
  decimals = 1,
  ...frame
}: PieChartProps) {
  const sorted = [...data].sort((a, b) => b.y - a.y)
  const slices =
    sorted.length > MAX_SERIES
      ? [
          ...sorted.slice(0, MAX_SERIES - 1),
          { name: otherLabel, y: sorted.slice(MAX_SERIES - 1).reduce((s, d) => s + d.y, 0), color: '#a8aaaf' },
        ]
      : sorted

  const options: Highcharts.Options = {
    chart: {
      type: 'pie',
      ...(centerLabel && {
        events: {
            render() {
              const chart = this as Highcharts.Chart & { centerText?: Highcharts.SVGElement }
              const series = chart.series[0] as Highcharts.Series & { center: number[] }
              const [cx, cy] = series.center
              chart.centerText?.destroy()
              chart.centerText = chart.renderer
                .text(centerLabel, chart.plotLeft + cx, chart.plotTop + cy + 6)
                .attr({ align: 'center', 'aria-hidden': 'true' })
                .css({ color: '#191d26', fontSize: '18px', fontWeight: '700' })
                .add()
            },
        },
      }),
    },
    tooltip: {
      valueSuffix,
      valueDecimals: decimals,
      pointFormat: `<b>{point.y:,.${decimals}f}${valueSuffix}</b> ({point.percentage:.1f}%)`,
    },
    plotOptions: {
      pie: {
        innerSize: donut ? '62%' : 0,
        borderWidth: 2,
        borderColor: SURFACE,
        borderRadius: 4,
        showInLegend: true,
        dataLabels: {
          enabled: true,
          distance: 16,
          format: '{point.name}: {point.percentage:.0f}%',
          style: { color: 'var(--ecl-color-dark-80)', fontWeight: '400', textOutline: 'none', fontSize: '12px' },
          connectorColor: 'var(--ecl-color-dark-40)',
        },
      },
    },
    series: [{ type: 'pie', name: seriesName, data: slices }],
  }
  return <ChartFrame {...frame} options={options} />
}
