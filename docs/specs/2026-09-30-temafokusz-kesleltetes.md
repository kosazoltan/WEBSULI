# Témafókusz: késleltetés és félrevezető időtúllépés-napló (2026-09-30)

## Kiváltó ok (élő napló, 2026-09-29, három futás)
`Témafókusz: a(z) 1. modell hívása hibázott: A(z) "pedagogue" lépés modellhívása hibára futott: a szolgáltató hibát
jelzett (ok: [OpenRouter] Request timed out after 300000ms)`, a feladat indulása után ≈150–170 s-mal; utána a tartalék
modell döntött. A `topicFocus`-szabály 60 s-os (`server/ai/studio-provider.ts`), a napló mégis 300 s-ot írt.

## Mérés (valós hívások, éles konfiguráció, csak olvasó DB-lekérdezés)
Térkép `2823a211…` (Mezopotámia, 55 fogalom), a legutóbbi tanári kérés, prompt 11 151 karakter.
Provider-konfiguráció (a létrehozott kliensből kiolvasva): mindkét modell OpenRouter, `timeout=60000`, `maxRetries=0`.

| Út | Modell | 5 hívás ideje (s) | Siker | Megjegyzés |
|---|---|---|---|---|
| éles (`callStepModel`, 60 s) | deepseek/deepseek-v4-flash | 60,0 / 2,7 / 26,5 / 60,0 / 60,0 | 1/5 | 3× időtúllépés („300000ms” címkével), 1× üres válasz |
| éles (`callStepModel`, 60 s) | z-ai/glm-5.3-flash | 12,5 / 11,1 / 21,1 / 52,9 / 34,4 | 5/5 | fókusz 12–16 fogalom |
| nyers (külső határidő nélkül) | deepseek/deepseek-v4-flash | 44,9 / 34,2 / 67,2 / 63,7 / 59,8 | 2/5 | a sikeresek 4,2–5,5k kimeneti token (gondolkodás); a 3 bukott válasz tartalma nem értelmezhető JSON (üres/csonka) — a hosszabb várakozás sem segít |

## Gyökérok
1. **A napló félrevezető** — `server/studio/run-step.ts:155` (javítás előtt): a hiba címkéje `stepDeadlineMs(input.step)`,
   a témafókusz pedig `step: "pedagogue"` (300 s) néven, `policy: "topicFocus"` (60 s) szabállyal fut. A tényleges
   vágás a 135. sor `stepDeadlineMs(input.policy ?? input.step)` szerint 60 s-nál történik (mérve: 60,0 s). Nincs
   újrapróbálás (`maxRetries: 0`, `studio-provider.ts:134`), nincs 300 s-os kliensvárakozás.
2. **Az első modell mérten megbízhatatlan erre a feladatra** — a deepseek-v4-flash 55 fogalomnál 4–5k gondolkodási
   tokent termel, gyakran 60 s fölé nyúlik vagy üres választ ad (éles úton 1/5 siker). A ≈150–170 s-os élő késés
   = az előző fázisok + 60 s elvesztegetett első hívás + a tartalék ideje.

## Döntés
- A címke a ténylegesen lejárt határidőt nevezi meg: `stepDeadlineMs(input.policy ?? input.step)`.
- A témafókusz modellsorrendje megfordul: `topicFocusModels()` (`server/studio/topic-focus.ts`) =
  `[FALLBACK_MODELS.gateHelper (glm-5.3-flash), resolveStudioModel("gateHelper") (deepseek-v4-flash)]`, duplikáció nélkül.
  A `gateHelper` szerep többi felhasználása változatlan.
- A 60 s-os határidő és a `maxRetries: 0` marad (már helyes volt, most teszt védi).

## Nem-cél
- A `gateHelper` alapmodelljének cseréje más lépésekben; a fókusz-prompt módosítása; élő újragyártás.

## Edge case-ek
- `STUDIO_MODEL_GATE_HELPER` felülírás a glm-re → egyetlen hívó (nincs dupla hívás).
- A glm is elbukik → a deepseek dönt; mindkettő bukik → a teljes térkép marad (változatlan viselkedés).

## Elfogadás (EARS)
- **E1** WHEN a témafókusz-hívás határideje lejár, a hiba SHALL a 60000 ms-ot nevezni meg, egyetlen HTTP-kéréssel.
- **E2** A témafókusz SHALL először a glm-5.3-flash, utána a deepseek-v4-flash modellt hívni.
- **E3** A meglévő fókusz-tesztek zöldek; az új tesztek a régi kódon buknak.
- **E4** Utána-mérés az éles úton (5 döntés, új sorrend): mind létrejön, 60 s alatt.

## Utána-mérés
`decideTopicFocus` + `topicFocusModels()`, éles út: 9,4 / 35,8 / 19,7 / 6,1 / 26,9 s, 5/5 az első (glm) modellel,
fókusz 13 / 15 / 11 / 5 / 13 fogalom (a 4.-nél szűkebb, de érvényes).
