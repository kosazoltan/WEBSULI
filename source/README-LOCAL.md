# Helyi Telepítési Útmutató

Ez a dokumentum segít a projekt helyi környezetben (saját gépen) történő futtatásában, Replit nélkül.

## Előfeltételek

- Node.js (v20 vagy újabb ajánlott)
- PostgreSQL adatbázis (vagy Neon Tech fiók)

## Telepítés

1.  Csomagold ki a forráskódot (már megtörtént).
2.  Nyiss egy terminált a `source` mappában.
3.  Telepítsd a függőségeket:
    ```bash
    npm install
    ```

## Konfiguráció

Hozz létre egy `.env` fájlt a `source` mappában a következő tartalommal (példa):

```env
# Adatbázis elérés (PostgreSQL connection string)
# Példa: postgresql://user:password@localhost:5432/dbname
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/websuli

# Munkamenet titkos kulcs (bármilyen hosszú random string)
SESSION_SECRET=super_secret_local_dev_key_123

# Port (opcionális, alapértelmezett: 5000)
PORT=5000

# AI Integrációk (opcionális, ha használni szeretnéd az AI funkciókat)
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-...
```

**Fontos:** A `server/db.ts` alapértelmezetten a `@neondatabase/serverless`-t használja. Ha helyi PostgreSQL-t szeretnél használni, a `server/db.ts`-t módosítani kellhet a `pg` vagy `postgres` driver használatára, VAGY használj Neon adatbázist.

## Futtatás Fejlesztői Módban

```bash
npm run dev
```
Ez elindítja a szervert és a klienst is hot-reload funkcióval.
Elérhető: `http://localhost:5000`

## Bejelentkezés

A helyi verzió egy egyszerűsített bejelentkezést használ fejlesztéshez.
Nyisd meg a `http://localhost:5000/api/login` oldalt a böngészőben, amely automatikusan bejelentkeztet "Admin" felhasználóként (vagy kattints a "Bejelentkezés" gombra a felületen).

## Éles Futtatás (Build)

```bash
npm run build
npm start
```
