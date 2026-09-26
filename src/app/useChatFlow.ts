import { useEffect, useRef } from 'react'
import type { EnergyCodelists, EnergyDictionary } from '../data/eurostat'
import { recordMiss } from '../eval/missLog'
import { dashboardActions, rankByOverlap, type DashboardAction } from '../genui/actions'
import { prepareQuestion } from '../genui/prepare'
import { routeMessage } from '../genui/route'
import type { Plan, Suggestion } from '../genui/types'
import { STRINGS, type Lang, type Strings } from '../i18n'
import { documentAnswer, smallTalkReply } from '../llm/answers'
import { EXPLAIN_GENERATION, GENERATION, SYSTEM_PROMPT } from '../llm/config'
import { searchQuery } from '../llm/crossLingual'
import type { createScopeChecker } from '../llm/energyScope'
import { definitionText, directDefinition } from '../llm/glossary'
import { datasetDescription, knowledgeDocFreq } from '../llm/knowledge'
import { dashboardContext, EXPLAIN_SYSTEM_PROMPT, explainPrompt, modelPrompt, relatesToDashboard } from '../llm/prompt'
import type { Vocabulary } from '../llm/vocabulary'
import type { Assistant } from './useAssistant'
import type { Dashboards } from './useDashboards'
import { fill } from './text'

/**
 * The chat flow: what happens to a message. routeMessage (src/genui/route.ts) decides the route;
 * this hook carries it out: a dashboard, a change of the one on screen, a glossary definition, a
 * quote from Eurostat's documents, a fixed small-talk reply, the action menu, an explanation of
 * the figures on screen, or, when the documents support it, a written answer from the model.
 */
