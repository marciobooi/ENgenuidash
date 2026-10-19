/**
 * Indicative national contributions to the EU 2030 final energy consumption target, in Mtoe: the corrected
 * contributions the Commission communicated to the Member States on 13 March 2024 (Table 19 of "Detailed calculations
 * for the Member States' indicative national contributions", Directive (EU) 2023/1791 Article 4). Primary energy
 * contributions are not part of that table.
 */
export const NATIONAL_FEC_2030: Record<string, number> = {
  BE: 29.02,
  BG: 8.42,
  CZ: 20.35,
  DK: 13.73,
  DE: 155.53,
  EE: 2.53,
  IE: 10.45,
  EL: 14.64,
  ES: 66.28,
  FR: 106.93,
  HR: 5.88,
  IT: 93.05,
  CY: 1.81,
  LV: 3.46,
  LT: 4.25,
  LU: 2.8,
  HU: 16.17,
  MT: 0.68,
  NL: 38.41,
  AT: 21.61,
  PL: 58.5,
  PT: 14.37,
  RO: 22.47,
  SI: 4.32,
  SK: 8.7,
  FI: 20.6,
  SE: 25.41,
}

/**
 * National binding targets for 2020 for the share of renewable energy in gross final energy consumption, in %
 * (Directive 2009/28/EC, Annex I; from the "2020 target" table of Eurostat's SHARES country workbooks). The 2030
 * reference points of the revised directive are not in Eurostat's data.
 */
export const RES_2020_TARGET: Record<string, number> = {
  AL: 38.0,
  AT: 34.0,
  BE: 13.0,
  BA: 40.0,
  BG: 16.0,
  HR: 20.0,
  CY: 13.0,
  CZ: 13.0,
  DK: 30.0,
  EE: 25.0,
  FI: 38.0,
  FR: 23.0,
  MK: 23.0,
  DE: 18.0,
  EL: 18.0,
  HU: 13.0,
  IS: 64.0,
  IE: 16.0,
  IT: 17.0,
  XK: 25.0,
  LV: 40.0,
  LT: 23.0,
  LU: 11.0,
  MT: 10.0,
  MD: 17.0,
  ME: 33.0,
  NL: 14.0,
  NO: 67.5,
  PL: 15.0,
  PT: 31.0,
  RO: 24.0,
  RS: 27.0,
  SK: 14.0,
  SI: 25.0,
  ES: 20.0,
  SE: 49.0,
}

/**
 * 2030 contribution to the EU renewable energy target (share in gross final energy consumption, %), as notified in the
 * final updated national energy and climate plans (NECP) and assessed in the Commission staff working document
 * SWD(2025) 140 of 27 May 2025, Table 1 of each country chapter. Belgium, Estonia, Poland and Slovakia are not in it.
 * Where a plan gives a range, `value` is its lower end and `max` its upper end.
 */
export const NATIONAL_RES_2030: Record<string, { value: number; max?: number }> = {
  BG: { value: 34.96 },
  CZ: { value: 30.1 },
  DK: { value: 58 },
  DE: { value: 41 },
  IE: { value: 43 },
  EL: { value: 43 },
  ES: { value: 48 },
  FR: { value: 35, max: 41.4 },
  HR: { value: 42.5 },
  IT: { value: 39.4 },
  CY: { value: 33.2 },
  LV: { value: 61 },
  LT: { value: 55 },
  LU: { value: 37 },
  HU: { value: 30 },
  MT: { value: 24.5 },
  NL: { value: 32, max: 42 },
  AT: { value: 57 },
  PT: { value: 51 },
  RO: { value: 38.3 },
  SI: { value: 33 },
  FI: { value: 62 },
  SE: { value: 67 },
}

/** 2030 primary energy consumption contributions (Mtoe) from the same final plans and assessment (Finland gave none). */
export const NATIONAL_PEC_2030: Record<string, number> = {
  BG: 13.19, CZ: 29.19, DK: 15.35, DE: 193.64, IE: 11.29, EL: 17.8, ES: 98.4, FR: 158.6, HR: 8.05, IT: 123.3, CY: 2.03,
  LV: 3.85, LT: 5.4, LU: 3.28, HU: 24.1, MT: 0.964, NL: 46.22, AT: 25.92, PT: 16.71, RO: 28.7, SI: 5.98, SE: 41.19,
}
