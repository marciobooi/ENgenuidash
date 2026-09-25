import {
  Activity,
  Building2,
  Car,
  ChartPie,
  Cloud,
  Database,
  Factory,
  Flame,
  FlaskConical,
  Fuel,
  Gauge,
  House,
  Layers,
  Leaf,
  Link2,
  Ship,
  Snowflake,
  Thermometer,
  TrainFront,
  TrendingUp,
  Warehouse,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import ComponentsGallery from './ComponentsGallery'
import { Header } from './Header'
import { ChatModal } from './app/ChatModal'
import { ChatThread } from './app/ChatThread'
import { Composer } from './app/Composer'
import { clearShareLink, decodePlan, readShareLink, shareUrl } from './app/shareLink'
import { useAssistant } from './app/useAssistant'
import { useChatFlow } from './app/useChatFlow'
import { useDashboards } from './app/useDashboards'
import { useEnergyData } from './app/useEnergyData'
import { WelcomePage, type Idea } from './app/WelcomePage'
import { pickPresets, presetPlan, PRESETS, type PresetId } from './genui/presets'
import { DownloadNotice } from './components/download-notice'
import { notify, Toaster } from './components/toast'
import { Dashboard } from './genui/Dashboard'
import { APP_ABBR, STRINGS, type Lang } from './i18n'
import './App.css'

const PRESET_ICONS: Record<PresetId, LucideIcon> = {
  efficiency: Gauge,
  renewables: Leaf,
  ghg: Cloud,
  intensity: Activity,
  productivity: TrendingUp,
  imports: Ship,
  fossil: Fuel,
  householdsPerCapita: House,
  byProduct: Layers,
  bySector: ChartPie,
  householdUses: Thermometer,
  transport: TrainFront,
  road: Car,
  services: Building2,
  industry: Factory,
  nonEnergy: FlaskConical,
  production: Zap,
  combustible: Flame,
  supply: Warehouse,
  gae: Database,
  energyPoverty: Snowflake,
}

// Development-only evaluation page (#/eval); the import is dropped from production builds.
const EvalPage = import.meta.env.DEV ? lazy(() => import('./eval/EvalPage')) : null

/**
 * The page: the header, then the welcome screen, the conversation or the dashboard on screen
 * (with the chat behind a floating button). The work is done by hooks in src/app:
 *   useEnergyData  – dictionary, codelists, glossary, knowledge base, topic guard, vocabulary
 *   useAssistant   – the optional language model (consent, loading, the chat thread it keeps)
 *   useDashboards  – the dashboards of the conversation, building them, filters, going back
 *   useChatFlow    – what happens to a message (route → dashboard, definition, quote, answer…)
 */
export default function App() {
  const [input, setInput] = useState('')
  const [lang, setLang] = useState<Lang>('en')
  const [route, setRoute] = useState(() => window.location.hash)
  const t = STRINGS[lang]
  const [announcement, setAnnouncement] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [unread, setUnread] = useState(false)
  const chatOpenRef = useRef(chatOpen)
  const fabRef = useRef<HTMLButtonElement>(null)
  const dashTitleRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const data = useEnergyData()
  const assistant = useAssistant({
    t,
    announce: setAnnouncement,
    onReplyDone: () => {
      if (!chatOpenRef.current) setUnread(true)
    },
  })
  const { llm, ready } = assistant
  const dash = useDashboards({
    dict: data.dict,
    codelists: data.codelists,
    lang,
    t,
    assistant,
    announce: setAnnouncement,
    // Show the result: close the chat and move focus to the dashboard heading.
    onShown: () => {
      setChatOpen(false)
      requestAnimationFrame(() => dashTitleRef.current?.querySelector<HTMLElement>('h2')?.focus())
    },
  })

  // Four starter topics, picked at random at each start (genui/presets.ts).
  const [ideaIds] = useState(() => pickPresets(4))
  const ideas: Idea[] = ideaIds.map((id) => {
    const Icon = PRESET_ICONS[id]
    return { icon: <Icon size={18} strokeWidth={1.75} aria-hidden="true" />, text: t.starterQuestions[id], plan: PRESETS[id] }
  })
  const openChat = () => {
    setUnread(false)
    setChatOpen(true)
  }
  const chat = useChatFlow({ t, lang, data, assistant, dash, announce: setAnnouncement, openChat, ideas })

  const busy = llm.generating || dash.building
  const inConversation = llm.messages.length > 0
  const { current } = dash

  useEffect(() => {
    chatOpenRef.current = chatOpen
  }, [chatOpen])

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = `${APP_ABBR} – ${t.title}`
  }, [lang, t])

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [llm.messages, chatOpen])

  // The dashboard on screen is in the URL, so it can be shared or bookmarked.
  useEffect(() => {
    if (current?.question) window.history.replaceState(null, '', shareUrl(current.question, current.plan))
  }, [current])

  // Opened from a shared link: rebuild its dashboard (a plan that does not check out against the
  // dictionary falls back to asking the question), once the dictionary is loaded.
  const openedLink = useRef(false)
  useEffect(() => {
    if (openedLink.current || !data.dict || !data.codelists) return
    openedLink.current = true
    const link = readShareLink()
    const plan = link.plan ? decodePlan(link.plan, data.dict) : null
    if (plan) void dash.runPlan(plan, link.question ?? data.dict.datasets[plan.dataset]?.code ?? '')
    else if (link.question) chat.send(link.question)
  })

  // A starter question: the same plan as typing it (its focus included), else its preset.
  const openIdea = (idea: Idea) => {
    if (busy) return
    const plan = (data.dict && data.codelists && presetPlan(idea.text, data.dict, data.codelists)) || idea.plan
    void dash.runPlan(plan, idea.text)
  }

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(
      () => notify.success(t.linkCopied),
      () => notify.info(window.location.href),
    )
  }

  const send = (raw: string) => {
    const text = raw.trim()
    if (!text || busy) return
    setInput('')
    chat.send(text)
  }

  const newChat = () => {
    if (busy || !inConversation) return
    llm.clear()
    dash.clear()
    clearShareLink()
    setChatOpen(false)
    setInput('')
    notify.info(t.chatCleared)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const composer = (
    <Composer
      t={t}
      value={input}
      onChange={setInput}
      onSend={() => send(input)}
      onStop={llm.stop}
      onNewChat={newChat}
      canSend={!!input.trim() && !busy && (!!data.dict || ready)}
      canClear={!busy && inConversation}
      generating={llm.generating}
      compact={inConversation}
      inputRef={inputRef}
    />
  )

  const thread = (
    <ChatThread
      t={t}
      messages={llm.messages}
      generating={llm.generating}
      retrieving={llm.phase === 'retrieving'}
      busy={busy}
      activeDashboard={dash.active}
      hasDashboard={dash.hasDashboard}
      onShowDashboard={(index) => {
        dash.setActive(index)
        setChatOpen(false)
        // After the dialog has closed: while it is modal, the rest of the page is inert.
        requestAnimationFrame(() => fabRef.current?.focus())
      }}
      onChoice={(c) =>
        c.explainAi
          ? chat.requestAiExplanation(t.explainWithAi)
          : c.fuller
            ? chat.requestFullerAnswer(c.query)
            : c.plan || c.explain
              ? chat.runAction(c, c.label)
              : send(c.query)
      }
      endRef={endRef}
    />
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
        <EvalPage dict={data.dict} codelists={data.codelists} choose={llm.choose} complete={llm.complete} ready={ready} model={llm.runtime?.model} />
      </Suspense>
    )
  } else if (current) {
    page = (
      <main className="dash-page" id="main" tabIndex={-1}>
        <div ref={dashTitleRef}>
          <Dashboard
            key={dash.active}
            spec={current}
            lang={lang}
            busy={busy}
            labels={{
              answer: t.dAnswer.title,
              moreFilters: t.moreFilters,
              fewerFilters: t.fewerFilters,
              keyIndicators: t.keyIndicators,
              dataTable: t.dataTableShow,
              period: t.ctlPeriod,
              show: t.ctlShow,
              periodTo: t.ctlPeriodTo,
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
            onSuggestion={chat.onSuggestion}
            filters={dash.filters}
            onFilter={dash.onFilter}
            multiSelectLabels={t.multiSelect}
            actions={
              <button type="button" className="dash__share" onClick={copyLink}>
                <Link2 size={16} aria-hidden="true" />
                {t.shareLink}
              </button>
            }
          />
        </div>
      </main>
    )
  } else if (inConversation) {
    page = (
      <main className="conversation" id="main" tabIndex={-1}>
        <h2 className="sr-only">{t.conversation}</h2>
        {thread}
        <div className="dock">{composer}</div>
      </main>
    )
  } else {
    page = <WelcomePage t={t} composer={composer} ideas={ideas} disabled={busy || !data.dict} onIdea={openIdea} />
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
      {assistant.downloadNotice && (
        <DownloadNotice
          labels={{ title: t.dlTitle, body: t.dlBody, wifi: t.dlWifi, accept: t.dlAccept, later: t.dlLater }}
          onAccept={assistant.acceptDownload}
          onLater={assistant.declineDownload}
        />
      )}
      <Toaster labels={{ region: t.notifications, hotkeyHint: t.notificationsHotkey, close: t.closeNotification }} />
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {page}

      {current && route !== '#/components' && (
        <ChatModal
          t={t}
          open={chatOpen}
          unread={unread}
          busy={busy}
          onOpen={openChat}
          onClose={() => setChatOpen(false)}
          fabRef={fabRef}
          onOpened={() => inputRef.current?.focus()}
        >
          {thread}
          <div className="chat-modal__dock">{composer}</div>
        </ChatModal>
      )}
    </div>
  )
}
