import MathTowerScene3D from "@/components/MathTowerScene3D";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Flame, Gauge, Heart, Rocket, RotateCcw, Star, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import GamePedagogyPanel from "@/components/GamePedagogyPanel";
import GameNextGoalBar from "@/components/GameNextGoalBar";
import { gameSyncBannerText, useSyncEligibilityQuery } from "@/hooks/useGameScoreSync";
import AudioToggleButton from "@/components/AudioToggleButton";
import { sfxSuccess, sfxError, sfxLevelUp } from "@/lib/audioEngine";
import { recordRun, type Achievement } from "@/lib/achievements";
import { isTodaysGameAvailable, markDailyCompleted } from "@/lib/dailyChallenge";
import AchievementToast from "@/components/AchievementToast";
import QuizFeedbackCard from "@/game-engine/QuizFeedbackCard";
import { buildFeedback, type FeedbackCard } from "@/game-engine/feedback";
import { scoreCorrectAnswer } from "@/game-engine/retry-policy";
import { nextDifficulty, startingDifficulty } from "@/game-engine/difficulty";
import { correctDataAttrs, installGameTestApi } from "@/game-engine/game-test-hooks";
import { pickFreshTask } from "@/game-engine/no-repeat";
import { useGradeLevel } from "@/game-engine/useGradeLevel";
import { GradeLevelPicker } from "@/game-engine/GradeLevelPicker";
import { digitComplexity, levelAdaptBand, levelStartBand, pickByBand } from "@/game-engine/levelTuning";
import { QUESTION_SECONDS, ROUND_SECONDS, TARGET_CORRECT, questionSecondsForBand } from "@/game-engine/speedQuizTiming";

