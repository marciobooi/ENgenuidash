import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ChatMessage,
  FileProgress,
  GenerationOptions,
  GenerationStats,
  WorkerRequest,
  WorkerResponse,
} from './protocol'
import { isMobileDevice } from './device'
import type { Source } from './grounding'
import type { Plan } from '../genui/types'

export type ModelStatus = 'loading' | 'ready' | 'error'

/** A chat message as shown in the UI. */
export interface UIMessage extends ChatMessage {
  /** Eurostat datasets the answer was based on. */
  sources?: Source[]
  /** Set on canned replies that never reached the model (e.g. off-topic refusals). */
  kind?: 'refusal' | 'error' | 'quote'
  /** Link to a dashboard built for this message. */
  card?: { index: number; title: string }
  /** One-click answers to a clarifying question. */
  choices?: { label: string; query: string; plan?: Plan; explain?: boolean }[]
  /** Shown with a progress indicator until updated (e.g. while a dashboard is built). */
  pending?: boolean
  /** UI-only message (dashboards, refusals, clarifications): never sent to the model. */
  local?: boolean
  /** Exact text the model received for this user message (question + Eurostat context). */
  prompt?: string
}

export interface AskOptions {
  systemPrompt: string
  options: GenerationOptions
  /**
   * Optional retrieval step run before generation. `prompt` replaces the user text sent to the
   * model (e.g. question + Eurostat data); the chat still shows the original question.
   */
  prepare?: (signal: AbortSignal) => Promise<{ prompt?: string | null; sources?: Source[] }>
}

export type Phase = 'idle' | 'retrieving' | 'generating'

/** Discrete lifecycle events, e.g. for screen-reader announcements. */
export type LLMEvent =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'error'; message: string; duringLoad: boolean }
  | { type: 'retrieving' }
  | { type: 'start' }
  | { type: 'done'; text: string; stopped: boolean }

