import { ArrowDownRight, ArrowRight, ArrowUpRight, MessageSquareText } from 'lucide-react'
import { useId } from 'react'
import type { WidgetSpec } from './types'

type Answer = Extract<WidgetSpec, { type: 'answer' }>

/**
 * The direct answer to a focused question, at the top of the dashboard: the headline (a country,
 * a year, a change) large, then the full sentence and a few supporting facts. Screen readers get
 * the sentence, which says everything the headline shows.
 */
export function AnswerCard({ widget, label }: { widget: Answer; label: string }) {
  const id = useId()
  const { headline, value, direction, text, facts = [] } = widget
  const Arrow = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : direction === 'flat' ? ArrowRight : null

  return (
    <section className="answer-card" aria-labelledby={`${id}-label`}>
      <h3 className="answer-card__label" id={`${id}-label`}>
        <MessageSquareText size={16} aria-hidden="true" />
        {label}
      </h3>
      <p className={`answer-card__headline${direction ? ` answer-card__headline--${direction}` : ''}`} aria-hidden="true">
        {Arrow && <Arrow size={26} strokeWidth={2.25} />}
        <strong>{headline}</strong>
        {value && <span className="answer-card__value">{value}</span>}
      </p>
      <p className="answer-card__text">{text}</p>
      {facts.length > 0 && (
        <dl className="answer-card__facts">
          {facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
