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
  terms: Map<string, number>[] // term frequencies per passage (stems and stem pairs, see stem)
  lengths: number[]
  avgLength: number
  /** Number of passages each term appears in (for ranking). */
  termFreq: Map<string, number>
  /** Number of passages each word appears in, as written (for the vocabulary check). */
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

/**
 * Words people use for what the documents call otherwise: "per person" is "per capita", what a
 * price "consists of" are its "components", the "largest" share is the "highest".
 */
const SYNONYMS: Record<string, string> = {
  person: 'capita', persons: 'capita', people: 'capita', inhabitant: 'capita', inhabitants: 'capita', head: 'capita',
  consist: 'component', consists: 'component', composed: 'component', breakdown: 'component', made: 'component',
  largest: 'highest', biggest: 'highest', greatest: 'highest', smallest: 'lowest',
  dependent: 'dependency', depend: 'dependency', depends: 'dependency', reliant: 'dependency', reliance: 'dependency',
  // How an indicator is calculated: the documents give its numerator and denominator.
  calculated: 'numerator denominator divided ratio', calculate: 'numerator denominator divided ratio', computed: 'numerator denominator divided ratio',
}

/** The search terms of a question: its own, plus the documents' words for them (see SYNONYMS). */
function queryTokens(question: string): string[] {
  const extra = words(question)
    .map((w) => SYNONYMS[w])
    .filter(Boolean)
    .join(' ')
  return [...new Set([...tokens(question), ...tokens(extra)])]
}

/**
 * Word families share a stem, so a question and a passage match whatever the word form:
 * "produce", "produced", "production" → "produc"; "heating" → "heat"; "households" → "household".
 */
export function stem(w: string): string {
  if (w.length <= 4 || /\d/.test(w)) return w
  const s = w.replace(/(ations?|tions?|ings?|ers?|ed|es|e|s)$/, '')
  return s.length >= 4 ? s : w
}

/** Stems plus adjacent stem pairs, so "heat pump" outranks pages that only mention "heat". */
function tokens(text: string): string[] {
  const w = words(text).map(stem)
  return [...w, ...w.slice(1).map((x, i) => `${w[i]}_${x}`)]
}

let indexPromise: Promise<Index> | null = null
let loadedIndex: Index | null = null

/** Document frequency of each word in the knowledge base, once loaded (for the vocabulary check). */
export const knowledgeDocFreq = (): Map<string, number> | undefined => loadedIndex?.docFreq

/** BM25 index of the passages (also used in Node by the evaluation). */
export function buildKnowledgeIndex(passages: Passage[]): Index {
  const termFreq = new Map<string, number>()
  const docFreq = new Map<string, number>()
  const terms = passages.map((p) => {
    // Title and section words count too ("Unit of measure", "Energy imports dependency").
    const text = `${p.title} ${p.section ?? ''} ${p.text}`
    const tf = new Map<string, number>()
    for (const t of tokens(text)) tf.set(t, (tf.get(t) ?? 0) + 1)
    for (const t of tf.keys()) termFreq.set(t, (termFreq.get(t) ?? 0) + 1)
    for (const w of new Set(words(text))) docFreq.set(w, (docFreq.get(w) ?? 0) + 1)
    return tf
  })
  const lengths = terms.map((tf) => [...tf.values()].reduce((a, b) => a + b, 0))
  return { passages, terms, lengths, avgLength: lengths.reduce((a, b) => a + b, 0) / lengths.length, termFreq, docFreq }
}

/** Uses already loaded passages (Node tests and scripts, which cannot fetch). */
export function setKnowledgePassages(passages: Passage[]) {
  loadedIndex = buildKnowledgeIndex(passages)
  indexPromise = Promise.resolve(loadedIndex)
}

/** Loads and indexes the knowledge base once (lazily, the first time the model needs it). */
export function loadKnowledge(): Promise<Index> {
  indexPromise ??= fetch(`${import.meta.env.BASE_URL}data/eurostat/energy/knowledge.json`)
    .then((r) => (r.ok ? (r.json() as Promise<{ passages: Passage[] }>) : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then(({ passages }) => (loadedIndex = buildKnowledgeIndex(passages)))
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

// Metadata sections about the publication process, not the statistics: they never answer a
// question ("Data are comparable between all EU Member States").
const BOILERPLATE =
  /comparability|accessibility|dissemination|contact|release calendar|release policy|revision|confidentiality|quality management|quality assessment|cost and burden|accuracy|timeliness|punctuality|coherence|metadata update|news release|publications|online database|micro-data|documentation on methodology|user needs|user satisfaction|completeness|institutional mandate|data compilation|data validation|source data|frequency of data collection/i

// Sentences that cite legislation rather than explain ("Compliance with Article 29 …").
const LEGAL = /\b(article \d+|regulation \(|regulation \d|directive \(|directive \d|communication from|decision \(|decision \d|oj l)\b/i

/**
 * Top passages for a question. `datasets` boosts documentation of the dataset being discussed;
 * at most one passage per source document, so answers draw on different documents.
 */
export async function searchKnowledge(
  question: string,
  { limit = 2, datasets = [] as string[], minScore = 4, perDocument = 1 } = {},
): Promise<Hit[]> {
  const index = await loadKnowledge()
  const query = queryTokens(question)
  if (!query.length) return []
  const n = index.passages.length

  const scored = index.passages.map((p, i) => {
    let score = 0
    let matched = 0
    for (const q of query) {
      const f = index.terms[i].get(q)
      if (!f) continue
      if (!q.includes('_')) matched++
      const df = index.termFreq.get(q) ?? 0
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5))
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * index.lengths[i]) / index.avgLength)))
    }
    if (score && p.datasets?.some((d) => datasets.includes(d))) score *= 1.5
    return { p, score, matched }
  })
  // A passage must share at least two key words with the question (or all, for one-word questions).
  const minMatched = Math.min(2, query.filter((q) => !q.includes('_')).length)

  // At most `perDocument` passages of one article or dataset (its key facts may be in another part
  // than the best-scoring one), so the others still get a place.
  const seen = new Map<string, number>()
  return scored
    .filter((s) => s.score >= minScore && s.matched >= minMatched && !BOILERPLATE.test(s.p.section ?? ''))
    .sort((a, b) => b.score - a.score)
    .filter((s) => {
      const doc = s.p.url ?? s.p.title
      const n = seen.get(doc) ?? 0
      if (n >= perDocument) return false
      seen.set(doc, n + 1)
      return true
    })
    .slice(0, limit)
    .map((s) => ({ ...s.p, score: Math.round(s.score * 10) / 10, matched: s.matched }))
}

