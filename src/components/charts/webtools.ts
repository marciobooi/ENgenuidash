import type Highcharts from 'highcharts'

/**
 * Europa Webtools smart loader. Charts are rendered by the Webtools "charts" service,
 * which ships Highcharts under the European Commission's licence — so the app does not
 * bundle Highcharts itself (the npm package is a dev dependency for TypeScript types only).
 * Note: this needs network access to webtools.europa.eu.
 */
const LOAD_JS = 'https://webtools.europa.eu/load.js'

export interface WebtoolsChartParams {
  service: 'charts'
  version: '2.0'
  provider: 'highcharts'
  /** Two-letter language code; Webtools translates its chart UI and accessibility texts. */
  lang: string
  /** Webtools' own context menu (pdf/xls/png/csv). Empty: the chart card has its own actions. */
  menu: string[]
  /** Extra Highcharts modules served by Webtools, e.g. ['heatmap'] or ['map']. */
  plugins?: string[]
  options?: Record<string, unknown>
  /** Highcharts configuration. */
  data: Highcharts.Options
  ready: (chart: Highcharts.Chart) => void
}

interface Webtools {
  render(container: Element, params: WebtoolsChartParams): void
}

declare global {
  interface Window {
    $wt?: Webtools
  }
}

let loading: Promise<Webtools> | null = null

/** Loads load.js once and resolves when `$wt` is ready to render. */
export function loadWebtools(timeoutMs = 15000): Promise<Webtools> {
  if (window.$wt?.render) return Promise.resolve(window.$wt)
  loading ??= new Promise<Webtools>((resolve, reject) => {
    const started = performance.now()
    const waitForWt = () => {
      if (window.$wt?.render) resolve(window.$wt)
      else if (performance.now() - started > timeoutMs) reject(new Error('Webtools did not initialise in time.'))
      else window.setTimeout(waitForWt, 50)
    }

    if (document.querySelector(`script[src="${LOAD_JS}"]`)) return waitForWt()
    const script = document.createElement('script')
    script.src = LOAD_JS
    script.async = true
    script.onload = waitForWt
    script.onerror = () => reject(new Error('Could not load Europa Webtools.'))
    document.head.appendChild(script)
  }).catch((err) => {
    loading = null // allow a retry later
    throw err
  })
  return loading
}

/**
 * Destroys a Webtools chart safely. Webtools keeps using the chart right after calling `ready`
 * (Highcharts' destroy() deletes chart.options, so Webtools then fails with "Cannot read
 * properties of undefined (reading 'chart')"). Destroy only after the current task has finished.
 */
export function destroyChart(chart: Highcharts.Chart) {
  window.setTimeout(() => {
    try {
      if (chart.options) chart.destroy()
    } catch {
      // already destroyed
    }
  }, 0)
}

const pluginLoads = new Map<string, Promise<void>>()

/**
 * Makes sure a Webtools-served Highcharts module (e.g. "map") is loaded, by rendering a tiny
 * hidden chart that requests it. Webtools always builds charts with Highcharts.chart(); maps need
 * Highcharts.mapChart(), which becomes available (under the same EC licence) once the module is in.
 * The probe chart is kept (hidden, 10 px): Webtools may still use it after `ready`, and
 * destroying it there breaks Webtools.
 */
export function ensurePlugin(plugin: string): Promise<void> {
  let pending = pluginLoads.get(plugin)
  if (!pending) {
    pending = loadWebtools().then(
      (wt) =>
        new Promise<void>((resolve, reject) => {
          const host = document.createElement('div')
          host.setAttribute('aria-hidden', 'true')
          // inert: the hidden chart's buttons and points must not take keyboard focus.
          host.setAttribute('inert', '')
          host.style.cssText = 'position:absolute;left:-9999px;top:0;width:10px;height:10px;overflow:hidden'
          document.body.appendChild(host)
          const timer = window.setTimeout(() => {
            host.remove()
            reject(new Error(`Webtools did not load the "${plugin}" module in time.`))
          }, 15000)
          wt.render(host, {
            service: 'charts',
            version: '2.0',
            provider: 'highcharts',
            lang: 'en',
            menu: [],
            plugins: [plugin],
            options: { logo: { visible: false } },
            data: { chart: { type: 'line' }, title: { text: '' }, series: [] },
            ready: () => {
              window.clearTimeout(timer)
              resolve()
            },
          })
        }),
    )
    pending.catch(() => pluginLoads.delete(plugin))
    pluginLoads.set(plugin, pending)
  }
  return pending
}

/** The Highcharts namespace provided by Webtools (after load.js and the needed modules). */
export function webtoolsHighcharts(): { mapChart?: (el: HTMLElement, o: unknown) => Highcharts.Chart } | undefined {
  return (window as unknown as { Highcharts?: { mapChart?: (el: HTMLElement, o: unknown) => Highcharts.Chart } }).Highcharts
}
