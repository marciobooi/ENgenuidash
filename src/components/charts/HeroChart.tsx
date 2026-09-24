import type Highcharts from 'highcharts'
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { ChartFrame, type ChartFrameProps } from './ChartFrame'
import { HIGHLIGHT_BAR, MUTED_BAR } from './theme'
import { referencePlotLine, type ReferenceLine, type ValueFormat } from './types'

export interface HeroChip {
  /** e.g. "1 y", "5 y", "10 y". */
  label: string
  /** Signed change, e.g. "+4.8 pp". */
  text: string
  direction: 'up' | 'down' | 'flat'
}

export interface HeroChartProps extends ChartFrameProps, ValueFormat {
  categories: string[]
  data: (number | null)[]
  /** Index of the period in focus (drawn dark; the others are muted). */
  highlightIndex: number
  reference?: ReferenceLine
  /** Headline: the focus value, its change and quick change chips. */
  value: string
  change?: { text: string; direction: 'up' | 'down' | 'flat'; label: string }
  chips?: HeroChip[]
}

const Arrow = ({ direction }: { direction: 'up' | 'down' | 'flat' }) => {
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : ArrowRight
  return <Icon size={14} strokeWidth={2.25} aria-hidden="true" />
}

/**
 * Headline card: a big figure with its change and quick-change chips, over bars where the period
 * in focus stands out and the others are muted, plus a dashed reference (average) line.
 */
export function HeroChart({
  categories,
  data,
  highlightIndex,
  reference,
  value,
  change,
  chips = [],
  valueSuffix = '',
  decimals = 1,
  ...frame
}: HeroChartProps) {
  const options: Highcharts.Options = {
    chart: { type: 'column' },
    xAxis: { categories, lineColor: 'var(--ecl-color-dark-20)' },
    yAxis: { title: { text: '' }, plotLines: referencePlotLine(reference) },
    legend: { enabled: false },
    tooltip: { valueSuffix, valueDecimals: decimals },
    plotOptions: {
      column: { borderWidth: 0, borderRadius: { radius: 4, where: 'end' }, groupPadding: 0.08, pointPadding: 0.06, maxPointWidth: 56 },
    },
    series: [
      {
        type: 'column',
        name: frame.title,
        data: data.map((y, i) => ({
          y,
          color: i === highlightIndex ? HIGHLIGHT_BAR : MUTED_BAR,
          dataLabels: {
            enabled: i === highlightIndex,
            format: `{y:,.${decimals}f}${valueSuffix}`,
            style: { color: 'var(--ecl-color-dark-100)', fontWeight: '700', textOutline: 'none' },
          },
        })),
      },
    ],
  }

  const headline = (
    <div className="hero">
      <div className="hero__figure">
        <span className="hero__value">{value}</span>
        {change && (
          <span className={`hero__change hero__change--${change.direction}`}>
            <Arrow direction={change.direction} />
            {change.text}
            <span className="hero__change-label"> {change.label}</span>
          </span>
        )}
      </div>
      {chips.length > 0 && (
        <ul className="hero__chips">
          {chips.map((c) => (
            <li key={c.label} className={`hero__chip hero__chip--${c.direction}`}>
              <span className="hero__chip-label">{c.label}</span>
              <Arrow direction={c.direction} />
              {c.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  return <ChartFrame {...frame} options={options} headline={headline} />
}
