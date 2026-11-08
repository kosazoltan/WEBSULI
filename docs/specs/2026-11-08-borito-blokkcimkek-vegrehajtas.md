# Végrehajtás: tantárgyi nyitókép, borítóhiba-napló, tartalom szerinti blokkcímkék

> Spec: `docs/specs/2026-11-08-borito-blokkcimkek.md` · Ág: `fix/borito-blokkcimkek` · Kanban: #7
> Parancsok a `source/` mappából. Commit: `git -c user.name="Kz" -c user.email="236001384+kosazoltan@users.noreply.github.com" commit -F <fájl>`.
> Meglévő tesztet módosítani tilos.

## T1 — A sávhős tantárgyi köre: `source/shared/design-assets.ts`

> Módosítás a végrehajtás közben (2026-11-08): az eredeti „tantárgyi tartalék borító” két meglévő tesztet buktatott
> (`design-assets.test.ts`: „kulcsszó nélkül a sáv saját hős-képe”, „9. o. matek → híd”), mert idegen témájú borítót adott — ezért
> csak a hős tantárgyi szűrése maradt (lásd spec 4. pont).

1. A `pickLessonArt` elé:
   ```ts
   const HERO_SUBJECTS: Readonly<Record<string, readonly string[]>> = { "hero-laboratory": ["fizika", "matematika", "földrajz"] };

   export function heroFitsSubject(hero: DesignAsset, subject: string): boolean {
     const allowed = HERO_SUBJECTS[hero.id] ?? hero.subjects;
     const s = foldText(subject).trim();
     // Ismeretlen / üres tantárgynál a régi viselkedés (a sáv hőse).
     if (!allowed.length || s.length < 4) return true;
     return allowed.some(a => { const f = foldText(a); return s.includes(f) || f.includes(s.slice(0, Math.max(4, Math.min(s.length, 8)))); });
   }
   ```
2. `pickLessonArt` `else` ága:
   ```ts
   const heroes = catalog.filter(a => a.kind === "hero" && sameAge(a));
   const own = heroes.find(a => a.band === band);
   if (own && heroFitsSubject(own, lesson.subject)) hero = own;
   else {
     const fitting = heroes.filter(a => a !== own && heroFitsSubject(a, lesson.subject));
     hero = rotate(fitting.length ? fitting : heroes, seed, "art");
   }
   ```
3. `pictureFits` hős-ága:
   ```ts
   if (!heroFitsSubject(picture, lesson.subject)) return false;
   const own = catalog.find(a => a.kind === "hero" && a.band === band);
   return own && heroFitsSubject(own, lesson.subject) ? picture.band === band : YOUNG_BANDS.has(picture.band) === YOUNG_BANDS.has(band);
   ```
## T2 — Borítóhiba-napló: `source/server/lesson-covers.ts`

1. Exportált állandó a `COVER_TEXT_MODEL` mellé: `export const COVER_PLAN_MAX_TOKENS = 1200;` és az `openRouterDeps.chat` `max_tokens`
   értéke `COVER_PLAN_MAX_TOKENS` (a `400` helyett).
2. `openRouterDeps.chat`: a JSON-ból a `finish_reason` is kiolvasva; ha `"length"`, `logger.warn("[lesson-covers] a modellválasz csonkolódott (finish_reason=length)")`.
3. `makeCover`: a `if (scene.length < 20) return null;` helyett:
   ```ts
   if (scene.length < 20) {
     logger.warn(`[lesson-covers] a képterv nem adott használható jelenetet („${d.title.slice(0, 60)}”): válasz ${planText.length} karakter, JSON ${plan ? "igen" : "nem"}`);
     return null;
   }
   ```
   ahol `planText` a `deps.chat(...)` nyers válasza (a `parseJsonObject(planText)` előtt eltárolva).

## T3 — Blokkcímke: `source/shared/lesson-block-label.ts` (új)

```ts
import type { AgeBand, Block } from "./lesson-schema";
import { BAND_THEME } from "./lesson-band";

/**
 * Spec 2026-11-08-borito-blokkcimkek: a blokk fejléce a TARTALOMBÓL — Célkártya, mese, a magyarázat mélysége, az ábra és a feladat fajtája.
 * Tiszta függvény (a lejátszó és a teszt közös).
 */
const GOAL_LEAD = /^\s*(?:\*\*|__)?\s*(?:Mit tanulunk ma\?|Célunk\b|Cél\b)/u;

export function isGoalCardText(text: string): boolean {
  return GOAL_LEAD.test(text);
}

export const ANIM_LABELS: Readonly<Record<string, string>> = {
  numberLine: "Számegyenes", fraction: "Törtmodell", timeline: "Idővonal", geometry: "Ábra", process: "Folyamat", map: "Térkép",
  wordBuilder: "Szóépítő", sentenceParts: "Mondatelemzés", triangleArea: "Kísérlet", decisionStory: "Döntéshelyzet", cycle: "Körforgás",
  labeledShape: "Feliratos ábra", barChart: "Diagram", venn: "Halmazábra", illustration: "Illusztráció", scene3d: "3D-modell",
};

export const TRY_LABELS: Readonly<Record<string, string>> = { dragSort: "Rendezd sorba", fillBlank: "Egészítsd ki", match: "Párosítsd" };

export function blockLabel(blocks: readonly Block[], index: number, sectionIdx: number, band: AgeBand): string {
  const block = blocks[index];
  const theme = BAND_THEME[band];
  switch (block.kind) {
    case "explain": {
      if (sectionIdx === 0 && index === 0 && isGoalCardText(block.text)) return "A lecke célja";
      const prev = blocks[index - 1];
      if (sectionIdx === 0 && index === 1 && prev?.kind === "explain" && isGoalCardText(prev.text)) return band === "kid" ? "Mese" : "Történet";
      if (block.depth === "why") return "Miért?";
      if (block.depth === "deeper") return "Mélyebben";
      return theme.labels.explain;
    }
    case "example": return theme.labels.example;
    case "check": return theme.labels.check;
    case "recap": return theme.labels.recap;
    case "animate": return ANIM_LABELS[block.animKind] ?? "Ábra";
    case "try": return TRY_LABELS[block.tryKind] ?? "Próbáld ki";
  }
}
```

