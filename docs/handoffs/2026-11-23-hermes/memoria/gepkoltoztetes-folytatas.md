---
name: gepkoltoztetes-folytatas
description: "2026-11-21 gépköltöztetés után — hol a leltár és a terv, mi a sorrend, mennyi a vak-keret; a vak futtató még csak ágon"
metadata:
  node_type: memory
  type: project
  originSessionId: 5e40d429-1a44-43d0-a815-181a3773f233
  modified: 2026-11-22T07:50:32.209Z
---

**ÉRVÉNYES ÁLLAPOT (2026-11-23):** ezt a sorrendet (H0–H6) a [[foterv-2026-11-23]] váltotta fel; a vak futtató a `vak-v2` munkafából indul, nem a `vak-ellenor-deepseek`-ből. A hivatkozott `docs/specs/2026-11-21-gepkoltoztetes-folytatas.md` csak a `docs/gepkoltoztetes-folytatas` ágon van meg.

Új gépen (2026-11-21) a WEBSULI folytatásának leltára és terve: `docs/specs/2026-11-21-gepkoltoztetes-folytatas.md` + `-vegrehajtas.md` (ág `docs/gepkoltoztetes-folytatas`). Források: `tmp/websuli-mentes-osszefoglalo-2026-11-20.md` (nem követett), az Astra-revízió `.claude/worktrees/teljes-revizio/docs/revizio/00…05` (935 MCS-csomag, nem követett — a tulajdonos döntése: nem kerül a repóba, csak személytelen kivonat), a mentési ágak `origin/higienia-backup/*`.

**Why:** a régi gép munkájának jó része csak helyi ágon élt; a vak futtató (`gate:blind-review`) csak a `chore/vak-ellenor-deepseek` ágon van, nélküle szabályosan semmi nem olvasztható be.

**How to apply:** sorrend H0 futtató → H1 advent (11-30) → H2 kész PR-ok → H3 TGM → H4–H6; a vak körökre a keret 2026-11-22 óta 60 USD (minden további 10 USD után állapotjelentés; 11-22 reggelig ≈ 19,6 USD ment el); a nem konvergáló kapu-PR-ok (#521 szűkítve, H0 két PR-ra bontva) legfeljebb 2 további kört kapnak; a böngészős tesztek a csomagolt Chromiumon (C-93, `fix/playwright-csomagolt-chromium`); az adventi képek fizetős próbaköre csak a PR-C után, újabb kérdéssel. Amíg a futtató nincs a főágon, a vak kört a `.claude/worktrees/vak-ellenor-deepseek` munkafából kell indítani. Kapcsolódó: [[blind-review-runner]], [[gate-speed-decisions]], [[potlasok-terv-dontesek]], [[lesson-variety-priority]].
