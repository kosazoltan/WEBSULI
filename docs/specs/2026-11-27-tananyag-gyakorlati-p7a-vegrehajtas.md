# Végrehajtás — TG-P7a (TANANYAG-GYAKORLATI, PR 7 első része: célzott tételcsere a javításban)

Terv: `docs/specs/2026-11-26-tananyag-gyakorlati.md` — „PR 7 — Célzott állományjavítás és visszaállítás”.
Feladat (SQL): `TANANYAG-GYAKORLATI`.

Élő leltár (2026-11-27, `practice-audit.mts --db`, csak olvasó): 258 közzétett lecke; kvízbank 14 629 alkalmazó / 11 628
fogalmi / 16 meta / 1 303 bizonytalan; nyílt bank 8 meta; 11 lecke tartalmaz meta-tételt; a 33 aktív játékkvíz-sor meta-mentes.

Hiány: a leckejavítás (`buildLessonExperience` a `previous` bankkal) a tanításában változatlan fejezet csomagját csak akkor veszi
át, ha a mai kapukon hibátlan. A TG-P4a óta a meta-tétel kapuhiba, így egyetlen meta-kérdés miatt a fejezet TELJES csomagja
újragyártódik — a jó tételek tartalma elveszhet (a modell új kérdéseket ír), a tanulói előzmény új kérdésekhez kerül, és a
javítás drága. A terv: csak a kifogásolt tétel cserélődjön, a többi tartalma és azonosítója maradjon stabil.

1. Bukó teszt (`tests/repair-bank-reuse.test.ts`):
   - meta-kérdéssel szennyezett régi csomag (változatlan tanítás): a javítás CÉLZOTT módban kér (egyetlen modellhívás, „JAVÍTÁSI
     MÓD”, csak a meta-tétel azonosítója), a fejezet többi tétele és azonosítója változatlan, a lecserélt tétel új tartalommal
     ugyanazon a helyen; a másik (hibátlan) fejezet modellhívás nélkül átvéve;
   - azonos javítás újrafuttatása (a javított bankkal mint `previous`) nulla modellhívás és azonos bank;
   - a meta-hiba MELLETT más kapuhibás régi csomag (pl. hibás correctIndex) változatlanul teljes újragyártást kap.
2. Javítás (`server/studio/experience-builder.ts`): a `previous` forrás csak meta-hibás csomagja javítási alap lesz (a J1 `seed`
   útja: `repairPermissions` a meta-üzenetek tételazonosítóiból), a régi csomag hash-ével; a bélyegzés a javítási alap
   azonosítóit tartja (egyedi azonosítóknál). Más kapuhiba esetén a régi viselkedés (teljes újragyártás).
3. Ellenőrzés: repair-bank-reuse, experience-builder / bank-* / single-run egységtesztek, tsc, eslint.

Állapot: tervezve — következő: RED.
