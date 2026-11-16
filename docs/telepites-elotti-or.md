# Telepítés előtti őr — ne szakíts meg futó tananyaggyártást

Állapot: érvényes 2026-11-16-tól (kanban #63). Eszköz: `scripts/qa/active-runs-guard.sh`.

## Miért kell

A Render a `main` minden összevonására újratelepít, és a futó folyamatot leállítja. A graceful shutdown
(`source/server/index.ts`, `gracefulShutdown`) felső korláttal vár, ezért egy hosszú tananyaggyártás / javítás /
okosítás megszakadhat. 2026-11-16-án a sorozatos összevonások közben megszakadt a tulajdonos futó tananyaggyártása;
a független audit szerint ~15 percen belül három éles telepítés is lefutott őr nélkül (retro:
`docs/handoffs/2026-11-16-jatekelmeny-fiok-retro.md`, csapda: `docs/agent-csapdak.md`).

## Szabály (minden ügynöknek és embernek)

1. **Minden `gh pr merge` ELŐTT, közvetlenül előtte** futtasd az őrt (nem a PR megnyitásakor, nem „korábban már néztem”).
2. **Kilépési kód 1 (van aktív futás) → ne vonj össze.** Várd meg a futás végét, majd futtasd újra az őrt.
3. **A zöld PR-okat egy ablakban vond össze**, egymás után, egyetlen őr-ellenőrzés és egyetlen telepítési ablak alatt;
   ne szórd szét órákra (minden összevonás egy telepítés, minden telepítés megszakíthat). Az ablakot előre jelezd
   a tulajdonosnak.
4. **Kilépési kód 2 (hiba) → nem szabad vakon összevonni.** Javítsd a hibát (hálózat, `DATABASE_URL`), vagy kérj
   kifejezett tulajdonosi döntést.
5. **`MP_MODE` bekapcsolása után** (valós idejű párbaj) az őr mellé nézd a `GET /api/rt/status` válasz
   `activeMatches` mezőjét is (`source/server/realtime/index.ts`): a folyamatban lévő meccsek is megszakadnak
   telepítéskor. Nullánál nagyobb érték esetén ugyanúgy várj.

## Használat

```bash
bash scripts/qa/active-runs-guard.sh
echo "exit=$?"
```

| Kilépési kód | Jelentés |
|---|---|
| 0 | nincs aktív futás — összevonható |
| 1 | van aktív futás; a kimenet `GUARD_COUNTS: workflow=N studio=N improve=N onestep=N` és `AKTIV=<összeg>` |
| 2 | hiba (nincs `DATABASE_URL`, hálózati / lekérdezési hiba, váratlan válasz) |

A négy számláló: `lesson_workflow_runs` (futó / várakozó, élő bérlettel), `studio_jobs` (függő / futó, 6 órán belüli),
`improved_html_files` (`processing`), `one_step_runs` (nem lezárt fázis, 30 percen belüli frissítés).

## Hogyan működik (és mit nem csinál)

- **Csak olvasó:** egyetlen `SELECT`, a Neon SQL-over-HTTP végpontján, `Neon-Batch-Read-Only: true` fejléccel.
- **A kapcsolati szöveg soha nem kerül parancssorba, naplóba, kimenetbe:** a `curl` a fejlécet a szabványos
  bemeneten kapott konfigból olvassa (`-K -`); a hibaüzenetből a kapcsolati minta ki van szűrve.
- **`DATABASE_URL` forrása:** a már beállított környezeti változó, különben a `source/.env` (git-munkafában a fő
  checkout `source/.env` fájlja; felülírható: `GUARD_ENV_FILE=<út>`). Semmi nincs beégetve.
- **Miért `curl`:** a fejlesztői gépen a Node TLS-kapcsolata a Neon felé nem megy, a `curl` igen.
- **Miért nincs `bc`:** a Git Bash-ben nincs `bc`; az összeget a shell számolja.
- **Nincs bekötve** CI-ba vagy hookba — az külön tulajdonosi döntés. Ma kézi (vagy az összevonást végző ügynök
  lépése); a Render-oldali telepítési kapu továbbra is hiányzik (kanban #63).

## Ha az őr folyamatosan 1-et ad

Ne kerüld meg. Nézd meg az admin futáslistát (mi fut, mióta), kérdezd meg a tulajdonost, mikor szabad az út; a zöld
PR-ok addig várhatnak. Ha egy futás „beragadt” (lejárt bérlet nélkül `processing`), az külön hiba: kanban-jegy, nem
az őr lazítása.
