# Tananyag Okosítás Funkció - Dokumentáció

## Áttekintés

A **Tananyag Okosítás** funkció lehetővé teszi, hogy a régebbi, kevésbé fejlett HTML tananyagokat modern, responsive, interaktív tananyaggá alakítsuk Claude AI (Anthropic) segítségével. A funkció streaming módban működik, progress feedback-kel, hogy a felhasználó mindig lássa a folyamat állapotát.

## Főbb Funkciók

### 1. AI-alapú HTML Javítás
- **Claude Sonnet 4.5** használata modern HTML generáláshoz
- Streaming válasz (SSE - Server-Sent Events) timeout problémák elkerülésére
- Progress feedback minden lépésnél
- Egyedi prompt támogatás

### 2. Javított Fájlok Kezelése
- Javított fájlok tárolása adatbázisban
- Státusz kezelés: `pending`, `approved`, `rejected`, `applied`
- Előnézet funkció (eredeti vs. javított)
- Alkalmazás az eredeti fájlra

### 3. Backup Rendszer
- Automatikus backup készítés alkalmazás előtt
- Backup visszaállítás funkció
- Backup törlés

## Technikai Részletek

### Backend API Endpoints

#### POST `/api/admin/improve-material/:id`
Javított HTML fájl létrehozása streaming módban.

**Request:**
```json
{
  "customPrompt": "Opcionális egyedi instrukciók"
}
```

**Response (SSE Stream):**
```
data: {"type":"progress","message":"📂 Fájl betöltése..."}
data: {"type":"progress","message":"📝 System prompt betöltése..."}
data: {"type":"progress","message":"🤖 Claude API hívása..."}
data: {"type":"progress","message":"📝 HTML generálása..."}
data: {"type":"content_delta","content":"<html>..."}
data: {"type":"progress","message":"🔧 HTML tisztítása és validálása..."}
data: {"type":"progress","message":"💾 Javított fájl mentése..."}
data: {"type":"complete","improvedFile":{...}}
data: [DONE]
```

**Timeout:** 90 másodperc

**Validáció:**
- Max fájlméret: 5MB
- HTML struktúra validálás
- XSS védelem
- CSS szintaxis javítás

#### GET `/api/admin/improved-files`
Összes javított fájl listázása.

#### GET `/api/admin/improved-files/:id`
Egy javított fájl részletes adatai (eredeti fájllal együtt).

#### PATCH `/api/admin/improved-files/:id`
Javított fájl státuszának és jegyzeteinek frissítése.

**Request:**
```json
{
  "status": "approved" | "rejected" | "applied",
  "improvementNotes": "Megjegyzések"
}
```

#### POST `/api/admin/improved-files/:id/apply`
Javított fájl alkalmazása az eredeti fájlra.

- Automatikus backup készítés
- Eredeti fájl frissítése
- Státusz beállítása `applied`-re

#### DELETE `/api/admin/improved-files/:id`
Javított fájl törlése.

#### GET `/api/admin/improvement-backups`
Összes backup listázása.

#### POST `/api/admin/improvement-backups/:id/restore`
Backup visszaállítása.

#### DELETE `/api/admin/improvement-backups/:id`
Backup törlése.

### Adatbázis Séma

#### `improved_html_files` tábla
```sql
CREATE TABLE improved_html_files (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  original_file_id VARCHAR REFERENCES html_files(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  description TEXT,
  classroom INTEGER NOT NULL,
  content_type VARCHAR NOT NULL DEFAULT 'html',
  improvement_prompt TEXT,
  status VARCHAR NOT NULL DEFAULT 'pending',
  improvement_notes TEXT,
  created_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  applied_at TIMESTAMP
);
```

**Státusz értékek:**
- `pending` - Várakozik jóváhagyásra
- `approved` - Jóváhagyva, alkalmazható
- `rejected` - Elutasítva
- `applied` - Alkalmazva az eredeti fájlra

#### `material_improvement_backups` tábla
```sql
CREATE TABLE material_improvement_backups (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  original_file_id VARCHAR REFERENCES html_files(id),
  improved_file_id VARCHAR REFERENCES improved_html_files(id),
  backup_data JSONB NOT NULL,
  created_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
```

### Frontend Komponens

#### `MaterialImprover.tsx`
Fő komponens az okosítás funkcióhoz.

**Funkciók:**
- Fájl kiválasztás dropdown-ból
- Egyedi prompt bevitel
- Javítás indítása
- Javított fájlok listázása táblázatban
- Előnézet (4 tab: eredeti futó, eredeti kód, javított futó, javított kód)
- Státusz frissítés
- Alkalmazás az eredeti fájlra
- Törlés

