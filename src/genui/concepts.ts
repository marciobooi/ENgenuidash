/**
 * Vocabulary the planner understands, in English, German and French (accent-free, lower case).
 * Stems match the start of a word; entries with spaces match as phrases.
 * More specific concepts are listed first so "diesel" wins over "oil".
 */

export interface Concept {
  id: string
  stems: string[]
}

/** Energy products → SIEC codes. */
export const PRODUCTS: (Concept & { siec: string })[] = [
  { id: 'diesel', siec: 'O4671XR5220B', stems: ['diesel', 'gas oil', 'gazole'] },
  { id: 'gasoline', siec: 'O4652XR5210B', stems: ['gasoline', 'petrol ', 'benzin', 'essence'] },
  { id: 'jet', siec: 'O4661XR5230B', stems: ['jet fuel', 'kerosene', 'kerosin', 'kerosene'] },
  { id: 'crude', siec: 'O4100_TOT', stems: ['crude', 'rohol', 'brut'] },
  { id: 'lignite', siec: 'C0220', stems: ['lignite', 'braunkohle'] },
  { id: 'solar', siec: 'RA420', stems: ['solar', 'photovolta', 'solaire', 'pv'] },
  { id: 'wind', siec: 'RA300', stems: ['wind', 'eolien', 'windkraft', 'windenergie'] },
  { id: 'hydro', siec: 'RA100', stems: ['hydro', 'wasserkraft', 'hydraul'] },
  { id: 'geothermal', siec: 'RA200', stems: ['geotherm'] },
  { id: 'biogas', siec: 'R5300', stems: ['biogas', 'biogaz'] },
  { id: 'bioenergy', siec: 'BIOE', stems: ['bioenerg', 'biomass', 'biomasse'] },
  { id: 'renewables', siec: 'RA000', stems: ['renewabl', 'erneuerbar', 'renouvelable', 'green energy', 'grune energie'] },
  { id: 'nuclear', siec: 'N900H', stems: ['nuclear', 'nuklear', 'kernkraft', 'kernenergie', 'atom', 'nucleaire'] },
  { id: 'gas', siec: 'G3000', stems: ['natural gas', 'gas', 'erdgas', 'gaz'] },
  { id: 'oil', siec: 'O4000XBIO', stems: ['oil', 'petroleum', 'erdol', 'mineralol', 'ol', 'petrole', 'petrolier'] },
  { id: 'coal', siec: 'C0000X0350-0370', stems: ['coal', 'kohle', 'charbon', 'solid fossil'] },
  { id: 'fossil', siec: 'FE', stems: ['fossil'] },
  { id: 'electricity', siec: 'E7000', stems: ['electric', 'elektri', 'strom', 'electricite', 'power'] },
  { id: 'heat', siec: 'H8000', stems: ['district heat', 'derived heat', 'fernwarme', 'chaleur'] },
]

/** Energy balance flows → NRG_BAL codes (annual balances). */
export const FLOWS: (Concept & { nrgBal: string })[] = [
  { id: 'households', nrgBal: 'FC_OTH_HH_E', stems: ['household', 'haushalt', 'menage', 'residential'] },
  { id: 'industry', nrgBal: 'FC_IND_E', stems: ['industry', 'industrial', 'industrie'] },
  { id: 'transport', nrgBal: 'FC_TRA_E', stems: ['transport', 'verkehr'] },
  { id: 'services', nrgBal: 'FC_OTH_CP_E', stems: ['services', 'commercial', 'dienstleist', 'tertiaire'] },
  { id: 'imports', nrgBal: 'IMP', stems: ['import', 'einfuhr', 'importat'] },
  { id: 'exports', nrgBal: 'EXP', stems: ['export', 'ausfuhr'] },
  { id: 'production', nrgBal: 'PPRD', stems: ['produc', 'erzeug', 'forder', 'generat', 'gewinn'] },
  { id: 'grossConsumption', nrgBal: 'GIC', stems: ['gross inland', 'bruttoinlands', 'consommation interieure brute'] },
  { id: 'supply', nrgBal: 'NRGSUP', stems: ['supply', 'versorgung', 'approvisionnement'] },
  { id: 'consumption', nrgBal: 'FC_E', stems: ['consum', 'consumption', 'verbrauch', 'consomm', 'demand', 'nachfrage', 'use', 'usage'] },
]

