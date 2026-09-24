import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import { Toaster as SonnerToaster } from 'sonner'
import './toast.css'

export interface ToasterLabels {
  /** Accessible name of the notification region. */
  region: string
  /** Hint for the keyboard shortcut that focuses the region, e.g. "press Alt+T to focus". */
  hotkeyHint: string
  /** Accessible name of each toast's close button. */
  close: string
}

const DEFAULT_LABELS: ToasterLabels = {
  region: 'Notifications',
  hotkeyHint: 'press Alt+T to focus',
  close: 'Close notification',
}

/**
 * App-wide notification area (Sonner), styled with ECL colour tokens.
 * - Sonner renders every toast inside an aria-live="polite" list, so each one is read out.
 * - Alt+T moves keyboard focus to the notifications; hover/focus pauses the timers.
 * - Every toast has a close button; errors stay until dismissed (no time limit to read them).
 * - Status is never colour-alone: each type has its own icon plus text.
 */
export function Toaster({ labels, dir = 'ltr' }: { labels?: Partial<ToasterLabels>; dir?: 'ltr' | 'rtl' }) {
  const l = { ...DEFAULT_LABELS, ...labels }
  return (
    <SonnerToaster
      position="bottom-right"
      dir={dir}
      hotkey={['altKey', 'KeyT']}
      customAriaLabel={`${l.region} (${l.hotkeyHint})`}
      containerAriaLabel={l.region}
      // Show every toast in full (no collapsed stack) so none is hidden behind another.
      expand
      visibleToasts={4}
      gap={10}
      closeButton
      icons={{
        success: <CircleCheck size={18} aria-hidden="true" />,
        info: <Info size={18} aria-hidden="true" />,
        warning: <TriangleAlert size={18} aria-hidden="true" />,
        error: <CircleAlert size={18} aria-hidden="true" />,
        loading: <LoaderCircle size={18} className="toast__spin" aria-hidden="true" />,
        close: <X size={14} aria-hidden="true" />,
      }}
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: l.close,
        classNames: {
          toast: 'toast',
          content: 'toast__content',
          title: 'toast__title',
          description: 'toast__description',
          icon: 'toast__icon',
          closeButton: 'toast__close',
          actionButton: 'toast__action',
          cancelButton: 'toast__cancel',
          success: 'toast--success',
          info: 'toast--info',
          warning: 'toast--warning',
          error: 'toast--error',
          loading: 'toast--loading',
        },
      }}
    />
  )
}
