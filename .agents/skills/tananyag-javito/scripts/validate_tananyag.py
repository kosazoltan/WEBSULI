#!/usr/bin/env python3
"""
Tananyag HTML Validátor – v7.1
Ellenőrzi a v7.1 specifikáció szerint a tananyag HTML fájlokat.
"""

import re
import sys
from pathlib import Path


def validate_v71(html_content: str, filename: str = "tananyag.html") -> dict:
    """
    Teljes v7.1 validáció. Visszaad egy dict-et:
    {
        "ok": [...],
        "warning": [...],
        "error": [...],
        "score": 0-100,
        "summary": "..."
    }
    """
    results = {"ok": [], "warning": [], "error": [], "score": 0}
    checks = 0
    passed = 0

    def check(condition, ok_msg, fail_msg, is_error=True):
        nonlocal checks, passed
        checks += 1
        if condition:
            results["ok"].append(ok_msg)
            passed += 1
        else:
            if is_error:
                results["error"].append(fail_msg)
            else:
                results["warning"].append(fail_msg)

    # ── STRUKTÚRA ──────────────────────────────────────────────
    check("</html>" in html_content,
          "HTML záró tag megvan",
          "HIÁNYZIK a </html> záró tag")

    check("</body>" in html_content,
          "Body záró tag megvan",
          "HIÁNYZIK a </body> záró tag")

    check("</script>" in html_content,
          "Script záró tag megvan",
          "HIÁNYZIK a </script> záró tag")

    # ── 4 OLDALAS STRUKTÚRA ────────────────────────────────────
    page_count = len(re.findall(r'id=["\']p[1-4]["\']', html_content))
    check(page_count >= 4,
          f"4 oldal megtalálható (p1-p4)",
          f"HIÁNYZIK a 4 oldalas struktúra – csak {page_count} oldal van (kell: p1, p2, p3, p4)")

    # Módszerek oldal (2. oldal)
    has_methods = bool(re.search(r'id=["\']p2["\']', html_content))
    check(has_methods,
          "Módszerek oldal (p2) megvan",
          "HIÁNYZIK a Módszerek oldal (p2) – v7.1-ben kötelező")

    # ── TAB NAVIGÁCIÓ ──────────────────────────────────────────
    tab_buttons = len(re.findall(r'showTab|XX_showTab|_showTab', html_content))
    check(tab_buttons >= 4,
          "4 tab navigációs gomb megvan",
          f"HIÁNYZIK a 4-es tab navigáció (talált: {tab_buttons})")

    # ── KOGNITÍV ELEMEK ────────────────────────────────────────
    cognitive_patterns = [
        'prediction', 'gate', 'myth', 'dragdrop', 'cause-effect',
        'conflict', 'self-check', 'popup', 'timeline', 'analogy'
    ]
    found_cognitive = [p for p in cognitive_patterns if p in html_content.lower()]
    cog_count = len(found_cognitive)
    check(cog_count >= 8,
          f"Kognitív elemek: {cog_count}/10 megvan ({', '.join(found_cognitive)})",
          f"KEVÉS kognitív elem: {cog_count}/10 (kell: min. 8-10) – hiányzók: "
          f"{', '.join(p for p in cognitive_patterns if p not in html_content.lower())}",
          is_error=(cog_count < 6))

    # ── TILTOTT ELEMEK ─────────────────────────────────────────
    alert_count = len(re.findall(r'\balert\s*\(', html_content))
    check(alert_count == 0,
          "Nincs tiltott alert() – helyes",
          f"TILTOTT: {alert_count} db alert() találat – csak HTML modal engedélyezett")

    confirm_count = len(re.findall(r'\bconfirm\s*\(', html_content))
    check(confirm_count == 0,
          "Nincs tiltott confirm() – helyes",
          f"TILTOTT: {confirm_count} db confirm() találat",
          is_error=False)

    # ── IIFE WRAPPER ───────────────────────────────────────────
    has_iife = bool(re.search(r'\(function\s*\(\s*\)\s*\{', html_content) or
                    re.search(r'\(\(\s*\)\s*=>\s*\{', html_content))
    check(has_iife,
          "IIFE wrapper megvan",
          "HIÁNYZIK az IIFE wrapper: (function() { ... })()")

    # ── TOUCH EVENTS ───────────────────────────────────────────
    has_touchstart = 'touchstart' in html_content
    has_touchend = 'touchend' in html_content
    check(has_touchstart and has_touchend,
          "Touch events megvannak (touchstart + touchend)",
          f"HIÁNYZIK touch event: touchstart={'✓' if has_touchstart else '✗'}, "
          f"touchend={'✓' if has_touchend else '✗'}")

    # ── KVÍZ BANK ─────────────────────────────────────────────
    quiz_match = re.search(r'quizBank\s*=\s*\[', html_content)
    if quiz_match:
        quiz_entries = len(re.findall(r'\{\s*q\s*:', html_content))
        check(quiz_entries >= 70,
              f"Kvíz kérdések: {quiz_entries} (kell: 75)",
              f"KEVÉS kvíz kérdés: {quiz_entries}/75",
              is_error=(quiz_entries < 50))
    else:
        results["error"].append("HIÁNYZIK a quizBank tömb")
        checks += 1

    # Kvíz válaszok száma (3 = v7.1)
    opts_4 = len(re.findall(r'opts\s*:\s*\[.*?,.*?,.*?,.*?\]', html_content))
    opts_3 = len(re.findall(r'opts\s*:\s*\[.*?,.*?,.*?\]', html_content))
    if opts_4 > opts_3:
        results["warning"].append(
            f"Kvíz válaszok: {opts_4} kérdésnél 4 válasz van – v7.1-ben 3 (ABC) a szabvány"
        )
    else:
        results["ok"].append(f"Kvíz válaszok: 3 (ABC) – helyes v7.1")

    # ── FELADAT BANK ───────────────────────────────────────────
    ex_match = re.search(r'exerciseBank\s*=\s*\[', html_content)
    if ex_match:
        ex_entries = len(re.findall(r'\{\s*q\s*:', html_content))
        # Ha van quizBank is, feladat = összes - kvíz
        actual_ex = max(0, ex_entries - (quiz_entries if quiz_match else 0))
        check(actual_ex >= 40,
              f"Feladatok: {actual_ex} (kell: 45)",
              f"KEVÉS feladat: {actual_ex}/45",
              is_error=(actual_ex < 30))
    else:
        results["error"].append("HIÁNYZIK az exerciseBank tömb")
        checks += 1

    # ── MEGJELENÍTÉSI SZÁMOK ───────────────────────────────────
    has_15 = bool(re.search(r'slice\s*\(\s*0\s*,\s*15\s*\)', html_content))
    has_25 = bool(re.search(r'slice\s*\(\s*0\s*,\s*25\s*\)', html_content))
    check(has_15,
          "Feladatok: 15 megjelenítve (slice(0,15))",
          "HIÁNYZIK a feladatok 15-ös megjelenítése (slice(0,15))")
    check(has_25,
          "Kvíz: 25 megjelenítve (slice(0,25))",
          "HIÁNYZIK a kvíz 25-ös megjelenítése (slice(0,25))")

    # ── ÚJRAGENERÁLÁS GOMBOK ───────────────────────────────────
    regen_count = html_content.lower().count('újragenel') + \
                  html_content.lower().count('regen') + \
                  html_content.count('🔄')
    check(regen_count >= 2,
          "Újragenerálás gombok megvannak (Feladatok + Kvíz tetején)",
          f"HIÁNYZIK/KEVÉS az újragenerálás gomb: {regen_count} (kell: min. 2)",
          is_error=False)

    # ── KONFIRMÁCIÓS MODAL ─────────────────────────────────────
    has_overlay = bool(re.search(r'overlay|modal', html_content, re.IGNORECASE))
    check(has_overlay,
          "Konfirmációs modal megvan",
          "HIÁNYZIK a konfirmációs modal overlay")

    # ── JSON MENTÉS ────────────────────────────────────────────
    has_blob = 'new Blob' in html_content
    has_json = 'JSON.stringify' in html_content
    check(has_blob and has_json,
          "JSON mentés implementálva (Blob + JSON.stringify)",
          f"HIÁNYZIK JSON mentés: Blob={'✓' if has_blob else '✗'}, "
          f"JSON.stringify={'✓' if has_json else '✗'}",
          is_error=False)

    # ── CSS PREFIX ─────────────────────────────────────────────
    has_prefix = bool(re.search(r'\.[a-z]{2,4}-[a-z]', html_content))
    check(has_prefix,
          "CSS prefix megvan",
          "HIÁNYZIK az egyedi CSS prefix (pl. fo-, mk-, tr-)",
          is_error=False)

    # ── MIN 44PX ───────────────────────────────────────────────
    has_44 = '44px' in html_content
    check(has_44,
          "Min 44px érintési terület megvan",
          "HIÁNYZIK a min-height: 44px kattintható elemeken",
          is_error=False)

    # ── RESZPONZIVITÁS ─────────────────────────────────────────
    has_viewport = 'viewport' in html_content
    has_media = '@media' in html_content
    has_clamp = 'clamp(' in html_content
    check(has_viewport and has_media,
          f"Reszponzív alap: viewport={'✓' if has_viewport else '✗'}, "
          f"@media={'✓' if has_media else '✗'}",
          "HIÁNYZIK reszponzív CSS (viewport meta vagy @media)",
          is_error=False)

    # ── UTF-8 ──────────────────────────────────────────────────
    check('charset="UTF-8"' in html_content or "charset='UTF-8'" in html_content,
          "UTF-8 charset megvan",
          "HIÁNYZIK a UTF-8 charset meta",
          is_error=False)

    # ── SCORE ─────────────────────────────────────────────────
    results["score"] = round((passed / checks) * 100) if checks > 0 else 0
    error_count = len(results["error"])
    warn_count = len(results["warning"])
    ok_count = len(results["ok"])
    results["summary"] = (
        f"📊 {filename}: "
        f"✅ {ok_count} OK | ⚠️ {warn_count} figyelmeztetés | ❌ {error_count} hiba | "
        f"Pontszám: {results['score']}%"
    )
    return results


