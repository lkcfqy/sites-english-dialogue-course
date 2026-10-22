"""Extract only course words from the MIT-licensed ECDICT CSV.
Usage: python3 scripts/build-course-glossary.py /path/to/ecdict.csv
Source: https://github.com/skywind3000/ECDICT (see vendor/ECDICT.LICENSE)
"""
import csv
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
lessons = json.loads((root / 'data/curriculum.json').read_text())
words = set()
for lesson in lessons:
    for section in lesson['sections']:
        for _, en, _ in section['rows']:
            words.update(w.lower().replace('’', "'") for w in re.findall(r"[A-Za-z]+(?:['’][A-Za-z]+)?", en))
words.update(w[:-2] for w in list(words) if w.endswith("'s"))

result, variants = {}, {}
with open(sys.argv[1], encoding='utf-8-sig') as handle:
    for row in csv.DictReader(handle):
        key = row['word'].lower()
        meaning = '; '.join(row['translation'].replace('\\n', '\n').splitlines()[:3]).strip()
        if not meaning:
            continue
        if key in words and (key not in result or row['word'] == key):
            result[key] = meaning
        for exchange in row['exchange'].split('/'):
            if ':' in exchange:
                code, forms = exchange.split(':', 1)
                if code in ['s', 'i', 'p', 'd', '3', 'r', 't']:
                    for form in forms.split(','):
                        if form in words:
                            variants.setdefault(form, key + ' 的变化形式；' + meaning)
for key, meaning in variants.items():
    result.setdefault(key, meaning)
(root / 'data/course-glossary.json').write_text(json.dumps({'entries': result}, ensure_ascii=False, indent=2) + '\n')
print('Course tokens:', len(words), 'dictionary entries:', len(result))
print('Additional glosses to inspect:', ', '.join(sorted(words - result.keys())))
