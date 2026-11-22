# Spec: elővágás a főági kitakaró előtt (a #521 utódja)

> Dátum: 2026-11-22 · Szerző: Claude Code (alügynök, orkesztrátori megbízás) · Állapot: JÓVÁHAGYVA — a tulajdonos 2026-11-22-én
> űrlapon döntött, szó szerint: „Új, kis megközelítés (Javasolt)” — új kis PR a mostani helyett; a #521 ága
> (`fix/kitakaro-negyzetes-regex`) archívumként marad; 1–2 vak kör.
> Előzmény: a #521 kilenc köre (2 bot-review és 7 vak kör, mind NEM) a kitakaró teljességét próbálta elérni; a tulajdonos előbb
> szűkített („Szűkítés + bontás (Javasolt)”), majd ezt a kis megközelítést választotta. Végrehajtás:
> `docs/specs/2026-11-22-kitakaro-elovagas-vegrehajtas.md`.

## 1. Cél

A kimeneti utak kitakarása **lineáris / korlátos idejű és összeomlásmentes** legyen úgy, hogy a **főág kitakaró kódja
változatlanul** fut, csak egy biztonságos méretű, előre levágott szövegen:

- a kapuk `redact`-ja (minden kiírás: `writeLog`, `createGate`, `cmdResult` → `tail`, git-stderr) legfeljebb `REDACT_CAP`
  (32 KB) karakteren fut — nagyobb szövegnél az utolsó 32 KB marad (a napló vége a lényeg), egy jelzősorral;
- a külső ellenőr vágott hívói (`maskSecrets(...).slice(0, n)`, n = 160 / 400 / 600) helyett `maskClip(s, key, n)`: a forrás
  `n + max(64, kulcshossz)` karakterre vágva, majd a főági `maskSecrets`, majd `.slice(0, n)`;
- a képgyártó hibaága (`redact(...).slice(0, 300)`) helyett `redactClip(text, key, 300)`, ugyanígy.

A vágási ponton átnyúló token-karakterfutás (betű, szám, `+ / = _ - . ~ % \ @` — a JSON-escape-ek ebbe esnek) **teljesen**
kimarad (a vágás lineárisan a futás elejére hátrál, illetve a kapunál a vágás utáni első két szót átlépve előre lép); a vágáson
átnyúló pontos kulcs-előfordulás is. Így a láthatóságon belül a kimenet a főágé (vagy annak előtagja), a vágásnál nem szivárog.

## 2. NEM cél

- A kitakarás **teljessége** (minden tokenforma minden úton) — a #521 13. pontja szerinti követő jegy.
- A főági regexek módosítása, egyetlen kivétellel: a külső ellenőr `maskSecrets` AIza-mintája `{20,}` → `{20}[…]*` (azonos
  nyelv, azonos kimenet; a főági alak 20 M karakteren `RangeError`-t dob — #521 mérés), mert a teljes jelentést maszkoló út
  (`external-review.mjs` jelentésírás) nem vághat.
- Kapulogika, CI, hookok.

## 3. Mérés (Node, Windows x64, 2026-11-22)

A főági e-mail-regex `'a'.repeat(n)`-en: 16 KB 82 ms, 32 KB 338 ms, 64 KB 1 320 ms. A 300 000-es cél (< 1 s) miatt a kapu
korlátja 32 KB (a főági regex így változatlan maradhat). A főági kód a 300 000-es bemeneten 37,7 s.

## 4. Edge case-ek

- Korlátnál rövidebb szöveg → bájtra a főági kimenet.
- A kapunál a vágás után az első két, szóköz-jellegű karakterrel (szóköz, sortörés) határolt szó kimarad: a vágáson átnyúló szó
  teljesen, és egy félbevágott `Bearer` + hitelesítő pár hitelesítője sem marad előtag nélkül.
- A vágott utakon a vágáspontot metsző kulcs-előfordulás, illetve token-futás teljesen kimarad.
- Üres / `undefined` bemenet → üres szöveg.

## 5. Elfogadás (EARS)

- WHEN a `redact` / `maskClip` / `redactClip` 300 000 vagy 10–20 M karakteres ellenséges bemenetet kap THEN the system SHALL
  kivétel nélkül, bemenetenként 1 s alatt visszatérni (a `maskSecrets` teljes úton is kivétel nélkül).
- WHEN egy kulcs / Bearer / e-mail / DB-URL a vágási ponton átnyúlik THEN the system SHALL egyetlen 6 karakteres darabját
  sem hagyni a kimenetben.
- WHEN a bemenet a hívó láthatósági határán belül van THEN the system SHALL bájtra a főági kitakaró kimenetét adni (a vágott
  utakon a kimenet a főági kimenet előtagja).
- WHEN a meglévő főági kitakaró-tesztek futnak THEN the system SHALL változatlanul zöldnek lenni.

## 6. Tesztterv

`scripts/qa/gates/lib.test.mjs`, `scripts/qa/gates/external-review.test.mjs`, `source/tests/design-assets.test.ts`: nagy bemenet
(idő, összeomlás), vágáson átnyúló titok (6 karakteres darab), bájt-egyezés a főági kód másolatával
(`scripts/qa/gates/kitakaro-main-baseline.mjs`, origin/main 114eaa63). Ellenpróba a főági kódon: a 300 000-es bemenet 37,7 s, a
`maskClip` / `redactClip` hiányzik.

## 7. Kiegészítés — 1. vak kör (9effab11)

- A kapu szóhatára a regex `\s` halmaza (ANSI ESC és vezérlőkarakter nem határ). Az első sort olvasó hívó (`pre-merge-gate`
  `ghJson`) a `redactFirstLine`-t használja: a nyers első sor kitakarva, nem a csonkolásjelző.
- A képgyártói vágás a befejezetlen `Bearer` + whitespace-t is elhagyja (előtag-szerződés); `undefined` / `null` → üres szöveg.
