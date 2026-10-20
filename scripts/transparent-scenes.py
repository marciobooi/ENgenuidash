#!/usr/bin/env python3
"""Re-applies the backdrop removal of import-scenes.py to src/genui/deck/art/scenes.ts (for when the original files are gone).

  python3 scripts/transparent-scenes.py
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
source = open(os.path.join(HERE, 'import-scenes.py'), encoding='utf-8').read()
namespace = {'re': re}
exec(source[source.index('def strip_background'):source.index('def clean(')], namespace)
path = os.path.join(HERE, '..', 'src', 'genui', 'deck', 'art', 'scenes.ts')
lines = []
for line in open(path, encoding='utf-8'):
    m = re.match(r'  ("[^"]+"): (".*"),$', line)
    if m:
        line = f'  {m.group(1)}: {json.dumps(namespace["strip_background"](json.loads(m.group(2))))},\n'
    lines.append(line)
open(path, 'w', encoding='utf-8').write(''.join(lines))
