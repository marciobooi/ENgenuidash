import {
  ArrowUp,
  ArrowUpRight,
  CircleAlert,
  Database,
  ExternalLink,
  LayoutDashboard,
  MessagesSquare,
  PlugZap,
  Plus,
  ShieldAlert,
  Square,
  X,
  Zap,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import ComponentsGallery from './ComponentsGallery'
import { Header } from './Header'
import { StarsMark } from './Icons'
import { notify, Toaster } from './components/toast'
import { Tooltip } from './components/tooltip'
import {
  EurostatUnavailableError,
  loadEnergyCodelists,
  loadEnergyDictionary,
  type EnergyCodelists,
  type EnergyDictionary,
} from './data/eurostat'
import { dashboardActions, scoreActions, isExplainRequest, rankByOverlap, type DashboardAction } from './genui/actions'
import { Dashboard } from './genui/Dashboard'
import { buildDashboard, NoDataError, type DashStrings } from './genui/execute'
import { planQuestion, refinePlan } from './genui/planner'
import type { DashboardSpec, Plan, Suggestion } from './genui/types'
import { CHOICE_MIN_PROB, GENERATION, SYSTEM_PROMPT } from './llm/config'
import { createScopeChecker } from './llm/energyScope'
import { directDefinition, loadGlossary } from './llm/glossary'
import { bestSentences, CONFIDENT_SCORE, datasetDescription, knowledgeDocFreq, loadKnowledge, MODEL_MIN_SCORE, searchKnowledge } from './llm/knowledge'
import { buildVocabulary } from './llm/vocabulary'
import { groundQuestion } from './llm/grounding'
import { useLocalLLM, type UIMessage } from './llm/useLocalLLM'
import { APP_ABBR, STRINGS, type Lang, type Strings } from './i18n'
import './App.css'

// Development-only evaluation page (#/eval); the import is dropped from production builds.
const EvalPage = import.meta.env.DEV ? lazy(() => import('./eval/EvalPage')) : null

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')

function dashStrings(t: Strings): DashStrings {
  return {
    latest: t.dLatest,
    highest: t.dHighest,
    lowest: t.dLowest,
    total: t.dTotal,
    vs: t.dVs,
    dataTable: t.dDataTable,
    summaryLatest: t.dSummaryLatest,
    summaryChange: t.dSummaryChange,
    summaryRange: t.dSummaryRange,
    summaryCompare: t.dSummaryCompare,
    summaryMix: t.dSummaryMix,
    noData: t.dNoData,
    noteNoMonthly: t.dNoteNoMonthly,
    noteAssumedHouseholds: t.dNoteAssumedHouseholds,
    noteAssumedEu: t.dNoteAssumedEu,
    sugAllCountries: t.dSugAllCountries,
    sugWithEu: t.dSugWithEu,
    sugHistory: t.dSugHistory,
    sugMonthly: t.dSugMonthly,
    sugMix: t.dSugMix,
    sugExplain: t.dSugExplain,
    sugUnit: t.dSugUnit,
    noteCached: t.dNoteCached,
    evolution: t.dEvolution,
    rankingIn: t.dRankingIn,
    changeVs: t.dChangeVs,
    changeSince: t.dChangeSince,
    shareOfTotal: t.dShareOfTotal,
    yearOnYear: t.dYearOnYear,
    average: t.dAverage,
    selectionAverage: t.dSelectionAverage,
    sharesOverTime: t.dSharesOverTime,
    mixRanking: t.dMixRanking,
    heatmapTitle: t.dHeatmapTitle,
    yearsShort: t.dYearsShort,
    allYears: t.dAllYears,
    noteTop: t.dNoteTop,
    noteBottom: t.dNoteBottom,
    insights: t.dInsights,
  }
}

export default function App() {
  const [input, setInput] = useState('')
  const [lang, setLang] = useState<Lang>('en')
  const [route, setRoute] = useState(() => window.location.hash)
  const t = STRINGS[lang]
  const [announcement, setAnnouncement] = useState('')
  const [dict, setDict] = useState<EnergyDictionary | null>(null)
  const [codelists, setCodelists] = useState<EnergyCodelists | null>(null)
  const scope = useMemo(() => createScopeChecker(dict, codelists), [dict, codelists])
  // Words ENgenuidash understands (energy vocabulary, places, question words): see vocabulary.ts.
  const vocabulary = useMemo(() => buildVocabulary(dict, codelists, scope.places), [dict, codelists, scope])

  // Generated dashboards (JSON specs) and which one is on screen.
  const [dashboards, setDashboards] = useState<DashboardSpec[]>([])
  const [active, setActive] = useState(0)
  const [building, setBuilding] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [unread, setUnread] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)
  const dashTitleRef = useRef<HTMLDivElement>(null)
  const chatOpenRef = useRef(chatOpen)

  // Screen-reader announcements. The thread itself is not a live region,
  // so streamed tokens aren't read out one by one; the full reply is announced at the end.
  const llm = useLocalLLM((e) => {
    switch (e.type) {
      // Loading is silent: the model downloads in the background and data questions work meanwhile.
      case 'error':
        if (!e.duringLoad) notify.error(t.generationFailed, { description: e.message })
        break
      case 'retrieving':
        setAnnouncement(t.searchingData)
        break
      case 'start':
        setAnnouncement(t.responding)
        break
      case 'done':
        setAnnouncement(e.stopped || !e.text ? t.responseStopped : t.responseDone.replace('{text}', e.text))
        if (!chatOpenRef.current) setUnread(true)
        break
    }
  })
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    chatOpenRef.current = chatOpen
  }, [chatOpen])

  // If the model fails to load (e.g. a dropped connection), retry quietly: 5 s, 20 s, 60 s.
  const loadRetries = useRef(0)
  useEffect(() => {
    if (llm.status !== 'error' || loadRetries.current >= 3) return
    const delay = [5_000, 20_000, 60_000][loadRetries.current++]
    const timer = window.setTimeout(llm.load, delay)
    return () => window.clearTimeout(timer)
  }, [llm.status, llm.load])

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = `${APP_ABBR} – ${t.title}`
  }, [lang, t])

  // Eurostat energy dictionary: powers the topic guard, the planner and the data lookup.
  useEffect(() => {
    loadEnergyDictionary().then(setDict).catch(() => setDict(null))
    loadEnergyCodelists().then(setCodelists).catch(() => setCodelists(null))
    void loadGlossary()
    // The knowledge base (~170 kB gzipped) loads in the background: it also feeds the vocabulary check.
    const idle = (window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500))) as (cb: () => void) => void
    idle(() => void loadKnowledge().catch(() => undefined))
  }, [])

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [llm.messages, chatOpen])

  // The chat modal is a native <dialog>: focus trap, Escape and inert background for free.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (chatOpen && !dialog.open) {
      dialog.showModal()
      inputRef.current?.focus()
    } else if (!chatOpen && dialog.open) {
      dialog.close()
    }
  }, [chatOpen])


  const ready = llm.status === 'ready'
  const busy = llm.generating || building
  const current = dashboards[active] as DashboardSpec | undefined
  const hasDashboard = dashboards.length > 0
  const inConversation = llm.messages.length > 0

  const openChat = () => {
    setUnread(false)
    setChatOpen(true)
  }
  const closeChat = () => {
    setChatOpen(false)
    fabRef.current?.focus()
  }

  // ---------- dashboards ----------

  async function runPlan(plan: Plan, question: string) {
    if (!dict) return
    setBuilding(true)
    llm.append({ role: 'user', content: question }, { role: 'assistant', content: t.buildingDashboard, pending: true })
    setAnnouncement(t.buildingDashboard)
    try {
      const spec = await buildDashboard(plan, dict, lang, dashStrings(t))
      const index = dashboards.length
      const message = fill(hasDashboard ? t.dashboardUpdated : t.dashboardReady, { title: spec.title })
      setDashboards((d) => [...d, spec])
      setActive(index)
      llm.updateLast((m) => !!m.pending, { content: message, pending: false, card: { index, title: spec.title } })
      setAnnouncement(`${message} ${spec.summary.join(' ')}`)
      // Show the result: close the chat and move focus to the dashboard heading.
      setChatOpen(false)
      requestAnimationFrame(() => dashTitleRef.current?.querySelector<HTMLElement>('h2')?.focus())
    } catch (err) {
      const message =
        err instanceof NoDataError ? err.message : err instanceof EurostatUnavailableError ? t.eurostatDown : t.dashboardError
      llm.updateLast((m) => !!m.pending, { content: message, pending: false, kind: 'error' })
      setAnnouncement(message)
      if (err instanceof EurostatUnavailableError) notify.warning(t.eurostatDownTitle, { description: t.eurostatDown })
      else if (!(err instanceof NoDataError)) notify.error(t.dashboardError, { description: (err as Error).message })
    } finally {
      setBuilding(false)
    }
  }

  function askModel(text: string, verdict: string, previous: string[], conceptual = false) {
    if (!ready) {
      llm.reply(text, t.modelNotReady, 'refusal')
      setAnnouncement(t.modelNotReady)
      return
    }
    llm.ask(text, {
      systemPrompt: SYSTEM_PROMPT,
      options: GENERATION,
      prepare:
        verdict === 'small-talk'
          ? undefined
          : async (signal) => {
              // Follow-ups ("and in Germany?") reuse the previous question to find the dataset.
              const query = verdict === 'follow-up' ? `${previous.at(-1)} ${text}` : text
              const g = await groundQuestion(query, dict, codelists, lang, signal, { includeData: !conceptual })
              return {
                prompt: g.context ? `${text}\n\n${g.context}` : text,
                sources: g.sources,
              }
            },
    })
  }

  const send = (raw: string) => {
    const text = raw.trim()
    if (!text || busy) return
    setInput('')

    // "Explain these figures" (typed or clicked) explains the dashboard on screen.
    if (current && isExplainRequest(text)) return void explainDashboard(text)

    const previous = llm.messages.filter((m) => m.role === 'user').map((m) => m.content)
    const verdict = scope.classify(text, previous)
    let conceptual = false

    // Content words ENgenuidash does not know ("date" in "what is the date of oil?").
    const unknown = vocabulary.unknownWords(text, knowledgeDocFreq())

    // Off-topic questions never reach the model or the planner. A dashboard change such as
    // "show as bar chart" has no energy word but is fine when every word is understood.
    const refinesDashboard =
      !!current && !!dict && !!codelists && unknown.length === 0 && !!refinePlan(current.plan, text, dict, codelists)
    if (verdict === 'off-topic' && !refinesDashboard) {
      // With a dashboard on screen, a message made of known words is most likely a change we
      // could not apply ("show the trend") rather than an off-topic question: say how to phrase it.
      if (current && unknown.length === 0 && resolveWithActions(text)) return
      const message = current && unknown.length === 0 ? t.notApplied : t.offTopic
      llm.reply(text, message, 'refusal')
      setAnnouncement(message)
      if (hasDashboard) openChat()
      return
    }

    // Energy words, but asking about something unknown ("colour of natural gas") → rephrase.
    if (unknown.length && verdict !== 'small-talk') {
      const message = `${fill(t.notUnderstoodWord, { word: unknown.slice(0, 2).join('”, “') })} ${t.notUnderstood}`
      llm.append({ role: 'user', content: text }, { role: 'assistant', content: message, choices: ideas.map((i) => ({ label: i.text, query: i.text })) })
      setAnnouncement(message)
      if (hasDashboard) openChat()
      return
    }

    if (dict && codelists && verdict !== 'small-talk') {
      // 1. A change to the dashboard on screen ("add Germany", "since 2010", "as bar chart")?
      const refined = current ? refinePlan(current.plan, text, dict, codelists) : null
      if (refined) return void runPlan(refined, text)

      // 2. A new data question → new dashboard, or a clarifying question.
      const result = planQuestion(text, dict, codelists)
      conceptual = result.kind === 'explain'
      if (result.kind === 'plan') return void runPlan(result.plan, text)
      // A follow-up the rules cannot map ("show the trend", "which ones are highest?") → the action menu.
      if (current && verdict === 'follow-up' && result.kind === 'none' && resolveWithActions(text)) return
      if (result.kind === 'clarify') {
        llm.append(
          { role: 'user', content: text },
          {
            role: 'assistant',
            content: t.whichPrices,
            choices: [
              { label: t.priceElecHh, query: t.qElecHh },
              { label: t.priceElecInd, query: t.qElecInd },
              { label: t.priceGasHh, query: t.qGasHh },
              { label: t.priceGasInd, query: t.qGasInd },
            ],
          },
        )
        setAnnouncement(t.whichPrices)
        if (hasDashboard) openChat()
        return
      }
    }

    // 3. "What is X?" for a known concept → the verified glossary definition, word for word.
    const definition = verdict !== 'small-talk' ? directDefinition(text) : null
    if (definition) {
      llm.reply(text, definition.summary, undefined, definition.url ? [{ code: definition.official ? 'Glossary' : 'Reference', title: definition.term, url: definition.url }] : undefined)
      setAnnouncement(definition.summary)
      if (hasDashboard) openChat()
      return
    }

    // 4. Small talk → the language model (the system prompt keeps it on energy).
    if (verdict === 'small-talk') {
      askModel(text, verdict, previous, conceptual)
      if (hasDashboard) openChat()
      return
    }

    // 5. Our Eurostat documents answer it well → quote them (extractive answer).
    // 6. They support it (every key word found) → the model, with the passages as background.
    // 7. Otherwise ("what is the date of oil") → ask the user to rephrase; never a free-form guess.
    const query = verdict === 'follow-up' ? `${previous.at(-1)} ${text}` : text
    void answerFromDocuments(text, query).then((outcome) => {
      if (outcome === 'model') askModel(text, verdict, previous, conceptual)
      else if (outcome === 'unclear') {
        llm.append(
          { role: 'user', content: text },
          { role: 'assistant', content: t.notUnderstood, choices: ideas.map((i) => ({ label: i.text, query: i.text })) },
        )
        setAnnouncement(t.notUnderstood)
      }
    })
    if (hasDashboard) openChat()
  }

  /**
   * Decides how a conceptual question is answered, based on how well our Eurostat documents
   * cover it: 'quoted' (answered here), 'model' (well supported) or 'unclear' (not supported).
   */
  async function answerFromDocuments(text: string, query: string): Promise<'quoted' | 'model' | 'unclear'> {
    const hits = await searchKnowledge(query, { limit: 2 }).catch(() => [])
    const best = hits[0]
    if (!best || best.score < MODEL_MIN_SCORE) return 'unclear'
    if (best.score < CONFIDENT_SCORE) return 'model'
    const quote = bestSentences(best, query)
    if (!quote) return 'model'
    const sources = hits
      .filter((h) => h.url && (h === best || h.score >= CONFIDENT_SCORE / 2))
      .map((h) => ({ code: 'Eurostat', title: h.section ? `${h.title} › ${h.section}` : h.title, url: h.url! }))
    llm.reply(text, quote, 'quote', sources)
    setAnnouncement(`${t.fromEurostat}: ${quote}`)
    return 'quoted'
  }

  const onSuggestion = (s: Suggestion) => {
    if (busy || !current) return
    if (s.plan) return void runPlan(s.plan, s.label)
    if (s.explain) void explainDashboard(s.label)
  }

  const runAction = (a: { plan?: Plan; explain?: boolean }, question: string) =>
    a.explain ? void explainDashboard(question) : a.plan ? void runPlan(a.plan, question) : undefined

  /**
   * A dashboard change the rules could not map. The options come from dashboardActions (each a
   * plan built by the rules); the model only picks an option number. A confident pick is run;
   * otherwise, or while the model is loading, the best options are offered as buttons.
   * Returns false when there is nothing to offer.
   */
  function resolveWithActions(text: string): boolean {
    if (!current || !dict || !codelists) return false
    const actions = dashboardActions(current, text, dict, codelists, t.actions, STRINGS.en.actions, lang)
    if (!actions.length) return false

    const offer = (ranked: DashboardAction[]) => {
      llm.append(
        { role: 'user', content: text },
        {
          role: 'assistant',
          content: t.didYouMean,
          choices: ranked.slice(0, 4).map((a) => ({ label: a.label, query: a.label, plan: a.plan, explain: a.explain })),
        },
      )
      setAnnouncement(t.didYouMean)
      openChat()
    }
    if (!ready) {
      offer(rankByOverlap(actions, text))
      return true
    }

    setBuilding(true)
    setAnnouncement(t.choosing)
    void scoreActions(llm.choose, current, text, actions, STRINGS.en.actions)
      .then(({ probs }) => {
        setBuilding(false)
        const best = probs.indexOf(Math.max(...probs))
        if (best < actions.length && probs[best] >= CHOICE_MIN_PROB) return runAction(actions[best], text)
        // Not confident (or "none of these"): offer the options as buttons, in word-overlap order,
        // which ranks better than the model's low-confidence scores (see #/eval).
        offer(rankByOverlap(actions, text))
      })
      .catch(() => {
        setBuilding(false)
        offer(rankByOverlap(actions, text))
      })
    return true
  }

  /**
   * Explains the dashboard on screen from facts only: Eurostat's own description of the indicator,
   * then the computed summary and key insights. No free-form model text, so nothing is invented.
   */
  async function explainDashboard(question: string) {
    const spec = current
    if (!spec) return
    openChat()
    const described = await datasetDescription(spec.plan.dataset).catch(() => null)
    const insights = spec.insights.map((i) => `• ${i.parts.map((p) => (typeof p === 'string' ? p : p.strong)).join('')}`)
    // The insights already restate the summary's facts; the summary is used only when there are none.
    const answer = [described?.text, insights.length ? insights.join('\n') : spec.summary.join(' ')].filter(Boolean).join('\n\n')
    const sources = [
      spec.source,
      ...(described?.url ? [{ code: spec.plan.dataset, title: `${described.title} › ${described.section}`, url: described.url }] : []),
    ]
    llm.reply(question, answer || t.dNoData, undefined, sources)
    setAnnouncement(answer)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    send(input)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const newChat = () => {
    if (busy || !inConversation) return
    llm.clear()
    setDashboards([])
    setActive(0)
    setChatOpen(false)
    setInput('')
    notify.info(t.chatCleared)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const ideas = [
    { icon: <PlugZap size={18} strokeWidth={1.75} aria-hidden="true" />, text: t.ideaSolar },
    { icon: <Zap size={18} strokeWidth={1.75} aria-hidden="true" />, text: t.ideaWind },
    { icon: <Database size={18} strokeWidth={1.75} aria-hidden="true" />, text: t.ideaSave },
  ]

  const canSend = !!input.trim() && !busy && (!!dict || ready)
  const composer = (
    <form className="composer" onSubmit={submit}>
      <label className="sr-only" htmlFor="chat-input">
        {t.message}
      </label>
      <textarea
        id="chat-input"
        ref={inputRef}
        className="composer__input"
        rows={inConversation ? 1 : 2}
        value={input}
        placeholder={t.placeholder}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        aria-describedby="chat-input-hint"
        autoFocus
      />
      <span id="chat-input-hint" className="sr-only">
        {t.enterHint}
      </span>
      <div className="composer__bar">
        <Tooltip content={t.newChat}>
          <button
            type="button"
            className="icon-btn"
            onClick={newChat}
            // aria-disabled keeps the button focusable so its tooltip stays reachable.
            aria-disabled={busy || !inConversation}
          >
            <Plus size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </Tooltip>
        {llm.generating ? (
          <Tooltip content={t.stop}>
            <button type="button" className="send-btn" onClick={llm.stop}>
              <Square size={12} fill="currentColor" aria-hidden="true" />
            </button>
          </Tooltip>
        ) : (
          <Tooltip content={t.send}>
            <button type="submit" className="send-btn" aria-disabled={!canSend}>
              <ArrowUp size={18} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>
    </form>
  )

  const renderMessage = (m: UIMessage, i: number): ReactNode => (
    <div key={i} className={`msg msg--${m.role}${m.kind ? ` msg--${m.kind}` : ''}${m.pending ? ' msg--status' : ''}`}>
      <span className="sr-only">{m.role === 'user' ? t.you : t.assistant}: </span>
      {m.kind === 'refusal' && <ShieldAlert className="msg__icon" size={16} aria-hidden="true" />}
      {m.kind === 'error' && <CircleAlert className="msg__icon msg__icon--error" size={16} aria-hidden="true" />}
      {m.kind === 'quote' && <span className="msg__quote-label">{t.fromEurostat}</span>}
      {m.pending && <Database size={15} aria-hidden="true" />}
      {m.content ||
        (llm.generating && i === llm.messages.length - 1 ? (
          <span className="msg__typing" aria-label={t.responding} role="img" />
        ) : (
          ''
        ))}
      {m.card && (
        <button
          type="button"
          className={`dash-card${m.card.index === active && hasDashboard ? ' dash-card--active' : ''}`}
          aria-current={m.card.index === active ? 'true' : undefined}
          onClick={() => {
            setActive(m.card!.index)
            closeChat()
          }}
        >
          <LayoutDashboard size={16} aria-hidden="true" />
          <span className="dash-card__title">{m.card.title}</span>
          <span className="dash-card__action">{t.showDashboard}</span>
        </button>
      )}
      {m.choices && (
        <ul className="msg__choices">
          {m.choices.map((c) => (
            <li key={c.label}>
              <button
                type="button"
                className="suggestion-chip"
                disabled={busy}
                onClick={() => (c.plan || c.explain ? runAction(c, c.label) : send(c.query))}
              >
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {m.sources && m.sources.length > 0 && (
        <div className="msg__sources">
          <span className="msg__sources-label">{t.sources}</span>
          <ul>
            {m.sources.map((src, i) => (
              <li key={`${src.url}-${i}`}>
                <a href={src.url} target="_blank" rel="noreferrer" className="source-chip">
                  <Database size={13} aria-hidden="true" />
                  <span className="source-chip__title">{src.title}</span>
                  <span className="source-chip__code">{src.code}</span>
                  <ExternalLink size={12} aria-hidden="true" />
                  <span className="sr-only"> ({t.opensNewTab})</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )

  const thread = (
    <div className="thread" role="log" aria-label={t.conversation} aria-busy={busy}>
      {llm.messages.map(renderMessage)}
      {llm.phase === 'retrieving' && (
        <div className="msg msg--assistant msg--status">
          <Database size={15} aria-hidden="true" />
          {t.searchingData}
        </div>
      )}
      <div ref={endRef} />
    </div>
  )

  const chartLabels = {
    showTable: t.showTable,
    hideTable: t.hideTable,
    downloadPng: t.downloadPng,
    downloadCsv: t.downloadCsv,
    loading: t.chartLoading,
    loadError: t.chartLoadError,
    retry: t.retry,
    skipChart: t.skipChart,
    chartEnd: t.chartEnd,
  }

  let page: ReactNode
  if (route === '#/components') {
    page = <ComponentsGallery locale={lang} t={t} />
  } else if (EvalPage && route === '#/eval') {
    page = (
      <Suspense>
        <EvalPage dict={dict} codelists={codelists} choose={llm.choose} ready={ready} model={llm.runtime?.model} />
      </Suspense>
    )
  } else if (current) {
    page = (
      <main className="dash-page" id="main" tabIndex={-1}>
        <div ref={dashTitleRef}>
          <Dashboard
            key={active}
            spec={current}
            lang={lang}
            busy={busy}
            labels={{
              keyIndicators: t.keyIndicators,
              dataTable: t.dataTableShow,
              period: t.ctlPeriod,
              year: t.ctlYear,
              unit: t.ctlUnit,
              overTime: t.ctlOverTime,
              keyInsights: t.keyInsights,
              suggestions: t.suggestedNext,
              source: t.source,
              opensNewTab: t.opensNewTab,
              missing: t.notAvailable,
            }}
            chartLabels={chartLabels}
            onSuggestion={onSuggestion}
          />
        </div>
      </main>
    )
  } else if (inConversation) {
    page = (
      <main className="conversation" id="main" tabIndex={-1}>
        <h2 className="sr-only">{t.conversation}</h2>
        {thread}
        <div className="dock">
          {composer}
        </div>
      </main>
    )
  } else {
    page = (
      <main className="welcome" id="main" tabIndex={-1}>
        <div className="welcome__head">
          <h2 className="welcome__title">
            <StarsMark size={36} />
            {t.welcome}
          </h2>
          <p className="welcome__sub">{t.welcomeSub}</p>
        </div>
        {composer}
        <section className="ideas" aria-labelledby="ideas-title">
          <h3 className="ideas__title" id="ideas-title">
            {t.ideas}
          </h3>
          <ul>
            {ideas.map((idea) => (
              <li key={idea.text}>
                <button type="button" className="idea" disabled={busy || !dict} onClick={() => send(idea.text)}>
                  <span className="idea__icon">{idea.icon}</span>
                  <span className="idea__text">{idea.text}</span>
                  <ArrowUpRight className="idea__go" size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>
    )
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        {t.skipToContent}
      </a>
      <Header
        lang={lang}
        t={t}
        onLangChange={(l) => {
          setLang(l)
          setAnnouncement(STRINGS[l].languageChanged)
        }}
      />
      <Toaster
        labels={{
          region: t.notifications,
          hotkeyHint: t.notificationsHotkey,
          close: t.closeNotification,
        }}
      />
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {page}

      {/* Once a dashboard is on screen, the chat lives behind a floating button and opens as a modal. */}
      {current && route !== '#/components' && (
        <>
          <Tooltip content={t.openChat} placement="top">
            <button
              ref={fabRef}
              type="button"
              className={`chat-fab${unread ? ' chat-fab--unread' : ''}`}
              aria-haspopup="dialog"
              aria-expanded={chatOpen}
              onClick={openChat}
            >
              <MessagesSquare size={22} aria-hidden="true" />
              {(busy || unread) && <span className="chat-fab__dot" aria-hidden="true" />}
            </button>
          </Tooltip>
          <dialog ref={dialogRef} className="chat-modal" aria-labelledby="chat-modal-title" onClose={() => setChatOpen(false)}>
            <div className="chat-modal__head">
              <h2 id="chat-modal-title" className="chat-modal__title">
                <MessagesSquare size={18} aria-hidden="true" />
                {t.chatTitle}
              </h2>
              <Tooltip content={t.closeChat} placement="bottom">
                <button type="button" className="icon-btn" onClick={closeChat}>
                  <X size={18} aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
            {thread}
            <div className="chat-modal__dock">
                  {composer}
            </div>
          </dialog>
        </>
      )}
    </div>
  )
}
