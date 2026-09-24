import { normalize } from './energyScope'

/**
 * Local search over ENgenuidash's energy knowledge base (public/data/eurostat/energy/knowledge.json,
 * built from Eurostat documents by `npm run eurostat:knowledge`). BM25 ranking, entirely in the
 * browser: no embeddings model, no server, nothing sent anywhere.
 */

export interface Passage {
  id: string
  kind: 'metadata' | 'article' | 'glossary'
  title: string
  section?: string
  url?: string
  date?: string
  /** Datasets the passage documents (metadata passages). */
  datasets?: string[]
  text: string
}

interface Index {
  passages: Passage[]
  terms: Map<string, number>[] // term frequencies per passage
  lengths: number[]
  avgLength: number
  docFreq: Map<string, number>
}

const STOPWORDS = new Set(
  (
    'a an and are as at be by for from has have in is it its of on or that the this to was were which with ' +
    'what how why when who does do can could should would will not no into than then there these those also ' +
    'about between more most other such their they its may all each per any eu data'
  ).split(' '),
)

/** Lower-case, accent-free, stop words removed, light plural trimming. */
function words(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
}

/** Key words of a question (stop words removed), used to check how well a passage covers it. */
export function contentWords(text: string): string[] {
  return [...new Set(words(text))]
}

/** Words plus adjacent word pairs, so "heat pump" outranks pages that only mention "heat". */
function tokens(text: string): string[] {
  const w = words(text)
  return [...w, ...w.slice(1).map((x, i) => `${w[i]}_${x}`)]
}

let indexPromise: Promise<Index> | null = null
let loadedIndex: Index | null = null

/** Document frequency of each word in the knowledge base, once loaded (for the vocabulary check). */
export const knowledgeDocFreq = (): Map<string, number> | undefined => loadedIndex?.docFreq

/** Loads and indexes the knowledge base once (lazily, the first time the model needs it). */
export function loadKnowledge(): Promise<Index> {
  indexPromise ??= fetch(`${import.meta.env.BASE_URL}data/eurostat/energy/knowledge.json`)
    .then((r) => (r.ok ? (r.json() as Promise<{ passages: Passage[] }>) : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then(({ passages }) => {
      const docFreq = new Map<string, number>()
      const terms = passages.map((p) => {
        // Title and section words count too ("Unit of measure", "Energy imports dependency").
        const tf = new Map<string, number>()
        for (const t of tokens(`${p.title} ${p.section ?? ''} ${p.text}`)) tf.set(t, (tf.get(t) ?? 0) + 1)
        for (const t of tf.keys()) docFreq.set(t, (docFreq.get(t) ?? 0) + 1)
        return tf
      })
      const lengths = terms.map((tf) => [...tf.values()].reduce((a, b) => a + b, 0))
      loadedIndex = { passages, terms, lengths, avgLength: lengths.reduce((a, b) => a + b, 0) / lengths.length, docFreq }
      return loadedIndex
    })
    .catch((err) => {
      indexPromise = null
      throw err
    })
  return indexPromise
}

const K1 = 1.2
const B = 0.75

export interface Hit extends Passage {
  score: number
  /** Distinct single words of the question found in the passage. */
  matched: number
}

/**
 * Top passages for a question. `datasets` boosts documentation of the dataset being discussed;
 * at most one passage per source document, so answers draw on different documents.
 */
export async function searchKnowledge(
  question: string,
  { limit = 2, datasets = [] as string[], minScore = 4 } = {},
): Promise<Hit[]> {
  const index = await loadKnowledge()
  const query = [...new Set(tokens(question))]
  if (!query.length) return []
  const n = index.passages.length

  const scored = index.passages.map((p, i) => {
    let score = 0
    let matched = 0
    for (const q of query) {
      const f = index.terms[i].get(q)
      if (!f) continue
      if (!q.includes('_')) matched++
      const df = index.docFreq.get(q) ?? 0
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5))
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * index.lengths[i]) / index.avgLength)))
    }
    if (score && p.datasets?.some((d) => datasets.includes(d))) score *= 1.5
    return { p, score, matched }
  })
  // A passage must share at least two key words with the question (or all, for one-word questions).
  const minMatched = Math.min(2, query.filter((q) => !q.includes('_')).length)

  const seen = new Set<string>()
  return scored
    .filter((s) => s.score >= minScore && s.matched >= minMatched)
    .sort((a, b) => b.score - a.score)
    .filter((s) => {
      const doc = s.p.url ?? s.p.title
      if (seen.has(doc)) return false
      seen.add(doc)
      return true
    })
    .slice(0, limit)
    .map((s) => ({ ...s.p, score: Math.round(s.score * 10) / 10, matched: s.matched }))
}

/**
 * Extractive answer: the sentences of a passage that best match the question, in their original
 * order. Quoting Eurostat's own wording avoids the paraphrasing errors of a small model.
 */
export function bestSentences(passage: Passage, question: string, max = 3): string {
  const q = new Set(words(question))
  const sentences = passage.text
    .replace(/\n+- /g, '\n• ')
    .split(/(?<=[.!?])\s+(?=[A-Z•])|\n+/)
    .map((s) => s.trim())
    // Real sentences only: headings ("Largest increase in prices in Romania") have no final stop.
    .filter((s) => s.length > 30 && (/[.!?:;]$/.test(s) || s.startsWith('•')))
  const ranked = sentences
    .map((s, i) => ({ s, i, score: words(s).filter((w) => q.has(w)).length }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, max)
    .filter((x, k) => k === 0 || x.score > 0)
    .sort((a, b) => a.i - b.i)
  return ranked.map((x) => x.s).join(' ')
}

/**
 * Minimum BM25 score for answering straight from the documents. Tuned on sample questions:
 * methodology/definition questions score 18–31 with the right passage; "why" questions the
 * documents do not answer score ≤ 17 and go to the model with the passages as background.
 */
export const CONFIDENT_SCORE = 18

/**
 * Minimum support for letting the model answer (with the passages as background). Below it the
 * user is asked to rephrase instead of getting a generated guess.
 */
export const MODEL_MIN_SCORE = 8
