import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AreaChart, BarChart, BubbleChart, DumbbellChart, LineChart, MapChart, PieChart, type ChartActionLabels } from '../components/charts'
import { EclSelect } from '../components/filters'
import { BalanceTable, type BalanceTableLabels } from '../components/table'
import { fetchEurostatData } from '../data/eurostat'
import { BALANCE_GEOS } from './balance'
import type { WidgetSpec } from './types'

type BalanceWidget = Extract<WidgetSpec, { type: 'balance' }>

export interface BalanceSheetLabels extends Omit<BalanceTableLabels, 'missing'> {
  chartsFor: string
  byFuel: string
  overTime: string
  byCountry: string
  onMap: string
  change: string
  values: string
  shares: string
  breakdown: string
  drill: string
  path: string
  bubbleTitle: string
  bubbleX: string
  bubbleY: string
  bubbleZ: string
  chartsError: string
}

type Bubble = { name: string; x: number; y: number; z: number }

type Series = { name: string; data: (number | null)[] }
type Loaded = {
  line: string
  trend: { categories: string[]; series: Series[] }
  /** This year, largest first: the line per fuel (stacked bars) and its total (map). */
  countries: { codes: string[]; categories: string[]; series: Series[]; totals: number[] }
  /** Ten years earlier and this year, for the largest countries (dumbbell). */
  change?: { from: string; categories: string[]; before: (number | null)[]; after: (number | null)[] }
}

/**
 * A sub-line's own words: "Final consumption - industry sector - iron and steel - energy use"
 * under "Final consumption - industry sector - energy use" is "Iron and steel".
 */
