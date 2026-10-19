#!/usr/bin/env python3
"""Extracts the text of Eurostat's energy methodology PDFs, page by page, into scripts/data/pdf-pages.json.

  python3 scripts/extract-eurostat-pdfs.py <folder with the PDFs>      (needs: pip install pypdf)

`scripts/data/pdf-sources.json` lists each PDF: file name, title, the Eurostat URL it comes from and its
kind of document. The knowledge builder (build-eurostat-knowledge.mjs) turns the pages into searchable
passages. Page headers and footers (lines that repeat on many pages) and page numbers are removed.
"""
import json, os, re, sys
from collections import Counter
from pypdf import PdfReader

HERE = os.path.dirname(os.path.abspath(__file__))
sources = json.load(open(os.path.join(HERE, 'data', 'pdf-sources.json'), encoding='utf-8'))
folder = sys.argv[1]
out = []
for src in sources:
    path = os.path.join(folder, src['file'])
    if not os.path.exists(path):
        print('missing', src['file'], file=sys.stderr)
        continue
    pages = [(p.extract_text() or '') for p in PdfReader(path).pages]
    lines = [[l.strip() for l in t.split('\n') if l.strip()] for t in pages]
    # headers and footers: a short line that appears on at least 40% of the pages
    count = Counter(l for ls in lines for l in set(ls) if len(l) < 90)
    common = {l for l, n in count.items() if n >= max(3, 0.4 * len(pages))}
    for i, ls in enumerate(lines, 1):
        kept = [l for l in ls if l not in common and not re.fullmatch(r'(page )?\d{1,3}( of \d+)?', l, re.I)]
        text = ' '.join(kept)
        text = re.sub(r'(\w)-\s+(\w)', r'\1\2', text)  # hyphenated line breaks
        text = re.sub(r'\s+', ' ', text).strip()
        if len(text) > 120:
            out.append({'file': src['file'], 'id': src['id'], 'title': src['title'], 'url': src['url'], 'topic': src.get('topic', ''), 'page': i, 'text': text})
json.dump(out, open(os.path.join(HERE, 'data', 'pdf-pages.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'{len(out)} pages from {len(set(p["file"] for p in out))} documents')
