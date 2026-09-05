# Régi Tananyagok Okosabbá Tétele - Részletes Terv

## 1. Áttekintés

Ez a funkció lehetővé teszi, hogy régebbi, kevésbé fejlett HTML tananyagokat Claude API segítségével javítsunk, majd biztonságosan cseréljük az eredeti fájlokat.

## 2. Biztonsági Elvek

### 2.1. Kritikus Szabályok
- ✅ **Nincs adatbázis törés/vesztés** - Minden művelet transaction-ben történik
- ✅ **Nincs program törés** - Validáció minden lépésnél
- ✅ **Backup automatikus** - Cseré előtt automatikus backup készül
- ✅ **Rollback lehetőség** - Visszavonható műveletek
- ✅ **Előzetes ellenőrzés** - Javított fájl először preview táblába kerül

### 2.2. Műveleti Folyamat
```
1. Fájl kiválasztása
   ↓
2. Claude API hívás (javítás)
   ↓
3. Javított fájl mentése → improved_html_files tábla
   ↓
4. Előnézet és ellenőrzés (admin oldalon)
   ↓
5. [OPTIONÁLIS] Automatikus backup készítése
   ↓
6. [MEGERŐSÍTÉS] Csere az eredeti fájllal (TRANSACTION)
   ↓
7. Javított fájl törlése az improved táblából
```

## 3. Adatbázis Struktúra

### 3.1. Új Tábla: `improved_html_files`

```sql
CREATE TABLE "improved_html_files" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "original_file_id" varchar NOT NULL REFERENCES html_files(id) ON DELETE CASCADE,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "description" text,
  "classroom" integer DEFAULT 1 NOT NULL,
  "content_type" varchar DEFAULT 'html' NOT NULL,
  "improvement_prompt" text, -- Milyen prompttal készült
  "improvement_notes" text, -- Admin jegyzetek
  "status" varchar DEFAULT 'pending' NOT NULL, -- pending, approved, rejected, applied
  "created_by" varchar REFERENCES users(id),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "applied_at" timestamp, -- Mikor cserélték le
  "applied_by" varchar REFERENCES users(id) -- Ki cserélte le
);

CREATE INDEX "improved_html_files_original_file_idx" ON "improved_html_files"("original_file_id");
CREATE INDEX "improved_html_files_status_idx" ON "improved_html_files"("status");
CREATE INDEX "improved_html_files_created_at_idx" ON "improved_html_files"("created_at");
```

### 3.3. Kapcsolatok
- `original_file_id` → `html_files.id` (CASCADE DELETE - ha az eredeti törlődik, a javított is)
- `created_by` → `users.id` (ki hozta létre)
- `applied_by` → `users.id` (ki alkalmazta)

## 4. Backend Implementáció

### 4.1. Schema Hozzáadása (`source/shared/schema.ts`)

```typescript
// Improved HTML Files table
export const improvedHtmlFiles = pgTable("improved_html_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalFileId: varchar("original_file_id").notNull().references(() => htmlFiles.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  description: text("description"),
  classroom: integer("classroom").notNull().default(1),
  contentType: varchar("content_type").notNull().default('html'),
  improvementPrompt: text("improvement_prompt"),
  improvementNotes: text("improvement_notes"),
  status: varchar("status").notNull().default('pending'), // pending, approved, rejected, applied
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  appliedAt: timestamp("applied_at"),
  appliedBy: varchar("applied_by").references(() => users.id),
}, (table) => ({
  originalFileIdx: index("improved_html_files_original_file_idx").on(table.originalFileId),
  statusIdx: index("improved_html_files_status_idx").on(table.status),
  createdAtIdx: index("improved_html_files_created_at_idx").on(table.createdAt),
}));

export type ImprovedHtmlFile = typeof improvedHtmlFiles.$inferSelect;
export type InsertImprovedHtmlFile = typeof improvedHtmlFiles.$inferInsert;
```

### 4.2. Storage Metódusok (`source/server/storage.ts`)

```typescript
// IStorage interface bővítése
interface IStorage {
  // ... existing methods ...
  
  // Improved files operations
  createImprovedHtmlFile(file: InsertImprovedHtmlFile): Promise<ImprovedHtmlFile>;
  getImprovedHtmlFile(id: string): Promise<ImprovedHtmlFile | undefined>;
  getAllImprovedHtmlFiles(): Promise<ImprovedHtmlFile[]>;
  getImprovedFilesByOriginalId(originalFileId: string): Promise<ImprovedHtmlFile[]>;
  updateImprovedHtmlFileStatus(id: string, status: string, appliedBy?: string): Promise<ImprovedHtmlFile | null>;
  deleteImprovedHtmlFile(id: string): Promise<boolean>;
  
  // Apply improved file to original (TRANSACTION)
  applyImprovedFileToOriginal(improvedFileId: string, userId: string): Promise<{ success: boolean; originalFile: HtmlFile; backupId?: string }>;
}
```

