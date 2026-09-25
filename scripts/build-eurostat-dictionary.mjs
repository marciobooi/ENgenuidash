// Builds the Eurostat energy dictionary used by the app.
//
//   npm run eurostat:dictionary
//
// Sources (all public Eurostat dissemination APIs):
//   - Table of contents (EN/DE/FR) → the "Energy" (nrg) folder tree, dataset & table titles,
//     last update, period covered, number of values.
//   - SDMX 2.1 dataflow + descendants with detail=referencepartial → for every dataset/table:
//     its dimensions (in key order) and codelists restricted to the codes the dataset uses,
//     with EN/DE/FR labels.
//
// Output (loaded by the browser at runtime, see src/data/eurostat):
//   public/data/eurostat/energy/dictionary.json   datasets, folder tree, dimensions, used codes,
//                                                 units (with symbol/kind) and recommended selections
//   public/data/eurostat/energy/codelists.json    code labels per codelist (SIEC, NRG_BAL, GEO…)
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'

const ROOT_FOLDER = 'nrg' // https://ec.europa.eu/eurostat/web/energy/database
const LANGS = ['en', 'de', 'fr']
const API = 'https://ec.europa.eu/eurostat/api/dissemination'
const OUT_DIR = join(process.cwd(), 'public/data/eurostat/energy')
const CONCURRENCY = 4

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, attempt = 1) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } catch (err) {
    if (attempt >= 4) throw new Error(`${url}: ${err.message}`)
    await sleep(1000 * attempt)
    return get(url, attempt + 1)
  }
}

async function pool(items, worker) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await worker(items[i], i)
      }
    }),
  )
  return results
}

/** Parses the tab-separated TOC into rows with indentation depth. */
function parseToc(txt) {
  return txt
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const cols = line.split('\t').map((c) => c.replace(/^"|"$/g, ''))
      const rawTitle = cols[0]
      return {
        depth: (rawTitle.length - rawTitle.trimStart().length) / 4,
        title: rawTitle.trim(),
        code: cols[1],
        type: cols[2],
        lastUpdate: toIsoDate(cols[3]),
        lastStructureChange: toIsoDate(cols[4]),
        dataStart: cols[5]?.trim() || null,
        dataEnd: cols[6]?.trim() || null,
        values: cols[7] ? Number(cols[7]) || null : null,
      }
    })
}

function toIsoDate(ddmmyyyy) {
  const m = ddmmyyyy?.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  isArray: (name) => ['Name', 'Code', 'Dimension', 'Concept', 'Codelist', 'Dataflow', 'Description'].includes(name),
})

/** { en, de, fr } from a list of <Name xml:lang="…"> elements. */
function names(list) {
  const out = {}
  for (const n of list ?? []) {
    const lang = n.lang
    if (LANGS.includes(lang)) out[lang] = String(n['#text'] ?? '').trim()
  }
  return out
}

// ---------- 1. Table of contents → energy tree ----------
console.log('Fetching table of contents…')
const tocs = Object.fromEntries(
  await Promise.all(LANGS.map(async (l) => [l, parseToc(await get(`${API}/catalogue/toc/txt?lang=${l}`))])),
)

const titleByCode = {}
for (const lang of LANGS) {
  for (const row of tocs[lang]) (titleByCode[row.code] ??= {})[lang] = row.title
}

const en = tocs.en
const start = en.findIndex((r) => r.code === ROOT_FOLDER && r.type === 'folder')
if (start < 0) throw new Error(`Folder "${ROOT_FOLDER}" not found in the table of contents`)

const rootDepth = en[start].depth
const folders = {}
const items = [] // datasets + tables, in TOC order
const stack = [ROOT_FOLDER]
folders[ROOT_FOLDER] = { code: ROOT_FOLDER, title: titleByCode[ROOT_FOLDER], parent: null, children: [] }

