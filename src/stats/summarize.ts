/** What the server writes to stats.json every few minutes from the anonymous pings and events (docs/test-server-revert.txt, "Page statistics"). */
export interface Stats {
  generated: string
  /** Pages with a ping in the last 90 seconds. */
  online: number
  days: {
    date: string
    visits: number
    avgSeconds: number
    over60: number
    under10: number
    langs: Record<string, number>
    /** Visits that asked at least one question, and the questions asked. */
    askers: number
    /** Interactions of the day: "name" or "name:detail" → how many (see app/visitPing.ts). */
    events: Record<string, number>
  }[]
  /** Visits per hour, the last 24 hours (UTC hours, "YYYY-MM-DDTHH"). */
  hours: { hour: string; visits: number }[]
}

/** Totals and shares from the days: the figures of the cards. */
export function summarize(stats: Stats) {
  const sum = (days: Stats['days']) => days.reduce((a, d) => a + d.visits, 0)
  const all = stats.days
  const visits = sum(all)
  const total = (name: string) => all.reduce((a, d) => a + (d.events[name] ?? 0), 0)
  // "name:detail" events of one name, added up over the days.
  const byDetail = (name: string) => {
    const out: Record<string, number> = {}
    for (const d of all) for (const [k, n] of Object.entries(d.events)) if (k.startsWith(`${name}:`)) out[k.slice(name.length + 1)] = (out[k.slice(name.length + 1)] ?? 0) + n
    return out
  }
  const asks = Object.values(byDetail('ask')).reduce((a, n) => a + n, 0)
  const unclear = byDetail('ask').unclear ?? 0
  return {
    today: stats.days.at(-1)?.visits ?? 0,
    week: sum(all.slice(-7)),
    month: sum(all.slice(-30)),
    visits,
    avgSeconds: visits ? all.reduce((a, d) => a + d.avgSeconds * d.visits, 0) / visits : 0,
    over60Pct: visits ? (100 * all.reduce((a, d) => a + d.over60, 0)) / visits : 0,
    askersPct: visits ? (100 * all.reduce((a, d) => a + d.askers, 0)) / visits : 0,
    asks,
    asksPerAsker: all.reduce((a, d) => a + d.askers, 0) ? asks / all.reduce((a, d) => a + d.askers, 0) : 0,
    unclearPct: asks ? (100 * unclear) / asks : 0,
    outcomes: byDetail('ask'),
    dashboards: byDetail('dash'),
    actions: Object.fromEntries(['filter', 'suggest', 'choice', 'compare', 'switch', 'history', 'share', 'table', 'png', 'csv', 'explain', 'lang', 'newchat'].map((n) => [n, total(n)]).filter(([, n]) => (n as number) > 0)) as Record<string, number>,
    langs: all.reduce<Record<string, number>>((acc, d) => {
      for (const [l, n] of Object.entries(d.langs)) acc[l] = (acc[l] ?? 0) + n
      return acc
    }, {}),
  }
}
