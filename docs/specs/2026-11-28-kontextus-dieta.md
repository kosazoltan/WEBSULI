# Terv — kontextus-diéta (AGENTS.md, skillek)

Tulajdonosi kérés 2026-11-28 (globális `~/.claude/CLAUDE.md` „Kontextus-diéta” és „Felejthető lépés = szkript”): a mindig betöltődő
fájlban csak hatályos szabály és mutató maradjon; az ismétlődő kézi lépés szkript + kapu legyen.

## Cél

- `AGENTS.md` ≤ 12 KB (mért előtte: 22 611 bájt); repó-`CLAUDE.md` nincs.
- Minden `SKILL.md` ≤ 15 KB (mért előtte: legnagyobb 9 887 bájt — megfelel).
- Minden Claude-skill (`.agents/skills` forrás → `.claude/skills` tükör) frontmatter utáni első sora a „Felejthető lépés = szkript” hivatkozás.
- Gépi őr: `source/tests/context-diet-guard.test.ts` (a `gate:stage` minden futáskor futtatja az `*-guard.test.ts` fájlokat).

## Nem-cél

- Szabály tartalmi módosítása vagy gyengítése: a kiköltöztetett szöveg szó szerint megmarad a `docs/`-ban.
- A kezelt blokkok (`agentic-qa-kit`, `CODEX_SHARED_QUALITY_RULES`, `hermes-gpt-cel`) kézi szerkesztése.
- A generált `.hermes.md` tükör kézi frissítése (a Hermes `projekt-tudas-sync.py` írja).

## Érintett fájlok

- `AGENTS.md` — tömörítés; a repó-specifikus szakaszok rövid szabály + mutató alakra.
- `docs/agent-szabalyok.md` (új) — a kiköltöztetett repó-specifikus szakaszok szó szerinti szövege.
- `docs/agent-szabalyok-codex-protokoll.md` (új) — a `CHATGPT_CODEX_PROTOCOL` blokk szó szerint (telepítője nincs a gépen; a
  tartalma a `CODEX_SHARED` és az `agentic-qa-kit` blokk részhalmaza).
- `.agents/skills/*/SKILL.md`, `.claude/skills/*/SKILL.md` — hivatkozó sor.
- `source/tests/context-diet-guard.test.ts` (új).

## Rögzített döntések

- A `CODEX_SHARED_QUALITY_RULES` blokk az `AGENTS.md`-ben marad: a telepítője (`install-codex-shared-quality-rules.mjs`, upsert)
  hiánynál visszaírná a fájl végére.
- A „Review guidelines” szakasz tömörítve az `AGENTS.md`-ben marad (a Codex-review onnan olvassa), a teljes szöveg a `docs/`-ban.
- A korlát bájtban: 12 KB = 12 288 bájt, 15 KB = 15 360 bájt.

## Edge case-ek

- A skill-tükör őr (`skills-sync-check.mjs`) a frontmattert az első sorban várja → a hivatkozó sor a frontmatter UTÁN kerül.
- A `mojibake-guard` minden `AGENTS.md`-t és `docs/`-fájlt vizsgál → UTF-8 marad.
- Az `.hermes/skills` Hermes-skillek, nem Claude-skillek: hivatkozó sort nem kapnak; méretkorlátot az őr ott is ellenőriz.

## Elfogadás (EARS)

- Amikor a `gate:stage` fut, a `context-diet-guard` SHALL bukni, ha az `AGENTS.md` > 12 288 bájt, bármely `SKILL.md` > 15 360 bájt,
  vagy egy `.agents/skills` / `.claude/skills` skill nem tartalmazza a hivatkozó sort.
- A kiköltöztetett minden szakasz SHALL szó szerint megtalálható a `docs/agent-szabalyok*.md` fájlokban, és az `AGENTS.md` SHALL
  mutatót tartalmazni rájuk.

<!-- acceptance-checklist -->
- [ ] AGENTS.md ≤ 12 288 bájt
- [ ] Minden SKILL.md ≤ 15 360 bájt
- [ ] Hivatkozó sor minden Claude-skillben, tükör bájtazonos
- [ ] Kiköltöztetett szöveg szó szerint a docs/-ban, mutatóval
- [ ] context-diet-guard zöld, gate:stage zöld
