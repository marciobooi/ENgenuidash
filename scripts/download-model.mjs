// Downloads SmolLM2-360M-Instruct into public/models so the app runs with no network access at
// all. Without it, the browser fetches the model from the Hugging Face Hub on first load and
// keeps it in the Cache API.
//
//   npm run model:download                    # all weight formats the app can pick
//   npm run model:download -- --dtypes q4f16  # only WebGPU fp16 weights (~275 MB)
//
// Best practices: parallel downloads with retries, atomic writes (.part → rename), size and
// SHA-256 verification against the Hub's LFS metadata, and skipping files that are already valid.
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const MODEL_ID = 'HuggingFaceTB/SmolLM2-360M-Instruct'
const HUB = 'https://huggingface.co'
const CONCURRENCY = 3
const RETRIES = 3

// Weight files per dtype, matching what src/llm/worker.ts selects:
// q4f16 = WebGPU with shader-f16, q4 = WebGPU without f16, q8 = CPU (WASM).
const WEIGHTS = { q4f16: 'onnx/model_q4f16.onnx', q4: 'onnx/model_q4.onnx', q8: 'onnx/model_quantized.onnx' }
const CONFIG_FILES = ['config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json']

// --dtypes q4f16,q8  or  --dtypes=q4f16,q8  (default: all)
const argIndex = process.argv.findIndex((a) => a.startsWith('--dtypes'))
const argValue = argIndex < 0 ? '' : process.argv[argIndex].includes('=') ? process.argv[argIndex].split('=')[1] : process.argv[argIndex + 1] ?? ''
const requested = argValue.split(',').filter((d) => d in WEIGHTS)
const selected = requested.length ? requested : Object.keys(WEIGHTS)
const files = [...CONFIG_FILES, ...selected.map((d) => WEIGHTS[d])]
const outDir = join(process.cwd(), 'public/models', MODEL_ID)

/** Size and SHA-256 of every LFS file, from the Hub API (small JSON files have no LFS entry). */
async function hubMetadata() {
  const meta = new Map()
  for (const path of ['', 'onnx']) {
    const res = await fetch(`${HUB}/api/models/${MODEL_ID}/tree/main/${path}`)
    if (!res.ok) throw new Error(`Hub API: HTTP ${res.status}`)
    for (const f of await res.json()) meta.set(f.path, { size: f.lfs?.size ?? f.size, sha256: f.lfs?.oid })
  }
  return meta
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

const fmt = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`

async function download(path, expected) {
  const dest = join(outDir, path)
  if (await isValid(dest, expected)) return console.log(`✓ ${path} (already present)`)
  mkdirSync(dirname(dest), { recursive: true })
  const part = `${dest}.part`

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(`${HUB}/${MODEL_ID}/resolve/main/${path}`)
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
      return console.log(`✓ ${path} (${fmt(statSync(dest).size)}${expected?.sha256 ? ', SHA-256 verified' : ''})`)
    } catch (err) {
      rmSync(part, { force: true })
      if (attempt === RETRIES) throw new Error(`${path}: ${err.message}`)
      console.warn(`  retrying ${path} (${err.message})`)
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
}

console.log(`Downloading ${MODEL_ID} [${selected.join(', ')}] → ${outDir}`)
const meta = await hubMetadata()
let next = 0
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < files.length) {
      const path = files[next++]
      await download(path, meta.get(path))
    }
  }),
)
console.log('Done. The app loads these files instead of the Hub (see src/llm/worker.ts).')
