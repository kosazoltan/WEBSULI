#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tananyag statikus ellenorzo (Tananyag Keszito v7.5).
Hasznalat:  python3 tananyag_verify.py <fajl.html> [--prefix sm-]
Kilepesi kod: 0 = minden OK, 1 = van FAIL. Build csak 0 eseten adhato at!
"""
import re, sys, json

def strip_js(src):
    """Stringek, template-literalok, kommentek es regex-literalok kiuritese (egyszeru JS-tokenizalo)."""
    out, i, n = [], 0, len(src)
    prev = ''  # utolso nem-ures token-karakter (regex vs. osztas eldontesehez)
    while i < n:
        ch = src[i]
        if ch in '\'"`':
            q = ch; i += 1
            while i < n and src[i] != q:
                i += 2 if src[i] == '\\' else 1
            i += 1; out.append(q + q); prev = q; continue
        if src.startswith('//', i):
            j = src.find('\n', i); i = n if j < 0 else j; continue
        if src.startswith('/*', i):
            j = src.find('*/', i + 2); i = n if j < 0 else j + 2; continue
        if ch == '/' and (prev == '' or prev in '(,=:[!&|?{};+-*%<>~^'):
            i += 1; cls = False
            while i < n and (src[i] != '/' or cls):
                if src[i] == '\\': i += 1
                elif src[i] == '[': cls = True
                elif src[i] == ']': cls = False
                elif src[i] == '\n': break
                i += 1
            i += 1
            while i < n and src[i].isalpha(): i += 1
            out.append('/r/'); prev = '/'; continue
        out.append(ch)
        if not ch.isspace(): prev = ch
        i += 1
    return ''.join(out)


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    f = sys.argv[1]
    raw = open(f, 'rb').read()
    h = raw.decode('utf-8-sig')
    prefix = None
    if '--prefix' in sys.argv:
        prefix = sys.argv[sys.argv.index('--prefix') + 1]
    else:
        m = re.search(r'class="([a-z0-9]+-)tab\b', h)
        prefix = m.group(1) if m else None
    blocks = re.findall(r'<script([^>]*)>(.*?)</script>', h, re.S)
    js = '\n'.join(b for a, b in blocks)
    # futtathato kod: adat-blokkok (application/json, ld+json, importmap) nelkul,
    # stringek, template-literalok, kommentek es regex-literalok kiuritve
    runnable = strip_js('\n'.join(b for a, b in blocks
                                  if not re.search(r'type\s*=\s*["\'](?:application/(?:ld\+)?json|importmap)["\']', a, re.I)))
    up = prefix.upper().replace('-', '') if prefix else ''

    tasks = quiz = None
    mt = re.search(r'window\.__\w*TASKS__\s*=\s*(\[.*?\]);\s*\n', h, re.S)
    mq = re.search(r'window\.__\w*QUIZ__\s*=\s*(\[.*?\]);\s*\n', h, re.S)
    try:
        tasks = json.loads(mt.group(1)) if mt else None
        quiz = json.loads(mq.group(1)) if mq else None
    except Exception:
        pass

    chk = []
    def c(name, ok, info=''):
        chk.append((name, bool(ok), info))

    c('UTF-8 BOM', raw[:3] == b'\xef\xbb\xbf')
    c('<meta charset> + http-equiv', '<meta charset="utf-8">' in h and 'http-equiv="Content-Type"' in h)
    c('<html lang="hu">', '<html lang="hu">' in h)
    c('viewport meta', 'name="viewport"' in h)
    c('betuk: Google Fonts latin-ext VAGY helyi /fonts/lesson-fonts.css', 'subset=latin,latin-ext&display=swap' in h or '/fonts/lesson-fonts.css' in h)
    c('nincs system-ui / Segoe UI', 'system-ui' not in h and 'Segoe' not in h)
    c('glyph-warmup elem', bool(prefix) and ('class="%sgw' % prefix) in h)
    c('magyar o/u hosszu ekezet a szovegben', 'ő' in h and 'ű' in h)
    # --- v7.5: NINCS debug kod ---
    cons = re.findall(r'\bconsole\s*(?:\?\.|\.|\[)\s*\w*', runnable)
    c('NINCS console.* hivas (v7.5)', not cons, ', '.join(sorted(set(cons))))
    c('NINCS debugger utasitas', not re.search(r'\bdebugger\b', runnable))
    c('nincs alert/confirm/prompt', not re.search(r'(?<![\w.])(alert|confirm|prompt)\s*\(', runnable))
    c('nincs <details>/accordion', '<details' not in h and 'accordion' not in h.lower())
    c('nincs inline onclick', not re.search(r'\son[a-z]+\s*=\s*["\']', h))
    c("IIFE + 'use strict'", re.search(r"\(function\s*\(\)\s*\{\s*['\"]use strict['\"]", js) is not None)
    c('JS csak ASCII (\\uXXXX escape)', all(ord(ch) < 128 for ch in js))
    c('nincs arrow fn / template literal', '=>' not in js and '`' not in js)
    c('nincs tipografiai idezojel a JS-ben', not re.search(r'\\u201[cdeE]', js) and not any(q in js for q in '„”“'))
    c('4 tab panel', len(re.findall(r'role="tabpanel"', h)) >= 4)
    c('45 szoveges feladat', tasks is not None and len(tasks) == 45, str(len(tasks)) if tasks else 'nincs')
    if tasks:
        need = all(isinstance(t, dict) and all(k in t for k in ('q', 'required', 'bonus', 'minWords', 'needsSentence', 'sample')) for t in tasks)
        c('feladat-objektumok (q/required/bonus/minWords/needsSentence/sample)', need)
    c('75 kvizkerdes', quiz is not None and len(quiz) == 75, str(len(quiz)) if quiz else 'nincs')
    # --- v7.5: asztali reszponzivitas statikus jelei ---
    css = '\n'.join(re.findall(r'<style[^>]*>(.*?)</style>', h, re.S))
    mq_desk = [int(x) for x in re.findall(r'@media[^{]*min-width\s*:\s*(\d+)px', css)]
    c('asztali media query (min-width >= 1200px)', any(x >= 1200 for x in mq_desk), str(sorted(set(mq_desk))))
    c('szeles monitor media query (min-width >= 1800px)', any(x >= 1800 for x in mq_desk))
    # minden kontener-jellegu szabaly (wrap/container/page/app/content/main/shell/layout) max-width erteke
    narrow = []
    for sel, body in re.findall(r'([^{}]+)\{([^{}]*)\}', css):
        if not re.search(r'(wrap|container|page|app|content|main|shell|layout)\b', sel, re.I):
            continue
        for v in re.findall(r'max-width\s*:\s*(\d+)px', body):
            if 600 <= int(v) < 1800:
                narrow.append('%s{max-width:%spx}' % (sel.strip()[-40:], v))
    c('nincs keskeny fo kontener (kontener max-width < 1800px tilos)', not narrow, '; '.join(narrow[:4]))
    # --- CSS prefix ---
    cls = re.findall(r'class="([^"]+)"', h)
    bad = sorted(set(x for cs in cls if not re.search(r"['+]", cs) for x in cs.split() if prefix and not x.startswith(prefix)))
    c('CSS prefix mindenhol (%s)' % prefix, not bad, ', '.join(bad[:10]))

    fails = 0
    for name, ok, info in chk:
        print(('OK    ' if ok else 'FAIL  ') + name + ((' -> ' + info) if (info and not ok) else ''))
        fails += (not ok)
    print('meret: %d bajt | prefix: %s | FAIL: %d' % (len(raw), prefix, fails))
    sys.exit(1 if fails else 0)

if __name__ == '__main__':
    main()
