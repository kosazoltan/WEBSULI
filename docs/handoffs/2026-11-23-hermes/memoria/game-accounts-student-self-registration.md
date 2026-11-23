---
name: game-accounts-student-self-registration
description: "Játékos-fiók döntés (2026-11-16) — a diákok saját e-mail-címükkel regisztrálhatnak, nincs szülői regisztráció és jogi kapu"
metadata:
  node_type: memory
  type: project
  originSessionId: 99a9b29f-318a-40fe-a572-f8ecf28ad2ae
  modified: 2026-11-16T06:00:53.208Z
---

Tulajdonosi döntés (Kósa Zoltán, 2026-11-16): a játékokhoz a diákok SAJÁT maguk regisztrálhatnak e-mail-címmel és
becenévvel; szülői regisztráció, szülői hozzájárulási kapu, életkor-kapu és jogászi átnézés mint előfeltétel NEM kell.

**Why:** a tulajdonos szerint a kör szűk (a saját gyerekei, azok barátai és testvérei), nincs reklám, és csak becenév
+ e-mail-cím tárolódik. A kutató alügynök eredetileg szülő által regisztrált modellt javasolt — ezt a tulajdonos
kifejezetten felülbírálta.

**How to apply:** fiók / regisztráció / barátok / párbaj tervezésénél ne javasolj újra szülői vagy GDPR-kaput, és ne
tedd a regisztrációt jogi okból kapcsoló mögé. Ami marad (a rendszer épsége miatt, nem jogi kapuként): e-mail
megerősítése kóddal, sebességkorlát, becenév-szűrő, az e-mail-cím és a valódi név nem látszik más játékosnak, nincs
szabad csevegés, fiók törölhető. Életkort és valódi nevet nem kérünk be. Terv: `docs/specs/2026-11-16-jatekok-jatekelmeny.md`.

Kiegészítő biztonsági követelmény (tulajdonos, 2026-11-16): az admin felülethez KIZÁRÓLAG az adminok férhetnek hozzá.
A Google-belépés eredetileg csak az adminoké; a játékhoz adható Google-belépés csak a nyilvános játékoldalakra
érvényes játékos-fiókot hoz létre, admin-jogot soha. Új fióktípus bevezetésekor minden admin végpont szerveroldali
admin-ellenőrzését teszttel kell igazolni (szerep × végpont mátrix).

Kapcsolódó: [[learner-profile-tokens]], [[orchestration-lessons-games]]
