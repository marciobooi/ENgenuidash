/**
 * The axis limit for changes with an outlier: at least 5 values, and the largest more than five
 * times the 90th percentile of their sizes. Null when the values are ordinary.
 */
export function outlierCap(values: (number | null)[]): number | null {
  const sizes = values.filter((v): v is number => v != null && Number.isFinite(v)).map(Math.abs).sort((a, b) => a - b)
  if (sizes.length < 5) return null
  const p90 = sizes[Math.floor((sizes.length - 1) * 0.9)]
  const max = sizes[sizes.length - 1]
  return p90 > 0 && max > 5 * p90 ? p90 * 1.5 : null
}
