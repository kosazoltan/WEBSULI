# WEBSULI DESIGN — AI-IMPLEMENTÁCIÓS MESTERUTASÍTÁS

**Verzió:** 1.0 | **Nyelv:** hu-HU | **Állapot:** elfogadott vizuális koncepció alapján készült implementációs specifikáció  
**Kapcsolódó kötelező vizuális referencia:** `Websuli_Design.html` (interaktív, offline prototípus)  
**Projektcél:** az 1–12. osztályosok számára egyetlen, több arculattal működő, hozzáférhető Websuli tanulói felhasználói felület implementálása React + TypeScript + Tailwind CSS alapon.

> **AZ AI-AGENS SZÁMÁRA:** Először olvasd el ezt a teljes fájlt, aztán nyisd meg böngészőben a mellékelt `Websuli_Design.html` fájlt. A HTML a vizuális referencia, nem a végleges alkalmazásarchitektúra. A jóváhagyott öt arculatot, a színhangulatot, a tartalom- és kártyahierarchiát őrizd meg; ne készíts helyette általános admin-dashboardot. A meglévő projektszerkezetet előbb vizsgáld meg; meglévő Websuli kódbázis esetén ne inicializálj új alkalmazást, hanem integráld a komponenseket a projekt meglevő keretrendszerébe. Más fejlesztő változtatásait ne írd felül. A végén futtasd a lint/build/teszteket, és jelentkezz egy ellenőrző listával.

## 1. Vizuális rendszer — változtathatatlan alapok

| Téma ID | Osztály | Név | Arculat | Alapfelület | Főszín | Mélyebb szöveg |
|---|---|---|---|---|---|---|
| `explorer` | 1–2 | Felfedező világ | barátságos természet, nagy kártyák | `#E9F9E9` | `#17865F` | `#174A39` |
| `adventure` | 3–5 | Tudás kalandjai | expedíciók, célok, jutalmak | `#FFF0D2` | `#C36A28` | `#703C1B` |
| `studio` | 6–8 | Kreatív stúdió | **visszafogottabb, érettebb**, kreatív munkatér | `#EFEFFF` | `#5159A8` | `#292F62` |
| `laboratory` | 9–10 | Digitális tudáslabor | **komoly, tudományos**, elemzés | `#E6F3FF` | `#226493` | `#143B62` |
| `future` | 11–12 | Jövőtervező | professzionális, sötétkék portfólió | `#132540` | `#0C929C` | `#EFF8FF` |

* **6–8. évfolyam:** ne legyen rajzfilmes/ovis; projektek, tematikus tananyagkártyák, grafikonok, visszafogott indigó és petrolkék.
* **9–10. évfolyam:** még komolyabb szerkesztés; mérnöki/szemléltető ábrák, képletszerkesztés és eredményjelzők, rendezett tananyagstruktúra.
* **Unisex:** nincs „lányos” és „fiús” verzió, nemtől független szín-, szereplő- és tantárgyválasztás; ne használj nemi sztereotípiára építő illusztrációkat.
* **Vizuális referencia:** a mellékelt HTML felső részén az öt jóváhagyott dashboard egymás mellett látható, lent interaktív témaváltással. A végső rendszerben a felület témát vált, a tananyag és a logika közös.
* Illusztrációk: SVG/CSS vagy jogtisztán beszerzett saját illusztráció; nem szabad a teljes jóváhagyott képet kezelőfelületként, óriási háttérképként használni.

## 2. Kötelező magyar nyelvi és tipográfiai követelmények

