# Végrehajtási utasítás — YouTube-csatorna-ajánló a „Mai felfedezés” hírlevélben

Terv: `docs/specs/2026-10-31-hirlevel-youtube-ajanlo.md`. Ügynöknek szóló, lépésenkénti utasítás.

## 1. Új modul: `source/shared/youtube-channels.ts` (tiszta, függőség nélküli)
- `export type YoutubeChannel = { id: string; name: string; url: string; description: string; keywords: readonly string[]; grades: readonly [number, number] }`.
- `export const YOUTUBE_CHANNELS: readonly YoutubeChannel[]` — a terv táblázatának 6 csatornája. A `description`
  gyereknyelvű, 1 rövid mondat. A `keywords` ékezet-lehajtott tövek (pl. `tortenel`, `kiserlet`, `ur`, `mese`).
- Ékezet-lehajtás: helyi `fold` segéd (NFKD + kombináló jelek törlése + kisbetű) — ugyanaz a minta, mint a
  `server/curriculum/match.ts`-ben, de a modul NEM importál a serverből.
- Illesztés: az érdeklődési címkéket `fold` után szavakra bontjuk; egy szó illik egy kulcsszóra, ha bármelyik a másik
  prefixe (≥ 4 közös betű). Pontszám: az illő kulcsszavak száma.
- `export function pickYoutubeChannel(interests: readonly string[], grade: number, seed: string): YoutubeChannel | null`:
  1. `grade` az `[min,max]` sávon kívül minden csatornánál → `null`.
  2. Az évfolyamhoz illők közül a legmagasabb pozitív pontszámúak halmaza; ha minden pontszám 0, a teljes évfolyam-illő
     halmaz (általános ajánlás).
  3. A halmazból determinisztikus választás: egyszerű 32 bites FNV-1a hash a `seed`-ből, modulo a halmaz mérete.
- A seedet a hívó adja: `"{ISO-nap}|{learnerId}"`.

## 2. Sablon: `source/shared/newsletter.ts`
- `newsletterHtml` bemenete új, opcionális mezőt kap: `channel?: { name: string; url: string; description: string } | null`.
- A híd (`bridge`) blokk UTÁN új blokk, csak ha van `channel`: a meglévő kártyastílusban (sötét háttér, kerek sarok),
  felirata `VIDEÓ-AJÁNLÓ`, benne a csatornanév, a leírás és egy gomb: `Megnézem a csatornát`. Minden szöveg `esc(...)`-en át.
- Zöldes keret-/gombszín (pl. `#4ade80` keret, `#22c55e` gomb) — térjen el a cikk (narancs) és a híd (kék) blokktól.

## 3. Futás: `source/server/newsletter.ts`
- Import: `pickYoutubeChannel` a `../shared/youtube-channels`-ből.
- A `runNewsletters` tanuló-ciklusában, a `send` hívás előtt egyszer:
  `const channel = pickYoutubeChannel(learner.interests, learner.grade, `${iso}|${learner.id}`);`
- A `newsletterHtml({ ... })` hívás kap `channel`-t. Más nem változik (nincs DB-írás, nincs naplóváltozás).

## 4. Tesztek
- Új: `source/tests/youtube-channels.test.ts` — a terv EARS-pontjai:
  - minden bank-URL `https://www.youtube.com/`-mal kezdődik; az `id`-k egyediek;
  - történelem-érdeklődésű 6.-os → történelem-témájú csatorna (`tizes-lista` vagy `tortenelem-tananyagtar`);
  - üres/nem illő érdeklődésű 2.-os → `kerekmese`;
  - grade 0 → `null`;
  - azonos seed → azonos eredmény; eltérő seed több illő csatornánál → van legalább két különböző kimenet a
    seed-térben (rotáció);
  - `newsletterHtml` channel-lel: tartalmazza a nevet + URL-t; channel nélkül: nem tartalmaz `VIDEÓ-AJÁNLÓ`-t.
- A meglévő hírlevél-tesztek zöldek maradnak (a `channel` opcionális).

## 5. Ellenőrzés
- `npx.cmd vitest run tests/youtube-channels.test.ts` és a meglévő newsletter-tesztfájl(ok) a `source` mappából;
- `npm.cmd run lint` (max-warnings 0) és typecheck, a repo szokása szerint a `source` mappából;
- a záró jelentésben: módosított fájlok, PASS/FAIL, NOT RUN + ok.

## Tilos
- `NEWSLETTER_DOMAINS` bővítése youtube.com-mal;
- teszt gyengítése; DB-migráció; a reggeli emlékeztető módosítása.