for (const row of en.slice(start + 1)) {
  if (row.depth <= rootDepth) break
  const level = row.depth - rootDepth
  stack.length = level
  const parent = stack[level - 1]

  if (row.type === 'folder') {
    folders[row.code] = { code: row.code, title: titleByCode[row.code], parent, children: [] }
    folders[parent].children.push({ type: 'folder', code: row.code })
    stack[level] = row.code
  } else {
    // Tables are listed under the dataset they derive from; keep the enclosing folder as parent.
    const folder = stack.slice(0, level).reverse().find((c) => folders[c])
    const isTableUnderDataset = !folders[parent]
    items.push({
      code: row.code,
      type: row.type,
      folder,
      ...(isTableUnderDataset ? { derivedFrom: parent } : {}),
      title: titleByCode[row.code],
      lastUpdate: row.lastUpdate,
      lastStructureChange: row.lastStructureChange,
      dataStart: row.dataStart,
      dataEnd: row.dataEnd,
      values: row.values,
    })
    folders[folder].children.push({ type: row.type, code: row.code })
    stack[level] = row.code
  }
}
// Energy tables Eurostat files outside the energy folder (e.g. under the SDG indicators), added
// at the root of the tree: "Final energy consumption in households per capita" (SDG), and
// "Greenhouse gas emissions by source sector" (environment: the energy sectors' emissions), and
// "Inability to keep home adequately warm" (living conditions: energy poverty).
const EXTRA_TABLES = ['sdg_07_20', 'env_air_gge', 'ilc_mdes01']
for (const code of EXTRA_TABLES) {
  const row = en.find((r) => r.code === code && r.type !== 'folder')
  if (!row || items.some((i) => i.code === code)) continue
  items.push({
    code,
    type: row.type,
    folder: ROOT_FOLDER,
    title: titleByCode[code],
    lastUpdate: row.lastUpdate,
    lastStructureChange: row.lastStructureChange,
    dataStart: row.dataStart,
    dataEnd: row.dataEnd,
    values: row.values,
  })
  folders[ROOT_FOLDER].children.push({ type: row.type, code })
}
console.log(`Found ${Object.keys(folders).length} folders and ${items.length} datasets/tables.`)

// ---------- 2. Structures (dimensions + used codes) ----------
const codelists = {} // id -> { name, codes: { code: { en, de, fr, parent? } } }
const concepts = {} // id -> { en, de, fr }
const failures = []

const structures = await pool(items, async (item, i) => {
  const url = `${API}/sdmx/2.1/dataflow/ESTAT/${item.code.toUpperCase()}/latest?references=descendants&detail=referencepartial`
  try {
    const doc = xml.parse(await get(url)).Structure.Structures
    const dsd = doc.DataStructures.DataStructure
    const comps = dsd.DataStructureComponents

    for (const scheme of [].concat(doc.Concepts?.ConceptScheme ?? [])) {
      for (const c of scheme.Concept ?? []) concepts[c.id] ??= names(c.Name)
    }

    for (const cl of doc.Codelists?.Codelist ?? []) {
      const target = (codelists[cl.id] ??= { name: names(cl.Name), codes: {} })
      for (const code of cl.Code ?? []) {
        target.codes[code.id] ??= {
          ...names(code.Name),
          ...(code.Parent?.Ref?.id ? { parent: code.Parent.Ref.id } : {}),
        }
      }
    }

    const dimensions = (comps.DimensionList.Dimension ?? [])
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((d) => {
        const codelist = d.LocalRepresentation?.Enumeration?.Ref?.id ?? null
        const used = codelist
          ? (doc.Codelists.Codelist.find((cl) => cl.id === codelist)?.Code ?? []).map((c) => c.id)
          : []
        return { id: d.id, concept: d.ConceptIdentity?.Ref?.id ?? d.id.toUpperCase(), codelist, codes: used }
      })

    const flow = doc.Dataflows.Dataflow[0]
    // Reference metadata document (ESMS) for the dataset, used by the knowledge base.
    const annotations = [].concat(flow.Annotations?.Annotation ?? [])
    const esms = annotations.find((a) => a.AnnotationType === 'ESMS_HTML')
    const metadataUrl = [].concat(esms?.AnnotationURL ?? [])[0]
    process.stdout.write(`\r  structures ${i + 1}/${items.length} `)
    return {
      dimensions,
      timeDimension: comps.DimensionList.TimeDimension?.id ?? 'TIME_PERIOD',
      flowTitle: names(flow.Name),
      metadataUrl: typeof metadataUrl === 'string' ? metadataUrl : metadataUrl?.['#text'],
    }
  } catch (err) {
    failures.push({ code: item.code, error: err.message })
    return null
  }
})
console.log()