### 4.3. API Endpoints (`source/server/routes.ts`)

#### 4.3.1. POST `/api/admin/improve-material/:id`
- **Cél**: Claude API hívás és javított fájl létrehozása
- **Auth**: Admin only
- **Request Body**:
  ```json
  {
    "customPrompt": "string (optional)" // Egyedi prompt, ha nincs, alapértelmezett
  }
  ```
- **Response**: `ImprovedHtmlFile`
- **Hibakezelés**: 
  - Claude API hiba → 500, error message
  - Fájl nem található → 404
  - Validáció hiba → 400

#### 4.3.2. GET `/api/admin/improved-files`
- **Cél**: Összes javított fájl listázása
- **Auth**: Admin only
- **Query params**: `?status=pending&originalFileId=xxx`
- **Response**: `ImprovedHtmlFile[]`

#### 4.3.3. GET `/api/admin/improved-files/:id`
- **Cél**: Egy javított fájl lekérése
- **Auth**: Admin only
- **Response**: `ImprovedHtmlFile & { originalFile: HtmlFile }`

#### 4.3.4. POST `/api/admin/improved-files/:id/apply`
- **Cél**: Javított fájl alkalmazása az eredeti fájlra
- **Auth**: Admin only
- **Request Body**:
  ```json
  {
    "createBackup": true, // Automatikus backup készítése (kötelező)
    "notes": "string (optional)" // Admin jegyzetek
  }
  ```
- **Response**: 
  ```json
  {
    "success": true,
    "originalFile": HtmlFile,
    "backupId": "string" // Mindig létrejön backup
  }
  ```
- **Biztonsági mechanizmus**:
  1. Validáció: improved fájl státusz ellenőrzése (csak 'approved')
  2. Validáció: eredeti fájl létezésének ellenőrzése
  3. Transaction kezdése
  4. **MINDIG** Backup készítése → `material_improvement_backups` tábla
  5. Eredeti fájl content frissítése (SQL UPDATE)
  6. Improved fájl status frissítése → 'applied', applied_at, applied_by
  7. Transaction commit
  8. Ha hiba → rollback

#### 4.3.5. DELETE `/api/admin/improved-files/:id`
- **Cél**: Javított fájl törlése (még nem alkalmazott)
- **Auth**: Admin only
- **Validáció**: Csak 'pending' vagy 'rejected' státuszú fájlok törölhetők
- **Response**: `{ success: true }`

#### 4.3.6. PATCH `/api/admin/improved-files/:id`
- **Cél**: Javított fájl státusz/jegyzetek frissítése
- **Auth**: Admin only
- **Request Body**:
  ```json
  {
    "status": "approved" | "rejected",
    "improvementNotes": "string (optional)"
  }
  ```

### 4.4. Claude API Integráció

#### 4.4.1. System Prompt
```
Te egy HTML tananyag javító szakértő vagy. A feladatod, hogy régebbi, kevésbé fejlett HTML tananyagokat modern, responsive, interaktív tananyaggá alakíts.

FONTOS SZABÁLYOK:
1. Tartsd meg az eredeti tartalmat és struktúrát
2. Modernizáld a HTML/CSS-t (responsive design, modern CSS)
3. Javítsd a kódminőséget (semantic HTML, accessibility)
4. Ne változtass a tananyag tartalmán, csak a megjelenésen és technikai minőségen
5. Biztosítsd a mobil kompatibilitást
6. Használj modern CSS-t (Flexbox, Grid, CSS Variables)
7. Optimalizáld a teljesítményt
8. Tartsd meg az eredeti funkcionalitást (quiz, interaktív elemek)
9. Ne használj külső CDN-eket vagy külső scripteket (mindent inline)
10. Biztosítsd a biztonságot (XSS védelem, sanitizáció)

VÁLASZ FORMATUM:
Csak a javított HTML kódot add vissza, magyarázat nélkül. A kód azonnal használható legyen.
```

#### 4.4.2. Model Konfiguráció
- **Model**: `claude-sonnet-4-5` (már elérhető és használatban)
- **Timeout**: 60s
- **Max Tokens**: 4096

#### 4.4.2. User Prompt Template
```
Javítsd az alábbi HTML tananyagot modern, responsive, interaktív tananyaggá:

CÍM: {title}
OSZTÁLY: {classroom}
LEÍRÁS: {description}

HTML KÓD:
{content}

{customPrompt}
```

