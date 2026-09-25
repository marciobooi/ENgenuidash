import type { GenerationOptions } from './protocol'

// Chat settings — edit these to change how the model behaves.

/**
 * Instruction sent at the start of every conversation. Kept short and in plain sentences on purpose:
 * small models (Qwen3-0.6B) tend to repeat long, Markdown-structured prompts back
 * instead of following them. The app also blocks off-topic questions
 * before they reach the model (see energyScope.ts) and adds Eurostat data to energy questions
 * (see grounding.ts); this prompt is the model-side half of that.
 */
export const SYSTEM_PROMPT = [
  'You are ENgenuidash, an assistant for European energy statistics. You only answer questions about energy.',
  'Use only the definitions, background, Eurostat data and dataset information given in the message.',
  'Background documents may contain older figures: for numbers, prefer the Eurostat data.',
  'If no Eurostat data is given, explain the concept and do not describe trends or numbers.',
  'Quote numbers with their unit, period and country.',
  'Do not cite sources, documents or dataset codes: the app shows the sources under your answer.',
  'Use only units that are listed; never invent or convert numbers or units.',
  'If the data does not answer the question, say so. Answer in two to four short sentences.',
].join(' ')

export const GENERATION: GenerationOptions = {
  /** Maximum length of each reply, in tokens. Small models drift after ~100 tokens; keep replies short. */
  max_new_tokens: 192,
  /** 0 = deterministic, higher = more varied. Low: answers must stick to the data given. */
  temperature: 0.2,
  /** Nucleus sampling cutoff (only used when temperature > 0). */
  top_p: 0.85,
  /** Values above 1 discourage repetition loops; much higher would stop it quoting numbers from the data. */
  repetition_penalty: 1.15,
}

/** Explanations of a dashboard are a little longer than answers (three or four sentences). */
export const EXPLAIN_GENERATION: GenerationOptions = { ...GENERATION, max_new_tokens: 220 }
