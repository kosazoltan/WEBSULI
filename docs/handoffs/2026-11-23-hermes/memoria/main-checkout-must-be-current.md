---
name: main-checkout-must-be-current
description: "A hookok a fő munkakönyvtárból (D:\\repo\\WEBSULI) futnak minden munkafára — minden merge után fast-forward kell, különben régi, hibás hookok futnak (2026-11-19)"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-11-19T12:39:35.144Z
---

**ÉRVÉNYES ÁLLAPOT (2026-11-23):** a repó hookjai `node "${CLAUDE_PROJECT_DIR}/scripts/qa/hooks/…"` alakúak (NEM abszolút út). A fő checkoutból indított munkamenetben így a fő checkout szkriptjei futnak minden munkafára — a szabály (minden merge után `git pull --ff-only` a fő checkoutban) változatlanul érvényes.

A `.claude/settings.json` hookjai abszolút úttal a fő munkakönyvtár `scripts/qa/hooks/` fájljait hívják, a munkafákban dolgozó
alügynököknél is. 2026-11-19-én a fő munkakönyvtár `main` ága 15 commit-tal le volt maradva (`3924beb7`), mert egy ÜRES, nem követett
fájl (`docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md`) megakasztotta a `git pull`-t — így a hook-javítások (#499 tokenizálás,
#506 időkorlát / tiltás hibánál) élesben nem hatottak. A tulajdonos aznap kézzel állított le 4, a „teljes rendszert blokkoló”
hook-folyamatot (az okot utólag nem tudtam a folyamatokból bizonyítani; a friss hookok 800 KB-os bemeneten is ≤ 1,4 s alatt futnak).

**Why:** a merge a GitHubon történik (`gh pr merge`), a helyi fő munkakönyvtár magától nem frissül; a régi hookok lassúak / beragadhatnak,
és a Windows nem öli meg az időtúllépett hook-folyamatot.

**How to apply:** minden `gh pr merge` után azonnal: `git -C D:/repo/WEBSULI pull --ff-only origin main` külön lépésben, és ellenőrizd,
hogy a HEAD = origin/main. Ha megakad (nem követett fájl), nézd meg a fájlt, és csak akkor távolítsd el, ha üres / azonos a főágival.
Munkamenet elején is ellenőrizd (`git rev-list --count HEAD..origin/main` = 0). Kapcsolódó: [[gate-speed-decisions]],
[[taskstop-orphan-monitor]].
