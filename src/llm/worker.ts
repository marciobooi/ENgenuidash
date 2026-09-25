/// <reference lib="webworker" />
import {
  AutoModelForCausalLM,
  AutoTokenizer,
  InterruptableStoppingCriteria,
  StoppingCriteria,
  Tensor,
  TextStreamer,
  env,
  type DynamicCache,
} from '@huggingface/transformers'
import type { ChatMessage, GenerationOptions, GenerationStats, WorkerRequest, WorkerResponse } from './protocol'
import { ThinkingFilter } from './thinking'

type Tokenizer = Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>
type Model = Awaited<ReturnType<typeof AutoModelForCausalLM.from_pretrained>>
type Device = 'webgpu' | 'wasm'

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

// Models are served by this app from public/models (downloaded at dev/build time by
// scripts/ensure-model.mjs, listed in public/models/manifest.json). The browser never contacts
// the Hugging Face Hub.

/** 'small' is the app's model; any other key of models.json is tried on request (?model=…). */
type ModelKey = string

/** A downloaded model: its settings (from src/llm/models.json) and each format's part dtypes. */
interface ModelEntry {
  id: string
  dtypes: Record<string, Record<string, string>>
  /** Prompt budget; older turns are dropped beyond it (small models follow long prompts worse). */
  maxInputTokens?: number
  /** Reuse the KV cache across turns (off for hybrid-attention models). */
  reuseCache?: boolean
  /** Chat-template variables, e.g. { enable_thinking: false }. */
  chatTemplate?: Record<string, unknown>
  /** Reason (hidden) before free-form answers, for at most thinkingBudget tokens. */
  thinking?: boolean
  thinkingBudget?: number
  /** Overrides of the app's generation options for free-form answers. */
  generation?: Partial<GenerationOptions>
}

/** public/models/manifest.json, written by scripts/download-model.mjs. */
type Manifest = Partial<Record<ModelKey, ModelEntry>>
interface Candidate {
  key: ModelKey
  device: Device
  dtype: 'q4f16' | 'q4' | 'q8'
}

/** The loaded model and its settings. */
let active: ModelEntry | null = null

async function readManifest(): Promise<Manifest | null> {
  try {
    const res = await fetch(`${base}models/manifest.json`, { cache: 'no-cache' })
    // The Vite dev server answers unknown paths with index.html, so check the type.
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null
    return (await res.json()) as Manifest
  } catch {
    return null
  }
}

interface GpuAdapter {
  features: Set<string>
}

async function gpuSupport(): Promise<{ webgpu: boolean; f16: boolean }> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<GpuAdapter | null> } }).gpu
  try {
    const adapter = await gpu?.requestAdapter()
    if (adapter) return { webgpu: true, f16: adapter.features.has('shader-f16') }
  } catch {
    // no usable GPU
  }
  return { webgpu: false, f16: false }
}

/**
 * Formats to try, best first: q4f16 on WebGPU with fp16 shaders, q4 on other WebGPU devices
 * (q4f16 fails without fp16). On CPU (WASM), computers use q8 (faster there) and phones q4 (half
 * the download).
 */
function candidates(mobile: boolean, gpu: { webgpu: boolean; f16: boolean }, manifest: Manifest, preferred?: ModelKey, dtype?: string): Candidate[] {
  const has = (key: ModelKey, dtype: string) => !!manifest[key]?.dtypes[dtype]
  const forKey = (key: ModelKey): Candidate[] => {
    const out: Candidate[] = []
    if (gpu.webgpu && gpu.f16 && has(key, 'q4f16')) out.push({ key, device: 'webgpu', dtype: 'q4f16' })
    else if (gpu.webgpu && has(key, 'q4')) out.push({ key, device: 'webgpu', dtype: 'q4' })
    const cpu: Candidate['dtype'][] = mobile ? ['q4', 'q8'] : ['q8', 'q4']
    const onCpu = cpu.find((d) => has(key, d))
    if (onCpu) out.push({ key, device: 'wasm', dtype: onCpu })
    return out
  }
  // A model (and format) asked for, to test it, first; the app's model stays the fallback.
  const asked = preferred && manifest[preferred] ? preferred : undefined
  const forced: Candidate[] =
    asked && dtype && has(asked, dtype)
      ? [
          ...(gpu.webgpu ? [{ key: asked, device: 'webgpu' as Device, dtype: dtype as Candidate['dtype'] }] : []),
          { key: asked, device: 'wasm', dtype: dtype as Candidate['dtype'] },
        ]
      : []
  return [...forced, ...(asked && asked !== 'small' && !forced.length ? forKey(asked) : []), ...forKey('small')]
}