export function useChatFlow({
  t,
  lang,
  data,
  assistant,
  dash,
  announce,
  openChat,
  ideas,
}: {
  t: Strings
  lang: Lang
  data: { dict: EnergyDictionary | null; codelists: EnergyCodelists | null; scope: ReturnType<typeof createScopeChecker>; vocabulary: Vocabulary }
  assistant: Assistant
  dash: Dashboards
  announce: (text: string) => void
  openChat: () => void
  /** Example questions offered as buttons after "not understood" and small talk. */
  ideas: { text: string; plan: Plan }[]
}) {
  const { llm, ready } = assistant
  const { dict, codelists, scope, vocabulary } = data
  const { current, hasDashboard } = dash
  // Offered after "not understood" and small talk; a click opens the topic's exact dashboard.
  const ideaChoices = ideas.map(({ text, plan }) => ({ label: text, query: text, plan }))

  function askModel(text: string, verdict: string, previous: string[], conceptual = false, fuller = false, withDashboard = false) {
    if (!ready && !fuller) {
      // Not downloaded yet ("Not now"): say so and offer the download again.
      const message = llm.status === 'idle' ? t.dlNeeded : t.modelNotReady
      llm.reply(text, message, 'refusal')
      announce(message)
      if (llm.status === 'idle') assistant.showDownloadNotice()
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
              const searchWith = verdict === 'follow-up' ? `${previous.at(-1)} ${text}` : text
              // A question about the dashboard on screen gets its figures (see relatesToDashboard).
              const dashboard = withDashboard && current ? await onScreenFacts() : undefined
              return modelPrompt(text, dict, codelists, lang, { conceptual, signal, searchWith, dashboard })
            },
    })
  }

  // When the model becomes ready, the question that asked for a fuller answer (or an AI
  // explanation of the dashboard) is answered.
  const pendingExplain = useRef(false)
  useEffect(() => {
    assistant.setAnswerPending((q: string) => {
      if (pendingExplain.current) {
        pendingExplain.current = false
        return void explainWithModel(q)
      }
      askModel(q, 'energy', [], false, true)
    })
  })

  /** "Write a fuller answer": the model answers now, or once it is downloaded. */
  function requestFullerAnswer(question: string) {
    pendingExplain.current = false
    if (ready) return void askModel(question, 'energy', [], false, true)
    assistant.requestDownload(question)
  }

  function send(typed: string) {
    const previous = llm.messages.filter((m) => m.role === 'user').map((m) => m.content)
    const unknownWords = (x: string) => vocabulary.unknownWords(x, knowledgeDocFreq())
    const correct = (w: string) => vocabulary.correct(w, knowledgeDocFreq())
    // The rules read the prepared question (lead-ins dropped, other languages as English
    // keywords, typing slips corrected); the chat and the model get what was typed.
    const text = prepareQuestion(typed, { unknownWords, correct })
    const verdict = scope.classify(text, previous)
    const route = routeMessage(text, {
      current: current?.plan ?? null,
      dict,
      codelists,
      classify: () => verdict,
      unknownWords,
      correct,
      previous,
    })

    switch (route.kind) {
      // "Explain these figures" (typed or clicked) explains the dashboard on screen.
      case 'explain':
        return void explainDashboard(typed)
      case 'back': {
        // The previous dashboard of this conversation (they are kept in order).
        const r = dash.back()
        const message = r.ok ? fill(t.backTo, { title: r.title ?? '' }) : t.noPrevious
        llm.reply(typed, message, r.ok ? undefined : 'refusal')
        announce(message)
        return
      }
      case 'off-topic': {
        // No energy word, but about the dashboard on screen ("why is Spain higher than France?"):
        // answered from its figures (or its facts, while the model is not there).
        if (current && relatesToDashboard(text, current, false)) {
          if (ready) {
            askModel(typed, 'follow-up', previous, false, false, true)
            openChat()
          } else void explainDashboard(typed)
          return
        }
        // With a dashboard on screen, a message made of known words is most likely a change we
        // could not apply ("show the trend") rather than an off-topic question: say how to phrase it.
        if (route.tryActions && resolveWithActions(typed)) return
        const message = route.tryActions ? t.notApplied : t.offTopic
        recordMiss({ text: typed, lang, kind: 'refused', followUp: hasDashboard })
        llm.reply(typed, message, 'refusal')
        announce(message)
        if (hasDashboard) openChat()
        return
      }
      case 'rephrase': {
        const message = `${fill(t.notUnderstoodWord, { word: route.unknown.slice(0, 2).join('”, “') })} ${t.notUnderstood}`
        recordMiss({ text: typed, lang, kind: 'rephrase', followUp: hasDashboard })
        llm.append({ role: 'user', content: typed }, { role: 'assistant', content: message, choices: ideaChoices })
        announce(message)
        if (hasDashboard) openChat()
        return
      }
      case 'refine':
      case 'plan':
        return void dash.runPlan(route.plan, typed)
      case 'actions':
        if (resolveWithActions(typed)) return
        break
      case 'clarify':
        llm.append(
          { role: 'user', content: typed },
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
        announce(t.whichPrices)
        if (hasDashboard) openChat()
        return
    }
    const conceptual = route.kind === 'answer' && route.conceptual

    // A question about the dashboard on screen ("why is Spain higher than France?"): the model
    // answers from its figures, rather than from a separate search that could show other numbers.
    if (ready && current && verdict !== 'small-talk' && relatesToDashboard(text, current, verdict === 'follow-up')) {
      askModel(typed, verdict, previous, conceptual, false, true)
      openChat()
      return
    }

    // "What is X?" for a known concept → the verified glossary definition, word for word.
    const definition = verdict !== 'small-talk' ? directDefinition(text) : null
    if (definition) {
      const answer = definitionText(definition)
      llm.reply(typed, answer, undefined, definition.url ? [{ code: definition.official ? 'Glossary' : 'Reference', title: definition.term, url: definition.url }] : undefined)
      announce(answer)
      if (hasDashboard) openChat()
      return
    }

    // Small talk → a fixed reply (no model needed).
    if (verdict === 'small-talk') {
      const reply = smallTalkReply(typed, { hello: t.smallTalkHello, thanks: t.smallTalkThanks })
      llm.append({ role: 'user', content: typed }, { role: 'assistant', content: reply, choices: ideaChoices })
      announce(reply)
      if (hasDashboard) openChat()
      return
    }

    // Our Eurostat documents answer it → quote them; they support it → the model, with the
    // passages as background; otherwise ("what is the date of oil") → ask to rephrase.
    const query = searchQuery(verdict === 'follow-up' ? `${previous.at(-1)} ${text}` : text)
    void answerFromDocuments(typed, query).then((outcome) => {
      if (outcome === 'model') askModel(typed, verdict, previous, conceptual)
      else if (outcome === 'unclear') {
        recordMiss({ text: typed, lang, kind: 'unclear', followUp: hasDashboard })
        llm.append({ role: 'user', content: typed }, { role: 'assistant', content: t.notUnderstood, choices: ideaChoices })
        announce(t.notUnderstood)
      }
    })
    if (hasDashboard) openChat()
  }

  /**
   * Decides how a conceptual question is answered, based on how well our Eurostat documents
   * cover it: 'quoted' (answered here), 'model' (well supported), 'offered' (the closest passage
   * and the offer of a fuller answer, when the model is not there) or 'unclear' (not supported).
   */
  async function answerFromDocuments(text: string, query: string): Promise<'quoted' | 'model' | 'unclear' | 'offered'> {
    // The larger model (computers) answers figure questions itself, from the excerpts.
    const answer = await documentAnswer(query, { figuresToModel: ready && llm.runtime?.key === 'large' })
    if (answer.kind === 'unclear') return 'unclear'
    if (answer.kind === 'quote') {
      llm.reply(text, answer.text, 'quote', answer.sources)
      announce(`${t.fromEurostat}: ${answer.text}`)
      return 'quoted'
    }
    if (ready) return 'model'
    const fuller = [{ label: t.fullerAnswer, query: text, fuller: true }]
    if (answer.quote) {
      llm.append({ role: 'user', content: text }, { role: 'assistant', content: answer.quote.text, kind: 'quote', sources: answer.quote.sources, choices: fuller })
      announce(`${t.fromEurostat}: ${answer.quote.text}`)
    } else {
      llm.append({ role: 'user', content: text }, { role: 'assistant', content: t.dlOffer, choices: fuller })
      announce(t.dlOffer)
    }
    return 'offered'
  }

  const onSuggestion = (s: Suggestion) => {
    if (dash.building || llm.generating || !current) return
    if (s.plan) return void dash.runPlan(s.plan, s.label)
    if (s.explain) void explainDashboard(s.label)
  }

  const runAction = (a: { plan?: Plan; explain?: boolean }, question: string) =>
    a.explain ? void explainDashboard(question) : a.plan ? void dash.runPlan(a.plan, question) : undefined

  /**
   * A dashboard change the rules could not map: its likely options as buttons, most word overlap
   * first (the model does not pick for the user: on the labelled follow-ups its picks were right
   * 0 of 69 times). Returns false when there is nothing to offer.
   */
  function resolveWithActions(text: string): boolean {
    if (!current || !dict || !codelists) return false
    const actions = dashboardActions(current, text, dict, codelists, t.actions, STRINGS.en.actions, lang)
    if (!actions.length) return false
    const ranked: DashboardAction[] = rankByOverlap(actions, text)
    llm.append(
      { role: 'user', content: text },
      { role: 'assistant', content: t.didYouMean, choices: ranked.slice(0, 4).map((a) => ({ label: a.label, query: a.label, plan: a.plan, explain: a.explain })) },
    )
    announce(t.didYouMean)
    recordMiss({ text, lang, kind: 'buttons', followUp: true })
    openChat()
    return true
  }

  /** The dashboard on screen as background for a question about it. */
  async function onScreenFacts() {
    const { spec, insights } = await dashboardFacts()
    return { context: dashboardContext({ ...spec, place: placeOf(spec) }, insights), source: spec.source }
  }

  /** The places of a dashboard in words ("the EU-27 (European Union)", "Spain, France"). */
  function placeOf(spec: NonNullable<typeof current>) {
    const geo = ([] as string[]).concat(spec.plan.filters.geo ?? [])
    const name = (code: string) =>
      code === 'EU27_2020' ? 'the EU-27 (European Union)' : ((codelists?.codelists.GEO?.codes[code] as Record<string, string> | undefined)?.en ?? code)
    return geo.length ? geo.map(name).join(', ') : undefined
  }

  /** The dashboard's own facts: Eurostat's description of the indicator and the key insights. */
  async function dashboardFacts() {
    const spec = current!
    const described = await datasetDescription(spec.plan.dataset, 3).catch(() => null)
    const insights = spec.insights.map((i) => i.parts.map((p) => (typeof p === 'string' ? p : p.strong)).join(''))
    const sources = [spec.source, ...(described?.url ? [{ code: spec.plan.dataset, title: `${described.title} › ${described.section}`, url: described.url }] : [])]
    return { spec, described, insights, sources }
  }

  /**
   * "Explain these figures": the model explains the dashboard in plain words from its own facts
   * (labelled as written by the assistant, sources under it). Without the model yet: the facts
   * (Eurostat's description and the key insights) and the offer to explain them with AI.
   */
  async function explainDashboard(question: string) {
    if (!current) return
    openChat()
    if (ready) return void explainWithModel(question)
    // Loading (computers load it on their own, phones once agreed): explained as soon as it is ready.
    if (llm.status === 'loading') return requestAiExplanation(question)
    // Not downloaded (a phone that has not agreed yet): the facts, and the offer to explain with AI.
    const { spec, described, insights, sources } = await dashboardFacts()
    const answer = [described?.text, insights.length ? insights.map((i) => `• ${i}`).join('\n') : spec.summary.join(' ')].filter(Boolean).join('\n\n')
    llm.append(
      { role: 'user', content: question },
      { role: 'assistant', content: answer || t.dNoData, sources, choices: [{ label: t.explainWithAi, query: question, explainAi: true }] },
    )
    announce(answer)
  }

  /** The model's explanation of the dashboard on screen. */
  function explainWithModel(question: string) {
    if (!current) return
    openChat()
    llm.ask(question, {
      systemPrompt: EXPLAIN_SYSTEM_PROMPT,
      options: EXPLAIN_GENERATION,
      prepare: async () => {
        const { spec, described, insights, sources } = await dashboardFacts()
        // The place in words ("EU-27", "Germany, France"), so the model does not say "global".
        return { prompt: explainPrompt({ ...spec, place: placeOf(spec) }, { description: described?.text, insights }, lang), sources }
      },
    })
  }

  /** "Explain with AI": now, or once the model is downloaded (with consent). */
  function requestAiExplanation(question: string) {
    if (ready) return explainWithModel(question)
    pendingExplain.current = true
    assistant.requestDownload(question)
  }

  return { send, onSuggestion, runAction, requestFullerAnswer, requestAiExplanation }
}
