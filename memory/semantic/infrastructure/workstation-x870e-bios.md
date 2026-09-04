# Munkaállomás — ASUS ProArt X870E-CREATOR WIFI: BIOS / memória-stabilitás

> Hardver-jegyzet, nem a WEBSULI alkalmazáshoz tartozik. A fejlesztői gép
> stabilitási problémájának (véletlenszerű crash, majd bootképtelenség)
> dokumentációja, hogy egy következő munkamenetben ne kelljen újra felderíteni.

## A gép azonosítása (a korábbi jegyzetből visszafejtve)

| Elem | Érték | Miből derül ki |
|---|---|---|
| Alaplap | **ASUS ProArt X870E-CREATOR WIFI** | explicit említés |
| Foglalat / platform | **AMD AM5**, X870E chipset | az alaplap típusából |
| CPU | AMD Ryzen 7000/9000 sorozat (Zen 4/5) | AM5 + `VDDCR SOC` 1,30 V hard limit |
| Memória | **DDR5-6000 EXPO kit**, VDDIO_MEM 1,35 V | a beállítási táblázat |
| GPU | NVIDIA, **32 GB VRAM** (BAR1 = 32768 MiB), 480 W power limit | Resizable BAR méret |
| OS | Windows (BitLocker, ütemezett feladat, HWiNFO64) | a szkriptek |

Kritikus platform-tény: az AM5 memóriavezérlő (`VDDCR_SOC`) **1,30 V fölött
degradálódik** — az AGESA 1.0.0.7 óta a BIOS is limitálja. A jegyzetben szereplő
1,250 V ezért a helyes cél, és soha nem szabad feljebb vinni.

## Aktuális tünet: a gép nem indul el / lefagy

Ez **más hiba, mint a korábbi Windows-crash** (0x116 / 0x133 / 0x4e). A crash
futó rendszerben történt; a bootképtelenség POST-fázisú vagy korai boot-fázisú.
Az elkülönítés az alaplap **Q-LED**-jeivel történik (a 24 tűs tápcsatlakozó
mellett, 4 db): a POST folyamat során sorban villannak, és **azon a LED-en áll
meg, ahol elakadt**.

### Triázs — mit mutat a Q-LED?

| Q-LED | Jelentés | Első lépés |
|---|---|---|
| **DRAM (sárga)** ég vagy villog | memória-tréning nem sikerül | ez a legvalószínűbb — lásd lent, „DRAM ág" |
| **CPU (piros)** | CPU/VRM/táp | tápkábelek (8+8 pin EPS) újradugása, CMOS törlés |
| **VGA (fehér)** | GPU nem inicializál | GPU újraültetése, PCIe táp; próba iGPU-ról (HDMI az alaplapra, GPU kivéve) |
| **BOOT (zöld)** | POST kész, az adathordozóról nem indul | nem BIOS-hiba → Windows/boot-bejegyzés, lásd „BOOT ág" |
| **egyik sem, fekete kép, ventik pörögnek** | tréning fut, VAGY megszakadt BIOS-flash | várj (lásd lent), utána BIOS FlashBack |

### FONTOS mielőtt bármit csinálsz: a hosszú fekete képernyő normális

AM5-ön az **első boot BIOS-frissítés vagy CMOS-törlés után 1–5 perc is lehet**
fekete képernyővel, EXPO-val akár tovább — a memóriavezérlő nulláról tanulja a
timingeket. **Ne kapcsold ki közben**, mert az félbehagyott tréninggel hagyja a
gépet, és a következő indulás még rosszabb. Adj neki **legalább 5 percet**,
mielőtt bármi mást lépsz. (Ugyanez miatt lesz a `Memory Context Restore =
Disabled` mellett minden hidegindítás 10–30 mp-cel hosszabb — az normális.)

### DRAM ág (a legvalószínűbb, mert az EXPO/feszültségek voltak állítva)

1. **CMOS törlés.** Tápkábelt ki a falból, várj 30 mp-et, majd a hátlapon a
   **CLR_CMOS** gombot nyomd 10 mp-ig (ha nincs gomb: a lapon a `CLRTC`
   tüskepárt zárd rövidre 10 mp-ig, vagy vedd ki a CR2032 elemet 5 percre).
   Ez visszaállít minden EXPO/feszültség beállítást — ezért a bootképtelenség
   99%-ban ezzel megszűnik. **Ha ettől elindul: a beállítás volt túl agresszív,
   nem a hardver romlott el.**
2. **Egy modullal.** Ha CMOS-törlés után sem indul: minden DIMM ki, **egy modul
   az A2 foglalatba** (a CPU-tól számított második). Ha így elindul, tedd vissza
   a többit egyesével — így derül ki, ha egy modul lett rossz.
