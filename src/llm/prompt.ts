import type { EnergyCodelists, EnergyDictionary } from '../data/eurostat'
import { questionLanguage } from './crossLingual'
import { groundQuestion, type Source } from './grounding'

/**
 * The prompt for a written answer: the question, the verified background (definitions, passages,
 * dataset information, a data slice unless the question is conceptual) and the answer language.
 * Shared by the chat and the evaluation page, so the evaluation measures what users get.
 */
export async function modelPrompt(
  question: string,
  dict: EnergyDictionary | null,
  codelists: EnergyCodelists | null,
  lang: string,
  { conceptual = false, signal, searchWith }: { conceptual?: boolean; signal?: AbortSignal; searchWith?: string } = {},
): Promise<{ prompt: string; sources: Source[] }> {
  const g = await groundQuestion(searchWith ?? question, dict, codelists, lang, signal, { includeData: !conceptual })
  // The background is English; say which language to answer in, every time (the history may
  // hold an earlier "Answer in German.").
  const answerIn = { en: 'Answer in English.', de: 'Answer in German.', fr: 'Answer in French.' }[questionLanguage(question, lang)]
  return { prompt: [question, g.context, answerIn].filter(Boolean).join('\n\n'), sources: g.sources }
}
