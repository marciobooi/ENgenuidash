// Downloads the app's language models (src/llm/models.json) into public/models; the app serves
// them itself and never fetches a model from the Hugging Face Hub at runtime. Runs automatically
// (once) before `dev` and `build` via scripts/ensure-model.mjs.
//
//   npm run model:download
//
// Each browser downloads one format of the model (see src/llm/worker.ts). Settings from
// models.json are copied into the manifest.
//
// The file list comes from the Hub API, so repositories that name or split their ONNX files
// differently (external .onnx_data files, per-part models) are handled. What was downloaded is
// recorded in public/models/manifest.json, which the app reads to pick what it can load.
// Best practices: parallel downloads with retries, atomic writes (.part → rename), size and
// SHA-256 verification against the Hub's LFS metadata, and skipping files that are already valid.
import { createHash } from 'node:crypto'
import { splitOnnx } from './lib/split-onnx.mjs'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const HUB = 'https://huggingface.co'
const CONCURRENCY = 3
const RETRIES = 3
const ROOT = join(process.cwd(), 'public/models')
const MODELS = JSON.parse(readFileSync(join(process.cwd(), 'src/llm/models.json'), 'utf8'))

// Transformers.js file suffix per dtype (onnx/<session><suffix>.onnx).
const SUFFIX = { fp32: '', fp16: '_fp16', q8: '_quantized', int8: '_int8', uint8: '_uint8', q4: '_q4', q4f16: '_q4f16', bnb4: '_bnb4' }
// If a part is not published in the requested dtype, these may stand in (same precision class).
const STAND_INS = { q4f16: ['q4f16', 'fp16'], q4: ['q4'], q8: ['q8', 'int8', 'uint8'] }
// Small config files the tokenizer and model need.
const CONFIG = /^(config|generation_config|tokenizer|tokenizer_config|special_tokens_map|chat_template|preprocessor_config)\.(json|jinja)$/

