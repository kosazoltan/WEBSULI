# Nyilvános oldal sebesség — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-nyilvanos-oldal-sebesseg.md`. Munkakönyvtár: `source/`. Ág: `perf/nyilvanos-oldal`.

1. **`client/src/index.css`:**
   - a `.glass-card::before` és a `.honeycomb-bg` `animation` sora → `animation: none` (a `@keyframes` törlése, ha másutt nem
     használt — `grep`);
   - a `.glass-card` mindkét definíciójából (alap és mobil media query) a `backdrop-filter` / `-webkit-backdrop-filter` törlése;
     a háttér alfa: asztali 0,5 → 0,62 és 0,3 → 0,48, mobil 0,6 → 0,74;
   - új szabály: `.material-card-cell { content-visibility: auto; contain-intrinsic-size: auto 168px; }`.
2. **`client/src/components/UserFileList.tsx`:**
   - a kártya-burkoló `motion.div` → `div className="material-card-cell"`; a `cardVariants`, a `whileHover` és a nyíl
     `motion.div`-je törlődik (a nyíl: `div` + `transition-transform group-hover:scale-110`);
   - az ikondoboz `backdrop-blur-md` osztálya törlődik;
   - ha a `lightMotion` és a `framer-motion` import feleslegessé válik, törlés.
3. **Statikus őr:** `tests/public-perf.test.ts`:
   - az `index.css`-ben a `.glass-card` szabályokban nincs `backdrop-filter`, és nincs `animation: honeycomb-shift`;
   - a `UserFileList.tsx`-ben nincs `motion.div` és `backdrop-blur` a kártyán;
   - van `content-visibility: auto`.
4. **Böngészős teszt:** `tests/public-perf.spec.ts` (a `curriculum-order.spec` mock-mintájával, 210 kártya):
   - betöltés után a `document.getAnimations()` szűrve a végtelen (`iterations === Infinity`) animációkra legfeljebb 2
     (szivárvány-felirat, nyíl);
   - a `backdrop-filter`-es elemek száma legfeljebb 10.
5. **A/B mérés:** scratchpad `perf/ab.mjs` — mindkét buildet (main és ág) statikusan kiszolgálja, az `/api/html-files`-t a lementett
   éles pillanatképpel tölti, 3-3 futás; az eredmény a PR-leírásba kerül.
6. **Ellenőrzés:**
   - `tsc`, `check:test`, `eslint`, `npm.cmd test`, `build`;
   - `playwright test tests/public-perf.spec.ts tests/welcome-card.spec.ts tests/curriculum-order.spec.ts tests/websuli.spec.ts`;
   - élesben a deploy után a `measure.mjs`.
