import type { IntentId } from '../genui/intent'

/**
 * Questions the rules do not read, labelled with the dashboard they ask for ('none': there is no
 * dashboard to offer: a definition, small talk, or not about energy dashboards). They measure
 * whether the on-device model's choice (src/genui/intent.ts) is good enough to offer, and when to
 * trust it (src/eval/IntentEval.tsx). `alt`: other kinds that also answer the question. Tune the
 * prompt on INTENT_CASES only; INTENT_HOLDOUT is run once, to report, and is never tuned on (like
 * the other holdout sets: src/eval/holdoutCases.ts). The sets are written the way people talk:
 * telegraphic, chatty, typos, a story before the question, other languages, energy-adjacent
 * questions that are not a dashboard. (Second generation of the sets: the first was replaced
 * after its holdout run.)
 */
export interface IntentCase {
  text: string
  /** The language it is written in (other EU languages are read by the same rules and model). */
  lang: 'en' | 'de' | 'fr' | 'es' | 'it' | 'pl'
  intent: IntentId | 'none'
  alt?: IntentId[]
}

export const INTENT_CASES: IntentCase[] = [
  // profile
  { text: 'my professor asked which EU country is doing best on energy, so what about Denmark', lang: 'en', intent: 'profile' },
  { text: 'is Germany more dependent on imports than France', lang: 'en', intent: 'profile', alt: ['balance'] },
  { text: 'Croatia snapshot pls', lang: 'en', intent: 'profile' },
  { text: 'uh so like how is lithuania on the whole', lang: 'en', intent: 'profile' },
  { text: 'Portugal vs Spain, who is greener and more efficient', lang: 'en', intent: 'profile', alt: ['renewables'] },
  { text: 'Wo steht Tschechien im EU-Vergleich?', lang: 'de', intent: 'profile' },
  { text: 'quiero un resumen de la energía en Rumanía', lang: 'es', intent: 'profile' },
  { text: 'come se la cava la Slovacchia con i consumi e le emissioni', lang: 'it', intent: 'profile' },
  { text: "cartes sur table : l'énergie en Hongrie", lang: 'fr', intent: 'profile' },
  // flow
  { text: 'where does every bit of Spanish energy end up', lang: 'en', intent: 'flow' },
  { text: 'need a sankey-like picture of what goes in and out of the Polish power sector', lang: 'en', intent: 'flow' },
  { text: 'how much is lost when Germany turns coal into electricity', lang: 'en', intent: 'flow', alt: ['balance'] },
  { text: 'the whole chain for Italy: imports, refineries, power plants, end users', lang: 'en', intent: 'flow' },
  { text: 'mostra i flussi energetici della Francia', lang: 'it', intent: 'flow' },
  { text: 'Wege der Energie in Schweden von der Gewinnung bis zum Endverbrauch', lang: 'de', intent: 'flow' },
  { text: "de la production à l'usage final, tout le circuit pour la Belgique", lang: 'fr', intent: 'flow' },
  { text: 'przepływ energii w Polsce', lang: 'pl', intent: 'flow' },
  // households
  { text: 'my flat in Warsaw is freezing, what do Poles heat their homes with', lang: 'en', intent: 'households' },
  { text: 'do families in Greece cook with gas or electricity', lang: 'en', intent: 'households' },
  { text: 'domestic energy in Finland: heating vs lights and appliances', lang: 'en', intent: 'households' },
  { text: 'home heating split in the Netherlands', lang: 'en', intent: 'households' },
  { text: 'Womit wird in österreichischen Wohnungen geheizt?', lang: 'de', intent: 'households' },
  { text: "l'énergie consommée par les ménages irlandais, à quoi sert-elle", lang: 'fr', intent: 'households' },
  { text: 'consumo de las casas en España por uso', lang: 'es', intent: 'households' },
  // oil
  { text: "what's the deal with petrol stockpiles in the EU", lang: 'en', intent: 'oil' },
  { text: 'wats the oil sitiation in itlay', lang: 'en', intent: 'oil' },
  { text: 'if Iran closes Hormuz how bad is it for us', lang: 'en', intent: 'oil' },
  { text: 'Russland Sanktionen Öl Abhängigkeit Bulgarien', lang: 'de', intent: 'oil' },
  { text: 'combien de temps tiendrait la Grèce sans pétrole importé', lang: 'fr', intent: 'oil' },
  { text: 'kraje UE zależne od ropy z Rosji', lang: 'pl', intent: 'oil' },
  { text: 'crude arriving by tanker vs pipeline, which countries, since 2022', lang: 'en', intent: 'oil', alt: ['trade'] },
  // trade
  { text: 'uh so where does poland get its coal', lang: 'en', intent: 'trade' },
  { text: 'Hungary buys gas from whom', lang: 'en', intent: 'trade' },
  { text: 'biggest electricity suppliers to Italy', lang: 'en', intent: 'trade' },
  { text: 'is Norway still selling gas to Germany', lang: 'en', intent: 'trade' },
  { text: 'importaciones de gas de España por país', lang: 'es', intent: 'trade' },
  { text: 'Lieferländer für Steinkohle in Österreich', lang: 'de', intent: 'trade' },
  { text: "l'Espagne, ses fournisseurs de GNL", lang: 'fr', intent: 'trade' },
  { text: 'skąd Niemcy biorą gaz', lang: 'pl', intent: 'trade' },
  // prices
  { text: 'was the winter bill in Ireland really that awful', lang: 'en', intent: 'prices' },
  { text: 'cheapest country to run a factory on electricity', lang: 'en', intent: 'prices' },
  { text: 'gas tariffs for homes across the EU', lang: 'en', intent: 'prices' },
  { text: 'price per kWh in Cyprus, and how much of it is tax', lang: 'en', intent: 'prices' },
  { text: 'Strom in Dänemark so teuer?', lang: 'de', intent: 'prices' },
  { text: 'precio de la luz en Portugal', lang: 'es', intent: 'prices' },
  { text: "l'électricité pour les entreprises coûte combien en Belgique", lang: 'fr', intent: 'prices' },
  // balance
  { text: 'Excel-style table of everything Germany produces and burns', lang: 'en', intent: 'balance' },
  { text: 'I need the official numbers by fuel for Italy, primary production, imports, exports, stock changes', lang: 'en', intent: 'balance' },
  { text: 'coal, gas, oil, nuclear, renewables: how much of each for Slovakia, in ktoe', lang: 'en', intent: 'balance' },
  { text: 'Poland gross available energy detail', lang: 'en', intent: 'balance' },
  { text: 'quanta energia produce e consuma la Spagna per prodotto', lang: 'it', intent: 'balance' },
  { text: 'Energieaufkommen und -verwendung in Frankreich nach Energieträgern', lang: 'de', intent: 'balance' },
  { text: 'toutes les lignes du bilan pour la Suède', lang: 'fr', intent: 'balance' },
  // renewables
  { text: 'is Denmark actually running on wind', lang: 'en', intent: 'renewables', alt: ['profile'] },
  { text: 'will Poland hit 42.5% by 2030', lang: 'en', intent: 'renewables' },
  { text: 'greenest grid in Europe', lang: 'en', intent: 'renewables', alt: ['profile'] },
  { text: 'solar boom Spain, how much of the mix now', lang: 'en', intent: 'renewables' },
  { text: 'Klimaziele 2030 Österreich Fortschritt beim Ökostrom', lang: 'de', intent: 'renewables' },
  { text: 'objectif de 42,5 % en 2030 : où en est l’Allemagne', lang: 'fr', intent: 'renewables' },
  { text: 'quota di rinnovabili in Italia', lang: 'it', intent: 'renewables' },
  // none (energy-adjacent or not)
  { text: 'should we build more nuclear plants', lang: 'en', intent: 'none' },
  { text: 'how does a wind turbine actually work', lang: 'en', intent: 'none' },
  { text: 'ok cool', lang: 'en', intent: 'none' },
  { text: 'can you help me write an email to my landlord about the heating', lang: 'en', intent: 'none' },
  { text: 'what is the best electric car', lang: 'en', intent: 'none' },
  { text: 'Wie funktioniert eine Wärmepumpe?', lang: 'de', intent: 'none' },
  { text: 'raconte-moi une blague sur les Belges', lang: 'fr', intent: 'none' },
  { text: 'who won the 2022 world cup', lang: 'en', intent: 'none' },
  { text: 'translate good morning into Polish', lang: 'en', intent: 'none' },
]
