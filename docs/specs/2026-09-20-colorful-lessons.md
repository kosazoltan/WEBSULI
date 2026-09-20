# Spec: színes, figyelemfelkeltő tananyag — vizuális világ a tervező fázisból

> Dátum: 2026-09-20 · Kérés: a gyerekek édesanyja (a tulajdonoson át): alsó tagozatosoknak érdekfeszítő színek,
> figyelemfelkeltő kiemelések minden tananyagban, leckénként véletlenszerűen változó grafikai megjelenés,
> hogy a tananyag ne legyen „nyers és száraz". Ötletforrás: a 2026. január–márciusi leckék főlapja.

## 1. Cél
A Studio-lecke (LessonRuntime) minden példánya kapjon egy **vizuális világot** (paletta + hangulat + emoji-készlet),
amelyet a **tervező (pedagógus)** választ véletlen javaslat alapján, és amely végigmegy a láncon: fejezet-emoji a
címek előtt, a fejezet **kulcskifejezéseinek** kiemelése a magyarázatokban és az összefoglalókban, a „Miért?"
magyarázat „Tudtad?" kártyaként, a téma színei a teljes lapon. Két egymás utáni futás ugyanarra a térképre más
világot kaphat.

## 2. Ötletforrás (mérve a jan–márc. 2026 leckéken)
Élénk, többszínű paletták (rózsaszín/lila/cián/sárga; sötét „űr" háttér neon kiemeléssel), `linear-gradient(135deg, …)`
pasztell háttér, emoji a címekben és a kártyákon (🥷 🚀 🍎 🦋 🌊 🎮), „tipp"/„érdekesség" dobozok, kerekített
kártyák, Nunito/Comic-jellegű betű a kicsiknek.

## 3. Nem cél
- Új blokk-típus a Lesson sémában (a „Tudtad?" a meglévő `depth: "why"` explain kártyája).
- A webes (v7.4 HTML) ág: ott már van `pickLessonTheme`.
- Képgenerálás.

## 4. Megvalósítás
- `shared/lesson-visuals.ts`: 8 világ (`candy`, `space`, `jungle`, `ocean-kids`, `meadow`, `dojo`, `arena`, `magic`):
  id, név, hangulat, emoji-készlet, paletta (bg-gradiens, felület, tinta, akcent, kiemelés). `pickVisualWorld(seed?)`
  véletlen; `splitEmphasis` / `stripEmphasis` a `**kiemelés**` jelöléshez.
- `EXPERIENCE_THEMES` += a 8 világ (a régi 6 marad a kész leckékhez); `lesson-experience.css`: a 8 világ
  változói + `.lesson-key` kiemelés + `depth="why"` kártya + fejezet-emoji.
- Séma: `sectionSchema.emoji?` (≤ 8 karakter); vázlat: `sections[].emoji?`, `sections[].keyPhrases?` (≤ 4, ≤ 40
  karakter), `visual?: { world }`.
- Tervező: a runner véletlen világot javasol (jobonként egyszer, `job.output.visual`-ban rögzítve, így a lépés
  idempotens marad); a lélek és a skill kimondja: „színes, figyelemfelkeltő, de a kiemelés a lényeget mutatja"; a
  terv fejezetenként emoji-t és 2–4 kulcskifejezést ad (a térkép szavaiból).
- Szerző: a `keyPhrases`-t `**…**` jelöléssel emeli ki (blokkonként ≤ 3); a lektor tudja, hogy a `**` jelölés, nem
  tartalom; a runner a fejezet-emoji-t a vázlatból másolja a leckébe (determinisztikus).
- Bank: `experience.theme` = a lecke világa (nem hash).
- Runtime: emoji a fejezetcím és a haladásjelző előtt; `**…**` → `<mark class="lesson-key">`; a felolvasás a jelölés
  nélküli szöveget mondja.

## 5. Elfogadás
- WHEN egy lecke a pedagógus lépésen átmegy THEN `output.visual.world` a 8 világ egyike, és két különböző job
  eltérő világot kaphat (véletlen, teszt: 40 húzásból ≥ 4 különböző).
- WHEN a szerző elkészül THEN minden fejezetnek van emoji-ja (a vázlatból), és a kiemelt kulcskifejezések
  `**…**` jelöléssel szerepelnek legalább a fejezet egy explain vagy recap blokkjában (prompt-szabály; a runtime
  renderel).
- WHEN a bank elkészül THEN `experience.theme === output.visual.world`.
- A runtime a `**` jelölést kiemelésként rendereli, a TTS jelölés nélkül olvas; minden világhoz van CSS-szabály.
- Kapuk: tsc, check:test, lint, npm test; valódi futás `done`-nal, a lecke élesben színes világgal.
