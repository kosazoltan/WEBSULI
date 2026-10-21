# Ciklus 5 — félbevágott emoji a mentésben + beragadt sorelem

**Mért hiba (2026-10-21, „Felszín és Térfogat”, 2. kísérlet):** a futás `author` mentése elbukott
(`Failed query: update "studio_jobs" set "step", "output"`): a katalógus-kivonat `clip` (`.slice(0, n)`) kettévágta a 📦 emojit, a
magányos fél-karaktert a PostgreSQL JSONB nem fogadja. A hibaállapot mentése ugyanígy elbukott → a job `running` maradt, a régi-anyag
sor `reconcileLegacy` `jobRunning` miatt örökre „fut” (100+ perc), a ciklus nem zárul.

## Cél
1. A Stúdió-job mentése (`saveStep`) minden szövegét érvényes UTF-16-ra hozza (magányos fél-karakter → U+FFFD) — a mentés nem bukhat el.
2. A katalógus `clip` kódpont-határon vág.
3. A régi-anyag sor: a hibás fázisú, nem élő bérletű futás akkor is leállt, ha a job (sikertelen hibamentés miatt) `running`.

## Nem-cél
A többi `.slice` hely egyenkénti átírása (a mentési határ mindet fedi).

## Edge case-ek
Ép emoji / szöveg változatlan; a mélyen beágyazott tömb / objektum is tisztul; nem szöveg (szám, null, Date) érintetlen.

## Elfogadás (EARS)
- HA a mentendő kimenet magányos fél-karaktert tartalmaz, AKKOR a mentés U+FFFD-vel megtörténik.
- HA `runPhase = error` ÉS a bérlet nem él, AKKOR a `jobRunning` nem tartja „fut” állapotban (újrapróba / hiba).
