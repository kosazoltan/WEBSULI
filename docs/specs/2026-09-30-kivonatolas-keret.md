# Kivonatolás: csonka válasz ne állítsa meg a gyártást (2026-09-30)

**Cél:** az élő Egyiptom-gyártás (3) a kivonatolásnál megállt: `finish_reason = "length"` a 8192 tokenes kereten, pedig a forrás
2748 karakter volt. A kivonatoló gondolkodó modell (gpt-5.6-terra), a gondolkodás is a `max_completion_tokens` keretből fogy.
Csonka válasz esetén egyszer nagyobb (24 576) kerettel újrakérdezünk.
**Nem-cél:** a csonka jegyzék mentése (továbbra is tilos), modellcsere, prompt-módosítás.
**Edge case:** a második válasz is csonka → a régi hibaüzenet; `stop`-tól eltérő, nem `length` ok (pl. `content_filter`) → nincs újrakérdezés.
**Elfogadás (EARS):**
- HA az első válasz `length` okkal ér véget, AKKOR a rendszer egyszer 24 576-os kerettel újrakérdez, és a `stop` választ használja.
- HA a második is csonka, AKKOR a rendszer a csonkolt-jegyzék hibát dobja.
- HA a befejezés oka nem `length` és nem `stop`, AKKOR nincs újrakérdezés.
