import { bestSentences, CONFIDENT_SCORE, MODEL_MIN_SCORE, quoteCoverage, type Hit } from './knowledge'

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
  const candidates = hits
    .filter((h) => h.score >= top.score * 0.8)
    .map((h) => ({ h, quote: bestSentences(h, query) }))
    .map((c) => ({ ...c, coverage: quoteCoverage(c.quote, query) }))
    .sort((a, b) => b.coverage - a.coverage || b.h.score - a.h.score)
  const { h: best, quote, coverage } = candidates[0]
  const sources = [best, ...hits.filter((h) => h !== best && h.score >= CONFIDENT_SCORE / 2)].map(sourceOf).filter((s): s is Source => !!s)
  // A confident quote must also cover most of the question.
  if (best.score >= CONFIDENT_SCORE && quote && coverage >= 0.5) return { kind: 'quote', text: quote, sources }
  return { kind: 'model', ...(quote && coverage > 0 ? { quote: { text: quote, sources } } : {}) }
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
