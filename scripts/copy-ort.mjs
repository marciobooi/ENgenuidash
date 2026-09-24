// Copies the ONNX Runtime Web wasm binaries into public/ort so inference
// never depends on a CDN. Runs automatically before `dev` and `build`.
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(join(process.cwd(), 'node_modules/@huggingface/transformers/package.json'))
// Resolve the copy transformers.js actually uses (its package.json isn't exported).
const ortEntry = require.resolve('onnxruntime-web')
const ortDist = ortEntry.slice(0, ortEntry.lastIndexOf('/dist/') + '/dist'.length)
const out = join(process.cwd(), 'public/ort')
mkdirSync(out, { recursive: true })

for (const f of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) {
  copyFileSync(join(ortDist, f), join(out, f))
}
console.log(`Copied ONNX Runtime wasm files to ${out}`)
