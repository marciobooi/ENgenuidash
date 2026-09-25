import { useEffect, useMemo, useState } from 'react'
import { loadEnergyCodelists, loadEnergyDictionary, type EnergyCodelists, type EnergyDictionary } from '../data/eurostat'
import { createScopeChecker } from '../llm/energyScope'
import { loadGlossary } from '../llm/glossary'
import { loadKnowledge } from '../llm/knowledge'
import { buildVocabulary } from '../llm/vocabulary'

/**
 * The local data behind every answer: the Eurostat energy dictionary and codelists (topic guard,
 * planner, data lookup), the glossary, and the knowledge base (loaded when the browser is idle; it
 * also feeds the vocabulary check). Returns the topic guard and the vocabulary built from them.
 */
export function useEnergyData() {
  const [dict, setDict] = useState<EnergyDictionary | null>(null)
  const [codelists, setCodelists] = useState<EnergyCodelists | null>(null)

  useEffect(() => {
    loadEnergyDictionary().then(setDict).catch(() => setDict(null))
    loadEnergyCodelists().then(setCodelists).catch(() => setCodelists(null))
    void loadGlossary()
    // The knowledge base (~170 kB gzipped) loads in the background.
    const idle = (window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500))) as (cb: () => void) => void
    idle(() => void loadKnowledge().catch(() => undefined))
  }, [])

  const scope = useMemo(() => createScopeChecker(dict, codelists), [dict, codelists])
  // Words ENgenuidash understands (energy vocabulary, places, question words): see vocabulary.ts.
  const vocabulary = useMemo(() => buildVocabulary(dict, codelists, scope.places), [dict, codelists, scope])
  return { dict, codelists, scope, vocabulary }
}
