export interface SeriesInput {
  name: string
  data: (number | null)[]
}

export interface ValueFormat {
  /** Appended to values in tooltips and labels, e.g. " GWh" or "%". */
  valueSuffix?: string
  /** Decimals shown in tooltips and labels. */
  decimals?: number
}

/** Dashed reference line (e.g. an average or the EU-27 value), labelled on the plot. */
export interface ReferenceLine {
  value: number
  label: string
}

export function referencePlotLine(ref: ReferenceLine | undefined, inverted = false) {
  if (!ref) return []
  return [
    {
      value: ref.value,
      color: 'var(--ecl-color-dark-60)',
      dashStyle: 'Dash' as const,
      width: 1.5,
      zIndex: 5,
      // Horizontal bars: the line is vertical, so keep the label upright at its top.
      label: inverted
        ? { text: ref.label, rotation: 0, align: 'left' as const, verticalAlign: 'top' as const, x: 4, y: 12, style: { color: 'var(--ecl-color-dark-80)', fontSize: '11px' } }
        : { text: ref.label, style: { color: 'var(--ecl-color-dark-80)', fontSize: '11px' } },
    },
  ]
}

/** Soft band behind one category (the period the question is about). */
export function highlightPlotBand(categories: (string | number)[], highlight: string | undefined) {
  const i = highlight ? categories.map(String).indexOf(highlight) : -1
  if (i < 0) return []
  return [{ from: i - 0.5, to: i + 0.5, color: 'rgba(14, 71, 203, 0.08)', zIndex: 0 }]
}
