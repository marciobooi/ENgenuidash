import type { Plan } from '../genui/types'
import type { UIMessage } from '../llm/useLocalLLM'

/**
 * The conversations kept on this device, in the browser's localStorage (never a cookie: cookies
 * travel to the server with every request, hold 4 KB and need a consent banner; this page has no
 * server that should see the conversations). Nothing is sent anywhere. The user can switch saving
 * off, delete one conversation or all of them, and conversations expire after RETENTION_DAYS.
 *
 * One key per conversation plus an index of summaries, so listing the history does not parse the
 * conversations and saving one writes only its own key. Storage can be missing (private mode,
 * blocked) or full: nothing here throws, the page works the same without it.
 */

export interface StoredDashboard {
  plan: Plan
  question: string
}

export interface Session {
  id: string
  title: string
  created: number
  updated: number
  messages: UIMessage[]
  /** The dashboards of the conversation, in order (rebuilt from their plans when it is reopened). */
  dashboards: StoredDashboard[]
  /** The dashboard that was on screen. */
  active: number
}

export interface SessionSummary {
  id: string
  title: string
  updated: number
  messages: number
}

export const MAX_SESSIONS = 20
export const MAX_MESSAGES = 80
export const MAX_DASHBOARDS = 8
export const RETENTION_DAYS = 30

const INDEX = 'engenui.chat.index'
const SESSION = 'engenui.chat.s.'
const ENABLED = 'engenui.chat.enabled'
const DAY = 24 * 60 * 60 * 1000

/** A title from the first question. */
export function titleOf(messages: UIMessage[]): string {
  const first = messages.find((m) => m.role === 'user')?.content.replace(/\s+/g, ' ').trim() ?? ''
  return first.length > 70 ? `${first.slice(0, 67)}…` : first
}

/**
 * What is worth keeping of a message: not what is still being built, nor the text the model was
 * given (question plus Eurostat excerpts, large and rebuilt for the next question anyway).
 */
function keep(m: UIMessage): UIMessage | null {
  if (m.pending) return null
  const rest = { ...m }
  delete rest.prompt
  return rest
}

const isMessage = (m: unknown): m is UIMessage =>
  !!m && typeof m === 'object' && ((m as UIMessage).role === 'user' || (m as UIMessage).role === 'assistant') && typeof (m as UIMessage).content === 'string'

function parse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function createChatStore(storage: Storage | null, now: () => number = Date.now) {
  const read = (key: string) => {
    try {
      return storage?.getItem(key) ?? null
    } catch {
      return null
    }
  }
  const write = (key: string, value: string): boolean => {
    try {
      storage?.setItem(key, value)
      return !!storage
    } catch {
      return false
    }
  }
  const drop = (key: string) => {
    try {
      storage?.removeItem(key)
    } catch {
      // nothing to remove from
    }
  }

  const readIndex = (): SessionSummary[] => {
    const all = parse<SessionSummary[]>(read(INDEX))
    return Array.isArray(all) ? all.filter((s) => s && typeof s.id === 'string' && typeof s.updated === 'number') : []
  }
  const writeIndex = (index: SessionSummary[]) => write(INDEX, JSON.stringify(index))

  const store = {
    /** Whether conversations are saved (on unless the user switched it off). */
    enabled: (): boolean => !!storage && read(ENABLED) !== 'off',

    /** Switching off stops saving and deletes what was saved. */
    setEnabled(on: boolean) {
      if (on) drop(ENABLED)
      else {
        write(ENABLED, 'off')
        store.clear()
      }
    },

    /** The saved conversations, newest first, without the expired ones (which are deleted). */
    list(): SessionSummary[] {
      const index = readIndex()
      const live = index.filter((s) => now() - s.updated <= RETENTION_DAYS * DAY)
      if (live.length !== index.length) {
        for (const s of index) if (!live.includes(s)) drop(SESSION + s.id)
        writeIndex(live)
      }
      return live.sort((a, b) => b.updated - a.updated)
    },

    load(id: string): Session | null {
      const s = parse<Session>(read(SESSION + id))
      if (!s || s.id !== id || !Array.isArray(s.messages)) return null
      return {
        ...s,
        messages: s.messages.filter(isMessage),
        dashboards: Array.isArray(s.dashboards) ? s.dashboards.filter((d) => d && d.plan && typeof d.question === 'string') : [],
        active: typeof s.active === 'number' ? s.active : 0,
      }
    },

    /** Saves a conversation (one with no question yet is not worth keeping). False when nothing was written. */
    save(session: Session): boolean {
      if (!store.enabled() || !session.messages.some((m) => m.role === 'user')) return false
      const messages = session.messages.map(keep).filter((m): m is UIMessage => !!m).slice(-MAX_MESSAGES)
      const dashboards = session.dashboards.slice(0, MAX_DASHBOARDS)
      const saved: Session = { ...session, title: titleOf(messages), updated: now(), messages, dashboards }
      const summary: SessionSummary = { id: saved.id, title: saved.title, updated: saved.updated, messages: messages.length }
      // The oldest conversations make room: over the limit, or when the storage is full.
      for (let attempt = 0; attempt < 4; attempt++) {
        const others = readIndex().filter((s) => s.id !== saved.id).sort((a, b) => b.updated - a.updated)
        const room = others.slice(0, MAX_SESSIONS - 1 - attempt)
        for (const s of others.slice(room.length)) drop(SESSION + s.id)
        if (write(SESSION + saved.id, JSON.stringify(saved)) && writeIndex([summary, ...room])) return true
      }
      return false
    },

    remove(id: string) {
      drop(SESSION + id)
      writeIndex(readIndex().filter((s) => s.id !== id))
    },

    /** Deletes every saved conversation. */
    clear() {
      for (const s of readIndex()) drop(SESSION + s.id)
      drop(INDEX)
    },
  }
  return store
}

export type ChatStore = ReturnType<typeof createChatStore>

/** localStorage, or null where the browser does not allow it. */
export function browserStorage(): Storage | null {
  try {
    const s = window.localStorage
    s.getItem(INDEX)
    return s
  } catch {
    return null
  }
}