async function loadCandidate(c: Candidate, manifest: Manifest) {
  const spec = manifest[c.key]!
  const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status === 'progress' && p.file) {
      post({ type: 'progress', file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0 })
    }
  }
  // Tokenizer and weights download in parallel. The dtype is given per part (e.g. embed_tokens,
  // decoder_model_merged), as recorded by the download script.
  const [tok, mdl] = await Promise.all([
    AutoTokenizer.from_pretrained(spec.id, { progress_callback }),
    AutoModelForCausalLM.from_pretrained(spec.id, {
      device: c.device,
      dtype: spec.dtypes[c.dtype] as Record<string, 'q4f16' | 'q4' | 'q8' | 'fp16' | 'fp32'>,
      progress_callback,
    }),
  ])
  tokenizer = tok
  model = mdl
  active = spec
  // Warm-up: compiles WebGPU shaders / initialises kernels so the first reply is not slow.
  const warm = tokenizer('Energy')
  await model.generate({ ...warm, max_new_tokens: 1 })
}

async function load(mobile: boolean, preferred?: ModelKey, dtype?: string) {
  const started = performance.now()
  const [manifest, gpu] = await Promise.all([readManifest(), gpuSupport()])
  if (!manifest) throw new Error('No language model in public/models (run npm run model:download).')
  env.allowLocalModels = true
  env.allowRemoteModels = false
  // A path, not a full URL: Transformers.js skips its existence check for local files given as
  // URLs, and with remote models off it then treats tokenizer_config.json as missing.
  env.localModelPath = new URL(`${base}models/`).pathname

  const list = candidates(mobile, gpu, manifest, preferred, dtype)
  if (!list.length) throw new Error('No downloaded model runs on this device.')
  let lastError: unknown
  for (const c of list) {
    try {
      await loadCandidate(c, manifest)
      const loadMs = Math.round(performance.now() - started)
      log(`ready: ${active!.id} ${c.device}/${c.dtype} (${mobile ? 'mobile' : 'computer'}) in ${loadMs} ms`)
      post({ type: 'ready', model: active!.id, device: c.device, dtype: c.dtype, source: 'local', loadMs })
      return
    } catch (err) {
      // e.g. an operator the browser's WebGPU does not support: try the next (smaller) option.
      log(`could not load ${manifest[c.key]!.id} ${c.device}/${c.dtype}:`, err)
      lastError = err
      await model?.dispose()
      model = null
      tokenizer = null
      active = null
    }
  }
  throw lastError
}

// ---------- prompt building ----------

/** Chat template → token ids. `thinking` switches the model's reasoning on (free-form answers). */
function tokenize(messages: ChatMessage[], thinking = false) {
  const vars = { ...active?.chatTemplate, ...(thinking ? { enable_thinking: true } : {}) }
  return tokenizer!.apply_chat_template(messages, { add_generation_prompt: true, return_dict: true, ...vars }) as {
    input_ids: { dims: number[]; data: BigInt64Array; tolist(): bigint[][] }
    attention_mask: unknown
  }
}

