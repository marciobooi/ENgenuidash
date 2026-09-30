import { History, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Tooltip } from '../components/tooltip'
import type { Lang, Strings } from '../i18n'
import { RETENTION_DAYS, type SessionSummary } from './chatStore'
import { fill } from './text'

/**
 * The conversation history: a native <dialog> (focus trap, Escape and the inert background come
 * with it; a click on the backdrop closes it). Open a saved conversation, delete one or all of
 * them, and switch saving on this device off.
 */
export function HistoryDialog({
  t,
  lang,
  open,
  onClose,
  sessions,
  currentId,
  enabled,
  available,
  busy,
  onOpenSession,
  onRemove,
  onClearAll,
  onToggle,
}: {
  t: Strings
  lang: Lang
  open: boolean
  onClose: () => void
  sessions: SessionSummary[]
  currentId: string | null
  enabled: boolean
  available: boolean
  busy: boolean
  onOpenSession: (id: string) => void
  onRemove: (id: string) => void
  onClearAll: () => void
  onToggle: (on: boolean) => void
}) {
  const h = t.history
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pressedOnBackdrop = useRef(false)
  const [confirmAll, setConfirmAll] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      dialog.querySelector<HTMLElement>('h2')?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const when = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <dialog
      ref={dialogRef}
      className="history-modal"
      aria-labelledby="history-title"
      onClose={() => {
        setConfirmAll(false)
        onClose()
      }}
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === dialogRef.current
      }}
      onClick={(e) => {
        if (pressedOnBackdrop.current && e.target === dialogRef.current) dialogRef.current?.close()
      }}
    >
      <div className="chat-modal__head">
        <h2 id="history-title" className="chat-modal__title" tabIndex={-1}>
          <History size={18} aria-hidden="true" />
          {h.title}
        </h2>
        <Tooltip content={h.close} placement="bottom">
          <button type="button" className="icon-btn" aria-label={h.close} onClick={() => dialogRef.current?.close()}>
            <X size={18} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>

      <div className="history-modal__body">
        <p className="history-modal__note">{available ? fill(h.note, { days: String(RETENTION_DAYS) }) : h.unavailable}</p>

        {available && (
          <div className="history-switch">
            <label className="history-switch__label">
              <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} aria-describedby="history-switch-note" />
              {h.save}
            </label>
            <span id="history-switch-note" className="history-modal__hint">
              {enabled ? h.turnOffNote : h.saveOff}
            </span>
          </div>
        )}

        {sessions.length === 0 ? (
          <p className="history-modal__empty">{h.empty}</p>
        ) : (
          <ul className="history-list">
            {sessions.map((s) => (
              <li key={s.id} className={`history-item${s.id === currentId ? ' history-item--current' : ''}`}>
                <button
                  type="button"
                  className="history-item__open"
                  disabled={busy}
                  aria-current={s.id === currentId ? 'true' : undefined}
                  aria-label={fill(h.openConversation, { title: s.title })}
                  onClick={() => onOpenSession(s.id)}
                >
                  <span className="history-item__title">{s.title}</span>
                  <span className="history-item__meta">
                    {when.format(s.updated)} · {fill(h.messages, { n: String(s.messages) })}
                    {s.id === currentId ? ` · ${h.openNow}` : ''}
                  </span>
                </button>
                <Tooltip content={fill(h.deleteConversation, { title: s.title })} placement="top">
                  <button type="button" className="icon-btn" aria-label={fill(h.deleteConversation, { title: s.title })} onClick={() => onRemove(s.id)}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}

        {sessions.length > 0 &&
          (confirmAll ? (
            <div className="history-confirm" role="alert">
              <p>{h.confirmAll}</p>
              <button
                type="button"
                className="history-btn history-btn--danger"
                onClick={() => {
                  onClearAll()
                  setConfirmAll(false)
                }}
              >
                {h.confirmYes}
              </button>
              <button type="button" className="history-btn" onClick={() => setConfirmAll(false)}>
                {h.cancel}
              </button>
            </div>
          ) : (
            <button type="button" className="history-btn history-btn--danger" onClick={() => setConfirmAll(true)}>
              <Trash2 size={16} aria-hidden="true" />
              {h.deleteAll}
            </button>
          ))}
      </div>
    </dialog>
  )
}
