# Átfogó review: a PR és a program egésze, nem csak a szelet — terv

**Tulajdonosi kérés (2026-10-18):** „Nézd át, hogy a PR-ok ne csak szeletenként, hanem teljes egészében is át legyenek nézve a
Vercel által deploykor, PR-kor és pushkor, vagy amikor szükség van rá. Tehát átfogóan is vizsgálja a programot és a PR-t, ne csak
a szeleteket.”

## Kiinduló helyzet (mérve)
- **Review-indítás:** a `.github/workflows/auto-review.yml` minden PR-nyitáskor és push-kor a Sourcery-t és a Codexet kéri. Mindkettő
  az adott push diffjét nézi.
- **Copilot:** a Copilot-reviewer is fut, a repóban nincs számára utasítás (`.github/copilot-instructions.md` hiányzik).
- **Vercel:** csak előnézeti kommentet ír; a saját AI-reviewja (Vercel Agent) kérésre fut.
- **Az `AGENTS.md`:** nincs benne „Review guidelines” szakasz. A Codex review a repó `AGENTS.md`-jének ilyen szakaszát követi
  (UNVERIFIED a Vercel Agentre).
- **Tapasztalat (#301–#305):** a szeletes PR-ek reviewja szeletenként jó volt, de a szeletek közti összefüggések (adatszerződés,
  közös ismétlésvédelem, időzóna, token-életút) csak külön, kézi átfogó vizsgálattal kerültek elő.

## Döntés
1. **Az `AGENTS.md` „Review guidelines” szakasza** minden AI-reviewernek:
   - **A vizsgálat köre:** a teljes PR, és a diff által érintett programrészek, nem csak a legutóbbi push.
   - **Szeletes munka:** a teljes funkció-terv (`docs/specs/…`), és a már összevont szeletekkel együtt, végponttól végpontig.
   - **Kötelező szempontok:** adatszerződés a lépések között, biztonság / adatvédelem, regresszió a meglévő folyamatokban, időzóna,
     migráció és séma, indítás / cron / leállítás.
   - **Evidencia:** fájl:sor és konkrét hibaforgatókönyv.
2. **`.github/copilot-instructions.md`:** ugyanez a Copilot-reviewernek (rövid, a szakaszra hivatkozik).
3. **Az `auto-review.yml` trigger-kommentje** kimondja, hogy a review a teljes PR-re és a funkció egészére szól.
4. **Szeletes funkciónál** (a PR leírásában „S1–Sn”) az utolsó szelet előtt kötelező az egész funkció átfogó reviewja (kézi vagy
   ügynöki), és az eredménye a PR-be kerül.
5. **Vercel Agent automatikus reviewja:** projektszintű Vercel-beállítás, a repóból nem kapcsolható be. Ez tulajdonosi teendő, a
   repó szabályai ehhez is igazodnak.

## Nem-cél
A CI-ellenőrzések vagy a reviewer-botok cseréje; Vercel-fiókbeállítás módosítása.

## Elfogadás (EARS)
- HA új PR nyílik vagy push érkezik, AKKOR a review-kérés a teljes PR-re és a funkció egészére szól.
- HA egy funkció több szeletből áll, AKKOR az utolsó szelet összevonása előtt átfogó review készül, és az eredménye a PR-ben
  szerepel.
