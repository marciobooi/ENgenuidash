/// <reference lib="webworker" />
import {
  AutoModelForCausalLM,
  AutoTokenizer,
  InterruptableStoppingCriteria,
  TextStreamer,
  env,
  type DynamicCache,
} from '@huggingface/transformers'
import { MODEL_ID, type ChatMessage, type GenerationStats, type WorkerRequest, type WorkerResponse } from './protocol'

type Tokenizer = Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>
type Model = Awaited<ReturnType<typeof AutoModelForCausalLM.from_pretrained>>
type Device = 'webgpu' | 'wasm'

/**
 * Prompt budget in tokens. SmolLM2 supports 8k, but prefill cost grows with length and a 360M
 * model follows instructions noticeably worse on long inputs; older turns are dropped beyond this.
 */
const MAX_INPUT_TOKENS = 1536
/** Earlier user/assistant messages kept (3 exchanges); each question carries its own context. */
const MAX_HISTORY_MESSAGES = 6

const base = new URL(import.meta.env.BASE_URL, self.location.origin).href
const post = (msg: WorkerResponse) => self.postMessage(msg)
const log = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.info('[llm]', ...args)
}

// ---------- runtime configuration ----------

// Serve the ONNX Runtime wasm binaries from our own origin instead of the jsDelivr CDN.
// Files are copied into public/ort by scripts/copy-ort.mjs (runs before dev/build).
const onnxWasm = env.backends.onnx.wasm
if (onnxWasm) {
  onnxWasm.wasmPaths = {
    mjs: `${base}ort/ort-wasm-simd-threaded.asyncify.mjs`,
    wasm: `${base}ort/ort-wasm-simd-threaded.asyncify.wasm`,
  }
  // Multi-threaded CPU inference needs cross-origin isolation (COOP/COEP headers).
  if (self.crossOriginIsolated) onnxWasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 1)
}
// Keep model files and the wasm runtime in the browser Cache API: later visits start offline.
env.useBrowserCache = true
env.useWasmCache = true

let tokenizer: Tokenizer | null = null
let model: Model | null = null
let loading: Promise<void> | null = null
let busy = false
const stopping = new InterruptableStoppingCriteria()

// KV cache of the previous turn and the token ids it covers. When the next prompt starts with
// exactly these tokens (system prompt + earlier turns), only the new tokens are processed.
let cache: DynamicCache | null = null
let cachedIds: bigint[] = []

async function resetCache() {
  await cache?.dispose()
  cache = null
  cachedIds = []
}

// ---------- loading ----------

// Prefer model files placed in public/models (scripts/download-model.mjs) so the app
// works fully offline. Otherwise fetch once from the Hugging Face Hub.
async function hasLocalModel(): Promise<boolean> {
  try {
    const res = await fetch(`${base}models/${MODEL_ID}/config.json`, { method: 'HEAD' })
    // The Vite dev server answers unknown paths with index.html, so check the type.
    return res.ok && (res.headers.get('content-type') ?? '').includes('json')
  } catch {
    return false
  }
}

interface GpuAdapter {
  features: Set<string>
}

/** Picks the fastest supported backend and the matching weight format. */
async function selectRuntime(): Promise<{ device: Device; dtype: 'q4f16' | 'q4' | 'q8' }> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<GpuAdapter | null> } }).gpu
  try {
    const adapter = await gpu?.requestAdapter()
    if (adapter) {
      // fp16 shaders halve memory traffic; without them q4f16 fails, so use q4 (fp32 activations).
      return { device: 'webgpu', dtype: adapter.features.has('shader-f16') ? 'q4f16' : 'q4' }
    }
  } catch {
    // fall through to CPU
  }
  // On CPU (WASM), 8-bit weights run faster than 4-bit ones.
  return { device: 'wasm', dtype: 'q8' }
}

async function load() {
  const started = performance.now()
  const [local, runtime] = await Promise.all([hasLocalModel(), selectRuntime()])
  env.allowLocalModels = local
  env.allowRemoteModels = !local
  env.localModelPath = `${base}models/`

  const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status === 'progress' && p.file) {
      post({ type: 'progress', file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0 })
    }
  }

  // Tokenizer and weights download in parallel.
  ;[tokenizer, model] = await Promise.all([
    AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback }),
    AutoModelForCausalLM.from_pretrained(MODEL_ID, { device: runtime.device, dtype: runtime.dtype, progress_callback }),
  ])

  // Warm-up: compiles WebGPU shaders / initialises kernels so the first reply is not slow.
  const warm = tokenizer('Energy')
  await model.generate({ ...warm, max_new_tokens: 1 })

  const loadMs = Math.round(performance.now() - started)
  log(`ready: ${runtime.device}/${runtime.dtype} from ${local ? 'local files' : 'hub/cache'} in ${loadMs} ms`)
  post({ type: 'ready', device: runtime.device, dtype: runtime.dtype, source: local ? 'local' : 'hub', loadMs })
}