## T4 — Lejátszó: `source/client/src/lesson-runtime/LessonRuntime.tsx`

1. Import: `import { blockLabel } from "@shared/lesson-block-label";`
2. `LessonBlock` props: új opcionális `label?: string`. Fejlécek: explain → `ExplainBlock`-nak `label` átadva; example / check / recap
   blokkok `label ?? theme.labels.<kind>` (a három blokk-komponens új opcionális `label` propot kap); animate → `label ?? "Mozgókép"`;
   try → `label ?? "Próbáld ki"`.
3. `ExplainBlock`: `label` prop (alap: `theme.labels.explain`); a mélységjelző chip csak akkor, ha `block.depth !== "core"` ÉS a fejléc
   a sáv alapcímkéje (különben a „Miért?” / „Mélyebben” már a fejlécben áll).
4. A szekció-renderelőben (`section.blocks.map((block, bi) => …)`): `label={blockLabel(section.blocks, bi, sectionIdx, band)}`.

## T5 — Tesztek (új fájlok)

- `source/tests/subject-cover-fallback.test.ts`:
  1. Biológia 9 (`laboratory`), négy seeddel: `cover` nincs, `hero` nem `hero-laboratory`, és a `hero.subjects` üres (semleges).
  1b. `heroFitsSubject(hero-laboratory, …)`: Matematika, Fizika, Földrajz → igaz; Biológia, Kémia, Történelem → hamis; matematika → híd.
  2. `resolveStoredArt({ picture: "hero-laboratory" }, "laboratory", C, { subject: "Biológia", title: "Harasztok" })` → `null`.
  3. Matematika 9 (`{ subject: "Matematika", title: "Oszthatóság" }`): `resolveStoredArt({ picture: "hero-laboratory" }, …)?.hero?.id === "hero-laboratory"`.
  4. Üres tantárgy → `hero-laboratory` (régi viselkedés).
- `source/tests/lesson-block-label.test.ts`: Célkártya (`"**Cél:** Megérted…"`, 0. fejezet 0. blokk) → „A lecke célja”; utána explain → „Történet”
  (`kid` sávban „Mese”); a 2. fejezet ugyanilyen blokkja → sáv-címke; `why` → „Miért?”; `deeper` → „Mélyebben”; animate `cycle` → „Körforgás”,
  `scene3d` → „3D-modell”; try `match` → „Párosítsd”; Célkártya nélküli első explain → `BAND_THEME.teen.labels.explain`.
- `source/tests/lesson-covers-plan-log.test.ts`: `COVER_PLAN_MAX_TOKENS >= 1200`; `makeCover` hamis `chat`-tel (`"nem JSON"`), a `logger.warn`
  ideiglenes cseréjével → `null`, és a figyelmeztetés tartalmazza: „nem adott használható jelenetet”.

## T6 — Ellenőrzés
1. `node --import tsx --test tests/subject-cover-fallback.test.ts tests/lesson-block-label.test.ts tests/lesson-covers-plan-log.test.ts tests/design-assets.test.ts tests/stored-art.test.ts tests/home-card-theme.test.ts tests/lesson-teaser.test.ts` → `# fail 0`.
2. `npm.cmd run check`, `npm.cmd run lint`, `npm.cmd run check:test`, `npm.cmd test`.
3. Böngésző (A5): az élő lecke a merge és a Render-telepítés után (a helyi fejlesztői szerver NEM indítható: a `source/.env`
   `DATABASE_URL`-je egy idegen, régi adatbázisra mutat, a szerver indulása oda írhatna). A fejlécek és a nyitókép képernyőképpel;
   nincs vízszintes görgetés, nincs levágott fejléc.

## T7 — PR, review, merge, deploy
- Audit-jelző a kapuk után, push, PR, a review-botok (Codex, Copilot) eredménye a legutolsó kódcommitra, javítás, automatikus összevonás,
  `node scripts/qa/verify-render-revision.mjs` a merge után. A `lesson-covers` következő söprésének naplója (A3) a merge után.
