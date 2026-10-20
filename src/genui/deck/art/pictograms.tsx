/* eslint-disable react-refresh/only-export-components -- data modules: the art and its catalogue, not components for fast refresh */
import type { ReactNode } from 'react'

/**
 * The energy pictograms of the presentation: line drawings on a 64 x 64 grid, one colour (currentColor), no text.
 * Each has an id (see registry.ts) so a slide can ask for "wind-turbine" by name, from the data or from a model.
 */
const P = (children: ReactNode) => (
  <svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
)

export const PICTOGRAMS: Record<string, () => ReactNode> = {
  'wind-turbine': () => P(<><path d="M32 30v28M24 58h16" /><circle cx="32" cy="27" r="3" /><path d="M32 24V6M34.6 28.5l15.5 9M29.4 28.5l-15.5 9" /></>),
  'solar-panel': () => P(<><path d="M12 38l6-18h30l6 18z" /><path d="M16 29h34M26 20l-3 18M38 20l3 18M32 38v14M22 54h20" /><circle cx="52" cy="10" r="4" /><path d="M52 2v2M60 10h-2M46 4l1.5 1.5" /></>),
  'hydro-dam': () => P(<><path d="M8 14h20l4 30H12z" /><path d="M28 14h8v34" /><path d="M32 44c4-3 8 3 12 0s8 3 12 0M32 52c4-3 8 3 12 0s8 3 12 0" /><path d="M4 56h56" /></>),
  geothermal: () => P(<><path d="M6 40h52M10 58h44" /><path d="M20 38c-4-6 4-8 0-14s4-8 0-14M32 38c-4-6 4-8 0-14s4-8 0-14M44 38c-4-6 4-8 0-14s4-8 0-14" /><path d="M14 46l8 6 6-4 8 6" /></>),
  biomass: () => P(<><rect x="6" y="36" width="36" height="16" rx="8" /><circle cx="42" cy="44" r="5" /><circle cx="42" cy="44" r="1.5" /><path d="M44 28c0-10 8-16 18-16 0 10-6 18-16 18" /><path d="M44 28l10-10" /></>),
  biogas: () => P(<><path d="M12 24c0-4 40-4 40 0v26c0 4-40 4-40 0z" /><path d="M12 24c0 4 40 4 40 0" /><path d="M32 18V8h14" /><path d="M20 38h24" /></>),
  'heat-pump': () => P(<><rect x="8" y="14" width="40" height="36" rx="5" /><circle cx="28" cy="32" r="10" /><path d="M28 32v-7M28 32l6 3.5M28 32l-6 3.5" /><path d="M52 22h8M56 18l4 4-4 4M60 42h-8M56 38l-4 4 4 4" /></>),
  'gas-flame': () => P(<><path d="M32 6c2 8 14 14 14 28a14 14 0 0 1-28 0c0-6 3-9 6-12 0 4 2 6 4 6 2-8 0-14 4-22z" /><path d="M32 58a6 6 0 0 1-6-6c0-4 4-6 6-10 2 4 6 6 6 10a6 6 0 0 1-6 6z" /></>),
  'oil-barrel': () => P(<><path d="M32 4c4 5 7 9 7 12a7 7 0 0 1-14 0c0-3 3-7 7-12z" /><path d="M14 24h36v32H14z" /><path d="M14 32h36M14 48h36" /></>),
  coal: () => P(<><path d="M8 52l6-14 14-4 8 10-4 10z" /><path d="M28 34l6-14 14 4 6 14-12 10-4-4" /><path d="M14 38l14 0M34 20l6 14" /></>),
  nuclear: () => P(<><circle cx="32" cy="32" r="4" /><ellipse cx="32" cy="32" rx="26" ry="10" /><ellipse cx="32" cy="32" rx="26" ry="10" transform="rotate(60 32 32)" /><ellipse cx="32" cy="32" rx="26" ry="10" transform="rotate(120 32 32)" /></>),
  pylon: () => P(<><path d="M32 4l-12 54M32 4l12 54M26 30h12M22 46h20M25 18h14" /><path d="M20 58h24M4 18h56M4 18v6M60 18v6M14 18v6M50 18v6" /></>),
  plug: () => P(<><path d="M20 6v14M44 6v14" /><path d="M12 20h40v10a20 20 0 0 1-40 0z" /><path d="M32 50v12" /></>),
  battery: () => P(<><rect x="6" y="18" width="48" height="28" rx="4" /><path d="M54 27h5v10h-5" /><path d="M30 24l-6 9h10l-6 9" /></>),
  'electric-car': () => P(<><path d="M6 42v-8l6-4 6-12h24l8 12 6 2v10z" /><circle cx="18" cy="44" r="5" /><circle cx="46" cy="44" r="5" /><path d="M26 28l-4 6h8l-4 6" /></>),
  house: () => P(<><path d="M6 30L32 8l26 22" /><path d="M12 26v30h40V26" /><path d="M26 56V40h12v16" /></>),
  factory: () => P(<><path d="M6 56V30l14 8V30l14 8V30l14 8V14h10v42z" /><path d="M6 56h52M16 48h6M30 48h6M44 48h6" /><path d="M52 8c0-3 4-3 4-6" /></>),
  tanker: () => P(<><path d="M4 38h52l-6 14H12z" /><path d="M14 38V26h10v12M30 38V30h18v8" /><path d="M4 58c4-3 8 3 12 0s8 3 12 0 8 3 12 0 8 3 12 0" /></>),
  pipeline: () => P(<><path d="M4 28h56v12H4z" /><path d="M16 28v12M48 28v12" /><path d="M32 28V14M24 14h16" /><path d="M4 52h8M24 52h8M44 52h8" /></>),
  thermometer: () => P(<><path d="M26 36V10a6 6 0 0 1 12 0v26a12 12 0 1 1-12 0z" /><circle cx="32" cy="46" r="5" /><path d="M32 41V18" /><path d="M44 14h8M44 22h6M44 30h8" /></>),
  'euro-coin': () => P(<><circle cx="32" cy="32" r="26" /><path d="M42 22a12 12 0 1 0 0 20" /><path d="M16 28h20M16 36h20" /></>),
  shield: () => P(<><path d="M32 4l22 8v18c0 14-9 24-22 30C19 54 10 44 10 30V12z" /><path d="M22 32l7 7 13-14" /></>),
  'light-bulb': () => P(<><path d="M22 44c0-4-8-8-8-18a18 18 0 0 1 36 0c0 10-8 14-8 18z" /><path d="M24 52h16M27 58h10" /><path d="M32 2v-0M6 14l4 3M58 14l-4 3M4 28h4M56 28h4" /></>),
  family: () => P(<><circle cx="20" cy="12" r="6" /><path d="M10 58V32a10 10 0 0 1 20 0v26" /><circle cx="46" cy="26" r="5" /><path d="M38 58V42a8 8 0 0 1 16 0v16" /></>),
}
