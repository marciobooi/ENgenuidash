/* eslint-disable react-refresh/only-export-components -- data modules: the art and its catalogue, not components for fast refresh */
import type { ReactNode } from 'react'
import { BACKGROUNDS } from './Backgrounds'
import { FLAGS, flagId } from './flags'
import { PICTOGRAMS } from './pictograms'
import { SCENES } from './scenes'
import { CountryShape } from './Shape'

/** The Eurostat ribbon (a file of the project; resolved by the bundler, and by node in the tests). */
const ribbon = new URL('../../../assets/banner-graphical-element.svg', import.meta.url).href

/**
 * The art of the presentation, each piece with an id: 24 energy pictograms and 31 flags. A slide names the art it wants
 * by id (DashboardSpec.art, KpiSpec.art); when it does not, matchArt() picks from the words of the slide (what the
 * figure measures) and flagId() from the places of the data. The catalogue (artCatalog, artPrompt) is what a language
 * model is shown to choose from, so the model picks ids and never draws.
 */
export interface ArtMeta {
  id: string
  kind: 'pictogram' | 'flag' | 'shape' | 'background' | 'scene'
  label: string
  /** Words (English, German, French) that call for this piece. */
  tags: string[]
}

const META: [string, string, string][] = [
  ['wind-turbine', 'Wind turbine', 'wind windkraft windenergie eolien éolien'],
  ['solar-panel', 'Solar panel', 'solar photovoltaic pv solaire sonne'],
  ['hydro-dam', 'Hydropower dam', 'hydro hydropower hydraulique wasserkraft'],
  ['geothermal', 'Geothermal steam', 'geothermal geothermie géothermie'],
  ['biomass', 'Wood and leaf', 'biomass biomasse wood holz bois pellets firewood solid'],
  ['biogas', 'Biogas tank', 'biogas biogaz'],
  ['heat-pump', 'Heat pump', 'heat pump heating cooling wärme warme chaleur froid ambient heizung'],
  ['gas-flame', 'Gas flame', 'gas gaz erdgas flame'],
  ['oil-barrel', 'Oil barrel', 'oil petroleum crude petrol diesel öl pétrole erdöl'],
  ['coal', 'Coal', 'coal kohle charbon solid fossil'],
  ['nuclear', 'Atom', 'nuclear atom kern nucléaire'],
  ['pylon', 'Power pylon', 'electricity grid network strom électricité netz generation'],
  ['plug', 'Plug', 'plug consumption power verbrauch consommation'],
  ['battery', 'Battery', 'battery storage stock stocks speicher stockage'],
  ['electric-car', 'Electric car', 'transport vehicle car mobility verkehr transports biofuel biofuels'],
  ['house', 'House', 'house household households home homes building buildings dwelling haushalt haushalte ménage bâtiment logement'],
  ['factory', 'Factory', 'industry industrial industrie'],
  ['tanker', 'Tanker', 'import imports export exports trade partner partners ship handel'],
  ['pipeline', 'Pipeline', 'pipeline supply lng'],
  ['thermometer', 'Thermometer', 'warm cold poverty temperature armut précarité arrears'],
  ['euro-coin', 'Euro coin', 'price prices cost costs euro tax taxes preis prix kosten'],
  ['shield', 'Shield', 'security secure resilience dependence independence sicherheit sécurité abhängigkeit dépendance'],
  ['light-bulb', 'Light bulb', 'efficiency saving savings intensity effizienz efficacité'],
  ['family', 'Family', 'people population family person capita'],
  ['leaf', 'Leaf', 'renewable renewables erneuerbare erneuerbarer renouvelables renouvelable share shares green overall anteil part'],
]

const EU27 = 'at be bg hr cy cz dk ee fi fr de el hu ie it lv lt lu mt nl pl pt ro sk si es se'.split(' ')
/** The outlines: the 27 Member States and the neighbours that have a flag here. */
const OUTLINED = [...EU27, 'no', 'is', 'tr', 'uk']
/** The illustrated scenes (scenes.ts, made by scripts/import-scenes.py), the first that matches a slide's words wins a tie. */
const SCENE_META: [string, string, string][] = [
  ['scene-oil-pumps', 'Oil pumps and wells', 'oil petroleum crude petrol diesel öl pétrole erdöl'],
  ['scene-hydro-dam', 'Hydroelectric dam', 'hydro hydropower hydraulique wasserkraft'],
  ['scene-biomass-geothermal', 'Biomass, biogas and geothermal', 'biomass biogas geothermal biomasse geothermie solid'],
  ['scene-wind-farm', 'Wind farm', 'wind renewable renewables erneuerbare erneuerbarer renouvelables renouvelable windkraft éolien eolien'],
  ['scene-solar-roof', 'Solar roof', 'solar photovoltaic capacity capacities buildings building gebäude bâtiments'],
  ['scene-household', 'Household energy', 'household households poverty warm homes home prices haushalte armut précarité ménages'],
  ['scene-city-industry', 'City and industry', 'industry efficiency consumption city sector sectors effizienz efficacité verbrauch'],
  ['scene-tanker-pipeline', 'Tanker and pipeline', 'trade imports import exports partner supply dependence third security abhängigkeit sicherheit dépendance'],
  ['scene-energy-mix', 'Energy mix', 'mix diversification diversity overall balance'],
]

