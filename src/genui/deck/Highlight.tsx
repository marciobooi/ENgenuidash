const NUMBER = /(\d+(?:[.,]\d+)*\s?(?:%|pp|Mtoe|ktoe|TWh|GWh|GW|PJ|EUR\/kWh|days|Tage|jours)?)/g

/** The sentence with its numbers in bold, so the eye lands on them. */
export function Highlight({ text }: { text: string }) {
  return (
    <>
      {text.split(NUMBER).map((part, i) => (i % 2 === 1 ? <strong key={i} className="deck__num">{part}</strong> : part))}
    </>
  )
}