function subLabel(label: string, parent: string): string {
  const base = (t: string) => t.replace(/\s*-\s*[^-]*energy use$/i, '').replace(/\s*-\s*energetische verwendung$/i, '').replace(/\s*-\s*utilisation énergétique$/i, '')
  const own = base(label)
  const above = base(parent)
  const text = own.startsWith(`${above} - `) ? own.slice(above.length + 3) : own
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Countries in the change chart: the largest, so each row stays readable. */
const CHANGE_COUNTRIES = 15

/**
 * The energy balance sheet and, under it, the charts of one line (as enbal's row buttons): the
 * line by fuel (from the sheet), over time and by country (fetched when the line is picked).
 */
export function BalanceSheet({
  widget: w,
  lang,
  labels,
  missing,
  chartLabels,
  source,
  titleExtra,
}: {
  widget: BalanceWidget
  lang: string
  labels: BalanceSheetLabels
  missing: string
  chartLabels: Partial<ChartActionLabels>
  source: ReactNode
  /** After the table's title: the toggle between the places of a comparison. */
  titleExtra?: ReactNode
}) {
  const id = useId()
  const [line, setLine] = useState('NRGSUP')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  // The selection whose charts could not be loaded (a new selection or a retry clears it).
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [shares, setShares] = useState(false)
  const [bubbles, setBubbles] = useState<{ key: string; points: Bubble[] } | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { geo, unit, year } = w.query
  const parts = w.columns.filter((c) => c.code !== 'TOTAL')
  const hasTotal = parts.length < w.columns.length
  const row = w.rows.find((r) => r.code === line) ?? w.rows[0]
  const lineLabel = row.label
  const fill = (t: string) => t.replace('{line}', lineLabel)
  const key = [geo, unit, year, line, lang, attempt].join('|')
  const failed = failedFor === key
  // Drill-down through the balance tree: the lines above (breadcrumb) and below (breakdown).
  const byCode = new Map(w.rows.map((r) => [r.code, r]))
  const path: typeof w.rows = []
  for (let r = byCode.get(row.parent ?? ''); r; r = byCode.get(r.parent ?? '')) path.unshift(r)
  const totalIndex = hasTotal ? w.columns.findIndex((c) => c.code === 'TOTAL') : -1
  const sizeOf = (r: (typeof w.rows)[number]) =>
    totalIndex >= 0 ? r.values[totalIndex] : r.values.reduce<number | null>((sum, v) => (v == null ? sum : (sum ?? 0) + v), null)
  const children = w.rows.filter((r) => r.parent === row.code).map((r) => ({ row: r, value: sizeOf(r) })).filter((c) => c.value != null && c.value !== 0)
  const bubbleKey = [geo, unit, year, lang, hasTotal].join('|')

  // Countries by production and imports relative to consumption (whole energy: the Total column).
  useEffect(() => {
    if (!hasTotal) return
    const controller = new AbortController()
    fetchEurostatData('nrg_bal_c', {
      filters: { geo: BALANCE_GEOS.filter((g) => g !== 'EU27_2020'), unit, nrg_bal: ['PPRD', 'IMP', 'EXP', 'GAE', 'GIC'], siec: 'TOTAL' },
      sinceTimePeriod: year,
      untilTimePeriod: year,
      lang,
      signal: controller.signal,
    })
      .then((res) => {
        const v = new Map(res.observations.map((o) => [`${o.keys.geo}|${o.keys.nrg_bal}`, o.value]))
        const points = (res.dimensions.geo?.codes ?? []).flatMap((g) => {
          const [pprd, imp, exp, gae, gic] = ['PPRD', 'IMP', 'EXP', 'GAE', 'GIC'].map((b) => v.get(`${g.code}|${b}`))
          if (pprd == null || imp == null || exp == null || !gae || !gic || gic <= 0) return []
          return [{ name: g.label.replace(/\s*\(.*?\)\s*$/, ''), x: (100 * pprd) / gic, y: (100 * (imp - exp)) / gae, z: gic }]
        })
        setBubbles({ key: bubbleKey, points })
      })
      .catch(() => {})
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbleKey])

  // Over time (this country) and by country (this year), for the line's fuels.
  useEffect(() => {
    const controller = new AbortController()
    const siec = w.columns.map((c) => c.code)
    const series = (res: Awaited<ReturnType<typeof fetchEurostatData>>, dim: 'time' | 'geo', keys: string[]) => {
      const at = new Map(res.observations.map((o) => [`${o.keys[dim]}|${o.keys.siec}`, o.value]))
      return parts.map((c) => ({ name: c.label, data: keys.map((k) => at.get(`${k}|${c.code}`) ?? null) }))
    }
    Promise.all([
      fetchEurostatData('nrg_bal_c', { filters: { geo, unit, nrg_bal: line, siec }, lang, signal: controller.signal }),
      fetchEurostatData('nrg_bal_c', {
        filters: { geo: BALANCE_GEOS.filter((g) => g !== 'EU27_2020'), unit, nrg_bal: line, siec },
        sinceTimePeriod: String(Number(year) - 10),
        untilTimePeriod: year,
        lang,
        signal: controller.signal,
      }),
    ])
      .then(([overTime, byCountry]) => {
        const years = (overTime.dimensions.time?.codes ?? []).map((c) => c.code)
        const from = String(Number(year) - 10)
        // The line's size per country and year: its total, or the sum of the group's fuels.
        const size = (y: string) => {
          const out = new Map<string, number>()
          for (const o of byCountry.observations) {
            if (o.value == null || o.keys.time !== y || (hasTotal ? o.keys.siec !== 'TOTAL' : o.keys.siec === 'TOTAL')) continue
            out.set(o.keys.geo, (out.get(o.keys.geo) ?? 0) + o.value)
          }
          return out
        }
        const now = size(year)
        const before = size(from)
        const geos = (byCountry.dimensions.geo?.codes ?? []).filter((c) => now.get(c.code)).sort((a, b) => Math.abs(now.get(b.code)!) - Math.abs(now.get(a.code)!))
        const name = (g: { label: string }) => g.label.replace(/\s*\(.*?\)\s*$/, '')
        const atYear = new Map(byCountry.observations.filter((o) => o.keys.time === year).map((o) => [`${o.keys.geo}|${o.keys.siec}`, o.value]))
        const top = geos.slice(0, CHANGE_COUNTRIES).filter((g) => before.has(g.code))
        setLoaded({
          line,
          trend: { categories: years, series: series(overTime, 'time', years).filter((x) => x.data.some((v) => v)) },
          countries: {
            codes: geos.map((g) => g.code),
            categories: geos.map(name),
            series: parts.map((c) => ({ name: c.label, data: geos.map((g) => atYear.get(`${g.code}|${c.code}`) ?? null) })).filter((x) => x.data.some((v) => v)),
            totals: geos.map((g) => now.get(g.code)!),
          },
          change: top.length >= 3 ? { from, categories: top.map(name), before: top.map((g) => before.get(g.code) ?? null), after: top.map((g) => now.get(g.code) ?? null) } : undefined,
        })
      })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') setFailedFor(key)
      })
    return () => controller.abort()
    // The sheet's selection and the line decide the data; `attempt` retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const pick = (code: string) => {
    setLine(code)
    // Take the reader to the charts they asked for (the table can be long).
    requestAnimationFrame(() => {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      headingRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
      headingRef.current?.focus({ preventScroll: true })
    })
  }

  const slices = parts.map((c, i) => ({ name: c.label, y: row.values[w.columns.indexOf(c)] ?? 0, i })).filter((s) => s.y > 0)
  const common = { lang, labels: chartLabels, decimals: w.decimals, valueSuffix: ` ${w.unit}`, source }
  const ready = loaded?.line === line ? loaded : null

  return (
    <div className="balance-sheet">
      <section className="chart-card">
        <BalanceTable
          caption={w.title}
          captionExtra={titleExtra}
          unit={w.unit}
          columns={w.columns}
          rows={w.rows}
          locale={lang}
          decimals={w.decimals}
          labels={{ ...labels, missing }}
          chartLine={line}
          onChart={pick}
        />
        {source}
      </section>

      <section className="balance-sheet__charts" aria-labelledby={`${id}-charts`}>
        <div className="balance-sheet__head">
          <h3 id={`${id}-charts`} ref={headingRef} tabIndex={-1} className="balance-sheet__title">
            {labels.chartsFor}: <span className="balance-sheet__line">{lineLabel}</span>
          </h3>
          <EclSelect
            id={`${id}-line`}
            label={labels.line}
            value={line}
            options={w.rows.map((r) => ({ code: r.code, label: `${'  '.repeat(r.level)}${r.label}` }))}
            onChange={(code) => setLine(code)}
          />
        </div>
        {path.length > 0 && (
          <nav className="balance-sheet__path" aria-label={labels.path}>
            <ol>
              {path.map((r) => (
                <li key={r.code}>
                  <button type="button" className="balance-sheet__crumb" onClick={() => setLine(r.code)}>
                    {r.label}
                  </button>
                </li>
              ))}
              <li aria-current="true">{lineLabel}</li>
            </ol>
          </nav>
        )}
        <p className="sr-only" aria-live="polite">
          {ready ? `${labels.chartsFor}: ${lineLabel}` : ''}
        </p>
        {failed ? (
          <p className="balance-sheet__error" role="alert">
            {labels.chartsError}{' '}
            <button type="button" className="ecl-button ecl-button--tertiary" onClick={() => setAttempt((n) => n + 1)}>
              ↻
            </button>
          </p>
        ) : (
          <div className="dash__charts">
            {slices.length >= 2 && (
              <div className="dash__cell dash__cell--half">
                <PieChart {...common} title={fill(labels.byFuel)} subtitle={`${year}`} data={slices.map(({ name, y }) => ({ name, y }))} seriesName={lineLabel} donut />
              </div>
            )}
            {ready && ready.trend.series.length > 0 && (
              <div className={`dash__cell dash__cell--${slices.length >= 2 ? 'half' : 'full'}`}>
                {/* A stack shows the mix and the total at once; with negative values (net electricity) it would mislead: lines. */}
                {ready.trend.series.every((x) => x.data.every((v) => v == null || v >= 0)) ? (
                  <AreaChart {...common} title={fill(labels.overTime)} categories={ready.trend.categories} series={ready.trend.series} highlight={year} stacked />
                ) : (
                  <LineChart {...common} title={fill(labels.overTime)} categories={ready.trend.categories} series={ready.trend.series} highlight={year} />
                )}
              </div>
            )}
            {children.length >= 2 && (
              <div className="dash__cell dash__cell--full">
                <BarChart
                  {...common}
                  title={fill(labels.breakdown)}
                  subtitle={`${year}${totalIndex >= 0 ? ` · ${w.columns[totalIndex].label}` : ''}`}
                  headline={
                    <div className="balance-sheet__drill">
                      <span className="balance-sheet__drill-label">{labels.drill}</span>
                      <ul>
                        {children.map((c) => (
                            <li key={c.row.code}>
                              <button type="button" className="suggestion-chip" onClick={() => setLine(c.row.code)}>
                                {subLabel(c.row.label, lineLabel)}
                              </button>
                            </li>
                          ))}
                      </ul>
                    </div>
                  }
                  categories={children.map((c) => subLabel(c.row.label, lineLabel))}
                  series={[{ name: lineLabel, data: children.map((c) => c.value) }]}
                  orientation="horizontal"
                  signed={children.some((c) => (c.value ?? 0) < 0)}
                  height={Math.max(220, children.length * 30 + 100)}
                />
              </div>
            )}
            {ready && ready.countries.codes.length >= 3 && (
              <div className={`dash__cell dash__cell--${ready.change ? 'half' : 'full'}`}>
                <MapChart
                  {...common}
                  title={fill(labels.onMap)}
                  subtitle={year}
                  seriesName={lineLabel}
                  data={ready.countries.codes.map((code, i) => ({ code, name: ready.countries.categories[i], value: ready.countries.totals[i] }))}
                />
              </div>
            )}
            {ready?.change && (
              <div className="dash__cell dash__cell--half">
                <DumbbellChart
                  {...common}
                  title={labels.change.replace('{line}', lineLabel).replace('{from}', ready.change.from).replace('{to}', year)}
                  categories={ready.change.categories}
                  from={{ name: ready.change.from, data: ready.change.before }}
                  to={{ name: year, data: ready.change.after }}
                />
              </div>
            )}
            {ready && ready.countries.series.length > 0 && (
              <div className="dash__cell dash__cell--full">
                <BarChart
                  {...common}
                  title={fill(labels.byCountry)}
                  subtitle={year}
                  headline={
                    <div className="segmented balance-sheet__toggle" role="group" aria-label={fill(labels.byCountry)}>
                      <button type="button" aria-pressed={!shares} onClick={() => setShares(false)}>
                        {labels.values}
                      </button>
                      <button type="button" aria-pressed={shares} onClick={() => setShares(true)}>
                        {labels.shares}
                      </button>
                    </div>
                  }
                  categories={ready.countries.categories}
                  series={ready.countries.series}
                  orientation="horizontal"
                  stacked={shares ? 'percent' : true}
                  valueSuffix={shares ? '' : common.valueSuffix}
                  height={Math.max(300, ready.countries.categories.length * 22 + 110)}
                />
              </div>
            )}
            {bubbles?.key === bubbleKey && bubbles.points.length >= 3 && (
              <div className="dash__cell dash__cell--full">
                <BubbleChart
                  lang={lang}
                  labels={chartLabels}
                  source={source}
                  decimals={0}
                  title={labels.bubbleTitle}
                  subtitle={year}
                  points={bubbles.points}
                  x={{ label: labels.bubbleX, unit: '%' }}
                  y={{ label: labels.bubbleY, unit: '%' }}
                  z={{ label: labels.bubbleZ, unit: w.unit }}
                  reference={{ x: 100, y: 0, label: '' }}
                />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
