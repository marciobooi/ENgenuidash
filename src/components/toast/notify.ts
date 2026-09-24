import { LoaderCircle } from 'lucide-react'
import { createElement, type ReactNode } from 'react'
import { toast, type ExternalToast } from 'sonner'

export type NotifyOptions = Pick<ExternalToast, 'description' | 'action' | 'cancel' | 'id' | 'duration' | 'onDismiss'>

// When a loading toast is replaced (same id), clear its spinner icon and class.
const reset = { icon: undefined, className: undefined }

/** Typed helpers so every call site uses the same durations and semantics. */
export const notify = {
  success: (title: ReactNode, o?: NotifyOptions) => toast.success(title, { ...reset, duration: 5000, ...o }),
  info: (title: ReactNode, o?: NotifyOptions) => toast.info(title, { ...reset, duration: 6000, ...o }),
  warning: (title: ReactNode, o?: NotifyOptions) => toast.warning(title, { ...reset, duration: 10000, ...o }),
  /** Errors never auto-dismiss, so users have time to read and act on them. */
  error: (title: ReactNode, o?: NotifyOptions) => toast.error(title, { ...reset, duration: Infinity, ...o }),
  /** In-progress toast; replace it later by calling another helper with the same `id`. */
  loading: (title: ReactNode, o?: NotifyOptions) =>
    // Plain toast with our own spinner so it sits in the icon tile like the other types.
    toast(title, {
      duration: Infinity,
      className: 'toast--loading',
      icon: createElement(LoaderCircle, { size: 18, className: 'toast__spin', 'aria-hidden': true }),
      ...o,
    }),
  promise: toast.promise,
  dismiss: toast.dismiss,
}
