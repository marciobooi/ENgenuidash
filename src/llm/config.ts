import type { GenerationOptions } from './protocol'

// Chat settings — edit these to change how the model behaves.

/**
 * Instruction sent at the start of every conversation. Kept short and in plain sentences on purpose:
 * small models (Qwen3-0.6B) tend to repeat long, Markdown-structured prompts back
 * instead of following them. The app also blocks off-topic questions
 * before they reach the model (see energyScope.ts) and adds Eurostat data to energy questions
 * (see grounding.ts); this prompt is the model-side half of that.
 */
// Tuned on the knowledge-base questions (src/eval/modelCases.ts, 24 questions, greedy decoding):
// answering first with the matching figure, and using the documents' figures when there is no
// data slice, took Qwen3-0.6B from 17 to 18 correct. (The earlier rule "without Eurostat data, do
// not describe numbers" kept it from quoting the figures the documents give.)
export const SYSTEM_PROMPT = [
  'You are ENgenuidash, an assistant for European energy statistics. You only answer questions about energy.',
  'Answer the question in the first sentence, with the figure from the message that answers it: the same indicator, year and place as asked.',
  'Use only the definitions, background, Eurostat data and dataset information given in the message.',
  'Background documents may contain older figures: for numbers, prefer the Eurostat data; without Eurostat data, use the figures of the background documents with their year.',
  'Quote numbers with their unit, period and country.',
  'Do not cite sources, documents or dataset codes: the app shows the sources under your answer.',
  'Use only units that are listed; never invent or convert numbers or units.',
  'If the message does not answer the question, say so. Answer in two to four short sentences.',
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
