import { conceptCard, type ConceptCard } from '../../llm/concepts'
import type { DashboardSpec } from '../types'
import { howKey, storyOf } from './story'

type L = 'en' | 'de' | 'fr'
const lg = (lang: string): L => (lang === 'de' || lang === 'fr' ? lang : 'en')

const T = {
  what: { en: 'What it is', de: 'Was es ist', fr: "De quoi il s'agit" },
  why: { en: 'Why it matters', de: 'Warum es wichtig ist', fr: "Pourquoi c'est important" },
  how: { en: 'How it is measured', de: 'Wie es gemessen wird', fr: 'Comment on le mesure' },
  data: { en: 'About the data', de: 'Zu den Daten', fr: 'À propos des données' },
  story: { en: 'What the data show', de: 'Was die Daten zeigen', fr: 'Ce que montrent les données' },
  read: { en: 'How to read this chart', de: 'So lesen Sie die Grafik', fr: 'Comment lire ce graphique' },
} as const
export const explainLabel = (k: keyof typeof T, lang: string) => T[k][lg(lang)]

const READ = {
  line: {
    en: 'Each line follows one value over time; where it rises the value grew, where it falls it shrank.',
    de: 'Jede Linie zeigt einen Wert im Zeitverlauf: steigt sie, wächst der Wert, fällt sie, sinkt er.',
    fr: 'Chaque ligne suit une valeur dans le temps : quand elle monte, la valeur augmente ; quand elle descend, elle diminue.',
  },
  rank: {
    en: 'Each bar is one country, ordered from the highest to the lowest value, so the position shows how it compares with the others.',
    de: 'Jeder Balken steht für ein Land, vom höchsten zum niedrigsten Wert geordnet; die Position zeigt den Vergleich mit den anderen.',
    fr: "Chaque barre représente un pays, du plus élevé au plus bas ; la position montre comment il se situe par rapport aux autres.",
  },
  bars: {
    en: 'The longer the bar, the larger the value; compare the bars with each other.',
    de: 'Je länger der Balken, desto größer der Wert; vergleichen Sie die Balken miteinander.',
    fr: 'Plus la barre est longue, plus la valeur est grande ; comparez les barres entre elles.',
  },
  stacked: {
    en: 'Each bar is split into its parts: the size of a segment is that part’s contribution to the total.',
    de: 'Jeder Balken ist in seine Teile gegliedert: die Größe eines Segments ist der Beitrag dieses Teils zum Gesamtwert.',
    fr: "Chaque barre est divisée en parties : la taille d'un segment est la contribution de cette partie au total.",
  },
  pie: {
    en: 'The whole circle is 100 %; each slice is one part’s share of it.',
    de: 'Der ganze Kreis sind 100 %; jedes Stück ist der Anteil eines Teils daran.',
    fr: "Le cercle entier représente 100 % ; chaque part est la contribution d'un élément.",
  },
  map: {
    en: 'The darker the colour of a country, the higher its value; hover or focus a country for the figure.',
    de: 'Je dunkler die Farbe eines Landes, desto höher sein Wert; Land anwählen für die Zahl.',
    fr: 'Plus la couleur d’un pays est foncée, plus sa valeur est élevée ; survolez ou sélectionnez un pays pour le chiffre.',
  },
  table: {
    en: 'The same figures as the chart, as a table: rows are the items, columns the periods or measures.',
    de: 'Dieselben Zahlen als Tabelle: Zeilen sind die Posten, Spalten die Zeiträume oder Messgrößen.',
    fr: 'Les mêmes chiffres sous forme de tableau : les lignes sont les éléments, les colonnes les périodes ou mesures.',
  },
} as const

export function howToRead(w: DashboardSpec['widgets'][number], lang: string): string | null {
  const k = howKey(w)
  return k ? READ[k][lg(lang)] : null
}

