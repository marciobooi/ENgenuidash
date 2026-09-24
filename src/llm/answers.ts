import { bestSentences, CONFIDENT_SCORE, MODEL_MIN_SCORE, type Hit } from './knowledge'

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
  const best = hits[0]
  if (!best || best.score < MODEL_MIN_SCORE) return { kind: 'unclear' }
  const quote = bestSentences(best, query)
  const sources = hits.filter((h) => h === best || h.score >= CONFIDENT_SCORE / 2).map(sourceOf).filter((s): s is Source => !!s)
  if (best.score >= CONFIDENT_SCORE && quote) return { kind: 'quote', text: quote, sources }
  return { kind: 'model', ...(quote ? { quote: { text: quote, sources } } : {}) }
}

export interface SmallTalkStrings {
  hello: string
  thanks: string
}

const THANKS = /^(thanks?( you)?|thank you|danke( schön| schon)?|merci( beaucoup)?|ok(ay)?)[!.?\s]*$/i

/** Fixed replies to greetings and thanks (no model needed). */
export function smallTalkReply(text: string, s: SmallTalkStrings): string {
  return THANKS.test(text.trim()) ? s.thanks : s.hello
}
