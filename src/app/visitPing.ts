/**
 * Anonymous visit counting and usage events, for the pilot's page statistics (#/pagestats). It is
 * only in the pilot's test build (VITE_STATS=1): the production build has none of it. While a page is
 * open and visible it sends a tiny ping every 30 seconds: a random number that exists only for that
 * page load (never stored, no cookie, no profile), the seconds the page has been visible, and the
 * language. `track` adds what was done, as a short fixed name ("ask:dashboard", "filter"): never what
 * was typed, never a country or a number. The server keeps these in a log of its own without IP
 * addresses and turns them into daily numbers (docs/test-server-revert.txt, "Page statistics").
 * Off for "Do Not Track", on localhost, and on the statistics page itself.
 */
const BEAT_MS = 30_000
let sender: ((name: string, detail?: string) => void) | null = null

/** Records something done ("ask", "dash:profile"): a short fixed name only (letters, digits, "_" and "-"). A no-op outside the pilot. */
export function track(name: string, detail?: string) {
  const clean = (x: string) => x.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32)
  if (sender && clean(name)) sender(clean(name), detail ? clean(detail) : undefined)
}

const randomId = () => {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function startVisitPing(lang: string): () => void {
  const off = () => undefined
  if (import.meta.env.VITE_STATS !== '1' || typeof window === 'undefined') return off
  if (navigator.doNotTrack === '1' || ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return off
  if (window.location.hash.startsWith('#/pagestats')) return off

  const id = randomId()
  let active = 0
  let ended = false
  const post = (url: string) => {
    // (a beacon survives the page closing; fetch is the fallback)
    if (!(navigator.sendBeacon && navigator.sendBeacon(url))) void fetch(url, { method: 'POST', keepalive: true }).catch(() => undefined)
  }
  const send = (event: 'start' | 'beat' | 'end') => post(`${import.meta.env.BASE_URL}ping?v=${id}&e=${event}&a=${active}&l=${encodeURIComponent(lang)}`)
  sender = (name, detail) => post(`${import.meta.env.BASE_URL}ping?v=${id}&e=ev&n=${name}${detail ? `&d=${detail}` : ''}`)

  send('start')
  // The seconds the page was visible (a tab in the background does not count as time spent).
  const tick = window.setInterval(() => {
    if (document.visibilityState === 'visible') active += 1
  }, 1000)
  const beat = window.setInterval(() => send('beat'), BEAT_MS)
  const end = () => {
    if (ended) return
    ended = true
    send('end')
  }
  const onHide = () => (document.visibilityState === 'hidden' ? send('beat') : undefined)
  window.addEventListener('pagehide', end)
  document.addEventListener('visibilitychange', onHide)
  return () => {
    sender = null
    window.clearInterval(tick)
    window.clearInterval(beat)
    window.removeEventListener('pagehide', end)
    document.removeEventListener('visibilitychange', onHide)
  }
}
