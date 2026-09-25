import { useEffect, useRef, useState } from 'react'
import { notify } from '../components/toast'
import type { Strings } from '../i18n'
import { isMobileDevice } from '../llm/device'
import { useLocalLLM } from '../llm/useLocalLLM'

// On phones and tablets the language model is downloaded only after the user agrees
// (DownloadNotice); the answer "Download now" is remembered on the device, and the model then
// loads on each visit. Computers load it straight away.
const DOWNLOAD_CONSENT_KEY = 'engenuidash.modelDownload'

function hasDownloadConsent(): boolean {
  try {
    return localStorage.getItem(DOWNLOAD_CONSENT_KEY) === 'accepted'
  } catch {
    return false
  }
}

function saveDownloadConsent() {
  try {
    localStorage.setItem(DOWNLOAD_CONSENT_KEY, 'accepted')
  } catch {
    // Private mode or blocked storage: the notice shows again next time.
  }
}

/**
 * The optional on-device language model and the chat thread it keeps: download consent and
 * notice, quiet load retries, screen-reader announcements of its progress, and the question that
 * asked for a fuller answer (answered as soon as the model is ready, see `answerPending`).
 */
export function useAssistant({
  t,
  announce,
  onReplyDone,
}: {
  t: Strings
  announce: (text: string) => void
  /** A written answer finished (e.g. to flag the chat button as unread). */
  onReplyDone: () => void
}) {
  // Phones and tablets ask before the download (mobile data, storage); computers load the model
  // from our server as soon as the page opens, so "Explain these figures" and written answers are
  // there without a question.
  const [askBeforeDownload] = useState(() => isMobileDevice() && !hasDownloadConsent())
  const [downloadNotice, setDownloadNotice] = useState(false)
  // The question that asked for a fuller answer, and how to answer it (set by the chat flow).
  const pendingQuestionRef = useRef<string | null>(null)
  const answerPendingRef = useRef<(question: string) => void>(() => {})

  // Screen-reader announcements: the thread is not a live region, so streamed tokens are not read
  // out one by one; the full reply is announced at the end.
  const llm = useLocalLLM(
    (e) => {
      switch (e.type) {
        case 'ready':
          if (pendingQuestionRef.current) {
            const q = pendingQuestionRef.current
            pendingQuestionRef.current = null
            answerPendingRef.current(q)
          }
          break
        // Loading is silent: the model downloads in the background and data questions work meanwhile.
        case 'error':
          if (!e.duringLoad) notify.error(t.generationFailed, { description: e.message })
          break
        case 'retrieving':
          announce(t.searchingData)
          break
        case 'start':
          announce(t.responding)
          break
        case 'done':
          announce(e.stopped || !e.text ? t.responseStopped : t.responseDone.replace('{text}', e.text))
          onReplyDone()
          break
      }
    },
    { autoLoad: !askBeforeDownload },
  )

  // If the model fails to load (e.g. a dropped connection), retry quietly: 5 s, 20 s, 60 s.
  const loadRetries = useRef(0)
  useEffect(() => {
    if (llm.status !== 'error' || loadRetries.current >= 3) return
    const delay = [5_000, 20_000, 60_000][loadRetries.current++]
    const timer = window.setTimeout(llm.load, delay)
    return () => window.clearTimeout(timer)
  }, [llm.status, llm.load])

  const ready = llm.status === 'ready'

  const acceptDownload = () => {
    saveDownloadConsent()
    setDownloadNotice(false)
    llm.load()
    if (pendingQuestionRef.current) {
      llm.append({ role: 'assistant', content: t.dlPreparing })
      announce(t.dlPreparing)
    }
  }

  /** A written answer to `question` once the model is there: download it (with consent) first. */
  const requestDownload = (question: string) => {
    pendingQuestionRef.current = question
    if (llm.status === 'loading') {
      llm.append({ role: 'assistant', content: t.dlPreparing })
      announce(t.dlPreparing)
    } else setDownloadNotice(true)
  }

  return {
    llm,
    ready,
    downloadNotice,
    acceptDownload,
    declineDownload: () => setDownloadNotice(false),
    showDownloadNotice: () => setDownloadNotice(true),
    requestDownload,
    /** How the pending question is answered when the model becomes ready (set by the chat flow). */
    setAnswerPending: (answer: (question: string) => void) => {
      answerPendingRef.current = answer
    },
  }
}

export type Assistant = ReturnType<typeof useAssistant>
