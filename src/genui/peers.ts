import type { Suggestion } from './types'

/**
 * Countries like this one: the two whose value on the ranked indicator is nearest, as chips that open the comparison
 * ("Similar: Spain (47.3 %)"). A number alone says little; the neighbours say where a country stands among its peers.
 */
export function peerChips(rank: { code: string; name: string; value: number }[], geo: string, label: (name: string, value: string) => string, compareWith: (code: string) => Suggestion['plan'], decimals = 1): Suggestion[] {
  const own = rank.find((x) => x.code === geo)
  if (!own) return []
  return rank
    .filter((x) => x.code !== geo && /^[A-Z]{2}$/.test(x.code))
    .sort((a, b) => Math.abs(a.value - own.value) - Math.abs(b.value - own.value))
    .slice(0, 2)
    .map((x) => ({ label: label(x.name, x.value.toFixed(decimals)), plan: compareWith(x.code) }))
}
