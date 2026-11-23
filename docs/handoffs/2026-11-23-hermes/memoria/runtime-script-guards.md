---
name: runtime-script-guards
description: "A futó programban is szkriptek / hookok / webhookok szabályozzák az AI-lépéseket, nem másik modell véleménye (tulajdonos, 2026-11-18)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 99a9b29f-318a-40fe-a572-f8ecf28ad2ae
  modified: 2026-11-18T10:57:23.968Z
---

A tulajdonos 2026-11-18-án kiterjesztette a szkriptkapu-elvet a FUTÓ programra: „A programon belül minél kiterjedtebb módon
használd a webhookokat, hookokat, scripteket, hogy minél pontosabb tesztekkel behangolt scriptek, webhookok szabályozzák a
működést. Nehogy valamelyik mesterséges intelligencia-ügynök hallucinációja, túlgondolása, túlfutása károsan hasson a program
céljaira, futására.”

**Why:** a nap során több rés derült ki, ahol modell vagy ügynök ellenőrzés nélkül futhatott túl: a tananyaggyártás fedettségmérője
100%-ot mutatott, miközben a forrás 38 tételéből 6 jelent meg; egy képgyártó költségplafonja az újrapróbát nem számolta; a
Szökőár átépítése minden kapun átment, miközben a játék témája elveszett.

**How to apply:** minden új vagy módosított AI-lépésnél (gyártás, döntőbíró, kép / hang / e-mail generálás, ütemezett feladat) a
tervben legyen: (1) determinisztikus kimenet-ellenőr (séma, szabály, mérőszám + küszöb), (2) futáskorlát (körszám, token / USD,
idő, megszakító flag), (3) teszt mutációs ellenpróbával és mért alapvonallal, (4) ahol esemény vezérelhet, webhook aláírás-
ellenőrzéssel. Ahol szkript el tudja dönteni, ne modell döntsön. Fizetős futás előtt a költségplafont független ellenőr nézze meg.
A „kapun átment” nem elég: a cél (pl. a játék témája) teljesülését is ellenőrizni kell a tulajdonosnak mutatott képpel.
Kapcsolódó: [[quality-gates-mandate]], [[completion-mandate]].
