/**
 * Totals of parts over time (a country's electricity from all its sources, a mix's "total shown")
 * that compare like with like. A period counts only when every part the latest complete period
 * has is there too: a total from fewer parts (a source not yet reported in 1990) would look
 * like a huge rise ("+606,710% since 1990"). Other periods are null (no value), not a small sum.
 *
 * `parts[i][t]`: part i in period t (null = no value).
 */
export function comparableSum(parts: (number | null)[][]): (number | null)[] {
  const periods = parts[0]?.length ?? 0
  const count = (t: number) => parts.filter((p) => p[t] != null).length
  // The parts of the latest period decide, unless that period is provisional (fewer parts than
  // the one before): then the one before. A part that stopped years ago (coal after a closure)
  // is not required; it still counts in the periods it was there.
  let ref = periods - 1
  while (ref >= 0 && count(ref) === 0) ref--
  if (ref < 0) return Array.from({ length: periods }, () => null)
  if (ref > 0 && count(ref) < count(ref - 1)) ref--
  const required = parts.filter((p) => p[ref] != null)
  return Array.from({ length: periods }, (_, t) =>
    required.every((p) => p[t] != null) ? parts.reduce<number>((n, p) => n + (p[t] ?? 0), 0) : null,
  )
}
