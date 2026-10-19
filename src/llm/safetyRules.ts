/**
 * Requests that are refused before anything else (the model is never called), written as plain word
 * combinations: a rule fires when, in ONE SENTENCE, a word of its `act` list and a word of its `on`
 * list both appear. Words are matched by their beginning ("sabotag" covers sabotage, sabotaging),
 * after lower-casing and removing accents. To block something new, add words to a list or a rule;
 * to allow something, add a word to SAFE_CONTEXT. The tests (src/llm/scope.test.ts, eval/scopeCases.ts)
 * run every rule against harmful requests and against legitimate energy questions.
 */

export interface SafetyRule {
  name: string
  /** What is done. */
  act: string[]
  /** What it is done to (omit: the act alone is enough). */
  on?: string[]
  /** The rule needs no "safe" word to be overruled: weapons are refused in any context. */
  always?: boolean
}

/** What energy systems are made of (EN/DE/FR). */
const INFRASTRUCTURE = [
  'power plant', 'power station', 'powerplant', 'nuclear plant', 'nuclear facilit', 'nuclear site', 'reactor', 'grid', 'pipeline', 'refiner', 'substation', 'transformer', 'dam ', 'wind farm', 'solar farm',
  'gas network', 'gas storage', 'lng terminal', 'oil rig', 'oil depot', 'tanker', 'meter', 'energy infrastructure', 'energy sector', 'energy system', 'electricity supply', 'power supply', 'gas supply', 'power line', 'utility', 'utilities', 'the power', 'electricity', 'power to', 'power in', 'the lights', 'power of a', 'power of the',
  'kraftwerk', 'atomkraftwerk', 'akw', 'stromnetz', 'gasnetz', 'raffinerie', 'umspannwerk', 'kernkraft',
  'centrale', 'reseau', 'gazoduc', 'oleoduc', 'barrage', 'electricite', 'courant',
]

export const SAFETY_RULES: SafetyRule[] = [
  // Weapons and explosives: refused in any context.
  { name: 'weapons', always: true, act: ['bomb', 'atom bomb', 'atombombe', 'nuclear weapon', 'atomic weapon', 'kernwaffe', 'arme nucleaire', 'warhead', 'explosive', 'sprengstoff', 'molotov', 'detonator', 'grenade', 'dirty bomb', 'weapon', 'waffe', 'bombe'] },
  { name: 'weapons-material', always: true, act: ['enrich', 'weaponi', 'smuggl', 'steal', 'illegally', 'acquire', 'obtain'], on: ['uranium', 'plutonium', 'radioactive', 'nuclear material', 'nuclear fuel', 'enriched'] },
  // Attacks on energy infrastructure.
  {
    name: 'attack-infrastructure',
    act: ['sabotag', 'sabotier', 'saboter', 'blow up', 'blowing up', 'bomb', 'attack', 'angreif', 'anschlag', 'attaquer', 'destroy', 'zerstor', 'detruire', 'hack', 'pirater', 'cyberattack', 'cyber attack', 'terror', 'poison', 'contaminat', 'hijack', 'set fire', 'burn down', 'torch', 'explod', 'sprengen', 'faire sauter', 'infiltrat', 'knock out', 'cripple', 'paralys', 'lahmleg'],
    on: INFRASTRUCTURE,
  },
  // Switching things off or cutting them: only an act when asked as an act (the safe words below overrule it).
  {
    name: 'shutdown-infrastructure',
    act: ['shut down', 'shutdown', 'shut off', 'switch off', 'turn off', 'power down', 'take out', 'take down', 'bring down', 'cut off', 'cut the', 'cut a', 'cut power', 'cut electricity', 'cut out', 'cut ', 'disconnect', 'sever', 'crash', 'overload', 'overwhelm', 'disable', 'disrupt', 'jam', 'tap into', 'stop the', 'couper', 'eteindre', 'deconnecter', 'black out'],
    on: INFRASTRUCTURE,
  },
  // German puts the verb last ("Kraftwerk abschalten"): no start of sentence needed.
  { name: 'shutdown-de', act: ['abschalt', 'ausschalt', 'lahmleg'], on: INFRASTRUCTURE },
  { name: 'override-safety', act: ['override', 'bypass', 'circumvent', 'defeat', 'disable', 'turn off'], on: ['safety system', 'safety', 'protection system', 'alarm', 'shutdown system', 'control system'] },
  { name: 'cause-disaster', act: ['cause a', 'trigger a', 'create a', 'start a', 'cause', 'trigger'], on: ['blackout', 'meltdown', 'power outage', 'nuclear accident', 'nuclear disaster', 'explosion', 'radiation leak'] },
  // Theft and fraud with energy supply.
  { name: 'theft', act: ['steal', 'stealing', 'siphon', 'syphon', 'tamper', 'bypass', 'rig my', 'rig the', 'cheat', 'illegally', 'without paying', 'stromklau', 'stromz'], on: ['electricity', 'power', 'gas', 'oil', 'fuel', 'petrol', 'diesel', 'meter', 'energy bill', 'strom', 'zahler', 'compteur'] },
]

