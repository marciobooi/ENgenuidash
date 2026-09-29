import type Highcharts from 'highcharts'

/**
 * Fallback for pages Europa Webtools refuses to serve (it only answers europa.eu and localhost:
 * any other domain, e.g. a demo link or a host without a whitelisted domain, gets a 403).
 * The charts are then drawn by the Highcharts npm package instead, loaded on demand in its own
 * chunk: visits where Webtools works never download it.
 */
type HighchartsModule = typeof Highcharts & { mapChart?: (el: HTMLElement, o: unknown) => Highcharts.Chart }

let loading: Promise<HighchartsModule> | null = null

export function loadOwnHighcharts(): Promise<HighchartsModule> {
  loading ??= (async () => {
    const H = (await import('highcharts')).default as HighchartsModule
    // Modules register themselves on the Highcharts they are loaded next to (v12).
    await Promise.all([
      import('highcharts/highcharts-more'), // columnrange (dumbbell), bubble
      import('highcharts/modules/accessibility'),
      import('highcharts/modules/exporting'),
      import('highcharts/modules/export-data'),
      import('highcharts/modules/offline-exporting'),
      import('highcharts/modules/heatmap'),
      import('highcharts/modules/map'),
    ])
    // The language helpers (chartLang.ts) read the global, as they do with Webtools' build.
    ;(window as unknown as { Highcharts?: unknown }).Highcharts = H
    console.info('[charts] Europa Webtools is not available on this domain: drawing with the bundled Highcharts.')
    return H
  })().catch((err) => {
    loading = null
    throw err
  })
  return loading
}

/** Options every fallback chart gets: no credits, and export stays in the browser (no export server). */
export function fallbackOptions(options: Highcharts.Options): Highcharts.Options {
  return {
    ...options,
    credits: { enabled: false },
    exporting: { ...options.exporting, fallbackToExportServer: false },
  }
}
