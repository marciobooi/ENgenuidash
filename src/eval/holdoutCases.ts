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
  { q: 'Which countries replaced Russian oil imports to the EU?', lang: 'en', facts: [['united states', 'usa', 'norway', 'kazakhstan']] },
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

/**
 * A second held-out set (September 2026), written before the change it was used to judge (on
 * computers, figure questions answered by the model from the excerpts rather than quoted), from
 * sections neither earlier set used. Same rule: never tune on it.
 */
export const VALIDATION_CASES: ModelCase[] = [
  // Electricity price statistics
  { q: 'Which EU country had the highest household electricity prices in the second half of 2025?', lang: 'en', facts: [['ireland']] },
  { q: 'What was the EU average household electricity price in the second half of 2025?', lang: 'en', facts: [['0.2896', '0,2896', '0.29', '0,29']] },
  // Energy consumption in households
  { q: "What share of the EU's final energy consumption did households represent in 2024?", lang: 'en', facts: [['26.0', '26,0', '26%', '26 %']] },
  { q: 'Which energy product covered most of household energy consumption in the EU in 2024?', lang: 'en', facts: [['natural gas', 'gas'], ['29.4', '29,4']] },
  { q: 'Which EU country relies most on electricity for household energy?', lang: 'en', facts: [['malta']] },
  { q: "What share of households' direct energy use goes to heating and cooling?", lang: 'en', facts: [['half']] },
  // Emergency oil stocks statistics
  { q: 'How much emergency oil stock did the EU hold in May 2025?', lang: 'en', facts: [['108.6', '108,6']] },
  { q: 'How many days of net imports must EU emergency oil stocks cover?', lang: 'en', facts: [['90']] },
  { q: 'What was the minimum emergency oil stock level for EU countries after July 2022?', lang: 'en', facts: [['90.3', '90,3']] },
  // Renewable energy statistics
  { q: 'Which EU country had the highest share of renewable energy in 2025?', lang: 'en', facts: [['sweden']] },
  // Natural gas supply and market
  { q: 'How much did inland demand for natural gas in the EU change in 2025?', lang: 'en', facts: [['2.5', '2,5'], ['increas', 'rose', 'grew', 'higher', 'up']] },
  { q: "Which country is the EU's largest natural gas producer?", lang: 'en', facts: [['romania']] },
  { q: 'By how much did EU natural gas imports increase in 2025?', lang: 'en', facts: [['8.4', '8,4']] },
  { q: 'How many companies imported or produced natural gas in the EU in 2024?', lang: 'en', facts: [['596']] },
  // Coal production and consumption statistics
  { q: 'Which EU countries still produce hard coal?', lang: 'en', facts: [['poland'], ['czechia', 'czech']] },
  { q: 'Which two EU countries account for most of the hard coal consumption?', lang: 'en', facts: [['poland'], ['germany']] },
  // Electricity production, consumption and market overview
  { q: 'What was total net electricity generation in the EU in 2023?', lang: 'en', facts: [['2 637', '2637', '2,637', '2.637']] },
  { q: 'Which EU country had the highest net electricity generation in 2023?', lang: 'en', facts: [['france']] },
  // German
  { q: 'Welches EU-Land hatte 2025 den höchsten Anteil erneuerbarer Energien?', lang: 'de', facts: [['schweden', 'sweden']] },
  { q: 'Wie viel Notvorrat an Öl hielt die EU im Mai 2025?', lang: 'de', facts: [['108,6', '108.6']] },
  { q: 'Welches Land ist der größte Erdgasproduzent der EU?', lang: 'de', facts: [['rumanien', 'rumänien', 'romania']] },
  // French
  { q: "Quel pays de l'UE avait les prix de l'électricité les plus élevés pour les ménages au second semestre 2025 ?", lang: 'fr', facts: [['irlande', 'ireland']] },
  { q: "Quelle part de la consommation finale d'énergie de l'UE représentaient les ménages en 2024 ?", lang: 'fr', facts: [['26,0', '26.0', '26 %', '26%']] },
  { q: "Quels pays de l'UE produisent encore de la houille ?", lang: 'fr', facts: [['pologne', 'poland'], ['tchequie', 'tchéquie', 'republique tcheque', 'czech']] },
]
