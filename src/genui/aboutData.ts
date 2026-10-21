import type { EnergyDictionary } from '../data/eurostat'
import type { DashboardSpec, Plan, TimeRange, WidgetSpec } from './types'

/**
 * Two things that let a reader trust a dashboard: how the question was read ("Renewables · Germany · all years", with
 * what it was compared with) and what the data is (the Eurostat dataset, when it was last updated, the years it covers,
 * how to read provisional values), with the values behind the charts as a CSV file. Both are plain data on the spec
 * (DashboardSpec.reading, DashboardSpec.about) and are drawn by Dashboard.tsx.
 */
export interface AboutStrings {
  readLabel: string
  allYears: string
  lastYears: string
  fromYear: string
  untilYear: string
  rangeYears: string
  allCountries: string
  aboutTitle: string
  aboutSource: string
  aboutDataset: string
  aboutUpdated: string
  aboutCovers: string
  aboutCatalogue: string
  aboutFlags: string
  aboutFlagsText: string
  aboutDownload: string
  aboutUnit: string
  level: string
  plain: string
  details: string
  present: string
  exitPresent: string
  print: string
  updatedSince: string
  target: string
}

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')

/** The period a plan asks for, in words. */
function periodText(time: TimeRange, focus: string | undefined, a: AboutStrings): string {
  if (focus) return focus
  if (time.kind === 'last') return fill(a.lastYears, { n: String(time.n) })
  if (time.kind === 'range') {
    if (time.since && time.until) return time.since === time.until ? time.since : fill(a.rangeYears, { a: time.since, b: time.until })
    if (time.since) return fill(a.fromYear, { y: time.since })
    if (time.until) return fill(a.untilYear, { y: time.until })
  }
  return a.allYears
}

/** The values behind the charts and tables of a dashboard, as CSV (title, category, series, value). */
export function specToCsv(spec: DashboardSpec): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows: string[] = [['chart', 'category', 'series', 'value'].join(',')]
  const add = (w: WidgetSpec) => {
    if (w.type === 'line' || w.type === 'area' || w.type === 'bar') {
      for (const s of w.series) w.categories.forEach((c, i) => rows.push([w.title, c, s.name, s.data[i]].map(esc).join(',')))
    } else if (w.type === 'pie') {
      for (const s of w.slices) rows.push([w.title, s.name, '', s.y].map(esc).join(','))
    } else if (w.type === 'table') {
      for (const r of w.rows) w.columns.forEach((c, i) => rows.push([w.title, c, r.label, r.values[i]].map(esc).join(',')))
    } else if (w.type === 'progress') {
      w.categories.forEach((c, i) => rows.push([w.title, c, '', w.values[i]].map(esc).join(',')))
    } else if (w.type === 'gauge') {
      rows.push([w.title, w.label, '', w.value].map(esc).join(','))
    }
  }
  spec.widgets.forEach(add)
  return rows.join('\n')
}

/** The reading strip and the about panel for a built dashboard. */
export function withAbout(spec: DashboardSpec, plan: Plan, dict: EnergyDictionary, placeNames: string[], lang: string, a: AboutStrings): DashboardSpec {
  const ds = dict.datasets[spec.source.code]
  const generated = (dict as unknown as { generatedAt?: string }).generatedAt?.slice(0, 10)
  const parts = [
    ...(spec.subtitle ? [spec.subtitle] : []),
    ...(plan.allCountries ? [a.allCountries] : placeNames.length > 3 ? [...placeNames.slice(0, 3), `+${placeNames.length - 3}`] : placeNames),
    ...(spec.compareNames ? [`${lang === 'de' ? 'gegen' : lang === 'fr' ? 'contre' : 'vs'} ${spec.compareNames[1]}`] : []),
    periodText(plan.time, plan.focusPeriod, a),
  ].filter((x, i, all) => x && all.indexOf(x) === i)
  const rows = [
    { label: a.aboutSource, value: spec.source.title && spec.source.title !== spec.source.code ? `Eurostat, ${spec.source.title}` : 'Eurostat' },
    { label: a.aboutDataset, value: spec.source.code },
    ...(ds?.lastUpdate ? [{ label: a.aboutUpdated, value: `${ds.lastUpdate}${generated ? ` (${fill(a.aboutCatalogue, { date: generated })})` : ''}` }] : []),
    ...(ds?.dataStart && ds.dataEnd ? [{ label: a.aboutCovers, value: `${ds.dataStart} – ${ds.dataEnd}` }] : []),
    ...(spec.unit ? [{ label: a.aboutUnit, value: spec.unit }] : []),
    { label: a.aboutFlags, value: a.aboutFlagsText },
  ]
  const slug = spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'dashboard'
  return {
    ...spec,
    reading: { label: a.readLabel, parts, tools: { level: a.level, plain: a.plain, details: a.details, present: a.present, exit: a.exitPresent, print: a.print, updated: a.updatedSince, target: a.target } },
    about: { title: a.aboutTitle, ...(ds?.lastUpdate ? { updated: { code: spec.source.code, date: ds.lastUpdate } } : {}), rows, download: { label: a.aboutDownload, filename: `${slug}.csv`, csv: specToCsv(spec) } },
  }
}
