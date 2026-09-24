// Builds the official Eurostat energy glossary used by the app.
//
//   npm run eurostat:glossary
//
// Source: Eurostat "Statistics Explained" glossary (MediaWiki API), category "Energy glossary"
// plus a few general entries used in energy statistics. Each entry keeps its official URL and
// page revision so answers can cite it. Reuse is authorised with acknowledgement of the source:
// https://ec.europa.eu/eurostat/about-us/policies/copyright
//
// Output: public/data/eurostat/energy/glossary.json
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { wikitextToText } from './lib/wikitext.mjs'

const API = 'https://ec.europa.eu/eurostat/statistics-explained/api.php'
const PAGE_URL = 'https://ec.europa.eu/eurostat/statistics-explained/index.php?title='
const CATEGORY = 'Category:Energy_glossary'
// General glossary pages that energy questions often need (skipped if they do not exist).
const EXTRA_TITLES = [
  'Glossary:Purchasing power standard (PPS)',
  'Glossary:Energy efficiency',
  'Glossary:Heat pump',
  'Glossary:Net imports',
  'Glossary:Import',
  'Glossary:Export',
  'Glossary:Energy balance',
  'Glossary:Greenhouse gas (GHG)',
  'Glossary:Carbon dioxide (CO2)',
]
const OUT = join(process.cwd(), 'public/data/eurostat/energy/glossary.json')
const MAX_TEXT = 1200 // characters kept per entry (intro only)

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (attempt >= 3) throw new Error(`${url}: ${err.message}`)
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
}

async function categoryMembers(category) {
  const titles = []
  let cont
  do {
    const d = await api({ action: 'query', list: 'categorymembers', cmtitle: category, cmlimit: '500', ...(cont ?? {}) })
    titles.push(...d.query.categorymembers.map((m) => m.title))
    cont = d.continue
  } while (cont)
  return titles
}

/** Wikitext of the intro (before the first section heading) → plain text. */
function cleanWikitext(wikitext) {
  let t = wikitextToText(wikitext.split(/\n==[^=]/)[0])
  if (t.length > MAX_TEXT) t = `${t.slice(0, MAX_TEXT).replace(/\s+\S*$/, '')}…`
  return t
}

/** Alternative names: the title, its abbreviation in brackets, and redirect titles. */
function aliasesFor(title, redirects) {
  const names = new Set()
  for (const raw of [title, ...redirects]) {
    const name = raw.replace(/^Glossary:/, '')
    names.add(name)
    const m = name.match(/^(.*?)\s*\(([^)]+)\)$/)
    if (m) {
      names.add(m[1])
      names.add(m[2])
    }
  }
  return [...names].filter((n) => n.length > 1)
}

console.log('Fetching the Eurostat energy glossary…')
const members = await categoryMembers(CATEGORY)
const titles = [...new Set([...members.filter((t) => t.startsWith('Glossary:')), ...EXTRA_TITLES])]

// Resolve redirects (e.g. "Glossary:Toe" → "Glossary:Tonnes of oil equivalent (toe)") and group aliases.
const canonical = new Map() // canonical title → Set of redirect titles
for (let i = 0; i < titles.length; i += 50) {
  const batch = titles.slice(i, i + 50)
  const d = await api({ action: 'query', titles: batch.join('|'), redirects: '1' })
  const target = new Map((d.query.redirects ?? []).map((r) => [r.from, r.to]))
  const normalized = new Map((d.query.normalized ?? []).map((n) => [n.from, n.to]))
  const missing = new Set(Object.values(d.query.pages).filter((p) => 'missing' in p).map((p) => p.title))
  for (const t of batch) {
    const n = normalized.get(t) ?? t
    const to = target.get(n) ?? n
    if (missing.has(to)) continue
    if (!canonical.has(to)) canonical.set(to, new Set())
    if (to !== n) canonical.get(to).add(n)
  }
}

const entries = []
const skipped = []
for (const [title, redirects] of canonical) {
  const d = await api({ action: 'parse', page: title, prop: 'wikitext|revid', redirects: '1' })
  if (!d.parse) {
    skipped.push(`${title} (${d.error?.info ?? 'no content'})`)
    continue
  }
  const text = cleanWikitext(d.parse.wikitext['*'])
  if (!text) continue
  entries.push({
    term: title.replace(/^Glossary:/, ''),
    aliases: aliasesFor(title, [...redirects]),
    // First paragraph: a short answer; `text` keeps the full intro for the model's context.
    summary: text.split(/\n\n/)[0],
    text,
    url: PAGE_URL + encodeURIComponent(title.replace(/ /g, '_')),
    revision: d.parse.revid,
  })
  process.stdout.write(`\r  ${entries.length}/${canonical.size}`)
}
console.log()

entries.sort((a, b) => a.term.localeCompare(b.term))
mkdirSync(join(OUT, '..'), { recursive: true })
writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: {
      name: 'Eurostat – Statistics Explained glossary',
      url: `${PAGE_URL}${CATEGORY}`,
      licence: 'https://ec.europa.eu/eurostat/about-us/policies/copyright',
    },
    language: 'en',
    entries,
  }),
)
console.log(`Wrote ${entries.length} glossary entries to ${OUT}`)
if (skipped.length) console.warn(`Skipped ${skipped.length}: ${skipped.join('; ')}`)