**Streaming kezelés:**
```typescript
const res = await fetch(`/api/admin/improve-material/${fileId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ customPrompt }),
});

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      
      const parsed = JSON.parse(data);
      
      if (parsed.type === 'progress') {
        toast({ title: parsed.message });
      } else if (parsed.type === 'complete') {
        improvedFile = parsed.improvedFile;
      } else if (parsed.type === 'error') {
        throw new Error(parsed.message);
      }
    }
  }
}
```

## AI Prompt Rendszer

### System Prompt (`tananyag-okosito`)

A system prompt az adatbázisban tárolódik (`system_prompts` tábla), és tartalmazza:

1. **Kritikus instrukciók:**
   - HTML-only output (nincs markdown, nincs magyarázat)
   - CSS szabályok (-- prefix változók, edu- prefix osztályok)
   - Font szabályok (csak system fontok, SOHA @font-face vagy Google Fonts)

2. **Struktúra követelmények:**
   - 3+ lap (tananyag, folytatás, feladatok, kvíz)
   - Kognitív komponensek (min. 8-10 db)
   - Szöveges feladatok (45 generált, 15 megjelenítve)
   - Kvíz (75 generált, 25 megjelenítve)

3. **Reszponzív design:**
   - 280px mobiltól 1920px+ monitorig
   - CSS változók használata
   - Modern CSS (Flexbox, Grid)

### User Prompt

A user prompt tartalmazza:
- Eredeti HTML kód
- Cím, osztály, leírás
- Egyedi instrukciók (ha vannak)

## CSS Auto-Fix Logika

A backend automatikusan javítja a gyakori CSS hibákat:

1. **CSS változók:**
   - `primary:` → `--primary:`
   - `var(primary)` → `var(--primary)`

2. **CSS osztályok:**
   - `.header` → `.edu-header` (ha nincs prefix)

3. **Reset szabályok:**
   - `{ margin: 0; }` → `* { margin: 0; }`

4. **Font deklarációk:**
   - `@font-face` blokkok eltávolítása
   - Google Fonts linkek eltávolítása

## Biztonsági Funkciók

### XSS Védelem
- `eval()` blokkolás
- `Function()` konstruktor blokkolás
- `setTimeout/setInterval` string kóddal blokkolás
- `javascript:` protokoll blokkolás

**Megjegyzés:** `onclick` és `onerror` attribútumok megengedettek, mert a HTML sandboxed iframe-ben fut.

### Content Security Policy (CSP)
- Sandboxed iframe használata előnézethez
- CSP headers a backend-en

## Használati Munkafolyamat

### 1. Javítás Indítása
1. Admin oldal → "Okosítás" tab
2. Fájl kiválasztás dropdown-ból
3. Opcionális egyedi prompt megadása
4. "Javítás indítása" gomb

### 2. Progress Követés
- Toast üzenetek minden lépésnél:
  - 📂 Fájl betöltése
  - 📝 System prompt betöltése
  - 🤖 Claude API hívása
  - 📝 HTML generálása
  - 🔧 HTML tisztítása és validálása
  - 💾 Javított fájl mentése

### 3. Előnézet és Ellenőrzés
- 4 tab: eredeti futó, eredeti kód, javított futó, javított kód
- Külső böngészőben megnyitás
- Státusz frissítés (approved/rejected)

### 4. Alkalmazás
- "Alkalmazás" gomb
- Automatikus backup készítés
- Eredeti fájl frissítése
- Státusz: `applied`

### 5. Backup Kezelés
- "Okosítás Backup" tab
- Backup listázás
- Backup visszaállítás
- Backup törlés

## Hibakezelés

### Timeout
- **90 másodperc** timeout
- SSE stream abortálás
- Felhasználó értesítése

### Validációs Hibák
- Fájl túl nagy (>5MB)
- HTML túl rövid (<100 karakter)
- Biztonsági problémák (XSS)
- CSS szintaxis hibák (auto-fix próbálkozik)

### API Hibák
- Network hibák
- Claude API hibák
- Adatbázis hibák

Minden hiba SSE formátumban küldve, a frontend megfelelően kezeli.

## Teljesítmény Optimalizálás

### Streaming
- SSE használata timeout problémák elkerülésére
- Progress feedback UX javításához
- Nagy fájlok kezelése

### Timeout Kezelés
- 90 másodperc timeout (streaming miatt hosszabb)
- AbortController használata
- Graceful shutdown

### Caching
- React Query cache használata
- Automatikus invalidálás alkalmazás után

## Következő Fejlesztések

1. **Batch Processing:** Több fájl egyszerre javítása
2. **Template Rendszer:** Előre definiált prompt template-ek
3. **Version Control:** Javított fájlok verziókezelése
4. **Diff Viewer:** Változások vizuális összehasonlítása
5. **Automated Testing:** Javított HTML automatikus tesztelése

## Kapcsolódó Fájlok

### Backend
- `source/server/routes.ts` - API endpoints (4102-5130 sorok)
- `source/server/storage.ts` - Adatbázis műveletek
- `source/shared/schema.ts` - Adatbázis séma

### Frontend
- `source/client/src/components/MaterialImprover.tsx` - Fő komponens
- `source/client/src/components/MaterialImprovementBackups.tsx` - Backup kezelés
- `source/client/src/pages/admin.tsx` - Admin oldal integráció

### Adatbázis
- `improved_html_files` tábla
- `material_improvement_backups` tábla
- `system_prompts` tábla (`tananyag-okosito` ID)

## Verzió Információ

- **Verzió:** 1.0.0
- **Utolsó frissítés:** 2025-01-15
- **Fejlesztő:** Zoltán
- **AI Modell:** Claude Sonnet 4.5
- **API:** Anthropic API (Replit AI Integrations)

---

**Megjegyzés:** Ez a funkció admin jogosultságot igényel. Csak bejelentkezett admin felhasználók használhatják.

