// Helpers shared by the Eurostat knowledge scripts (Statistics Explained = MediaWiki).

/** MediaWiki wikitext → plain text (links, templates, tables, references and markup removed). */
export function wikitextToText(wikitext) {
  return (
    wikitext
      .replace(/__\w+__/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\[\[(Image|File):.*$/gim, '') // figures to end of line (captions may contain nested links)
      .replace(/<gallery[\s\S]*?<\/gallery>/gi, '')
      .replace(/\{\|[\s\S]*?\|\}/g, '') // tables
      .replace(/\{\{[^{}]*\}\}/g, '')
      .replace(/\{\{[^{}]*\}\}/g, '') // nested templates (second pass)
      .replace(/\[\[(Category|File|Image):[^\]]*\]\]/gi, '')
      .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
      .replace(/\[\[([^\]]*)\]\]/g, (_, x) => x.replace(/^Glossary:/, ''))
      .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, '$1')
      .replace(/\[https?:\/\/\S+\]/g, '')
      .replace(/'''?/g, '')
      .replace(/<ref[^>]*\/>/g, '')
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
      .replace(/<(sup|sub)>(.*?)<\/\1>/g, '$2')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/^\*+\s*/gm, '- ')
      .replace(/^#+\s*/gm, '- ')
      .replace(/^;\s*/gm, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/** Splits wikitext into [heading, body] sections (the intro has heading ""). */
export function wikiSections(wikitext) {
  const parts = wikitext.split(/^(={2,4})\s*(.*?)\s*\1\s*$/m)
  const sections = [['', parts[0]]]
  for (let i = 1; i < parts.length; i += 3) sections.push([parts[i + 1], parts[i + 2] ?? ''])
  return sections
}

/** HTML fragment → plain text. */
export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Splits text into passages of roughly `size` characters on paragraph/sentence boundaries. */
export function chunk(text, size = 700) {
  const out = []
  let current = ''
  for (const para of text.split(/\n{2,}/)) {
    const pieces = para.length > size * 1.4 ? para.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [para] : [para]
    for (const piece of pieces) {
      if (current && current.length + piece.length > size) {
        out.push(current.trim())
        current = ''
      }
      current += (current ? (pieces.length > 1 ? ' ' : '\n\n') : '') + piece.trim()
    }
  }
  if (current.trim()) out.push(current.trim())
  return out.filter((c) => c.length > 60)
}

/** fetch with retries; returns text or JSON. */
export async function get(url, { json = false, attempts = 3 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return json ? await res.json() : await res.text()
    } catch (err) {
      if (attempt >= attempts) throw new Error(`${url}: ${err.message}`)
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
}