type GradeLevel = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** A menü évfolyamai (a teljes alsó és felső tagozat, középiskola). */
const GRADE_LEVELS: readonly GradeLevel[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
type Phase = "menu" | "play" | "over" | "won";

type MathTask = {
  prompt: string;
  options: number[];
  correctIndex: number;
  /**
   * A levezetés, amit a gyerek rossz válasz után lát (G-2).
   *
   * Élesben mérve: enélkül a magyarázó kártya csak annyit tudott kiírni, hogy
   * „A helyes válasz: 1770" — matekból ez kevés, mert a HOGYAN marad ki belőle.
   */
  explanation?: string;
  /**
   * Az eredmény ellenőrző kifejezése a prompt számaiból (pl. `"432/8"`). Csak ellenőrzésre: a teszt kiszámolja,
   * és megköveteli, hogy PONTOSAN egy opció egyezzen vele; a vak megoldó ehhez méri a promptot.
   */
  calc?: string;
  source: "teacher" | "generated";
};
type AnswerState = "idle" | "correct" | "wrong";

const LEVEL_LABEL: Record<GradeLevel, string> = {
  3: "3. osztály",
  4: "4. osztály",
  5: "5. osztály",
  6: "6. osztály",
  7: "7. osztály",
  8: "8. osztály",
  9: "9. évfolyam",
  10: "10. évfolyam",
  11: "11. évfolyam",
  12: "12. évfolyam",
};

const SCORE_DIFFICULTY: Record<GradeLevel, "easy" | "normal" | "hard"> = {
  3: "easy",
  4: "normal",
  5: "hard",
  6: "hard",
  7: "hard",
  8: "hard",
  9: "hard",
  10: "hard",
  11: "hard",
  12: "hard",
};

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(items: readonly T[]): T {
  return items[randInt(0, items.length - 1)]!;
}

/** Kerekítés 6 tizedesre: a lebegőpontos zaj (0,1 + 0,2) ne adjon két „különböző” opciót. */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Magyar számírás a gombokon és a szövegben: tizedesvessző, valódi mínuszjel. */
function formatMathNumber(n: number): string {
  return String(round6(n)).replace(".", ",").replace("-", "−");
}

/** Negatív szám zárójelben, ahogy a műveletben írjuk. */
function paren(n: number): string {
  return n < 0 ? `(${formatMathNumber(n)})` : formatMathNumber(n);
}

function decimalPlaces(n: number): number {
  const s = String(round6(n));
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}

const SUPERSCRIPT: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
const SUBSCRIPT: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉" };
const sup = (n: number) => String(n).split("").map((c) => SUPERSCRIPT[c] ?? c).join("");
const sub = (n: number) => String(n).split("").map((c) => SUBSCRIPT[c] ?? c).join("");

/** `x² + bx + c` olvasható alakban (előjellel, 1-es együttható nélkül). */
function quadText(b: number, c: number): string {
  const bx = b === 0 ? "" : ` ${b < 0 ? "−" : "+"} ${Math.abs(b) === 1 ? "" : Math.abs(b)}x`;
  const cc = c === 0 ? "" : ` ${c < 0 ? "−" : "+"} ${Math.abs(c)}`;
  return `x²${bx}${cc}`;
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** A 10-zel / 100-zal / 1000-rel alak (a magyar rag a szám kiejtéséhez illeszkedik). */
const WITH_POWER_OF_TEN: Record<number, string> = { 10: "10-zel", 100: "100-zal", 1000: "1000-rel" };

/**
 * Négy különböző opció, pontosan egy egyezik a helyes értékkel. A tévesztők a helyes érték tizedes léptéke szerint
 * térnek el; 7. évfolyamtól az előjelhiba (−x) is tévesztő, és negatív opció is lehet.
 */
function uniqueOptions(correct: number, level: GradeLevel): number[] {
  const value = round6(correct);
  const step = 10 ** -Math.min(3, decimalPlaces(value));
  const spread =
    level === 3 ? 9 : level === 4 ? 14 : level === 5 ? 20 : Math.max(3, Math.min(25, Math.round((Math.abs(value) / step) * 0.2)));
  const allowNegative = level >= 7 || value < 0;
  const set = new Set<number>([value]);
  if (level >= 7 && value !== 0) set.add(-value);
  while (set.size < 4) {
    const candidate = round6(value + randInt(-spread, spread) * step);
    set.add(allowNegative ? candidate : Math.max(0, candidate));
  }
  return Array.from(set).sort(() => Math.random() - 0.5);
}

/** Sablonok száma évfolyamonként (a `t` ágak száma a generátorban). */
const GENERATOR_TEMPLATES: Record<GradeLevel, number> = { 3: 9, 4: 9, 5: 9, 6: 8, 7: 8, 8: 8, 9: 8, 10: 8, 11: 9, 12: 9 };

const TEACHER_BANK: Record<GradeLevel, MathTask[]> = {
  3: [
    { prompt: "Egy gyerek 18 matricát gyűjtött, majd kapott még 7-et. Hány matricája van most?", options: [23, 24, 25, 26], correctIndex: 2, explanation: "18 + 7 = 25 matrica.", calc: "18+7", source: "teacher" },
    { prompt: "Az osztályban 27 ceruza volt, 9-et elhasználtak. Mennyi maradt?", options: [16, 17, 18, 19], correctIndex: 2, explanation: "27 - 9 = 18 ceruza maradt.", calc: "27-9", source: "teacher" },
    { prompt: "4 dobozban dobozonként 6 alma van. Hány alma összesen?", options: [18, 20, 22, 24], correctIndex: 3, explanation: "Dobozonként 6, négy dobozban: 4 × 6 = 24 alma.", calc: "4*6", source: "teacher" },
    { prompt: "A könyvtárban 35 könyv volt, majd hoztak még 14-et. Hány könyv lett?", options: [47, 48, 49, 50], correctIndex: 2, explanation: "35 + 14 = 49 könyv.", calc: "35+14", source: "teacher" },
    { prompt: "Egy buszon 42 utas volt, 15 leszállt. Hány utas maradt?", options: [25, 26, 27, 28], correctIndex: 2, explanation: "42 - 15 = 27 utas maradt.", calc: "42-15", source: "teacher" },
    { prompt: "7 zsákban 5-5 golyó van. Hány golyó összesen?", options: [30, 35, 40, 45], correctIndex: 1, explanation: "Zsákonként 5, hét zsákban: 7 × 5 = 35 golyó.", calc: "7*5", source: "teacher" },
    { prompt: "Misi 12 percet tanult reggel és 13 percet délután. Hány percet tanult összesen?", options: [23, 24, 25, 26], correctIndex: 2, explanation: "12 + 13 = 25 perc.", calc: "12+13", source: "teacher" },
    { prompt: "A büfében 50 zsemle volt, 21-et eladtak. Mennyi maradt?", options: [28, 29, 30, 31], correctIndex: 1, explanation: "50 - 21 = 29 zsemle maradt.", calc: "50-21", source: "teacher" },
    { prompt: "Peti 14 matricát ragasztott a füzetére, majd kapott még 8-at. Hány matrica van most összesen?", options: [20, 21, 22, 23], correctIndex: 2, explanation: "14 + 8 = 22 matrica.", calc: "14+8", source: "teacher" },
    { prompt: "Az asztalon 16 színes ceruza volt (köztük 4 törött). A törötteket félretették. Hány egész ceruza maradt az asztalon?", options: [10, 11, 12, 13], correctIndex: 2, explanation: "A 4 törött lekerül: 16 - 4 = 12 egész ceruza.", calc: "16-4", source: "teacher" },
    { prompt: "3 polcon polconként 7 könyv áll. Hány könyv van összesen a három polcon?", options: [18, 19, 20, 21], correctIndex: 3, explanation: "Polconként 7, három polcon: 3 × 7 = 21 könyv.", calc: "3*7", source: "teacher" },
    { prompt: "Egy dobozban 20 db kréta volt. 6-ot elhasználtak. Mennyi maradt?", options: [12, 13, 14, 15], correctIndex: 2, explanation: "20 - 6 = 14 kréta maradt.", calc: "20-6", source: "teacher" },
    { prompt: "7 × 8 = ?", options: [54, 48, 63, 56], correctIndex: 3, explanation: "7 × 8 = 56, mert 7 × 7 = 49 és 49 + 7 = 56.", calc: "7*8", source: "teacher" },
    { prompt: "56 ÷ 7 = ?", options: [8, 7, 9, 6], correctIndex: 0, explanation: "56 ÷ 7 = 8, mert 8 × 7 = 56.", calc: "56/7", source: "teacher" },
    { prompt: "9 × 6 = ?", options: [45, 56, 54, 63], correctIndex: 2, explanation: "9 × 6 = 54, mert 10 × 6 = 60 és 60 − 6 = 54.", calc: "9*6", source: "teacher" },
    { prompt: "63 ÷ 9 = ?", options: [6, 7, 8, 9], correctIndex: 1, explanation: "63 ÷ 9 = 7, mert 7 × 9 = 63.", calc: "63/9", source: "teacher" },
    { prompt: "Egy tálcán 4 sorban 7-7 muffin van. Hány muffin van a tálcán?", options: [21, 24, 32, 28], correctIndex: 3, explanation: "Soronként 7, négy sorban: 4 × 7 = 28 muffin.", calc: "4*7", source: "teacher" },
    { prompt: "Egy póknak 8 lába van. Hány lába van összesen 7 póknak?", options: [48, 56, 54, 64], correctIndex: 1, explanation: "Pókonként 8 láb, hét póknak: 7 × 8 = 56 láb.", calc: "7*8", source: "teacher" },
    { prompt: "42 almát 6 kosárba osztunk szét egyenlően. Hány alma jut egy kosárba?", options: [7, 6, 8, 36], correctIndex: 0, explanation: "42 ÷ 6 = 7 alma, mert 7 × 6 = 42.", calc: "42/6", source: "teacher" },
    { prompt: "Egy tábla csoki 3 sorból áll, soronként 8 kockával. Hány kocka van a táblában?", options: [21, 11, 24, 27], correctIndex: 2, explanation: "Soronként 8, három sorban: 3 × 8 = 24 kocka.", calc: "3*8", source: "teacher" },
    { prompt: "72 ÷ 8 = ?", options: [8, 7, 10, 9], correctIndex: 3, explanation: "72 ÷ 8 = 9, mert 9 × 8 = 72.", calc: "72/8", source: "teacher" },
    { prompt: "36 tanulót 4 fős csoportokba osztanak. Hány csoport lesz?", options: [9, 8, 32, 10], correctIndex: 0, explanation: "36 ÷ 4 = 9 csoport, mert 9 × 4 = 36.", calc: "36/4", source: "teacher" },
    { prompt: "Egy hét 7 napból áll. Hány nap van 5 hétben?", options: [30, 35, 12, 42], correctIndex: 1, explanation: "Hetente 7 nap, öt héten: 5 × 7 = 35 nap.", calc: "5*7", source: "teacher" },
    { prompt: "Egy villamosjegy 450 Ft. Mennyit fizetünk 2 jegyért? Hány Ft?", options: [850, 800, 900, 1000], correctIndex: 2, explanation: "A 450 kétszerese: 2 × 450 = 900 Ft.", calc: "2*450", source: "teacher" },
    { prompt: "Mennyi a 360 fele?", options: [170, 720, 190, 180], correctIndex: 3, explanation: "A fele: 360 ÷ 2 = 180.", calc: "360/2", source: "teacher" },
    { prompt: "Mennyi a 245 kétszerese?", options: [480, 490, 445, 590], correctIndex: 1, explanation: "2 × 245 = 490, mert 2 × 200 = 400 és 2 × 45 = 90.", calc: "2*245", source: "teacher" },
    { prompt: "348 + 275 = ?", options: [613, 523, 623, 633], correctIndex: 2, explanation: "300 + 200 = 500 és 48 + 75 = 123, együtt 500 + 123 = 623.", calc: "348+275", source: "teacher" },
    { prompt: "702 − 358 = ?", options: [344, 354, 456, 444], correctIndex: 0, explanation: "702 − 358 = 344, ellenőrzés: 344 + 358 = 702.", calc: "702-358", source: "teacher" },
    { prompt: "Anna 500 Ft-tal fizet egy 320 Ft-os füzetért. Mennyi pénzt kap vissza? Hány Ft?", options: [280, 220, 820, 180], correctIndex: 3, explanation: "A visszajáró: 500 − 320 = 180 Ft.", calc: "500-320", source: "teacher" },
    { prompt: "Hány centiméter 3 méter?", options: [30, 300, 103, 3000], correctIndex: 1, explanation: "1 m = 100 cm, ezért 3 × 100 = 300 cm.", calc: "3*100", source: "teacher" },
    { prompt: "Hány perc 2 óra?", options: [100, 60, 120, 200], correctIndex: 2, explanation: "1 óra = 60 perc, ezért 2 × 60 = 120 perc.", calc: "2*60", source: "teacher" },
    { prompt: "Egy 1 méteres szalagból levágnak 35 cm-t. Hány cm maradt?", options: [65, 75, 35, 135], correctIndex: 0, explanation: "1 m = 100 cm, így 100 − 35 = 65 cm maradt.", calc: "1*100-35", source: "teacher" },
    { prompt: "A mesefilm 1 óra 25 perces. Hány perc ez összesen?", options: [125, 75, 95, 85], correctIndex: 3, explanation: "1 óra = 60 perc, így 60 + 25 = 85 perc.", calc: "1*60+25", source: "teacher" },
    { prompt: "Egy iskolába 386 lány és 417 fiú jár. Hány tanuló jár az iskolába?", options: [793, 803, 703, 813], correctIndex: 1, explanation: "386 + 417 = 803 tanuló.", calc: "386+417", source: "teacher" },
    { prompt: "Egy 240 oldalas könyvből Peti 165 oldalt már elolvasott. Hány oldal van még hátra?", options: [85, 125, 75, 405], correctIndex: 2, explanation: "240 − 165 = 75 oldal van még hátra.", calc: "240-165", source: "teacher" },
    { prompt: "Egy doboz ceruza 8 darabos. Hány ceruza van 9 dobozban?", options: [72, 63, 81, 64], correctIndex: 0, explanation: "Dobozonként 8, kilenc dobozban: 9 × 8 = 72 ceruza.", calc: "9*8", source: "teacher" },
    { prompt: "Egy gombóc fagyi 300 Ft. Mennyibe kerül 3 gombóc? Hány Ft?", options: [600, 330, 1200, 900], correctIndex: 3, explanation: "Gombóconként 300 Ft: 3 × 300 = 900 Ft.", calc: "3*300", source: "teacher" },
    { prompt: "48 ÷ 6 = ?", options: [6, 8, 7, 9], correctIndex: 1, explanation: "48 ÷ 6 = 8, mert 8 × 6 = 48.", calc: "48/6", source: "teacher" },
    { prompt: "Egy 90 cm-es lécet 10 egyenlő darabra vágnak. Hány cm hosszú egy darab?", options: [80, 10, 9, 900], correctIndex: 2, explanation: "90 ÷ 10 = 9 cm hosszú egy darab.", calc: "90/10", source: "teacher" },
    { prompt: "6 × 7 + 8 = ?", options: [50, 90, 56, 48], correctIndex: 0, explanation: "Előbb a szorzás: 6 × 7 = 42, majd 42 + 8 = 50.", calc: "6*7+8", source: "teacher" },
    { prompt: "Egy teremben 5 sorban 9-9 szék áll. 4 széket kivittek. Hány szék maradt?", options: [45, 36, 49, 41], correctIndex: 3, explanation: "5 × 9 = 45 szék volt, 45 − 4 = 41 szék maradt.", calc: "5*9-4", source: "teacher" },
  ],
  4: [
    { prompt: "Egy boltban 235 db füzet volt. Hozzáadtak még 147-et. Hány füzet lett?", options: [372, 382, 392, 402], correctIndex: 1, explanation: "235 + 147 = 382 füzet.", calc: "235+147", source: "teacher" },
    { prompt: "A sportnapon 640 métert futottak, ebből 275 métert már teljesítettek. Mennyi van még hátra?", options: [355, 365, 375, 385], correctIndex: 1, explanation: "640 - 275 = 365 méter van hátra.", calc: "640-275", source: "teacher" },
    { prompt: "9 csapatban csapatonként 14 tanuló van. Hány tanuló összesen?", options: [116, 126, 136, 146], correctIndex: 1, explanation: "Csapatonként 14, kilenc csapatban: 9 × 14 = 126 tanuló.", calc: "9*14", source: "teacher" },
    { prompt: "432 cukorkát 8 egyenlő csomagba osztanak. Hány cukorka jut egy csomagba?", options: [52, 53, 54, 55], correctIndex: 2, explanation: "432 ÷ 8 = 54 cukorka jut egy csomagba.", calc: "432/8", source: "teacher" },
    { prompt: "Egy túrán délelőtt 1860 lépést, délután 975 lépést tettek meg. Hány lépés összesen?", options: [2815, 2825, 2835, 2845], correctIndex: 2, explanation: "1860 + 975 = 2835 lépés.", calc: "1860+975", source: "teacher" },
    { prompt: "Egy iskolában 720 tanuló van, ebből 268 alsós. Hány felsős tanuló van?", options: [442, 452, 462, 472], correctIndex: 1, explanation: "720 - 268 = 452 felsős.", calc: "720-268", source: "teacher" },
    { prompt: "12 dobozban dobozonként 16 filctoll van. Hány filctoll összesen?", options: [182, 192, 202, 212], correctIndex: 1, explanation: "Dobozonként 16, tizenkét dobozban: 12 × 16 = 192 filctoll.", calc: "12*16", source: "teacher" },
    { prompt: "4500 Ft-od van. Veszel egy játékot 1750 Ft-ért és egy könyvet 980 Ft-ért. Mennyi pénzed marad?", options: [1670, 1770, 1870, 1970], correctIndex: 1, explanation: "Két vásárlás egymás után: 4500 - 1750 = 2750, majd 2750 - 980 = 1770 Ft.", calc: "4500-1750-980", source: "teacher" },
    { prompt: "A kiránduláson 156 fényképet készítettek hétfőn és 89-et kedden. Hány kép készült összesen?", options: [235, 245, 255, 265], correctIndex: 1, explanation: "156 + 89 = 245 kép.", calc: "156+89", source: "teacher" },
    { prompt: "Egy táskában 8 csomag ragasztólap van, mindegyikben 12 lap. Hány lap van összesen?", options: [84, 92, 96, 104], correctIndex: 2, explanation: "Csomagonként 12, nyolc csomagban: 8 × 12 = 96 lap.", calc: "8*12", source: "teacher" },
    { prompt: "A medence hossza 25 m. Anna kétszer oda-vissza úszik (oda és vissza = egy oda-vissza pár). Hány métert úszik összesen?", options: [50, 75, 100, 125], correctIndex: 2, explanation: "Egy oda-vissza 2 × 25 = 50 m; kétszer: 2 × 50 = 100 m.", calc: "2*2*25", source: "teacher" },
    { prompt: "3874 + 2569 = ?", options: [6343, 6443, 5443, 6433], correctIndex: 1, explanation: "3000 + 2000 = 5000 és 874 + 569 = 1443, együtt 5000 + 1443 = 6443.", calc: "3874+2569", source: "teacher" },
    { prompt: "8000 − 3645 = ?", options: [4465, 5645, 4355, 4365], correctIndex: 2, explanation: "8000 − 3645 = 4355, ellenőrzés: 4355 + 3645 = 8000.", calc: "8000-3645", source: "teacher" },
    { prompt: "Egy falunak 2750 lakosa volt, idén 386-tal nőtt a számuk. Hányan laknak most a faluban?", options: [3136, 3036, 3126, 2364], correctIndex: 0, explanation: "2750 + 386 = 3136 lakos.", calc: "2750+386", source: "teacher" },
    { prompt: "Egy 5000 m-es futóversenyből Bence már 3280 m-t teljesített. Hány méter van még hátra?", options: [1820, 2720, 8280, 1720], correctIndex: 3, explanation: "5000 − 3280 = 1720 m van még hátra.", calc: "5000-3280", source: "teacher" },
    { prompt: "47 × 6 = ?", options: [242, 282, 272, 312], correctIndex: 1, explanation: "40 × 6 = 240 és 7 × 6 = 42, együtt 240 + 42 = 282.", calc: "47*6", source: "teacher" },
    { prompt: "38 × 7 = ?", options: [216, 256, 266, 276], correctIndex: 2, explanation: "30 × 7 = 210 és 8 × 7 = 56, együtt 210 + 56 = 266.", calc: "38*7", source: "teacher" },
    { prompt: "Egy busz 54 utast szállít. Hány utast visz 8 fordulóban, ha mindig tele van?", options: [432, 402, 424, 442], correctIndex: 0, explanation: "8 × 54 = 8 × 50 + 8 × 4 = 400 + 32 = 432 utas.", calc: "8*54", source: "teacher" },
    { prompt: "Egy mozijegy 1250 Ft. Mennyibe kerül 4 jegy? Hány Ft?", options: [4800, 4250, 5250, 5000], correctIndex: 3, explanation: "4 × 1250 = 4 × 1000 + 4 × 250 = 4000 + 1000 = 5000 Ft.", calc: "4*1250", source: "teacher" },
    { prompt: "Egy csomagban 25 szem cukor van. Hány szem van 6 csomagban?", options: [125, 150, 145, 155], correctIndex: 1, explanation: "Csomagonként 25, hat csomagban: 6 × 25 = 150 szem.", calc: "6*25", source: "teacher" },
    { prompt: "96 ÷ 4 = ?", options: [22, 26, 24, 34], correctIndex: 2, explanation: "96 ÷ 4 = 24, mert 24 × 4 = 96.", calc: "96/4", source: "teacher" },
    { prompt: "84 ÷ 7 = ?", options: [12, 11, 13, 14], correctIndex: 0, explanation: "84 ÷ 7 = 12, mert 12 × 7 = 84.", calc: "84/7", source: "teacher" },
    { prompt: "Egy 144 oldalas könyvet 6 nap alatt olvasunk el, naponta ugyanannyit. Hány oldalt olvasunk naponta?", options: [22, 26, 28, 24], correctIndex: 3, explanation: "144 ÷ 6 = 24 oldal naponta, mert 24 × 6 = 144.", calc: "144/6", source: "teacher" },
    { prompt: "Mennyi a maradék, ha 47-et elosztjuk 5-tel?", options: [9, 2, 3, 7], correctIndex: 1, explanation: "47 ÷ 5 = 9, maradék 2, mert 9 × 5 = 45 és 47 − 45 = 2.", calc: "47-5*9", source: "teacher" },
    { prompt: "Maradékos osztás: 58 ÷ 8. Mennyi a hányados (a maradék nélkül)?", options: [8, 2, 7, 6], correctIndex: 2, explanation: "58 ÷ 8 = 7, maradék 2, mert 7 × 8 = 56 és 58 − 56 = 2.", calc: "(58-2)/8", source: "teacher" },
    { prompt: "Mennyi a maradék, ha 100-at elosztjuk 7-tel?", options: [2, 14, 3, 5], correctIndex: 0, explanation: "100 ÷ 7 = 14, maradék 2, mert 14 × 7 = 98 és 100 − 98 = 2.", calc: "100-7*14", source: "teacher" },
    { prompt: "30 gyereket 4 személyes csónakokba ültetnek. Legalább hány csónak kell, hogy mindenki beférjen?", options: [7, 2, 9, 8], correctIndex: 3, explanation: "30 ÷ 4 = 7, maradék 2; a maradék 2 gyereknek is kell egy csónak: 7 + 1 = 8.", calc: "(30-2)/4+1", source: "teacher" },
    { prompt: "Mennyi 36-nak az 1/4 része?", options: [12, 9, 8, 144], correctIndex: 1, explanation: "Negyed rész: 36 ÷ 4 = 9.", calc: "36/4", source: "teacher" },
    { prompt: "Egy 28 fős osztály 3/4 része fiú. Hány fiú jár az osztályba?", options: [7, 24, 21, 14], correctIndex: 2, explanation: "28 ÷ 4 = 7, ennek háromszorosa: 3 × 7 = 21 fiú.", calc: "28/4*3", source: "teacher" },
    { prompt: "Mennyi 60 percnek a 2/3 része? Hány perc?", options: [40, 20, 30, 45], correctIndex: 0, explanation: "60 ÷ 3 = 20, ennek kétszerese: 2 × 20 = 40 perc.", calc: "60/3*2", source: "teacher" },
    { prompt: "Egy téglalap oldalai 12 cm és 7 cm. Hány cm a kerülete?", options: [19, 84, 36, 38], correctIndex: 3, explanation: "K = 2 × (12 + 7) = 2 × 19 = 38 cm.", calc: "2*(12+7)", source: "teacher" },
    { prompt: "Egy négyzet oldala 9 cm. Hány cm a kerülete?", options: [18, 36, 81, 27], correctIndex: 1, explanation: "Négy egyenlő oldal: K = 4 × 9 = 36 cm.", calc: "4*9", source: "teacher" },
    { prompt: "Egy négyzet kerülete 48 cm. Hány cm az oldala?", options: [24, 16, 12, 8], correctIndex: 2, explanation: "Négy egyenlő oldal: 48 ÷ 4 = 12 cm.", calc: "48/4", source: "teacher" },
    { prompt: "Egy téglalap alakú kert 25 m hosszú és 14 m széles. Hány méter kerítés kell a körbekerítéséhez?", options: [78, 39, 350, 64], correctIndex: 0, explanation: "K = 2 × (25 + 14) = 2 × 39 = 78 m.", calc: "2*(25+14)", source: "teacher" },
    { prompt: "Hány méter 3 km?", options: [300, 30, 30000, 3000], correctIndex: 3, explanation: "1 km = 1000 m, ezért 3 × 1000 = 3000 m.", calc: "3*1000", source: "teacher" },
    { prompt: "Hány gramm 2 kg 350 g?", options: [2035, 2350, 235, 23500], correctIndex: 1, explanation: "1 kg = 1000 g, így 2 × 1000 + 350 = 2350 g.", calc: "2*1000+350", source: "teacher" },
    { prompt: "Hány deciliter 4 liter?", options: [400, 4, 40, 14], correctIndex: 2, explanation: "1 l = 10 dl, ezért 4 × 10 = 40 dl.", calc: "4*10", source: "teacher" },
    { prompt: "Egy 2 literes üvegből kitöltenek 5 dl üdítőt. Hány dl maradt az üvegben?", options: [15, 3, 25, 150], correctIndex: 0, explanation: "2 l = 2 × 10 = 20 dl, és 20 − 5 = 15 dl maradt.", calc: "2*10-5", source: "teacher" },
    { prompt: "Egy túraút 6 km 250 m hosszú. Hány méter ez?", options: [6025, 625, 62500, 6250], correctIndex: 3, explanation: "1 km = 1000 m, így 6 × 1000 + 250 = 6250 m.", calc: "6*1000+250", source: "teacher" },
    { prompt: "Anya 5000 Ft-tal fizet, a számla 3460 Ft. Mennyi pénzt kap vissza? Hány Ft?", options: [2540, 1540, 1640, 8460], correctIndex: 1, explanation: "A visszajáró: 5000 − 3460 = 1540 Ft.", calc: "5000-3460", source: "teacher" },
    { prompt: "Egy kirándulásra 8 busz megy, mindegyiken 45 gyerek ül. Hány gyerek utazik összesen?", options: [320, 380, 360, 400], correctIndex: 2, explanation: "Buszonként 45, nyolc buszon: 8 × 45 = 360 gyerek.", calc: "8*45", source: "teacher" },
  ],
  5: [
    { prompt: "Egy osztály 24 csapatban gyűjt pontot. Egy csapat 18 pontot, egy másik 27 pontot szerzett. Mennyi a két csapat pontjainak összege?", options: [43, 44, 45, 46], correctIndex: 2, explanation: "Csak a két csapat pontja kell: 18 + 27 = 45.", calc: "18+27", source: "teacher" },
    { prompt: "Egy táborban 36 gyerek van. A gyerekek 3/4-e megy kirándulni. Hány gyerek indul?", options: [24, 26, 27, 28], correctIndex: 2, explanation: "A 36 negyede 36 ÷ 4 = 9, ennek háromszorosa 3 × 9 = 27 gyerek.", calc: "36/4*3", source: "teacher" },
    { prompt: "Egy robotversenyen 1250 pontból 3 körben 285, 340 és 415 pontot szereztek. Mennyi pont maradt?", options: [190, 200, 210, 220], correctIndex: 2, explanation: "Először a három kör: 285 + 340 + 415 = 1040, majd 1250 - 1040 = 210 pont.", calc: "1250-(285+340+415)", source: "teacher" },
    { prompt: "48 darab LED-et 6 sorba rendeznek egyenlően. Hány LED jut egy sorba?", options: [6, 7, 8, 9], correctIndex: 2, explanation: "48 ÷ 6 = 8 LED jut egy sorba.", calc: "48/6", source: "teacher" },
    { prompt: "Egy pályán 28 akadály van. Minden 4. akadály után bónusz jár. Hány bónuszpont-hely van?", options: [6, 7, 8, 9], correctIndex: 1, explanation: "Minden 4. akadály után jár bónusz: 28 ÷ 4 = 7 hely.", calc: "28/4", source: "teacher" },
    { prompt: "A csapat 5600 XP-ből 2380 XP-t megszerzett hétfőn, és 1740 XP-t kedden. Mennyi hiányzik?", options: [1380, 1480, 1580, 1680], correctIndex: 1, explanation: "Két nap együtt: 2380 + 1740 = 4120, majd 5600 - 4120 = 1480 XP hiányzik.", calc: "5600-(2380+1740)", source: "teacher" },
    { prompt: "3 dobozban 24-24 kártya, és 2 dobozban 18-18 kártya van. Hány kártya összesen?", options: [98, 108, 118, 128], correctIndex: 1, explanation: "3 × 24 = 72 és 2 × 18 = 36, együtt 72 + 36 = 108 kártya.", calc: "3*24+2*18", source: "teacher" },
    { prompt: "Egy játékban 5 kör van. Körönként 12 pont jár, de minden kör végén 3 pont levonás van. Mennyi pont marad 5 kör után?", options: [40, 45, 50, 55], correctIndex: 1, explanation: "Körönként 12 - 3 = 9 pont marad, öt körben 5 × 9 = 45 pont.", calc: "5*(12-3)", source: "teacher" },
    { prompt: "Egy projekthez 144 lapot nyomtattak, ebből 37-et már összefűztek. Hány lap maradt még?", options: [105, 107, 109, 111], correctIndex: 1, explanation: "144 - 37 = 107 lap maradt.", calc: "144-37", source: "teacher" },
    { prompt: "15 diák mindegyike 8 pontot szerzett a feleletválaszos körben. Hány pont az összesen?", options: [110, 115, 120, 125], correctIndex: 2, explanation: "Fejenként 8 pont, tizenöt diák: 15 × 8 = 120 pont.", calc: "15*8", source: "teacher" },
    { prompt: "Egy tábori versenyen 2,5 km-t kellett futni. Zoli már lefutotta 0,8 km-t. Hány km van még hátra?", options: [1.5, 1.6, 1.7, 1.8], correctIndex: 2, explanation: "2,5 - 0,8 = 1,7 km van még hátra.", calc: "2.5-0.8", source: "teacher" },
    { prompt: "250 000 + 175 000 = ?", options: [325000, 425000, 415000, 4250000], correctIndex: 1, explanation: "250 000 + 175 000 = 425 000.", calc: "250000+175000", source: "teacher" },
    { prompt: "Egy stadionba 48 000 néző fér. A meccsen 36 500-an voltak. Hány hely maradt üresen?", options: [12500, 12000, 11500, 84500], correctIndex: 2, explanation: "48 000 − 36 500 = 11 500 üres hely.", calc: "48000-36500", source: "teacher" },
    { prompt: "Mennyi marad, ha egymillióból elveszünk 1-et?", options: [999999, 99999, 9999999, 999000], correctIndex: 0, explanation: "1 000 000 − 1 = 999 999.", calc: "1000000-1", source: "teacher" },
    { prompt: "3,75 + 2,4 = ?", options: [5.79, 6.79, 6.05, 6.15], correctIndex: 3, explanation: "Helyi érték szerint egymás alá: 3,75 + 2,40 = 6,15.", calc: "3.75+2.4", source: "teacher" },
    { prompt: "10 − 3,6 = ?", options: [7.4, 6.4, 7.6, 6.6], correctIndex: 1, explanation: "10 − 3,6 = 6,4, ellenőrzés: 6,4 + 3,6 = 10.", calc: "10-3.6", source: "teacher" },
    { prompt: "Lili 5,2 kg almát és 2,85 kg körtét vett. Hány kg gyümölcsöt vett összesen?", options: [7.37, 7.05, 8.05, 8.5], correctIndex: 2, explanation: "5,20 + 2,85 = 8,05 kg gyümölcs.", calc: "5.2+2.85", source: "teacher" },
    { prompt: "Egy 12,5 m-es kötélből levágnak 4,75 m-t. Hány méter marad?", options: [7.75, 8.25, 8.75, 7.25], correctIndex: 0, explanation: "12,50 − 4,75 = 7,75 m marad.", calc: "12.5-4.75", source: "teacher" },
    { prompt: "3,47 × 100 = ?", options: [34.7, 3470, 0.347, 347], correctIndex: 3, explanation: "100-zal szorozva a tizedesvessző 2 hellyel jobbra lép: 3,47 × 100 = 347.", calc: "3.47*100", source: "teacher" },
    { prompt: "56 ÷ 1000 = ?", options: [0.56, 0.056, 5.6, 56000], correctIndex: 1, explanation: "1000-rel osztva a tizedesvessző 3 hellyel balra lép: 56 ÷ 1000 = 0,056.", calc: "56/1000", source: "teacher" },
    { prompt: "2,8 × 10 = ?", options: [280, 2.8, 28, 0.28], correctIndex: 2, explanation: "10-zel szorozva a tizedesvessző 1 hellyel jobbra lép: 2,8 × 10 = 28.", calc: "2.8*10", source: "teacher" },
    { prompt: "450 ÷ 100 = ?", options: [4.5, 45, 0.45, 4500], correctIndex: 0, explanation: "100-zal osztva a tizedesvessző 2 hellyel balra lép: 450 ÷ 100 = 4,5.", calc: "450/100", source: "teacher" },
    { prompt: "100 radír együtt 4500 Ft-ba kerül. Hány Ft egy radír?", options: [450, 4.5, 4400, 45], correctIndex: 3, explanation: "Egy radír ára: 4500 ÷ 100 = 45 Ft.", calc: "4500/100", source: "teacher" },
    { prompt: "Mennyi 45-nek a 2/3 része?", options: [15, 30, 35, 90], correctIndex: 1, explanation: "45 ÷ 3 = 15, ennek kétszerese: 2 × 15 = 30.", calc: "45/3*2", source: "teacher" },
    { prompt: "Tomi egy 240 oldalas könyv 3/8 részét olvasta el. Hány oldalt olvasott el?", options: [80, 150, 90, 30], correctIndex: 2, explanation: "240 ÷ 8 = 30, ennek háromszorosa: 3 × 30 = 90 oldal.", calc: "240/8*3", source: "teacher" },
    { prompt: "Egy 1200 Ft-os könyv árát a negyedével csökkentik. Mennyi az új ár? Hány Ft?", options: [900, 300, 1196, 800], correctIndex: 0, explanation: "A csökkentés 1200 ÷ 4 = 300 Ft, az új ár 1200 − 300 = 900 Ft.", calc: "1200-1200/4", source: "teacher" },
    { prompt: "Egy téglalap oldalai 8 cm és 6 cm. Hány cm² a területe?", options: [28, 14, 24, 48], correctIndex: 3, explanation: "T = 8 × 6 = 48 cm².", calc: "8*6", source: "teacher" },
    { prompt: "Egy négyzet oldala 7 cm. Hány cm² a területe?", options: [28, 49, 14, 56], correctIndex: 1, explanation: "T = 7 × 7 = 49 cm².", calc: "7*7", source: "teacher" },
    { prompt: "Egy téglalap alakú szoba 5 m hosszú és 4 m széles. Hány m² a padlója?", options: [18, 9, 20, 40], correctIndex: 2, explanation: "T = 5 × 4 = 20 m².", calc: "5*4", source: "teacher" },
    { prompt: "Egy téglalap területe 54 cm², egyik oldala 9 cm. Hány cm a másik oldala?", options: [6, 45, 7, 63], correctIndex: 0, explanation: "54 ÷ 9 = 6 cm, mert 9 × 6 = 54.", calc: "54/9", source: "teacher" },
    { prompt: "Egy négyzet kerülete 36 cm. Hány cm² a területe?", options: [36, 144, 9, 81], correctIndex: 3, explanation: "Az oldal 36 ÷ 4 = 9 cm, a terület 9 × 9 = 81 cm².", calc: "(36/4)^2", source: "teacher" },
    { prompt: "Egy téglalap alakú telek oldalai 15 m és 8 m. Hány méter a kerülete?", options: [23, 46, 120, 38], correctIndex: 1, explanation: "K = 2 × (15 + 8) = 2 × 23 = 46 m.", calc: "2*(15+8)", source: "teacher" },
    { prompt: "Mennyi a 12, a 15 és a 18 átlaga?", options: [14, 16, 15, 45], correctIndex: 2, explanation: "(12 + 15 + 18) ÷ 3 = 45 ÷ 3 = 15.", calc: "(12+15+18)/3", source: "teacher" },
    { prompt: "Zsófi jegyei: 5, 4, 3 és 4. Mennyi a jegyeinek átlaga?", options: [4, 3.5, 4.5, 16], correctIndex: 0, explanation: "(5 + 4 + 3 + 4) ÷ 4 = 16 ÷ 4 = 4.", calc: "(5+4+3+4)/4", source: "teacher" },
    { prompt: "Négy nap alatt 20, 24, 18 és 26 mm eső esett. Mennyi volt a napi átlag? Hány mm?", options: [21, 23, 88, 22], correctIndex: 3, explanation: "(20 + 24 + 18 + 26) ÷ 4 = 88 ÷ 4 = 22 mm.", calc: "(20+24+18+26)/4", source: "teacher" },
    { prompt: "Reggel −4 °C volt, délre 9 fokkal melegebb lett. Hány °C volt délben?", options: [13, 5, -13, -5], correctIndex: 1, explanation: "−4 + 9 = 5 °C volt délben.", calc: "-4+9", source: "teacher" },
    { prompt: "Este 3 °C volt, éjjelre 8 fokkal hűlt le a levegő. Hány °C lett éjjel?", options: [5, 11, -5, -11], correctIndex: 2, explanation: "3 − 8 = −5 °C lett éjjel.", calc: "3-8", source: "teacher" },
    { prompt: "Hány fokkal melegebb az 5 °C, mint a −6 °C?", options: [11, 1, -1, -11], correctIndex: 0, explanation: "5 − (−6) = 5 + 6 = 11 fokkal melegebb.", calc: "5-(-6)", source: "teacher" },
    { prompt: "Egy kocka éle 4 cm. Hány cm³ a térfogata?", options: [16, 48, 96, 64], correctIndex: 3, explanation: "V = 4 × 4 × 4 = 64 cm³.", calc: "4^3", source: "teacher" },
    { prompt: "Egy téglatest élei 5 cm, 3 cm és 2 cm. Hány cm³ a térfogata?", options: [10, 30, 31, 62], correctIndex: 1, explanation: "V = 5 × 3 × 2 = 30 cm³.", calc: "5*3*2", source: "teacher" },
    { prompt: "Egy akvárium 50 cm hosszú, 30 cm széles és 20 cm magas. Hány cm³ víz fér bele színültig?", options: [3000, 300000, 30000, 100], correctIndex: 2, explanation: "V = 50 × 30 × 20 = 30 000 cm³.", calc: "50*30*20", source: "teacher" },
  ],
  6: [
    { prompt: "Mennyi 3/4 + 1/2? Add meg tizedes törtként!", options: [0.8, 1.25, 1.5, 1], correctIndex: 1, explanation: "Közös nevező 4: 3/4 + 2/4 = 5/4 = 1,25.", calc: "3/4+1/2", source: "teacher" },
    { prompt: "Mennyi 5/8 − 1/4? Add meg tizedes törtként!", options: [0.375, 1, 0.25, 0.5], correctIndex: 0, explanation: "Közös nevező 8: 5/8 − 2/8 = 3/8 = 3 ÷ 8 = 0,375.", calc: "5/8-1/4", source: "teacher" },
    { prompt: "Mennyi 2/5 + 3/10? Add meg tizedes törtként!", options: [0.5, 0.33, 0.7, 0.6], correctIndex: 2, explanation: "Közös nevező 10: 4/10 + 3/10 = 7/10 = 0,7.", calc: "2/5+3/10", source: "teacher" },
    { prompt: "Mennyi 3/4 · 2/5? Add meg tizedes törtként!", options: [0.5, 1.15, 0.6, 0.3], correctIndex: 3, explanation: "Számláló × számláló, nevező × nevező: 3/4 × 2/5 = 6/20 = 0,3.", calc: "3/4*2/5", source: "teacher" },
    { prompt: "Mennyi 1/2 : 1/4?", options: [0.125, 2, 0.5, 4], correctIndex: 1, explanation: "Törttel úgy osztunk, hogy a reciprokával szorzunk: 1/2 ÷ 1/4 = 1/2 × 4 = 2.", calc: "(1/2)/(1/4)", source: "teacher" },
    { prompt: "Mennyi 2 egész 1/2 + 1 egész 3/4? Add meg tizedes törtként!", options: [3.5, 3.75, 4.5, 4.25], correctIndex: 3, explanation: "2 1/2 = 2,5 és 1 3/4 = 1,75, így 2,5 + 1,75 = 4,25.", calc: "2+1/2+1+3/4", source: "teacher" },
    { prompt: "Mennyi a 60 kg 3/5 része (kg-ban)?", options: [36, 12, 40, 100], correctIndex: 0, explanation: "Egyötöde 60 ÷ 5 = 12 kg, háromötöde 12 × 3 = 36 kg.", calc: "60/5*3", source: "teacher" },
    { prompt: "Egy 72 oldalas könyv 5/8 részét olvasta el Anna. Hány oldalt olvasott el?", options: [40, 54, 45, 27], correctIndex: 2, explanation: "Egynyolcad: 72 ÷ 8 = 9 oldal, ötnyolcad: 9 × 5 = 45 oldal.", calc: "72/8*5", source: "teacher" },
    { prompt: "Egy 1,2 m-es léc 3/4 részét levágjuk. Hány méter a levágott rész?", options: [0.3, 0.9, 0.8, 1.6], correctIndex: 1, explanation: "Egynegyed: 1,2 ÷ 4 = 0,3 m, háromnegyed: 0,3 × 3 = 0,9 m.", calc: "1.2/4*3", source: "teacher" },
    { prompt: "Egy osztály 28 tanulójának 2/7 része szemüveges. Hány szemüveges tanuló van?", options: [7, 14, 20, 8], correctIndex: 3, explanation: "Egyheted: 28 ÷ 7 = 4 tanuló, kétheted: 4 × 2 = 8 tanuló.", calc: "28/7*2", source: "teacher" },
    { prompt: "Mennyi 2,4 · 0,5?", options: [12, 1.2, 0.12, 4.8], correctIndex: 1, explanation: "0,5-tel szorozni annyi, mint felezni: 2,4 × 0,5 = 2,4 ÷ 2 = 1,2.", calc: "2.4*0.5", source: "teacher" },
    { prompt: "Mennyi 0,6 · 0,7?", options: [4.2, 0.042, 0.42, 1.3], correctIndex: 2, explanation: "6 × 7 = 42, és összesen két tizedesjegy kell: 0,6 × 0,7 = 0,42.", calc: "0.6*0.7", source: "teacher" },
    { prompt: "Mennyi 4,8 : 0,6?", options: [8, 0.8, 80, 2.88], correctIndex: 0, explanation: "Mindkét számot 10-zel szorozva: 48 ÷ 6 = 8.", calc: "4.8/0.6", source: "teacher" },
    { prompt: "Mennyi 7,5 : 2,5?", options: [0.3, 5, 18.75, 3], correctIndex: 3, explanation: "Mindkét számot 10-zel szorozva: 75 ÷ 25 = 3.", calc: "7.5/2.5", source: "teacher" },
    { prompt: "1 kg alma 450 Ft. Hány forintba kerül 2,4 kg alma?", options: [1800, 1080, 900, 1180], correctIndex: 1, explanation: "450 × 2,4 = 450 × 2 + 450 × 0,4 = 900 + 180 = 1080 Ft.", calc: "450*2.4", source: "teacher" },
    { prompt: "Egy 3,6 m hosszú szalagot 0,4 m-es darabokra vágunk. Hány darab lesz?", options: [90, 0.9, 9, 1.44], correctIndex: 2, explanation: "3,6 ÷ 0,4 = 36 ÷ 4 = 9 darab.", calc: "3.6/0.4", source: "teacher" },
    { prompt: "Mennyi 80-nak a 25%-a?", options: [20, 25, 32, 55], correctIndex: 0, explanation: "25% = negyedrész: 80 × 25 ÷ 100 = 80 ÷ 4 = 20.", calc: "80*25/100", source: "teacher" },
    { prompt: "Mennyi 240-nek a 10%-a?", options: [2.4, 10, 230, 24], correctIndex: 3, explanation: "10% = tizedrész: 240 ÷ 10 = 24.", calc: "240*10/100", source: "teacher" },
    { prompt: "Egy 3600 Ft-os pólóra 20% kedvezményt adnak. Hány forint a kedvezmény?", options: [180, 720, 2880, 72], correctIndex: 1, explanation: "3600 × 20 ÷ 100 = 36 × 20 = 720 Ft a kedvezmény.", calc: "3600*20/100", source: "teacher" },
    { prompt: "Mennyi 150-nek az 50%-a?", options: [50, 100, 75, 300], correctIndex: 2, explanation: "50% = fele: 150 ÷ 2 = 75.", calc: "150*50/100", source: "teacher" },
    { prompt: "Egy 25 fős osztály tanulóinak 60%-a lány. Hány lány van az osztályban?", options: [10, 16, 60, 15], correctIndex: 3, explanation: "25 × 60 ÷ 100 = 1500 ÷ 100 = 15 lány.", calc: "25*60/100", source: "teacher" },
    { prompt: "Hány százaléka 12 a 48-nak?", options: [25, 4, 36, 400], correctIndex: 0, explanation: "12 ÷ 48 = 0,25, és 0,25 × 100 = 25%.", calc: "12/48*100", source: "teacher" },
    { prompt: "Melyik számjegy írható a 4_2 háromjegyű szám üres helyére, hogy a szám osztható legyen 9-cel?", options: [9, 3, 6, 1], correctIndex: 1, explanation: "9-cel osztható, ha a számjegyek összege osztható 9-cel: 4 + 3 + 2 = 9, tehát 9 − 4 − 2 = 3.", calc: "9-4-2", source: "teacher" },
    { prompt: "Mennyi a maradék, ha 250-et elosztjuk 7-tel?", options: [35, 3, 5, 6], correctIndex: 2, explanation: "250 ÷ 7 = 35, maradék 5: 7 × 35 = 245, és 250 − 245 = 5.", calc: "mod(250,7)", source: "teacher" },
    { prompt: "Mennyi 12 és 18 legnagyobb közös osztója (LNKO)?", options: [6, 36, 3, 216], correctIndex: 0, explanation: "12 = 2² × 3 és 18 = 2 × 3², a közös prímtényezők: 2 × 3 = 6.", calc: "2*3", source: "teacher" },
    { prompt: "Mennyi 8 és 12 legkisebb közös többszöröse (LKKT)?", options: [4, 96, 48, 24], correctIndex: 3, explanation: "8 = 2³ és 12 = 2² × 3, minden prímtényező a legnagyobb kitevőn: 2³ × 3 = 24.", calc: "2*2*2*3", source: "teacher" },
    { prompt: "Mennyi 24 és 36 LNKO-ja?", options: [6, 12, 72, 4], correctIndex: 1, explanation: "24 = 2³ × 3 és 36 = 2² × 3², közös rész: 2² × 3 = 12.", calc: "2*2*3", source: "teacher" },
    { prompt: "Mennyi 6 és 15 LKKT-ja?", options: [3, 90, 30, 21], correctIndex: 2, explanation: "6 = 2 × 3 és 15 = 3 × 5, így LKKT = 2 × 3 × 5 = 30.", calc: "2*3*5", source: "teacher" },
    { prompt: "Két busz 12, illetve 18 percenként indul. Most együtt indultak. Hány perc múlva indulnak újra együtt?", options: [30, 216, 6, 36], correctIndex: 3, explanation: "LKKT(12; 18): 12 = 2² × 3, 18 = 2 × 3², így 2² × 3² = 36 perc.", calc: "2*2*3*3", source: "teacher" },
    { prompt: "42 almát és 56 körtét osztunk szét maradék nélkül. Legfeljebb hány egyforma csomag készülhet?", options: [14, 7, 98, 28], correctIndex: 0, explanation: "LNKO(42; 56): 42 = 2 × 3 × 7, 56 = 2³ × 7, közös rész 2 × 7 = 14 csomag.", calc: "2*7", source: "teacher" },
    { prompt: "56 szem cukrot 3 : 5 arányban osztanak el két testvér között. Hány szem a nagyobb rész?", options: [21, 35, 28, 40], correctIndex: 1, explanation: "Összesen 3 + 5 = 8 rész, egy rész 56 ÷ 8 = 7, a nagyobb rész 5 × 7 = 35 szem.", calc: "56/(3+5)*5", source: "teacher" },
    { prompt: "Egy 45 cm-es szalagot 4 : 5 arányban vágunk ketté. Hány cm a rövidebb darab?", options: [25, 36, 20, 9], correctIndex: 2, explanation: "Összesen 4 + 5 = 9 rész, egy rész 45 ÷ 9 = 5 cm, a rövidebb 4 × 5 = 20 cm.", calc: "45/(4+5)*4", source: "teacher" },
    { prompt: "Egy csoportban a fiúk és lányok aránya 2 : 3, összesen 30-an vannak. Hány lány van?", options: [12, 20, 15, 18], correctIndex: 3, explanation: "Összesen 2 + 3 = 5 rész, egy rész 30 ÷ 5 = 6 fő, a lányok 3 × 6 = 18-an vannak.", calc: "30/(2+3)*3", source: "teacher" },
    { prompt: "Mennyi (−7) + 12?", options: [5, -19, 19, -5], correctIndex: 0, explanation: "(−7) + 12 = 12 − 7 = 5.", calc: "(-7)+12", source: "teacher" },
    { prompt: "Mennyi −8 − 6?", options: [-2, 14, 2, -14], correctIndex: 3, explanation: "−8-ból még 6-ot lefelé lépünk: −8 − 6 = −14.", calc: "-8-6", source: "teacher" },
    { prompt: "Mennyi 5 − (−9)?", options: [-4, 14, 4, -14], correctIndex: 1, explanation: "Negatív szám kivonása = hozzáadás: 5 − (−9) = 5 + 9 = 14.", calc: "5-(-9)", source: "teacher" },
    { prompt: "Reggel −4 °C volt, délre 9 °C-kal melegebb lett. Hány °C volt délben?", options: [13, -13, 5, -5], correctIndex: 2, explanation: "−4 + 9 = 5 °C.", calc: "-4+9", source: "teacher" },
    { prompt: "Egy háromszög egyik oldala 12 cm, a hozzá tartozó magasság 7 cm. Hány cm² a területe?", options: [84, 42, 19, 38], correctIndex: 1, explanation: "T = oldal × magasság ÷ 2 = 12 × 7 ÷ 2 = 84 ÷ 2 = 42 cm².", calc: "12*7/2", source: "teacher" },
    { prompt: "Egy derékszögű háromszög befogói 8 cm és 5 cm. Hány cm² a területe?", options: [40, 13, 26, 20], correctIndex: 3, explanation: "T = befogó × befogó ÷ 2 = 8 × 5 ÷ 2 = 20 cm².", calc: "8*5/2", source: "teacher" },
    { prompt: "Mennyi a 4, 7, 9 és 12 számok átlaga?", options: [8, 32, 7.5, 9], correctIndex: 0, explanation: "Összeg: 4 + 7 + 9 + 12 = 32, átlag: 32 ÷ 4 = 8.", calc: "(4+7+9+12)/4", source: "teacher" },
    { prompt: "Peti jegyei: 5, 4, 3, 5, 4, 3. Mennyi a jegyeinek átlaga?", options: [3.5, 4.5, 4, 24], correctIndex: 2, explanation: "Összeg: 5 + 4 + 3 + 5 + 4 + 3 = 24, átlag: 24 ÷ 6 = 4.", calc: "(5+4+3+5+4+3)/6", source: "teacher" },
  ],
  7: [
    { prompt: "Mennyi (−6) · 7?", options: [42, -13, -42, 1], correctIndex: 2, explanation: "Negatív × pozitív = negatív: (−6) × 7 = −42.", calc: "(-6)*7", source: "teacher" },
    { prompt: "Mennyi (−8) · (−5)?", options: [-40, 40, -13, 13], correctIndex: 1, explanation: "Negatív × negatív = pozitív: (−8) × (−5) = 40.", calc: "(-8)*(-5)", source: "teacher" },
    { prompt: "Mennyi (−72) : 9?", options: [-8, 8, -63, -81], correctIndex: 0, explanation: "Negatív ÷ pozitív = negatív: (−72) ÷ 9 = −8.", calc: "(-72)/9", source: "teacher" },
    { prompt: "Mennyi (−56) : (−7)?", options: [-8, -49, 49, 8], correctIndex: 3, explanation: "Negatív ÷ negatív = pozitív: (−56) ÷ (−7) = 8.", calc: "(-56)/(-7)", source: "teacher" },
    { prompt: "Mennyi (−3) · 4 − (−10)?", options: [-22, -2, 2, 22], correctIndex: 1, explanation: "Előbb szorzás: (−3) × 4 = −12, majd −12 − (−10) = −12 + 10 = −2.", calc: "(-3)*4-(-10)", source: "teacher" },
    { prompt: "Mennyi (−24) : 6 + (−5)?", options: [1, -1, -9, 9], correctIndex: 2, explanation: "Előbb osztás: (−24) ÷ 6 = −4, majd −4 + (−5) = −9.", calc: "(-24)/6+(-5)", source: "teacher" },
    { prompt: "Mennyi (−2)³?", options: [8, -6, 6, -8], correctIndex: 3, explanation: "(−2)³ = (−2) × (−2) × (−2) = 4 × (−2) = −8.", calc: "(-2)^3", source: "teacher" },
    { prompt: "Mennyi 3⁴?", options: [81, 12, 64, 27], correctIndex: 0, explanation: "3⁴ = 3 × 3 × 3 × 3 = 9 × 9 = 81.", calc: "3^4", source: "teacher" },
    { prompt: "Mennyi (−3)²?", options: [-9, -6, 9, 6], correctIndex: 2, explanation: "(−3)² = (−3) × (−3) = 9, páros kitevőnél az eredmény pozitív.", calc: "(-3)^2", source: "teacher" },
    { prompt: "Mennyi −3²? (Zárójel nélkül előbb hatványozunk, csak utána jön az előjel.)", options: [9, -9, -6, 6], correctIndex: 1, explanation: "−3² = −(3 × 3) = −9, mert a hatvány csak a 3-ra vonatkozik.", calc: "-(3^2)", source: "teacher" },
    { prompt: "Mennyi 2⁵ − 5²?", options: [0, 10, -7, 7], correctIndex: 3, explanation: "2⁵ = 2 × 2 × 2 × 2 × 2 = 32 és 5² = 25, így 32 − 25 = 7.", calc: "2^5-5^2", source: "teacher" },
    { prompt: "Mennyi 10³ : 10?", options: [100, 1, 30, 1000], correctIndex: 0, explanation: "10³ = 1000, és 1000 ÷ 10 = 100.", calc: "10^3/10", source: "teacher" },
    { prompt: "Egy 2000 Ft-os könyv ára 15%-kal nőtt. Hány forint az új ár?", options: [2150, 2300, 1700, 2015], correctIndex: 1, explanation: "Az emelés 2000 × 15 ÷ 100 = 300 Ft, az új ár 2000 + 300 = 2300 Ft.", calc: "2000*(1+15/100)", source: "teacher" },
    { prompt: "Egy 8000 Ft-os cipő árát 25%-kal csökkentik. Hány forint az új ár?", options: [7975, 10000, 6000, 2000], correctIndex: 2, explanation: "A csökkenés 8000 ÷ 4 = 2000 Ft, az új ár 8000 − 2000 = 6000 Ft.", calc: "8000*(1-25/100)", source: "teacher" },
    { prompt: "Egy 40 fős kórus létszáma 10%-kal nőtt. Hány fős lett a kórus?", options: [50, 36, 41, 44], correctIndex: 3, explanation: "40 × 10 ÷ 100 = 4 fővel nőtt, így 40 + 4 = 44 fő.", calc: "40*1.1", source: "teacher" },
    { prompt: "Egy 500 g-os csomag tömege 20%-kal kisebb lett. Hány gramm most?", options: [400, 480, 600, 100], correctIndex: 0, explanation: "500 × 20 ÷ 100 = 100 g a csökkenés, így 500 − 100 = 400 g.", calc: "500*(1-20/100)", source: "teacher" },
    { prompt: "Egy ár 1200 Ft-ról 1500 Ft-ra nőtt. Hány százalékos az emelés?", options: [20, 30, 25, 300], correctIndex: 2, explanation: "A növekmény 1500 − 1200 = 300 Ft, és 300 ÷ 1200 = 0,25, azaz 25%.", calc: "(1500-1200)/1200*100", source: "teacher" },
    { prompt: "Oldd meg: 4x + 7 = 31. Mennyi x?", options: [9.5, 24, 6, 8], correctIndex: 2, explanation: "4x = 31 − 7 = 24, így x = 24 ÷ 4 = 6.", calc: "(31-7)/4", source: "teacher" },
    { prompt: "Oldd meg: 5x − 8 = 27. Mennyi x?", options: [3.8, 7, 35, 19], correctIndex: 1, explanation: "5x = 27 + 8 = 35, így x = 35 ÷ 5 = 7.", calc: "(27+8)/5", source: "teacher" },
    { prompt: "Oldd meg: x : 4 + 3 = 9. Mennyi x?", options: [1.5, 48, 15, 24], correctIndex: 3, explanation: "x ÷ 4 = 9 − 3 = 6, így x = 6 × 4 = 24.", calc: "(9-3)*4", source: "teacher" },
    { prompt: "Oldd meg: 2x − 9 = −1. Mennyi x?", options: [4, -5, 5, -4], correctIndex: 0, explanation: "2x = −1 + 9 = 8, így x = 8 ÷ 2 = 4.", calc: "(-1+9)/2", source: "teacher" },
    { prompt: "Oldd meg: 7x = 3x + 20. Mennyi x?", options: [2, 4, 20, 5], correctIndex: 3, explanation: "7x − 3x = 20, azaz 4x = 20, így x = 20 ÷ 4 = 5.", calc: "20/(7-3)", source: "teacher" },
    { prompt: "Egy számot megszorzunk 6-tal, majd kivonunk belőle 4-et, így 38-at kapunk. Melyik ez a szám?", options: [6, 7, 42, 9], correctIndex: 1, explanation: "6 × szám = 38 + 4 = 42, így a szám 42 ÷ 6 = 7.", calc: "(38+4)/6", source: "teacher" },
    { prompt: "3 kg alma 870 Ft. Hány forintba kerül 5 kg ugyanilyen alma?", options: [1450, 1740, 1160, 1305], correctIndex: 0, explanation: "1 kg ára 870 ÷ 3 = 290 Ft, 5 kg ára 290 × 5 = 1450 Ft.", calc: "870/3*5", source: "teacher" },
    { prompt: "Egy autó 4 óra alatt 280 km-t tesz meg. Hány km-t tesz meg ugyanekkora sebességgel 7 óra alatt?", options: [420, 560, 490, 350], correctIndex: 2, explanation: "1 óra alatt 280 ÷ 4 = 70 km, 7 óra alatt 70 × 7 = 490 km.", calc: "280/4*7", source: "teacher" },
    { prompt: "6 füzet ára 1080 Ft. Hány forint 9 ugyanilyen füzet ára?", options: [1440, 1800, 1260, 1620], correctIndex: 3, explanation: "1 füzet 1080 ÷ 6 = 180 Ft, 9 füzet 180 × 9 = 1620 Ft.", calc: "1080/6*9", source: "teacher" },
    { prompt: "Egy nyomtató 5 perc alatt 120 lapot nyomtat. Hány lapot nyomtat 12 perc alatt?", options: [240, 288, 300, 50], correctIndex: 1, explanation: "1 perc alatt 120 ÷ 5 = 24 lap, 12 perc alatt 24 × 12 = 288 lap.", calc: "120/5*12", source: "teacher" },
    { prompt: "Egy paralelogramma egyik oldala 9 cm, a hozzá tartozó magasság 6 cm. Hány cm² a területe?", options: [27, 30, 54, 15], correctIndex: 2, explanation: "T = oldal × magasság = 9 × 6 = 54 cm².", calc: "9*6", source: "teacher" },
    { prompt: "Egy trapéz párhuzamos oldalai 10 cm és 6 cm, magassága 5 cm. Hány cm² a területe?", options: [40, 80, 21, 300], correctIndex: 0, explanation: "T = (a + c) × m ÷ 2 = (10 + 6) × 5 ÷ 2 = 80 ÷ 2 = 40 cm².", calc: "(10+6)*5/2", source: "teacher" },
    { prompt: "Egy trapéz alapjai 14 m és 8 m, magassága 4 m. Hány m² a területe?", options: [88, 26, 448, 44], correctIndex: 3, explanation: "T = (14 + 8) × 4 ÷ 2 = 22 × 2 = 44 m².", calc: "(14+8)*4/2", source: "teacher" },
    { prompt: "Egy paralelogramma területe 72 cm², egyik oldala 12 cm. Hány cm a hozzá tartozó magasság?", options: [60, 6, 84, 3], correctIndex: 1, explanation: "T = a × m, így m = 72 ÷ 12 = 6 cm.", calc: "72/12", source: "teacher" },
    { prompt: "Egy rombusz átlói 10 cm és 6 cm. Hány cm² a területe?", options: [60, 16, 30, 32], correctIndex: 2, explanation: "T = e × f ÷ 2 = 10 × 6 ÷ 2 = 30 cm².", calc: "10*6/2", source: "teacher" },
    { prompt: "Egy háromszög két szöge 48° és 75°. Hány fokos a harmadik szöge?", options: [57, 123, 67, 47], correctIndex: 0, explanation: "A belső szögek összege 180°: 180° − 48° − 75° = 57°.", calc: "180-48-75", source: "teacher" },
    { prompt: "Egy egyenlő szárú háromszög alapon fekvő szögei 70°-osak. Hány fokos a szárszög?", options: [110, 70, 20, 40], correctIndex: 3, explanation: "180° − 2 × 70° = 180° − 140° = 40°.", calc: "180-2*70", source: "teacher" },
    { prompt: "Egy derékszögű háromszög egyik hegyesszöge 34°. Hány fokos a másik hegyesszöge?", options: [146, 56, 66, 46], correctIndex: 1, explanation: "A két hegyesszög összege 90°: 90° − 34° = 56°.", calc: "90-34", source: "teacher" },
    { prompt: "Egy háromszög szögeinek aránya 1 : 2 : 3. Hány fokos a legnagyobb szöge?", options: [60, 120, 90, 30], correctIndex: 2, explanation: "1 + 2 + 3 = 6 rész, egy rész 180° ÷ 6 = 30°, a legnagyobb 3 × 30° = 90°.", calc: "180/(1+2+3)*3", source: "teacher" },
    { prompt: "Egy háromszög egyik külső szöge 130°. Hány fokos a mellette fekvő belső szög?", options: [130, 230, 40, 50], correctIndex: 3, explanation: "A külső és a mellette fekvő belső szög összege 180°: 180° − 130° = 50°.", calc: "180-130", source: "teacher" },
    { prompt: "Mennyi 18 − 6 · 2 + 4?", options: [28, 10, -18, 20], correctIndex: 1, explanation: "Előbb szorzás: 6 × 2 = 12, majd balról jobbra: 18 − 12 + 4 = 10.", calc: "18-6*2+4", source: "teacher" },
    { prompt: "Mennyi 48 : 6 · 2?", options: [16, 4, 8, 96], correctIndex: 0, explanation: "Azonos rangú műveletek balról jobbra: 48 ÷ 6 = 8, majd 8 × 2 = 16.", calc: "48/6*2", source: "teacher" },
    { prompt: "Mennyi (5 − 9) · 3 + 20 : 4?", options: [-2, 17, -7, -17], correctIndex: 2, explanation: "Zárójel: 5 − 9 = −4; szorzás, osztás: −4 × 3 = −12 és 20 ÷ 4 = 5; végül −12 + 5 = −7.", calc: "(5-9)*3+20/4", source: "teacher" },
    { prompt: "Mennyi 2 · 3² − 4?", options: [32, 8, 20, 14], correctIndex: 3, explanation: "Előbb hatvány: 3² = 9, majd 2 × 9 = 18, végül 18 − 4 = 14.", calc: "2*3^2-4", source: "teacher" },
  ],
  8: [
    { prompt: "Oldd meg: 3(x − 2) = 15. Mennyi x?", options: [7, 3, 17, 5], correctIndex: 0, explanation: "Mindkét oldalt 3-mal osztva: x − 2 = 15 ÷ 3 = 5, így x = 5 + 2 = 7.", calc: "15/3+2", source: "teacher" },
    { prompt: "Oldd meg: 2(x + 4) = 5x − 7. Mennyi x?", options: [-5, 3, 15, 5], correctIndex: 3, explanation: "2x + 8 = 5x − 7, ebből 8 + 7 = 5x − 2x, azaz 15 = 3x, így x = 15 ÷ 3 = 5.", calc: "(8+7)/(5-2)", source: "teacher" },
    { prompt: "Oldd meg: 4(2x − 1) = 28. Mennyi x?", options: [3, 4, 8, 3.5], correctIndex: 1, explanation: "2x − 1 = 28 ÷ 4 = 7, így 2x = 8 és x = 8 ÷ 2 = 4.", calc: "(28/4+1)/2", source: "teacher" },
    { prompt: "Oldd meg: 5(x + 3) − 2x = 30. Mennyi x?", options: [9, 15, 5, 3], correctIndex: 2, explanation: "5x + 15 − 2x = 30, azaz 3x = 30 − 15 = 15, így x = 15 ÷ 3 = 5.", calc: "(30-15)/(5-2)", source: "teacher" },
    { prompt: "Oldd meg: (x + 5) : 3 = 7. Mennyi x?", options: [26, 21, 4, 16], correctIndex: 3, explanation: "x + 5 = 7 × 3 = 21, így x = 21 − 5 = 16.", calc: "7*3-5", source: "teacher" },
    { prompt: "6 munkás 10 nap alatt végez egy munkával. Hány nap alatt végezne ugyanezzel 4 munkás?", options: [15, 8, 12, 24], correctIndex: 0, explanation: "Fordított arányosság: 6 × 10 = 60 munkásnap, 60 ÷ 4 = 15 nap.", calc: "6*10/4", source: "teacher" },
    { prompt: "Egy autó 90 km/h-val 4 óra alatt ér célba. Hány óra alatt érne célba 120 km/h-val?", options: [5, 3, 2, 4.5], correctIndex: 1, explanation: "Az út 90 × 4 = 360 km, az idő 360 ÷ 120 = 3 óra.", calc: "90*4/120", source: "teacher" },
    { prompt: "Egy takarmánykészlet 12 tehénnek 30 napig elég. Hány napig elég 18 tehénnek?", options: [45, 24, 20, 18], correctIndex: 2, explanation: "Fordított arányosság: 12 × 30 = 360 tehénnap, 360 ÷ 18 = 20 nap.", calc: "12*30/18", source: "teacher" },
    { prompt: "8 csap 9 óra alatt tölt meg egy medencét. Hány óra alatt tölti meg 12 ugyanilyen csap?", options: [13.5, 4, 8, 6], correctIndex: 3, explanation: "Fordított arányosság: 8 × 9 = 72 csapóra, 72 ÷ 12 = 6 óra.", calc: "8*9/12", source: "teacher" },
    { prompt: "5 m szövet ára 3750 Ft. Hány forint 8 m ugyanilyen szövet?", options: [6000, 5250, 4800, 6750], correctIndex: 0, explanation: "Egyenes arányosság: 1 m ára 3750 ÷ 5 = 750 Ft, 8 m ára 750 × 8 = 6000 Ft.", calc: "3750/5*8", source: "teacher" },
    { prompt: "Egy térkép méretaránya 1 : 50 000. Hány km a valóságban a térképen mért 6 cm?", options: [30, 3, 0.3, 300], correctIndex: 1, explanation: "6 × 50 000 = 300 000 cm, és 300 000 cm ÷ 100 000 = 3 km.", calc: "6*50000/100000", source: "teacher" },
    { prompt: "y fordítottan arányos x-szel. Ha x = 3, akkor y = 20. Mennyi y, ha x = 5?", options: [22, 60, 12, 100], correctIndex: 2, explanation: "x × y állandó: 3 × 20 = 60, így y = 60 ÷ 5 = 12.", calc: "3*20/5", source: "teacher" },
    { prompt: "Mennyi √169 + √25?", options: [12, 20, 18, 8], correctIndex: 2, explanation: "13 × 13 = 169, így √169 = 13; 5 × 5 = 25, így √25 = 5; 13 + 5 = 18.", calc: "sqrt(169)+sqrt(25)", source: "teacher" },
    { prompt: "Mennyi √(16 · 25)?", options: [20, 41, 400, 9], correctIndex: 0, explanation: "√(16 × 25) = √16 × √25 = 4 × 5 = 20.", calc: "sqrt(16*25)", source: "teacher" },
    { prompt: "Mennyi √(9 + 16)?", options: [7, 25, 5, 12.5], correctIndex: 2, explanation: "Előbb összeadunk: 9 + 16 = 25, és √25 = 5 (nem √9 + √16 = 7).", calc: "sqrt(9+16)", source: "teacher" },
    { prompt: "Egy négyzet területe 81 cm². Hány cm az oldala?", options: [20.25, 9, 40.5, 18], correctIndex: 1, explanation: "a × a = 81, így a = √81 = 9 cm, mert 9 × 9 = 81.", calc: "sqrt(81)", source: "teacher" },
    { prompt: "Mennyi √0,36?", options: [0.06, 6, 0.18, 0.6], correctIndex: 3, explanation: "0,6 × 0,6 = 0,36, ezért √0,36 = 0,6.", calc: "sqrt(0.36)", source: "teacher" },
    { prompt: "Egy derékszögű háromszög befogói 6 cm és 8 cm. Hány cm az átfogója?", options: [14, 10, 48, 100], correctIndex: 1, explanation: "Pitagorasz-tétel: c² = 6² + 8² = 36 + 64 = 100, így c = √100 = 10 cm.", calc: "sqrt(6^2+8^2)", source: "teacher" },
    { prompt: "Egy derékszögű háromszög átfogója 17 cm, egyik befogója 8 cm. Hány cm a másik befogó?", options: [9, 25, 15, 225], correctIndex: 2, explanation: "b² = 17² − 8² = 289 − 64 = 225, így b = √225 = 15 cm.", calc: "sqrt(17^2-8^2)", source: "teacher" },
    { prompt: "Egy derékszögű háromszög befogói 9 m és 12 m. Hány m az átfogója?", options: [21, 54, 17, 15], correctIndex: 3, explanation: "c² = 9² + 12² = 81 + 144 = 225, így c = √225 = 15 m.", calc: "sqrt(9^2+12^2)", source: "teacher" },
    { prompt: "Egy 10 m-es létra alja 6 m-re van a faltól. Hány méter magasan éri el a falat?", options: [8, 4, 16, 7], correctIndex: 0, explanation: "h² = 10² − 6² = 100 − 36 = 64, így h = √64 = 8 m.", calc: "sqrt(10^2-6^2)", source: "teacher" },
    { prompt: "Egy téglalap oldalai 5 cm és 12 cm. Hány cm az átlója?", options: [17, 60, 13, 7], correctIndex: 2, explanation: "d² = 5² + 12² = 25 + 144 = 169, így d = √169 = 13 cm.", calc: "sqrt(5^2+12^2)", source: "teacher" },
    { prompt: "Egy téglatest élei 3 cm, 4 cm és 5 cm. Hány cm³ a térfogata?", options: [12, 60, 94, 47], correctIndex: 1, explanation: "V = a × b × c = 3 × 4 × 5 = 60 cm³.", calc: "3*4*5", source: "teacher" },
    { prompt: "Egy téglatest élei 2 cm, 3 cm és 4 cm. Hány cm² a felszíne?", options: [24, 26, 48, 52], correctIndex: 3, explanation: "A = 2 × (2 × 3 + 2 × 4 + 3 × 4) = 2 × (6 + 8 + 12) = 2 × 26 = 52 cm².", calc: "2*(2*3+2*4+3*4)", source: "teacher" },
    { prompt: "Egy kocka éle 5 cm. Hány cm² a felszíne?", options: [150, 125, 25, 100], correctIndex: 0, explanation: "A = 6 × a² = 6 × 5² = 6 × 25 = 150 cm².", calc: "6*5^2", source: "teacher" },
    { prompt: "Egy akvárium 50 cm hosszú, 30 cm széles és 40 cm magas. Hány liter víz fér bele?", options: [600, 6, 60, 120], correctIndex: 2, explanation: "V = 50 × 30 × 40 = 60 000 cm³, és 1 liter = 1000 cm³, így 60 000 ÷ 1000 = 60 liter.", calc: "50*30*40/1000", source: "teacher" },
    { prompt: "Egy téglatest térfogata 120 cm³, alaplapja 4 cm-szer 6 cm-es. Hány cm a magassága?", options: [10, 20, 12, 5], correctIndex: 3, explanation: "Az alaplap területe 4 × 6 = 24 cm², a magasság 120 ÷ 24 = 5 cm.", calc: "120/(4*6)", source: "teacher" },
    { prompt: "Egy hasáb alaplapjának területe 15 cm², magassága 8 cm. Hány cm³ a térfogata?", options: [120, 60, 23, 240], correctIndex: 0, explanation: "V = alapterület × magasság = 15 × 8 = 120 cm³.", calc: "15*8", source: "teacher" },
    { prompt: "Egy hasáb alaplapja 6 cm és 4 cm befogójú derékszögű háromszög, magassága 9 cm. Hány cm³ a térfogata?", options: [216, 108, 19, 54], correctIndex: 1, explanation: "Alapterület: 6 × 4 ÷ 2 = 12 cm², térfogat: 12 × 9 = 108 cm³.", calc: "6*4/2*9", source: "teacher" },
    { prompt: "Egy hasáb térfogata 96 cm³, magassága 8 cm. Hány cm² az alaplapjának területe?", options: [768, 88, 12, 104], correctIndex: 2, explanation: "V = T × m, így T = 96 ÷ 8 = 12 cm².", calc: "96/8", source: "teacher" },
    { prompt: "2³ · 2⁴ = 2ⁿ. Mennyi az n kitevő?", options: [12, 1, 128, 7], correctIndex: 3, explanation: "Azonos alapú hatványok szorzásakor a kitevők összeadódnak: 2³ × 2⁴ = 2³⁺⁴ = 2⁷, így n = 7.", calc: "3+4", source: "teacher" },
    { prompt: "5⁸ : 5³ = 5ⁿ. Mennyi az n kitevő?", options: [11, 5, 24, 3], correctIndex: 1, explanation: "Azonos alapú hatványok osztásakor a kitevők kivonódnak: 5⁸ ÷ 5³ = 5⁸⁻³ = 5⁵, így n = 5.", calc: "8-3", source: "teacher" },
    { prompt: "(3²)⁴ = 3ⁿ. Mennyi az n kitevő?", options: [6, 16, 2, 8], correctIndex: 3, explanation: "Hatvány hatványozásakor a kitevők összeszorzódnak: (3²)⁴ = 3²ˣ⁴, azaz 2 × 4 = 8, így n = 8.", calc: "2*4", source: "teacher" },
    { prompt: "(2⁴ · 2⁵) : 2⁶ = 2ⁿ. Mennyi az n kitevő?", options: [3, 15, 14, 1], correctIndex: 0, explanation: "2⁴ × 2⁵ = 2⁹, majd 2⁹ ÷ 2⁶ = 2⁹⁻⁶ = 2³, így n = 4 + 5 − 6 = 3.", calc: "4+5-6", source: "teacher" },
    { prompt: "Mennyi 3,2 · 10⁴?", options: [3200, 320000, 32000, 12.8], correctIndex: 2, explanation: "3,2 × 10⁴ = 3,2 × 10 000 = 32 000 (a tizedesvessző 4 hellyel jobbra lép).", calc: "3.2*10^4", source: "teacher" },
    { prompt: "Mennyi 4,5 · 10⁻²?", options: [0.45, 0.045, 450, 45], correctIndex: 1, explanation: "10⁻² = 1 ÷ 100, így 4,5 × 10⁻² = 4,5 ÷ 100 = 0,045.", calc: "4.5*10^(-2)", source: "teacher" },
    { prompt: "Mennyi (6 · 10⁵) : (3 · 10²)?", options: [200, 20000, 3000, 2000], correctIndex: 3, explanation: "6 ÷ 3 = 2 és 10⁵ ÷ 10² = 10³, így 2 × 10³ = 2000.", calc: "(6*10^5)/(3*10^2)", source: "teacher" },
    { prompt: "Egy 10 000 Ft-os ár előbb 20%-kal nő, majd 20%-kal csökken. Hány forint lesz a végső ár?", options: [10000, 9600, 10400, 9800], correctIndex: 1, explanation: "10 000 × 1,2 = 12 000 Ft, majd 12 000 × 0,8 = 9600 Ft.", calc: "10000*1.2*0.8", source: "teacher" },
    { prompt: "Mennyi 200-nak a 30%-ának az 50%-a?", options: [30, 160, 60, 100], correctIndex: 0, explanation: "200 × 30 ÷ 100 = 60, majd 60 × 50 ÷ 100 = 30.", calc: "200*30/100*50/100", source: "teacher" },
    { prompt: "Egy 5000 Ft-os termék árát 10%-kal csökkentik, majd az új árat még 10%-kal. Hány forint a végső ár?", options: [4000, 4500, 4050, 4100], correctIndex: 2, explanation: "5000 × 0,9 = 4500 Ft, majd 4500 × 0,9 = 4050 Ft.", calc: "5000*0.9*0.9", source: "teacher" },
    { prompt: "Egy osztály 40%-a sportol, a sportolók 25%-a úszik. Az osztály hány százaléka úszik?", options: [15, 65, 16, 10], correctIndex: 3, explanation: "A 40%-nak a 25%-a: 40 × 25 ÷ 100 = 10%.", calc: "40*25/100", source: "teacher" },
  ],
  9: [
    { prompt: "Mennyi a 2x² − 3x kifejezés értéke, ha x = 4?", options: [20, 26, 52, 4], correctIndex: 0, explanation: "x² = 4² = 16, így 2 × 16 − 3 × 4 = 32 − 12 = 20.", calc: "2*4^2-3*4", source: "teacher" },
    { prompt: "Mennyi a 3x² + 2x − 5 kifejezés értéke, ha x = −2?", options: [-21, 3, 11, -13], correctIndex: 1, explanation: "(−2)² = 4, így 3 × 4 + 2 × (−2) − 5 = 12 − 4 − 5 = 3.", calc: "3*(-2)^2+2*(-2)-5", source: "teacher" },
    { prompt: "Mennyi (a + b)² értéke, ha a = 7 és b = 3?", options: [58, 79, 100, 21], correctIndex: 2, explanation: "(7 + 3)² = 10² = 10 × 10 = 100. (Nem 7² + 3² = 58, mert hiányozna a 2ab = 42 tag.)", calc: "(7+3)^2", source: "teacher" },
    { prompt: "Mennyi 53² − 47² értéke? (Használd az a² − b² = (a − b)(a + b) azonosságot!)", options: [36, 600, 6000, 60], correctIndex: 1, explanation: "53² − 47² = (53 − 47) × (53 + 47) = 6 × 100 = 600.", calc: "(53-47)*(53+47)", source: "teacher" },
    { prompt: "Mennyi (a − b)² értéke, ha a = 9 és b = 4?", options: [65, 97, 25, 17], correctIndex: 2, explanation: "(9 − 4)² = 5² = 25. Azonossággal: 81 − 2 × 9 × 4 + 16 = 81 − 72 + 16 = 25.", calc: "(9-4)^2", source: "teacher" },
    { prompt: "Mennyi 101² − 99² értéke?", options: [400, 200, 4, 800], correctIndex: 0, explanation: "a² − b² = (a − b)(a + b): (101 − 99) × (101 + 99) = 2 × 200 = 400.", calc: "(101-99)*(101+99)", source: "teacher" },
    { prompt: "Az f(x) = 2x − 3 lineáris függvény esetén mennyi f(5)?", options: [13, 7, 4, -1], correctIndex: 1, explanation: "f(5) = 2 × 5 − 3 = 10 − 3 = 7.", calc: "2*5-3", source: "teacher" },
    { prompt: "Az f(x) = −3x + 4 függvény esetén mennyi f(−2)?", options: [10, -2, -10, 2], correctIndex: 0, explanation: "f(−2) = −3 × (−2) + 4 = 6 + 4 = 10.", calc: "-3*(-2)+4", source: "teacher" },
    { prompt: "Az f(x) = x/2 + 5 függvény esetén mennyi f(8)?", options: [21, 4, 9, 13], correctIndex: 2, explanation: "f(8) = 8 ÷ 2 + 5 = 4 + 5 = 9.", calc: "8/2+5", source: "teacher" },
    { prompt: "Mennyi az A(1; 2) és B(3; 8) pontokon átmenő egyenes meredeksége?", options: [2, 6, 3, -3], correctIndex: 2, explanation: "m = (y₂ − y₁) ÷ (x₂ − x₁) = (8 − 2) ÷ (3 − 1) = 6 ÷ 2 = 3.", calc: "(8-2)/(3-1)", source: "teacher" },
    { prompt: "Mennyi az A(−1; 5) és B(3; −3) pontokon átmenő egyenes meredeksége?", options: [2, -2, -0.5, -4], correctIndex: 1, explanation: "m = (−3 − 5) ÷ (3 − (−1)) = −8 ÷ 4 = −2.", calc: "(-3-5)/(3-(-1))", source: "teacher" },
    { prompt: "Mennyi az A(2; 1) és B(6; 3) pontokon átmenő egyenes meredeksége?", options: [0.5, 2, 1, -0.5], correctIndex: 0, explanation: "m = (3 − 1) ÷ (6 − 2) = 2 ÷ 4 = 0,5.", calc: "(3-1)/(6-2)", source: "teacher" },
    { prompt: "Hol van az f(x) = 2x − 8 függvény zérushelye?", options: [-4, 4, 8, 16], correctIndex: 1, explanation: "2x − 8 = 0, így 2x = 8, x = 8 ÷ 2 = 4.", calc: "8/2", source: "teacher" },
    { prompt: "Hol van az f(x) = 3x + 12 függvény zérushelye?", options: [4, 36, -36, -4], correctIndex: 3, explanation: "3x + 12 = 0, így 3x = −12, x = −12 ÷ 3 = −4.", calc: "-12/3", source: "teacher" },
    { prompt: "Hol van az f(x) = −5x + 15 függvény zérushelye?", options: [-3, 75, 3, 10], correctIndex: 2, explanation: "−5x + 15 = 0, így 5x = 15, x = 15 ÷ 5 = 3.", calc: "15/5", source: "teacher" },
    { prompt: "Hol van az f(x) = 4x − 6 függvény zérushelye?", options: [1.5, -1.5, 24, 2], correctIndex: 0, explanation: "4x − 6 = 0, így 4x = 6, x = 6 ÷ 4 = 1,5.", calc: "6/4", source: "teacher" },
    { prompt: "Az x + y = 10 és x − y = 4 egyenletrendszerben mennyi x?", options: [3, 7, 14, 6], correctIndex: 1, explanation: "A két egyenletet összeadva 2x = 10 + 4 = 14, x = 14 ÷ 2 = 7 (és y = 3).", calc: "(10+4)/2", source: "teacher" },
    { prompt: "Az x + y = 12 és x − y = 2 egyenletrendszerben mennyi y?", options: [7, 10, 5, 6], correctIndex: 2, explanation: "Kivonva az egyenleteket 2y = 12 − 2 = 10, y = 10 ÷ 2 = 5 (és x = 7).", calc: "(12-2)/2", source: "teacher" },
    { prompt: "A 2x + y = 11 és x − y = 1 egyenletrendszerben mennyi x?", options: [4, 3, 6, 5], correctIndex: 0, explanation: "Összeadva 3x = 11 + 1 = 12, x = 12 ÷ 3 = 4. Ellenőrzés: y = 3, 2 × 4 + 3 = 11.", calc: "(11+1)/3", source: "teacher" },
    { prompt: "A 3x + 2y = 16 és x + 2y = 8 egyenletrendszerben mennyi x?", options: [2, 8, 4, 12], correctIndex: 2, explanation: "Kivonva 2x = 16 − 8 = 8, x = 8 ÷ 2 = 4. Ellenőrzés: y = 2, 3 × 4 + 2 × 2 = 16.", calc: "(16-8)/2", source: "teacher" },
    { prompt: "Az x + 3y = 13 és x + y = 7 egyenletrendszerben mennyi y?", options: [4, 3, 6, 10], correctIndex: 1, explanation: "Kivonva 2y = 13 − 7 = 6, y = 6 ÷ 2 = 3 (és x = 4).", calc: "(13-7)/2", source: "teacher" },
    { prompt: "Mennyi |−7| + |3 − 10| értéke?", options: [14, 0, -14, 4], correctIndex: 0, explanation: "|−7| = 7 és |3 − 10| = |−7| = 7, így 7 + 7 = 14.", calc: "abs(-7)+abs(3-10)", source: "teacher" },
    { prompt: "Mennyi |2 − 9| · |−3| értéke?", options: [-21, 33, 10, 21], correctIndex: 3, explanation: "|2 − 9| = |−7| = 7 és |−3| = 3, így 7 × 3 = 21.", calc: "abs(2-9)*abs(-3)", source: "teacher" },
    { prompt: "Mennyi az |x − 3| = 5 egyenlet nagyobbik megoldása?", options: [-2, 2, 8, 15], correctIndex: 2, explanation: "x − 3 = 5 vagy x − 3 = −5, tehát x = 8 vagy x = −2; a nagyobbik 8.", calc: "3+5", source: "teacher" },
    { prompt: "|A| = 18, |B| = 12 és |A ∩ B| = 5. Hány elemű az A ∪ B halmaz?", options: [30, 25, 35, 13], correctIndex: 1, explanation: "|A ∪ B| = |A| + |B| − |A ∩ B| = 18 + 12 − 5 = 25.", calc: "18+12-5", source: "teacher" },
    { prompt: "|A ∪ B| = 30, |A| = 20 és |B| = 15. Hány elemű az A ∩ B halmaz?", options: [5, 35, 10, 65], correctIndex: 0, explanation: "|A ∩ B| = |A| + |B| − |A ∪ B| = 20 + 15 − 30 = 5.", calc: "20+15-30", source: "teacher" },
    { prompt: "Egy 32 fős osztályban 20-an szeretik a matekot, 15-en a fizikát, és mindenki legalább az egyiket. Hányan szeretik mindkettőt?", options: [12, 3, 17, 5], correctIndex: 1, explanation: "|A ∩ B| = |A| + |B| − |A ∪ B| = 20 + 15 − 32 = 3 tanuló.", calc: "20+15-32", source: "teacher" },
    { prompt: "A 360 = 2³ · 3² · 5 prímtényezős felbontás alapján hány pozitív osztója van a 360-nak?", options: [24, 6, 30, 12], correctIndex: 0, explanation: "Az osztók száma a kitevők eggyel növelt értékeinek szorzata: (3 + 1) × (2 + 1) × (1 + 1) = 4 × 3 × 2 = 24.", calc: "(3+1)*(2+1)*(1+1)", source: "teacher" },
    { prompt: "A 84 = 2² · 3 · 7 és a 36 = 2² · 3² felbontás alapján mennyi a két szám legnagyobb közös osztója?", options: [6, 4, 12, 252], correctIndex: 2, explanation: "A közös prímtényezők a legkisebb kitevővel: 2² × 3 = 4 × 3 = 12.", calc: "2^2*3", source: "teacher" },
    { prompt: "Mennyi a 12 és a 18 legkisebb közös többszöröse?", options: [216, 6, 36, 72], correctIndex: 2, explanation: "12 = 2² · 3, 18 = 2 · 3², lkkt = 2² × 3² = 36. Másképp: 12 × 18 ÷ lnko = 216 ÷ 6 = 36.", calc: "12*18/6", source: "teacher" },
    { prompt: "Hány pozitív osztója van a 72-nek?", options: [6, 8, 12, 10], correctIndex: 2, explanation: "72 = 2³ · 3², így az osztók száma (3 + 1) × (2 + 1) = 4 × 3 = 12.", calc: "(3+1)*(2+1)", source: "teacher" },
    { prompt: "Melyik számot adja a 2⁴ · 3² · 5 prímtényezős felbontás?", options: [720, 360, 1440, 240], correctIndex: 0, explanation: "2⁴ = 16, 3² = 9, így 16 × 9 × 5 = 144 × 5 = 720.", calc: "2^4*3^2*5", source: "teacher" },
    { prompt: "Egy 12 000 Ft-os cipő árát 15%-kal csökkentik. Hány forint az új ár?", options: [13800, 10200, 1800, 10800], correctIndex: 1, explanation: "15% = 12 000 × 0,15 = 1800 Ft, így az új ár 12 000 − 1800 = 10 200 Ft.", calc: "12000*(1-15/100)", source: "teacher" },
    { prompt: "Egy termék ára 20%-os emelés után 6000 Ft. Hány forint volt az eredeti ár?", options: [4800, 5000, 7200, 5200], correctIndex: 1, explanation: "Az új ár az eredeti 120%-a: eredeti = 6000 ÷ 1,2 = 5000 Ft. (6000 − 20% = 4800 hibás.)", calc: "6000/1.2", source: "teacher" },
    { prompt: "Egy 800 Ft-os ár először 25%-kal nő, majd az új ár 20%-kal csökken. Hány forint lesz a végső ár?", options: [840, 760, 1000, 800], correctIndex: 3, explanation: "800 × 1,25 = 1000 Ft, majd 1000 × 0,8 = 800 Ft. Az ár visszaáll 800 Ft-ra.", calc: "800*1.25*0.8", source: "teacher" },
    { prompt: "Hány százaléka a 45 a 180-nak?", options: [25, 4, 40, 45], correctIndex: 0, explanation: "45 ÷ 180 = 0,25, és 0,25 × 100 = 25%.", calc: "45/180*100", source: "teacher" },
    { prompt: "Egy 84 cm-es szalagot 3 : 4 arányban vágunk ketté. Hány cm a hosszabbik darab?", options: [36, 48, 21, 28], correctIndex: 1, explanation: "3 + 4 = 7 rész, 1 rész = 84 ÷ 7 = 12 cm, a hosszabbik 4 × 12 = 48 cm.", calc: "84/(3+4)*4", source: "teacher" },
    { prompt: "Két szám aránya a : b = 2 : 5, összegük 91. Mennyi b?", options: [26, 35, 65, 45.5], correctIndex: 2, explanation: "2 + 5 = 7 rész, 1 rész = 91 ÷ 7 = 13, így b = 5 × 13 = 65 (és a = 26).", calc: "91/(2+5)*5", source: "teacher" },
    { prompt: "Egy térkép méretaránya 1 : 25 000. A térképen 8 cm hány km a valóságban?", options: [20, 0.2, 2, 200], correctIndex: 2, explanation: "8 × 25 000 = 200 000 cm; 200 000 cm ÷ 100 000 = 2 km.", calc: "8*25000/100000", source: "teacher" },
    { prompt: "Egy 250 000 Ft-os betét évi 4%-ot kamatozik. Hány forint a kamat egy év alatt?", options: [1000, 10000, 100000, 260000], correctIndex: 1, explanation: "250 000 × 4 ÷ 100 = 10 000 Ft kamat.", calc: "250000*4/100", source: "teacher" },
    { prompt: "Mennyi a 4x² − 9 kifejezés értéke, ha x = −1,5?", options: [0, -18, 18, -3], correctIndex: 0, explanation: "(−1,5)² = 2,25, így 4 × 2,25 − 9 = 9 − 9 = 0.", calc: "4*(-1.5)^2-9", source: "teacher" },
  ],
  10: [
    { prompt: "Mennyi az x² − 9x + 20 = 0 egyenlet nagyobbik gyöke?", options: [4, 5, 9, 20], correctIndex: 1, explanation: "Szorzattá alakítva (x − 4)(x − 5) = 0, a gyökök 4 és 5; a nagyobbik 5. Ellenőrzés: 25 − 45 + 20 = 0.", calc: "(9+sqrt(9^2-4*20))/2", source: "teacher" },
    { prompt: "Mennyi az x² − 5x + 6 = 0 egyenlet kisebbik gyöke?", options: [3, -2, 2, 6], correctIndex: 2, explanation: "(x − 2)(x − 3) = 0, a gyökök 2 és 3; a kisebbik 2. Ellenőrzés: 4 − 10 + 6 = 0.", calc: "(5-sqrt(5^2-4*6))/2", source: "teacher" },
    { prompt: "Mennyi az x² + 2x − 15 = 0 egyenlet gyökeinek összege?", options: [2, -2, -15, 15], correctIndex: 1, explanation: "Viète: x₁ + x₂ = −b ÷ a = −2 ÷ 1 = −2. (A gyökök 3 és −5.)", calc: "-2/1", source: "teacher" },
    { prompt: "Mennyi az x² − 3x − 10 = 0 egyenlet gyökeinek szorzata?", options: [10, 3, -10, -3], correctIndex: 2, explanation: "Viète: x₁ × x₂ = c ÷ a = −10 ÷ 1 = −10. (A gyökök 5 és −2.)", calc: "-10/1", source: "teacher" },
    { prompt: "Mennyi a 2x² − 8x + 6 = 0 egyenlet gyökeinek összege?", options: [8, 4, 3, -4], correctIndex: 1, explanation: "Viète: x₁ + x₂ = −b ÷ a = 8 ÷ 2 = 4. (A gyökök 1 és 3.)", calc: "8/2", source: "teacher" },
    { prompt: "Mennyi a 3x² + 6x − 24 = 0 egyenlet gyökeinek szorzata?", options: [-24, 8, -8, -2], correctIndex: 2, explanation: "Viète: x₁ × x₂ = c ÷ a = −24 ÷ 3 = −8. (A gyökök 2 és −4.)", calc: "-24/3", source: "teacher" },
    { prompt: "Mennyi a 2x² − 5x − 3 = 0 egyenlet nagyobbik gyöke?", options: [3, -0.5, 6, 12], correctIndex: 0, explanation: "D = 25 + 24 = 49, √49 = 7; x = (5 + 7) ÷ (2 × 2) = 12 ÷ 4 = 3. A másik gyök −0,5.", calc: "(5+sqrt(5^2-4*2*(-3)))/(2*2)", source: "teacher" },
    { prompt: "Mennyi az x² − 6x + 9 = 0 egyenlet (kétszeres) gyöke?", options: [-3, 3, 9, 6], correctIndex: 1, explanation: "x² − 6x + 9 = (x − 3)² = 0, így x = 6 ÷ 2 = 3.", calc: "6/2", source: "teacher" },
    { prompt: "Mennyi az x² − 4x − 5 = 0 egyenlet diszkriminánsa?", options: [36, -4, 6, 16], correctIndex: 0, explanation: "D = b² − 4ac = (−4)² − 4 × 1 × (−5) = 16 + 20 = 36.", calc: "(-4)^2-4*1*(-5)", source: "teacher" },
    { prompt: "Mennyi a 2x² + 3x − 2 = 0 egyenlet diszkriminánsa?", options: [-7, 25, 5, 17], correctIndex: 1, explanation: "D = b² − 4ac = 3² − 4 × 2 × (−2) = 9 + 16 = 25.", calc: "3^2-4*2*(-2)", source: "teacher" },
    { prompt: "Mennyi a 3x² − 6x + 3 = 0 egyenlet diszkriminánsa?", options: [72, 36, 0, -36], correctIndex: 2, explanation: "D = (−6)² − 4 × 3 × 3 = 36 − 36 = 0, ezért egy (kétszeres) gyök van.", calc: "(-6)^2-4*3*3", source: "teacher" },
    { prompt: "Mennyi az x² + 2x + 5 = 0 egyenlet diszkriminánsa?", options: [24, 16, -4, -16], correctIndex: 3, explanation: "D = 2² − 4 × 1 × 5 = 4 − 20 = −16 < 0, ezért nincs valós gyök.", calc: "2^2-4*1*5", source: "teacher" },
    { prompt: "Mennyi az f(x) = x² − 6x + 5 parabola csúcspontjának x-koordinátája?", options: [6, -3, 5, 3], correctIndex: 3, explanation: "x₀ = −b ÷ (2a) = 6 ÷ (2 × 1) = 3. Teljes négyzettel: (x − 3)² − 4.", calc: "6/(2*1)", source: "teacher" },
    { prompt: "Mennyi az f(x) = x² − 6x + 5 parabola csúcspontjának y-koordinátája?", options: [-4, 5, 4, -13], correctIndex: 0, explanation: "A csúcs x = 3-nál van: f(3) = 9 − 6 × 3 + 5 = 9 − 18 + 5 = −4.", calc: "3^2-6*3+5", source: "teacher" },
    { prompt: "Mennyi az f(x) = 2x² + 8x + 1 parabola csúcspontjának x-koordinátája?", options: [2, -4, -2, 4], correctIndex: 2, explanation: "x₀ = −b ÷ (2a) = −8 ÷ (2 × 2) = −8 ÷ 4 = −2.", calc: "-8/(2*2)", source: "teacher" },
    { prompt: "Mennyi az f(x) = −x² + 4x + 1 függvény legnagyobb értéke?", options: [13, 5, 1, -3], correctIndex: 1, explanation: "A csúcs x = −4 ÷ (−2) = 2-nél van: f(2) = −4 + 4 × 2 + 1 = −4 + 8 + 1 = 5.", calc: "-(2^2)+4*2+1", source: "teacher" },
    { prompt: "Mennyi az f(x) = x² + 10x + 21 parabola csúcspontjának y-koordinátája?", options: [96, -4, 21, 4], correctIndex: 1, explanation: "x₀ = −10 ÷ 2 = −5, f(−5) = 25 + 10 × (−5) + 21 = 25 − 50 + 21 = −4.", calc: "(-5)^2+10*(-5)+21", source: "teacher" },
    { prompt: "√50 = k · √2. Mennyi k?", options: [25, 5, 10, 2.5], correctIndex: 1, explanation: "√50 = √(25 × 2) = √25 × √2 = 5√2, tehát k = 5.", calc: "sqrt(50/2)", source: "teacher" },
    { prompt: "√72 = k · √2. Mennyi k?", options: [6, 36, 8, 3], correctIndex: 0, explanation: "√72 = √(36 × 2) = √36 × √2 = 6√2, tehát k = 6.", calc: "sqrt(72/2)", source: "teacher" },
    { prompt: "√75 = k · √3. Mennyi k?", options: [25, 3, 15, 5], correctIndex: 3, explanation: "√75 = √(25 × 3) = √25 × √3 = 5√3, tehát k = 5.", calc: "sqrt(75/3)", source: "teacher" },
    { prompt: "√48 = k · √3. Mennyi k?", options: [12, 16, 4, 8], correctIndex: 2, explanation: "√48 = √(16 × 3) = √16 × √3 = 4√3, tehát k = 4.", calc: "sqrt(48/3)", source: "teacher" },
    { prompt: "Mennyi 8^(2/3) értéke?", options: [16, 4, 2, 64], correctIndex: 1, explanation: "8^(2/3) = (∛8)² = 2² = 4.", calc: "8^(2/3)", source: "teacher" },
    { prompt: "Mennyi 27^(1/3) értéke?", options: [9, 13.5, 3, 6], correctIndex: 2, explanation: "27^(1/3) = ∛27 = 3, mert 3 × 3 × 3 = 27.", calc: "27^(1/3)", source: "teacher" },
    { prompt: "Mennyi 16^(−1/2) értéke?", options: [-4, 4, -0.25, 0.25], correctIndex: 3, explanation: "16^(−1/2) = 1 ÷ 16^(1/2) = 1 ÷ √16 = 1 ÷ 4 = 0,25.", calc: "16^(-1/2)", source: "teacher" },
    { prompt: "Mennyi 32^(3/5) értéke?", options: [8, 19.2, 4, 16], correctIndex: 0, explanation: "32^(3/5) = (⁵√32)³ = 2³ = 8.", calc: "32^(3/5)", source: "teacher" },
    { prompt: "Mennyi 81^(3/4) értéke?", options: [9, 27, 60.75, 243], correctIndex: 1, explanation: "81^(3/4) = (⁴√81)³ = 3³ = 27.", calc: "81^(3/4)", source: "teacher" },
    { prompt: "Mennyi 25^(−1/2) értéke?", options: [0.2, -5, 5, -12.5], correctIndex: 0, explanation: "25^(−1/2) = 1 ÷ √25 = 1 ÷ 5 = 0,2.", calc: "25^(-1/2)", source: "teacher" },
    { prompt: "Mennyi √2 · √8 értéke?", options: [16, 2, 4, 8], correctIndex: 2, explanation: "√2 × √8 = √(2 × 8) = √16 = 4.", calc: "sqrt(2)*sqrt(8)", source: "teacher" },
    { prompt: "Mennyi √3 · √12 értéke?", options: [36, 6, 15, 9], correctIndex: 1, explanation: "√3 × √12 = √(3 × 12) = √36 = 6.", calc: "sqrt(3)*sqrt(12)", source: "teacher" },
    { prompt: "Mennyi √98 : √2 értéke?", options: [49, 14, 96, 7], correctIndex: 3, explanation: "√98 ÷ √2 = √(98 ÷ 2) = √49 = 7.", calc: "sqrt(98)/sqrt(2)", source: "teacher" },
    { prompt: "Mennyi √0,36 + √0,64 értéke?", options: [1, 1.4, 0.14, 10], correctIndex: 1, explanation: "√0,36 = 0,6 és √0,64 = 0,8, így 0,6 + 0,8 = 1,4. (√1 = 1 hibás, mert √a + √b ≠ √(a + b).)", calc: "sqrt(0.36)+sqrt(0.64)", source: "teacher" },
    { prompt: "Két hasonló háromszög megfelelő oldalai 6 cm és 9 cm. A kisebbik kerülete 24 cm. Hány cm a nagyobbik kerülete?", options: [36, 27, 16, 54], correctIndex: 0, explanation: "A hasonlóság aránya 9 ÷ 6 = 1,5, a kerület is ennyiszeres: 24 × 1,5 = 36 cm.", calc: "24*9/6", source: "teacher" },
    { prompt: "Két hasonló háromszög hasonlósági aránya 3. A kisebbik területe 5 cm². Hány cm² a nagyobbik területe?", options: [15, 45, 135, 8], correctIndex: 1, explanation: "A területek aránya a hasonlósági arány négyzete: 5 × 3² = 5 × 9 = 45 cm².", calc: "5*3^2", source: "teacher" },
    { prompt: "Egy 1,8 m magas ember árnyéka 2,4 m, ugyanekkor egy fa árnyéka 16 m. Hány méter magas a fa?", options: [9, 12, 18, 21], correctIndex: 1, explanation: "Hasonló háromszögek: magasság ÷ árnyék = 1,8 ÷ 2,4 = 0,75, a fa 16 × 0,75 = 12 m.", calc: "1.8*16/2.4", source: "teacher" },
    { prompt: "Egy derékszögű háromszög befogói 9 cm és 12 cm. Hány cm az átfogója?", options: [21, 225, 15, 17], correctIndex: 2, explanation: "Pitagorasz: c² = 9² + 12² = 81 + 144 = 225, c = √225 = 15 cm.", calc: "sqrt(9^2+12^2)", source: "teacher" },
    { prompt: "Egy derékszögű háromszög átfogója 13 cm, egyik befogója 5 cm. Hány cm a másik befogó?", options: [12, 8, 18, 144], correctIndex: 0, explanation: "Pitagorasz: b² = 13² − 5² = 169 − 25 = 144, b = √144 = 12 cm.", calc: "sqrt(13^2-5^2)", source: "teacher" },
    { prompt: "Egy téglalap oldalai 20 cm és 21 cm. Hány cm az átlója?", options: [41, 841, 30, 29], correctIndex: 3, explanation: "Pitagorasz: d² = 20² + 21² = 400 + 441 = 841, d = √841 = 29 cm.", calc: "sqrt(20^2+21^2)", source: "teacher" },
    { prompt: "Egy derékszögű háromszögben az α-val szemközti befogó 3, az átfogó 5. Mennyi sin α?", options: [0.8, 0.6, 0.75, 1.25], correctIndex: 1, explanation: "sin α = szemközti befogó ÷ átfogó = 3 ÷ 5 = 0,6.", calc: "3/5", source: "teacher" },
    { prompt: "Egy derékszögű háromszögben az α-val szemközti befogó 6, a mellette fekvő befogó 8. Mennyi tg α?", options: [1.25, 0.6, 0.8, 0.75], correctIndex: 3, explanation: "tg α = szemközti befogó ÷ melletti befogó = 6 ÷ 8 = 0,75.", calc: "6/8", source: "teacher" },
    { prompt: "Egy derékszögű háromszögben az átfogó 25, az α melletti befogó 20. Mennyi cos α?", options: [0.8, 0.6, 1.25, 0.75], correctIndex: 0, explanation: "cos α = melletti befogó ÷ átfogó = 20 ÷ 25 = 0,8.", calc: "20/25", source: "teacher" },
    { prompt: "Mennyi a 4 és a 25 mértani közepe?", options: [14.5, 10, 100, 29], correctIndex: 1, explanation: "Mértani közép = √(a × b) = √(4 × 25) = √100 = 10. (A számtani közép 14,5 lenne.)", calc: "sqrt(4*25)", source: "teacher" },
  ],
  11: [
    { prompt: "Mennyi log₂ 32 + log₂ 4?", options: [5, 7, 8, 36], correctIndex: 1, explanation: "log₂ 32 = 5, mert 2⁵ = 32; log₂ 4 = 2, mert 2² = 4; összesen 5 + 2 = 7.", calc: "log(2,32)+log(2,4)", source: "teacher" },
    { prompt: "Mennyi lg 1000 értéke?", options: [2, 4, 3, 100], correctIndex: 2, explanation: "lg 1000 = 3, mert 10³ = 10 × 10 × 10 = 1000.", calc: "lg(1000)", source: "teacher" },
    { prompt: "Mennyi log₃ 81 értéke?", options: [27, 3, 9, 4], correctIndex: 3, explanation: "log₃ 81 = 4, mert 3⁴ = 3 × 3 × 3 × 3 = 81.", calc: "log(3,81)", source: "teacher" },
    { prompt: "Mennyi log₂ 8 + log₂ 4?", options: [5, 6, 12, 32], correctIndex: 0, explanation: "log₂ 8 = 3 és log₂ 4 = 2, így 3 + 2 = 5 (ugyanaz, mint log₂ 32 = 5).", calc: "log(2,8)+log(2,4)", source: "teacher" },
    { prompt: "Oldd meg: 2ˣ = 64. Mennyi x?", options: [32, 6, 8, 5], correctIndex: 1, explanation: "64 = 2⁶, tehát 2ˣ = 2⁶, így x = 6.", calc: "log(2,64)", source: "teacher" },
    { prompt: "Oldd meg: 3ˣ = 243. Mennyi x?", options: [4, 81, 5, 6], correctIndex: 2, explanation: "243 = 3 × 3 × 3 × 3 × 3 = 3⁵, tehát x = 5.", calc: "log(3,243)", source: "teacher" },
    { prompt: "Mennyi sin 30°?", options: [0.866, 1, 0.25, 0.5], correctIndex: 3, explanation: "Nevezetes szög: sin 30° = 1 ÷ 2 = 0,5.", calc: "sin(30)", source: "teacher" },
    { prompt: "Mennyi cos 60°?", options: [0.5, 0.866, 0, 1], correctIndex: 0, explanation: "Nevezetes szög: cos 60° = 1 ÷ 2 = 0,5.", calc: "cos(60)", source: "teacher" },
    { prompt: "Mennyi tg 45°?", options: [0, 1, 0.5, 1.414], correctIndex: 1, explanation: "tg 45° = sin 45° ÷ cos 45° = 1, mert a két érték egyenlő.", calc: "tan(45)", source: "teacher" },
    { prompt: "Mennyi sin 150°?", options: [-0.5, 0.866, 0.5, -0.866], correctIndex: 2, explanation: "sin 150° = sin (180° − 30°) = sin 30° = 0,5.", calc: "sin(150)", source: "teacher" },
    { prompt: "Mennyi cos 180°?", options: [1, 0, 0.5, -1], correctIndex: 3, explanation: "Az egységkörön a 180°-os pont (−1; 0), így cos 180° = −1.", calc: "cos(180)", source: "teacher" },
    { prompt: "Mennyi 4 · sin 30° értéke?", options: [2, 4, 1, 3.464], correctIndex: 0, explanation: "sin 30° = 0,5, így 4 × 0,5 = 2.", calc: "4*sin(30)", source: "teacher" },
    { prompt: "Mennyi 6 · cos 60° + 2 · tg 45°?", options: [8, 5, 4, 7], correctIndex: 1, explanation: "cos 60° = 0,5 és tg 45° = 1, így 6 × 0,5 + 2 × 1 = 3 + 2 = 5.", calc: "6*cos(60)+2*tan(45)", source: "teacher" },
    { prompt: "Mennyi sin 90° ÷ cos 60°?", options: [0.5, 1, 2, 4], correctIndex: 2, explanation: "sin 90° = 1 és cos 60° = 0,5, így 1 ÷ 0,5 = 2.", calc: "sin(90)/cos(60)", source: "teacher" },
    { prompt: "Egy számtani sorozat első tagja 3, különbsége 4. Mennyi a 10. tagja?", options: [43, 40, 36, 39], correctIndex: 3, explanation: "a₁₀ = a₁ + 9 × d = 3 + 9 × 4 = 3 + 36 = 39.", calc: "3+(10-1)*4", source: "teacher" },
    { prompt: "Egy számtani sorozat első tagja 5, különbsége −2. Mennyi a 8. tagja?", options: [-9, -11, 19, -7], correctIndex: 0, explanation: "a₈ = a₁ + 7 × d = 5 + 7 × (−2) = 5 − 14 = −9.", calc: "5+(8-1)*(-2)", source: "teacher" },
    { prompt: "Egy számtani sorozat első tagja 1, különbsége 2. Mennyi az első 10 tag összege?", options: [110, 100, 50, 19], correctIndex: 1, explanation: "a₁₀ = 1 + 9 × 2 = 19; S₁₀ = 10 × (1 + 19) ÷ 2 = 10 × 20 ÷ 2 = 100.", calc: "10*(2*1+(10-1)*2)/2", source: "teacher" },
    { prompt: "Mennyi az 1, 2, 3, …, 20 egész számok összege?", options: [200, 420, 210, 190], correctIndex: 2, explanation: "Számtani sorozat összege: S = 20 × (1 + 20) ÷ 2 = 20 × 21 ÷ 2 = 210.", calc: "20*(1+20)/2", source: "teacher" },
    { prompt: "Egy számtani sorozat első tagja 2, ötödik tagja 14. Mennyi a különbsége?", options: [12, 2.4, 4, 3], correctIndex: 3, explanation: "a₅ = a₁ + 4 × d, így 4 × d = 14 − 2 = 12, d = 12 ÷ 4 = 3.", calc: "(14-2)/(5-1)", source: "teacher" },
    { prompt: "Egy számtani sorozat első tagja 4, tizedik tagja 40. Mennyi az első 10 tag összege?", options: [220, 440, 200, 44], correctIndex: 0, explanation: "S₁₀ = 10 × (a₁ + a₁₀) ÷ 2 = 10 × (4 + 40) ÷ 2 = 10 × 44 ÷ 2 = 220.", calc: "10*(4+40)/2", source: "teacher" },
    { prompt: "Egy mértani sorozat első tagja 3, hányadosa 2. Mennyi az 5. tagja?", options: [96, 48, 24, 11], correctIndex: 1, explanation: "a₅ = a₁ × q⁴ = 3 × 2⁴ = 3 × 16 = 48.", calc: "3*2^(5-1)", source: "teacher" },
    { prompt: "Egy mértani sorozat első tagja 2, hányadosa 3. Mennyi a 4. tagja?", options: [162, 18, 54, 11], correctIndex: 2, explanation: "a₄ = a₁ × q³ = 2 × 3³ = 2 × 27 = 54.", calc: "2*3^(4-1)", source: "teacher" },
    { prompt: "Egy mértani sorozat első tagja 1, hányadosa 2. Mennyi az első 5 tag összege?", options: [32, 63, 16, 31], correctIndex: 3, explanation: "1 + 2 + 4 + 8 + 16 = 31; képlettel S₅ = 1 × (2⁵ − 1) ÷ (2 − 1) = 31.", calc: "1*(2^5-1)/(2-1)", source: "teacher" },
    { prompt: "Egy mértani sorozat első tagja 3, hányadosa 2. Mennyi az első 4 tag összege?", options: [45, 48, 24, 90], correctIndex: 0, explanation: "S₄ = 3 × (2⁴ − 1) ÷ (2 − 1) = 3 × 15 = 45 (3 + 6 + 12 + 24 = 45).", calc: "3*(2^4-1)/(2-1)", source: "teacher" },
    { prompt: "Egy mértani sorozat 2. tagja 6, 3. tagja 18. Mennyi a hányadosa?", options: [12, 3, 2, 108], correctIndex: 1, explanation: "q = a₃ ÷ a₂ = 18 ÷ 6 = 3.", calc: "18/6", source: "teacher" },
    { prompt: "Egy mértani sorozat első tagja 64, hányadosa 0,5. Mennyi a 4. tagja?", options: [4, 16, 8, 32], correctIndex: 2, explanation: "a₄ = 64 × 0,5³ = 64 × 0,125 = 8 (64 → 32 → 16 → 8).", calc: "64*0.5^(4-1)", source: "teacher" },
    { prompt: "Milyen hosszú a v(3; 4) vektor?", options: [7, 25, 12, 5], correctIndex: 3, explanation: "|v| = √(3² + 4²) = √(9 + 16) = √25 = 5.", calc: "sqrt(3^2+4^2)", source: "teacher" },
    { prompt: "Milyen hosszú az a(6; 8) vektor?", options: [10, 14, 100, 48], correctIndex: 0, explanation: "|a| = √(6² + 8²) = √(36 + 64) = √100 = 10.", calc: "sqrt(6^2+8^2)", source: "teacher" },
    { prompt: "Milyen hosszú a b(5; 12) vektor?", options: [17, 13, 169, 60], correctIndex: 1, explanation: "|b| = √(5² + 12²) = √(25 + 144) = √169 = 13.", calc: "sqrt(5^2+12^2)", source: "teacher" },
    { prompt: "Mekkora az A(1; 2) és a B(4; 6) pontok távolsága?", options: [7, 25, 5, 3], correctIndex: 2, explanation: "AB = √((4 − 1)² + (6 − 2)²) = √(9 + 16) = √25 = 5.", calc: "sqrt((4-1)^2+(6-2)^2)", source: "teacher" },
    { prompt: "Mekkora az A(−2; 1) és a B(4; 9) pontok távolsága?", options: [14, 100, 8, 10], correctIndex: 3, explanation: "AB = √((4 − (−2))² + (9 − 1)²) = √(36 + 64) = √100 = 10.", calc: "sqrt((4-(-2))^2+(9-1)^2)", source: "teacher" },
    { prompt: "Mennyi az A(2; 5) és B(8; 1) pontokat összekötő szakasz felezőpontjának első koordinátája?", options: [5, 10, 3, 6], correctIndex: 0, explanation: "A felezőpont első koordinátája (2 + 8) ÷ 2 = 10 ÷ 2 = 5.", calc: "(2+8)/2", source: "teacher" },
    { prompt: "Mennyi az A(−4; 7) és B(6; −3) pontokat összekötő szakasz felezőpontjának második koordinátája?", options: [5, 2, 4, -5], correctIndex: 1, explanation: "A felezőpont második koordinátája (7 + (−3)) ÷ 2 = 4 ÷ 2 = 2.", calc: "(7+(-3))/2", source: "teacher" },
    { prompt: "Az AB szakasz felezőpontja F(5; 1), és A(3; −2). Mennyi a B pont első koordinátája?", options: [4, 8, 7, 2], correctIndex: 2, explanation: "(3 + x) ÷ 2 = 5, így x = 2 × 5 − 3 = 10 − 3 = 7.", calc: "2*5-3", source: "teacher" },
    { prompt: "Milyen hosszú az a(1; 2) és b(2; 2) vektorok összege?", options: [7, 25, 6, 5], correctIndex: 3, explanation: "a + b = (1 + 2; 2 + 2) = (3; 4), hossza √(3² + 4²) = √25 = 5.", calc: "sqrt((1+2)^2+(2+2)^2)", source: "teacher" },
    { prompt: "Mennyi log₃ 54 − log₃ 2?", options: [3, 52, 27, 2], correctIndex: 0, explanation: "log₃ 54 − log₃ 2 = log₃ (54 ÷ 2) = log₃ 27 = 3, mert 3³ = 27.", calc: "log(3,54)-log(3,2)", source: "teacher" },
    { prompt: "Mennyi lg 20 + lg 5?", options: [25, 2, 1, 100], correctIndex: 1, explanation: "lg 20 + lg 5 = lg (20 × 5) = lg 100 = 2.", calc: "lg(20)+lg(5)", source: "teacher" },
    { prompt: "Mennyi log₂ (8 · 16)?", options: [12, 128, 7, 24], correctIndex: 2, explanation: "log₂ (8 × 16) = log₂ 8 + log₂ 16 = 3 + 4 = 7 (8 × 16 = 128 = 2⁷).", calc: "log(2,8*16)", source: "teacher" },
    { prompt: "Mennyi log₂ (64 : 4)?", options: [16, 6, 2, 4], correctIndex: 3, explanation: "64 ÷ 4 = 16 = 2⁴, így log₂ 16 = 4 (vagy 6 − 2 = 4).", calc: "log(2,64/4)", source: "teacher" },
    { prompt: "Oldd meg: 5ˣ⁻¹ = 125. Mennyi x?", options: [4, 3, 25, 5], correctIndex: 0, explanation: "125 = 5³, így x − 1 = 3, tehát x = 3 + 1 = 4.", calc: "log(5,125)+1", source: "teacher" },
    { prompt: "Oldd meg: 4ˣ = 8. Mennyi x?", options: [2, 1.5, 0.5, 3], correctIndex: 1, explanation: "4ˣ = 2²ˣ és 8 = 2³, így 2x = 3, x = 3 ÷ 2 = 1,5.", calc: "log(4,8)", source: "teacher" },
  ],
  12: [
    { prompt: "Mennyi 5! (5 faktoriális)?", options: [24, 60, 120, 720], correctIndex: 2, explanation: "5! = 5 × 4 × 3 × 2 × 1 = 120.", calc: "fact(5)", source: "teacher" },
    { prompt: "6 tanulóból 2-t választunk ki egy feladatra (a sorrend nem számít). Hányféleképpen tehetjük meg?", options: [30, 12, 36, 15], correctIndex: 3, explanation: "Kombináció: C(6; 2) = 6 × 5 ÷ 2 = 15.", calc: "C(6,2)", source: "teacher" },
    { prompt: "5 futó közül hányféleképpen alakulhat az 1. és a 2. hely?", options: [20, 10, 25, 120], correctIndex: 0, explanation: "Variáció, a sorrend számít: 5 × 4 = 20.", calc: "P(5,2)", source: "teacher" },
    { prompt: "Hány négyjegyű kód készíthető csak az 1, 2, 3 számjegyekből, ha egy számjegy többször is szerepelhet?", options: [64, 81, 12, 24], correctIndex: 1, explanation: "Ismétléses variáció: minden helyre 3 lehetőség, 3 × 3 × 3 × 3 = 3⁴ = 81.", calc: "3^4", source: "teacher" },
    { prompt: "Hányféleképpen ülhet le 4 barát egy padra egymás mellé?", options: [16, 12, 24, 256], correctIndex: 2, explanation: "Permutáció: 4! = 4 × 3 × 2 × 1 = 24.", calc: "fact(4)", source: "teacher" },
    { prompt: "5 különböző könyvből 3-at viszünk el nyaralni. Hányféleképpen választhatunk?", options: [60, 15, 125, 10], correctIndex: 3, explanation: "Kombináció: C(5; 3) = 5 × 4 × 3 ÷ (3 × 2 × 1) = 60 ÷ 6 = 10.", calc: "C(5,3)", source: "teacher" },
    { prompt: "Egy érmét 5-ször feldobunk. Hány különböző fej-írás sorozat lehetséges?", options: [32, 10, 25, 120], correctIndex: 0, explanation: "Minden dobásnál 2 lehetőség: 2 × 2 × 2 × 2 × 2 = 2⁵ = 32.", calc: "2^5", source: "teacher" },
    { prompt: "Hány különböző sorrendje van az A, A, B, C betűknek?", options: [24, 12, 6, 4], correctIndex: 1, explanation: "Ismétléses permutáció: 4! ÷ 2! = 24 ÷ 2 = 12.", calc: "fact(4)/fact(2)", source: "teacher" },
    { prompt: "Egy társaságban 8 ember van, mindenki mindenkivel egyszer kezet fog. Hány kézfogás történik?", options: [56, 64, 28, 16], correctIndex: 2, explanation: "C(8; 2) = 8 × 7 ÷ 2 = 56 ÷ 2 = 28 kézfogás.", calc: "8*7/2", source: "teacher" },
    { prompt: "Hány átlója van egy konvex hatszögnek?", options: [18, 15, 6, 9], correctIndex: 3, explanation: "Átlók száma: n × (n − 3) ÷ 2 = 6 × 3 ÷ 2 = 9.", calc: "6*(6-3)/2", source: "teacher" },
    { prompt: "Szabályos dobókockával dobunk. Mennyi a valószínűsége, hogy páros számot dobunk? Tizedes törtként add meg!", options: [0.5, 0.25, 0.6, 0.75], correctIndex: 0, explanation: "Kedvező: 2, 4, 6 → 3 eset az összes 6-ból: 3 ÷ 6 = 0,5.", calc: "3/6", source: "teacher" },
    { prompt: "Két szabályos érmét feldobunk. Mennyi a valószínűsége, hogy mindkettő fej? Tizedes törtként add meg!", options: [0.5, 0.25, 0.75, 0.125], correctIndex: 1, explanation: "Független események: 0,5 × 0,5 = 0,25.", calc: "0.5*0.5", source: "teacher" },
    { prompt: "Három szabályos érmét feldobunk. Mennyi a valószínűsége, hogy mindhárom fej? Tizedes törtként add meg!", options: [0.375, 0.25, 0.125, 0.5], correctIndex: 2, explanation: "Összes eset 2³ = 8, kedvező 1: 1 ÷ 8 = 0,125.", calc: "1/2^3", source: "teacher" },
    { prompt: "Három szabályos érmét feldobunk. Mennyi a valószínűsége, hogy pontosan kettő fej? Tizedes törtként add meg!", options: [0.125, 0.25, 0.5, 0.375], correctIndex: 3, explanation: "Kedvező C(3; 2) = 3 eset, összes 2³ = 8: 3 ÷ 8 = 0,375.", calc: "C(3,2)/2^3", source: "teacher" },
    { prompt: "Két szabályos dobókockával dobunk. Mennyi a valószínűsége, hogy mindkettőn páros szám áll? Tizedes törtként add meg!", options: [0.25, 0.5, 0.125, 0.75], correctIndex: 0, explanation: "Egy kockán a páros esélye 3 ÷ 6 = 0,5; két kockán 0,5 × 0,5 = 0,25.", calc: "(3/6)*(3/6)", source: "teacher" },
    { prompt: "Egy urnában 3 piros és 5 kék golyó van. Egyet húzunk. Mennyi a valószínűsége, hogy piros? Tizedes törtként add meg!", options: [0.6, 0.375, 0.625, 0.3], correctIndex: 1, explanation: "Kedvező 3, összes 3 + 5 = 8: 3 ÷ 8 = 0,375.", calc: "3/(3+5)", source: "teacher" },
    { prompt: "Egy dobozban 7 fehér és 3 fekete golyó van. Egyet húzunk. Mennyi a valószínűsége, hogy fekete? Tizedes törtként add meg!", options: [0.7, 0.5, 0.3, 0.1], correctIndex: 2, explanation: "Kedvező 3, összes 7 + 3 = 10: 3 ÷ 10 = 0,3.", calc: "3/(7+3)", source: "teacher" },
    { prompt: "Egy 20 lapos pakliban 5 ász van. Egy lapot húzunk. Mennyi a valószínűsége, hogy ászt húzunk? Tizedes törtként add meg!", options: [0.2, 0.05, 0.5, 0.25], correctIndex: 3, explanation: "Kedvező 5, összes 20: 5 ÷ 20 = 0,25.", calc: "5/20", source: "teacher" },
    { prompt: "Urnában 2 piros és 3 fehér golyó van. Visszatevéssel kétszer húzunk. Mennyi a valószínűsége, hogy mindkettő piros? Tizedes törtként!", options: [0.16, 0.4, 0.1, 0.8], correctIndex: 0, explanation: "Egy húzásnál 2 ÷ 5 = 0,4; visszatevéssel 0,4 × 0,4 = 0,16.", calc: "(2/5)*(2/5)", source: "teacher" },
    { prompt: "Urnában 2 piros és 3 fehér golyó van. Visszatevés nélkül kétszer húzunk. Mennyi a valószínűsége, hogy mindkettő piros? Tizedes törtként!", options: [0.16, 0.1, 0.4, 0.2], correctIndex: 1, explanation: "Először 2 ÷ 5, utána 1 ÷ 4 marad: 0,4 × 0,25 = 0,1.", calc: "(2/5)*(1/4)", source: "teacher" },
    { prompt: "Egy lövő 0,8 valószínűséggel talál. Két független lövésből mennyi a valószínűsége, hogy mindkettő talál? Tizedes törtként add meg!", options: [1.6, 0.8, 0.64, 0.36], correctIndex: 2, explanation: "Független lövések: 0,8 × 0,8 = 0,64.", calc: "0.8*0.8", source: "teacher" },
    { prompt: "Egy lövő 0,8 valószínűséggel talál. Két független lövésből mennyi a valószínűsége, hogy legalább egy talál? Tizedes törtként!", options: [0.64, 0.8, 0.04, 0.96], correctIndex: 3, explanation: "Ellentett esemény: egyik sem talál, 0,2 × 0,2 = 0,04; így 1 − 0,04 = 0,96.", calc: "1-(1-0.8)^2", source: "teacher" },
    { prompt: "Mennyi a 3, 5, 6, 10, 11 számok átlaga?", options: [7, 6, 8, 35], correctIndex: 0, explanation: "Összeg: 3 + 5 + 6 + 10 + 11 = 35; átlag 35 ÷ 5 = 7.", calc: "(3+5+6+10+11)/5", source: "teacher" },
    { prompt: "Mennyi a 2, 9, 4, 7, 11, 5 adatsor mediánja?", options: [5.5, 6, 7, 4.5], correctIndex: 1, explanation: "Sorba rendezve: 2, 4, 5, 7, 9, 11; a két középső átlaga (5 + 7) ÷ 2 = 6.", calc: "(5+7)/2", source: "teacher" },
    { prompt: "Mennyi a 3, 5, 5, 6, 7, 7, 7, 9 adatsor módusza?", options: [5, 6.125, 7, 3], correctIndex: 2, explanation: "A 7 szerepel a legtöbbször (3-szor), a 5 csak 2-szer: módusz = 7.", calc: "7", source: "teacher" },
    { prompt: "Mennyi a 12, 4, 19, 7, 15 adatsor terjedelme?", options: [12, 11, 19, 15], correctIndex: 3, explanation: "Terjedelem = legnagyobb − legkisebb = 19 − 4 = 15.", calc: "19-4", source: "teacher" },
    { prompt: "Egy tanuló jegyei: 5, 4, 3, 5, 4, 3. Mennyi a jegyei átlaga?", options: [4, 4.5, 3.5, 24], correctIndex: 0, explanation: "Összeg: 5 + 4 + 3 + 5 + 4 + 3 = 24; átlag 24 ÷ 6 = 4.", calc: "(5+4+3+5+4+3)/6", source: "teacher" },
    { prompt: "Egy dolgozatra 10 tanuló 4-est, 5 tanuló 5-öst, 5 tanuló 2-est kapott. Mennyi az osztályátlag?", options: [3.667, 3.75, 3.5, 4], correctIndex: 1, explanation: "Súlyozott átlag: (10 × 4 + 5 × 5 + 5 × 2) ÷ 20 = (40 + 25 + 10) ÷ 20 = 75 ÷ 20 = 3,75.", calc: "(10*4+5*5+5*2)/(10+5+5)", source: "teacher" },
    { prompt: "Mennyi a 15, 8, 22, 11, 19, 30, 6 adatsor mediánja?", options: [19, 22, 15, 11], correctIndex: 2, explanation: "Sorba rendezve: 6, 8, 11, 15, 19, 22, 30; 7 adat közül a 4. a középső = 15.", calc: "15", source: "teacher" },
    { prompt: "Öt szám átlaga 7. Négy közülük: 4, 5, 7, 8. Mennyi az ötödik szám?", options: [7, 6, 35, 11], correctIndex: 3, explanation: "Az öt szám összege 5 × 7 = 35; a négy ismert összege 4 + 5 + 7 + 8 = 24; 35 − 24 = 11.", calc: "5*7-(4+5+7+8)", source: "teacher" },
    { prompt: "Dobókockával dobunk, és a dobott számmal egyező forintot nyerünk. Mennyi a nyeremény várható értéke forintban?", options: [3.5, 3, 21, 6], correctIndex: 0, explanation: "E = (1 + 2 + 3 + 4 + 5 + 6) ÷ 6 = 21 ÷ 6 = 3,5 Ft.", calc: "(1+2+3+4+5+6)/6", source: "teacher" },
    { prompt: "Egy játékban 0,25 valószínűséggel 100 pontot nyerünk, különben 0 pontot. Mennyi a nyert pontok várható értéke?", options: [50, 25, 100, 75], correctIndex: 1, explanation: "E = 0,25 × 100 + 0,75 × 0 = 25 pont.", calc: "0.25*100", source: "teacher" },
    { prompt: "Sorsjátékban 0,1 eséllyel 400 Ft-ot nyerünk, 0,9 eséllyel 50 Ft-ot vesztünk. Mennyi a nyereség várható értéke forintban?", options: [40, 350, -5, 5], correctIndex: 2, explanation: "E = 0,1 × 400 − 0,9 × 50 = 40 − 45 = −5 Ft.", calc: "0.1*400-0.9*50", source: "teacher" },
    { prompt: "Két szabályos érmét dobunk, minden fejért 10 pont jár. Mennyi a pontszám várható értéke?", options: [20, 5, 15, 10], correctIndex: 3, explanation: "Egy érmén a várható pont 0,5 × 10 = 5; két érmén 2 × 5 = 10.", calc: "2*0.5*10", source: "teacher" },
    { prompt: "10 000 Ft-ot évi 10%-os kamatos kamatra teszünk be. Mennyi lesz 2 év múlva forintban?", options: [12100, 12000, 11000, 12210], correctIndex: 0, explanation: "10 000 × 1,1 = 11 000, majd 11 000 × 1,1 = 12 100 Ft (10 000 × 1,1² = 12 100).", calc: "10000*1.1^2", source: "teacher" },
    { prompt: "20 000 Ft-ot évi 5%-os kamatos kamatra teszünk be. Mennyi lesz 2 év múlva forintban?", options: [22000, 22050, 21000, 22100], correctIndex: 1, explanation: "20 000 × 1,05 = 21 000, majd 21 000 × 1,05 = 22 050 Ft.", calc: "20000*1.05^2", source: "teacher" },
    { prompt: "50 000 Ft-ot évi 20%-os kamatos kamatra teszünk be. Mennyi lesz 2 év múlva forintban?", options: [70000, 60000, 72000, 74400], correctIndex: 2, explanation: "50 000 × 1,2² = 50 000 × 1,44 = 72 000 Ft.", calc: "50000*1.2^2", source: "teacher" },
    { prompt: "Egy 400 000 Ft-os gép értéke évente 10%-kal csökken. Mennyi lesz az értéke 2 év múlva forintban?", options: [320000, 360000, 328000, 324000], correctIndex: 3, explanation: "400 000 × 0,9 = 360 000, majd 360 000 × 0,9 = 324 000 Ft.", calc: "400000*0.9^2", source: "teacher" },
    { prompt: "Egy henger alapkörének sugara 2 cm, magassága 5 cm. Mennyi a térfogata cm³-ben, ha π ≈ 3?", options: [60, 30, 120, 20], correctIndex: 0, explanation: "V = r² × π × m = 2² × 3 × 5 = 4 × 3 × 5 = 60 cm³.", calc: "3*2^2*5", source: "teacher" },
    { prompt: "Egy kúp alapkörének sugara 3 cm, magassága 4 cm. Mennyi a térfogata cm³-ben, ha π ≈ 3,14?", options: [113.04, 37.68, 12, 75.36], correctIndex: 1, explanation: "V = r² × π × m ÷ 3 = 9 × 3,14 × 4 ÷ 3 = 3,14 × 12 = 37,68 cm³.", calc: "3.14*3^2*4/3", source: "teacher" },
    { prompt: "Egy mértani sorozat első tagja 5, hányadosa 2. Mennyi az első 4 tag összege?", options: [40, 80, 75, 150], correctIndex: 2, explanation: "5 + 10 + 20 + 40 = 75; képlettel S₄ = 5 × (2⁴ − 1) ÷ (2 − 1) = 5 × 15 = 75.", calc: "5*(2^4-1)/(2-1)", source: "teacher" },
  ],
};

function generatedTaskForGrade(level: GradeLevel): MathTask {
  let prompt: string | null = null;
  let result: number | null = null;
  // Minden évfolyam-ág beállítja; ha egyik sem futna, a védelmi fallback tölti ki.
  let explanation = "";
  /** Az ellenőrző kifejezés (teszt + vak megoldó): a prompt számaiból, a prompt jelentése szerint. */
  let calc = "";
  const t = randInt(0, GENERATOR_TEMPLATES[level] - 1);
  const f = formatMathNumber;

  if (level === 3) {
    if (t === 0) {
      const a = randInt(100, 600);
      const b = randInt(10, 399);
      prompt = `${a} + ${b} = ?`;
      result = a + b;
      explanation = `${a} + ${b} = ${a + b}.`;
      calc = `${a}+${b}`;
    } else if (t === 1) {
      const a = randInt(50, 999);
      const b = randInt(10, a - 10);
      prompt = `${a} - ${b} = ?`;
      result = a - b;
      explanation = `${a} - ${b} = ${a - b}.`;
      calc = `${a}-${b}`;
    } else if (t === 2) {
      const a = randInt(2, 10);
      const b = randInt(2, 10);
      prompt = `${a} × ${b} = ?`;
      result = a * b;
      explanation = `${a} × ${b} = ${a * b}.`;
      calc = `${a}*${b}`;
    } else if (t === 3) {
      const b = randInt(2, 10);
      const r = randInt(2, 10);
      prompt = `${b * r} ÷ ${b} = ?`;
      result = r;
      explanation = `${b * r} ÷ ${b} = ${r}, mert ${b} × ${r} = ${b * r}.`;
      calc = `${b * r}/${b}`;
    } else if (t === 4) {
      const a = randInt(6, 60);
      const b = randInt(4, 39);
      prompt = `Dóri ${a} matricát ragasztott a füzetére, majd kapott még ${b}-et. Hány matrica van most összesen?`;
      result = a + b;
      explanation = `${a} + ${b} = ${a + b} matrica.`;
      calc = `${a}+${b}`;
    } else if (t === 5) {
      const boxes = randInt(2, 9);
      const each = randInt(3, 10);
      prompt = `${boxes} dobozban dobozonként ${each} ceruza van. Hány ceruza van összesen?`;
      result = boxes * each;
      explanation = `Dobozonként ${each}, ${boxes} dobozban: ${boxes} × ${each} = ${boxes * each} ceruza.`;
      calc = `${boxes}*${each}`;
    } else if (t === 6) {
      const kids = randInt(2, 9);
      const each = randInt(2, 10);
      prompt = `${kids * each} szem cukrot ${kids} gyerek között egyenlően osztunk el. Hány szem jut egy gyereknek?`;
      result = each;
      explanation = `${kids * each} ÷ ${kids} = ${each} szem, mert ${kids} × ${each} = ${kids * each}.`;
      calc = `${kids * each}/${kids}`;
    } else if (t === 7) {
      const n = 2 * randInt(10, 150);
      prompt = `Mennyi a(z) ${n} fele?`;
      result = n / 2;
      explanation = `A fele: ${n} ÷ 2 = ${n / 2}.`;
      calc = `${n}/2`;
    } else {
      const meters = randInt(2, 9);
      const extra = randInt(1, 99);
      prompt = `Hány centiméter ${meters} méter és ${extra} centiméter?`;
      result = meters * 100 + extra;
      explanation = `1 m = 100 cm, így ${meters} × 100 + ${extra} = ${meters * 100 + extra} cm.`;
      calc = `${meters}*100+${extra}`;
    }
  } else if (level === 4) {
    if (t === 0) {
      const a = randInt(1000, 7999);
      const b = randInt(100, 1999);
      prompt = `${a} + ${b} = ?`;
      result = a + b;
      explanation = `${a} + ${b} = ${a + b}.`;
      calc = `${a}+${b}`;
    } else if (t === 1) {
      const a = randInt(1000, 9999);
      const b = randInt(100, a - 100);
      prompt = `${a} - ${b} = ?`;
      result = a - b;
      explanation = `${a} - ${b} = ${a - b}.`;
      calc = `${a}-${b}`;
    } else if (t === 2) {
      const a = randInt(12, 99);
      const b = randInt(3, 9);
      prompt = `${a} × ${b} = ?`;
      result = a * b;
      explanation = `${a} × ${b} = ${a * b}.`;
      calc = `${a}*${b}`;
    } else if (t === 3) {
      const b = randInt(3, 12);
      const r = randInt(4, 25);
      const a = b * r;
      prompt = `${a} ÷ ${b} = ?`;
      result = r;
      explanation = `${a} ÷ ${b} = ${r}, mert ${b} × ${r} = ${a}.`;
      calc = `${a}/${b}`;
    } else if (t === 4) {
      const rows = randInt(3, 9);
      const each = randInt(6, 24);
      prompt = `${rows} polcon polconként ${each} könyv áll (minden polcon ugyanannyi). Hány könyv van összesen?`;
      result = rows * each;
      explanation = `Polconként ${each}, ${rows} polcon: ${rows} × ${each} = ${rows * each} könyv.`;
      calc = `${rows}*${each}`;
    } else if (t === 5) {
      const b = randInt(3, 9);
      const q = randInt(4, 15);
      const r = randInt(1, b - 1);
      const a = b * q + r;
      prompt = `${a} ÷ ${b} — mennyi a maradék?`;
      result = r;
      explanation = `${b} × ${q} = ${b * q}, és ${a} - ${b * q} = ${r}, ez a maradék.`;
      calc = `mod(${a},${b})`;
    } else if (t === 6) {
      const k = pick([2, 3, 4, 5, 6, 8, 10]);
      const j = randInt(1, k - 1);
      const n = k * randInt(3, 15);
      prompt = `${n} darab alma ${j}/${k} része hány darab?`;
      result = (n / k) * j;
      explanation = `Egy ${k}-od rész: ${n} ÷ ${k} = ${n / k}, ennek ${j}-szerese: ${n / k} × ${j} = ${(n / k) * j}.`;
      calc = `${n}/${k}*${j}`;
    } else if (t === 7) {
      const a = randInt(3, 40);
      const b = randInt(3, 40);
      prompt = `Mennyi a ${a} cm és ${b} cm oldalú téglalap kerülete (cm)?`;
      result = 2 * (a + b);
      explanation = `K = 2 × (${a} + ${b}) = 2 × ${a + b} = ${2 * (a + b)} cm.`;
      calc = `2*(${a}+${b})`;
    } else {
      const km = randInt(2, 9);
      const m = randInt(10, 990);
      prompt = `Hány méter ${km} km és ${m} m?`;
      result = km * 1000 + m;
      explanation = `1 km = 1000 m, így ${km} × 1000 + ${m} = ${km * 1000 + m} m.`;
      calc = `${km}*1000+${m}`;
    }
  } else if (level === 5) {
    if (t === 0) {
      const a = randInt(230, 980);
      const b = randInt(120, 760);
      const c = randInt(10, 90);
      prompt = `(${a} + ${b}) - ${c} = ?`;
      result = a + b - c;
      explanation = `Előbb a zárójel: ${a} + ${b} = ${a + b}, majd ${a + b} - ${c} = ${a + b - c}.`;
      calc = `(${a}+${b})-${c}`;
    } else if (t === 1) {
      const a = randInt(12, 36);
      const b = randInt(8, 24);
      const c = randInt(4, 12);
      prompt = `${a} × ${b} - ${c} = ?`;
      result = a * b - c;
      explanation = `Előbb a szorzás: ${a} × ${b} = ${a * b}, majd ${a * b} - ${c} = ${a * b - c}.`;
      calc = `${a}*${b}-${c}`;
    } else if (t === 2) {
      const b = randInt(5, 16);
      const r = randInt(12, 34);
      const a = b * r;
      prompt = `${a} ÷ ${b} = ?`;
      result = r;
      explanation = `${a} ÷ ${b} = ${r}, mert ${b} × ${r} = ${a}.`;
      calc = `${a}/${b}`;
    } else if (t === 3) {
      const a = randInt(40, 120);
      const b = randInt(10, 39);
      const c = randInt(2, 6);
      prompt = `(${a} - ${b}) × ${c} = ?`;
      result = (a - b) * c;
      explanation = `Előbb a zárójel: ${a} - ${b} = ${a - b}, majd ${a - b} × ${c} = ${(a - b) * c}.`;
      calc = `(${a}-${b})*${c}`;
    } else if (t === 4) {
      const n = randInt(8, 24);
      const p = randInt(6, 15);
      prompt = `${n} csapat mindegyike ${p} pontot szerzett ugyanazon a fordulón. Mennyi a pontok összege?`;
      result = n * p;
      explanation = `Csapatonként ${p}, ${n} csapat: ${n} × ${p} = ${n * p} pont.`;
      calc = `${n}*${p}`;
    } else if (t === 5) {
      const a = randInt(11, 99) / 10;
      const b = randInt(11, 99) / 10;
      prompt = `${f(a)} + ${f(b)} = ?`;
      result = round6(a + b);
      explanation = `Tizedesvessző alá tizedesvessző: ${f(a)} + ${f(b)} = ${f(a + b)}.`;
      calc = `${a}+${b}`;
    } else if (t === 6) {
      const k = pick([10, 100, 1000]);
      const q = randInt(12, 480);
      prompt = `${q * k} ÷ ${k} = ?`;
      result = q;
      explanation = `${WITH_POWER_OF_TEN[k]} osztva a szám végéről ${String(k).length - 1} nulla elhagyható: ${q * k} ÷ ${k} = ${q}.`;
      calc = `${q * k}/${k}`;
    } else if (t === 7) {
      const a = randInt(3, 25);
      const b = randInt(3, 25);
      prompt = `Mennyi a ${a} cm és ${b} cm oldalú téglalap területe (cm²)?`;
      result = a * b;
      explanation = `T = a × b = ${a} × ${b} = ${a * b} cm².`;
      calc = `${a}*${b}`;
    } else {
      const avg = randInt(12, 60);
      const x = avg - randInt(1, 10);
      const y = avg + randInt(1, 10);
      const z = 3 * avg - x - y;
      prompt = `Mennyi a ${x}, ${y} és ${z} számok átlaga?`;
      result = avg;
      explanation = `Összeg ÷ darabszám: (${x} + ${y} + ${z}) ÷ 3 = ${x + y + z} ÷ 3 = ${avg}.`;
      calc = `(${x}+${y}+${z})/3`;
    }
  } else if (level === 6) {
    if (t === 0) {
      const p = pick([5, 10, 20, 25, 40, 50, 75]);
      const n = 20 * randInt(2, 30);
      prompt = `Hány forint ${n} Ft ${p}%-a?`;
      result = (n * p) / 100;
      explanation = `${n} × ${p} ÷ 100 = ${(n * p) / 100}.`;
      calc = `${n}*${p}/100`;
    } else if (t === 1) {
      const a = randInt(11, 95) / 10;
      const b = randInt(2, 9);
      prompt = `${f(a)} × ${b} = ?`;
      result = round6(a * b);
      explanation = `${f(a)} × ${b} = ${f(a * b)} (tizedesjegyek száma a szorzatban is egy).`;
      calc = `${a}*${b}`;
    } else if (t === 2) {
      const b = randInt(2, 9);
      const q = randInt(11, 60) / 10;
      const a = round6(q * b);
      prompt = `${f(a)} ÷ ${b} = ?`;
      result = q;
      explanation = `${f(a)} ÷ ${b} = ${f(q)}, mert ${f(q)} × ${b} = ${f(a)}.`;
      calc = `${a}/${b}`;
    } else if (t === 3) {
      const a = randInt(5, 60);
      const b = randInt(5, 60);
      prompt = `(${f(-a)}) + ${b} = ?`;
      result = b - a;
      explanation = `(${f(-a)}) + ${b} = ${b} - ${a} = ${f(b - a)}.`;
      calc = `(-${a})+${b}`;
    } else if (t === 4) {
      const a = 2 * randInt(2, 15);
      const m = randInt(3, 20);
      prompt = `Mennyi annak a háromszögnek a területe (cm²), amelynek egyik oldala ${a} cm, a hozzá tartozó magasság ${m} cm?`;
      result = (a * m) / 2;
      explanation = `T = a × m ÷ 2 = ${a} × ${m} ÷ 2 = ${(a * m) / 2} cm².`;
      calc = `${a}*${m}/2`;
    } else if (t === 5) {
      const x = randInt(1, 5);
      const y = randInt(x + 1, 9);
      const unit = randInt(3, 20);
      const total = (x + y) * unit;
      prompt = `${total} Ft-ot ${x} : ${y} arányban osztunk szét. Mennyi a nagyobbik rész (Ft)?`;
      result = y * unit;
      explanation = `Egy rész: ${total} ÷ (${x} + ${y}) = ${unit}, a nagyobbik ${y} × ${unit} = ${y * unit} Ft.`;
      calc = `${total}/(${x}+${y})*${y}`;
    } else if (t === 6) {
      const [a, b] = pick([[1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [1, 8], [3, 8]] as const);
      const [c, d] = pick([[1, 2], [1, 4], [3, 4], [1, 5], [4, 5], [1, 10], [7, 10]] as const);
      prompt = `Mennyi ${a}/${b} + ${c}/${d}? (tizedes törtként)`;
      result = round6(a / b + c / d);
      explanation = `${a}/${b} = ${f(a / b)} és ${c}/${d} = ${f(c / d)}, így ${f(a / b)} + ${f(c / d)} = ${f(a / b + c / d)}.`;
      calc = `${a}/${b}+${c}/${d}`;
    } else {
      const g = randInt(2, 12);
      const p = pick([[2, 3], [3, 4], [2, 5], [3, 5], [4, 5], [5, 6]] as const);
      const a = g * p[0];
      const b = g * p[1];
      prompt = `Mennyi ${a} és ${b} legnagyobb közös osztója?`;
      result = g;
      explanation = `${a} = ${p[0]} × ${g} és ${b} = ${p[1]} × ${g}; a ${p[0]} és ${p[1]} relatív prímek, így az lnko ${g}.`;
      calc = `gcd(${a},${b})`;
    }
  } else if (level === 7) {
    if (t === 0) {
      const a = randInt(2, 15);
      const b = randInt(2, 12);
      prompt = `(${f(-a)}) × ${b} = ?`;
      result = -a * b;
      explanation = `Negatív × pozitív = negatív: (${f(-a)}) × ${b} = ${f(-a * b)}.`;
      calc = `(-${a})*${b}`;
    } else if (t === 1) {
      const b = randInt(2, 12);
      const r = randInt(2, 15);
      prompt = `(${f(-b * r)}) ÷ (${f(-b)}) = ?`;
      result = r;
      explanation = `Negatív ÷ negatív = pozitív: ${b * r} ÷ ${b} = ${r}.`;
      calc = `(-${b * r})/(-${b})`;
    } else if (t === 2) {
      const base = pick([2, 3, 4, 5, -2, -3]);
      const e = base === 2 || base === -2 ? randInt(2, 7) : randInt(2, 4);
      prompt = `Mennyi ${base < 0 ? `(${f(base)})` : base}${sup(e)}?`;
      result = base ** e;
      explanation = `${Array.from({ length: e }, () => paren(base)).join(" × ")} = ${f(base ** e)}.`;
      calc = `(${base})^${e}`;
    } else if (t === 3) {
      const a = randInt(2, 9);
      const x = randInt(-6, 15);
      const b = randInt(1, 30);
      const c = a * x + b;
      prompt = `Oldd meg: ${a}x + ${b} = ${f(c)}. Mennyi x?`;
      result = x;
      explanation = `${a}x = ${f(c)} - ${b} = ${f(c - b)}, így x = ${f(c - b)} ÷ ${a} = ${f(x)}.`;
      calc = `(${c}-${b})/${a}`;
    } else if (t === 4) {
      const p = pick([5, 10, 20, 25, 50]);
      const n = 20 * randInt(2, 40);
      prompt = `Egy ${n} Ft-os ár ${p}%-kal nő. Mennyi az új ár (Ft)?`;
      result = (n * (100 + p)) / 100;
      explanation = `${n} × ${f((100 + p) / 100)} = ${f((n * (100 + p)) / 100)} Ft (${100 + p}%).`;
      calc = `${n}*(100+${p})/100`;
    } else if (t === 5) {
      const p = pick([10, 20, 25, 40, 50]);
      const n = 20 * randInt(2, 40);
      prompt = `Egy ${n} Ft-os árat ${p}%-kal csökkentenek. Mennyi az új ár (Ft)?`;
      result = (n * (100 - p)) / 100;
      explanation = `${n} × ${f((100 - p) / 100)} = ${f((n * (100 - p)) / 100)} Ft (${100 - p}%).`;
      calc = `${n}*(100-${p})/100`;
    } else if (t === 6) {
      const a = randInt(20, 100);
      const b = randInt(20, 150 - a);
      prompt = `Egy háromszög két szöge ${a}° és ${b}°. Hány fokos a harmadik szög?`;
      result = 180 - a - b;
      explanation = `A belső szögek összege 180°: 180 - ${a} - ${b} = ${180 - a - b}°.`;
      calc = `180-${a}-${b}`;
    } else {
      const a = randInt(2, 30);
      const b = randInt(2, 9);
      const c = randInt(2, 9);
      const d = randInt(1, 20);
      prompt = `${a} + ${b} × ${c} - ${d} = ?`;
      result = a + b * c - d;
      explanation = `Előbb a szorzás: ${b} × ${c} = ${b * c}, majd ${a} + ${b * c} - ${d} = ${f(a + b * c - d)}.`;
      calc = `${a}+${b}*${c}-${d}`;
    }
  } else if (level === 8) {
    if (t === 0) {
      const a = randInt(2, 9);
      const x = randInt(-5, 12);
      const b = randInt(1, 12);
      const c = a * (x + b);
      prompt = `Oldd meg: ${a}(x + ${b}) = ${f(c)}. Mennyi x?`;
      result = x;
      explanation = `x + ${b} = ${f(c)} ÷ ${a} = ${f(x + b)}, így x = ${f(x + b)} - ${b} = ${f(x)}.`;
      calc = `${c}/${a}-${b}`;
    } else if (t === 1) {
      const n = randInt(11, 30);
      prompt = `Mennyi √${n * n}?`;
      result = n;
      explanation = `√${n * n} = ${n}, mert ${n} × ${n} = ${n * n}.`;
      calc = `sqrt(${n * n})`;
    } else if (t === 2) {
      const [p, q, r] = pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [6, 8, 10]] as const);
      const k = randInt(1, 5);
      prompt = `Egy derékszögű háromszög befogói ${p * k} cm és ${q * k} cm. Hány cm az átfogó?`;
      result = r * k;
      explanation = `c² = ${p * k}² + ${q * k}² = ${p * p * k * k} + ${q * q * k * k} = ${r * r * k * k}, így c = ${r * k} cm.`;
      calc = `sqrt(${p * k}^2+${q * k}^2)`;
    } else if (t === 3) {
      const a = randInt(2, 15);
      const b = randInt(2, 12);
      const c = randInt(2, 10);
      prompt = `Mennyi a ${a} cm × ${b} cm × ${c} cm-es téglatest térfogata (cm³)?`;
      result = a * b * c;
      explanation = `V = a × b × c = ${a} × ${b} × ${c} = ${a * b * c} cm³.`;
      calc = `${a}*${b}*${c}`;
    } else if (t === 4) {
      const total = pick([12, 18, 24, 30, 36, 48, 60, 72]);
      const divisors = [2, 3, 4, 6, 8, 12].filter((d) => total % d === 0);
      const w = pick(divisors);
      const w2 = pick(divisors.filter((d) => d !== w));
      prompt = `${w} munkás ${total / w} nap alatt végez egy munkával. Hány nap alatt végez vele ${w2} munkás (ugyanolyan tempóban)?`;
      result = total / w2;
      explanation = `Fordított arányosság: ${w} × ${total / w} = ${total} munkanap, és ${total} ÷ ${w2} = ${total / w2} nap.`;
      calc = `${w}*${total / w}/${w2}`;
    } else if (t === 5) {
      const base = pick([2, 3, 5, 10]);
      const a = randInt(2, 9);
      const b = randInt(2, 9);
      prompt = `${base}${sup(a)} · ${base}${sup(b)} = ${base}^? — mennyi a kitevő?`;
      result = a + b;
      explanation = `Azonos alapú hatványok szorzásakor a kitevők összeadódnak: ${a} + ${b} = ${a + b}.`;
      calc = `${a}+${b}`;
    } else if (t === 6) {
      const kg = randInt(2, 6);
      const unit = 10 * randInt(20, 90);
      const m = randInt(2, 12);
      prompt = `${kg} kg alma ${kg * unit} Ft. Mennyibe kerül ${m} kg (Ft)?`;
      result = unit * m;
      explanation = `Egyenes arányosság: 1 kg = ${kg * unit} ÷ ${kg} = ${unit} Ft, így ${m} × ${unit} = ${unit * m} Ft.`;
      calc = `${kg * unit}/${kg}*${m}`;
    } else {
      const mant = randInt(11, 99) / 10;
      const e = randInt(2, 5);
      prompt = `Mennyi ${f(mant)} · 10${sup(e)}?`;
      result = round6(mant * 10 ** e);
      explanation = `10${sup(e)} = ${10 ** e}, így ${f(mant)} × ${10 ** e} = ${f(mant * 10 ** e)}.`;
      calc = `${mant}*10^${e}`;
    }
  } else if (level === 9) {
    if (t === 0) {
      const a = randInt(1, 4);
      const b = randInt(1, 6) * pick([1, -1]);
      const c = randInt(1, 9) * pick([1, -1]);
      const x = randInt(-4, 5);
      prompt = `Mennyi ${a === 1 ? "" : a}x² ${b < 0 ? "−" : "+"} ${Math.abs(b)}x ${c < 0 ? "−" : "+"} ${Math.abs(c)}, ha x = ${f(x)}?`;
      result = a * x * x + b * x + c;
      explanation = `${a} × ${paren(x)}² + ${paren(b)} × ${paren(x)} + ${paren(c)} = ${a * x * x} + ${paren(b * x)} + ${paren(c)} = ${f(a * x * x + b * x + c)}.`;
      calc = `${a}*(${x})^2+(${b})*(${x})+(${c})`;
    } else if (t === 1) {
      const a = randInt(-5, 6) || 2;
      const b = randInt(-10, 10);
      const x = randInt(-6, 8);
      prompt = `f(x) = ${a}x ${b < 0 ? "−" : "+"} ${Math.abs(b)}. Mennyi f(${f(x)})?`;
      result = a * x + b;
      explanation = `f(${f(x)}) = ${paren(a)} × ${paren(x)} + ${paren(b)} = ${f(a * x)} + ${paren(b)} = ${f(a * x + b)}.`;
      calc = `(${a})*(${x})+(${b})`;
    } else if (t === 2) {
      const m = randInt(-4, 5) || 3;
      const x1 = randInt(-5, 3);
      const dx = randInt(1, 5);
      const y1 = randInt(-8, 8);
      const x2 = x1 + dx;
      const y2 = y1 + m * dx;
      prompt = `Mennyi az A(${f(x1)}; ${f(y1)}) és B(${f(x2)}; ${f(y2)}) pontokon átmenő egyenes meredeksége?`;
      result = m;
      explanation = `m = (${f(y2)} - ${paren(y1)}) ÷ (${f(x2)} - ${paren(x1)}) = ${f(y2 - y1)} ÷ ${dx} = ${f(m)}.`;
      calc = `((${y2})-(${y1}))/((${x2})-(${x1}))`;
    } else if (t === 3) {
      const a = pick([2, 3, 4, 5, -2, -3]);
      const x0 = randInt(-6, 8);
      const b = -a * x0;
      prompt = `Hol metszi az x tengelyt az f(x) = ${a}x ${b < 0 ? "−" : "+"} ${Math.abs(b)} függvény? (x = ?)`;
      result = x0;
      explanation = `${a}x ${b < 0 ? "−" : "+"} ${Math.abs(b)} = 0, így x = ${f(-b)} ÷ ${paren(a)} = ${f(x0)}.`;
      calc = `(-(${b}))/(${a})`;
    } else if (t === 4) {
      const x = randInt(-5, 12);
      const y = randInt(-5, 12);
      prompt = `x + y = ${f(x + y)} és x − y = ${f(x - y)}. Mennyi x?`;
      result = x;
      explanation = `A két egyenlet összege: 2x = ${f(x + y)} + ${paren(x - y)} = ${f(2 * x)}, így x = ${f(2 * x)} ÷ 2 = ${f(x)}.`;
      calc = `((${x + y})+(${x - y}))/2`;
    } else if (t === 5) {
      const a = randInt(21, 99);
      const d = randInt(1, Math.min(9, a - 11));
      const b = a - 2 * d;
      prompt = `Mennyi ${a}² − ${b}²?`;
      result = a * a - b * b;
      explanation = `a² − b² = (a − b)(a + b) = (${a} − ${b}) × (${a} + ${b}) = ${a - b} × ${a + b} = ${a * a - b * b}.`;
      calc = `${a}^2-${b}^2`;
    } else if (t === 6) {
      const both = randInt(2, 10);
      const a = both + randInt(3, 20);
      const b = both + randInt(3, 20);
      prompt = `Egy osztályban ${a} tanuló focizik, ${b} kosarazik, ${both} mindkettőt. Hányan űzik legalább az egyiket?`;
      result = a + b - both;
      explanation = `|A ∪ B| = |A| + |B| − |A ∩ B| = ${a} + ${b} - ${both} = ${a + b - both}.`;
      calc = `${a}+${b}-${both}`;
    } else {
      const y = 20 * randInt(2, 25);
      const p = pick([5, 10, 15, 20, 25, 30, 40, 60, 75]);
      const x = (y * p) / 100;
      prompt = `${f(x)} Ft hány százaléka ${y} Ft-nak?`;
      result = p;
      explanation = `${f(x)} ÷ ${y} × 100 = ${p}%.`;
      calc = `${x}/${y}*100`;
    }
  } else if (level === 10) {
    if (t === 0) {
      const r1 = randInt(-6, 8);
      const r2 = randInt(-6, 8);
      const hi = Math.max(r1, r2);
      const lo = Math.min(r1, r2);
      const b = -(r1 + r2);
      const c = r1 * r2;
      prompt = `Mennyi az ${quadText(b, c)} = 0 egyenlet ${hi === lo ? "(kétszeres) gyöke" : "nagyobbik gyöke"}?`;
      result = hi;
      explanation = `Szorzattá alakítva (x ${lo < 0 ? "+" : "−"} ${Math.abs(lo)})(x ${hi < 0 ? "+" : "−"} ${Math.abs(hi)}) = 0, a gyökök ${f(lo)} és ${f(hi)}; a keresett: ${f(hi)}.`;
      calc = `(-(${b})+sqrt((${b})^2-4*(${c})))/2`;
    } else if (t === 1) {
      const a = pick([1, 2, 3]);
      const r1 = randInt(-5, 6);
      const r2 = randInt(-5, 6);
      const b = -a * (r1 + r2);
      const c = a * r1 * r2;
      prompt = `Mennyi a ${a === 1 ? "" : a}${quadText(b, c)} = 0 egyenlet gyökeinek összege?`;
      result = r1 + r2;
      explanation = `Viète-formula: x₁ + x₂ = −b ÷ a = ${f(-b)} ÷ ${a} = ${f(r1 + r2)}.`;
      calc = `-(${b})/${a}`;
    } else if (t === 2) {
      const a = pick([1, 2, 3]);
      const r1 = randInt(-5, 6);
      const r2 = randInt(-5, 6);
      const b = -a * (r1 + r2);
      const c = a * r1 * r2;
      prompt = `Mennyi a ${a === 1 ? "" : a}${quadText(b, c)} = 0 egyenlet gyökeinek szorzata?`;
      result = r1 * r2;
      explanation = `Viète-formula: x₁ × x₂ = c ÷ a = ${f(c)} ÷ ${a} = ${f(r1 * r2)}.`;
      calc = `(${c})/${a}`;
    } else if (t === 3) {
      const a = randInt(1, 4);
      const b = randInt(-9, 9);
      const c = randInt(-8, 8);
      prompt = `Mennyi a ${a === 1 ? "" : a}${quadText(b, c)} = 0 egyenlet diszkriminánsa?`;
      result = b * b - 4 * a * c;
      explanation = `D = b² − 4ac = ${paren(b)}² − 4 × ${a} × ${paren(c)} = ${b * b} ${-4 * a * c < 0 ? "−" : "+"} ${Math.abs(4 * a * c)} = ${f(b * b - 4 * a * c)}.`;
      calc = `(${b})^2-4*${a}*(${c})`;
    } else if (t === 4) {
      const a = pick([1, 2, 3]);
      const v = randInt(-6, 6);
      const b = -2 * a * v;
      const c = randInt(-9, 9);
      prompt = `Mennyi az f(x) = ${a === 1 ? "" : a}${quadText(b, c)} parabola csúcspontjának x-koordinátája?`;
      result = v;
      explanation = `x = −b ÷ (2a) = ${f(-b)} ÷ ${2 * a} = ${f(v)}.`;
      calc = `-(${b})/(2*${a})`;
    } else if (t === 5) {
      const k = randInt(2, 5);
      const q = k <= 3 ? pick([2, 3]) : 2;
      const p = pick([1, 2, 3].filter((x) => x !== q));
      const base = k ** q;
      prompt = `Mennyi ${base}^(${p}/${q})?`;
      result = k ** p;
      explanation = `${base} = ${k}${sup(q)}, így ${base}^(${p}/${q}) = ${k}${sup(p)} = ${k ** p}.`;
      calc = `${base}^(${p}/${q})`;
    } else if (t === 6) {
      const m = pick([2, 3, 5, 6, 7]);
      const k = randInt(2, 9);
      prompt = `√${k * k * m} = a · √${m}. Mennyi a?`;
      result = k;
      explanation = `√${k * k * m} = √(${k * k} × ${m}) = ${k} × √${m}, így a = ${k}.`;
      calc = `sqrt(${k * k * m}/${m})`;
    } else {
      const k = randInt(1, 6);
      const [opp, adj, hyp] = pick([[3, 4, 5], [4, 3, 5]] as const);
      // A tg α = 4/3 végtelen tizedes tört lenne: tangenst csak a 3/4 = 0,75 aránynál kérdezünk.
      const which = pick<"sin" | "cos" | "tg">(opp === 3 ? ["sin", "cos", "tg"] : ["sin", "cos"]);
      const value = which === "sin" ? opp / hyp : which === "cos" ? adj / hyp : opp / adj;
      prompt = `Derékszögű háromszögben az α-val szemközti befogó ${opp * k}, a mellette fekvő ${adj * k}, az átfogó ${hyp * k}. Mennyi ${which} α?`;
      result = round6(value);
      explanation = `${which} α = ${which === "sin" ? `${opp * k} ÷ ${hyp * k}` : which === "cos" ? `${adj * k} ÷ ${hyp * k}` : `${opp * k} ÷ ${adj * k}`} = ${f(value)}.`;
      calc = which === "sin" ? `${opp * k}/${hyp * k}` : which === "cos" ? `${adj * k}/${hyp * k}` : `${opp * k}/${adj * k}`;
    }
  } else if (level === 11) {
    if (t === 0) {
      const b = pick([2, 3, 5, 10]);
      const k = b === 2 ? randInt(1, 10) : randInt(1, 4);
      prompt = b === 10 ? `Mennyi lg ${10 ** k}?` : `Mennyi log${sub(b)} ${b ** k}?`;
      result = k;
      explanation = `${b}${sup(k)} = ${b ** k}, ezért a logaritmus értéke ${k}.`;
      calc = `log(${b},${b ** k})`;
    } else if (t === 1) {
      const b = pick([2, 3]);
      const i = randInt(1, 4);
      const j = randInt(1, 4);
      prompt = `Mennyi log${sub(b)} ${b ** i} + log${sub(b)} ${b ** j}?`;
      result = i + j;
      explanation = `log${sub(b)} ${b ** i} = ${i} és log${sub(b)} ${b ** j} = ${j}, így ${i} + ${j} = ${i + j} (vagy log${sub(b)} ${b ** (i + j)}).`;
      calc = `log(${b},${b ** i})+log(${b},${b ** j})`;
    } else if (t === 2) {
      const b = pick([2, 3, 4, 5]);
      const x = b === 2 ? randInt(2, 10) : randInt(2, 4);
      prompt = `Oldd meg: ${b}^x = ${b ** x}. Mennyi x?`;
      result = x;
      explanation = `${b ** x} = ${b}${sup(x)}, így x = ${x}.`;
      calc = `log(${b},${b ** x})`;
    } else if (t === 3) {
      const [fn, deg] = pick([["sin", 30], ["sin", 90], ["sin", 150], ["sin", 270], ["cos", 0], ["cos", 60], ["cos", 120], ["cos", 180], ["tg", 45], ["tg", 135]] as const);
      const k = 2 * randInt(1, 6);
      const value = fn === "sin" ? { 30: 0.5, 90: 1, 150: 0.5, 270: -1 }[deg as 30 | 90 | 150 | 270] : fn === "cos" ? { 0: 1, 60: 0.5, 120: -0.5, 180: -1 }[deg as 0 | 60 | 120 | 180] : { 45: 1, 135: -1 }[deg as 45 | 135];
      prompt = `Mennyi ${k} · ${fn} ${deg}°?`;
      result = k * value;
      explanation = `${fn} ${deg}° = ${f(value)}, így ${k} × ${paren(value)} = ${f(k * value)}.`;
      calc = `${k}*${fn === "tg" ? "tan" : fn}(${deg})`;
    } else if (t === 4) {
      const a1 = randInt(-10, 20);
      const d = randInt(-5, 8) || 3;
      const n = randInt(5, 30);
      prompt = `Egy számtani sorozat első tagja ${f(a1)}, differenciája ${f(d)}. Mennyi a ${n}. tagja?`;
      result = a1 + (n - 1) * d;
      explanation = `aₙ = a₁ + (n − 1) × d = ${paren(a1)} + ${n - 1} × ${paren(d)} = ${f(a1 + (n - 1) * d)}.`;
      calc = `(${a1})+(${n}-1)*(${d})`;
    } else if (t === 5) {
      const n = 2 * randInt(2, 10);
      const a1 = randInt(1, 15);
      const d = randInt(1, 6);
      const an = a1 + (n - 1) * d;
      prompt = `Egy számtani sorozat első tagja ${a1}, differenciája ${d}. Mennyi az első ${n} tag összege?`;
      result = (n * (a1 + an)) / 2;
      explanation = `a${sub(n)} = ${a1} + ${n - 1} × ${d} = ${an}; Sₙ = n × (a₁ + aₙ) ÷ 2 = ${n} × ${a1 + an} ÷ 2 = ${(n * (a1 + an)) / 2}.`;
      calc = `${n}*(2*${a1}+(${n}-1)*${d})/2`;
    } else if (t === 6) {
      const a1 = randInt(1, 5);
      const q = pick([2, 3, -2]);
      const n = randInt(3, q === 3 ? 5 : 7);
      prompt = `Egy mértani sorozat első tagja ${a1}, hányadosa ${f(q)}. Mennyi az ${n}. tagja?`;
      result = a1 * q ** (n - 1);
      explanation = `aₙ = a₁ × q^(n − 1) = ${a1} × ${paren(q)}${sup(n - 1)} = ${a1} × ${f(q ** (n - 1))} = ${f(a1 * q ** (n - 1))}.`;
      calc = `${a1}*(${q})^(${n}-1)`;
    } else if (t === 7) {
      const [p, q, r] = pick([[3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17]] as const);
      const k = randInt(1, 4);
      const sx = pick([1, -1]);
      const sy = pick([1, -1]);
      prompt = `Milyen hosszú a v(${f(sx * p * k)}; ${f(sy * q * k)}) vektor?`;
      result = r * k;
      explanation = `|v| = √(${paren(sx * p * k)}² + ${paren(sy * q * k)}²) = √${r * r * k * k} = ${r * k}.`;
      calc = `sqrt((${sx * p * k})^2+(${sy * q * k})^2)`;
    } else {
      const x1 = randInt(-9, 9);
      const x2 = x1 + 2 * randInt(-6, 6);
      const y1 = randInt(-9, 9);
      const y2 = randInt(-9, 9);
      prompt = `Mennyi az A(${f(x1)}; ${f(y1)}) és B(${f(x2)}; ${f(y2)}) szakasz felezőpontjának x-koordinátája?`;
      result = (x1 + x2) / 2;
      explanation = `x = (x₁ + x₂) ÷ 2 = (${f(x1)} + ${paren(x2)}) ÷ 2 = ${f((x1 + x2) / 2)}.`;
      calc = `((${x1})+(${x2}))/2`;
    }
  } else if (level === 12) {
    if (t === 0) {
      const n = randInt(3, 7);
      prompt = `Hányféle sorrendben állhat fel ${n} tanuló egy sorba?`;
      result = factorial(n);
      explanation = `Ismétlés nélküli permutáció: ${n}! = ${Array.from({ length: n }, (_, i) => n - i).join(" × ")} = ${factorial(n)}.`;
      calc = `fact(${n})`;
    } else if (t === 1) {
      const n = randInt(5, 12);
      const k = randInt(2, 3);
      const value = factorial(n) / (factorial(k) * factorial(n - k));
      prompt = `Hányféleképpen választhatunk ki ${n} tanulóból ${k}-t (a sorrend nem számít)?`;
      result = value;
      explanation = `Kombináció: C(${n}; ${k}) = ${n}! ÷ (${k}! × ${n - k}!) = ${value}.`;
      calc = `C(${n},${k})`;
    } else if (t === 2) {
      const n = randInt(5, 10);
      const k = randInt(2, 3);
      const value = factorial(n) / factorial(n - k);
      prompt = `${n} versenyző közül hányféleképpen alakulhat az első ${k} helyezés?`;
      result = value;
      explanation = `Ismétlés nélküli variáció: ${Array.from({ length: k }, (_, i) => n - i).join(" × ")} = ${value}.`;
      calc = `P(${n},${k})`;
    } else if (t === 3) {
      const m = randInt(2, 6);
      const k = randInt(2, 4);
      prompt = `Hány különböző ${k} jegyű kód készíthető ${m} különböző jelből, ha a jelek ismétlődhetnek?`;
      result = m ** k;
      explanation = `Ismétléses variáció: minden helyre ${m} lehetőség, ${Array.from({ length: k }, () => m).join(" × ")} = ${m ** k}.`;
      calc = `${m}^${k}`;
    } else if (t === 4) {
      const total = pick([4, 5, 8, 10, 20, 25, 40, 50]);
      const red = randInt(1, total - 1);
      prompt = `Egy urnában ${red} piros és ${total - red} kék golyó van. Mekkora valószínűséggel húzunk pirosat? (tizedes törtként)`;
      result = round6(red / total);
      explanation = `P = kedvező ÷ összes = ${red} ÷ ${total} = ${f(red / total)}.`;
      calc = `${red}/(${red}+${total - red})`;
    } else if (t === 5) {
      const mean = randInt(3, 40);
      const devs = [randInt(-5, -1), randInt(1, 5), randInt(-3, 3), randInt(-4, 4)];
      const values = [...devs.map((d) => mean + d)];
      values.push(5 * mean - values.reduce((s, v) => s + v, 0));
      prompt = `Mennyi a következő adatok átlaga: ${values.map(f).join("; ")}?`;
      result = mean;
      explanation = `(${values.map(paren).join(" + ")}) ÷ 5 = ${5 * mean} ÷ 5 = ${mean}.`;
      calc = `(${values.map((v) => `(${v})`).join("+")})/5`;
    } else if (t === 6) {
      const sorted = Array.from({ length: 6 }, () => randInt(1, 30)).sort((x, y) => x - y);
      const shuffled = [...sorted].sort(() => Math.random() - 0.5);
      prompt = `Mennyi a következő adatok mediánja: ${shuffled.join("; ")}?`;
      result = (sorted[2]! + sorted[3]!) / 2;
      explanation = `Sorba rendezve: ${sorted.join("; ")}; a két középső átlaga (${sorted[2]} + ${sorted[3]}) ÷ 2 = ${f((sorted[2]! + sorted[3]!) / 2)}.`;
      calc = `(${sorted[2]}+${sorted[3]})/2`;
    } else if (t === 7) {
      const principal = pick([1000, 2000, 5000, 10000, 20000]);
      const p = pick([5, 10, 20]);
      const years = p === 5 ? 2 : randInt(2, 3);
      const value = round6(principal * (1 + p / 100) ** years);
      prompt = `${principal} Ft-ot évi ${p}%-os kamatos kamatra teszünk ${years} évre. Mennyi lesz a végén (Ft)?`;
      result = value;
      explanation = `${principal} × ${f(1 + p / 100)}${sup(years)} = ${f(value)} Ft.`;
      calc = `${principal}*(1+${p}/100)^${years}`;
    } else {
      const prize = 10 * randInt(2, 50);
      const [num, den] = pick([[1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [1, 10], [3, 10]] as const);
      prompt = `Egy játékban ${num}/${den} valószínűséggel nyersz ${prize} pontot, különben 0-t. Mennyi a várható nyeremény?`;
      result = round6((prize * num) / den);
      explanation = `Várható érték: ${prize} × ${num}/${den} + 0 = ${f((prize * num) / den)} pont.`;
      calc = `${prize}*${num}/${den}`;
    }
  }

  // Defensive fallback; should not happen with the grade branches above.
  if (prompt == null || result == null) {
    prompt = "12 + 8 = ?";
    result = 20;
    explanation = "12 + 8 = 20.";
    calc = "12+8";
  }
  const value = round6(result);
  const options = uniqueOptions(value, level);
  const correctIndex = Math.max(0, options.findIndex((n) => n === value));
  return {
    prompt,
    options,
    correctIndex,
    explanation,
    calc,
    source: "generated",
  };
}

function isMathTask(task: MathTask): boolean {
  const hasNumericPrompt = /\d/.test(task.prompt);
  const hasFourOptions = task.options.length === 4;
  const optionsAreNumbers = task.options.every((n) => Number.isFinite(n));
  const validCorrect = task.correctIndex >= 0 && task.correctIndex < task.options.length;
  return hasNumericPrompt && hasFourOptions && optionsAreNumbers && validCorrect;
}

/**
 * A futás egy még nem látott feladata (spec 2026-09-29): 68%-ban a tanári bankból, különben a generátorból
 * (legfeljebb 30 próba egy új promptért, utána nem látott tanári feladat).
 */
function pickOneTask(level: GradeLevel, seenPrompts: readonly string[]): MathTask {
  const teacherPool = TEACHER_BANK[level].filter(isMathTask);
  return pickFreshTask({
    teacher: teacherPool,
    seenPrompts,
    preferTeacher: Math.random() < 0.68,
    generate: () => {
      const generated = generatedTaskForGrade(level);
      return isMathTask(generated) ? generated : generatedTaskForGrade(level);
    },
  });
}

/** Ennyi nem látott jelöltből választ a pálya sávja (spec 2026-09-29-palyak-szoletra-nyelvek, E szelet, D7). */
const BAND_TASK_CANDIDATES = 3;

/**
 * Pálya nélkül a régi választás. Pályán 3 különböző, nem látott jelölt (tanári bank vagy sablon, a régi arányban),
 * és a sáv dönt: alacsony sávon a legkevesebb számjeggyel dolgozó, magas sávon a legtöbb számjeggyel dolgozó feladat.
 */
function pickTask(level: GradeLevel, seenPrompts: readonly string[], band?: number): MathTask {
  if (band == null) return pickOneTask(level, seenPrompts);
  const candidates: MathTask[] = [];
  let seen = [...seenPrompts];
  for (let i = 0; i < BAND_TASK_CANDIDATES; i += 1) {
    const candidate = pickOneTask(level, seen);
    candidates.push(candidate);
    seen = [...seen, candidate.prompt];
  }
  return pickByBand(candidates, band, (t) => digitComplexity(t.prompt));
}

export default function SpeedQuizMath() {
  const [grade, setGrade] = useState<GradeLevel>(4);
  const gradeRef = useRef<GradeLevel>(grade);
  gradeRef.current = grade;
  const [phase, setPhase] = useState<Phase>("menu");
  const [task, setTask] = useState<MathTask>(() => pickTask(4, []));
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS[4]);
  const [questionTimeLeft, setQuestionTimeLeft] = useState(QUESTION_SECONDS[4]);
  const [lives, setLives] = useState(3);
  // Szinkron élet-követés: a setState-updater React 18-ban render-időben fut,
  // a hívó kód nem láthatja azonnal az eredményt — a ref viszont szinkron.
  const livesRef = useRef(3);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [totalXp, setTotalXp] = useState(0);
  const [wrongFlash, setWrongFlash] = useState(false);
  const [answerState, setAnswerState] = useState<AnswerState>("idle");
  // G-1: a rossz válasz magyarázata. Amíg ez áll, az órák megállnak — a gyerek
  // olvas, és az olvasásért nem jár büntetés.
  const [feedback, setFeedback] = useState<FeedbackCard | null>(null);
  const attemptRef = useRef(0);

  useEffect(() => {
    return installGameTestApi({
      probe: () => ({
        level: runLevelRef.current,
        band: difficultyRef.current,
        questionSeconds: questionSecondsForBand(gradeRef.current, difficultyRef.current),
      }),
      forceState: (patch) => {
        if (patch.phase === "won" || patch.phase === "over" || patch.phase === "menu" || patch.phase === "play") {
          setPhase(patch.phase);
        }
        if (typeof patch.correctCount === "number") setCorrect(Math.max(0, patch.correctCount));
      },
    });
  }, []);

  /**
   * G-4: adaptív nehézség — az IDŐN keresztül, nem a tartalmon.
   *
   * A feladatok nehézségét az osztály adja; azt nem akarjuk menet közben
   * átírni, mert a tananyag rögzített. Amit viszont igazítani lehet, az a
   * gondolkodási idő: aki küzd, kapjon többet, aki repül, kevesebbet. Ez a
   * mastery-tanulás alapmintája, és nem rontja a feladatok minőségét.
   */
  const difficultyRef = useRef(startingDifficulty(4));
  const answerHistoryRef = useRef<boolean[]>([]);
  // Spec 2026-09-29-palyak-szoletra-nyelvek (E szelet): 10 pálya évfolyamonként; a futás pályája a startkor rögzül.
  // A célszám és a kör ideje évfolyamonként változatlan; a pálya a sávon át a feladat-nehézséget és a kérdésidőt hangolja.
  const levels = useGradeLevel("speedmath", grade);
  const runLevelRef = useRef<number | null>(null);
  const levelClearedRef = useRef(false);

  const recordDifficultyAnswer = useCallback((correct: boolean) => {
    const history = [...answerHistoryRef.current, correct].slice(-6);
    answerHistoryRef.current = history;
    difficultyRef.current = levelAdaptBand(
      nextDifficulty({
        recentCorrect: history,
        current: difficultyRef.current,
      }),
      runLevelRef.current,
    );
  }, []);

  /** A kérdésre adott idő a nehézség-sávból: padlón +50%, tetején az alapidő (legalább 20 s). */
  const questionSecondsFor = useCallback(
    (level: GradeLevel) =>
      questionSecondsForBand(level, difficultyRef.current),
    [],
  );
  // A magyarázatot a game over ELŐTT mutatjuk meg: az utolsó hibából is tanulni kell.
  const pendingOverRef = useRef(false);
  /** A futás ÖSSZES eddigi promptja — a futás végéig egyik sem jön újra (amíg van új). */
  const runPromptsRef = useRef<string[]>([]);
  const scoreSubmittedRef = useRef(false);
  const timeoutsRef = useRef<number[]>([]);
  // JAVÍTÁS: a kérdés-lejárat életet von, de nem növelte az `answered`-et,
  // így a statisztikában nem számított rossz válasznak és a `perfect` hamisan
  // igaz lett. Külön számláló a lejárt kérdésekre.
  const timeoutCountRef = useRef(0);

  // Unmountkor az összes pending timeout törlése (beragadó state megelőzése)
  useEffect(() => () => { timeoutsRef.current.forEach(clearTimeout); }, []);

  const { data: syncEligibility } = useSyncEligibilityQuery();
  const syncBanner = useMemo(() => gameSyncBannerText(syncEligibility), [syncEligibility]);

  const nextTask = useCallback(() => {
    const next = pickTask(grade, runPromptsRef.current, runLevelRef.current == null ? undefined : difficultyRef.current);
    runPromptsRef.current = [...runPromptsRef.current, next.prompt];
    setTask(next);
    setQuestionTimeLeft(questionSecondsFor(grade));
    setAnswerState("idle");
    attemptRef.current = 0;
  }, [grade, questionSecondsFor]);

  /**
   * G-1: magyarázó kártya rossz válaszra és lejárt időre.
   *
   * `chosenIndex === null` a lejárt idő. A feladat válaszai számok, a
   * visszacsatolás motorja szöveggel dolgozik — a leképezés itt történik, hogy a
   * motor egyetlen játék adatszerkezetéhez se kötődjön.
   */
  const showFeedbackFor = useCallback(
    (chosenIndex: number | null) => {
      setFeedback(
        buildFeedback({
          quiz: {
            prompt: task.prompt,
            options: task.options.map(formatMathNumber),
            correctIndex: task.correctIndex,
            // A levezetés (G-2). Enélkül a kártya csak a végeredményt tudná
            // kimondani, márpedig matekból a HOGYAN a tananyag.
            explanation: task.explanation,
          },
          chosenIndex,
          attempt: attemptRef.current,
          remainingLives: livesRef.current,
          // 3–5. osztály: a lecke-séma ugyanezt a sávot adja (ageBandForClassroom).
          ageBand: "kid",
        }),
      );
    },
    [task],
  );

  /** A kártya bezárása lépteti a játékot — nem az idő. */
  const dismissFeedback = useCallback(() => {
    setFeedback(null);
    if (pendingOverRef.current) {
      pendingOverRef.current = false;
      setPhase("over");
      return;
    }
    nextTask();
  }, [nextTask]);

  /**
   * Egy javítási esély ugyanazon a feladaton: a gyerek ne bukott kérdéssel lépjen
   * tovább. Csak megmaradt élettel indítható; újabb hibás válasz életbe kerül.
   */
  const retryTask = useCallback(() => {
    if (pendingOverRef.current || livesRef.current <= 0) {
      dismissFeedback();
      return;
    }
    attemptRef.current += 1;
    setFeedback(null);
    setAnswerState("idle");
    pendingOverRef.current = false;
    setQuestionTimeLeft(questionSecondsFor(grade));
  }, [dismissFeedback, grade, questionSecondsFor]);

  const startGame = useCallback(() => {
    setFeedback(null);
    pendingOverRef.current = false;
    attemptRef.current = 0;
    scoreSubmittedRef.current = false;
    livesRef.current = 3;
    timeoutCountRef.current = 0;
    setLives(3);
    setCorrect(0);
    setAnswered(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setWrongFlash(false);
    setAnswerState("idle");
    setTimeLeft(ROUND_SECONDS[grade]);
    runLevelRef.current = levels.level;
    levelClearedRef.current = false;
    difficultyRef.current = levelStartBand(runLevelRef.current, startingDifficulty(grade));
    answerHistoryRef.current = [];
    setQuestionTimeLeft(questionSecondsFor(grade));
    const first = pickTask(grade, [], runLevelRef.current == null ? undefined : difficultyRef.current);
    runPromptsRef.current = [first.prompt];
    setTask(first);
    setPhase("play");
  }, [grade, questionSecondsFor, levels.level]);

  // A győzelem (a célszám elérése a torony tetejéig) a következő pályát oldja fel; a menü azt ajánlja.
  useEffect(() => {
    if (phase === "won" && runLevelRef.current != null && !levelClearedRef.current) {
      levelClearedRef.current = true;
      levels.complete(runLevelRef.current);
    }
  }, [phase]);

  const endAsLose = useCallback(() => setPhase("over"), []);
  const endAsWin = useCallback(() => {
    sfxLevelUp();
    setPhase("won");
  }, []);

  // R = quick-restart az "over" / "won" / "menu" képernyőn.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "r" && e.key !== "R") return;
      if (phase === "over" || phase === "won" || phase === "menu") {
        e.preventDefault();
        startGame();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startGame]);

  useEffect(() => {
    if (phase !== "play") return;
    // A magyarázat olvasása közben minden óra áll. Enélkül a kártya elolvasása
    // életbe és köridőbe kerülne — vagyis a tanulást büntetnénk.
    if (feedback) return;
    const id = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          endAsLose();
          return 0;
        }
        return prev - 1;
      });

      setQuestionTimeLeft((prev) => {
        if (prev <= 1) {
          setStreak(0);
          // A lejárt kérdés is hibás válasznak számít a statisztikában.
          timeoutCountRef.current += 1;
          // Szinkron élet-csökkentés ref-fel: így megbízhatóan tudjuk,
          // hogy game over történt-e (a setState-updater deferred lenne).
          const nextLives = Math.max(0, livesRef.current - 1);
          livesRef.current = nextLives;
          setLives(nextLives);
          // A lejárt kérdés is tanít: ugyanaz a magyarázat jár érte, mint a rossz
          // válaszért. A továbblépést (vagy a game overt) a kártya bezárása intézi,
          // ezért itt már nem hívunk nextTask()-ot.
          pendingOverRef.current = nextLives <= 0;
          // A lejárt kérdés is rossz válasznak számít a nehézség-sávban.
          recordDifficultyAnswer(false);
          showFeedbackFor(null);
          return questionSecondsFor(grade);
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
    // `showFeedbackFor` a `task`-ból épít, ezért itt kötelező függőség: elavult
    // closure-ral a lejárt kérdés az ELŐZŐ feladat megoldását magyarázná el.
    // (Az exhaustive-deps szabály ebben a repóban ki van kapcsolva — #310 osztály —,
    // a függőségeket kézzel tartjuk karban.)
  }, [phase, grade, endAsLose, feedback, showFeedbackFor, questionSecondsFor, recordDifficultyAnswer]);

  const handleAnswer = (idx: number) => {
    if (phase !== "play" || livesRef.current <= 0 || feedback) return;
    // VÁLASZ-LOCK: az answerState csak a nextTask()-ban áll vissza "idle"-re —
    // dupla kattintás nem dolgozza fel kétszer ugyanazt a feladatot
    // (dupla correct/score/answered, korai győzelem).
    if (answerState !== "idle") return;
    // A2: ugyanarra a feladatra a retry ne növelje kétszer az answered számlálót.
    if (attemptRef.current === 0) {
      setAnswered((n) => n + 1);
    }

    if (idx !== task.correctIndex) {
      sfxError();
      setAnswerState("wrong");
      setWrongFlash(true);
      timeoutsRef.current.push(window.setTimeout(() => setWrongFlash(false), 220));
      setStreak(0);
      const nextLives = Math.max(0, livesRef.current - 1);
      livesRef.current = nextLives;
      setLives(nextLives);
      setTimeLeft((t) => Math.max(0, t - 1));
      // G-1: 140 ms piros villanás helyett magyarázat. Ennyi idő arra volt elég,
      // hogy a gyerek észrevegye a büntetést, és túl kevés ahhoz, hogy tanuljon
      // belőle — a téves megoldás így érintetlenül maradt meg benne.
      pendingOverRef.current = nextLives <= 0;
      recordDifficultyAnswer(false);
      showFeedbackFor(idx);
      return;
    }

    sfxSuccess();
    recordDifficultyAnswer(true);
    setAnswerState("correct");
    const base = grade === 3 ? 30 : grade === 4 ? 36 : 44 + (grade - 5) * 2;
    const speedBonus = Math.max(0, questionTimeLeft - 1) * (grade >= 5 ? 4 : 3);
    const comboBonus = streak * 8;
    const add = scoreCorrectAnswer({
      attempt: attemptRef.current,
      base,
      speedBonus,
      comboBonus,
    });

    setScore((s) => s + add);
    setTotalXp((x) => x + add);
    setStreak((s) => {
      // A2: retry után a kombó nem nő.
      if (attemptRef.current > 0) return s;
      const ns = s + 1;
      setBestStreak((b) => Math.max(b, ns));
      return ns;
    });
    setCorrect((c) => {
      const next = c + 1;
      if (next >= TARGET_CORRECT[grade]) {
        endAsWin();
      } else {
        timeoutsRef.current.push(window.setTimeout(nextTask, 120));
      }
      return next;
    });
  };

  useEffect(() => {
    if (phase !== "over" && phase !== "won") return;
    if (!syncEligibility?.eligible) return;
    if (scoreSubmittedRef.current) return;
    scoreSubmittedRef.current = true;

    const runSeconds = ROUND_SECONDS[grade] - timeLeft;
    void apiRequest("POST", "/api/games/score", {
      gameId: "speed-quiz-math",
      difficulty: SCORE_DIFFICULTY[grade],
      runXp: score,
      runStreak: bestStreak,
      runSeconds,
    })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["/api/games/leaderboard"] });
      })
      .catch(() => {
        scoreSubmittedRef.current = false;
      });
  }, [phase, syncEligibility, grade, timeLeft, score, bestStreak]);

  // Achievement + Daily — egyszer fut "over" / "won" átmenetkor.
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([]);
  const achievementCheckedRef = useRef(false);
  useEffect(() => {
    if (phase !== "over" && phase !== "won") {
      achievementCheckedRef.current = false;
      return;
    }
    if (achievementCheckedRef.current) return;
    achievementCheckedRef.current = true;
    const wasDailyAvailable = isTodaysGameAvailable("speed-quiz-math");
    const newOnes = recordRun({
      game: "speed-quiz-math",
      xpGained: score,
      correctAnswers: correct,
      wrongAnswers: answered - correct + timeoutCountRef.current,
      maxStreak: bestStreak,
      perfect: phase === "won" && answered === correct && timeoutCountRef.current === 0,
      fullClear: phase === "won",
    });
    if (wasDailyAvailable && phase === "won") {
      const daily = markDailyCompleted();
      if (daily.achievements.length > 0) newOnes.push(...daily.achievements);
    }
    if (newOnes.length > 0) setNewlyUnlocked(newOnes);
  }, [phase, score, correct, answered, bestStreak]);

  const runProgress = Math.max(0, Math.min(100, (timeLeft / ROUND_SECONDS[grade]) * 100));
  const qProgress = Math.max(0, Math.min(100, (questionTimeLeft / questionSecondsFor(grade)) * 100));

  return (
    <div
      data-game="SpeedQuizMath" data-playing={phase === "play"}
      className="game-shell-fixed min-h-screen relative overflow-hidden text-white"
      style={{
        background:
          "radial-gradient(circle at 20% 15%, rgba(56,189,248,0.28), transparent 34%), radial-gradient(circle at 82% 9%, rgba(244,114,182,0.3), transparent 38%), linear-gradient(180deg, #090f21 0%, #131a3a 100%)",
      }}
    >
      <AchievementToast achievements={newlyUnlocked} />
      <main className="relative z-10 w-full max-w-3xl xl:max-w-4xl mx-auto px-3 sm:px-5 py-3 min-h-dvh min-h-screen flex flex-col pb-8 sm:pb-10">
        <header className="flex items-center justify-between gap-2 mb-2">
          <Link href="/games">
            <Button variant="ghost" size="sm" className="text-white/90 hover:bg-white/10 gap-1 -ml-2 h-11 px-3">
              <ArrowLeft className="w-4 h-4" />
              Játékok
            </Button>
          </Link>
          <div className="flex items-center gap-3 text-xs font-semibold">
            <AudioToggleButton size="icon" />
            <span className="flex items-center gap-1 text-amber-300">
              <Star className="w-4 h-4" />
              {totalXp}
            </span>
            <span className="flex items-center gap-1 text-orange-300">
              <Flame className="w-4 h-4" />
              {streak}
            </span>
          </div>
        </header>

        <Card className="border border-cyan-300/45 bg-slate-950/90 backdrop-blur-md shadow-[0_16px_50px_rgba(0,0,0,0.48)] flex-1 flex flex-col min-h-0">
          <CardContent data-game-card-content className="p-3 flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-1">
              <Rocket className="w-5 h-5 text-cyan-300" />
              <h1 className="text-lg font-black tracking-wide">Neon matek torony</h1>
            </div>
            {phase !== "play" && (
              <GamePedagogyPanel
                accent="cyan"
                className="mb-2"
                kidMission={`Válaszolj gyorsan és jól (${grade}. osztály szint)! Minden helyes válasz közelebb visz a torony tetejéhez a pályán. Van 3 életed — rossz válasz egy szívecskét elvesz. A láng = sorozat: minél több jó válasz egymás után, annál nagyobb a pontszorzó érzése.`}
                parentBody={
                  <>
                    <strong className="text-cyan-100/90">Tananyag:</strong> műveletek és számolás a választott évfolyamnak megfelelően (tanári bank + generált feladatok).
                    <br />
                    <strong className="text-cyan-100/90">Fejleszt:</strong> számolási sebesség, önellenőrzés, hibatűrés (életek után is folytatható kör).
                    <br />
                    <span className="text-white/55">
                      A kettős idő (kör + kérdés) és a vizuális „lépkedés” a cél felé ugyanazt a motivációs mintát követi, mint a rövid tesztekkel tarkított gyakorló appok: gyors visszajelzés, világos cél.
                    </span>
                  </>
                }
              />
            )}
            <p data-game-sync className={`text-[11px] text-cyan-100/95 border border-cyan-700/45 rounded px-2 ${phase === "play" ? "py-1 mb-2" : "py-1.5 mb-3"} bg-slate-900/95`}>
              {syncBanner}
            </p>

            {phase === "menu" && (
              <div data-game-menu="math" className="flex-1 flex flex-col items-center justify-center gap-4 py-6">
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 w-full max-w-xl" data-testid="sq-grade-picker">
                  {GRADE_LEVELS.map((g) => (
                    <Button
                      key={g}
                      type="button"
                      className={`px-1.5 whitespace-nowrap ${
                        grade === g
                          ? "bg-gradient-to-r from-cyan-500 to-fuchsia-600 text-white font-bold border border-cyan-100/40 shadow-[0_0_20px_rgba(34,211,238,0.35)]"
                          : "bg-slate-900/95 border border-white/30 text-white hover:bg-slate-800"
                      }`}
                      onClick={() => setGrade(g)}
                    >
                      {g}. osztály
                    </Button>
                  ))}
                </div>
                <div className="w-full max-w-xl rounded-xl border border-amber-400/35 bg-gradient-to-r from-amber-500/10 to-fuchsia-500/10 px-3 py-2.5 text-sm text-white/90">
                  <span className="font-bold text-amber-200">A pálya célja:</span>{" "}
                  <strong>{TARGET_CORRECT[grade]}</strong> helyes válasz a torony tetejéig · <strong>3</strong> szív =
                  három hibalehetőség · szint: <strong>{LEVEL_LABEL[grade]}</strong>
                </div>
                <Button
                  type="button"
                  size="lg"
                  className="bg-gradient-to-r from-cyan-500 via-blue-500 to-fuchsia-600 hover:from-cyan-400 hover:to-fuchsia-500 font-bold text-white px-8 border border-cyan-100/40 text-base"
                  onClick={startGame}
                  data-testid="sq-start"
                >
                  <Gauge className="w-4 h-4 mr-2" />
                  Indul a torony — rajta!{levels.level != null ? ` · ${levels.level}. pálya` : ""}
                </Button>
                {levels.active && levels.level != null ? (
                  <GradeLevelPicker
                    value={levels.level}
                    unlocked={levels.unlocked}
                    onChange={levels.select}
                    label={`Pálya — ${grade}. osztály`}
                  />
                ) : null}
              </div>
            )}

            {phase === "play" && (
              <div className="math-run flex-1 min-h-0">
                <div className="math-stats grid grid-cols-4 gap-1.5 text-[11px] font-semibold">
                  <div className="rounded-lg border border-white/20 bg-slate-900/90 px-2 py-1.5">Szint: {LEVEL_LABEL[grade]}</div>
                  <div className="rounded-lg border border-white/20 bg-slate-900/90 px-2 py-1.5">Kör: {timeLeft}s</div>
                  <div className="rounded-lg border border-white/20 bg-slate-900/90 px-2 py-1.5">Kérdés: {questionTimeLeft}s</div>
                  <div className="rounded-lg border border-white/20 bg-slate-900/90 px-2 py-1.5" data-testid="sq-score">Pont: {score}</div>
                </div>

                <div className="math-lives flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-1 text-rose-300">
                    {[0, 1, 2].map((i) => (
                      <Heart key={i} className={`w-4 h-4 ${i < lives ? "fill-rose-400 text-rose-300" : "text-white/20"}`} />
                    ))}
                    <span className="ml-1 text-white/75 font-semibold">Életek</span>
                  </div>
                  <span className="rounded-full border border-orange-400/40 bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-200">
                    Sorozat: {streak}
                  </span>
                </div>

                <GameNextGoalBar
                  accent="fuchsia"
                  headline={
                    correct >= TARGET_CORRECT[grade]
                      ? "Megvan a torony teteje — még gyűjts pontot, amíg tart a kör!"
                      : `${TARGET_CORRECT[grade] - correct} helyes válasz még a célhoz`
                  }
                  subtitle={`${LEVEL_LABEL[grade]} · ${timeLeft}s a körből · ${lives} élet · kombó: ${streak}`}
                  current={correct}
                  target={TARGET_CORRECT[grade]}
                  className="math-goal w-full"
                />

                <div className="math-clock h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${runProgress}%` }} />
                </div>
                <div className="math-clock h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-fuchsia-400 to-pink-500" style={{ width: `${qProgress}%` }} />
                </div>

                <MathTowerScene3D current={correct} target={TARGET_CORRECT[grade]} />

                <div
                  className={`math-question rounded-xl border ${
                    answerState === "correct"
                      ? "border-emerald-400"
                      : wrongFlash || answerState === "wrong"
                        ? "border-rose-400"
                        : "border-cyan-300/45"
                  } bg-slate-950/90 p-2.5 transition-colors`}
                >
                  <p className="text-[11px] text-white/60 mb-1">
                    Gyors teszt #{answered + 1} — válaszd ki a helyes választ!
                  </p>
                  <p className="text-lg sm:text-xl font-black tracking-wide text-cyan-50 leading-tight">{task.prompt}</p>
                  <p className="text-[10px] text-white/55 mt-1">
                    Forrás: {task.source === "teacher" ? "Tanári kérdésbank" : "Generált feladat"}
                  </p>
                </div>

                <div className="math-answers grid grid-cols-2 gap-1.5" data-testid="sq-answers">
                  {task.options.map((opt, idx) => (
                    <Button
                      key={`${opt}-${idx}`}
                      type="button"
                      className={`h-12 text-lg font-black border text-white shadow-sm transition-colors ${
                        answerState === "correct"
                          ? "bg-emerald-700/40 border-emerald-200/40 hover:bg-emerald-600/45"
                          : wrongFlash || answerState === "wrong"
                            ? "bg-rose-900/35 border-rose-200/40 hover:bg-rose-800/45"
                            : "bg-slate-900/95 hover:bg-cyan-700/45 border-cyan-200/35"
                      }`}
                      onClick={() => handleAnswer(idx)}
                      {...correctDataAttrs(idx === task.correctIndex)}
                    >
                      {formatMathNumber(opt)}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {(phase === "over" || phase === "won") && (
              <div
                className="flex-1 flex flex-col justify-center items-center text-center gap-3 py-8"
                data-testid={phase === "won" ? "sq-won" : "sq-over"}
              >
                {phase === "won" ? (
                  <Trophy className="w-14 h-14 text-amber-300" />
                ) : (
                  <Gauge className="w-14 h-14 text-rose-300" />
                )}
                <p className="text-xl font-bold">{phase === "won" ? "Célba értél a neon toronyban!" : "Vége a futamnak"}</p>
                {phase === "won" && (
                  <p className="text-sm font-semibold text-cyan-100/90 max-w-sm">
                    Annyi helyes matektesztet raktál össze, hogy a pálya tetejére értél — ügyes vagy, ez a fő jutalom!
                  </p>
                )}
                <p className="text-sm text-white/80">
                  Pont: <strong className="text-amber-300">{score}</strong> · Helyes: <strong>{correct}</strong> · Kombó:{" "}
                  <strong>{bestStreak}</strong>
                </p>
                {syncEligibility?.eligible ? (
                  <p className="text-xs text-emerald-300/90">Eredmény elküldve a felhő ranglistára.</p>
                ) : (
                  <p className="text-xs text-white/60 max-w-xs">{syncBanner}</p>
                )}
                <div className="flex gap-2">
                  <Button type="button" className="bg-cyan-600 hover:bg-cyan-500" onClick={startGame}>
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Új futam
                  </Button>
                  <Link href="/games">
                    <Button variant="outline" className="border-white/30 text-white">
                      Lista
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {feedback && (
        <QuizFeedbackCard
          card={feedback}
          onDismiss={dismissFeedback}
          onRetry={lives > 0 ? retryTask : undefined}
        />
      )}
    </div>
  );
}
