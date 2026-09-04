# LS-2 — Lecke-készítés és lecke-futtató: így fogod használni

**Mi változott (2026-09-04):** a jóváhagyott Tudás-térképből mostantól **strukturált lecke**
készülhet, amit a WEBSULI saját futtatója jelenít meg — nem egy AI által generált
HTML-oldal iframe-ben.

## Miért jobb ez, mint eddig

Eddig egy tananyag egy kész HTML-fájl volt: a gép megírta, mi betettük egy keretbe, és
kész. Ennek három baja volt, és mind a hármat ez a szelet szünteti meg:

1. **Nem lehetett ellenőrizni**, mit állít. Most minden mondat vissza van kötve a
   Tudás-térkép egy fogalmához, és ami nem köthető vissza, azt a rendszer nem engedi
   publikálni.
2. **Minden anyag máshogy nézett ki és máshogy működött.** Most egy közös futtató
   rendereli mindet: ugyanaz a betűméret-rendszer korosztály szerint, ugyanakkora
   gombok, ugyanaz a mobilviselkedés.
3. **Idegen kódot kellett futtatnunk.** A lecke mostantól adat, nem program — nincs
   benne script, amit meg kellene bíznunk.

## Mi az a „lecke" pontosan

Egy lecke szakaszokból áll, egy szakasz pedig blokkokból. Hatféle blokk van:

| Blokk | Mit csinál | Kész? |
|---|---|---|
| **Magyarázat** | Elmondja az anyagot. Van „Miért?" és „Mélyebben" szintje is | ✅ most |
| **Példa** | Feladat, majd **lépésenként** felfedhető megoldás | ✅ most |
| **Kérdés** | Feleletválasztós, **minden válaszhoz saját magyarázattal** | ✅ most |
| **Összefoglaló** | A lecke végi lényeg | ✅ most |
| **Animáció** | 8 típus (számegyenes, tört, idővonal, …) | ⏳ 4. szelet |
| **Gyakorlat** | Húzd sorba / töltsd ki / párosítsd | ⏳ 4. szelet |

A még nem kész blokkok **láthatóan** jelzik magukat a leckében („ez az elem a következő
szakaszban jelenik meg") — szándékosan, mert egy hiányzó harmadnak látszania kell, nem
eltűnnie.

## A legfontosabb, amit érdemes tudnod

**A rossz válasz is tanít.** Minden válaszlehetőséghez külön magyarázat tartozik, nem
csak a helyeshez. Ha a gyerek a gyökérre tippel, azt olvassa, hogy „a gyökér vizet vesz
fel, de fény nem éri" — nem azt, hogy „hibás".

**A példa nem zúdítja rá a megoldást.** Egy gombnyomás = egy lépés. A gyerek közben
gondolkodhat.

**A forrás itt is nyer (D1).** A Lektor átnézi a kész leckét, de **soha nem írja át**.
Ha észreveszi, hogy a tankönyv téved, azt neked jelzi admin-jegyzetként — a gyerek felé
semmilyen jelölés nem kerül ki. Ez géppel van biztosítva: a jegyzet lerakása után a
lecke szövege bájtra ugyanaz.

## A publikálási kapu

Egy lecke csak akkor mehet ki, ha:

- **minden kulcsfogalmat** tanít (100%),
- a **kiegészítő fogalmak legalább 90%-át** lefedi,
- és **nem hivatkozik kitalált fogalomra** — csak olyanra, amit te jóváhagytál a
  térképen.

Ha bármelyik nem teljesül, a rendszer megmondja, pontosan mi hiányzik.

## Mennyibe kerül

A leckeírás modellhívásokból áll (pedagógus → szerző → lektor). Két dolog védi a pénztárcát:

- **Ugyanaz a munka nem fut le kétszer**: azonos bemenetre a rendszer a korábbi
  eredményt adja vissza.
- **A javítókör legfeljebb kétszer fut.** Ha a Lektor kétszer után is blokkolót talál,
  a folyamat megáll és **te döntesz** — nem pörög a végtelenségig.

## Ami még nincs kész

- Az animációk és a gyakorlatok (4. szelet).
- A kupon és a játék-jutalom (3. szelet) — a szakaszok végi „Próba" helye már megvan a
  sémában, de a jutalom még nem működik.
- A felolvasás (4. szelet).

---

### Technikai összefoglaló (fejlesztőknek)

- Séma: `shared/lesson-schema.ts` — `sourceOnly: z.literal(true)` (D1 géppel), minden
  nem-`recap` blokk `coversConceptIds ≥ 1`. Az életkori sáv **osztályból származtatott**
  (`ageBandForClassroom`), nincs kétszer tárolva.
- Kapu: `server/studio/coverage.ts` — core 100% / supporting ≥90% / nincs ismeretlen id;
  az üres térkép **nem** megy át (0/0 aritmetikailag 100% lenne).
- Lektor: `server/studio/lektor.ts` — `applyLektorVerdict` szerkezetileg nem tud
  módosítani; `book_probably_wrong` = `info`, admin-only.
- Állapotgép: `server/studio/pipeline.ts` — `MAX_AUTHOR_ROUNDS = 2`, fail-closed, a
  cache-kulcsban benne a **kör** is (különben a javítókör no-op lenne).
- DB: `lessons` / `studio_jobs` / `lektor_notes`, `0009` migráció Neonon lefuttatva.
  A térkép **restrict** (publikált lecke forrása nem törölhető), a lecke alatt minden
  cascade. Hat viselkedés valódi DB-n mérve.
- Futtató: `client/src/lesson-runtime/`, a `Preview.tsx` `contentType === 'lesson'`
  esetén erre ágazik. Publikus olvasó végpont: `/api/lessons/by-file/:id`, csak
  publikált leckét ad ki, és **kiadás előtt újravalidálja** a tárolt JSON-t.
- Kapuk: tsc 0 · eslint 988/989 · unit 317/317 · build OK · Playwright 19/19.
- Reverz-mutáció: 6 a fedettségi kapun, 5 a lektoron, 7 az állapotgépen, 4 a futtatón —
  mind bukik. Kettőt maga a mutáció talált (üres térkép őre, illetve a fejlesztői
  localhost-lista) és utólag lett letesztelve.

### Nyitott, mért tétel

Az e2e-suite egyik tesztje **ingadozott** (3 futásból 1× bukott, a nevét nem sikerült
azonosítani a futás leállítása előtt). A legutóbbi három teljes futás 19/19 zöld volt.
Ez nyitott kérdés, nem minősítjük zajnak mért diagnózis nélkül.