/**
 * Extractive answer: the sentences of a passage that best match the question, in their original
 * order. Quoting Eurostat's own wording avoids the paraphrasing errors of a small model.
 */
/** The sentences of a text (list items count as sentences; headings, without a final stop, do not). */
function sentencesOf(text: string): string[] {
  return (
    text
      .replace(/\n+- /g, '\n• ')
      .split(/(?<=[.!?])\s+(?=[A-Z•])|\n+/)
      .map((s) => s.trim())
      // Real sentences only: headings ("Largest increase in prices in Romania") have no final stop.
      .filter((s) => s.length > 30 && (/[.!?:;]$/.test(s) || s.startsWith('•')))
  )
}

export function bestSentences(passage: Passage, question: string, max = 3): string {
  const q = new Set(words(question))
  const sentences = sentencesOf(passage.text)
  const ranked = sentences
    // Legal references go last: they cite a text instead of explaining.
    .map((s, i) => ({ s, i, score: words(s).filter((w) => q.has(w)).length - (LEGAL.test(s) ? 10 : 0) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, max)
    .filter((x, k) => (k === 0 && x.score > -5) || x.score > 0)
    .sort((a, b) => a.i - b.i)
  return ranked.map((x) => x.s).join(' ')
}

/**
 * Background for the model: the best documents for a question (articles, dataset descriptions,
 * glossary entries), each reduced to the sentences, from any of its passages, that match the
 * question best. The key fact of an article is often in another part than the one that scores
 * best as a whole ("In 2025, the EU production of hard coal was 44 million tonnes" sits in the
 * lead, while "Deliveries of coal to power plants" mentions coal more often), and short excerpts
 * leave room for more documents in a small model's prompt.
 */
export async function searchExcerpts(
  question: string,
  { docs = 4, sentences = 3, maxChars = 420, datasets = [] as string[] } = {},
): Promise<Hit[]> {
  const index = await loadKnowledge()
  const top = await searchKnowledge(question, { limit: docs, datasets })
  const query = queryTokens(question)
  const n = index.passages.length
  const idf = (t: string) => {
    const df = index.termFreq.get(t) ?? 0
    return Math.log(1 + (n - df + 0.5) / (df + 0.5))
  }
  const years = question.match(/\b(19|20)\d{2}\b/g) ?? []
  return top.map((hit) => {
    const doc = hit.url ?? hit.title
    const parts = index.passages.filter((p) => (p.url ?? p.title) === doc && !BOILERPLATE.test(p.section ?? ''))
    const scored = parts
      .flatMap((p, pi) => sentencesOf(p.text).map((s, si) => ({ s, order: pi * 1000 + si })))
      .map((x) => {
        const terms = new Set(tokens(x.s))
        let score = 0
        for (const t of query) if (terms.has(t)) score += idf(t)
        // The year asked about ("in 2025") marks the sentence with the figure.
        if (years.some((y) => x.s.includes(y))) score += 2
        if (LEGAL.test(x.s)) score -= 10
        return { ...x, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
    const picked: typeof scored = []
    let length = 0
    for (const x of scored) {
      if (picked.length >= sentences || picked.some((p) => p.s === x.s)) continue
      if (picked.length && length + x.s.length > maxChars) continue
      picked.push(x)
      length += x.s.length + 1
    }
    const text = picked.sort((a, b) => a.order - b.order).map((x) => x.s).join(' ')
    return { ...hit, text: text || hit.text.slice(0, maxChars) }
  })
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

/**
 * Eurostat's own description of a dataset (first sentences of its "Data description" metadata),
 * used to explain a dashboard without letting the model guess what the indicator means.
 */
export async function datasetDescription(code: string, maxSentences = 2): Promise<Passage | null> {
  const { passages } = await loadKnowledge()
  const p = passages.find((x) => x.kind === 'metadata' && x.datasets?.includes(code) && x.section === 'Data description')
  if (!p) return null
  const text = p.text.replace(/\s+/g, ' ').trim()
  const sentences = text.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [text]
  return { ...p, text: sentences.slice(0, maxSentences).join(' ').replace(/\s+/g, ' ').trim() }
}

/**
 * How well a quote covers the question: the share of the question's key words it contains
 * (0–1). Used to pick the passage whose sentences answer best, not only the best-ranked one.
 */
export function quoteCoverage(quote: string, question: string): number {
  const q = new Set(words(question))
  if (!q.size) return 0
  const inQuote = new Set(words(quote))
  return [...q].filter((w) => inQuote.has(w)).length / q.size
}
