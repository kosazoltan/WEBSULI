# Közvetlen fejlesztői leckeoldal CSP-javítása

## Cél és bizonyított gyökérok
A `/lesson/:id` közvetlen fejlesztői megnyitás működjön a szigorú CSP megtartásával. A server/index.ts előbb `script-src 'self'` fejlécet állít; a server/vite.ts ezután transformIndexHtml segítségével inline React refresh preamble-t ad a HTML-hez. A Chrome blokkolja, majd a modul preamble-hiány miatt nem indul. Telepített Vite 5.4.21, plugin-react 4.7.0, Helmet 8.1.0.

## Nem-cél
Nem módosul lecke-JSON, adatbázis, gyártási körlimit, production/Vercel CSP, legacy HTML vagy általános scriptengedély. Nincs unsafe-inline/unsafe-eval hozzáadás; nincs deploy. A korábbi mobil screenshot hibája nem reprodukálható: a mért 320 px ablakban a root scrollWidth=clientWidth=305 és mind a négy tab határa a látható területen belül van; a tiszta Chrome 12/12 tabpróbája is sikeres. Nem állítunk igazolatlan screenshot-gyökérokot, nem változtatunk CSS-t.

## Döntés, érintett fájlok
- server/index.ts: kizárólag fejlesztői szigorú lecke-kérésnél kriptográfiai, 24 byte-os véletlen nonce a res.locals-ban, ugyanaz kerül a CSP-be.
- server/lib/csp-profiles.ts: opcionális fejlesztői nonce, base64 formaellenőrzés; production és nonce nélküli profil továbbra is pontosan self. Inline eseménykezelő továbbra is none.
- server/vite.ts: csak a middleware Vite-konfigurációjában html.cspNonce placeholder. Vite transform után kérésenkénti helyettesítés a fejléc nonce-ával; más fejlesztői SPA-kérés saját nonce-t kap, a globális CSP változtatása nélkül. Nonce-os HTML no-store; placeholder nem hagyhatja el a szervert.
- tests/lesson-dev-csp.test.ts: új tesztek, meglévő CSP-tesztek változatlanok.

## Edge case-ek és elfogadás
1. HA development + érvényes nonce, AKKOR csak self és pontos nonce van script-src-ben; handler none, nincs eval.
2. HA production, AKKOR a megadott nonce-t is figyelmen kívül hagyja; CSP pontos self.
3. HA fejlesztői nonce hibás, AKKOR fail-closed kivétel, sosem kerül fejlécbe vagy HTML-be.
4. HA két közvetlen lecke-kérést indítunk, AKKOR eltérő nonce, minden inline bootstrap egyező nonce, nincs placeholder, nincs tárolható nonce-os HTML.
5. HA Chrome-ban a valódi leckét közvetlenül nyitjuk, AKKOR React betölt, négy lap működik 320 és 1440 px-en, nincs pageerror/overflow. Nonce nélküli próbascriptet a böngésző továbbra is blokkolja.
6. Változatlan csp-lesson-route és vercel-lesson-csp tesztek, teljes verify PASS.

## Biztonság és visszaállítás
A nonce csak a helyi, megbízható alkalmazás-HTML transzformációját engedélyezi, nem tananyagból érkező HTML-t. Nincs közös szerverélettartamú nonce. A diff elkülönül a dirty worktree korábbi munkájától. Visszaállítás a három forrásfájl ezen szeletének visszavonása; tárolt adatot nem érint. Helyi restart előtt aktív lease/job ellenőrzés és utóállapotmentés.

## Hivatalos források
- https://v5.vite.dev/config/shared-options.html#html-cspnonce
- https://v5.vite.dev/guide/features.html#content-security-policy-csp
- https://github.com/vitejs/vite/blob/v5.4.21/packages/vite/src/node/plugins/html.ts (injectCspNonceMetaTagHook, injectNonceAttributeTagHook)
- Context7 könyvtárfeloldás sikeres; verziózott doksilekérés Unauthorized, ezért közvetlen hivatalos doksi és forrás használva.

## Végső bizonyíték
- Célzott CSP regresszió: 9/9 PASS, meglévő ratchet tesztek változatlanok. Az új teszt első konfigurációja hmr:false miatt önmaga tiltotta a preamble-t; javítva valódi, portot nem foglaló HTTP szerverre kötött HMR-re és a telepített plugin 4.7.0 injectIntoGlobalHook bootstrapjának ellenőrzésére. Nem gyengült régi teszt.
- Végső `npm.cmd run verify`: 1257 PASS, 0 FAIL, 0 skipped; típusellenőrzés, lint (0 warning), teszttípusok és build PASS. Studio-flow Chrome 5/5 PASS. Diff whitespace-ellenőrzés PASS. Külön végső review nem talált fennmaradó érdemi hibát.
- Helyi szerver újraindult a javítással, előtte 0 aktív lease, terminális jobok és új utóállapotmentés igazolva. További fizetős generálás nem indult.
- Valódi lecke: közvetlen /lesson belépés és /preview, 320/390/1440 px, mind a négy lap: 24/24 PASS, nincs pageerror vagy horizontális overflow. Mobil tanítás és asztali kvíz képe külön megtekintve; a levágott nagyított előző screenshot nem reprodukálható.
- Két tényleges HTTP HTML válasz: külön nonce, script tagek/fejléc egyeznek, no-store, nincs placeholder. Mindhárom szélességen a nonce nélküli ártalmatlan próbascript blokkolva, DOM-jelzője nem állt be.
- Visszaolvasott lecke séma és 45 mintaválasz/üres válasz ellenőrzése PASS; bank 11 módszer / 45 feladat / 75 kvíz. Ezek technikai bizonyítékok, nem pedagógiai hatásvizsgálat vagy szerveres tanulói próbálkozás-teszt.
- Képek és gépi eredmény: `tmp/bank-published-browser/`, helyi nem commitolt bizonyíték. A másik tananyag körlimit-blokkolója változatlan; nincs éles kiadás.
- Fennmaradó környezeti figyelmeztetések: elavult Browserslist-adat, hiányzó VAPID (push off), tesztimport konfigurálatlan helyi Postgres-kapcsolódási mellékhatása. Nem lettek elrejtve. Éles CI/deploy és szerveres tanulói kupon/próbálkozás ellenőrzés ezen szeletben NOT RUN (nem volt kiadási vagy tanulói adatírási feladat).