/** The explanation of the topic: what the concept is, why it matters, how it is measured, about the data (only the parts concepts.json has). */
export function topicCard(spec: DashboardSpec, lang: string): { card: ConceptCard; blocks: { label: string; text: string }[] } | null {
  const l = lg(lang)
  const card = conceptCard([spec.title, spec.subtitle ?? ''].join(' . '), l)
  if (!card) return null
  const blocks = (['what', 'why', 'how', 'data'] as const).flatMap((k) => (card[k] ? [{ label: T[k][l], text: card[k] as string }] : []))
  return blocks.length ? { card, blocks } : null
}

const nf = (lang: string, v: number, d?: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: d ?? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2) }).format(v)
const val = (lang: string, v: number, unit: string) => `${nf(lang, v)}${unit ? (unit === '%' ? ' %' : ` ${unit}`) : ''}`

/** Sentences about the figures on screen, built from the dashboard's own data (see story.ts). */
export function dataSentences(spec: DashboardSpec, lang: string): string[] {
  const l = lg(lang)
  const s = storyOf(spec)
  const out: string[] = []
  const c = s.change
  if (c) {
    const sign = c.to.value === c.from.value ? 0 : c.to.value > c.from.value ? 1 : -1
    const pct = c.pct !== null && Math.abs(c.pct) >= 1 ? ` (${new Intl.NumberFormat(lang, { maximumFractionDigits: 0, signDisplay: 'exceptZero' }).format(c.pct)} %)` : ''
    const verb = {
      en: sign > 0 ? 'rose' : sign < 0 ? 'fell' : 'stayed at the same level',
      de: sign > 0 ? 'stieg' : sign < 0 ? 'sank' : 'blieb unverändert',
      fr: sign > 0 ? 'a augmenté' : sign < 0 ? 'a diminué' : 'est resté stable',
    }[l]
    const a = val(lang, c.from.value, c.unit)
    const b = val(lang, c.to.value, c.unit)
    out.push(
      {
        en: `${c.measure} ${verb} from ${a} in ${c.from.year} to ${b} in ${c.to.year}${pct}. Highest: ${val(lang, c.peak.value, c.unit)} (${c.peak.year}); lowest: ${val(lang, c.low.value, c.unit)} (${c.low.year}).`,
        de: `${c.measure} ${verb} von ${a} (${c.from.year}) auf ${b} (${c.to.year})${pct}. Höchstwert: ${val(lang, c.peak.value, c.unit)} (${c.peak.year}); Tiefstwert: ${val(lang, c.low.value, c.unit)} (${c.low.year}).`,
        fr: `${c.measure} ${verb} de ${a} en ${c.from.year} à ${b} en ${c.to.year}${pct}. Maximum : ${val(lang, c.peak.value, c.unit)} (${c.peak.year}) ; minimum : ${val(lang, c.low.value, c.unit)} (${c.low.year}).`,
      }[l],
    )
  }
  const r = s.ranking
  if (r) {
    const list = (xs: { name: string; value: number }[]) => xs.map((x) => `${x.name} (${val(lang, x.value, r.unit)})`).join(', ')
    out.push(
      {
        en: `${r.measure}: highest ${list(r.top)}; lowest ${list(r.bottom)}, among ${r.count} countries.`,
        de: `${r.measure}: am höchsten ${list(r.top)}; am niedrigsten ${list(r.bottom)}, unter ${r.count} Ländern.`,
        fr: `${r.measure} : les plus élevés ${list(r.top)} ; les plus bas ${list(r.bottom)}, parmi ${r.count} pays.`,
      }[l],
    )
  }
  const m = s.makeup
  if (m) {
    const parts = m.parts.slice(0, 3).map((p) => `${p.name} ${nf(lang, p.share, 0)} %`).join(', ')
    out.push(
      {
        en: `${m.measure} is made up mostly of: ${parts}.`,
        de: `${m.measure} besteht vor allem aus: ${parts}.`,
        fr: `${m.measure} se compose surtout de : ${parts}.`,
      }[l],
    )
  }
  return out
}
