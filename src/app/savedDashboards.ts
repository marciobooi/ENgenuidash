import { useState } from 'react'
import type { Plan } from '../genui/types'

/**
 * "My dashboards": the dashboards a reader starred, kept on this device (localStorage, never sent anywhere), shown on
 * the welcome screen so a returning reader starts from their own countries and topics.
 */
export interface SavedDashboard {
  id: string
  title: string
  plan: Plan
  savedAt: string
}

const KEY = 'engenui.saved'
const MAX = 12

/** A short stable id for a plan (the same dashboard saves once). */
export const planId = (plan: Plan): string => {
  const text = JSON.stringify({ ...plan, also: undefined, notes: undefined, fallback: undefined })
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export function loadSaved(): SavedDashboard[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as SavedDashboard[]
    return Array.isArray(raw) ? raw.filter((x) => x && typeof x.id === 'string' && typeof x.title === 'string' && x.plan) : []
  } catch {
    return []
  }
}

function store(list: SavedDashboard[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // (storage blocked: the shelf works for this visit only)
  }
}

export function useSavedDashboards() {
  const [saved, setSaved] = useState<SavedDashboard[]>(loadSaved)
  const isSaved = (plan: Plan) => saved.some((x) => x.id === planId(plan))
  const toggle = (plan: Plan, title: string) => {
    const id = planId(plan)
    setSaved((list) => {
      const next = list.some((x) => x.id === id) ? list.filter((x) => x.id !== id) : [{ id, title, plan, savedAt: new Date().toISOString() }, ...list].slice(0, MAX)
      store(next)
      return next
    })
  }
  const remove = (id: string) =>
    setSaved((list) => {
      const next = list.filter((x) => x.id !== id)
      store(next)
      return next
    })
  return { saved, isSaved, toggle, remove }
}