const BG: [string, string][] = [['bg-wave', 'Soft waves'], ['bg-blob', 'Yellow shape'], ['bg-ribbon', 'Eurostat ribbon']]

export const ART: ArtMeta[] = [
  ...META.map(([id, label, tags]) => ({ id, kind: 'pictogram' as const, label, tags: tags.split(' ') })),
  ...Object.entries(FLAGS).map(([id, f]) => ({ id: `flag-${id}`, kind: 'flag' as const, label: f.name, tags: [f.name.toLowerCase(), id] })),
  ...OUTLINED.map((id) => ({ id: `shape-${id}`, kind: 'shape' as const, label: `${FLAGS[id].name} (outline)`, tags: [FLAGS[id].name.toLowerCase(), id] })),
  ...BG.map(([id, label]) => ({ id, kind: 'background' as const, label, tags: [] })),
  ...SCENE_META.map(([id, label, tags]) => ({ id, kind: 'scene' as const, label, tags: tags.split(' ') })),
]

/** The catalogue as data: what a model may choose from. */
export const artCatalog = (): { id: string; kind: ArtMeta['kind']; label: string }[] => ART.map(({ id, kind, label }) => ({ id, kind, label }))

/** The catalogue as a prompt text: "wind-turbine: Wind turbine (wind, windkraft…)" for the pictograms, the flag ids in one line. */
export const artPrompt = (): string =>
  [
    'Pictograms (id: what it shows; words that call for it):',
    ...ART.filter((a) => a.kind === 'pictogram').map((a) => `${a.id}: ${a.label} (${a.tags.slice(0, 4).join(', ')})`),
    `Flags (id "flag-" + the lower-case country code): ${ART.filter((a) => a.kind === 'flag').map((a) => a.id).join(', ')}`,
    `Country outlines filled with their flag ("shape-" + the lower-case code, the 27 Member States, no, is, tr, uk): ${ART.filter((a) => a.kind === 'shape').map((a) => a.id).join(', ')}`,
    `Backgrounds: ${ART.filter((a) => a.kind === 'background').map((a) => a.id).join(', ')}`,
    'Scenes (id: what it shows; words that call for it):',
    ...ART.filter((a) => a.kind === 'scene').map((a) => `${a.id}: ${a.label} (${a.tags.slice(0, 4).join(', ')})`),
  ].join('\n')

const known = new Set(ART.map((a) => a.id))
/** Only ids that exist (a model may invent one). */
export const knownArt = (ids: (string | undefined)[]): string[] => ids.filter((id): id is string => !!id && known.has(id))

/** The pictogram whose words are in the text, or undefined (the more of its words, the better; the first listed wins a tie). */
export function matchArt(text: string, kind: 'pictogram' | 'scene' = 'pictogram'): string | undefined {
  const t = ` ${text.toLowerCase().replace(/[^a-zäöüéèêàç0-9]+/g, ' ')} `
  let best: { id: string; score: number } | undefined
  for (const a of ART) {
    if (a.kind !== kind) continue
    // (a price or a dependence is what is measured, whatever fuel it is of: those count double)
    const hits = a.tags.filter((tag) => t.includes(` ${tag} `) || t.includes(` ${tag}s `)).length
    const score = a.id === 'euro-coin' || a.id === 'shield' ? hits * 2 : hits
    if (score > 0 && (!best || score > best.score)) best = { id: a.id, score }
  }
  return best?.id
}

/** The art ids of the places of a plan (a country, the one it is compared with). */
export const flagsOf = (geos: (string | string[] | undefined)[]): string[] => [...new Set(geos.flat().filter((g): g is string => !!g).map(flagId).filter((x): x is string => !!x))].map((x) => `flag-${x}`)

/** One piece of art by id: a pictogram in its box, a flag in its frame. Unknown ids draw nothing. */
export function Art({ id, className, label }: { id: string; className?: string; label?: string }): ReactNode {
  if (id.startsWith('shape-')) return <CountryShape code={id.slice(6)} className={className} label={label} />
  if (SCENES[id]) return <span className={className ?? 'art-scene'} role="img" aria-label={label ?? ART.find((a) => a.id === id)?.label} dangerouslySetInnerHTML={{ __html: SCENES[id].replace('<svg ', '<svg preserveAspectRatio="xMaxYMax meet" ') }} />
  if (id === 'bg-ribbon') return <img className={className ?? 'art-bg'} src={ribbon} alt="" />
  if (BACKGROUNDS[id]) return <span className={className ?? 'art-bg'}>{BACKGROUNDS[id]()}</span>
  if (id.startsWith('flag-')) {
    const f = FLAGS[id.slice(5)]
    if (!f) return null
    return (
      <svg className={className ?? 'art-flag'} viewBox="0 0 30 20" role="img" aria-label={label ?? f.name} focusable="false">
        <clipPath id={`clip-${id}`}>
          <rect width="30" height="20" rx="1.2" />
        </clipPath>
        <g clipPath={`url(#clip-${id})`}>{f.node()}</g>
        <rect width="30" height="20" rx="1.2" fill="none" stroke="rgb(0 0 0 / 0.25)" strokeWidth="0.5" />
      </svg>
    )
  }
  const draw = PICTOGRAMS[id]
  return draw ? <span className={className ?? 'art-pictogram'}>{draw()}</span> : null
}
