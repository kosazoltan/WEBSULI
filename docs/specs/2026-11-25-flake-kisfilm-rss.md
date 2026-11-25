# Terv: FLAKE-KISFILM-RSS — a kisfilmworker leállítási tesztjének determinizmusa (2026-11-25)

**Cél:** a `tests/lesson-clip-shutdown.test.ts` ne függjön a tesztfolyamat valódi memóriájától; élesben a memóriaőr viselkedése változatlan.

**Ok (mérve):** a `server/lesson-clips.ts` memóriaőre (`CLIP_RSS_LIMIT_BYTES`, 320 MB) a `process.memoryUsage().rss` értéket olvassa; a
helyi tesztfolyamat 320–327 MB-ot használt, így az első kör kimaradt (main ágon 3 futásból 2 bukott; a CI-ben ritkábban).

**Megoldás:** a worker gyártója opcionális `rss` mérőt adhat (alapérték: a valódi RSS); a teszt 0 bájtot mér, és egy 400 MB-os ballaszt a
régi viselkedést determinisztikusan bukóvá teszi. Végrehajtás: `docs/specs/2026-11-25-flake-kisfilm-rss-vegrehajtas.md`.
