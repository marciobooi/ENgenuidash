// Builds ENgenuidash's own energy knowledge base from Eurostat documents.
//
//   npm run eurostat:knowledge        (run after eurostat:dictionary and eurostat:glossary)
//
// Everything is downloaded once, at build time, and stored in our own file; the app never calls
// these services at runtime. Sources (reuse authorised with acknowledgement, see
// https://ec.europa.eu/eurostat/about-us/policies/copyright):
//   1. Reference metadata (ESMS) of every energy dataset: definitions, units, coverage, sources.
//   2. Statistics Explained articles in the "Energy" category: context and methodology.
//   3. The energy glossary (public/data/eurostat/energy/glossary.json).
//
// Output: public/data/eurostat/energy/knowledge.json — passages of ~700 characters, each with
// its source title, section, URL and date, searched in the browser (see src/llm/knowledge.ts).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chunk, get, htmlToText, wikiSections, wikitextToText } from './lib/wikitext.mjs'

const DIR = join(process.cwd(), 'public/data/eurostat/energy')
const SE_API = 'https://ec.europa.eu/eurostat/statistics-explained/api.php'
const SE_PAGE = 'https://ec.europa.eu/eurostat/statistics-explained/index.php?title='
const CONCURRENCY = 4

const dictionary = JSON.parse(readFileSync(join(DIR, 'dictionary.json'), 'utf8'))
const glossary = JSON.parse(readFileSync(join(DIR, 'glossary.json'), 'utf8'))

const passages = []
const add = (source, section, text) => {
  for (const [i, t] of chunk(text).entries()) {
    passages.push({ id: `${source.id}#${passages.length}`, ...source, section: section || undefined, part: i, text: t })
  }
}

async function pool(items, worker) {
  let next = 0
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) await worker(items[next++])
    }),
  )
}

// ---------- 1. Dataset reference metadata (ESMS) ----------
// Sections worth answering questions from; contacts, update dates, etc. are skipped.
const USEFUL_SECTION =
  /relevance|data description|classification|coverage|concepts and definitions|statistical unit|statistical population|unit of measure|reference period|accuracy|source data|comment|comparability|coherence|compilation|adjustment|base period/i
const EMPTY = /^(not (available|applicable|requested|relevant)|n\/a|-|none)\.?$/i

const byMetadata = new Map()
for (const ds of Object.values(dictionary.datasets)) {
  if (!ds.metadataUrl) continue
  if (!byMetadata.has(ds.metadataUrl)) byMetadata.set(ds.metadataUrl, [])
  byMetadata.get(ds.metadataUrl).push(ds.code)
}

console.log(`Downloading ${byMetadata.size} dataset metadata documents…`)
await pool([...byMetadata.entries()], async ([url, codes]) => {
  const html = await get(url)
  const title = htmlToText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? codes[0])
  // "2.3. Metadata last update … 29 January 2024" → 2024-01-29
  const lastUpdate = htmlToText(html.match(/Metadata last update<\/h3>([\s\S]{0,600})/i)?.[1] ?? '').match(/\d{1,2} \w+ \d{4}/)?.[0]
  const parsed = lastUpdate ? new Date(`${lastUpdate} UTC`) : null
  const updated = parsed && !Number.isNaN(+parsed) ? parsed.toISOString().slice(0, 10) : undefined
  // Split on h3 headings ("4.1. Data description"); keep the relevant, non-empty ones.
  const parts = html.split(/<h3[^>]*>/i).slice(1)
  for (const part of parts) {
    const [headHtml, ...rest] = part.split(/<\/h3>/i)
    const heading = htmlToText(headHtml).replace(/^\d+(\.\d+)*\.?\s*/, '')
    if (!USEFUL_SECTION.test(heading)) continue
    const body = htmlToText(rest.join(' ').split(/<h[23][^>]*>/i)[0])
    if (!body || EMPTY.test(body) || body.length < 40) continue
    add({ id: `meta:${codes[0]}`, kind: 'metadata', title, url, datasets: codes, date: updated }, heading, body)
  }
})

// ---------- 2. Statistics Explained energy articles ----------
const SKIP_SECTION = /source data for tables|other articles|database|dedicated section|publications|external links|legislation|visuali[sz]ation|see also|notes|further eurostat information|methodology \/ metadata/i

const members = await get(
  `${SE_API}?action=query&list=categorymembers&cmtitle=Category:Energy&cmnamespace=0&cmlimit=500&format=json`,
  { json: true },
)
const articles = members.query.categorymembers.map((m) => m.title)
console.log(`Downloading ${articles.length} Statistics Explained articles…`)
await pool(articles, async (title) => {
  const d = await get(`${SE_API}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext|revid&redirects=1&format=json`, { json: true })
  if (!d.parse) return
  const rev = await get(`${SE_API}?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=timestamp&format=json`, { json: true })
  const date = Object.values(rev.query?.pages ?? {})[0]?.revisions?.[0]?.timestamp?.slice(0, 10)
  const url = SE_PAGE + encodeURIComponent(title.replace(/ /g, '_'))
  for (const [heading, body] of wikiSections(d.parse.wikitext['*'])) {
    if (heading && SKIP_SECTION.test(heading)) continue
    const text = wikitextToText(body)
    if (text.length < 80) continue
    add({ id: `article:${title}`, kind: 'article', title, url, date }, heading, text)
  }
})

// ---------- 3. Glossary ----------
for (const e of glossary.entries) {
  add({ id: `glossary:${e.term}`, kind: 'glossary', title: e.term, url: e.url }, '', e.text || e.summary)
}

// ---------- write ----------
const byKind = passages.reduce((n, p) => ({ ...n, [p.kind]: (n[p.kind] ?? 0) + 1 }), {})
writeFileSync(
  join(DIR, 'knowledge.json'),
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: {
      name: 'Eurostat – dataset reference metadata, Statistics Explained articles and glossary',
      licence: 'https://ec.europa.eu/eurostat/about-us/policies/copyright',
    },
    language: 'en',
    passages,
  }),
)
console.log(`Wrote ${passages.length} passages (${Object.entries(byKind).map(([k, v]) => `${v} ${k}`).join(', ')}) to ${join(DIR, 'knowledge.json')}`)
