# Spec: egységes főoldali megjelenítés — a kártya leírása a lecke saját bevezetője

> Dátum: 2026-11-03 · Szerző: Claude (Kósa Zoltán kérésére: „autonóm módon, a feltárt hibákat javítva, készítsd el az egységes
> megjelenítést”) · Állapot: JÓVÁHAGYVA

## Mért tények (élesben, 2026-11-03, `febd949e`)

- **Leírás:** a 217 főoldali anyagból 213 leírása a publikálás helyőrzője: „Websuli lecke — a lecke-futtató jeleníti meg.” Forrása
  `server/studio/pipeline-store.ts` (240. és 251. sor), minden leckénél ugyanaz. 4 anyag leírása üres. A kártyán így 213-szor
  ugyanaz a semmitmondó szöveg áll, és a főoldali keresés (cím + leírás) sem talál a lecke tartalmára.
- **Kép:** a kártyakép a lejátszó kezdőképe (#381). 135 anyagnál ez még a sáv általános hős-képe; a tartalomhoz illő borítókat a
  párhuzamos #382 (katalógus + `art.picture`-csere) hozza, külön munkamenetben.

## 1. Cél

- A kártya leírása a lecke saját bevezetője legyen: az első fejezet első magyarázó (`explain`) blokkjának eleje, jelölés nélkül,
  egész mondatokra rövidítve (≤ 160 karakter).
- Az új publikálás ezt írja a `html_files.description`-be a helyőrző helyett.
- A már publikált anyagoknál a lista a helyőrző (vagy az üres leírás) helyett ugyanezt adja, éles adatírás nélkül.

## 2. NEM cél

- A valódi, kézzel írt leírások: maradnak.
- A borítókép-csere (#382) és a kártya kinézete (#381).
- A HTML- és PDF-anyagok leírása: lecke nélkül nincs miből bevezetőt képezni.

## 3. Érintett területek

- `source/shared/lesson-teaser.ts` (új, tiszta):
  - `LESSON_PLACEHOLDER_DESCRIPTION`;
  - `teaserFromText(text)`: a jelölés (`**`, `*`, `_`, `` ` ``, `#`) és a sortörés eltávolítása, az első bekezdés, egész mondatok
    ≤ 160 karakterig, különben szóhatáron vágva „…”-tal;
  - `lessonTeaser(json)`: az első fejezet első `explain` blokkjának szövege;
  - `isPlaceholderDescription(d)`: üres vagy a helyőrző.
- `source/server/storage.ts`, `getAllHtmlFiles`: a publikált leckéből SQL-lel csak az első `explain` blokk szövegét olvassa
  (`jsonb_array_elements`), és a helyőrző vagy üres leírást lecseréli.
- `source/server/studio/pipeline-store.ts`, `publishLesson`: a tranzakcióban olvasott lecke-JSON-ból `lessonTeaser`; ha nincs, a
  régi helyőrző.
- `source/tests/lesson-teaser.test.ts` (új).

## 4. Rögzített döntések

- A bevezető forrása kizárólag a lecke tanítószövege (forrásból igazolt tartalom); nincs modellhívás.
- Max. 160 karakter (kártyán 2 sor, `line-clamp-2`).
- Az első `explain` blokk, ennek hiányában az első szöveges (`text` mezős) blokk.
- A helyőrző felismerése pontos szöveg-egyezés. A régi adatot nem írjuk át (a lista számolja), az újat a publikálás írja.

## 5. Edge case-ek

- Csak jelölés vagy üres szöveg → `null` → a régi leírás marad (helyőrző).
- Egyetlen hosszú mondat → szóhatáron vágva, „…”.
- A cím ismétlése a bevezető elején megengedett (a lecke szövege).
- Képletek, idézőjelek: maradnak; a `$`/LaTeX jelölést nem bontjuk (a tananyag így tárolja).

## 6. Elfogadás (EARS)

- WHEN egy publikált lecke leírása a helyőrző vagy üres, THEN a `/api/html-files` SHALL a lecke bevezetőjét adni.
- WHEN egy anyag leírása valódi szöveg, THEN az SHALL változatlan maradni.
- WHEN egy lecke publikálódik, THEN a `html_files.description` SHALL a bevezető legyen (ha képezhető).
- WHEN a bevezető 160 karakternél hosszabb lenne, THEN SHALL egész mondatra, különben szóhatárra vágva „…”-tal végződni.

## 7. Tesztterv

- `tests/lesson-teaser.test.ts`:
  - jelölés-eltávolítás;
  - mondathatár;
  - hosszú mondat szóhatáron;
  - az első `explain` blokk kiválasztása;
  - üres vagy hiányos lecke;
  - a helyőrző felismerése.
- Teljes kör: `tsc` (app + teszt), `eslint`, `npm test`. Élesben: `/api/html-files` (helyőrző-arány 213/217 → ~0), főoldal
  390/1280 px.

## 8. Kockázatok / visszavonás

- A lista egy további, kicsi oszlopot olvas (az első `explain` blokk szövege), a meglévő `HtmlFilesCache` alatt.
- Visszavonás: a merge commit revertje.

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-03-egyseges-kartya-leiras-vegrehajtas.md`
