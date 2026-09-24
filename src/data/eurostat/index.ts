export { buildDataUrl, EurostatUnavailableError, fetchEurostatData, parseJsonStat, toSeries } from './api'
export type { EurostatQuery, EurostatResult, Observation } from './api'
export {
  codeLabel,
  datasetPath,
  describeDataset,
  dimensionCodes,
  loadEnergyCodelists,
  loadEnergyDictionary,
  pick,
  searchDatasets,
} from './dictionary'
export type * from './types'