1. Minden HTML-gyökér: `<html lang="hu">`; UTF-8 kódolás.
2. Natív magyar karakterek, kötelező próbamondat: `Árvíztűrő tükörfúrógép`, továbbá `á é í ó ö ő ú ü ű Á É Í Ó Ö Ő Ú Ü Ű`.
3. A valódi alkalmazásban **önhostolt, jogtisztán beszerzett, ellenőrzött latin-ext karakterkészletű** Inter (6–12.) és Nunito Sans (1–5.) fontokat használj WOFF2 formátumban, Noto Sans és rendszerfont fallbackkel. Az offline HTML szándékosan rendszerfontokat használ, hogy külső hálózati kapcsolat nélkül is megnyitható legyen; ez nem helyettesíti a produkciós önhostolt betűkészletet.
4. Beolvasás és böngészős render közben **tilos** a magyar ékezetek HTML-entitásos átírása, csonkítása, karaktervesztése vagy fontból hiányzó glifák miatti pótlása. A fontfájl tényleges `ő`, `ű`, `Ő`, `Ű` fedettségét ellenőrizd, ne pusztán a font neve alapján feltételezd.
5. Minimum 16px törzsszöveg a tényleges tananyagnál; az 1–2. osztályban 20–24px, 3–5. osztályban 18–20px. A nagyon kis méretű kiegészítő felirat nem helyettesítheti a rendesen olvasható tananyagot. A prototípus öt egymás melletti miniatűrje összehasonlító látvány, **nem** az éles alkalmazás tartalmi méretszabványa.
6. WCAG 2.2 AA cél, legalább 4.5:1 normál szövegkontraszt, 3:1 nagy szöveg és fontos grafikus állapotjelzők; ne csak színnel közölj információt. A kezdeti hexszínek vizuális irányok, éles szövegpárokra kontrasztteszt szükséges.
7. Nincs kötelező vibráló animáció. Tiszteld a `prefers-reduced-motion` beállítást.

## 3. Funkciók és komponenshatárok

**Közös komponensek:** `AppShell`, `GradeThemeSelector`, `SidebarNavigation`, `DashboardHero`, `SubjectCard`, `LessonCard`, `FlashCard`, `QuizCard`, `LearningProgress`, `AchievementBadge`, `StudyPlan`, `ReviewQueue`, `AccessibleDialog`, `ThemeProvider`.

**Felületi viselkedés:**
- Az évfolyamsáv-választó vizuális témát és célcsoporthoz illő UI-sűrűséget állít. A tényleges tananyag hozzáférését a felhasználó profilja/jogosultsága szabályozza, **nem** a CSS-téma.
- Memóriakártya: előlapon kérdés, hátlapon megoldás; hozzáférhető megfordítás gombbal; két önértékelés: `Még gyakorlom` és `Már tudom`.
- A kérdésre adott értékelést a valódi alkalmazásban tanulási eseményként menteni kell, de a mellékelt HTML prototípus **nem tárol adatot**.
- Tantárgykártya navigál egy valódi tantárgyoldalra; progress csík mellé mindig szöveges érték kerül.
- Ismétlés: **kezdeti MVP algoritmus** értékeléstől függő újraütemezés, később FSRS/SM-2-szerű stratégia komponensként cserélhető. A memóriajelző nem dekoráció.
- A tananyag, az oldal címei és a navigáció alapértelmezésben magyar.

## 4. Projektindítás — zöldmezős változat

**Előfeltétel:** Node.js aktív LTS és npm. A parancsokat projektgyökérben futtasd. Az alábbi példa **új** React/Vite projekt esetén alkalmazható; meglévő `websuli.org`/Websuli repó esetén előbb azonosítsd a keretrendszert, a package managert és a Tailwind főverziót, és **ne futtasd automatikusan** a scaffold parancsot.

```bash
npm create vite@latest websuli-design -- --template react-ts
cd websuli-design
npm install
npm install tailwindcss @tailwindcss/vite lucide-react
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @playwright/test axe-core @axe-core/playwright
```

`vite.config.ts` — Tailwind CSS 4 kompatibilis:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' },
});
```

**Megjegyzés:** a Vite/Vitest verziók TypeScript-típusai függően előfordulhat, hogy a fenti `test` opcióhoz `defineConfig` importját a `vitest/config` modulból kell venni, ha a projekt verziója ezt igényli. Verziók ellenőrzése után alkalmazd a megfelelőt; ne rejts el TS-hibát `any` használatával.

`src/index.css`:

```css
@import "tailwindcss";

