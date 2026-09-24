export const MODEL_ID = 'HuggingFaceTB/SmolLM2-360M-Instruct'

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
  | { type: 'load' }
  | { type: 'generate'; messages: ChatMessage[]; options: GenerationOptions }
  | { type: 'interrupt' }
  /** Clears the conversation KV cache (new chat). */
  | { type: 'reset' }

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
  | { type: 'ready'; device: 'webgpu' | 'wasm'; dtype: string; source: 'local' | 'hub'; loadMs: number }
  | { type: 'start' }
  | { type: 'token'; text: string; tps: number; numTokens: number }
  | { type: 'done'; stats?: GenerationStats }
  | { type: 'error'; message: string }
