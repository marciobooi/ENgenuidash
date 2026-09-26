/**
 * Numbers in written answers, checked against their sources: a small model can write a figure that
 * is in none of them ("19 billion tons of hard coal", "about 12,000 thousand tonnes").
 */

/** A number as written in EN/DE/FR ("1,545", "1 545", "42,5 %") → its value as text ("1545", "42.5"). */
export function numberValues(text: string): string[] {
  return (text.replace(/\u00a0|\u202f/g, ' ').match(/\d{1,3}(?:[ ,.]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g) ?? []).map((n) => {
    const grouped = /^\d{1,3}(?:[ ,.]\d{3})+/.test(n) && !/^\d+[.,]\d{1,2}$/.test(n)
    const plain = grouped ? n.replace(/[ ,.](?=\d{3}(\D|$))/g, '') : n
    return String(Number(plain.replace(',', '.')))
  })
}

/**
 * Numbers in an answer that are not in its sources (the prompt or the quoted passage): invented
 * figures ("19 billion tons of hard coal"). Small numbers (below 10) are left out: counts and
 * list items ("three countries") are too common to check.
 */
export function unsupportedNumbers(answer: string, source: string): string[] {
  const known = new Set(numberValues(source))
  return [...new Set(numberValues(answer))].filter((n) => Number(n) >= 10 && !known.has(n))
}
