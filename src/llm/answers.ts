import { bestSentences, CONFIDENT_SCORE, MODEL_MIN_SCORE, quoteCoverage, searchExcerpts, searchKnowledge, type Hit } from './knowledge'

/**
 * Written answers that need no language model. The model is optional (a one-time download):
 * without it, questions are answered from the glossary, from quotes of Eurostat's own documents,
 * and small talk from fixed replies. The model only adds a fuller, written answer on request.
 */

export interface Source {
  code: string
  title: string
  url: string
}

export type DocumentAnswer =
  /** The documents answer it: quote them. */
  | { kind: 'quote'; text: string; sources: Source[] }
  /** The documents support it but do not answer it word for word: the model can write the
   * answer; `quote` is the closest passage, shown when the model is not there. */
  | { kind: 'model'; quote?: { text: string; sources: Source[] } }
  /** Nothing relevant: ask the user to rephrase (never a guess). */
  | { kind: 'unclear' }

const sourceOf = (h: Hit): Source | null => (h.url ? { code: 'Eurostat', title: h.section ? `${h.title} › ${h.section}` : h.title, url: h.url } : null)

/** Decides how to answer from the best knowledge-base passages for `query`. */
export function answerFromHits(hits: Hit[], query: string): DocumentAnswer {
  const top = hits[0]
  if (!top || top.score < MODEL_MIN_SCORE) return { kind: 'unclear' }
  // The quote comes from the passage whose best sentences cover the question best (among those
  // close to the top score), not blindly from the first one.
  // A question asking for a figure, a date or a country is only answered by a quote that has one:
  // "how much hard coal did the EU produce in 2025?" is not answered by a sentence about coal.
  const figure = asksForFigure(query)
  const candidates = hits
    .filter((h) => h.score >= top.score * 0.8)
    .map((h, order) => ({ h, order, quote: bestSentences(h, query) }))
    .map((c) => ({ ...c, coverage: quoteCoverage(c.quote, query), answers: !figure || hasFigure(c.quote, query) }))
    .sort((a, b) => Number(b.answers) - Number(a.answers) || b.coverage - a.coverage || b.h.score - a.h.score || a.order - b.order)
  const { h: best, quote, coverage, answers: answersIt } = candidates[0]
  const sources = [best, ...hits.filter((h) => h.url !== best.url && h.score >= CONFIDENT_SCORE / 2)].map(sourceOf).filter((s): s is Source => !!s)
  // A confident quote must also cover most of the question.
  if (best.score >= CONFIDENT_SCORE && quote && coverage >= 0.5 && answersIt) return { kind: 'quote', text: quote, sources }
  return { kind: 'model', ...(quote && coverage > 0 && answersIt ? { quote: { text: quote, sources } } : {}) }
}

/**
 * The answer from our Eurostat documents for a question: quoted from the sentences of the best
 * documents that match it best (see searchExcerpts), or left to the model, or unclear.
 */
export async function documentAnswer(query: string): Promise<DocumentAnswer> {
  // Both kinds of candidate: the best sentences of the best documents, and the best passages as
  // they are. answerFromHits quotes whichever covers the question best.
  const [excerpts, passages] = await Promise.all([
    searchExcerpts(query, { docs: 2, maxChars: 650 }).catch(() => []),
    searchKnowledge(query, { limit: 2 }).catch(() => []),
  ])
  // (Stable sort: on a tie, the focused excerpt comes before the passage as it is.)
  return answerFromHits([...excerpts, ...passages].sort((a, b) => b.score - a.score), query)
}

// "How much", "what share", "when", "which country"… (EN, DE, FR): the answer is a figure, a date or a place.
const FIGURE_QUESTION =
  /\b(how (much|many|high|large|dependent)|what (share|percentage|proportion|amount|level)|when|which (country|countries|year|member state)|target|wie (viel|hoch|gross)|wieviel|welche[rs]? (land|lander|jahr)|wann|ziel|combien|quand|quel(le)? (part|pourcentage|pays|annee|niveau)|objectif)\b/
const EU_COUNTRIES =
  /\b(Austria|Belgium|Bulgaria|Croatia|Cyprus|Czechia|Denmark|Estonia|Finland|France|Germany|Greece|Hungary|Ireland|Italy|Latvia|Lithuania|Luxembourg|Malta|Netherlands|Poland|Portugal|Romania|Slovakia|Slovenia|Spain|Sweden)\b/

export function asksForFigure(question: string): boolean {
  return FIGURE_QUESTION.test(
    question
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''),
  )
}

/** A figure the question did not give ("2030" in "the 2030 target" is not the answer), or a country. */
function hasFigure(text: string, question: string): boolean {
  const asked = new Set(question.match(/\d+(?:[.,]\d+)?/g) ?? [])
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).some((n) => !asked.has(n)) || EU_COUNTRIES.test(text)
}

export interface SmallTalkStrings {
  hello: string
  thanks: string
}

// Thanks, alone or with a compliment ("thanks, that is great", "Danke, super"), and "ok".
const THANKS = /^(thanks?|thank you|many thanks|danke|vielen dank|merci|ok(ay)?)\b/i

/** Fixed replies to greetings and thanks (no model needed). */
export function smallTalkReply(text: string, s: SmallTalkStrings): string {
  return THANKS.test(text.trim()) ? s.thanks : s.hello
}