export function useLocalLLM(onEvent?: (e: LLMEvent) => void) {
  const workerRef = useRef<Worker | null>(null)
  const onEventRef = useRef(onEvent)
  const replyRef = useRef('')
  const stoppedRef = useRef(false)
  const loadingRef = useRef(true)
  const sourcesRef = useRef<Source[] | undefined>(undefined)
  const abortRef = useRef<AbortController | null>(null)
  const [status, setStatus] = useState<ModelStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Record<string, FileProgress>>({})
  const [runtime, setRuntime] = useState<{ model: string; device: string; dtype: string; source: string; loadMs: number } | null>(null)
  const [stats, setStats] = useState<GenerationStats | null>(null)
  // Streamed text is buffered and flushed once per animation frame (not one render per token).
  const pendingTextRef = useRef('')
  const frameRef = useRef(0)
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [generating, setGenerating] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [tps, setTps] = useState<number | null>(null)
  // Pending multiple-choice requests, by id.
  const choicesRef = useRef(new Map<number, { resolve: (p: number[]) => void; reject: (e: Error) => void }>())
  const choiceIdRef = useRef(0)

  useEffect(() => {
    onEventRef.current = onEvent
  })

  useEffect(() => {
    const files: Record<string, FileProgress> = {}
    const emit = (e: LLMEvent) => onEventRef.current?.(e)
    const flush = () => {
      const text = pendingTextRef.current
      if (!text) return
      pendingTextRef.current = ''
      setMessages((m) => {
        const last = m[m.length - 1]
        return [...m.slice(0, -1), { ...last, content: last.content + text }]
      })
    }
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      switch (msg.type) {
        case 'progress':
          files[msg.file] = msg
          setProgress({ ...files })
          emit({
            type: 'progress',
            loaded: Object.values(files).reduce((n, f) => n + f.loaded, 0),
            total: Object.values(files).reduce((n, f) => n + f.total, 0),
          })
          break
        case 'ready':
          setRuntime({ model: msg.model, device: msg.device, dtype: msg.dtype, source: msg.source, loadMs: msg.loadMs })
          setStatus('ready')
          loadingRef.current = false
          emit({ type: 'ready' })
          break
        case 'start':
          setGenerating(true)
          setTps(null)
          setPhase('generating')
          setMessages((m) => [...m, { role: 'assistant', content: '', sources: sourcesRef.current }])
          replyRef.current = ''
          emit({ type: 'start' })
          break
        case 'token':
          replyRef.current += msg.text
          pendingTextRef.current += msg.text
          if (!frameRef.current) {
            frameRef.current = requestAnimationFrame(() => {
              frameRef.current = 0
              flush()
              setTps(msg.tps || null)
            })
          }
          break
        case 'done':
          cancelAnimationFrame(frameRef.current)
          frameRef.current = 0
          flush()
          if (msg.stats) setStats(msg.stats)
          setGenerating(false)
          setPhase('idle')
          emit({ type: 'done', text: replyRef.current.trim(), stopped: stoppedRef.current })
          break
        case 'choice': {
          const pending = choicesRef.current.get(msg.id)
          choicesRef.current.delete(msg.id)
          if (msg.probs) pending?.resolve(msg.probs)
          else pending?.reject(new Error(msg.error ?? 'No answer'))
          break
        }
        case 'error':
          setError(msg.message)
          setGenerating(false)
          setPhase('idle')
          setStatus((s) => (s === 'loading' ? 'error' : s))
          emit({ type: 'error', message: msg.message, duringLoad: loadingRef.current })
          break
      }
    }

    // Start downloading the model as soon as the page opens.
    worker.postMessage({ type: 'load', mobile: isMobileDevice() } satisfies WorkerRequest)

    return () => {
      cancelAnimationFrame(frameRef.current)
      worker.terminate()
    }
  }, [])

  const send = useCallback((req: WorkerRequest) => workerRef.current?.postMessage(req), [])

  const load = useCallback(() => {
    setError(null)
    setStatus('loading')
    loadingRef.current = true
    send({ type: 'load', mobile: isMobileDevice() })
  }, [send])

  const ask = useCallback(
    async (text: string, { systemPrompt, options, prepare }: AskOptions) => {
      const next: UIMessage[] = [...messages, { role: 'user', content: text }]
      setError(null)
      setMessages(next)
      setGenerating(true)
      stoppedRef.current = false
      sourcesRef.current = undefined

      const abort = new AbortController()
      abortRef.current = abort
      let prompt = text
      if (prepare) {
        setPhase('retrieving')
        onEventRef.current?.({ type: 'retrieving' })
        const prepared = await prepare(abort.signal)
        if (abort.signal.aborted) {
          setGenerating(false)
          setPhase('idle')
          onEventRef.current?.({ type: 'done', text: '', stopped: true })
          return
        }
        prompt = prepared.prompt ?? text
        sourcesRef.current = prepared.sources?.length ? prepared.sources : undefined
      }
      abortRef.current = null

      // Remember the exact prompt so later turns resend it unchanged: the worker can then reuse
      // the KV cache for the whole earlier conversation instead of recomputing it.
      setMessages((m) => m.map((msg, i) => (i === m.length - 1 && msg.role === 'user' ? { ...msg, prompt } : msg)))
      const history: ChatMessage[] = [
        ...(systemPrompt.trim() ? [{ role: 'system' as const, content: systemPrompt.trim() }] : []),
        ...next
          .slice(0, -1)
          .filter((m) => !m.local && !m.pending)
          .map(({ role, content, prompt: sent }) => ({ role, content: role === 'user' ? (sent ?? content) : content })),
        { role: 'user', content: prompt },
      ]
      send({ type: 'generate', messages: history, options })
    },
    [messages, send],
  )

  /**
   * Asks the model to pick one of `count` numbered options (see the worker's `choose`).
   * Resolves with one probability per option; never adds anything to the chat.
   */
  const choose = useCallback(
    (messages: ChatMessage[], count: number) =>
      new Promise<number[]>((resolve, reject) => {
        const id = ++choiceIdRef.current
        choicesRef.current.set(id, { resolve, reject })
        send({ type: 'choose', id, messages, count })
      }),
    [send],
  )

  /** Adds a question and a fixed answer without running the model (e.g. off-topic refusal). */
  const reply = useCallback((question: string, answer: string, kind?: UIMessage['kind'], sources?: Source[]) => {
    setError(null)
    setMessages((m) => [
      ...m,
      { role: 'user', content: question, local: true },
      { role: 'assistant', content: answer, kind, local: true, sources },
    ])
  }, [])

  /** Appends messages outside the model flow (dashboards, clarifications). */
  const append = useCallback(
    (...msgs: UIMessage[]) => setMessages((m) => [...m, ...msgs.map((msg) => ({ ...msg, local: true }))]),
    [],
  )

  /** Updates the most recent message matching `where` (e.g. a pending dashboard placeholder). */
  const updateLast = useCallback((where: (m: UIMessage) => boolean, patch: Partial<UIMessage>) => {
    setMessages((m) => {
      const i = m.findLastIndex(where)
      if (i < 0) return m
      const next = [...m]
      next[i] = { ...next[i], ...patch }
      return next
    })
  }, [])

  const stop = useCallback(() => {
    stoppedRef.current = true
    if (abortRef.current) abortRef.current.abort()
    else send({ type: 'interrupt' })
  }, [send])
  const clear = useCallback(() => {
    setMessages([])
    send({ type: 'reset' })
  }, [send])

  return { status, error, progress, runtime, stats, messages, generating, phase, tps, load, ask, choose, reply, append, updateLast, stop, clear }
}
