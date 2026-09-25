/**
 * Messages the app did not handle well, kept in this browser only (development builds): refused,
 * asked to rephrase, not understood, offered as buttons, or no data. The #/eval page lists them
 * and copies them as test cases, so real misunderstandings become labelled tests.
 * Nothing is sent anywhere.
 */

export type MissKind = 'refused' | 'rephrase' | 'unclear' | 'buttons' | 'nodata'

export interface Miss {
  text: string
  lang: string
  kind: MissKind
  /** Whether a dashboard was on screen (follow-up) or not (first question). */
  followUp: boolean
  at: string
}

const KEY = 'engenuidash.misses'
const MAX = 200

export function readMisses(): Miss[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Miss[]
  } catch {
    return []
  }
}

export function recordMiss(miss: Omit<Miss, 'at'>) {
  if (!import.meta.env.DEV) return
  try {
    const all = readMisses().filter((m) => m.text !== miss.text)
    all.unshift({ ...miss, at: new Date().toISOString() })
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, MAX)))
  } catch {
    // Storage blocked or full: the log is a convenience only.
  }
}

export function clearMisses() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

/**
 * The misses as test cases to paste into src/eval/cases.ts (follow-ups) or answerCases.ts (first
 * questions), with a TODO where the expected result must be filled in.
 */
export function missesAsCases(misses: Miss[]): string {
  const followUps = misses.filter((m) => m.followUp)
  const questions = misses.filter((m) => !m.followUp)
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return [
    '// src/eval/cases.ts (follow-ups on the sample dashboard)',
    ...followUps.map((m) => `{ lang: '${m.lang}', text: '${esc(m.text)}', expect: 'TODO' }, // was: ${m.kind}`),
    '',
    '// src/eval/answerCases.ts (first questions)',
    ...questions.map((m) => `{ q: '${esc(m.text)}', lang: '${m.lang}', expect: { route: 'TODO' } }, // was: ${m.kind}`),
  ].join('\n')
}
