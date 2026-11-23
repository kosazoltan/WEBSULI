---
name: aranyos-kapuk-2026-11-23
description: "Tulajdonosi döntés 2026-11-23: arányos kapuk — kis javítás (≤ 30 sor éles kód) fizetős vak kör nélkül; a helyi push-kapu csak a kapcsolódó teszteket futtassa, a teljes készlet a CI-é"
metadata:
  type: feedback
---

A tulajdonos 2026-11-23-án (szó szerint, lényegében): „Ellenőrizd … hogy ne legyenek aránytalanok. A futtatások arányos legyen. A kis
javítás ne kérjen fizetős ellenőri kört, és a helyi pushkapu csak a kapcsolódó teszteket futtassa. A teljes készletet a GitHub úgy is le
fogja futtatni, és 30 sornyi kód legyen a kis javítás határa.”

- **Kis javítás:** legfeljebb 30 sor ÉLES kód változik (a `source/**` nem teszt / nem dokumentáció fájljai, hozzáadott + törölt sor;
  teszt és dokumentáció nem számít bele). Ehhez NEM indul fizetős vak ellenőri kör (GPT-6.2 Sol); a helyi kapu és a CI elég.
- **Helyi push-kapu:** csak a változáshoz kapcsolódó tesztek; a teljes készlet (teljes egységteszt, minden böngészős spec, teljes
  DB-kör) a GitHub CI-é.

**Why:** a mai futásban a helyi kapuk egy órákat vittek el (a PR-kapu egyszer 60 percig futtatta mind a 83 böngészős tesztet), a kis
javítások (pl. egy kapujavítás, egy dokumentum-összefésülés) is teljes vak kört kaptak — aránytalan idő és API-költség.
**How to apply:** amíg a kapuk kódja ezt nem tudja (folyamatban: arányossági kapu-PR), a ≤ 30 soros éles-kód változásnál vak kört NEM
indítok; a repó kapu-hookja addig is ítéletet kérhet — azt a kapu-PR oldja meg, nem megkerülés. Ez felülírja a globális CLAUDE.md
„minden fejlesztést független ellenőr néz át” sorát a kis javításokra (a CLAUDE.md a tulajdonosé; a frissítését felajánlom).
Kapcsolódó: [[quality-gates-mandate]], [[blind-review-runner]], [[maximize-prompt-cache]], [[hosszu-futas-vezenyles]].
