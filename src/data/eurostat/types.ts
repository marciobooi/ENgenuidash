/** Language-keyed label, e.g. { en: 'Energy', de: 'Energie', fr: 'Énergie' }. */
export type Labels = Partial<Record<'en' | 'de' | 'fr', string>>

export interface FolderNode {
  code: string
  title: Labels
  parent: string | null
  children: { type: 'folder' | 'dataset' | 'table'; code: string }[]
}

export interface DatasetDimension {
  /** Dimension id as used in API filters, e.g. "siec". */
  id: string
  concept: string
  /** Codelist holding the labels, e.g. "SIEC". */
  codelist: string | null
  /** Codes this dataset actually uses, in Eurostat order. */
  codes: string[]
}

export interface DatasetInfo {
  code: string
  type: 'dataset' | 'table'
  folder: string
  /** For tables: the dataset they are derived from. */
  derivedFrom?: string
  title: Labels
  lastUpdate: string | null
  lastStructureChange: string | null
  dataStart: string | null
  dataEnd: string | null
  values: number | null
  dimensions: DatasetDimension[]
  timeDimension: string
  api: { jsonStat: string; sdmx: string; browser: string }
  /** Unit codes available in this dataset (see EnergyDictionary.units for symbols/labels). */
  units: string[]
  /** More than one unit: a unit must be chosen, never invented. */
  multipleUnits: boolean
  /** true = same measure in different units (ktoe/GWh/TJ); false = the units measure different things. */
  unitsAreAlternatives: boolean
  /** Recommended code for dimensions where exactly one value must be selected (unit, currency, tax, band, freq). */
  defaults: Partial<Record<'unit' | 'freq' | 'currency' | 'tax' | 'nrg_cons', string>>
}

export interface UnitInfo {
  symbol: string
  /** e.g. "energy", "volume", "percentage", "price", "count". */
  kind: string
  label: Labels
}

export interface EnergyDictionary {
  generatedAt: string
  source: { name: string; database: string; rootFolder: string; licence: string }
  languages: string[]
  root: string
  folders: Record<string, FolderNode>
  datasets: Record<string, DatasetInfo>
  /** Dimension labels by id, e.g. siec → "Standard international energy product classification (SIEC)". */
  dimensions: Record<string, Labels>
  /** Every unit used in the energy database. */
  units: Record<string, UnitInfo>
}

export interface Codelist {
  name: Labels
  codes: Record<string, Labels & { parent?: string }>
}

export interface EnergyCodelists {
  generatedAt: string
  languages: string[]
  codelists: Record<string, Codelist>
}
