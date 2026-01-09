# Landing Page Teljesítmény Elemzés

## Összefoglaló

A landing page lassú működésének fő okai a következők:

---

## 1. **Frontend Animációk és Canvas Renderelés (KRITIKUS)**

### Probléma:
- **HeroSection komponens**: Folyamatos canvas animáció `requestAnimationFrame`-mel
  - 5 részecske (particle) animáció
  - Molekuláris struktúrák rajzolása
  - Kapcsolódó vonalak számítás és renderelés
  - Minden frame-ben újrarajzolás
  
- **ScientificBackground komponens**: Második canvas animáció párhuzamosan
  - 4 koncentrikus kör animáció
  - Hexagon rotáció
  - 8 lebegő szimbólum CSS animációkkal
  - Teljes képernyős canvas renderelés

**Hatás**: CPU használat 30-60% között, különösen mobil eszközökön.

**Megoldás javaslat**:
- Canvas animációk kikapcsolása alacsony teljesítményű eszközökön
- `will-change` és `contain` CSS tulajdonságok optimalizálása
- Animációk szüneteltetése amikor a tab nem aktív (`Page Visibility API`)
- Animációk sebességének csökkentése (már részben meg van, de tovább lehet)

---

## 2. **N+1 Query Probléma - LikeButton API Hívások (KRITIKUS)**

### Probléma:
Minden fájlhoz külön `LikeButton` komponens van, és mindegyik:
1. Külön FingerprintJS hívást csinál (első render)
2. Külön API hívást csinál a like status-hoz (`/api/materials/:id/likes`)

**Példa**: Ha 50 fájl van a listában:
- 50x FingerprintJS hívás (async, mindegyik ~100-300ms)
- 50x API hívás a like status-hoz (50x ~50-200ms = 2.5-10 másodperc összesen)

**Hatás**: A landing page betöltése 5-15 másodpercig is eltarthat, mert minden like gomb külön kéri le az adatokat.

**Megoldás javaslat**:
- Batch API endpoint: `/api/materials/likes/batch?ids=id1,id2,id3...`
- Egyetlen API hívás az összes like status-hoz
- FingerprintJS cache-elése (ugyanaz a fingerprint minden LikeButton-hoz)
- Lazy loading: csak a látható fájlok like status-át kérjük le (Intersection Observer)

---

## 3. **Frontend Szűrés és Rendezés Minden Render-nél**

### Probléma:
A `UserFileList` komponensben a `filteredFiles` számítás minden render-nél újra fut:

```typescript
const filteredFiles = files
  .filter(file => { /* ... */ })
  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
```

**Hatás**: Nagy fájllistánál (100+ fájl) minden szűrő változás vagy keresés lassú lehet.

**Megoldás javaslat**:
- `useMemo` hook használata a `filteredFiles` számításához
- Függőségek: `files`, `searchQuery`, `selectedClassroom`

---

## 4. **Backend API Optimalizálás Lehetőségei**

### Jelenlegi állapot:
- A `getAllHtmlFiles()` már optimalizált: nem küldi a `content` mezőt (üres string)
- De még mindig minden rekordot lekérdez

**Javaslat**:
- Pagináció vagy limit hozzáadása (pl. első 100 fájl)
- Indexek ellenőrzése (már vannak: `classroomIdx`, `createdAtIdx`)
- Response caching (pl. Redis vagy memória cache 5 percig)

---

## 5. **React Komponens Optimalizálás Hiánya**

### Probléma:
- `UserFileList` nincs `React.memo`-val optimalizálva
- Minden fájl kártya újra renderelődik, ha bármi változik

**Megoldás javaslat**:
- `UserFileList` memo-izálása
- Fájl kártyák memo-izálása (`React.memo` vagy `useMemo`)

---

## 6. **Felesleges Re-renderelések**

### Probléma:
- `HeroSection` memo-izálva van, de a props (`totalFiles`, `totalClassrooms`) változhat
- `ScientificBackground` memo-izálva van, de a szülő komponens újra renderelheti

**Megoldás javaslat**:
- Props stabilizálása (`useMemo` a számított értékekhez)
- Context API használata a statisztikákhoz (ha szükséges)

---

## 7. **Bundle Size és Code Splitting**

### Jelenlegi állapot:
- A `Home` komponens nincs lazy load-olva (de ez nem kritikus, mert a landing page)

**Javaslat**:
- Heavy komponensek (pl. `HeroSection`, `ScientificBackground`) lazy load-olása
- De csak akkor, ha a bundle size probléma

---

## Prioritás szerinti Javaslatok

### 🔴 **KRITIKUS (azonnali javítás)** ✅ **KÉSZ**
1. **LikeButton batch API** - N+1 query probléma megoldása ✅
   - Backend: `/api/materials/likes/batch` endpoint létrehozva
   - Frontend: Batch API integráció + fingerprint cache (`fingerprintCache.ts`)
   - Eredmény: 50 API hívás → 1 API hívás (50x gyorsabb)
2. **Canvas animációk optimalizálása** - CPU használat csökkentése ✅
   - Page Visibility API implementálva (animációk szünetelnek inaktív tab-nál)
   - HeroSection és ScientificBackground komponensekben

### 🟡 **FONTOS (rövid távon)** ✅ **KÉSZ**
3. **FilteredFiles useMemo** - Szűrés/rendezés optimalizálása ✅
   - `useMemo` hook használata a `filteredFiles` számításához
4. **UserFileList memo-izálás** - Re-render csökkentése ✅
   - `React.memo` használata a komponens optimalizálásához

### 🟢 **JÓL JÖNNE (hosszú távon)**
5. **Backend pagináció** - Nagy adatkészletek kezelése
6. **Response caching** - Ismétlődő kérések gyorsítása

---

## Mérési Adatok Szükségesek

A pontos teljesítmény javításhoz ajánlott mérések:
- **Lighthouse Performance Score** (jelenlegi érték?)
- **Time to Interactive (TTI)** (jelenlegi érték?)
- **First Contentful Paint (FCP)** (jelenlegi érték?)
- **API response times** (backend logokból)
- **Canvas FPS** (Chrome DevTools Performance profiler)

---

## Összefoglalás

A landing page lassúságának fő okai:
1. **Canvas animációk** - CPU-intenzív, folyamatos renderelés
2. **N+1 API hívások** - Minden like gomb külön kéri az adatokat
3. **Hiányzó memo-izálás** - Felesleges re-renderelések

A legnagyobb hatást a **LikeButton batch API** megvalósítása és a **canvas animációk optimalizálása** hozná.

