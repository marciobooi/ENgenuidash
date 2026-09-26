import type { ModelCase } from './modelCases'

/**
 * Held-out questions (September 2026): written after the answers were tuned on MODEL_CASES, from
 * other articles of the knowledge base, and never used to tune anything. They measure whether the
 * tuning generalises. Facts as stated in the passages (see public/data/eurostat/energy/knowledge.json).
 * Do not change the app to pass them: add new held-out questions instead, and move these to
 * MODEL_CASES if they are used for tuning.
 */
export const HOLDOUT_CASES: ModelCase[] = [
  // Natural gas price statistics
  { q: 'Which EU country had the highest household gas prices in the second half of 2025?', lang: 'en', facts: [['sweden']] },
  { q: 'Where were household gas prices lowest in the EU in the second half of 2025?', lang: 'en', facts: [['hungary']] },
  // Final energy consumption in transport / industry / services
  { q: 'What share of final energy consumption in the EU was used by transport in 2023?', lang: 'en', facts: [['32.0', '32,0', '32%', '32 %']] },
  { q: 'How much of the energy used in EU transport goes to road transport?', lang: 'en', facts: [['73.4', '73,4']] },
  { q: "What share of the EU's final energy consumption did industry account for in 2024?", lang: 'en', facts: [['23.9', '23,9']] },
  { q: 'Which energy products does EU industry use most?', lang: 'en', facts: [['electricity'], ['natural gas', 'gas']] },
  { q: 'What share of final energy consumption did the services sector use in the EU in 2024?', lang: 'en', facts: [['13.5', '13,5']] },
  // Wind and solar capacity, heavy fuel oil
  { q: 'How much higher was solar electrical capacity in the EU in 2019 than in 2000?', lang: 'en', facts: [['700']] },
  { q: 'What is heavy fuel oil mostly used for in the EU?', lang: 'en', facts: [['ship', 'navigation', 'maritime', 'marine']] },
  // Natural gas supply, oil
  { q: "What was the EU's natural gas import dependency rate in 2025?", lang: 'en', facts: [['87.6', '87,6']] },
  { q: 'How did natural gas production in the EU change in 2025?', lang: 'en', facts: [['3.2', '3,2'], ['increas', 'rose', 'grew', 'higher', 'up']], never: ['decreased by 3.2', 'fell by 3.2'] },
  { q: 'By how much have EU imports of oil from Russia fallen since 2022?', lang: 'en', facts: [['89.6', '89,6']] },
  { q: 'Which countries replaced Russian oil imports to the EU?', lang: 'en', facts: [['united states', 'norway', 'kazakhstan']] },
  // Energy production and imports, renewables (47.2% of generation; 49.9% of consumption)
  { q: "What share of the EU's electricity generation came from renewables in 2025?", lang: 'en', facts: [['47.2', '47,2', '49.9', '49,9']] },
  { q: 'What share of energy used for heating and cooling in the EU was renewable in 2025?', lang: 'en', facts: [['27.3', '27,3']] },
  // Electricity and heat statistics, agriculture, efficiency
  { q: 'How much electricity did the EU produce in 2023?', lang: 'en', facts: [['2 749', '2749', '2,749', '2.749']] },
  { q: "How much did agriculture and forestry's direct energy consumption fall in 2023?", lang: 'en', facts: [['1.1', '1,1']] },
  { q: "What was the EU's energy efficiency target for 2020?", lang: 'en', facts: [['20%', '20 %', '20 per', '1 483', '1483']] },
  // German
  { q: 'Welcher Anteil des Endenergieverbrauchs der EU entfiel 2023 auf den Verkehr?', lang: 'de', facts: [['32,0', '32.0', '32 %', '32%']] },
  { q: 'Wie hoch war die Importabhängigkeit der EU bei Erdgas im Jahr 2025?', lang: 'de', facts: [['87,6', '87.6']] },
  { q: 'In welchem EU-Land waren die Gaspreise für Haushalte in der zweiten Jahreshälfte 2025 am höchsten?', lang: 'de', facts: [['schweden', 'sweden']] },
  // French
  { q: "Quelle part de l'électricité de l'UE provenait des énergies renouvelables en 2025 ?", lang: 'fr', facts: [['47,2', '47.2', '49,9', '49.9']] },
  { q: "De combien les importations de pétrole russe de l'UE ont-elles diminué depuis 2022 ?", lang: 'fr', facts: [['89,6', '89.6']] },
  { q: "Quelle part de la consommation finale d'énergie de l'UE revenait à l'industrie en 2024 ?", lang: 'fr', facts: [['23,9', '23.9']] },
]