def print_report(results: dict):
    """Kiírja az eredményt a konzolra."""
    print("\n" + "="*60)
    print(results["summary"])
    print("="*60)

    if results["error"]:
        print(f"\n❌ HIBÁK ({len(results['error'])}):")
        for e in results["error"]:
            print(f"  ❌ {e}")

    if results["warning"]:
        print(f"\n⚠️ FIGYELMEZTETÉSEK ({len(results['warning'])}):")
        for w in results["warning"]:
            print(f"  ⚠️ {w}")

    if results["ok"]:
        print(f"\n✅ RENDBEN ({len(results['ok'])}):")
        for o in results["ok"]:
            print(f"  ✅ {o}")

    print()
    score = results["score"]
    if score >= 90:
        print(f"🏆 Kiváló! A tananyag megfelel a v7.1 specifikációnak ({score}%)")
    elif score >= 75:
        print(f"👍 Jó! Kisebb javítások szükségesek ({score}%)")
    elif score >= 50:
        print(f"⚠️ Közepes! Több javítás szükséges ({score}%)")
    else:
        print(f"🔴 Jelentős javítás szükséges ({score}%)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Használat: python validate_tananyag.py [html_fájl]")
        sys.exit(1)

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"❌ Fájl nem található: {path}")
        sys.exit(1)

    content = path.read_text(encoding="utf-8", errors="ignore")
    results = validate_v71(content, path.name)
    print_report(results)

    sys.exit(0 if not results["error"] else 1)
