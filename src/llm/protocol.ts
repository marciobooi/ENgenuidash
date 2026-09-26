
export type Role = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: Role
  content: string
}

export interface GenerationOptions {
  max_new_tokens: number
  temperature: number
  top_p: number
  repetition_penalty: number
}

export type WorkerRequest =
  /** `mobile`: phones and tablets load the small model (see device.ts and models.json). */
  /** `model`: a model key of models.json to try first (testing another model: ?model=<key>&dtype=<format>), else 'small'. */
  | { type: 'load'; mobile: boolean; model?: string; dtype?: string }
  | { type: 'generate'; messages: ChatMessage[]; options: GenerationOptions }
  | { type: 'interrupt' }
  /** Clears the conversation KV cache (new chat). */
  | { type: 'reset' }
  /**
   * Multiple choice: one forward pass, then the probability of each answer "1".."count" as the
   * next token. The model can only pick one of the options given, never write free text.
   */
  | { type: 'choose'; id: number; messages: ChatMessage[]; count: number }

/** Performance numbers for one reply (also logged to the console in development). */
export interface GenerationStats {
  /** Prompt tokens after trimming to the context budget. */
  promptTokens: number
  /** Prompt tokens served from the KV cache of the previous turn (not recomputed). */
  reusedTokens: number
  generatedTokens: number
  /** Time to first token, ms. */
  ttftMs: number
  /** Decoding speed, tokens per second. */
  tps: number
  totalMs: number
  /** Oldest turns dropped to fit the context budget. */
  droppedMessages: number
}

export interface FileProgress {
  file: string
  loaded: number
  total: number
}

export type WorkerResponse =
  | { type: 'progress'; file: string; loaded: number; total: number }
  /** `key`: the models.json key of the loaded model ('small', 'large'…). */
  | { type: 'ready'; model: string; key: string; device: 'webgpu' | 'wasm'; dtype: string; source: 'local'; loadMs: number }
  | { type: 'start' }
  | { type: 'token'; text: string; tps: number; numTokens: number }
  | { type: 'done'; stats?: GenerationStats }
  /** `fallback`: a model other than the app's small one failed to load; load 'small' in a fresh worker. */
  | { type: 'error'; message: string; fallback?: boolean }
  | { type: 'choice'; id: number; probs?: number[]; error?: string }
