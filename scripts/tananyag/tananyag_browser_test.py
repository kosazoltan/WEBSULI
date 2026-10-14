#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tananyag bongeszo-teszt (Tananyag Keszito v7.5) - Playwright/Chromium.
Hasznalat:  python3 tananyag_browser_test.py <fajl.html> [--shots <mappa>]
Ellenoriz:
  1. 0 JS hiba (pageerror) es 0 console-uzenet (log/info/warn/error/debug)
  2. 0 vizszintes tulcsordulas 320..2560 px minden tabon
  3. minden gomb / interaktiv elem >= 44x44 px
  4. ASZTALI KIHASZNALTSAG (>=1280 px):
       a) az aktiv panel szelessege >= 85% a viewportnak (nem keskeny "mobil-oszlop")
       b) minden tabon legalabb 2 oszlop: a bekezdesek / kartyak >=2 kulonbozo x pozicion kezdodnek
       c) egyetlen bekezdes sem szelesebb 1150 px-nel (olvashato sorhossz)
  5. Kiertekelo motor ontesztje: minden sample -> ok, ures -> fail
Kilepesi kod: 0 = minden OK, 1 = van FAIL.
"""
import asyncio, sys, os, re, json
from playwright.async_api import async_playwright

WIDTHS = [320, 375, 414, 768, 1024, 1280, 1440, 1920, 2560]
DESKTOP_MIN = 1280


def extract_engine(html):
    i = html.find('function ee_norm')
    j = html.find('function ee_evaluate')
    if i < 0 or j < 0:
        return None
    k = html.index('{', j); depth = 0
    for n in range(k, len(html)):
        if html[n] == '{': depth += 1
        elif html[n] == '}':
            depth -= 1
            if depth == 0:
                return html[i:n + 1]
    return None


JS_OVER = '''() => {
  const W = document.documentElement.clientWidth; const bad = [];
  document.querySelectorAll('[role=tabpanel]').forEach(p => { if (getComputedStyle(p).display === 'none') return;
    p.querySelectorAll('*').forEach(e => { const r = e.getBoundingClientRect();
      if (r.width && r.right > W + 1) bad.push((e.className && e.className.baseVal === undefined ? e.className : e.tagName) + '@' + Math.round(r.right)); }); });
  return {scroll: document.documentElement.scrollWidth - W, bad: bad.slice(0, 5)};
}'''

JS_TOUCH = '''() => { const s = [];
  document.querySelectorAll('[role=tabpanel] button, [role=tabpanel] a[href], [role=tabpanel] [role=button], [role=tablist] button, [role=tab]').forEach(e => {
    if (e.closest('[role=tabpanel]') && getComputedStyle(e.closest('[role=tabpanel]')).display === 'none') return;
    const r = e.getBoundingClientRect(); if (!r.width) return;
    if (r.width < 43.5 || r.height < 43.5) s.push((e.textContent || '').trim().slice(0, 18) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); });
  return s.slice(0, 6); }'''

JS_DESK = '''() => { const W = document.documentElement.clientWidth;
  const p = Array.from(document.querySelectorAll('[role=tabpanel]')).find(x => getComputedStyle(x).display !== 'none');
  const els = []; let maxP = 0;
  p.querySelectorAll('p, li, h2, h3, textarea, [class$="-card"], [class*="-card "], [class$="-task"], [class*="-task "], [class$="-q"], [class*="-q "], nav').forEach(e => {
    const r = e.getBoundingClientRect(); if (r.width < 120 || r.height < 8) return;
    els.push(r);
    if (e.tagName === 'P') { Array.from(e.getClientRects()).forEach(q => { maxP = Math.max(maxP, q.width); }); } });
  if (!els.length) return {ratio: 0, cols: 0, maxP: 0};
  const L = Math.min(...els.map(r => r.left)), R = Math.max(...els.map(r => r.right)), CW = Math.max(1, R - L);
  // oszlop = a tartalom-szelesseg negyedeire kerekitett bal-kezdopont; behuzas (li) nem uj oszlop
  const buckets = new Set(els.map(r => Math.round((r.left - L) / (CW / 4))));
  return {ratio: CW / W, cols: buckets.size, maxP: Math.round(maxP)}; }'''


async def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    path = os.path.abspath(sys.argv[1]); url = 'file://' + path
    shots = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
    if shots: os.makedirs(shots, exist_ok=True)
    html = open(path, encoding='utf-8-sig').read()
    fails = []
    async with async_playwright() as pw:
        br = await pw.chromium.launch()
        errs, cons = [], []
        for w in WIDTHS:
            pg = await br.new_page(viewport={'width': w, 'height': 900})
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: cons.append(m.type + ': ' + m.text))
            await pg.goto(url); await pg.wait_for_timeout(250)
            tabs = await pg.query_selector_all('[role=tab]')
            line = []
            for ti, tb in enumerate(tabs):
                await tb.click(); await pg.wait_for_timeout(120)
                act = await tb.evaluate('''t => { const id = t.getAttribute('aria-controls'); const pn = id && document.getElementById(id);
                  return {sel: t.getAttribute('aria-selected') === 'true', vis: !!pn && getComputedStyle(pn).display !== 'none'}; }''')
                if not (act['sel'] and act['vis']):
                    fails.append('%dpx tab%d kattintas utan nem aktiv (aria-selected=%s, panel lathato=%s)' % (w, ti + 1, act['sel'], act['vis']))
                    continue
                ov = await pg.evaluate(JS_OVER)
                if ov['scroll'] > 0 or ov['bad']:
                    fails.append('%dpx tab%d tulcsordulas %s' % (w, ti + 1, ov))
                small = await pg.evaluate(JS_TOUCH)
                if small:
                    fails.append('%dpx tab%d kicsi erintesi celpont: %s' % (w, ti + 1, small))
                if w >= DESKTOP_MIN:
                    d = await pg.evaluate(JS_DESK)
                    line.append('t%d: %.0f%% %dcol p<=%d' % (ti + 1, d['ratio'] * 100, d['cols'], d['maxP']))
                    if d['ratio'] < 0.85: fails.append('%dpx tab%d KESKENY: panel csak %.0f%%' % (w, ti + 1, d['ratio'] * 100))
                    if d['cols'] < 2: fails.append('%dpx tab%d EGY OSZLOP: asztalon nincs tobbhasabos elrendezes' % (w, ti + 1))
                    if d['maxP'] > 1150: fails.append('%dpx tab%d tul hosszu sor: %dpx bekezdes' % (w, ti + 1, d['maxP']))
                if shots and w in (375, 1440, 2560):
                    await pg.screenshot(path=os.path.join(shots, 'w%d_tab%d.png' % (w, ti + 1)))
            print('%5dpx OK-ellenorzes kesz %s' % (w, ' | '.join(line)))
            await pg.close()
        # motor onteszt
        eng = extract_engine(html)
        mt = re.search(r'window\.__\w*TASKS__\s*=\s*(\[.*?\]);\s*\n', html, re.S)
        if eng and mt:
            pg = await br.new_page()
            res = await pg.evaluate('''([src, tasks]) => { eval(src + '; window.__ev = ee_evaluate;');
              const bad = []; tasks.forEach((t, i) => { if (window.__ev(t.sample, t).state !== 'ok') bad.push('sample#' + i);
                if (window.__ev('', t).state !== 'fail') bad.push('empty#' + i); }); return bad; }''', [eng, json.loads(mt.group(1))])
            if res: fails.append('motor onteszt: ' + ', '.join(res))
            else: print('motor onteszt: minden sample OK, minden ures FAIL')
            await pg.close()
        else:
            fails.append('kiertekelo motor vagy feladatbank nem talalhato')
        await br.close()
    if errs: fails.append('JS hibak: %s' % errs[:3])
    if cons: fails.append('CONSOLE uzenetek (tilos, v7.5): %s' % sorted(set(cons))[:3])
    print('\n'.join('FAIL  ' + f for f in fails) if fails else 'MINDEN BONGESZOTESZT OK')
    sys.exit(1 if fails else 0)

asyncio.run(main())