@font-face {
  font-family: "Websuli Inter";
  src: url("/fonts/inter-latin-ext.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Websuli Nunito";
  src: url("/fonts/nunito-sans-latin-ext.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

:root {
  font-family: "Websuli Inter", "Noto Sans", sans-serif;
  color-scheme: light;
}
* { box-sizing: border-box; }
html { font-size: 16px; }
body { margin: 0; min-width: 320px; }
:focus-visible { outline: 3px solid #f7ae40; outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
  }
}
```

**Fontbiztonság:** a `public/fonts/...woff2` fájlok az alkalmazáshoz a fontok hivatalos, érvényes licencéből kerüljenek beszerzésre; ezek **nincsenek** mellékelve a dizájnprototípushoz. Az `@font-face` `100 900` csak akkor helyes, ha valódi változó fontfájlt telepítettél; statikus fájl esetén külön súlyokat adj meg. Ne tölts le ismeretlen helyről fontot.

## 5. Tématípusok és design tokenek

`src/design/themes.ts`:

```ts
export type ThemeId = 'explorer' | 'adventure' | 'studio' | 'laboratory' | 'future';
export type Theme = {
  id: ThemeId;
  grades: string;
  name: string;
  accent: string;
  surface: string;
  ink: string;
  font: 'Websuli Nunito' | 'Websuli Inter';
};
export const themes: Record<ThemeId, Theme> = {
  explorer: {id:'explorer',grades:'1–2.',name:'Felfedező világ',accent:'#17865F',surface:'#E9F9E9',ink:'#174A39',font:'Websuli Nunito'},
  adventure: {id:'adventure',grades:'3–5.',name:'Tudás kalandjai',accent:'#C36A28',surface:'#FFF0D2',ink:'#703C1B',font:'Websuli Nunito'},
  studio: {id:'studio',grades:'6–8.',name:'Kreatív stúdió',accent:'#5159A8',surface:'#EFEFFF',ink:'#292F62',font:'Websuli Inter'},
  laboratory: {id:'laboratory',grades:'9–10.',name:'Digitális tudáslabor',accent:'#226493',surface:'#E6F3FF',ink:'#143B62',font:'Websuli Inter'},
  future: {id:'future',grades:'11–12.',name:'Jövőtervező',accent:'#0C929C',surface:'#132540',ink:'#EFF8FF',font:'Websuli Inter'},
};
```

`src/design/ThemeProvider.tsx` — példa a CSS-tokenek kiadására, a további komponensek `var(--ws-accent)` stb. értékeket használnak:

```tsx
import type { CSSProperties, PropsWithChildren } from 'react';
import { themes, type ThemeId } from './themes';
export function ThemeProvider({themeId, children}: PropsWithChildren<{themeId: ThemeId}>) {
  const t = themes[themeId];
  const style = {
    '--ws-accent': t.accent,
    '--ws-surface': t.surface,
    '--ws-ink': t.ink,
    fontFamily: `"${t.font}", "Noto Sans", sans-serif`,
    backgroundColor: t.surface,
    color: t.ink,
  } as CSSProperties;
  return <div data-websuli-theme={themeId} style={style}>{children}</div>;
}
```

**Követelmény:** a CSS-változók segítségével ugyanazokat a szemantikus komponenseket stílusoldalról testre szabni; ne másold le ötször a teljes alkalmazást.

## 6. Memóriakártya React + Tailwind komponens

`src/components/FlashCard.tsx`:

```tsx
import { useState } from 'react';

type FlashCardProps = {
  question: string;
  answer: string;
  onReview: (result: 'again' | 'known') => void | Promise<void>;
};

export function FlashCard({ question, answer, onReview }: FlashCardProps) {
  const [flipped, setFlipped] = useState(false);
  return (
    <section aria-label="Memorizálókártya" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold">Memorizálókártya</h2>
      <button type="button" onClick={() => setFlipped(v => !v)}
        aria-label={flipped ? 'Válasz visszafordítása' : 'Válasz megjelenítése'}
        aria-pressed={flipped}
        className="min-h-44 w-full rounded-xl border-2 border-dashed border-slate-300 p-5 text-center text-xl font-semibold focus-visible:outline-4">
        {flipped ? answer : question}
      </button>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={() => { void onReview('again'); setFlipped(false); }}
          className="rounded-lg border px-4 py-3">Még gyakorlom</button>
        <button type="button" onClick={() => { void onReview('known'); setFlipped(false); }}
          className="rounded-lg bg-[var(--ws-accent)] px-4 py-3 text-white">Már tudom</button>
      </div>
    </section>
  );
}
```

**Éles használat:** add meg a felhasználó számára, melyik kártya sikerült; az aktuális kártya tényleges állapotát szülőkomponens/adatforrás kezeli. A példa egyetlen kártya UI-ját mutatja, még nem ütemezési motor. A választ sikeres szerverválasz után jelöld véglegesen mentettnek, és hibánál biztosíts újrapróbálást.

## 7. Ismétlés ütemezése és adatséma

Az első implementációhoz elég egy egyszerű, tesztelhető stratégia. A tanulási algoritmus legyen a UI-tól külön modulban.

```ts
// src/features/review/schedule.ts
export type ReviewRating = 'again' | 'known';
export type ReviewState = {intervalDays: number; repetitions: number; dueAt: string};

export function nextReview(previous: ReviewState | null, rating: ReviewRating, now: Date): ReviewState {
  const prev = previous ?? {intervalDays: 0, repetitions: 0, dueAt: now.toISOString()};
  const days = rating === 'again' ? 0 : prev.intervalDays === 0 ? 1 : Math.min(prev.intervalDays * 2, 60);
  const dueAt = new Date(now.getTime() + (rating === 'again' ? 10 * 60_000 : days * 86_400_000));
  return { intervalDays: days, repetitions: rating === 'again' ? 0 : prev.repetitions + 1, dueAt: dueAt.toISOString() };
}
```

**Figyelem:** MVP példa, nem klinikailag/pedagógiailag validált optimum. Az ismétlés esedékességét az időzónától független ISO 8601 pillanatokkal tárold, a megjelenített dátum legyen `hu-HU` szerint formázva.

Javasolt backend objektumok: `user_profiles`, `subjects`, `lessons`, `flashcards`, `review_states`, `review_events`, `quiz_attempts`, `progress_snapshots`. Gyermekek adataira alkalmazz adattakarékosságot, jogosultságellenőrzést és életkornak megfelelő adatvédelmi szabályokat; a téma kiválasztása önmagában nem azonosít bejelentkezett felhasználót.

## 8. Reszponzív és hozzáférhető UI

- **320–639px:** egyoszlopos tananyag; navigáció könnyen elérhető; érintési célterület célszerűen min. 44×44px.
- **640–1023px:** kétoszlopos tartalmi kártyák, egyszerűsített oldalsáv.
- **1024px fölött:** fő navigáció és 2–3 oszlopos dashboard, jó olvasható maximális szövegszélesség.
- Értelmes HTML landmarkok: `header`, `nav`, `main`, `section`, `footer`.
- Kártyafordítás: valódi `button` `aria-label`-lel és fókuszláthatósággal, Enter/Space aktiválható.
- Témaválasztó: hozzáférhető `tablist`/`tab` vagy natív gombsor megfelelő állapotjelzéssel. A billentyűnavigáció nem szorulhat be.
- A 11–12. évfolyamos sötét téma tartalmi paneljein biztosíts megfelelő kontrasztot (sötét háttéren világos szöveg, világos kártyán sötét szöveg).
- A valós tanulási képernyőn nincs 10–12px-re zsugorított tananyagszöveg; a mellékelt összehasonlító miniatűrök kivételt képeznek, mert grafikai minták.

## 9. Megvalósítási munkafázisok — pontos végrehajtási utasítás

1. **Felderítés:** `pwd`, `git status --short`, `ls`, `cat package.json` — azonosítsd a repót és az aktuális állapotot. Ne módosíts előzetesen nem érintett fájlokat.
2. **Vizuális ellenőrzés:** nyisd meg a `Websuli_Design.html`-t (böngésző, képernyőkép), hasonlítsd össze az öt megjelenést; a 6–8. és 9–10. közötti komolysági különbséget őrizd meg.
3. **Design tokenek:** definiáld a `themes.ts` adattípust és a `ThemeProvider`-t, dokumentáld a tipográfiát és színkontrasztokat.
4. **AppShell:** készíts mobil-first reszponzív navigációs keretet és évfolyamtémaválasztót; a felület ugyanazokból a React-komponensekből épüljön.
5. **Tanulás:** készíts tantárgy-, feladat-, memorizálókártya-, teszt- és eredménykomponenseket tényleges (kezdetben fixture) adatokkal.
6. **Interakciók:** témaváltás, kártyafordítás, válaszértékelés, tudásszint-visszajelzés működjön; semelyik gomb nem maradhat látszatfunkció.
7. **Ismétlés:** az ütemezés elkülönítve, tesztelhető modulban; valódi adatperzisztenciát csak létező backendhez kapcsolva végezz, különben egyértelműen „demóadat”-ként jelenítsd meg.
8. **Hozzáférhetőség:** billentyűzet, képernyőolvasó alapok, kontraszt, magyar betűk, kis kijelzős olvashatóság, csökkentett animáció.
9. **Minőségbiztosítás:** unit/component tesztek, Playwright funkcionális teszt mind az öt témában, képernyőképes vizuális összehasonlítás legalább 390, 768 és 1440px szélességen.
10. **Átadás:** felsorolt kész fájlok, futtatási parancsok, tesztlogok, ismert hiányosságok, előtte/utána képernyőképek. Ne állíts elkészült backendfunkciót, ha csak demó működik.

## 10. Tesztelés — reprodukálható parancsok

```bash
npm run dev
npm run build
npm run lint
npx vitest run
npx playwright install chromium
npx playwright test
```

**Hozz létre** `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

**Playwright alapteszt (példa)** `tests/websuli.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('magyar betűk és öt témaválasztó', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await expect(page.getByText('Websuli', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(5);
  await expect(page.getByText('Árvíztűrő tükörfúrógép')).toBeVisible();
});

test('memorizálókártya működik', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await page.getByRole('button', { name: /válasz megjelenítése/i }).click();
  await expect(page.getByText(/tűzoltó.*hosszú ű/i)).toBeVisible();
});
```

**Fontos:** ezek célszerződések az implementálandó alkalmazásra, nem bizonyítékai annak, hogy a tesztek a mostani demóban már futnak. A tesztcsomaghoz készíts `playwright.config.ts` fájlt `webServer` konfigurációval, vagy indítsd előtte az alkalmazást. Ha az implementált UI szövege azonos szemantikát más címkével fejez ki, igazítsd a tesztet a hozzáférhető szerephez — ne hagyj érvénytelen szelektorokat.

## 11. Kötelező elfogadási lista

- [ ] Öt külön téma működik, **egy közös komponensrendszerrel**.
- [ ] 6–8. osztály komolyabb, mint 3–5.; 9–10. komolyabb, mint 6–8.
- [ ] Nemhez kötött dizájn vagy sztereotípiák nélkül működik.
- [ ] Magyar `ő/ű/Ő/Ű` megjelenik minden nézetben, minden ténylegesen használt fonttal.
- [ ] A valódi tanulási felületen a törzsszöveg olvasható és a kontraszt megfelel a célnak.
- [ ] Mobil/tablet/desktop nézetek ellenőrizve.
- [ ] Memóriakártya egérrel, érintéssel és billentyűzettel működik.
- [ ] Nincs dekorációként ott hagyott, nem működő interaktív elem.
- [ ] A tanulói adatok nem keverednek profilok között.
- [ ] A felület vizuálisan visszavezethető az elfogadott HTML-re.
- [ ] Build, lint, tesztek és ismert hiányosságok dokumentálva.

## 12. Végső feladat az AI-kódoló számára

**Utasítás szó szerint:** „Implementáld a Websuli Design öt arculatát a mellékelt HTML vizuális referencia és e Markdown-specifikáció alapján. A felhasználói felület legyen React + TypeScript + Tailwind CSS (ha a meglévő projekt technológiája ezt lehetővé teszi), moduláris, reszponzív, unisex, magyarul tökéletesen olvasható és WCAG 2.2 AA-célok szerint hozzáférhető. A közös tanulási motor és komponensek maradjanak témától függetlenek. Készíts működő évfolyamválasztót, tantárgykártyákat, memóriakártyákat, gyakorlási visszajelzést és haladási képernyőt. Ellenőrizd az öt témát képernyőképpel és tesztekkel. Ha a backend nincs megadva, használj egyértelműen jelzett fixture-adatokat, és ne állíts valódi mentést. A meglévő projektbe biztonságosan integrálj; végül mutasd meg a módosított fájlokat, tesztek eredményét és a még megvalósítandó részeket.”

---

### Mellékelt fájl

- `Websuli_Design.html` — teljesen önálló, egyetlen HTML-fájlban működő vizuális és interaktív prototípus; nincs CDN-, API- vagy hálózati függősége. Ez **nem** kész adatbázisos Websuli-alkalmazás.
