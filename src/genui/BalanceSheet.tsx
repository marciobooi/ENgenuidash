import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { BarChart, LineChart, PieChart, type ChartActionLabels } from '../components/charts'
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
  chartsError: string
}

type Series = { name: string; data: (number | null)[] }
type Loaded = { line: string; trend: { categories: string[]; series: Series[] }; countries: { categories: string[]; series: Series[] } }

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
}: {
  widget: BalanceWidget
  lang: string
  labels: BalanceSheetLabels
  missing: string
  chartLabels: Partial<ChartActionLabels>
  source: ReactNode
}) {
  const id = useId()
  const [line, setLine] = useState('NRGSUP')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  // The selection whose charts could not be loaded (a new selection or a retry clears it).
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { geo, unit, year } = w.query
  const parts = w.columns.filter((c) => c.code !== 'TOTAL')
  const hasTotal = parts.length < w.columns.length
  const row = w.rows.find((r) => r.code === line) ?? w.rows[0]
  const lineLabel = row.label
  const fill = (t: string) => t.replace('{line}', lineLabel)
  const key = [geo, unit, year, line, lang, attempt].join('|')
  const failed = failedFor === key

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
        sinceTimePeriod: year,
        untilTimePeriod: year,
        lang,
        signal: controller.signal,
      }),
    ])
      .then(([overTime, byCountry]) => {
        const years = (overTime.dimensions.time?.codes ?? []).map((c) => c.code)
        // Countries, largest first (by the total, or the sum of the fuels), without those with no data.
        const size = new Map<string, number>()
        for (const o of byCountry.observations) {
          if (o.value == null) continue
          if (hasTotal ? o.keys.siec === 'TOTAL' : o.keys.siec !== 'TOTAL') size.set(o.keys.geo, (size.get(o.keys.geo) ?? 0) + Math.abs(o.value))
        }
        const geos = (byCountry.dimensions.geo?.codes ?? []).filter((c) => size.get(c.code)).sort((a, b) => size.get(b.code)! - size.get(a.code)!)
        setLoaded({
          line,
          trend: { categories: years, series: series(overTime, 'time', years).filter((s) => s.data.some((v) => v)) },
          countries: {
            categories: geos.map((g) => g.label.replace(/\s*\(.*?\)\s*$/, '')),
            series: series(byCountry, 'geo', geos.map((g) => g.code)).filter((s) => s.data.some((v) => v)),
          },
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
                <LineChart {...common} title={fill(labels.overTime)} categories={ready.trend.categories} series={ready.trend.series} highlight={year} />
              </div>
            )}
            {ready && ready.countries.series.length > 0 && (
              <div className="dash__cell dash__cell--full">
                <BarChart
                  {...common}
                  title={fill(labels.byCountry)}
                  subtitle={year}
                  categories={ready.countries.categories}
                  series={ready.countries.series}
                  orientation="horizontal"
                  stacked
                  height={Math.max(300, ready.countries.categories.length * 22 + 110)}
                />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