/**
 * Words that show the question is about a measure, a policy or statistics, not an attack: they
 * overrule every rule except `always` ones ("how to cut energy costs", "reactor shutdowns in Belgium",
 * "how can the grid be protected from attacks").
 */
export const SAFE_CONTEXT = [
  'save', 'saving', 'waste', 'wasting', 'reduc', 'lower', 'cost', 'policy', 'policies', 'responsibl', 'standby', 'insulat', 'efficien', 'phase out', 'phase-out', 'phaseout', 'resilien', 'protect', 'prevent', 'defend', 'safeguard', 'secure', 'security', 'emergency', 'safely',
  'sparen', 'senken', 'verbrauch', 'economis', 'economiser', 'reduire',
  'consumption', 'import', 'export', 'price', 'statistic', 'statistik', 'capacity', 'savings', 'risk', 'effect', 'impact', 'share', 'since', 'by year', 'closure', 'reliability', 'indicator', 'emission', 'production', 'duration', 'frequency', 'losses', 'incident', 'history', 'trend', 'number of', 'how many', 'how much', 'percentage', 'per capita', 'between 20', 'in 20', 'in 19',
]

const flat = (text: string) =>
  ` ${text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim()} `

/** Whether any listed phrase starts at a word boundary in the sentence ("hack" matches "hacking" and "hack a grid"). */
const has = (sentence: string, words: string[]) => words.some((w) => sentence.includes(` ${w}`) || (w.endsWith(' ') && sentence.includes(` ${w}`)))

/** Phrased as an act the asker wants to carry out: "how to…", "I want to…", or a bare command. */
const INTENT = /^ (please |pls |hey |can you |could you )?(comment|wie kann man|wie|how (to|do i|can i|could i|would i|can one|do you|can you)|i want to|i wanna|i need to|help me|teach me|show me how|tell me how|explain how|is it possible to) /

/** The name of the rule that refuses the text, or null. */
export function blockedBy(text: string): string | null {
  for (const raw of text.split(/(?<=[.!?;])\s+|\n+/)) {
    const s = flat(raw)
    if (s.trim().length < 3) continue
    const safe = has(s, SAFE_CONTEXT)
    for (const rule of SAFETY_RULES) {
      if (!has(s, rule.act) || (rule.on && !has(s, rule.on))) continue
      if (rule.always) return rule.name
      // A how-to or a bare command is an act unless a safe word overrules it; a plain noun phrase needs no safe word to pass.
      if (safe) continue
      // Switching off or cutting is an act only as a how-to or a command ("shut down a plant", "how to cut a pipeline"),
      // not in a description ("what happens when a plant is shut down").
      if (rule.name === 'shutdown-infrastructure' && !INTENT.test(s) && !rule.act.some((w) => s.startsWith(` ${w}`) || s.startsWith(` please ${w}`))) continue
      return rule.name
    }
  }
  return null
}
