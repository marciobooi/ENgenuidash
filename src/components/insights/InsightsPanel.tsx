import { Lightbulb, Minus, TrendingDown, TrendingUp, Trophy } from 'lucide-react'
import { useId } from 'react'
import './insights.css'

/** Text with emphasised values: plain strings and { strong } parts. */
export type InsightPart = string | { strong: string }

export interface InsightItem {
  /** Icon and accent: a record, a rise, a fall or a neutral comparison. */
  tone: 'record' | 'up' | 'down' | 'neutral'
  parts: InsightPart[]
}

const ICONS = { record: Trophy, up: TrendingUp, down: TrendingDown, neutral: Minus }

/**
 * "Key insights" panel, as in the Eurostat energy tools: a short list of findings with the
 * figures in bold. The icons are decorative; each sentence says the direction in words, so a
 * screen reader gets the full meaning from the list alone.
 */
export function InsightsPanel({ title, items }: { title: string; items: InsightItem[] }) {
  const id = useId()
  if (!items.length) return null
  return (
    <section className="insights" aria-labelledby={`${id}-title`}>
      <h3 className="insights__title" id={`${id}-title`}>
        <Lightbulb size={16} aria-hidden="true" />
        {title}
      </h3>
      <ul className="insights__list">
        {items.map((item, i) => {
          const Icon = ICONS[item.tone]
          return (
            <li key={i} className={`insights__item insights__item--${item.tone}`}>
              <span className="insights__icon" aria-hidden="true">
                <Icon size={14} strokeWidth={2.25} />
              </span>
              <span>{item.parts.map((p, k) => (typeof p === 'string' ? p : <strong key={k}>{p.strong}</strong>))}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
