import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { useId } from 'react'
import type { WidgetSpec } from './types'

type Breakdown = Extract<WidgetSpec, { type: 'breakdown' }>

const Arrow = ({ direction }: { direction: 'up' | 'down' | 'flat' }) => {
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : ArrowRight
  return <Icon size={14} strokeWidth={2.25} aria-hidden="true" />
}

/**
 * List card: items (countries, energy sources…) with their value and change, plus a small area
 * chart of the leading item. Plain HTML/SVG, so it reads well with a screen reader as a list.
 */
export function BreakdownCard({ widget }: { widget: Breakdown }) {
  const id = useId()
  const { title, subtitle, headline, items, trend } = widget

  return (
    <section className="breakdown chart-card" aria-labelledby={`${id}-title`}>
      <div className="chart-card__head">
        <h3 className="chart-card__title" id={`${id}-title`}>
          {title}
        </h3>
        {subtitle && <span className="chart-card__subtitle">{subtitle}</span>}
      </div>
      {headline && (
        <p className="breakdown__headline">
          <span className="breakdown__headline-value">{headline.value}</span>
          <span className="breakdown__headline-label">{headline.label}</span>
        </p>
      )}
      <ul className="breakdown__list">
        {items.map((item) => (
          <li key={item.name} className="breakdown__item">
            <span className="breakdown__name">{item.name}</span>
            <span className="breakdown__value">{item.value}</span>
            {item.change ? (
              <span className={`breakdown__change breakdown__change--${item.change.direction}`}>
                <Arrow direction={item.change.direction} />
                {item.change.text}
              </span>
            ) : (
              <span className="breakdown__change" />
            )}
          </li>
        ))}
      </ul>
      {trend && trend.data.filter((v) => v != null).length > 2 && <MiniArea {...trend} />}
    </section>
  )
}

function MiniArea({ label, categories, data }: { label: string; categories: string[]; data: (number | null)[] }) {
  const w = 320
  const h = 90
  const pts = data.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null)
  const min = Math.min(0, ...pts.map((p) => p.v))
  const max = Math.max(...pts.map((p) => p.v))
  const x = (i: number) => (data.length > 1 ? (i / (data.length - 1)) * (w - 8) + 4 : w / 2)
  const y = (v: number) => (max === min ? h / 2 : h - 4 - ((v - min) / (max - min)) * (h - 12))
  const line = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(pts[pts.length - 1].i).toFixed(1)},${h} L${x(pts[0].i).toFixed(1)},${h} Z`
  return (
    <figure className="breakdown__trend">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d={area} className="breakdown__area" />
        <path d={line} className="breakdown__line" />
      </svg>
      <figcaption className="breakdown__trend-caption">
        <span>{categories[0]}</span>
        <span>{label}</span>
        <span>{categories[categories.length - 1]}</span>
      </figcaption>
    </figure>
  )
}