// ---------- 3. Units & recommended selections ----------
// Symbol and kind for every unit used in the energy database. Units of the same kind are
// alternative expressions of one measure (ktoe ↔ GWh ↔ TJ); different kinds measure
// different things (number of plants vs. capacity) and must not be swapped.
const UNIT_INFO = {
  KTOE: ['ktoe', 'energy'], MTOE: ['Mtoe', 'energy'], GWH: ['GWh', 'energy'], MWH: ['MWh', 'energy'],
  TJ: ['TJ', 'energy'], TJ_GCV: ['TJ (GCV)', 'energy'], TJ_NCV: ['TJ (NCV)', 'energy'],
  THS_T: ['thousand t', 'mass'], THS_TY: ['thousand t/year', 'mass-rate'], MIO_M3: ['million m³', 'volume'],
  THS_M3: ['thousand m³', 'volume'], KJ_M3_GCV: ['kJ/m³ (GCV)', 'calorific value'],
  KJ_M3_NCV: ['kJ/m³ (NCV)', 'calorific value'], MJ_T_GCV: ['MJ/t (GCV)', 'calorific value'],
  MJ_T_NCV: ['MJ/t (NCV)', 'calorific value'], TJ_TM3_NCV: ['TJ/thousand m³ (NCV)', 'calorific value'],
  PC: ['%', 'percentage'], I05: ['index 2005=100', 'index'], INX: ['index', 'index'],
  // KGOE: sdg_07_20, "households per capita" (the per capita is in the title).
  KGOE: ['kgoe', 'energy per capita'],
  TOE_HAB: ['toe/capita', 'energy per capita'], KGOE_HAB: ['kgoe/capita', 'energy per capita'],
  MJ_HAB: ['MJ/capita', 'energy per capita'], GJ_HAB: ['GJ/capita', 'energy per capita'],
  KGOE_TEUR: ['kgoe/€1000', 'energy intensity'], KGOE_TEUR_PPS: ['kgoe/€1000 (PPS)', 'energy intensity'],
  EUR_KGOE: ['€/kgoe', 'energy productivity'], PPS_KGOE: ['PPS/kgoe', 'energy productivity'],
  KGOE_M2: ['kgoe/m²', 'energy per area'], KWH_M2: ['kWh/m²', 'energy per area'], MJ_M2: ['MJ/m²', 'energy per area'],
  KWH: ['per kWh', 'price'], GJ_GCV: ['per GJ (GCV)', 'price'], NR: ['number', 'count'], HR: ['hours', 'time'],
  GW: ['GW', 'capacity'], MW: ['MW', 'capacity'], KM: ['km', 'length'], THS_M2: ['thousand m²', 'area'],
  TSWU: ['tSWU', 'enrichment'], THM: ['tHM', 'mass'], GWD_THM: ['GWd/tHM', 'burn-up'],
  'PCH_LV_M_16-19': ['% vs 2016–2019 average', 'percentage change'], PCH_M12_NSA: ['% vs same month last year', 'percentage change'],
}

// Default unit when a question does not name one: the headline unit Eurostat uses.
const UNIT_PREFERENCE = [
  'KTOE', 'MIO_M3', 'THS_T', 'PC', 'KWH', 'MTOE', 'KGOE_HAB', 'KGOE_TEUR_PPS', 'EUR_KGOE', 'KGOE_M2',
  'NR', 'MW', 'GWH', 'TJ', 'TJ_GCV',
]

function defaultUnit(ds) {
  const units = ds.dimensions.find((d) => d.id === 'unit')?.codes ?? []
  if (!units.length) return null
  // Electricity and heat datasets are read in GWh rather than ktoe.
  if (/electric|heat/i.test(ds.title?.en ?? '') && units.includes('GWH')) return 'GWH'
  return UNIT_PREFERENCE.find((u) => units.includes(u)) ?? units[0]
}

