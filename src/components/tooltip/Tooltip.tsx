import { cloneElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react'
import './tooltip.css'

type TriggerProps = {
  'aria-describedby'?: string
  'aria-label'?: string
}

export interface TooltipProps {
  /** Tooltip text. Keep it short; it must not hold information found nowhere else. */
  content: ReactNode
  /** A single focusable element (button, link…). */
  children: ReactElement<TriggerProps>
  /** ECL tooltips sit above or below their trigger. */
  placement?: 'top' | 'bottom'
  /**
   * 'label': the tooltip names an icon-only control (used as its aria-label when it has none).
   * 'description': the tooltip adds extra info (wired with aria-describedby).
   */
  kind?: 'label' | 'description'
  /** Delay before showing on hover, in ms. Keyboard focus shows it immediately. */
  delay?: number
}

/**
 * Accessible tooltip (WCAG 1.4.13): shows on hover and keyboard focus, stays open while
 * the pointer is over it, and Escape dismisses it without moving focus.
 */
export function Tooltip({ content, children, placement = 'top', kind = 'label', delay = 350 }: TooltipProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const show = (wait: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(true), wait)
  }
  const hide = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(false), 80)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const trigger = cloneElement(children, {
    'aria-describedby':
      kind === 'description'
        ? [children.props['aria-describedby'], `${id}-tip`].filter(Boolean).join(' ')
        : children.props['aria-describedby'],
    'aria-label':
      kind === 'label' && !children.props['aria-label'] && typeof content === 'string'
        ? content
        : children.props['aria-label'],
  })

  return (
    <span
      className="tooltip-anchor"
      onPointerEnter={() => show(delay)}
      onPointerLeave={hide}
      onFocus={() => show(0)}
      onBlur={hide}
    >
      {trigger}
      <span
        id={`${id}-tip`}
        role="tooltip"
        className={`tooltip tooltip--${placement}${open ? ' tooltip--open' : ''}`}
        // The label case is already announced through aria-label; avoid reading it twice.
        aria-hidden={kind === 'label' ? true : !open}
      >
        {content}
      </span>
    </span>
  )
}