## 5. Frontend Implementáció

### 5.1. Új Komponens: `MaterialImprover.tsx`

**Funkciók**:
1. **Fájl kiválasztás**: Dropdown/lista az összes HTML fájlból
2. **Javítás indítása**: Gomb → Claude API hívás → Loading state
3. **Javított fájlok listája**: Táblázat az improved fájlokkal
4. **Előnézet**: Side-by-side összehasonlítás (eredeti vs javított)
5. **Alkalmazás**: Gomb → Megerősítés → Apply endpoint hívás

**UI Komponensek**:
- File selector (dropdown)
- Improvement prompt input (optional)
- Improved files table
- Preview modal/dialog (split view)
- Apply confirmation dialog
- Status badges (pending, approved, rejected, applied)

### 5.2. Admin Oldal Integráció

**Új Tab hozzáadása** (`source/client/src/pages/admin.tsx`):
```typescript
<TabsTrigger value="improve-materials" className="flex items-center gap-2 text-red-600 border-red-300 data-[state=active]:bg-red-50 data-[state=active]:text-red-700">
  <Sparkles className="h-4 w-4" />
  <span className="hidden sm:inline">Okosítás</span>
  <span className="sm:hidden">Okosítás</span>
</TabsTrigger>

<TabsContent value="improve-materials" className="space-y-4">
  {activeTab === "improve-materials" && (
    <Suspense fallback={<Skeleton />}>
      <MaterialImprover />
    </Suspense>
  )}
</TabsContent>
```

**Piros színű kártyák és gombok**:
- Kártyák: `border-red-500`, `border-2`
- Gombok: `bg-red-600`, `hover:bg-red-700`
- Badge-ek: `bg-red-100`, `text-red-800`

### 5.3. Backup Admin Oldal

**Új Komponens**: `MaterialImprovementBackups.tsx`
- **Elérés**: Csak admin oldalról, külön tab
- **Szín**: Piros kártyák és gombok (mint a MaterialImprover)
- **Funkciók**:
  - Backup lista megjelenítése
  - Backup részletek megtekintése
  - Restore funkció (visszaállítás)
  - Backup törlés

**Új Tab hozzáadása** (`source/client/src/pages/admin.tsx`):
```typescript
<TabsTrigger value="improvement-backups" className="flex items-center gap-2 text-red-600 border-red-300 data-[state=active]:bg-red-50 data-[state=active]:text-red-700">
  <Database className="h-4 w-4" />
  <span className="hidden sm:inline">Okosítás Backup</span>
  <span className="sm:hidden">Backup</span>
</TabsTrigger>

<TabsContent value="improvement-backups" className="space-y-4">
  {activeTab === "improvement-backups" && (
    <Suspense fallback={<Skeleton />}>
      <MaterialImprovementBackups />
    </Suspense>
  )}
</TabsContent>
```

## 6. Migráció

### 6.1. Migration File (`source/migrations/XXXX_add_improved_html_files.sql`)

```sql
-- Create improved_html_files table
CREATE TABLE IF NOT EXISTS "improved_html_files" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "original_file_id" varchar NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "description" text,
  "classroom" integer DEFAULT 1 NOT NULL,
  "content_type" varchar DEFAULT 'html' NOT NULL,
  "improvement_prompt" text,
  "improvement_notes" text,
  "status" varchar DEFAULT 'pending' NOT NULL,
  "created_by" varchar,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "applied_at" timestamp,
  "applied_by" varchar
);

-- Foreign keys
ALTER TABLE "improved_html_files" ADD CONSTRAINT "improved_html_files_original_file_id_html_files_id_fk" 
  FOREIGN KEY ("original_file_id") REFERENCES "html_files"("id") ON DELETE CASCADE;

ALTER TABLE "improved_html_files" ADD CONSTRAINT "improved_html_files_created_by_users_id_fk" 
  FOREIGN KEY ("created_by") REFERENCES "users"("id");

ALTER TABLE "improved_html_files" ADD CONSTRAINT "improved_html_files_applied_by_users_id_fk" 
  FOREIGN KEY ("applied_by") REFERENCES "users"("id");

-- Indexes
CREATE INDEX "improved_html_files_original_file_idx" ON "improved_html_files"("original_file_id");
CREATE INDEX "improved_html_files_status_idx" ON "improved_html_files"("status");
CREATE INDEX "improved_html_files_created_at_idx" ON "improved_html_files"("created_at");
```

### 6.2. Scheduled Job: Automatikus Törlés (1 hét után)