// Recommended code for dimensions where exactly one value must be chosen (not additive).
const STANDARD_BANDS = ['KWH2500-4999', 'GJ20-199', 'MWH500-1999', 'GJ10000-99999', 'TOT_KWH', 'TOT_GJ']
function recommendedSelection(ds) {
  const out = {}
  for (const dim of ds.dimensions) {
    const codes = dim.codes
    if (!codes.length) continue
    if (dim.id === 'unit') out.unit = defaultUnit(ds)
    else if (dim.id === 'freq') out.freq = codes[0]
    else if (dim.id === 'currency') out.currency = codes.includes('EUR') ? 'EUR' : codes[0]
    else if (dim.id === 'tax') out.tax = codes.includes('I_TAX') ? 'I_TAX' : codes[0]
    else if (dim.id === 'nrg_cons') out.nrg_cons = STANDARD_BANDS.find((b) => codes.includes(b)) ?? codes[0]
  }
  return out
}

// ---------- 4. Assemble ----------
const datasets = {}
items.forEach((item, i) => {
  const s = structures[i]
  datasets[item.code] = {
    ...item,
    title: { ...(s?.flowTitle ?? {}), ...item.title },
    dimensions: s?.dimensions ?? [],
    timeDimension: s?.timeDimension ?? 'TIME_PERIOD',
    metadataUrl: s?.metadataUrl ?? null,
    api: {
      jsonStat: `${API}/statistics/1.0/data/${item.code}`,
      sdmx: `${API}/sdmx/2.1/data/${item.code}`,
      browser: `https://ec.europa.eu/eurostat/databrowser/view/${item.code}/default/table?lang=en`,
    },
  }
})

// Units per dataset: list, whether there is a choice, and whether the choices are interchangeable.
for (const ds of Object.values(datasets)) {
  const units = ds.dimensions.find((d) => d.id === 'unit')?.codes ?? []
  const kinds = new Set(units.map((u) => UNIT_INFO[u]?.[1] ?? u))
  ds.units = units
  ds.multipleUnits = units.length > 1
  // true: same measure in different units (pick any, convert freely);
  // false: the units measure different things (pick the one matching the question).
  ds.unitsAreAlternatives = units.length > 1 && kinds.size === 1
  ds.defaults = recommendedSelection(ds)
}

const unitRegistry = Object.fromEntries(
  [...new Set(Object.values(datasets).flatMap((d) => d.units))].sort().map((code) => [
    code,
    {
      symbol: UNIT_INFO[code]?.[0] ?? code,
      kind: UNIT_INFO[code]?.[1] ?? 'other',
      label: codelists.UNIT?.codes[code] ?? { en: code },
    },
  ]),
)

// Dimension (concept) labels, e.g. siec → "Standard international energy product classification (SIEC)".
const dimensionIds = new Set(Object.values(datasets).flatMap((d) => d.dimensions.map((x) => x.concept)))
const dimensionLabels = Object.fromEntries(
  [...dimensionIds].map((id) => [id.toLowerCase(), concepts[id] ?? codelists[id]?.name ?? { en: id }]),
)

const generatedAt = new Date().toISOString()
const dictionary = {
  generatedAt,
  source: {
    name: 'Eurostat',
    database: 'https://ec.europa.eu/eurostat/web/energy/database',
    rootFolder: ROOT_FOLDER,
    licence: 'https://ec.europa.eu/eurostat/about-us/policies/copyright',
  },
  languages: LANGS,
  root: ROOT_FOLDER,
  folders,
  datasets,
  dimensions: dimensionLabels,
  units: unitRegistry,
  ...(failures.length ? { failures } : {}),
}

const codelistFile = {
  generatedAt,
  languages: LANGS,
  codelists: Object.fromEntries(Object.entries(codelists).sort(([a], [b]) => a.localeCompare(b))),
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(join(OUT_DIR, 'dictionary.json'), JSON.stringify(dictionary))
writeFileSync(join(OUT_DIR, 'codelists.json'), JSON.stringify(codelistFile))

const codeCount = Object.values(codelists).reduce((n, cl) => n + Object.keys(cl.codes).length, 0)
console.log(
  `Wrote ${Object.keys(datasets).length} datasets/tables, ${Object.keys(codelists).length} codelists ` +
    `(${codeCount} codes) to ${OUT_DIR}` +
    (failures.length ? `\n${failures.length} failed: ${failures.map((f) => f.code).join(', ')}` : ''),
)
