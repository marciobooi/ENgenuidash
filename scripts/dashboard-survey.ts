// Builds dashboards for real questions (live Eurostat data) and lists their widgets, to review
// whether each chart fits the question. Pass questions as arguments, or use the default set.
//
//   npm run survey
//   npm run survey -- "gas storage in Germany" "monthly gas imports of Germany"
import { readFileSync } from 'node:fs'
import { buildDashboard } from '../src/genui/execute'
import { planQuestion } from '../src/genui/planner'
import { dashStrings } from '../src/genui/strings'
import { STRINGS } from '../src/i18n'

const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const dict = read('dictionary.json')
const codelists = read('codelists.json')
const s = dashStrings(STRINGS.en)

const DEFAULT = [
  'What is the energy import dependency of the EU?',
  'Renewable energy share in Spain, France and Germany since 2010',
  'Compare energy import dependency of all EU countries in 2023',
  'top 5 countries for energy import dependency',
  'Electricity mix in Germany',
  'Oil consumption in Spain in 2024',
  'electricity prices for households in Germany',
  'monthly gas imports of Germany',
  'crude oil imports by country of origin',
  'electricity generating capacity in Italy',
  'energy consumption in road transport by fuel',
  'gas storage in Germany',
]

for (const q of process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT) {
  const r = planQuestion(q, dict, codelists)
  console.log(`\n## ${q}`)
  if (r.kind !== 'plan') {
    console.log(`  → ${r.kind}`)
    continue
  }
  const p = r.plan
  try {
    const spec = await buildDashboard(p, dict, 'en', s)
    console.log(`  ${p.dataset} · ${p.intent} · ${JSON.stringify(p.time)}${p.focusPeriod ? ` · year ${p.focusPeriod}` : ''}`)
    for (const w of spec.widgets) {
      if (w.type === 'kpis') console.log(`  KPIs: ${w.items.map((k) => k.label).join(' | ')}`)
      else if (w.type !== 'table') console.log(`  ${w.type}${'size' in w && w.size ? ` (${w.size})` : ''}: ${w.title}`)
    }
    console.log(`  Insights: ${spec.insights.map((i) => i.parts.map((x) => (typeof x === 'string' ? x : x.strong)).join('')).join(' / ')}`)
  } catch (e) {
    console.log(`  error: ${(e as Error).message}`)
  }
}
