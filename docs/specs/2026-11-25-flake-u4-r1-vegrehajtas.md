# Végrehajtás: FLAKE-U4-R1

Terv: `docs/specs/2026-11-25-flake-u4-r1.md`.

1. **Bukó teszt (reprodukció):** a `markPairDelivered` elé ideiglenes 600 ms-os késleltetés → a régi R1 bukik (nem commitolt próbahiba).
2. **Zöldre hozás:** `waitRows` segéd az R1-ben (és az R5 közös használata).
3. **Ellenőrzés:** ugyanazzal a késleltetéssel az új R1 zöld; a teljes DB-készlet zöld.
4. **Kapulánc:** gate:stage → gate:push → helyi ellenőr → PR.