/** Drops the oldest user/assistant turns until the prompt fits the model's input budget. */
function fitToBudget(messages: ChatMessage[], thinking = false) {
  const system = messages[0]?.role === 'system' ? [messages[0]] : []
  let turns = messages.slice(system.length)
  let dropped = 0
  // Keep the latest question plus at most MAX_HISTORY_MESSAGES earlier messages.
  while (turns.length > MAX_HISTORY_MESSAGES + 1) {
    const cut = turns[1]?.role === 'assistant' ? 2 : 1
    turns = turns.slice(cut)
    dropped += cut
  }
  let inputs = tokenize([...system, ...turns], thinking)
  while (inputs.input_ids.dims[1] > (active?.maxInputTokens ?? 1536) && turns.length > 1) {
    // Remove the oldest turn (and its answer) but always keep the latest question.
    const cut = turns[1]?.role === 'assistant' ? 2 : 1
    turns = turns.slice(cut)
    dropped += cut
    inputs = tokenize([...system, ...turns], thinking)
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

/** Stops generation when `limitReached()` says so (e.g. reasoning ran past its budget). */
class StopWhen extends StoppingCriteria {
  private limitReached: () => boolean
  constructor(limitReached: () => boolean) {
    super()
    this.limitReached = limitReached
  }
  _call(input_ids: number[][]) {
    return input_ids.map(() => this.limitReached())
  }
}

type GenerateOutput = { sequences: { tolist(): bigint[][] }; past_key_values: DynamicCache }

async function generate({ messages, options }: Extract<WorkerRequest, { type: 'generate' }>) {
  if (!tokenizer || !model) throw new Error('Model is not loaded yet.')
  if (busy) throw new Error('A reply is already being generated.')
  busy = true
  const started = performance.now()

  try {
    // Models with thinking reason first (hidden), for at most `budget` tokens, then answer.
    const thinking = !!active?.thinking
    const budget = active?.thinkingBudget ?? 512
    const gen = { ...options, ...active?.generation }
    const { inputs, dropped } = fitToBudget(messages, thinking)
    const ids = inputs.input_ids.data
    // Did the chat template already open the reasoning block ("…assistant\n<think>\n")?
    const promptTail = thinking ? tokenizer.decode(Array.from(ids.slice(-4), Number), { skip_special_tokens: false }) : ''
    const filter = new ThinkingFilter({ promptOpened: /<think>\s*$/.test(promptTail) })

    // The cache covers every token except the last one sampled. Reuse it only if the new
    // prompt extends it exactly; otherwise (edited history, trimmed turns) start fresh.
    const pastLength = cache?.get_seq_length() ?? 0
    const reusable = !!active?.reuseCache && cache !== null && pastLength > 0 && sharedPrefix(ids) >= pastLength && ids.length > pastLength
    if (!reusable) await resetCache()
    const reusedTokens = reusable ? pastLength : 0

    let firstTokenAt = 0
    let generatedTokens = 0
    const makeStreamer = () =>
      new TextStreamer(tokenizer!, {
        skip_prompt: true,
        skip_special_tokens: true,
        token_callback_function: () => {
          firstTokenAt ||= performance.now()
          generatedTokens++
        },
        callback_function: (raw: string) => {
          // Only the answer is shown: the reasoning block (if any) is filtered out.
          const text = filter.push(raw)
          if (!text) return
          const elapsed = performance.now() - firstTokenAt
          const tps = generatedTokens > 1 && elapsed > 0 ? ((generatedTokens - 1) / elapsed) * 1000 : 0
          post({ type: 'token', text, tps, numTokens: generatedTokens })
        },
      })
    const sampling = {
      do_sample: gen.temperature > 0,
      temperature: gen.temperature,
      top_p: gen.top_p,
      repetition_penalty: gen.repetition_penalty,
      return_dict_in_generate: true,
    }

    stopping.reset()
    post({ type: 'start' })
    let output = (await model.generate({
      ...inputs,
      ...(reusable ? { past_key_values: cache } : {}),
      ...sampling,
      max_new_tokens: thinking ? budget + gen.max_new_tokens : gen.max_new_tokens,
      streamer: makeStreamer(),
      stopping_criteria: [stopping, new StopWhen(() => thinking && filter.thinking && generatedTokens >= budget)],
    })) as unknown as GenerateOutput

    // Reasoning hit its budget: close it ourselves and let the model answer from what it has.
    if (thinking && !filter.answering && !stopping.interrupted) {
      const closing = tokenizer.encode('\n</think>\n\n', { add_special_tokens: false })
      const next = [...output.sequences.tolist()[0], ...closing.map(BigInt)]
      filter.forceAnswer()
      await output.past_key_values?.dispose()
      log(`thinking budget (${budget} tokens) reached: answering`)
      output = (await model.generate({
        input_ids: new Tensor('int64', BigInt64Array.from(next), [1, next.length]),
        attention_mask: new Tensor('int64', new BigInt64Array(next.length).fill(1n), [1, next.length]),
        ...sampling,
        max_new_tokens: gen.max_new_tokens,
        streamer: makeStreamer(),
        stopping_criteria: stopping,
      })) as unknown as GenerateOutput
    }

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

// ---------- multiple choice ----------

/**
 * Scores a numbered menu: runs the prompt once and reads the next-token probabilities of the
 * answers "1".."count" (softmax over those tokens only). No sampling, so the result is
 * deterministic and always one of the options.
 */
async function choose({ id, messages, count }: Extract<WorkerRequest, { type: 'choose' }>) {
  if (!tokenizer || !model) throw new Error('Model is not loaded yet.')
  if (busy) throw new Error('The model is busy.')
  if (count < 1 || count > 9) throw new Error('Between 1 and 9 options are supported.')
  busy = true
  const started = performance.now()
  let outputs: Record<string, Tensor> | null = null
  try {
    const inputs = tokenize(messages)
    outputs = (await model(inputs)) as unknown as Record<string, Tensor>
    const last = outputs.logits.slice(null, -1, null).to('float32')
    const logits = last.data as Float32Array
    const scores = Array.from({ length: count }, (_, i) => {
      const [token] = tokenizer!.encode(String(i + 1), { add_special_tokens: false })
      return logits[token]
    })
    last.dispose()
    const max = Math.max(...scores)
    const exps = scores.map((s) => Math.exp(s - max))
    const sum = exps.reduce((a, b) => a + b, 0)
    const probs = exps.map((e) => e / sum)
    log(`choose: ${inputs.input_ids.dims[1]} tokens, ${Math.round(performance.now() - started)} ms, ${probs.map((p) => p.toFixed(2)).join(' ')}`)
    post({ type: 'choice', id, probs })
  } finally {
    // Free every output (logits and the per-layer key/value tensors, possibly on the GPU).
    for (const t of Object.values(outputs ?? {})) t?.dispose?.()
    busy = false
  }
}

self.addEventListener('message', async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  try {
    switch (msg.type) {
      case 'load':
        loading ??= load(msg.mobile, msg.model as ModelKey | undefined, msg.dtype)
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
      case 'choose':
        await choose(msg)
        break
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (msg.type === 'choose') return post({ type: 'choice', id: msg.id, error: message })
    if (msg.type === 'load') loading = null
    post({ type: 'error', message })
  }
})