**Új Scheduled Job**: `cleanup-old-improved-files`
- **Cél**: Applied státuszú improved fájlok törlése 1 hét után
- **Frekvencia**: Napi 1x (éjfélkor)
- **Logika**: 
  ```sql
  DELETE FROM improved_html_files 
  WHERE status = 'applied' 
  AND applied_at < NOW() - INTERVAL '7 days'
  ```

### 6.3. Rollback Script

```sql
-- Rollback: Drop tables and indexes
DROP TABLE IF EXISTS "material_improvement_backups";
DROP INDEX IF EXISTS "improved_html_files_applied_at_idx";
DROP INDEX IF EXISTS "improved_html_files_created_at_idx";
DROP INDEX IF EXISTS "improved_html_files_status_idx";
DROP INDEX IF EXISTS "improved_html_files_original_file_idx";
DROP TABLE IF EXISTS "improved_html_files";
```

## 7. Tesztelési Terv

### 7.1. Unit Tesztek
- Storage metódusok tesztelése
- Validáció tesztelése
- Transaction tesztelése

### 7.2. Integration Tesztek
- API endpointok tesztelése
- Claude API integráció tesztelése
- Backup készítés tesztelése

### 7.3. E2E Tesztek
- Teljes workflow tesztelése (javítás → előnézet → alkalmazás)
- Rollback tesztelése
- Hibahelyzetek tesztelése

## 8. Kritikus Pontok - Visszajelzés Szükséges

### 8.1. Adatbázis Műveletek
- ✅ Transaction használata az apply műveletnél
- ✅ CASCADE DELETE az improved_files táblán (ha az eredeti törlődik)
- ✅ **MEGOLDÁS**: Applied fájlok 1 hétig megmaradnak, majd automatikus törlés (scheduled job)

### 8.2. Backup Mechanizmus
- ✅ Automatikus backup készítése apply előtt (opcionális)
- ✅ **MEGOLDÁS**: Külön táblába (`material_improvement_backups`) külön admin oldalon
- ✅ **UI**: Piros színű kártyák kerete és gombok, piros menüpont

### 8.3. Claude API
- ✅ Timeout kezelés (60s)
- ✅ Error handling
- ✅ Rate limiting
- ✅ **MEGOLDÁS**: `claude-sonnet-4-5` modell (már elérhető és használatban)

### 8.4. Validáció

#### 8.4.1. Javított Fájl Validációk
- ✅ HTML struktúra validáció (DOCTYPE, html, head, body tag-ek)
- ✅ Script injection ellenőrzés (dangerous patterns: `eval(`, `Function(`, `setTimeout(string)`, `setInterval(string)`)
- ✅ Content size limit (max 5MB)
- ✅ XSS ellenőrzés alapvető pattern-ekre (`<script`, `javascript:`, `onerror=`, `onclick=`)
- ✅ HTML validitás ellenőrzés (zárt tag-ek, megfelelő nesting)
- ✅ Külső erőforrások ellenőrzése (CDN, external scripts) - nem engedélyezett

#### 8.4.2. Apply Művelet Validációk
- ✅ Eredeti fájl létezésének ellenőrzése apply előtt
- ✅ Improved fájl státusz ellenőrzése (csak 'approved' alkalmazható)
- ✅ Improved fájl nem lehet régebbi mint 30 nap (biztonsági okokból)
- ✅ User jogosultság ellenőrzése (admin only)
- ✅ Content length ellenőrzés (nem lehet üres)

#### 8.4.3. Backup Validációk
- ✅ Backup data struktúra ellenőrzése
- ✅ Original file ID validitás ellenőrzése

## 9. Implementációs Lépések

1. ✅ **FÁZIS 1**: Adatbázis migráció létrehozása és futtatása
2. ✅ **FÁZIS 2**: Schema és Storage metódusok implementálása
3. ✅ **FÁZIS 3**: API endpointok implementálása
4. ✅ **FÁZIS 4**: Frontend komponens implementálása
5. ✅ **FÁZIS 5**: Admin oldal integráció
6. ✅ **FÁZIS 6**: Tesztelés és finomhangolás

## 10. Kockázatok és Kezelésük

### 10.1. Kockázatok
1. **Claude API hiba** → Error handling, retry mechanism
2. **Adatbázis törés** → Transaction, rollback
3. **Rossz javítás** → Preview, manuális ellenőrzés, reject opció
4. **Teljesítmény** → Rate limiting, async processing (jövőbeli fejlesztés)

### 10.2. Mitigáció
- Minden kritikus művelet transaction-ben
- Automatikus backup opció
- Preview és manuális jóváhagyás kötelező
- Error logging és monitoring

