import type Highcharts from 'highcharts'
import { useEffect, useRef, type RefObject } from 'react'
import { destroyChart, ensurePlugin, loadWebtools, webtoolsHighcharts } from './webtools'

export type ChartStatus = 'loading' | 'ready' | 'error'

/**
 * Renders a Highcharts configuration through the Europa Webtools charts service.
 * Creates the chart once, updates it in place when options change, destroys it on unmount.
 */
export function WebtoolsChart({
  options,
  lang,
  chartRef,
  onStatus,
  retryKey = 0,
  plugins,
  kind = 'chart',
}: {
  options: Highcharts.Options
  lang: string
  /** Receives the chart instance (e.g. for export / data-table actions). */
  chartRef?: RefObject<Highcharts.Chart | null>
  onStatus?: (status: ChartStatus, error?: string) => void
  /** Change to re-attempt rendering after an error. */
  retryKey?: number
  /** Extra Webtools Highcharts modules (e.g. ['heatmap']). */
  plugins?: string[]
  /** 'map' draws with Highcharts.mapChart (choropleths). */
  kind?: 'chart' | 'map'
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<Highcharts.Chart | null>(null)
  const optionsRef = useRef(options)
  const onStatusRef = useRef(onStatus)

  useEffect(() => {
    optionsRef.current = options
    onStatusRef.current = onStatus
  })

  // A stable key: a new plugins array on every render must not re-create the chart.
  const pluginKey = (plugins ?? []).join(',')

  // Create (or re-create when the language changes, since Webtools localises at render time).
  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    if (!container) return
    onStatusRef.current?.('loading')

    const done = (chart: Highcharts.Chart) => {
      if (cancelled) {
        // Called from inside Webtools' render: destroying now would break Webtools.
        destroyChart(chart)
        return
      }
      instanceRef.current = chart
      if (chartRef) chartRef.current = chart
      onStatusRef.current?.('ready')
    }

    if (kind === 'map') {
      // Maps: load Webtools' map module, then draw with Highcharts.mapChart from that same build.
      ensurePlugin('map')
        .then(() => {
          if (cancelled) return
          const H = webtoolsHighcharts()
          if (!H?.mapChart) throw new Error('The map module is not available.')
          done(H.mapChart(container, optionsRef.current))
        })
        .catch((err: Error) => {
          if (!cancelled) onStatusRef.current?.('error', err.message)
        })
      return () => {
        cancelled = true
        if (instanceRef.current) destroyChart(instanceRef.current)
        instanceRef.current = null
        if (chartRef) chartRef.current = null
        container.innerHTML = ''
      }
    }

    loadWebtools()
      .then((wt) => {
        if (cancelled) return
        wt.render(container, {
          service: 'charts',
          version: '2.0',
          provider: 'highcharts',
          lang,
          menu: [],
          ...(pluginKey ? { plugins: pluginKey.split(',') } : {}),
          options: { logo: { visible: false } },
          data: optionsRef.current,
          ready: done,
        })
      })
      .catch((err: Error) => {
        if (!cancelled) onStatusRef.current?.('error', err.message)
      })

    return () => {
      cancelled = true
      if (instanceRef.current) destroyChart(instanceRef.current)
      instanceRef.current = null
      if (chartRef) chartRef.current = null
      container.innerHTML = ''
    }
  }, [lang, chartRef, retryKey, kind, pluginKey])

  // Apply later option changes to the live chart.
  useEffect(() => {
    instanceRef.current?.update(options, true, true)
  }, [options])

  return (
<div ref={containerRef} className="chart-card__plot" />
  )
}
