import { CircleAlert, Database, ExternalLink, LayoutDashboard, ShieldAlert } from 'lucide-react'
import type { RefObject } from 'react'
import type { Strings } from '../i18n'
import type { UIMessage } from '../llm/useLocalLLM'

type Choice = NonNullable<UIMessage['choices']>[number]

/**
 * The conversation: messages with their labels (from Eurostat documents, written by the
 * assistant), dashboard cards, one-click choices and sources. A log for screen readers; replies
 * are announced once complete (see useAssistant), not token by token.
 */
export function ChatThread({
  t,
  messages,
  generating,
  retrieving,
  busy,
  activeDashboard,
  hasDashboard,
  onShowDashboard,
  onChoice,
  endRef,
}: {
  t: Strings
  messages: UIMessage[]
  generating: boolean
  retrieving: boolean
  busy: boolean
  activeDashboard: number
  hasDashboard: boolean
  onShowDashboard: (index: number) => void
  onChoice: (choice: Choice) => void
  endRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <div className="thread" role="log" aria-label={t.conversation} aria-busy={busy}>
      {messages.map((m, i) => (
        <div key={i} className={`msg msg--${m.role}${m.kind ? ` msg--${m.kind}` : ''}${m.pending ? ' msg--status' : ''}`}>
          <span className="sr-only">{m.role === 'user' ? t.you : t.assistant}: </span>
          {m.kind === 'refusal' && <ShieldAlert className="msg__icon" size={16} aria-hidden="true" />}
          {m.kind === 'error' && <CircleAlert className="msg__icon msg__icon--error" size={16} aria-hidden="true" />}
          {m.kind === 'quote' && <span className="msg__quote-label">{t.fromEurostat}</span>}
          {m.kind === 'generated' && <span className="msg__quote-label msg__quote-label--generated">{t.writtenByAssistant}</span>}
          {m.pending && <Database size={15} aria-hidden="true" />}
          {m.content || (generating && i === messages.length - 1 ? <span className="msg__typing" aria-label={t.responding} role="img" /> : '')}
          {m.card && (
            <button
              type="button"
              className={`dash-card${m.card.index === activeDashboard && hasDashboard ? ' dash-card--active' : ''}`}
              aria-current={m.card.index === activeDashboard ? 'true' : undefined}
              onClick={() => onShowDashboard(m.card!.index)}
            >
              <LayoutDashboard size={16} aria-hidden="true" />
              <span className="dash-card__title">{m.card.title}</span>
              <span className="dash-card__action">{t.showDashboard}</span>
            </button>
          )}
          {m.choices && (
            <ul className="msg__choices">
              {m.choices.map((c) => (
                <li key={c.label}>
                  <button type="button" className="suggestion-chip" disabled={busy} onClick={() => onChoice(c)}>
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {m.sources && m.sources.length > 0 && (
            <div className="msg__sources">
              <span className="msg__sources-label">{t.sources}</span>
              <ul>
                {m.sources.map((src, k) => (
                  <li key={`${src.url}-${k}`}>
                    <a href={src.url} target="_blank" rel="noreferrer" className="source-chip">
                      <Database size={13} aria-hidden="true" />
                      <span className="source-chip__title">{src.title}</span>
                      <span className="source-chip__code">{src.code}</span>
                      <ExternalLink size={12} aria-hidden="true" />
                      <span className="sr-only"> ({t.opensNewTab})</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
      {retrieving && (
        <div className="msg msg--assistant msg--status">
          <Database size={15} aria-hidden="true" />
          {t.searchingData}
        </div>
      )}
      <div ref={endRef} />
    </div>
  )
}
