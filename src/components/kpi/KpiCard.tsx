import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import './kpi.css'

export interface KpiCardProps {
  /** What is measured, e.g. "Renewables share". */
  label: string
  value: number
  /** Unit shown after the value, e.g. "%", "TWh". */
  unit?: string
  /** Change vs. the comparison period, in the same unit as `deltaUnit`. */
  delta?: number
  /** Unit for the change, e.g. "pp" or "%". Defaults to "%". */
  deltaUnit?: string
  /** Comparison period, e.g. "vs 2022". */
  deltaLabel?: string
  /** Which direction is good. 'neutral' shows no good/bad colour. */
  goodDirection?: 'up' | 'down' | 'neutral'
  /** Extra context under the value, e.g. "EU27, 2023". */
  caption?: string
  icon?: LucideIcon
  decimals?: number
  /** Decimals for the change value. */
  deltaDecimals?: number
  /** Values over time, drawn as a small sparkline (decorative: the value and change are in text). */
  trend?: (number | null)[]
  /** BCP 47 locale for number formatting. */
  locale?: string
}

/** Headline number with optional change indicator. Status is never colour-alone: arrow + signed text. */
export function KpiCard({
  label,
  value,
  unit,
  delta,
  deltaUnit = '%',
  deltaLabel,
  goodDirection = 'up',
  caption,
  icon: Icon,
  decimals = 1,
  deltaDecimals = 1,
  trend,
  locale = 'en',
}: KpiCardProps) {
  const fmt = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  const fmtDelta = new Intl.NumberFormat(locale, {
    minimumFractionDigits: deltaDecimals,
    maximumFractionDigits: deltaDecimals,
    signDisplay: 'exceptZero',
  })

  const direction = delta === undefined || delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down'
  const tone =
    direction === 'flat' || goodDirection === 'neutral' ? 'neutral' : direction === goodDirection ? 'good' : 'bad'
  const DeltaIcon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : ArrowRight

  const valueText = `${fmt.format(value)}${unit ? ` ${unit}` : ''}`
  const deltaText =
    delta !== undefined ? `${fmtDelta.format(delta)}${deltaUnit === '%' ? '' : ' '}${deltaUnit}`.trim() : ''

  return (
    <article className="kpi" aria-label={[label, valueText, deltaText && `${deltaText} ${deltaLabel ?? ''}`].filter(Boolean).join(', ')}>
      <header className="kpi__head">
        {Icon && (
          <span className="kpi__icon">
            <Icon size={16} aria-hidden="true" />
          </span>
        )}
        <h3 className="kpi__label">{label}</h3>
      </header>
      <p className="kpi__value" aria-hidden="true">
        {fmt.format(value)}
        {unit && <span className="kpi__unit">{unit}</span>}
      </p>
      {trend && trend.filter((v) => v != null).length > 2 && <Sparkline values={trend} />}
      {(delta !== undefined || caption) && (
        <p className="kpi__foot" aria-hidden="true">
          {delta !== undefined && (
            <span className={`kpi__delta kpi__delta--${tone}`}>
              <DeltaIcon size={14} strokeWidth={2.25} />
              {deltaText}
            </span>
          )}
          {deltaLabel && <span className="kpi__delta-label">{deltaLabel}</span>}
          {caption && <span className="kpi__caption">{caption}</span>}
        </p>
      )}
    </article>
  )
}

/** Minimal inline SVG sparkline; the last point is marked. Hidden from screen readers. */
function Sparkline({ values }: { values: (number | null)[] }) {
  const w = 120
  const h = 28
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null)
  const min = Math.min(...pts.map((p) => p.v))
  const max = Math.max(...pts.map((p) => p.v))
  const x = (i: number) => (values.length > 1 ? (i / (values.length - 1)) * (w - 4) + 2 : w / 2)
  const y = (v: number) => (max === min ? h / 2 : h - 3 - ((v - min) / (max - min)) * (h - 6))
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  return (
    <svg className="kpi__spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d={`${d} L${x(last.i).toFixed(1)},${h} L${x(pts[0].i).toFixed(1)},${h} Z`} className="kpi__spark-area" />
      <path d={d} className="kpi__spark-line" />
      <circle cx={x(last.i)} cy={y(last.v)} r="2.5" className="kpi__spark-dot" />
    </svg>
  )
}

/** Responsive row of KPI cards. */
export function KpiGrid({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <section className="kpi-grid" aria-label={label}>
      {children}
    </section>
  )
}