/** Monthly datasets and how flows map onto their NRG_BAL codes. */
export const MONTHLY: Record<string, { dataset: string; flows: Record<string, string>; defaultFlow: string }> = {
  oil: {
    dataset: 'nrg_cb_oilm',
    flows: { consumption: 'GID_OBS', imports: 'IMP', exports: 'EXP', production: 'IPRD', transport: 'FC_TRA_ROAD_E' },
    defaultFlow: 'GID_OBS',
  },
  crude: { dataset: 'nrg_cb_oilm', flows: { imports: 'IMP', exports: 'EXP', production: 'IPRD' }, defaultFlow: 'IMP' },
  gas: {
    dataset: 'nrg_cb_gasm',
    flows: { consumption: 'IC_OBS', imports: 'IMP', exports: 'EXP', production: 'IPRD', industry: 'FC_IND' },
    defaultFlow: 'IC_OBS',
  },
  electricity: {
    dataset: 'nrg_cb_em',
    flows: { consumption: 'AIM', imports: 'IMP', exports: 'EXP' },
    defaultFlow: 'AIM',
  },
}

/** Indicator datasets that answer a question directly. */
export const METRICS: (Concept & { id: string })[] = [
  { id: 'price', stems: ['price', 'preis', 'prix', 'tarif', 'cost', 'kosten', 'cout', 'bill', 'rechnung', 'facture'] },
  { id: 'dependency', stems: ['dependen', 'abhangig', 'dependance'] },
  { id: 'intensity', stems: ['intensity', 'intensitat', 'intensite'] },
  { id: 'perCapita', stems: ['per capita', 'per person', 'per head', 'pro kopf', 'par habitant'] },
  { id: 'degreeDays', stems: ['degree day', 'degree-day', 'gradtag', 'degre-jour', 'degres-jours', 'heating degree', 'cooling degree'] },
  { id: 'primary', stems: ['primary energy', 'primarenergie', 'energie primaire'] },
  { id: 'share', stems: ['share', 'anteil', 'part ', 'percentage', 'prozent', 'pourcentage', 'proportion'] },
]

export const INDUSTRY_WORDS = ['industr', 'business', 'compan', 'non-household', 'non household', 'unternehm', 'gewerb', 'entreprise', 'professionnel']
export const TAX_EXCLUDED_WORDS = ['without tax', 'excluding tax', 'before tax', 'net of tax', 'ohne steuer', 'hors taxe', 'ht']
export const MIX_WORDS = ['mix', 'breakdown', 'by source', 'by fuel', 'by product', 'sources', 'composition', 'split', 'nach quelle', 'nach energietrager', 'aufteilung', 'par source', 'repartition', 'which fuels']
export const MONTHLY_WORDS = ['monthly', 'per month', 'each month', 'by month', 'month', 'monat', 'monatlich', 'mensuel', 'par mois', 'mois']
export const ALL_TIME_WORDS = ['all time', 'all-time', 'ever', 'history', 'historic', 'until today', 'up to today', 'to date', 'full', 'since the beginning', 'alle zeit', 'bis heute', 'gesamte', 'seit beginn', 'jusqu a aujourd hui', 'depuis toujours', 'historique', 'toute']
export const ALL_COUNTRIES_WORDS = ['all countries', 'every country', 'each country', 'by country', 'per country', 'member states', 'all member', 'eu countries', 'european countries', 'compare countries', 'ranking', 'alle lander', 'jedes land', 'mitgliedstaaten', 'nach land', 'tous les pays', 'chaque pays', 'etats membres', 'par pays', 'classement']
export const EXPLAIN_WORDS = ['what is', 'what are', 'what does', 'explain', 'why', 'how does', 'how do', 'how is', 'define', 'definition', 'meaning', 'was ist', 'was sind', 'erklar', 'warum', 'wieso', 'wie funktioniert', 'qu est-ce', 'qu est ce', 'explique', 'pourquoi', 'comment fonctionne', 'c est quoi']
export const EU_ALIASES = ['eu', 'eu27', 'eu-27', 'ue', 'ue27', 'ue-27', 'european union', 'europaische union', 'union europeenne', 'uniao europeia', 'union europea', 'unione europea', 'europe', 'europa']

export const EU27 = ['BE', 'BG', 'CZ', 'DK', 'DE', 'EE', 'IE', 'EL', 'ES', 'FR', 'HR', 'IT', 'CY', 'LV', 'LT', 'LU', 'HU', 'MT', 'NL', 'AT', 'PL', 'PT', 'RO', 'SI', 'SK', 'FI', 'SE']

