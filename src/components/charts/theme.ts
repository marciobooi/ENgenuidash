/**
 * Categorical palette built from ECL-leaning hues. Validated with the dataviz
 * palette checker (light surface): lightness band, chroma floor, normal-vision
 * separation and 3:1 contrast all pass; adjacent CVD separation is in the 6–8
 * floor band, so charts always add secondary encoding (legend + direct labels,
 * 2px gaps between fills). Assign in this order; never cycle or reorder by rank.
 */
export const PALETTE = ['#2F55C8', '#B07E0E', '#C0266A', '#1C9C8C', '#7A3FD0', '#4A8FE0'] as const

/** Charts support at most this many series before folding into "Other". */
export const MAX_SERIES = PALETTE.length

export const CHART_FONT = 'arial, sans-serif'

/** Text never takes the series colour. */
export const INK = {
  primary: '#191d26', // --ecl-color-dark-100
  secondary: '#515560', // --ecl-color-dark-80
  muted: '#7d8088', // --ecl-color-dark-60
}

/** Fill gap between adjacent marks, matching the card surface. */
export const SURFACE = '#ffffff'

/** Sequential ECL-blue ramp (light → dark) for magnitudes on maps and heatmaps. */
export const SEQUENTIAL_STOPS: [number, string][] = [
  [0, '#e7edfa'], // --ecl-color-primary-10
  [0.5, '#6e91e0'], // --ecl-color-primary-60
  [1, '#0a328e'], // --ecl-color-primary-160
]

/** Muted and highlight colours for "one period stands out" bar charts. */
export const MUTED_BAR = '#cfdaf5' // --ecl-color-primary-20
export const HIGHLIGHT_BAR = '#0b39a2' // --ecl-color-primary-140
