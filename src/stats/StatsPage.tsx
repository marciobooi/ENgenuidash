import { useEffect, useState } from 'react'
import { BarChart, LineChart } from '../components/charts'
import type { ChartActionLabels } from '../components/charts/ChartFrame'
import { KpiCard, KpiGrid } from '../components/kpi'
import type { Strings } from '../i18n'
import { summarize, type Stats } from './summarize'

/** Sample numbers for the development server, where there is no log (clearly labelled as such). */
function sampleStats(): Stats {
  const days = Array.from({ length: 21 }, (_, i) => {
    const d = new Date(Date.now() - (20 - i) * 86_400_000)
    const visits = 6 + ((i * 7) % 11) + (i % 7 < 5 ? 8 : 0)
    const asks = Math.round(visits * 2.1)
    return {
      date: d.toISOString().slice(0, 10),
      visits,
      avgSeconds: 70 + ((i * 13) % 90),
      over60: Math.round(visits * 0.55),
      under10: Math.round(visits * 0.12),
      langs: { en: Math.round(visits * 0.6), de: Math.round(visits * 0.25), fr: visits - Math.round(visits * 0.6) - Math.round(visits * 0.25) },
      askers: Math.round(visits * 0.7),
      events: { 'ask:dashboard': Math.round(asks * 0.4), 'ask:followup': Math.round(asks * 0.15), 'ask:concept': Math.round(asks * 0.12), 'ask:definition': Math.round(asks * 0.08), 'ask:unclear': Math.round(asks * 0.1), 'ask:quote': Math.round(asks * 0.05), 'dash:profile': 4, 'dash:trade': 3, 'dash:oil': 2, 'dash:flow': 2, 'dash:dataset': 5, filter: 6, compare: 2, table: 2, csv: 1, history: 1, switch: 2 },
    }
  })
  return { generated: new Date().toISOString(), online: 2, days, hours: [] }
}

export default function StatsPage({ t, lang, chartLabels }: { t: Strings; lang: string; chartLabels: Partial<ChartActionLabels> }) {
  const [stats, setStats] = useState<Stats | null | 'missing'>(null)
  const [sample, setSample] = useState(false)
  const s = t.stats

  useEffect(() => {
    let live = true
    fetch(`${import.meta.env.BASE_URL}stats.json?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<Stats>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => live && setStats(data))
      .catch(() => {
        if (!live) return
        if (import.meta.env.DEV) {
          setSample(true)
          setStats(sampleStats())
        } else setStats('missing')
      })
    return () => {
      live = false
    }
  }, [])

  const number = new Intl.NumberFormat(lang)
  const minutes = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 })
  const when = (iso: string) => new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

  return (
    <main className="ecl-container" id="main" tabIndex={-1} style={{ paddingBlock: 24 }}>
      <h1 className="ecl-u-type-heading-2">{s.title}</h1>
      <p className="ecl-u-type-paragraph">{s.intro}</p>
      {stats === null && <p role="status">{s.loading}</p>}
      {stats === 'missing' && <p role="alert">{s.unavailable}</p>}
      {stats && stats !== 'missing' && (
        <>
          <p className="ecl-u-type-paragraph">
            {s.updated.replace('{time}', when(stats.generated))}
            {sample && ` · ${s.sample}`}
          </p>
          {stats.days.length === 0 ? (
            <p role="status">{s.noData}</p>
          ) : (
            (() => {
              const sum = summarize(stats)
              const days = stats.days.slice(-30)
              const langs = Object.entries(sum.langs).sort((a, b) => b[1] - a[1])
              return (
                <>
                  <KpiGrid label={s.title} variant="cards">
                    <KpiCard label={s.online} value={stats.online} decimals={0} locale={lang} variant="cards" goodDirection="neutral" />
                    <KpiCard label={s.today} value={sum.today} decimals={0} locale={lang} variant="cards" goodDirection="neutral" />
                    <KpiCard label={s.week} value={sum.week} decimals={0} locale={lang} variant="cards" goodDirection="neutral" />
                    <KpiCard label={s.month} value={sum.month} decimals={0} locale={lang} variant="cards" goodDirection="neutral" />
                    <KpiCard label={s.avgTime} value={Math.round((sum.avgSeconds / 60) * 10) / 10} unit={s.minutesShort} decimals={1} locale={lang} variant="cards" goodDirection="neutral" />
                    <KpiCard label={s.over1} value={Math.round(sum.over60Pct)} unit="%" decimals={0} locale={lang} variant="cards" goodDirection="neutral" />
                  </KpiGrid>
                  <h2 className="ecl-u-type-heading-3" style={{ marginTop: 24 }}>
                    {s.usage}
                  </h2>
                  <KpiGrid label={s.usage} variant="cards">
                    <KpiCard label={s.askers} value={Math.round(sum.askersPct)} unit="%" decimals={0} locale={lang} variant="cards" goodDirection="neutral" />
                    <KpiCard label={s.asks} value={sum.asks} decimals={0} locale={lang} variant="cards" goodDirection="neutral" />
                    <KpiCard label={s.asksPerAsker} value={Math.round(sum.asksPerAsker * 10) / 10} decimals={1} locale={lang} variant="cards" goodDirection="neutral" />
                    <KpiCard label={s.unclear} value={Math.round(sum.unclearPct)} unit="%" decimals={0} locale={lang} variant="cards" goodDirection="down" />
                  </KpiGrid>
                  <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
                    <BarChart
                      title={s.visitsPerDay}
                      subtitle={`${number.format(sum.month)} / 30`}
                      description={s.visitsPerDay}
                      categories={days.map((d) => d.date.slice(5))}
                      series={[{ name: s.visitsPerDay, data: days.map((d) => d.visits) }]}
                      decimals={0}
                      labels={chartLabels}
                      lang={lang}
                    />
                    <LineChart
                      title={s.timePerDay}
                      subtitle={s.minutesShort}
                      description={s.timePerDay}
                      categories={days.map((d) => d.date.slice(5))}
                      series={[{ name: s.timePerDay, data: days.map((d) => Math.round((d.avgSeconds / 60) * 10) / 10) }]}
                      decimals={1}
                      labels={chartLabels}
                      lang={lang}
                    />
                    <BarChart
                      title={s.languages}
                      description={s.languages}
                      categories={langs.map(([l]) => l.toUpperCase())}
                      series={[{ name: s.languages, data: langs.map(([, n]) => n) }]}
                      orientation="horizontal"
                      decimals={0}
                      showValues
                      labels={chartLabels}
                      lang={lang}
                    />
                  </div>
                  <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
                    {[
                      { title: s.outcomes, data: sum.outcomes, names: s.outcomeNames },
                      { title: s.dashboards, data: sum.dashboards, names: s.dashboardNames },
                      { title: s.actions, data: sum.actions, names: s.actionNames },
                    ].map(({ title, data, names }) => {
                      const rows = Object.entries(data).sort((a, b) => b[1] - a[1])
                      return rows.length ? (
                        <BarChart
                          key={title}
                          title={title}
                          description={title}
                          categories={rows.map(([k]) => (names as Record<string, string>)[k] ?? k)}
                          series={[{ name: title, data: rows.map(([, n]) => n) }]}
                          orientation="horizontal"
                          decimals={0}
                          showValues
                          labels={chartLabels}
                          lang={lang}
                        />
                      ) : null
                    })}
                  </div>
                  <p className="ecl-u-type-paragraph" style={{ marginTop: 16 }}>
                    {minutes.format(sum.avgSeconds / 60)} {s.minutesShort} · {s.note}
                  </p>
                </>
              )
            })()
          )}
        </>
      )}
    </main>
  )
}