const fmt = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`

/** Every file of a model repository (root and onnx/), with size and SHA-256 of LFS files. */
async function listFiles(id) {
  const files = new Map()
  for (const path of ['', 'onnx']) {
    const res = await fetch(`${HUB}/api/models/${id}/tree/main/${path}`)
    if (!res.ok) throw new Error(`${id}: Hub API HTTP ${res.status}`)
    for (const f of await res.json()) if (f.type === 'file') files.set(f.path, { size: f.lfs?.size ?? f.size, sha256: f.lfs?.oid })
  }
  return files
}

/** Which files to fetch for a model, and the dtype of each part per requested dtype. */
function selectFiles(model, files) {
  const wanted = [...files.keys()].filter((p) => CONFIG.test(p))
  const dtypes = {}
  for (const dtype of model.dtypes) {
    const parts = {}
    for (const session of model.sessions) {
      const found = (STAND_INS[dtype] ?? [dtype]).find((d) => files.has(`onnx/${session}${SUFFIX[d]}.onnx`))
      if (!found) break
      parts[session] = found
    }
    if (Object.keys(parts).length !== model.sessions.length) {
      console.warn(`  ${model.id}: no ${dtype} weights published, skipped`)
      continue
    }
    dtypes[dtype] = parts
    for (const [session, d] of Object.entries(parts)) {
      const base = `onnx/${session}${SUFFIX[d]}.onnx`
      // The .onnx file plus any external weight files (.onnx_data, .onnx_data_1, …).
      wanted.push(...[...files.keys()].filter((p) => p === base || p.startsWith(`${base}_data`)))
    }
  }
  return { paths: [...new Set(wanted)], dtypes }
}

async function sha256(file) {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}

async function isValid(file, expected) {
  if (!existsSync(file)) return false
  if (expected?.size && statSync(file).size !== expected.size) return false
  return expected?.sha256 ? (await sha256(file)) === expected.sha256 : true
}

/**
 * A file this script split into external data (see splitWeights): valid when the marker says it
 * came from the published file with this SHA-256 and every part is there, with its size.
 */
function isSplit(dest, expected) {
  const marker = `${dest}.split.json`
  if (!existsSync(marker)) return false
  const { sha256: from, parts } = JSON.parse(readFileSync(marker, 'utf8'))
  if (expected?.sha256 && from !== expected.sha256) return false
  return parts.every((p) => existsSync(join(dirname(dest), p.file)) && statSync(join(dirname(dest), p.file)).size === p.size)
}

async function download(id, path, expected) {
  const dest = join(ROOT, id, path)
  if (isSplit(dest, expected)) return console.log(`✓ ${id}/${path} (already present, weights in external data)`)
  if (await isValid(dest, expected)) return console.log(`✓ ${id}/${path} (already present)`)
  mkdirSync(dirname(dest), { recursive: true })
  const part = `${dest}.part`

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(`${HUB}/${id}/resolve/main/${path}`)
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      const total = Number(res.headers.get('content-length')) || expected?.size || 0
      let received = 0
      let lastLog = 0
      const progress = new Transform({
        transform(chunk, _enc, cb) {
          received += chunk.length
          if (total > 5e6 && Date.now() - lastLog > 2000) {
            lastLog = Date.now()
            console.log(`  ${path}: ${fmt(received)} / ${fmt(total)} (${Math.round((received / total) * 100)}%)`)
          }
          cb(null, chunk)
        },
      })
      await pipeline(Readable.fromWeb(res.body), progress, createWriteStream(part))
      if (!(await isValid(part, expected))) throw new Error('size or SHA-256 mismatch')
      renameSync(part, dest) // atomic: a half-written file never looks complete
      return console.log(`✓ ${id}/${path} (${fmt(statSync(dest).size)}${expected?.sha256 ? ', SHA-256 verified' : ''})`)
    } catch (err) {
      rmSync(part, { force: true })
      if (attempt === RETRIES) throw new Error(`${id}/${path}: ${err.message}`)
      console.warn(`  retrying ${path} (${err.message})`)
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
}

/**
 * Models whose weights are inside one large .onnx file (no .onnx_data published) cannot be loaded
 * in a browser: the file is copied whole into WebAssembly memory. `splitWeights` (MB) moves the
 * weights into external data chunks of that size (scripts/lib/split-onnx.mjs; byte-for-byte the
 * same weights) and tells Transformers.js in config.json. A marker records the source file's
 * SHA-256, so later runs keep the split files instead of downloading the original again.
 */
function splitLargeFiles(model, files, paths) {
  const dir = join(ROOT, model.id)
  const counts = {}
  for (const path of paths.filter((p) => p.endsWith('.onnx'))) {
    const published = files.get(path)
    if ([...files.keys()].some((p) => p.startsWith(`${path}_data`))) continue // already external
    if (!published || published.size < model.splitWeights * 1024 * 1024) continue
    const dest = join(dir, path)
    const marker = `${dest}.split.json`
    if (!isSplit(dest, published)) {
      const name = path.split('/').pop()
      const parts = splitOnnx(dirname(dest), name, model.splitWeights * 1024 * 1024)
      const record = { sha256: published.sha256, parts: [name, ...parts].map((file) => ({ file, size: statSync(join(dirname(dest), file)).size })) }
      writeFileSync(marker, JSON.stringify(record, null, 2) + '\n')
      console.log(`  split ${path}: weights in ${parts.length} external data files`)
    }
    const { parts } = JSON.parse(readFileSync(marker, 'utf8'))
    counts[path.split('/').pop()] = parts.length - 1
  }
  if (!Object.keys(counts).length) return
  const configPath = join(dir, 'config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const js = (config['transformers.js_config'] ??= {})
  js.use_external_data_format = { ...(js.use_external_data_format ?? {}), ...counts }
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
}

const manifest = {}
let failed = false
for (const [key, model] of Object.entries(MODELS)) {
  if (key.startsWith('$')) continue
  try {
    console.log(`\n${model.id} (${key})`)
    const files = await listFiles(model.id)
    const { paths, dtypes } = selectFiles(model, files)
    if (!Object.keys(dtypes).length) throw new Error('none of the requested weight formats is published')
    const size = paths.reduce((n, p) => n + (files.get(p)?.size ?? 0), 0)
    console.log(`  ${paths.length} files, ${fmt(size)} in total`)
    let next = 0
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (next < paths.length) {
          const path = paths[next++]
          await download(model.id, path, files.get(path))
        }
      }),
    )
    if (model.splitWeights) splitLargeFiles(model, files, paths)
    // Settings travel with the files: the app reads everything it needs from the manifest.
    const { sessions: _sessions, dtypes: _requested, splitWeights: _split, ...settings } = model
    manifest[key] = { ...settings, id: model.id, dtypes }
  } catch (err) {
    failed = true
    console.error(`✗ ${model.id}: ${err.message}`)
  }
}

// Keep entries of models that were downloaded earlier but could not be checked this time;
// models no longer listed in models.json are dropped.
const manifestPath = join(ROOT, 'manifest.json')
const stored = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}
const previous = Object.fromEntries(Object.entries(stored).filter(([key]) => key in MODELS))
mkdirSync(ROOT, { recursive: true })
writeFileSync(manifestPath, JSON.stringify({ ...previous, ...manifest }, null, 2) + '\n')
console.log(`\nWrote ${manifestPath}. The app serves these files itself (see src/llm/worker.ts).`)
if (failed) process.exit(1)
