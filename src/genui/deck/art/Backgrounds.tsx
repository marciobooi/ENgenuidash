/** The three backgrounds of the presentation: soft waves, a yellow shape, and the Eurostat ribbon. Decoration only. */
import type { ReactElement } from 'react'

export const BACKGROUNDS: Record<string, () => ReactElement> = {
  'bg-wave': () => (
    <svg viewBox="0 0 1200 220" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 120C150 60 300 180 480 130S800 40 1000 110s160 50 200 20v90H0z" fill="#fff" opacity="0.28" />
      <path d="M0 160c180-50 330 40 520 0s380-70 680 10v50H0z" fill="#fff" opacity="0.4" />
    </svg>
  ),
  'bg-blob': () => (
    <svg viewBox="0 0 400 400" aria-hidden="true" focusable="false">
      <path d="M312 66c46 36 62 104 32 160s-96 96-160 96-112-60-120-120S48 82 112 48s154-18 200 18z" fill="#ffd617" />
    </svg>
  ),
}
