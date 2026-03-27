-- Játéklista szövegek: tsunami hosszabb menet leírása, szólétra játszható + 3–5. osztály

UPDATE "games_catalog"
SET
  "description" = '3–5. osztályos angol: válassz nehézséget indulás előtt. Hosszabb menetek, a körön belül egyre nehezebb kérdések és gyorsuló hullám.'
WHERE "id" = 'tsunami-english';
--> statement-breakpoint

UPDATE "games_catalog"
SET
  "description" = '3–5. osztályos szókincs és párosítás (HU ↔ EN). Minden jó válasz egy léc — a menet végére nehezebb feladatok.'
WHERE "id" = 'word-ladder-hu-en';
