/**
 * Chart texts Webtools does not get right. Webtools localises the charts it renders, but some of
 * its translations close their templates with "{/eq }" (a space before the brace), which
 * Highcharts does not recognise, so screen-reader texts read out "{#eq series.points.length 1}
 * point{else}points{/eq }". Maps are drawn with Highcharts.mapChart directly (see
 * WebtoolsChart.tsx), without Webtools' translations: their texts are set here.
 */

type LangTree = { [key: string]: string | LangTree | unknown }

interface HighchartsGlobal {
  getOptions(): { lang?: LangTree }
  setOptions(options: { lang: LangTree }): void
}

/** Rewrites "{/eq }" (and any other helper) to "{/eq}", in place. True when something changed. */
export function repairTemplates(tree: LangTree): boolean {
  let changed = false
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') {
      const fixed = value.replace(/\{\/(\w+)\s+\}/g, '{/$1}')
      if (fixed !== value) {
        tree[key] = fixed
        changed = true
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      changed = repairTemplates(value as LangTree) || changed
    }
  }
  return changed
}

/** Repairs the templates in the Highcharts texts in use (called before and after each render). */
export function repairChartLang(): boolean {
  const H = (window as unknown as { Highcharts?: HighchartsGlobal }).Highcharts
  const lang = H?.getOptions?.().lang
  return lang ? repairTemplates(lang) : false
}

/** Map texts per language (English: Highcharts' own, set back after another language). */
const MAP_LANG: Record<string, LangTree> = {
  en: {
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    resetZoom: 'Reset zoom',
    accessibility: {
      defaultChartTitle: 'Chart',
      chartContainerLabel: '{title}. Highcharts interactive chart.',
      viewAsDataTableButtonText: 'View as data table, {chartTitle}',
      zoom: { mapZoomIn: 'Zoom chart', mapZoomOut: 'Zoom out chart', resetZoomButton: 'Reset zoom' },
      screenReaderSection: { endOfChartMarker: 'End of interactive chart.' },
      chartTypes: {
        unknownMap: 'Map of unspecified region',
        mapTypeDescription: 'Map of {mapTitle} with {numSeries} data series.',
      },
      series: { nullPointValue: 'No value' },
      legend: { legendLabel: 'Chart legend: {legendTitle}', legendLabelNoTitle: 'Toggle series visibility, {chartTitle}' },
    },
  },
  de: {
    zoomIn: 'Vergrößern',
    zoomOut: 'Verkleinern',
    resetZoom: 'Zoom zurücksetzen',
    accessibility: {
      defaultChartTitle: 'Diagramm',
      chartContainerLabel: '{title}. Interaktives Diagramm.',
      viewAsDataTableButtonText: 'Als Datentabelle anzeigen, {chartTitle}',
      zoom: { mapZoomIn: 'Karte vergrößern', mapZoomOut: 'Karte verkleinern', resetZoomButton: 'Zoom zurücksetzen' },
      screenReaderSection: { endOfChartMarker: 'Ende des interaktiven Diagramms.' },
      chartTypes: {
        unknownMap: 'Karte einer nicht angegebenen Region',
        mapTypeDescription: 'Karte von {mapTitle} mit {numSeries} Datenreihen.',
      },
      series: { nullPointValue: 'Kein Wert' },
      legend: { legendLabel: 'Diagrammlegende: {legendTitle}', legendLabelNoTitle: 'Datenreihe ein- oder ausblenden, {chartTitle}' },
    },
  },
  fr: {
    zoomIn: 'Zoom avant',
    zoomOut: 'Zoom arrière',
    resetZoom: 'Réinitialiser le zoom',
    accessibility: {
      defaultChartTitle: 'Graphique',
      chartContainerLabel: '{title}. Graphique interactif.',
      viewAsDataTableButtonText: 'Afficher sous forme de tableau, {chartTitle}',
      zoom: { mapZoomIn: 'Agrandir la carte', mapZoomOut: 'Réduire la carte', resetZoomButton: 'Réinitialiser le zoom' },
      screenReaderSection: { endOfChartMarker: 'Fin du graphique interactif.' },
      chartTypes: {
        unknownMap: 'Carte d’une région non précisée',
        mapTypeDescription: 'Carte de {mapTitle} avec {numSeries} séries de données.',
      },
      series: { nullPointValue: 'Aucune valeur' },
      legend: { legendLabel: 'Légende du graphique : {legendTitle}', legendLabelNoTitle: 'Afficher ou masquer une série, {chartTitle}' },
    },
  },
}

/** Sets the map texts for a language before a map is drawn (Highcharts reads them globally). */
export function applyMapLang(lang: string) {
  const H = (window as unknown as { Highcharts?: HighchartsGlobal }).Highcharts
  const texts = MAP_LANG[lang]
  if (H?.setOptions && texts) H.setOptions({ lang: texts })
  repairChartLang()
}
