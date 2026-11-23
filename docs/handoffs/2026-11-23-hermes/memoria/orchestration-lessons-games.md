---
name: orchestration-lessons-games
description: "Sokszeletes, alügynökös munka tanulságai (játékok mobilra + szóbank, 2026-11-15/16) — mit kell az orkesztrátornak előre kiadnia"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 99a9b29f-318a-40fe-a572-f8ecf28ad2ae
  modified: 2026-11-17T08:00:00.000Z
---

A tulajdonos kérése (2026-11-15): nagy munkánál a fő modell csak orkesztrál, tervez, ellenőriz; a munkát alügynökök
végzik, nehézség szerint Opus / Sonnet szinten.

**Why:** a 20 PR-os játék-munkában (#419–#438) mért hibák nagy része az orkesztrálásból jött, nem a kódolásból.

**How to apply** (a részletek a repó `docs/agent-csapdak.md` katalógusában, azonosítóval):
- Párhuzamos alügynökök saját scratchpad-almappát kapnak, soha nem közöset (C-30).
- Párhuzamos tartalomgyártásnál előre kiosztott, diszjunkt szólista; a vak megoldó mellé külön idióma- / szinonima-audit,
  a megoldó válasza szöveggel (`chosen`) is rögzítve (C-31, C-45).
- A PR saját zöld CI-ja nem garancia a main zöldjére; közös mérő / segéd módosítása után a main CI-t is megvárni; a
  helyi (GPU-s) zöld nem a CI zöldje (C-30, C-33, C-49).
- Szeletes funkció végén friss, nem implementáló alügynök végezze az átfogó reviewt (1 magas + 3 közepes hibát talált,
  amit a szeletenkénti bot-review nem).
- Közös fájlt (index.css, közös motor, közös tesztsegéd) egyszerre csak egy szelet módosít; a többi
  „orkesztrátor-kérésként” jelzi (C-53).
- Háromfázisú kapu: a szelet ELSŐ commitja a végrehajtási fájl saját állapotsora, akkor is, ha a terv már a mainen van —
  pusholt ágon csak új PR-ral javítható (#441; C-37).
- Szelet-PR nem ír a közös, hozzáfűzős `docs/agent-csapdak.md`-be; a csapda-javaslat a zárójelentésbe megy, az
  orkesztrátor egy docs-PR-ban gyűjti; sokszor ütköző PR-nál összevonási stop (C-48).
- Repó-szintű őrt hozó PR-t ne vonj össze régi CI-zöldre: előbb `git merge origin/main` + egységtesztek / az őr a friss
  mainen (#474 → piros main; C-61). 2026-11-17 óta a `gate:push` / `gate:merge` ezt gépiesen ellenőrzi.
- A főág kötelező ellenőrzései: „Háromfázisú rend”, „Lint & Typecheck”, „Unit Tests”, „Playwright E2E” (~45 perc);
  `--admin` megkerülés tulajdonosi engedély nélkül tilos; piros main helyreállítása ≥ ~1 óra → a megelőzés olcsóbb (C-63).
- A zöld PR-okat egy telepítési ablakba gyűjtsd (2026-11-16: ~37 telepítés egy nap alatt, az audit kifogásolta; C-47).
  Az első `gh pr merge` után a többi PR percekig `UNKNOWN` — várni, nem kihagyni.
- Minden szelet-briefbe: a kapuk (`gate:stage` szakaszonként, `gate:push`, a PR előtt független ellenőr + `gate:pr`) és a
  push-fegyelem — zöld CI után NINCS több push (doksi sem), a javítás EGY pushban (#477; C-62); részletek: [[quality-gates-mandate]].
- Biztonsági / állapotgépes javítás után visszaellenőrző kör ugyanazzal a reviewerrel (SendMessage a régi ügynöknek);
  az alügynök „helyben zöld” állítása nem helyettesíti (#476, #478; C-68).

Retrók: `docs/handoffs/2026-11-16-*.md`, `docs/handoffs/2026-11-17-jatekok-utomunka-retro.md`.
Kapcsolódó: [[completion-mandate]], [[websuli-push-audit-hook]], [[no-deploy-during-active-runs]], [[quality-gates-mandate]]