/** Products compared in "mix" views (max 6 colours). */
export const ENERGY_MIX = ['O4000XBIO', 'G3000', 'C0000X0350-0370', 'N900H', 'RA000']
export const ELECTRICITY_MIX = ['N900H', 'RA300', 'RA100', 'RA420', 'G3000', 'C0000X0350-0370']

export const MONTH_NAMES: Record<string, number> = {
  january: 1, jan: 1, januar: 1, janvier: 1,
  february: 2, feb: 2, februar: 2, fevrier: 2,
  march: 3, mar: 3, marz: 3, mars: 3,
  april: 4, apr: 4, avril: 4,
  may: 5, mai: 5,
  june: 6, jun: 6, juni: 6, juin: 6,
  july: 7, jul: 7, juli: 7, juillet: 7,
  august: 8, aug: 8, aout: 8,
  september: 9, sep: 9, sept: 9, septembre: 9,
  october: 10, oct: 10, oktober: 10, okt: 10, octobre: 10,
  november: 11, nov: 11, novembre: 11,
  december: 12, dec: 12, dezember: 12, dez: 12, decembre: 12,
}

/** "Show as …" chart type requests. */
export const CHART_WORDS: Record<'line' | 'bar' | 'area' | 'pie' | 'table', string[]> = {
  line: ['line chart', 'line graph', 'as a line', 'as line', 'liniendiagramm', 'linie', 'courbe', 'graphique en ligne'],
  bar: ['bar chart', 'bar graph', 'as bars', 'as a bar', 'as bar', 'column chart', 'balkendiagramm', 'saulendiagramm', 'balken', 'histogramme', 'barres', 'diagramme en barres', 'colonnes'],
  area: ['area chart', 'as area', 'flachendiagramm', 'aires', 'graphique en aires'],
  pie: ['pie', 'donut', 'doughnut', 'kreisdiagramm', 'tortendiagramm', 'camembert', 'secteurs'],
  table: ['as a table', 'as table', 'table only', 'tabelle', 'tableau'],
}

/** Words that signal "add to the current selection" rather than "replace it". */
export const ADD_WORDS = ['add', 'also', 'plus', 'include', 'compare with', 'hinzu', 'hinzufugen', 'auch', 'vergleiche mit', 'ajoute', 'aussi', 'compare avec', 'comparer avec']
/** A message starting with one of these ("and Germany?") also adds to the selection. */
export const ADD_PREFIXES = ['and', 'und', 'et', 'what about', 'how about', 'und was ist mit', 'et pour']
export const ONLY_WORDS = ['only', 'just', 'nur', 'seulement', 'uniquement']
export const REMOVE_WORDS = ['remove', 'without', 'drop', 'exclude', 'entferne', 'ohne', 'retire', 'supprime', 'sans', 'enleve']

/** Unit words in questions → candidate unit codes (first one the dataset has wins). */
export const UNIT_WORDS: { stems: string[]; units: string[] }[] = [
  { stems: ['gwh', 'twh', 'gigawatt hour', 'gigawattstunde', 'gigawattheure'], units: ['GWH', 'MWH'] },
  { stems: ['mwh', 'megawatt hour'], units: ['MWH', 'GWH'] },
  { stems: ['mtoe', 'million tonnes of oil'], units: ['MTOE', 'KTOE'] },
  { stems: ['ktoe', 'toe', 'oil equivalent', 'olaquivalent', 'equivalent petrole'], units: ['KTOE', 'MTOE'] },
  { stems: ['tj', 'terajoule', 'joule'], units: ['TJ', 'TJ_GCV', 'TJ_NCV'] },
  { stems: ['cubic', 'm3', 'kubikmeter', 'metres cubes', 'metre cube'], units: ['MIO_M3', 'THS_M3'] },
  { stems: ['tonnes', 'tons', 'tonnen', 'tonne'], units: ['THS_T'] },
  { stems: ['per gj', 'gj'], units: ['GJ_GCV', 'GJ_HAB'] },
  { stems: ['per kwh', 'kwh'], units: ['KWH'] },
  { stems: ['capacity', 'kapazitat', 'capacite', 'mw', 'gw'], units: ['MW', 'GW'] },
  { stems: ['number of', 'count', 'anzahl', 'nombre de'], units: ['NR'] },
  { stems: ['index'], units: ['I05', 'INX'] },
  { stems: ['percent', 'prozent', 'pourcent', 'pourcentage'], units: ['PC'] },
]
