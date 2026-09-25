import type Highcharts from 'highcharts'
import { CHART_FONT, INK } from './theme'

/**
 * Shared look applied to every chart (merged under each chart's own options).
 * Several entries exist only to cancel Webtools defaults — see the "Webtools overrides" notes.
 */
export const BASE_OPTIONS: Highcharts.Options = {
  chart: {
    style: { fontFamily: CHART_FONT },
    backgroundColor: 'transparent',
    spacing: [8, 4, 8, 4],
  },
  credits: { enabled: false },
  exporting: {
    // Everything is rendered client-side; nothing is sent to the Highcharts export server.
    fallbackToExportServer: false,
    // Webtools override: it shows the data table under every chart by default;
    // ours is opened on demand from the card's "Show data table" button.
    showTable: false,
    // The card header renders its own accessible, translatable export buttons.
    buttons: { contextButton: { enabled: false } },
  },
  legend: {
    itemStyle: { color: INK.secondary, fontWeight: '400', fontSize: '13px' },
    itemHoverStyle: { color: INK.primary },
    symbolRadius: 3,
  },
  tooltip: {
    backgroundColor: '#fff',
    borderColor: 'var(--ecl-color-dark-20)',
    borderRadius: 10,
    shadow: { color: 'rgba(25,29,38,0.12)', offsetX: 0, offsetY: 4, width: 12 },
    style: { color: INK.primary, fontSize: '13px' },
    padding: 10,
  },
  xAxis: {
    lineColor: 'var(--ecl-color-dark-20)',
    tickColor: 'var(--ecl-color-dark-20)',
    // Webtools override: it forces `step: 1` (every label drawn, even when they collide).
    // 0 restores Highcharts' automatic label thinning.
    labels: { step: 0, style: { color: INK.secondary, fontSize: '12px' } },
    title: { style: { color: INK.secondary } },
  },
  yAxis: {
    gridLineColor: 'var(--ecl-color-dark-10)',
    labels: { style: { color: INK.secondary, fontSize: '12px' } },
    title: { style: { color: INK.secondary, fontWeight: '400' } },
  },
  accessibility: {
    enabled: true,
    keyboardNavigation: { enabled: true },
    // One landmark per chart: series are not regions of their own (two charts of the same series
    // would otherwise have identical landmarks).
    landmarkVerbosity: 'one',
    // The card title is an <h3>; the chart's screen-reader summary heading comes right under it
    // (Highcharts otherwise guesses <h6>, which skips heading levels).
    screenReaderSection: {
      beforeChartFormat:
        '<h4>{chartTitle}</h4><div>{typeDescription}</div><div>{chartSubtitle}</div><div>{chartLongdesc}</div><div>{viewTableButton}</div><div>{xAxisDescription}</div><div>{yAxisDescription}</div>',
    },
  },
  // Webtools override: it replaces this with a <500px rule that bumps axis and data labels
  // to 14px and the title to 20px. Ours keeps the same scale, just slightly smaller.
  responsive: {
    rules: [
      {
        condition: { maxWidth: 500 },
        chartOptions: {
          chart: { spacing: [8, 0, 8, 0] },
          legend: { itemStyle: { fontSize: '12px' } },
          xAxis: { labels: { style: { fontSize: '11px' } } },
          yAxis: { labels: { style: { fontSize: '11px' } } },
          plotOptions: { series: { dataLabels: { style: { fontSize: '11px', fontWeight: '400' } } } },
        },
      },
    ],
  },
}
