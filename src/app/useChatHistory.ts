import { useEffect, useMemo, useRef, useState } from 'react'
import type { Strings } from '../i18n'
import type { Assistant } from './useAssistant'
import type { Dashboards } from './useDashboards'
import { browserStorage, createChatStore, type Session, type SessionSummary } from './chatStore'
import { fill } from './text'

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)

/**
 * The conversation memory: the conversation on screen is saved on this device as it goes (see
 * chatStore.ts), earlier ones can be reopened, deleted one by one or all at once, and saving can be
 * switched off. Reopening rebuilds the conversation's dashboards from their plans.
 */
export function useChatHistory({
  assistant,
  dash,
  t,
  announce,
  onReset,
  onOpened,
}: {
  assistant: Assistant
  dash: Dashboards
  t: Strings
  announce: (text: string) => void
  /** The conversation on screen was deleted from the history: clear the screen. */
  onReset: () => void
  /** A saved conversation is on screen. */
  onOpened: () => void
}) {
  const { llm } = assistant
  const store = useMemo(() => createChatStore(browserStorage()), [])
  const [enabled, setEnabledState] = useState(() => store.enabled())
  const [sessions, setSessions] = useState<SessionSummary[]>(() => store.list())
  const [currentId, setCurrentId] = useState<string | null>(null)
  const idRef = useRef<string | null>(null)
  const createdRef = useRef(0)
  const restoringRef = useRef(false)
  const available = useMemo(() => browserStorage() !== null, [])

  const setCurrent = (id: string | null) => {
    idRef.current = id
    setCurrentId(id)
  }

  // Save the conversation as it goes (a moment after the last change, and not while a reply or a
  // dashboard is being made: the half-finished state is not worth keeping).
  useEffect(() => {
    if (!enabled || llm.generating || dash.building || restoringRef.current || !llm.messages.some((m) => m.role === 'user')) return
    const timer = window.setTimeout(() => {
      if (!idRef.current) {
        idRef.current = newId()
        createdRef.current = Date.now()
        setCurrentId(idRef.current)
      }
      const session: Session = {
        id: idRef.current,
        title: '',
        created: createdRef.current || Date.now(),
        updated: 0,
        messages: llm.messages,
        dashboards: dash.dashboards.map((d) => ({ plan: d.plan, question: d.question ?? '' })),
        active: dash.active,
      }
      if (store.save(session)) setSessions(store.list())
    }, 400)
    return () => window.clearTimeout(timer)
  }, [enabled, llm.messages, llm.generating, dash.dashboards, dash.active, dash.building, store])

  return {
    available,
    enabled,
    sessions,
    currentId,

    /** A new conversation: the one on screen stays in the history. */
    startNew: () => setCurrent(null),

    async open(id: string) {
      if (llm.generating || dash.building) return
      const session = store.load(id)
      if (!session) {
        store.remove(id)
        setSessions(store.list())
        return
      }
      restoringRef.current = true
      announce(t.history.restoring)
      try {
        const map = await dash.restore(session.dashboards, session.active)
        // The chat cards point at the rebuilt dashboards (a card whose dashboard is gone is dropped).
        const messages = session.messages.map((m) => {
          if (!m.card) return m
          const index = map[m.card.index] ?? -1
          const rest = { ...m }
          delete rest.card
          return index >= 0 ? { ...rest, card: { ...m.card, index } } : rest
        })
        llm.restore(messages)
        createdRef.current = session.created
        idRef.current = id
        setCurrentId(id)
        announce(fill(t.history.restored, { title: session.title }))
        onOpened()
      } finally {
        restoringRef.current = false
      }
    },

    remove(id: string) {
      store.remove(id)
      setSessions(store.list())
      announce(t.history.deleted)
      if (id === idRef.current) {
        setCurrent(null)
        onReset()
      }
    },

    clearAll() {
      store.clear()
      setSessions([])
      announce(t.history.allDeleted)
      if (idRef.current) {
        setCurrent(null)
        onReset()
      }
    },

    setEnabled(on: boolean) {
      store.setEnabled(on)
      setEnabledState(on)
      setSessions(store.list())
    },
  }
}

export type ChatHistory = ReturnType<typeof useChatHistory>
