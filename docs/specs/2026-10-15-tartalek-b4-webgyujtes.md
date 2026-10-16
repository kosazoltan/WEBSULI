# Ellentétes családú tartalék — B4: webes forrásgyűjtés (2026-10-15)

Szülő spec: `docs/specs/2026-10-14-tartalek-b-szelet.md`. Végrehajtás: `docs/specs/2026-10-15-tartalek-b4-webgyujtes-vegrehajtas.md`.

## Tulajdonosi döntés (2026-10-14/15)
- A webes forrásgyűjtés (Claude Opus 5, `web_search` + `web_fetch` szerveroldali eszközök) ellentétes családú tartaléka
  GPT-6.1 Sol, külön PR-ban, élő méréssel.
- Az OpenAI webes keresője NEM ad teljes oldalszöveget (hivatalos doksi, developers.openai.com tools-web-search, 2026-10-15:
  „citations, actions, and a URL list, not full page text”; nincs külön fetch-eszköz). Tulajdonosi választás: **védett
  szerveroldali letöltés** — a GPT keres, a WEBSULI szerver tölti le az oldalakat SSRF-védelemmel.

## Tények
- Élő próba (2026-10-15): `gpt-6.1-sol`, Responses API, `web_search` (`search_context_size: high`, HU), `include:
  web_search_call.action.sources` → 200, 16,5 s, 38 URL (pl. nkp.hu, nat2012.nkp.hu), 21 497 be / 552 ki token.
- A gyártás a letöltött TELJES szövegből dolgozik (`FetchedTeachingSource = { url, title, text }`, a Claude-úton min. 80
  karakter, hibaoldal kiszűrve — `fetchedTeachingSources`, `sourceIsErrorPage`).

## Cél
- **C1** `gatherWebSources`: a Claude-gyűjtés bármely hibájánál (szolgáltatói, kimeneti, nincs letöltött forrás), külső
  megszakítás kivételével, egyszer a GPT-6.1 Sol tartalék (medium effort).
- **C2** GPT-gyűjtés: Responses `web_search` → URL-jelöltek (előbb a válasz `url_citation` hivatkozásai, utána a `sources`
  lista), legfeljebb 12 jelölt, párhuzamos (4) védett letöltés, legfeljebb 8 forrás; a forrás a Claude-úttal azonos szabályú
  (min. 80 karakter szöveg, hibaoldal kiszűrve). 0 forrás → érthető hiba. Az eredmény workflow-checkpointba kerül.
- **C3** Védett letöltő (`safe-fetch.ts`): csak `https:`, alapértelmezett port, felhasználónév/jelszó nélkül; a DNS-feloldás
  MINDEN címe nyilvános (privát, loopback, link-local, CGNAT, multicast, dokumentációs, IPv4-leképezett IPv6 kizárva) — a
  kapcsolat a már ellenőrzött címre megy (`lookup` a kérésben, nincs DNS-rebinding rés); átirányítás kézzel, legfeljebb 3,
  mindegyik újraellenőrizve; csak `text/html` / `text/plain`; legfeljebb 2 MB és 10 s; karakterkódolás a fejlécből.
- **C4** Élő mérés 3 témán (matematika 5., történelem 6., biológia 7.): forrásszám, szövegméret, domének, idő, token —
  `docs/measurements/2026-10-15-b4-web-gpt-gather.json` (oldalszöveg nélkül).

## Nem cél
- A Claude-gyűjtés viselkedésének változása; a GPT-gyűjtés elsődlegessé tétele; JavaScriptet igénylő oldalak megjelenítése.

## Edge case-ek
- Külső megszakítás → nincs tartalék. Hiányzó OpenAI-kulcs → az eredeti hiba.
- Privát címre mutató URL vagy átirányítás → kihagyva (nem hiba, a többi jelölt fut).
- Bináris / túl nagy / lassú oldal → kihagyva.

## Elfogadás (EARS)
- **E1** WHEN a Claude-gyűjtés hibával áll le (nem külső megszakítás), THE rendszer SHALL egyszer a GPT-6.1 Sol tartalékkal
  gyűjteni, medium efforttal.
- **E2** THE letöltő SHALL NOT nem nyilvános címre csatlakozni (közvetlen URL, DNS-feloldás vagy átirányítás útján sem).
- **E3** A GPT-gyűjtés forrásai SHALL ugyanazt a minimumot teljesíteni, mint a Claude-útéi.
- **E4** `check`, `check:test`, `lint`, `test`, `build` zöld; élő mérés rögzítve.

## Mérés (C4, 2026-10-15) — `docs/measurements/2026-10-15-b4-web-gpt-gather.json`
| téma | évf. | idő | jelölt | forrás | medián szöveg | letöltési hiba |
| --- | --- | --- | --- | --- | --- | --- |
| Törtek összeadása és kivonása | 5 | 88,9 s | 12 | 4 | 10 564 kar. | 7 (5 ECONNRESET, 2 DNS) |
| A honfoglalás és a kalandozások kora | 6 | 63,6 s | 12 | 8 | 6 329 kar. | 3 (2 ECONNRESET, 1 önaláírt tanúsítvány) |
| A növények fotoszintézise | 7 | 48,5 s | 12 | 4 | 8 034 kar. | 4 (PDF, HTTP 406, 2 ECONNRESET) |
- Mindhárom téma eléri a gyártás minimumát (≥ 3 letöltött forrás). Token: 28–47 ezer be, 0,9–1,4 ezer ki hívásonként.
- Az ECONNRESET NEM a rögzített DNS-feloldás hibája: diagnózis (2026-10-15) — a `www.nkp.hu` erről a gépről a sima Node
  `fetch`-csel is kapcsolódási időtúllépés; más oldalak a védett letöltővel és a `fetch`-csel is 200.
- A PDF (nem szöveges) és az önaláírt tanúsítvány elutasítása szándékos (C3).
