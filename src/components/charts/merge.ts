const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype

/** Deep-merges plain objects (later wins); arrays and other values are replaced, not merged. */
export function mergeOptions<T>(...sources: unknown[]): T {
  const out: Record<string, unknown> = {}
  for (const src of sources) {
    if (!isPlainObject(src)) continue
    for (const [key, value] of Object.entries(src)) {
      out[key] = isPlainObject(value) && isPlainObject(out[key]) ? mergeOptions(out[key], value) : value
    }
  }
  return out as T
}
