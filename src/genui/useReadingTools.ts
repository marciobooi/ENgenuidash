import { useEffect, useState } from 'react'
import type { DashboardSpec } from './types'

const LEVEL_KEY = 'engenui.level'
const SEEN_KEY = 'engenui.seen'
/** The id of the dashboard's element (full screen and the arrow keys act on it). */
export const ROOT_ID = 'dash-root'

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // (private windows and blocked storage: the preference is just not kept)
  }
}

/**
 * What a reader can do with a dashboard besides reading it: switch between plain words and details (kept on this
 * device), present it full screen one section at a time, print it or save it as PDF, and see when Eurostat has updated
 * its data since the reader last looked (the dataset's date in the catalogue is kept in the browser, never sent).
 */
export function useReadingTools(spec: DashboardSpec) {
  const [level, setLevelState] = useState<'plain' | 'details'>(() => (read(LEVEL_KEY) === 'plain' ? 'plain' : 'details'))
  const [present, setPresent] = useState(false)
  const updated = spec.about?.updated
  const [badgeDate] = useState<string | null>(() => {
    if (!updated) return null
    try {
      const seen = JSON.parse(read(SEEN_KEY) ?? '{}') as Record<string, string>
      const before = seen[updated.code]
      return before && before < updated.date ? updated.date : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (!updated) return
    try {
      const seen = JSON.parse(read(SEEN_KEY) ?? '{}') as Record<string, string>
      seen[updated.code] = updated.date
      write(SEEN_KEY, JSON.stringify(seen))
    } catch {
      // (nothing to keep)
    }
  }, [updated])

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setPresent(false)
    }
    const openAbout = () => document.querySelectorAll<HTMLDetailsElement>('.dash__about, .dash__table').forEach((d) => (d.open = true))
    document.addEventListener('fullscreenchange', onChange)
    window.addEventListener('beforeprint', openAbout)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      window.removeEventListener('beforeprint', openAbout)
    }
  }, [])

  const setLevel = (next: 'plain' | 'details') => {
    setLevelState(next)
    write(LEVEL_KEY, next)
  }
  const togglePresent = async () => {
    if (present) {
      setPresent(false)
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
      return
    }
    setPresent(true)
    await document.getElementById(ROOT_ID)?.requestFullscreen?.().catch(() => undefined)
  }
  /** Arrow keys and page keys move between the sections of a presentation. */
  const onPresentKey = (e: React.KeyboardEvent) => {
    if (!present) return
    const next = ['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key) ? 1 : ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key) ? -1 : 0
    if (!next) return
    const sections = [...(document.getElementById(ROOT_ID)?.querySelectorAll<HTMLElement>('.dash__section') ?? [])]
    const here = sections.findIndex((s) => s.getBoundingClientRect().top >= -4)
    const target = sections[Math.min(Math.max((here < 0 ? sections.length - 1 : here) + next, 0), sections.length - 1)]
    if (target) {
      e.preventDefault()
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
  return { level, setLevel, present, togglePresent, onPresentKey, badgeDate, print: () => window.print() }
}
