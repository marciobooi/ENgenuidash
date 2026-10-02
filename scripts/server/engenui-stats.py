#!/usr/bin/env python3
"""Turns the anonymous pings of the test site into stats.json (the page /test/#/pagestats).

Reads /var/log/engenui/ping.log (and .1), one line per ping, written by nginx without IP addresses:
    <iso time> <visit id> <event> <active seconds> <language> <name> <detail>      ("-" when absent)
A visit is one random id (it exists only while a page is open). Run by cron every 5 minutes.
Pilot only: remove with scripts/server/remove-stats.sh when the test site goes (docs/test-server-revert.txt).
"""
import json, os, re, sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

LOGS = [os.environ['ENGENUI_LOG']] if os.environ.get('ENGENUI_LOG') else ['/var/log/engenui/ping.log.1', '/var/log/engenui/ping.log']
OUT = os.environ.get('ENGENUI_OUT', '/var/lib/engenui-stats/stats.json')
KEEP_DAYS = 60
NAMES = {'ask', 'dash', 'filter', 'suggest', 'choice', 'compare', 'switch', 'history', 'share', 'table', 'png', 'csv', 'lang', 'newchat', 'intent'}
ID = re.compile(r'^[0-9a-f]{16}$')
WORD = re.compile(r'^[a-z0-9_-]{1,32}$')


def parse(line):
    parts = line.split()
    if len(parts) < 7:
        return None
    t, v, e, a, lang, n, d = parts[:7]
    try:
        when = datetime.fromisoformat(t).astimezone(timezone.utc)
    except ValueError:
        return None
    if not ID.match(v) or e not in ('start', 'beat', 'end', 'ev'):
        return None
    # ("-" is nginx's empty value)
    name = n if n in NAMES else None
    if e == 'ev' and not name:
        return None  # an event with a name we do not know: ignored, it does not even make a visit
    return when, v, e, int(a) if a.isdigit() and int(a) < 86400 else 0, lang if WORD.match(lang) and lang != '-' else 'other', name, d if WORD.match(d) and d != '-' else None


def main():
    visits = {}
    events = []
    for path in LOGS:
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8', errors='ignore') as f:
            for line in f:
                row = parse(line)
                if not row:
                    continue
                when, v, e, a, lang, n, d = row
                x = visits.setdefault(v, {'first': when, 'last': when, 'active': 0, 'lang': lang, 'asks': 0})
                x['first'], x['last'] = min(x['first'], when), max(x['last'], when)
                x['active'] = max(x['active'], a)
                if lang != 'other':
                    x['lang'] = lang
                if e == 'ev' and n:
                    events.append((when.date().isoformat(), n if not d else f'{n}:{d}'))
                    if n == 'ask':
                        x['asks'] += 1
    now = datetime.now(timezone.utc)
    days = defaultdict(lambda: {'visits': 0, 'seconds': 0, 'over60': 0, 'under10': 0, 'langs': defaultdict(int), 'askers': 0, 'events': defaultdict(int)})
    hours = defaultdict(int)
    online = 0
    for x in visits.values():
        day = days[x['first'].date().isoformat()]
        day['visits'] += 1
        day['seconds'] += x['active']
        day['over60'] += x['active'] >= 60
        day['under10'] += x['active'] < 10
        day['langs'][x['lang']] += 1
        day['askers'] += x['asks'] > 0
        if now - x['first'] < timedelta(hours=24):
            hours[x['first'].strftime('%Y-%m-%dT%H')] += 1
        if now - x['last'] < timedelta(seconds=90):
            online += 1
    for date, name in events:
        days[date]['events'][name] += 1
    out_days = []
    for date in sorted(days)[-KEEP_DAYS:]:
        d = days[date]
        out_days.append({'date': date, 'visits': d['visits'], 'avgSeconds': round(d['seconds'] / d['visits']) if d['visits'] else 0, 'over60': d['over60'], 'under10': d['under10'], 'langs': dict(d['langs']), 'askers': d['askers'], 'events': dict(d['events'])})
    stats = {'generated': now.isoformat(timespec='seconds'), 'online': online, 'days': out_days, 'hours': [{'hour': h, 'visits': n} for h, n in sorted(hours.items())]}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(stats, f, separators=(',', ':'))
    os.chmod(tmp, 0o644)
    os.replace(tmp, OUT)


if __name__ == '__main__':
    sys.exit(main())
