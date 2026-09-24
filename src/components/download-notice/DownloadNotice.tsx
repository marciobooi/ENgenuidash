import { Download, Wifi } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import './download-notice.css'

export interface DownloadNoticeLabels {
  title: string
  body: string
  wifi: string
  accept: string
  later: string
}

/**
 * First-run notice on phones and tablets: the assistant's language model is downloaded once
 * (from this site) before the chat can write answers. A native modal <dialog>: focus moves into
 * it, Escape means "not now", and the page behind is inert. Dashboards work either way.
 */
export function DownloadNotice({ labels, onAccept, onLater }: { labels: DownloadNoticeLabels; onAccept: () => void; onLater: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const acceptRef = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) {
      dialog.showModal()
      acceptRef.current?.focus()
    }
  }, [])

  return (
    <dialog ref={ref} className="download-notice" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} onCancel={onLater}>
      <span className="download-notice__icon" aria-hidden="true">
        <Download size={22} />
      </span>
      <h2 className="download-notice__title" id={`${id}-title`}>
        {labels.title}
      </h2>
      <div id={`${id}-body`}>
        <p className="download-notice__text">{labels.body}</p>
        <p className="download-notice__hint">
          <Wifi size={16} aria-hidden="true" />
          {labels.wifi}
        </p>
      </div>
      <div className="download-notice__actions">
        <button type="button" className="ecl-button ecl-button--secondary" onClick={onLater}>
          {labels.later}
        </button>
        <button ref={acceptRef} type="button" className="ecl-button ecl-button--primary" onClick={onAccept}>
          {labels.accept}
        </button>
      </div>
    </dialog>
  )
}