// ---------- prompt building ----------

function tokenize(messages: ChatMessage[]) {
  return tokenizer!.apply_chat_template(messages, { add_generation_prompt: true, return_dict: true }) as {
    input_ids: { dims: number[]; data: BigInt64Array; tolist(): bigint[][] }
    attention_mask: unknown
  }
}

/** Drops the oldest user/assistant turns until the prompt fits MAX_INPUT_TOKENS. */
function fitToBudget(messages: ChatMessage[]) {
  const system = messages[0]?.role === 'system' ? [messages[0]] : []
  let turns = messages.slice(system.length)
  let dropped = 0
  // Keep the latest question plus at most MAX_HISTORY_MESSAGES earlier messages.
  while (turns.length > MAX_HISTORY_MESSAGES + 1) {
    const cut = turns[1]?.role === 'assistant' ? 2 : 1
    turns = turns.slice(cut)
    dropped += cut
  }
  let inputs = tokenize([...system, ...turns])
  while (inputs.input_ids.dims[1] > MAX_INPUT_TOKENS && turns.length > 1) {
    // Remove the oldest turn (and its answer) but always keep the latest question.
    const cut = turns[1]?.role === 'assistant' ? 2 : 1
    turns = turns.slice(cut)
    dropped += cut
    inputs = tokenize([...system, ...turns])
  }
  return { inputs, dropped }
}

/** Length of the shared prefix between the cached tokens and the new prompt. */
function sharedPrefix(ids: BigInt64Array): number {
  const n = Math.min(cachedIds.length, ids.length)
  let i = 0
  while (i < n && cachedIds[i] === ids[i]) i++
  return i
}

// ---------- generation ----------

async function generate({ messages, options }: Extract<WorkerRequest, { type: 'generate' }>) {
  if (!tokenizer || !model) throw new Error('Model is not loaded yet.')
  if (busy) throw new Error('A reply is already being generated.')
  busy = true
  const started = performance.now()

  try {
    const { inputs, dropped } = fitToBudget(messages)
    const ids = inputs.input_ids.data

    // The cache covers every token except the last one sampled. Reuse it only if the new
    // prompt extends it exactly; otherwise (edited history, trimmed turns) start fresh.
    const pastLength = cache?.get_seq_length() ?? 0
    const reusable = cache !== null && pastLength > 0 && sharedPrefix(ids) >= pastLength && ids.length > pastLength
    if (!reusable) await resetCache()
    const reusedTokens = reusable ? pastLength : 0

    let firstTokenAt = 0
    let generatedTokens = 0
    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      token_callback_function: () => {
        firstTokenAt ||= performance.now()
        generatedTokens++
      },
      callback_function: (text: string) => {
        const elapsed = performance.now() - firstTokenAt
        const tps = generatedTokens > 1 && elapsed > 0 ? ((generatedTokens - 1) / elapsed) * 1000 : 0
        post({ type: 'token', text, tps, numTokens: generatedTokens })
      },
    })

    stopping.reset()
    post({ type: 'start' })
    const output = (await model.generate({
      ...inputs,
      ...(reusable ? { past_key_values: cache } : {}),
      max_new_tokens: options.max_new_tokens,
      do_sample: options.temperature > 0,
      temperature: options.temperature,
      top_p: options.top_p,
      repetition_penalty: options.repetition_penalty,
      streamer,
      stopping_criteria: stopping,
      return_dict_in_generate: true,
    })) as unknown as { sequences: { tolist(): bigint[][] }; past_key_values: DynamicCache }

    // Keep this turn's cache for the next one (the previous cache object was updated in place
    // or replaced; dispose it only if it is a different object).
    if (cache && cache !== output.past_key_values) await cache.dispose()
    cache = output.past_key_values
    cachedIds = output.sequences.tolist()[0]

    const end = performance.now()
    const decodeMs = firstTokenAt ? end - firstTokenAt : 0
    const stats: GenerationStats = {
      promptTokens: ids.length,
      reusedTokens,
      generatedTokens,
      ttftMs: Math.round((firstTokenAt || end) - started),
      tps: generatedTokens > 1 && decodeMs > 0 ? Math.round(((generatedTokens - 1) / decodeMs) * 10000) / 10 : 0,
      totalMs: Math.round(end - started),
      droppedMessages: dropped,
    }
    log(`reply: ${JSON.stringify(stats)}`)
    post({ type: 'done', stats })
  } catch (err) {
    // A failed or interrupted run leaves the cache in an unknown state.
    await resetCache()
    throw err
  } finally {
    busy = false
  }
}

self.addEventListener('message', async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  try {
    switch (msg.type) {
      case 'load':
        loading ??= load()
        await loading
        break
      case 'generate':
        await generate(msg)
        break
      case 'interrupt':
        stopping.interrupt()
        break
      case 'reset':
        await resetCache()
        break
    }
  } catch (err) {
    if (msg.type === 'load') loading = null
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
})
