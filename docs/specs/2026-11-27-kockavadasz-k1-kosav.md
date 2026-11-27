# Terv — FLAKE-BC-K1-CI (Kockavadász: a rúnakövek ne ugorjanak el a koppintás elől)

Cél: a zár alatt a rúnakövek helye ne váltson sávot, amíg a korábbi sáv használható; így a tanuló (és a vak K1 teszt)
koppintása oda esik, ahol a követ látta. Hatókör: `BlockCraftQuiz.tsx` sávválasztása + új tiszta modul és unit-teszt.
Nem cél: a sávok geometriájának, a kőméretnek vagy a rúnagombok elrendezésének módosítása.

Egységek: (1) bukó unit-teszt a sávválasztásra; (2) `pickStoneBand` + bekötés; (3) E2E-ismétlés a rúnakő/vak K1/K2 tesztekre.
Kockázat: ha a korábbi sáv szűkebb marad, a kő kisebb lehet a lehetségesnél — elfogadható, a minimum (26 px) őrzött.
