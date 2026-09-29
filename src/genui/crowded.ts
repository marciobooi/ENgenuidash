import type { WidgetSpec } from './types'

/** A bar chart with more categories than this is a column chart across the full row. */
export const MAX_BARS = 10

/**
 * A bar chart with many categories (a ranking of 27 countries) is a tall list that is hard to read
 * next to another chart: up to MAX_BARS it stays horizontal bars in half a row; beyond that it is
 * vertical columns across the full row.
 */
export const isCrowdedBar = (w: WidgetSpec): boolean => w.type === 'bar' && w.categories.length > MAX_BARS
