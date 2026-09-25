import { ArrowUp, Plus, Square } from 'lucide-react'
import type { RefObject } from 'react'
import { Tooltip } from '../components/tooltip'
import type { Strings } from '../i18n'

/** The message box: Enter sends, Shift+Enter adds a line; new chat, send and stop buttons. */
export function Composer({
  t,
  value,
  onChange,
  onSend,
  onStop,
  onNewChat,
  canSend,
  canClear,
  generating,
  compact,
  inputRef,
}: {
  t: Strings
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  onNewChat: () => void
  canSend: boolean
  canClear: boolean
  generating: boolean
  /** One line (in a conversation) instead of two (welcome page). */
  compact: boolean
  inputRef: RefObject<HTMLTextAreaElement | null>
}) {
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault()
        onSend()
      }}
    >
      <label className="sr-only" htmlFor="chat-input">
        {t.message}
      </label>
      <textarea
        id="chat-input"
        ref={inputRef}
        className="composer__input"
        rows={compact ? 1 : 2}
        value={value}
        placeholder={t.placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSend()
          }
        }}
        aria-describedby="chat-input-hint"
        autoFocus
      />
      <span id="chat-input-hint" className="sr-only">
        {t.enterHint}
      </span>
      <div className="composer__bar">
        <Tooltip content={t.newChat}>
          {/* aria-disabled keeps the button focusable so its tooltip stays reachable. */}
          <button type="button" className="icon-btn" onClick={onNewChat} aria-disabled={!canClear}>
            <Plus size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </Tooltip>
        {generating ? (
          <Tooltip content={t.stop}>
            <button type="button" className="send-btn" onClick={onStop}>
              <Square size={12} fill="currentColor" aria-hidden="true" />
            </button>
          </Tooltip>
        ) : (
          <Tooltip content={t.send}>
            <button type="submit" className="send-btn" aria-disabled={!canSend}>
              <ArrowUp size={18} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>
    </form>
  )
}
