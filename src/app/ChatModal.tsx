import { MessagesSquare, X } from 'lucide-react'
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { Tooltip } from '../components/tooltip'
import type { Strings } from '../i18n'

/**
 * Once a dashboard is on screen, the chat lives behind a floating button and opens as a modal:
 * a native <dialog>, so focus trap, Escape and the inert background come for free.
 */
export function ChatModal({
  t,
  open,
  unread,
  busy,
  onOpen,
  onClose,
  fabRef,
  onOpened,
  children,
}: {
  t: Strings
  open: boolean
  unread: boolean
  busy: boolean
  onOpen: () => void
  /** The dialog closed (close button, Escape, or `open` set to false). */
  onClose: () => void
  fabRef: RefObject<HTMLButtonElement | null>
  /** The dialog just opened (e.g. to focus the message box). */
  onOpened: () => void
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const onOpenedRef = useRef(onOpened)
  useEffect(() => {
    onOpenedRef.current = onOpened
  })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      onOpenedRef.current()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <>
      <Tooltip content={t.openChat} placement="top">
        <button
          ref={fabRef}
          type="button"
          className={`chat-fab${unread ? ' chat-fab--unread' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={onOpen}
        >
          <MessagesSquare size={22} aria-hidden="true" />
          {(busy || unread) && <span className="chat-fab__dot" aria-hidden="true" />}
        </button>
      </Tooltip>
      <dialog ref={dialogRef} className="chat-modal" aria-labelledby="chat-modal-title" onClose={onClose}>
        <div className="chat-modal__head">
          <h2 id="chat-modal-title" className="chat-modal__title">
            <MessagesSquare size={18} aria-hidden="true" />
            {t.chatTitle}
          </h2>
          <Tooltip content={t.closeChat} placement="bottom">
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                dialogRef.current?.close()
                fabRef.current?.focus()
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
        {children}
      </dialog>
    </>
  )
}