3. **BIOS-ban induláskor: EXPO KI.** Első sikeres bejutás után hagyd a memóriát
   JEDEC alapon (DDR5-3600/4800, minden Auto). Nézd meg, hogy így **stabil-e egy
   napig**. Csak utána vidd fel az EXPO-t, és akkor is a korábbi táblázat szerint.
4. Ha stabil JEDEC-en, de EXPO-val nem indul → a 6000 nem tartható ezen a kiten:
   **DDR5-5600, FCLK 1867 MHz** a következő lépcső.

### Megszakadt BIOS-frissítés ága (ha a fagyás a flash közben/után jött)

A ProArt X870E-Creator WIFI-n van **USB BIOS FlashBack** — CPU, memória és GPU
nélkül is újraflashel:

1. Másik gépen töltsd le az alaplap BIOS-át az ASUS support oldalról.
2. A ZIP-ben lévő **BIOSRenamer.exe**-vel nevezd át (ez adja a helyes `.CAP`
   nevet — kézzel ne találgasd).
3. FAT32-re formázott **USB 2.0 pendrive gyökerébe** másold, csak ezt az egy fájlt.
4. A hátlapon a **BIOS FlashBack felirattal jelölt USB portba** dugd (nem
   mindegy, melyikbe!), a tápkábel legyen bedugva, a gép **kikapcsolva**.
5. Nyomd a **BIOS FlashBack gombot 3 másodpercig**, míg a LED villogni kezd.
   **3–8 percig villog** — ez alatt semmit ne csinálj. Amikor elalszik, kész.
   Ha végig világít / azonnal elalszik: rossz fájlnév vagy rossz port.

### BOOT ág (POST lefut, de a Windows fagy le)

Ekkor a BIOS rendben van, tehát:

- **BitLocker/TPM**: a BIOS-frissítés megváltoztatja a TPM-méréseket. Ha
  helyreállítási kulcsot kér és nincs meg → https://aka.ms/myrecoverykey
  (Microsoft-fiókkal belépve).
- **Csökkentett mód**: kapcsold ki hardveresen a bekapcsológombbal a Windows-logó
  alatt 3×, ekkor magától indul a helyreállítási környezet → Hibaelhárítás →
  Speciális → Indítási beállítások → 4 (csökkentett mód). Ha csökkentett módban
  megy, de normálban fagy: **driver** (elsősorban GPU) a gyanús, nem a memória.
- Ha csökkentett módban is fagy: a memória-instabilitás jutott el a
  fájlrendszerig/rendszerfájlokig → `sfc /scannow` és `chkdsk C: /f` a
  helyreállítási parancssorból.

## Célértékek (a működő konfiguráció, ha újra be kell állítani)

| Beállítás | Érték | Hol |
|---|---|---|
| Ai Overclock Tuner | EXPO I (XMP I, ha a kit XMP-s) | Ai Tweaker |
| DRAM Frequency | DDR5-6000 | Ai Tweaker |
| FCLK Frequency | 2000 MHz (fix, nem Auto) | Ai Tweaker |
| VDDCR SOC Voltage | **1,250 V** (hard limit 1,30 — soha feljebb) | Ai Tweaker → feszültségek |
| CPU VDDIO / Memory Voltage | 1,350 V ← **ez a stabilitás kulcsa** | Ai Tweaker → feszültségek |
| DRAM VDD / VDDQ | 1,350 V (EXPO magától állítja, csak ellenőrizd) | Ai Tweaker → feszültségek |
| Memory Context Restore | Disabled | Advanced → AMD CBS → UMC Common Options → DDR Options |
| Power Down Enable | Disabled | ugyanott |
| Above 4G Decoding | Enabled | Advanced → PCI Subsystem |
| Re-Size BAR Support | Enabled | ugyanott |

`F7` = Advanced Mode, `F9` = keresés (a menüutak BIOS-verziónként csúsznak).

Névkeveredés: a **CPU VDDIO / Memory Voltage** (memóriavezérlő oldala) és a
**DRAM VDDQ** (modul oldala) két különböző dolog. A stabilitás szempontjából az
előbbi számít; ha csak a modul-oldalit állítod, a lényeg marad ki.

## Nyitott pont

A `NVIDIA-PowerLimit-480` ütemezett feladat eltűnt a rendszerből; a 480 W limit
mégis érvényes (valószínűleg az Armoury Crate perzisztálja). Ha a 480 W szándékos,
a dokumentált mechanizmust újra létre kell hozni — most nincs meg.
