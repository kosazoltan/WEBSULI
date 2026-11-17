import { isPlayableQuestion } from "@shared/game-quiz-contract";
import { createRng, seedFrom } from "@shared/game-rng";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useLocation } from "wouter";
import CollectibleAvatar from "@/components/CollectibleAvatar";
import { ArrowLeft, Pause, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { queryClient } from "@/lib/queryClient";
import GamePedagogyPanel from "@/components/GamePedagogyPanel";
import { gameSyncBannerText, useSyncEligibilityQuery } from "@/hooks/useGameScoreSync";
import { useMaterialQuizzes } from "@/hooks/useMaterialQuizzes";
import { useClassroomGrade } from "@/lib/classroomStore";
import { useGradeLevel } from "@/game-engine/useGradeLevel";
import { GradeLevelPicker } from "@/game-engine/GradeLevelPicker";
import { levelAdaptBand, levelStartBand } from "@/game-engine/levelTuning";
import ClassroomGateModal from "@/components/ClassroomGateModal";
import { sfxClick, sfxLevelUp } from "@/lib/audioEngine";
import { recordRun, type Achievement } from "@/lib/achievements";
import { quizTopicLabelHu } from "@/lib/quizTopicLabel";
import { isTodaysGameAvailable, markDailyCompleted } from "@/lib/dailyChallenge";
import AchievementToast from "@/components/AchievementToast";
import { useCouponSession } from "@/game-engine/useCouponSession";
import { maybeClaimCouponBonus } from "@/game-engine/claimCouponBonus";
import { CouponHud, CouponExpiredOverlay } from "@/game-engine/CouponHud";
import QuizFeedbackCard from "@/game-engine/QuizFeedbackCard";
import { buildFeedback, type FeedbackCard } from "@/game-engine/feedback";
import {
  BRAIN_ROT_WARNING_MS,
  brainRotAgeMs,
  brainRotLifetimeFor,
  brainRotSizeFor,
  brainRotSpeedScaleFor,
} from "@/lib/brainRotTuning";
import {
  BRAIN_ROT_GAME_ID,
  BRAIN_ROT_KINDS,
  CAGE_DWELL_MS,
  CAGE_LABEL_FONT_LONG,
  CLEAR_CATCHES,
  cageLabelFont,
  cageLabelsFit,
  cageWidthU,
  ROUND_MS,
  brainRotDirectorConfig,
  createBrainRotDriver,
  type BrainRotDriver,
  type BrainRotEvent,
  type BrainRotTuning,
  type Cage,
} from "@/lib/brainRot/core";
import {
  GameHud,
  GameShell,
  PauseMenu,
  ResultScreen,
  StartScreen,
  cancelGameFrame,
  requestGameFrame,
  useBestScore,
  useHaptics,
  useTouchCapable,
  type GameScreenState,
} from "@/game-engine/mobile";
import { useVocabQuizSource, vocabLevelForGrade } from "@/game-engine/vocab";
import { nextDifficulty, startingDifficulty } from "@/game-engine/difficulty";
import {
  createGradeQuizSeen,
  gradeForGame,
  markGradeQuizSeen,
  pickGradeQuiz,
  pickGradeSlotWithVocab,
  pickUnseenMaterial,
} from "@/game-engine/gradeQuiz";
import { loadedGradeItems } from "@/data/gradeQuizBank/loader";
import { useReducedMotion } from "@/game-engine/useReducedMotion";
import { correctDataAttrs, installGameTestApi, readGameSeed, type GameForcePatch } from "@/game-engine/game-test-hooks";
import VirtualJoystick from "@/game-engine/VirtualJoystick";
import { shapeJoystick } from "@/game-engine/joystick";
import BrainRotArena3D, { type ArenaBurst, type ArenaRot } from "@/game-engine/scenes/BrainRotArena3D";
import {
  InlineQuestion,
  ResultReview,
  bankPlayQuestion,
  gradePlayQuestion,
  materialPlayQuestion,
  restoreReviewQuestion,
  usePlayQuestion,
  vocabPlayQuestion,
  type PlayQuestion,
  type QuestionPresentation,
  type QuestionProvider,
} from "@/game-engine/play";

import { newScoreRunId, postGameScore } from "@/lib/gameScoreRunId";

/**
 * J5a — Brain Rot Lopás „Lény-aréna” (végrehajtás J5 / J5a; terv 5.5; K.2, K.4, K.5).
 *
 * A játék: a vadász joystickkal (vagy a táblára bökve / húzva) fut az arénában, a lények elmenekülnek előle (falnál
 * csúsznak, menekülés közben kifáradnak). Elkapás = érintkezés. Elkapáskor a közös kérdés-ütemező kérdést ad: a kérdés a
 * HUD alatti sávban (`InlineQuestion mode="bar"`), a 4 válasz 4 KETREC az aréna négy negyedében — a jó ketrecbe futás =
 * válasz (beállás: megállás vagy rövid bent tartózkodás). Jó: a lény megmarad + kombó; rossz / lejárat: elszökik, a helyes
 * ketrec ≥ 1,8 mp-ig zölden világít. A kérdés alatt a világ 0,6×-re lassul, a 90 mp-es óra JÁR (a régi „álló óra”
 * megszűnt). Blokkoló kártya nincs: a „Miért?” nyitja a magyarázatot (szünettel).
 *
 * Rétegek (KSZ-1): a játéklogika a tiszta magban (`lib/brainRot/core.ts`, a node-szimulációval közös meghajtó); a lap a
 * rAF-ban a meghajtót lépteti és a DOM-elemek helyét REF-eken át írja (nincs képkockánkénti React-állapot, KSZ-9); a HUD
 * 10 Hz-es pillanatképet kap. A 3D aréna dekoráció (a lények padló-gyűrűi, robbanások).
 */

/* --- Típusok --- */
type Quiz = {
  topic?: string;
  id?: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  /** T-1: a MIÉRT rossz válasznál — a lecke exportjából vagy a generátorból. */
  explanation?: string | null;
  /** `science` / `history`: csak a közös évfolyam-bankból (3–12. évfolyam, spec 2026-09-29). */
  category: "english" | "math" | "hungarian" | "science" | "history";
  /** A játékos tananyagából jött (a 3–12. évfolyamos választásban elsőbbséget élvez). */
  fromMaterial?: boolean;
};

type Phase = "menu" | "play" | "over";

/** Lebegő felirat (+XP, Elszökött!) — eseményre születik (ritka), a CSS animálja; a sávja nem fedi a többit (kanban #64). */
type FloatingText = { id: number; x: number; y: number; text: string; color: string; kind: "gain" | "escape" | "info" };

/** A HUD 10 Hz-es pillanatképe (KSZ-9): a lények listája (a DOM-elemek kulcsa), a pont, az idő. */
type HudSnap = {
  score: number;
  caught: number;
  combo: number;
  multiplier: number;
  timeLeft: number;
  creatures: Array<{ id: number; kind: number; size: number; warning: boolean; opacity: number; dazed: boolean; carried: boolean }>;
  arena: ArenaRot[];
  carrying: boolean;
  hint: 0 | 1 | 2;
};

type RunResult = { score: number; caught: number; missed: number; lost: number; correct: number; total: number; wrong: number; bestStreak: number; maxMultiplier: number; seconds: number };

/* --- Konstansok --- */
const ROUND_LIMIT = ROUND_MS / 1000;
const STREAK_GOAL = 7;
/** Sikeres futás: ennyi megtartott lény (a napi kihívás meglévő küszöbe) — ez oldja fel a következő pályát is. */
const BRAIN_ROT_CLEAR_CATCHES = CLEAR_CATCHES;
/** Az első 30 mp tanító szakasz (K.4/25): egysoros súgó. */
const TUTORIAL_MS = 30_000;
/** A lebegő felirat élete (ms) — a CSS-animáció hossza. */
const FLOAT_MS = 1300;
/** Ennyin belüli szökések egy összesítő feliratot kapnak (kanban #64). */
const ESCAPE_MERGE_MS = 450;
const FLOAT_LANE_PX = 26;
/** A joystick oldala (K.4/16 balkezes tükrözés). */
const HAND_KEY = "websuli.brainrot.hand";
const EMPTY_HUD: HudSnap = { score: 0, caught: 0, combo: 0, multiplier: 1, timeLeft: ROUND_LIMIT, creatures: [], arena: [], carrying: false, hint: 1 };

/* --- Quiz bank --- */

const ENGLISH_QUIZZES: Quiz[] = [
  { prompt: "\"Dog\" magyarul:", options: ["macska", "kutya", "madár", "hal"], correctIndex: 1, category: "english", explanation: "A dog kutyát jelent. A macska angolul cat — a két állat neve az angolban is rövid, három betűs." },
  { prompt: "\"Cat\" magyarul:", options: ["kutya", "macska", "nyúl", "egér"], correctIndex: 1, category: "english", explanation: "A cat macskát jelent. A kutya angolul dog: a cat c-vel, a dog d-vel kezdődik." },
  { prompt: "\"Apple\" magyarul:", options: ["körte", "szőlő", "alma", "barack"], correctIndex: 2, category: "english", explanation: "Az apple almát jelent. Két p-vel írjuk, és „epl”-nek ejtjük." },
  { prompt: "\"Sun\" magyarul:", options: ["hold", "csillag", "felhő", "nap"], correctIndex: 3, category: "english", explanation: "A sun a Nap az égen. A hold angolul moon, a csillag star — mind a három más szó." },
  { prompt: "\"Tree\" magyarul:", options: ["virág", "fa", "bokor", "fű"], correctIndex: 1, category: "english", explanation: "A tree fát jelent (a növényt). A virág angolul flower, a fű grass." },
  { prompt: "\"Water\" magyarul:", options: ["tej", "víz", "lé", "üdítő"], correctIndex: 1, category: "english", explanation: "A water vizet jelent. A tej angolul milk — mindkettőt isszuk, de a szavuk nem hasonlít." },
  { prompt: "\"House\" magyarul:", options: ["ház", "lakás", "szoba", "kert"], correctIndex: 0, category: "english", explanation: "A house házat jelent. A room a szoba, a garden a kert: a house az egész épület." },
  { prompt: "\"School\" magyarul:", options: ["bolt", "könyvtár", "iskola", "kórház"], correctIndex: 2, category: "english", explanation: "A school iskolát jelent. A ch-t itt k-nak ejtjük: „szkúl”. A bolt angolul shop." },
  { prompt: "\"Happy\" magyarul:", options: ["szomorú", "boldog", "fáradt", "mérges"], correctIndex: 1, category: "english", explanation: "A happy boldogot jelent. A szomorú angolul sad — a happy két p-vel írjuk." },
  { prompt: "\"Big\" magyarul:", options: ["kicsi", "nagy", "hosszú", "rövid"], correctIndex: 1, category: "english", explanation: "A big nagyot jelent. A kicsi angolul small vagy little; a hosszú long." },
  { prompt: "Melyik a helyes: I ___ a student.", options: ["am", "is", "are", "be"], correctIndex: 0, category: "english", explanation: "Az I mellé mindig am jár: I am a student. Ez az egyetlen alany, amelyik am-mel áll." },
  { prompt: "Melyik a helyes: She ___ books.", options: ["read", "reads", "reading", "readed"], correctIndex: 1, category: "english", explanation: "Egyes szám harmadik személyben az ige -s végződést kap: She reads books. A readed nem létező alak." },
  { prompt: "\"Red\" magyarul:", options: ["kék", "zöld", "piros", "sárga"], correctIndex: 2, category: "english", explanation: "A red pirosat jelent. A kék angolul blue, a zöld green — a red a legrövidebb a háromból." },
  { prompt: "\"Blue\" magyarul:", options: ["kék", "zöld", "piros", "fehér"], correctIndex: 0, category: "english", explanation: "A blue kéket jelent. A zöld angolul green: a blue-t „blú”-nak ejtjük." },
  { prompt: "\"Monday\" magyarul:", options: ["kedd", "hétfő", "szerda", "csütörtök"], correctIndex: 1, category: "english", explanation: "A Monday hétfő — a hét első napja. A kedd angolul Tuesday, mindkettő nagybetűvel." },
  { prompt: "\"Brother\" magyarul:", options: ["nővér", "unokatestvér", "fivér", "húg"], correctIndex: 2, category: "english", explanation: "A brother fivért (bátyát vagy öcsöt) jelent. A nővér angolul sister, az unokatestvér cousin." },
  { prompt: "Mit jelent: Good morning!", options: ["Jó éjszakát!", "Jó napot!", "Jó reggelt!", "Viszlát!"], correctIndex: 2, category: "english", explanation: "A Good morning! jelentése: Jó reggelt! A Good night! a Jó éjszakát, a Good day a Jó napot." },
  { prompt: "\"Flower\" magyarul:", options: ["fa", "virág", "levél", "gyökér"], correctIndex: 1, category: "english", explanation: "A flower virágot jelent. A fa angolul tree, a levél leaf — a flower a növény színes része." },
  { prompt: "Egészítsd ki: They ___ playing.", options: ["is", "am", "are", "be"], correctIndex: 2, category: "english", explanation: "A they mellé are jár: They are playing. Az is egyes számhoz, az am csak az I-hez tartozik." },
  { prompt: "\"Fish\" magyarul:", options: ["madár", "hal", "béka", "kígyó"], correctIndex: 1, category: "english", explanation: "A fish halat jelent. A madár angolul bird — a fish alakja többes számban is fish marad." },
  { prompt: "\"Green\" magyarul:", options: ["piros", "kék", "zöld", "sárga"], correctIndex: 2, category: "english", explanation: "A green zöldet jelent, két e-vel. A kék angolul blue, a sárga yellow." },
  { prompt: "\"Kitchen\" magyarul:", options: ["hálószoba", "nappali", "konyha", "fürdőszoba"], correctIndex: 2, category: "english", explanation: "A kitchen konyhát jelent. A chicken a csirke — nagyon hasonlít, de a kitchen k-val kezdődik." },
  { prompt: "\"Rain\" magyarul:", options: ["hó", "szél", "nap", "eső"], correctIndex: 3, category: "english", explanation: "A rain esőt jelent. A hó angolul snow, a szél wind — mind időjárás, de más szó." },
  { prompt: "\"Pencil\" magyarul:", options: ["toll", "ceruza", "radír", "vonalzó"], correctIndex: 1, category: "english", explanation: "A pencil ceruzát jelent. A toll angolul pen: a pencilben benne van a pen szó." },
  { prompt: "Melyik illik: He ___ to school every day.", options: ["go", "goes", "going", "goed"], correctIndex: 1, category: "english", explanation: "A he mellett az ige -es végződést kap: He goes to school. A go végén o van, ezért goes és nem gos." },
];

const MATH_QUIZZES: Quiz[] = [
  { prompt: "12 + 8 = ?", options: ["18", "20", "22", "19"], correctIndex: 1, category: "math", explanation: "12 + 8 = 20. A 12-höz először 8-at adva a következő tízeshez, azaz a húszhoz jutunk." },
  { prompt: "7 x 6 = ?", options: ["36", "42", "48", "35"], correctIndex: 1, category: "math", explanation: "7 × 6 = 42. Ha a hatos szorzótábla nem ugrik be: 7 × 6 = 7 × 5 + 7 = 35 + 7 = 42." },
  { prompt: "56 / 8 = ?", options: ["6", "7", "8", "9"], correctIndex: 1, category: "math", explanation: "56 : 8 = 7, mert 8 × 7 = 56. A nyolcas szorzótábla visszafelé olvasva adja az osztást." },
  { prompt: "15 + 27 = ?", options: ["42", "41", "43", "40"], correctIndex: 0, category: "math", explanation: "15 + 27 = 42. Bontva: 15 + 25 = 40, majd még 2 → 42." },
  { prompt: "9 x 9 = ?", options: ["72", "81", "90", "79"], correctIndex: 1, category: "math", explanation: "9 × 9 = 81. Trükk: 9 × 9 = 9 × 10 − 9 = 90 − 9 = 81." },
  { prompt: "100 - 37 = ?", options: ["63", "67", "73", "57"], correctIndex: 0, category: "math", explanation: "100 − 37 = 63. Bontva: 100 − 30 = 70, majd 70 − 7 = 63." },
  { prompt: "8 x 7 = ?", options: ["54", "56", "49", "63"], correctIndex: 1, category: "math", explanation: "8 × 7 = 56. Ugyanaz, mint 7 × 8 — a szorzás sorrendje nem számít." },
  { prompt: "144 / 12 = ?", options: ["11", "12", "13", "14"], correctIndex: 1, category: "math", explanation: "144 : 12 = 12, mert 12 × 12 = 144. Ez a tizenkettes szorzótábla utolsó sora." },
  { prompt: "25 + 38 = ?", options: ["53", "63", "62", "64"], correctIndex: 1, category: "math", explanation: "25 + 38 = 63. Bontva: 25 + 35 = 60, majd még 3 → 63." },
  { prompt: "6 x 12 = ?", options: ["66", "72", "78", "60"], correctIndex: 1, category: "math", explanation: "6 × 12 = 72. Bontva: 6 × 10 = 60, majd 6 × 2 = 12, összesen 72." },
  { prompt: "Mi a geometriai test neve, ha 6 négyzet határolja?", options: ["gömb", "kocka", "henger", "kúp"], correctIndex: 1, category: "math", explanation: "A hat egybevágó négyzettel határolt test a kocka. A gömbnek nincs lapja, a hengernek kör alapja van." },
  { prompt: "Melyik szám a legnagyobb: 398, 389, 399, 390?", options: ["398", "389", "399", "390"], correctIndex: 2, category: "math", explanation: "A 399 a legnagyobb. Mind háromszázas, ezért a tízeseket kell nézni: 99 > 98 > 90 > 89." },
  { prompt: "Mennyi a téglalap kerülete, ha a = 5 cm, b = 3 cm?", options: ["16 cm", "15 cm", "8 cm", "30 cm"], correctIndex: 0, category: "math", explanation: "A téglalap kerülete 2 × (a + b) = 2 × (5 + 3) = 16 cm. A 15 cm² a terület lenne, az más mennyiség." },
  { prompt: "200 - 86 = ?", options: ["124", "116", "114", "104"], correctIndex: 2, category: "math", explanation: "200 − 86 = 114. Bontva: 200 − 100 = 100, majd vissza 14 → 114." },
  { prompt: "Mi az 50 fele?", options: ["20", "30", "15", "25"], correctIndex: 3, category: "math", explanation: "Az 50 fele 25, mert 25 + 25 = 50. A felezés osztás kettővel." },
  { prompt: "11 x 11 = ?", options: ["111", "121", "110", "131"], correctIndex: 1, category: "math", explanation: "11 × 11 = 121. Bontva: 11 × 10 = 110, majd még egy 11 → 121." },
  { prompt: "Hány perc van 1 órában?", options: ["30", "45", "60", "90"], correctIndex: 2, category: "math", explanation: "Egy óra 60 perc. A perc pedig 60 másodperc — az idő mindig hatvanasával lép." },
  { prompt: "Melyik a páratlan szám?", options: ["12", "18", "23", "30"], correctIndex: 2, category: "math", explanation: "A 23 páratlan, mert nem osztható kettővel. A 12, 18 és 30 mind páros." },
  { prompt: "Mi a 3/4 tizedestörtje?", options: ["0,34", "0,75", "0,43", "0,7"], correctIndex: 1, category: "math", explanation: "A 3/4 tizedestörtben 0,75, mert 3 : 4 = 0,75. Segít: a fél 0,5, a háromnegyed ennél több." },
  { prompt: "5 négyzeten = ?", options: ["10", "15", "20", "25"], correctIndex: 3, category: "math", explanation: "5 a négyzeten = 5 × 5 = 25. A négyzetre emelés önmagával való szorzás, nem kettővel szorzás." },
  { prompt: "Mennyi a négyzet területe, ha az oldala 4 cm?", options: ["8 cm²", "12 cm²", "16 cm²", "20 cm²"], correctIndex: 2, category: "math", explanation: "A négyzet területe oldal × oldal = 4 × 4 = 16 cm². A 16 cm a kerület lenne — az hosszúság, ez terület." },
  { prompt: "1000 / 10 = ?", options: ["10", "100", "1000", "1"], correctIndex: 1, category: "math", explanation: "1000 : 10 = 100. Tízzel osztva egy nullát veszünk el a szám végéről." },
  { prompt: "Mennyi 3 x 15?", options: ["30", "35", "45", "55"], correctIndex: 2, category: "math", explanation: "3 × 15 = 45. Bontva: 3 × 10 = 30, majd 3 × 5 = 15, összesen 45." },
  { prompt: "Mi a következő szám: 2, 4, 8, 16, ...?", options: ["20", "24", "28", "32"], correctIndex: 3, category: "math", explanation: "A sor mindig kétszereződik: 2, 4, 8, 16, majd 16 × 2 = 32." },
  { prompt: "Hány cm 1 méter?", options: ["10", "100", "1000", "50"], correctIndex: 1, category: "math", explanation: "1 méter = 100 centiméter. A centi századrészt jelent — száz centi tesz ki egy métert." },
];

const HUNGARIAN_QUIZZES: Quiz[] = [
  { prompt: "Melyik az igekötős ige?", options: ["szép", "megírta", "kutya", "magas"], correctIndex: 1, category: "hungarian", explanation: "A megírta igekötős ige: a meg- az igekötő, az írta az ige. A szép melléknév, a kutya főnév." },
  { prompt: "Hány magánhangzó van a Magyarország szóban?", options: ["4", "5", "6", "7"], correctIndex: 0, category: "hungarian", explanation: "A Magyarország szóban négy magánhangzó van: a, a, o, á. A gy, r, sz, g mind mássalhangzó." },
  { prompt: "Melyik szó melléknév?", options: ["fut", "szép", "asztal", "boldogan"], correctIndex: 1, category: "hungarian", explanation: "A szép melléknév: tulajdonságot fejez ki. A fut ige, az asztal főnév, a boldogan határozószó." },
  { prompt: "Mi a \"kutya\" szó többes száma?", options: ["kutyák", "kutyás", "kutyáz", "kutyái"], correctIndex: 0, category: "hungarian", explanation: "A kutya többes száma kutyák — a -k a többes szám jele. A kutyái birtokos alak (az ő kutyái), a kutyás melléknév." },
  { prompt: "Melyik a helyes: Holnap ___ iskolába.", options: ["megyünk", "menünk", "mész", "mennyünk"], correctIndex: 0, category: "hungarian", explanation: "A helyes alak: Holnap megyünk iskolába. A menünk és a mennyünk hibás — a megy ige többes szám első személye megyünk." },
  { prompt: "Melyik szó főnév?", options: ["fut", "szép", "asztal", "gyorsan"], correctIndex: 2, category: "hungarian", explanation: "Az asztal főnév: dolgot nevez meg. A fut ige, a szép melléknév, a gyorsan határozószó." },
  { prompt: "Melyik mondat helyes?", options: ["A kutya szalad.", "A kutya szalat.", "A kutya szalatt.", "A kutya szaland."], correctIndex: 0, category: "hungarian", explanation: "A helyes alak: A kutya szalad. A szalad ige d-re végződik — a szalat, szalatt, szaland nem létező alakok." },
  { prompt: "Mi az \"ly\" hang a \"mély\" szóban?", options: ["j hang", "l hang", "ny hang", "jj hang"], correctIndex: 0, category: "hungarian", explanation: "A mély szóban az ly-t j hangnak ejtjük. Az ly és a j ugyanúgy hangzik — csak az írásmód más." },
  { prompt: "Hány mássalhangzó van az \"iskola\" szóban?", options: ["2", "3", "4", "1"], correctIndex: 1, category: "hungarian", explanation: "Az iskola szóban három mássalhangzó van: s, k, l. Az i, o, a magánhangzók." },
  { prompt: "Melyik a határozószó?", options: ["kutya", "szép", "gyorsan", "ír"], correctIndex: 2, category: "hungarian", explanation: "A gyorsan határozószó: azt mondja meg, HOGYAN történik valami. A szép melléknév, az ír ige." },
  { prompt: "Melyik írásjelezés helyes?", options: ["Hol van a könyv?", "Hol van a könyv.", "Hol, van a könyv?", "Hol van, a könyv."], correctIndex: 0, category: "hungarian", explanation: "A helyes: Hol van a könyv? A kérdő mondat végére kérdőjel kerül, és nincs vessző a mondat közepén." },
  { prompt: "Melyik rag teszi TÁRGGYÁ: alma___?", options: ["-t", "-k", "-nak", "-ban"], correctIndex: 0, category: "hungarian", explanation: "A tárgy ragja a -t: almát. A -k a többes szám, a -nak részeshatározó, a -ban helyhatározó." },
  { prompt: "Melyik a helyes: \"ott\" vagy \"ot\"?", options: ["ott", "ot", "ottt", "mindkettő jó"], correctIndex: 0, category: "hungarian", explanation: "Az ott helyes, két t-vel — helyet jelöl. Az „ot” önmagában nem magyar szó." },
  { prompt: "Melyik kétjegyű msh jelölés helyes?", options: ["ly", "lj", "lly", "ljj"], correctIndex: 0, category: "hungarian", explanation: "Az ly kétjegyű mássalhangzó. Az lj két külön hang, az lly és az ljj nem létező jelölés." },
  { prompt: "Mi a \"tanár\" szó többes száma?", options: ["tanárok", "tanárk", "tanárak", "tanárják"], correctIndex: 0, category: "hungarian", explanation: "A tanár többes száma tanárok. A mély hangrendű szavakhoz -ok, -ak, -k jár; itt az -ok illik." },
  { prompt: "Melyik szó tartalmaz hosszú magánhangzót?", options: ["hal", "fal", "hál (hosszú á-val)", "kal"], correctIndex: 2, category: "hungarian", explanation: "A hál szóban hosszú á van — ezt ékezet jelöli. A hal, fal rövid a-val szól." },
  { prompt: "Melyik szóban van \"j\" hang, de \"ly\"-t írunk?", options: ["játék", "hely", "jég", "jobb"], correctIndex: 1, category: "hungarian", explanation: "A hely szóban j hangot ejtünk, de ly-t írunk. A játék, jég, jobb mind j-vel is írandó." },
  { prompt: "Mi a \"könyv\" szó tárgyragos alakja?", options: ["könyvet", "könyvöt", "könyvat", "könyved"], correctIndex: 0, category: "hungarian", explanation: "A könyv tárgyragos alakja könyvet. A magas hangrendű szó -et kötőhangzót kap, nem -öt vagy -at." },
  { prompt: "Egészítsd ki: A gyerekek ___ a parkban.", options: ["játszanak", "játsznak", "jácanak", "játszannak"], correctIndex: 0, category: "hungarian", explanation: "A helyes alak: A gyerekek játszanak a parkban. A játsznak, jácanak, játszannak mind hibás írásmód." },
  { prompt: "Melyik szóban van kétjegyű mássalhangzó?", options: ["anya", "alma", "apa", "ág"], correctIndex: 0, category: "hungarian", explanation: "Az anya szóban ott az ny — kétjegyű mássalhangzó. Az alma, apa, ág csak egyjegyűeket tartalmaz." },
  { prompt: "Mi az ige a mondatban: A macska alszik.?", options: ["macska", "A", "alszik", "mondatban"], correctIndex: 2, category: "hungarian", explanation: "Az ige az alszik: cselekvést vagy állapotot fejez ki. A macska főnév, az A névelő." },
  { prompt: "Melyik szó szinonímája a \"boldog\"-nak?", options: ["szomorú", "vidám", "mérges", "fáradt"], correctIndex: 1, category: "hungarian", explanation: "A boldog szinonimája a vidám — hasonló jelentés. A szomorú és a mérges ellentétes érzés." },
  { prompt: "Melyik a helyes: \"szebb\" vagy \"szépebb\"?", options: ["szebb", "szépebb", "szépbb", "mind jó"], correctIndex: 0, category: "hungarian", explanation: "A helyes középfok a szebb. A szép rendhagyó: nem szépebb, hanem szebb lesz belőle." },
  { prompt: "Hol van a \"j\" hang: gólya vagy díj?", options: ["csak gólyában", "csak díjban", "mindkettőben", "egyikben sem"], correctIndex: 2, category: "hungarian", explanation: "Mindkettőben j hangot ejtünk: a gólyában ly-nal, a díjban j-vel írjuk. A hang ugyanaz, az írás más." },
  { prompt: "Melyik a mondatrész: A ház nagy.?", options: ["alany: ház, állítmány: nagy", "alany: A, állítmány: ház", "tárgy: nagy, alany: A", "nincs állítmány"], correctIndex: 0, category: "hungarian", explanation: "Az alany a ház (miről szól a mondat), az állítmány a nagy (mit állítunk róla). Az A csak névelő." },
];

const ALL_QUIZZES = [...ENGLISH_QUIZZES, ...MATH_QUIZZES, ...HUNGARIAN_QUIZZES];

const CATEGORY_LABELS: Record<Quiz["category"], { label: string; color: string; icon: string }> = {
  english: { label: "Angol", color: "text-cyan-300", icon: "\u{1F1EC}\u{1F1E7}" },
  math: { label: "Matek", color: "text-amber-300", icon: "\u{1F522}" },
  hungarian: { label: "Magyar nyelvtan", color: "text-emerald-300", icon: "\u{1F4DD}" },
  science: { label: "Természettudomány", color: "text-lime-300", icon: "\u{1F52C}" },
  history: { label: "Történelem", color: "text-orange-300", icon: "\u{1F3DB}\u{FE0F}" },
};

/* --- Segédfüggvények --- */
function asFour(q: Quiz) {
  return { id: q.id ?? "", prompt: q.prompt, options: q.options.slice(), correctIndex: q.correctIndex, ...(q.explanation ? { explanation: q.explanation } : {}) };
}

function categoryOf(subject: string | undefined): Quiz["category"] {
  return subject && subject in CATEGORY_LABELS ? (subject as Quiz["category"]) : "english";
}

/** A közös ismétlési sorból csak a saját (Brain Rot) tétel, a tananyag, az évfolyam-bank és az angol szóbank jön vissza. */
function ownsReviewKey(key: string): boolean {
  return key.startsWith(`bank:${BRAIN_ROT_GAME_ID}:`) || key.startsWith("mat:") || key.startsWith("grade:") || key.startsWith("vocab:en:");
}

/* --- Fo komponens --- */
export default function BrainRotSteal() {
  const boardRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  /** Szünet (a `Phase` változatlan) — szünetben a kérdés-óra, a 90 mp-es óra és a világ áll. */
  const [paused, setPaused] = useState(false);
  const [, navigate] = useLocation();
  const haptics = useHaptics();
  const best = useBestScore("brain-rot-steal");
  const touchCapable = useTouchCapable();
  // G-5: csökkentett mozgásnál nincs pattanás, villanás, rázás (M9).
  const reducedMotion = useReducedMotion();

  /**
   * LS-3b: the play-time coupon earned in a lesson, if there is one.
   *
   * Inert without a coupon — free play stays exactly as it was.
   */
  const coupon = useCouponSession();
  const couponRef = useRef(coupon);
  couponRef.current = coupon;

  // Tananyag-kvíz: a játékos osztályának legutóbbi 3 anyagából (Claude-generált).
  const { grade: userGrade } = useClassroomGrade();
  const gradeRef = useRef(userGrade);
  gradeRef.current = userGrade;
  /**
   * G-4: adaptív nehézség — a sáv a VÁLASZOKAT követi (három jó után nehezít, két rossz után könnyít), a pálya körül
   * tartva. A spawn-tempó (`spawnEveryMs`) és a kérdés-sáv (évfolyam-bank) ebből jön.
   */
  // Spec 2026-09-29: a kezdő sáv a játékos évfolyamából (évfolyam nélkül a régi 4. osztályos sáv).
  const difficultyRef = useRef(startingDifficulty(userGrade ?? 4));
  const answerHistoryRef = useRef<boolean[]>([]);
  // Spec 2026-09-29-palyak-szoletra-nyelvek (E szelet): 10 pálya évfolyamonként (3–12.); a futás pályája a startkor rögzül.
  const levels = useGradeLevel("brainrot", userGrade);
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

  const { data: syncEligibility } = useSyncEligibilityQuery();
  const syncBanner = useMemo(() => gameSyncBannerText(syncEligibility), [syncEligibility]);

  const { items: materialItems } = useMaterialQuizzes(userGrade, undefined, coupon.lessonId);

  /* --- Kérdésforrás --- */
  const fullQuizPool = useMemo(() => {
    const matMapped: Quiz[] = materialItems
      .filter(isPlayableQuestion)
      .map((q) => {
        const t = (q.topic ?? "").toLowerCase();
        const cat: Quiz["category"] = t === "math" ? "math" : t === "hungarian" ? "hungarian" : "english";
        return {
          id: q.id,
          prompt: q.prompt,
          options: [...q.options],
          correctIndex: q.correctIndex,
          // T-1: a bankból jövő magyarázat, ha a lecke exportja hozta.
          explanation: q.explanation ?? undefined,
          category: cat,
          topic: q.topic ?? undefined,
          fromMaterial: true,
        };
      });
    return coupon.active && matMapped.length ? matMapped : [...matMapped, ...ALL_QUIZZES];
  }, [materialItems, coupon.active]);
  const poolRef = useRef(fullQuizPool);
  poolRef.current = fullQuizPool;

  /** Spec 2026-09-29: a futásban már feltett kérdések (azonosító + prompt). */
  const gradeSeenRef = useRef(createGradeQuizSeen());

  /**
   * S8 / terv A8: az angol kérdés-hely a központi szóbankból (közös napló mind a hét játékra). `null`, amíg
   * tölt, vagy ha a betöltés hibázott — ilyenkor a kézi `ENGLISH_QUIZZES` / évfolyam-bank megy, változatlanul.
   */
  const vocab = useVocabQuizSource("en", true);
  const vocabRef = useRef(vocab);
  vocabRef.current = vocab;

  /** A menet seedje (K.4/13): a tétel-sorsolás és a világ is ebből — azonos seed, azonos menet. */
  const seedBase = useMemo(() => readGameSeed() ?? seedFrom(BRAIN_ROT_GAME_ID, new Date().toISOString().slice(0, 10)), []);
  const runIndexRef = useRef(0);
  const runSeedRef = useRef<string>(seedFrom(seedBase, 0));
  const pickRngRef = useRef<() => number>(createRng(seedFrom(BRAIN_ROT_GAME_ID, runSeedRef.current, "pick")).next);
  /** Teszt-kampó: a következő kérdés (a mérő leghosszabb-válasz / leghosszabb-prompt esete). */
  const forcedQuizRef = useRef<PlayQuestion | null>(null);

  /**
   * A kérdés-ütemező forrása (K.2 forrásrend): (1) nem látott tananyag → (2) évfolyam-bank (az angol hely a szóbankból) →
   * (3) a lap kézi bankja. Kupon módban csak tananyag. Stabil objektum: a mostani állapotot ref-ekből olvassa (a director
   * menetenként egyszer kapja meg).
   */
  const provider = useMemo<QuestionProvider>(
    () => ({
      get couponOnly() {
        return couponRef.current.active && poolRef.current.some((q) => q.fromMaterial);
      },
      material: () => {
        const sharedGrade = gradeForGame(gradeRef.current);
        const couponMaterialOnly = couponRef.current.active && poolRef.current.some((q) => q.fromMaterial);
        if (sharedGrade == null && !couponMaterialOnly) return null;
        const material = pickUnseenMaterial(poolRef.current.filter((q) => q.fromMaterial), gradeSeenRef.current);
        if (!material) return null;
        markGradeQuizSeen(gradeSeenRef.current, material);
        return materialPlayQuestion(asFour(material), {
          subject: material.topic ?? material.category,
          coupon: couponRef.current.active,
          ...(sharedGrade != null ? { grade: sharedGrade } : {}),
        });
      },
      fresh: () => {
        // Teszt-kampó (csak a teszt-buildben kérhető): a leghosszabb válaszú / promptú tétel a mérőnek (review #485 B2, K3).
        const forced = forcedQuizRef.current;
        if (forced) {
          forcedQuizRef.current = null;
          return forced;
        }
        const grade = gradeRef.current;
        const sharedGrade = gradeForGame(grade);
        const seen = gradeSeenRef.current;
        const rng = pickRngRef.current;
        const vocabSource = vocabRef.current;
        // A tananyag-ág UTÁN: ha a kérdés-hely angol, a szóbankból kérdez (a kiváltott évfolyam-banki tétel is fogy).
        const fromVocab = (): PlayQuestion | null => {
          const vq = vocabSource?.next(vocabLevelForGrade(grade, difficultyRef.current)) ?? null;
          if (!vq) return null;
          markGradeQuizSeen(seen, vq);
          return { ...vocabPlayQuestion(vq), subject: "english" };
        };
        /** Kézi angol kérdés: a helyes válasza a közös naplóba, hogy a szóbank ne kérdezze vissza ugyanazt a szót. */
        const manualEnglish = (q: Quiz): Quiz => {
          if (q.category === "english" && !q.fromMaterial) vocabSource?.markExternal(q.options[q.correctIndex]!);
          return q;
        };
        if (sharedGrade != null) {
          // A kiválasztott tétel MINDIG fogy (review #424), akkor is, ha a szóbank váltja ki.
          const slot = pickGradeSlotWithVocab({
            pick: () => pickGradeQuiz({ grade: sharedGrade, band: difficultyRef.current, seen, rng }),
            seen,
            vocabNext: fromVocab,
          });
          if (slot?.kind === "vocab") return slot.quiz;
          if (slot) {
            const item = slot.item;
            manualEnglish({ id: item.id, prompt: item.prompt, options: [...item.options], correctIndex: item.correctIndex, category: item.subject });
            return gradePlayQuestion(item);
          }
        }
        const pool = poolRef.current;
        if (pool.length === 0) return null;
        const fallback = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!;
        if (fallback.category === "english" && !fallback.fromMaterial) {
          const vq = fromVocab();
          if (vq) return vq;
        }
        if (fallback.fromMaterial) return materialPlayQuestion(asFour(fallback), { subject: fallback.topic ?? fallback.category });
        return bankPlayQuestion(BRAIN_ROT_GAME_ID, asFour(manualEnglish(fallback)), fallback.category, sharedGrade ?? undefined);
      },
      // A közös ismétlési sorból csak a saját tétel jön vissza; az évfolyamot a director közös szabálya szűri.
      restore: (item) => {
        if (!ownsReviewKey(item.key)) return null;
        return restoreReviewQuestion(item, {
          vocab: (lang) => (lang === "en" ? vocabRef.current : null),
          gradeItem: (id) => loadedGradeItems().find((g) => g.id === id) ?? null,
        });
      },
    }),
    [],
  );

  const directorConfig = useMemo(() => brainRotDirectorConfig(gradeForGame(userGrade) ?? null), [userGrade]);

  /* --- A menet meghajtója (a node-szimulációval közös: `createBrainRotDriver`) --- */
  const boardSizeRef = useRef({ w: 360, h: 560 });
  const [board, setBoard] = useState({ w: 360, h: 560 });
  const unitPx = Math.max(1, Math.min(board.w, board.h));
  const unitRef = useRef(unitPx);
  unitRef.current = unitPx;
  /** A lény mérete, élettartama, sebessége és kora a hangolóból (`lib/brainRotTuning.ts`) — a tábla és az évfolyam szerint. */
  const tuningFor = (w: number, h: number): BrainRotTuning => ({
    sizePx: (rng) => brainRotSizeFor({ grade: gradeRef.current, boardW: w, boardH: h }, rng),
    unitPx: Math.max(1, Math.min(w, h)),
    lifetimeMs: brainRotLifetimeFor(gradeRef.current),
    speedScale: brainRotSpeedScaleFor(gradeRef.current),
    ageMs: brainRotAgeMs,
  });
  // a `usePlayQuestion` hívás után azonnal kitöltve (lent); a meghajtó csak képkockában / eseményben olvassa
  const qRef = useRef<ReturnType<typeof usePlayQuestion>>(null as unknown as ReturnType<typeof usePlayQuestion>);
  const makeDriver = (seed: string): BrainRotDriver => {
    const { w, h } = boardSizeRef.current;
    const unit = Math.max(1, Math.min(w, h));
    return createBrainRotDriver({
      seed,
      questions: {
        frame: (c, ctx) => qRef.current?.frame(c, ctx),
        timeScale: () => qRef.current?.timeScale() ?? 1,
        finished: () => qRef.current?.finished() ?? true,
        finish: () => qRef.current?.finish(),
        request: (reason, c) => qRef.current?.request(reason, c) ?? null,
        abort: () => qRef.current?.abort(),
        canAsk: () => qRef.current?.canAsk() ?? false,
        active: () => qRef.current?.active() ?? null,
        pick: (i, c) => qRef.current?.pick(i, c),
      },
      band: () => difficultyRef.current,
      tuning: tuningFor(w, h),
      arenaW: w / unit,
      arenaH: h / unit,
      reducedMotion,
    });
  };
  const driverRef = useRef<BrainRotDriver | null>(null);
  if (!driverRef.current) driverRef.current = makeDriver(runSeedRef.current);
  const maxMultiplierRef = useRef(1);
  const firstCageSeenRef = useRef(false);

  const q = usePlayQuestion({
    setup: { config: directorConfig, provider, startBand: difficultyRef.current, seed: runSeedRef.current },
    // A rezgést a lap adja (a játékbeli következménnyel együtt), hogy egy kimenet = egy visszajelzés.
    haptics: false,
    onShow: (p) => {
      firstCageSeenRef.current = true;
      const core = driverRef.current?.core;
      if (!core) return;
      // B2: a ketrec valódi feliratszélességével ellenőrzünk; ha egy válasz nem fér, jelölt mód (szám + szín + jelmagyarázat).
      const st = core.state();
      const widthPx = cageWidthU(st.arenaW, st.arenaH, p.options.length) * unitRef.current;
      const compact = !cageLabelsFit(p.options.map((o) => o.label), widthPx);
      setCageCompact(compact);
      core.setCageZone(st.cageTop, compact);
      // Q1 Ketrec-zár: a 4 válasz 4 ketrec (az előjelzés után élesednek).
      core.openCages(p.options.length, p.id);
      setCageZoneVersion((v) => v + 1);
    },
    onOutcome: (o, p) => {
      const picked = o.pickedOriginalIndex === null ? -1 : p.options.findIndex((opt) => opt.originalIndex === o.pickedOriginalIndex);
      // ≤ 2 s játékbeli következmény (K.4/23): jó → a lény a ketrecben marad; rossz / lejárat → elszökik.
      driverRef.current?.core.applyOutcome(o.result, picked < 0 ? null : picked);
      if (o.result === "aborted") return;
      const good = o.result === "correct";
      if (o.pickedOriginalIndex !== null) maybeClaimCouponBonus(couponRef.current, p.question.quiz.id, o.pickedOriginalIndex);
      recordDifficultyAnswer(good);
      if (good) haptics("success");
      else haptics("error");
    },
  });
  qRef.current = q;

  /**
   * „Miért?” — a játékos kérte magyarázat (a közös QuizFeedbackCard). Amíg nyitva van, a játék áll: az olvasásért nem
   * jár büntetés (terv 9.: a „magyarázat olvasása közben áll az óra” követelmény megmarad).
   */
  const [feedback, setFeedback] = useState<FeedbackCard | null>(null);
  const [expanded, setExpanded] = useState(false);
  const whyOpen = feedback !== null || expanded;
  const pausedRef = useRef(false);
  pausedRef.current = paused || whyOpen;

  const [hud, setHud] = useState<HudSnap>(EMPTY_HUD);
  const [result, setResult] = useState<RunResult | null>(null);
  const [floats, setFloats] = useState<FloatingText[]>([]);
  const floatsRef = useRef<FloatingText[]>([]);
  const floatIdRef = useRef(0);
  const lastEscapeRef = useRef<{ at: number; id: number; n: number } | null>(null);
  // 3D aréna: elkapáskor szikra-robbanás a lény padlópontján (csak látvány).
  const [arenaBursts, setArenaBursts] = useState<ArenaBurst[]>([]);
  const arenaBurstIdRef = useRef(0);
  const [screenFlash, setScreenFlash] = useState<string | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  /** Időzítő felvétele (L5: a lista nem nő a menet alatt — a régiek már lefutottak, csak az utolsó 32 kell a takarításhoz). */
  const later = useCallback((fn: () => void, ms: number) => {
    const list = timeoutsRef.current;
    list.push(window.setTimeout(fn, ms));
    if (list.length > 32) list.splice(0, list.length - 32);
  }, []);
  const scoreSubmittedRef = useRef(false);
  /** Az új rekord-jelzés az eredményképernyőn (futásonként egyszer számolva). */
  const [isNewBest, setIsNewBest] = useState(false);
  const bestSubmittedRef = useRef(false);
  const fpsRef = useRef(60);
  const creatureEls = useRef(new Map<number, HTMLDivElement>());
  const playerElRef = useRef<HTMLDivElement>(null);
  const cageRingRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const registerCreature = useCallback((id: number, el: HTMLDivElement | null) => {
    if (el) creatureEls.current.set(id, el);
    else creatureEls.current.delete(id);
  }, []);
  const setCageRing = useCallback((i: number, el: HTMLSpanElement | null) => {
    cageRingRefs.current[i] = el;
  }, []);
  /** A joystick húzásának megszakítása szünetkor / fókuszvesztéskor (VirtualJoystick resetSignal). */
  const [joyReset, setJoyReset] = useState(0);
  /** Jelölt mód (a válaszfelirat nem fér a ketrecbe) és a ketrec-zóna verziója (a memo-s réteg újrarajzolásához). */
  const [cageCompact, setCageCompact] = useState(false);
  const [cageZoneVersion, setCageZoneVersion] = useState(0);
  const [legendTop, setLegendTop] = useState<{ top: number; left: number; width: number } | null>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  /** K.4/16: balkezes tükrözés — a joystick a jobb hüvelykujjhoz kerül (helyben tárolva, tárolóhiba esetén alapérték). */
  const [leftHanded, setLeftHanded] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(HAND_KEY) === "left";
    } catch {
      return false;
    }
  });
  const chooseHand = useCallback((left: boolean) => {
    setLeftHanded(left);
    try {
      window.localStorage.setItem(HAND_KEY, left ? "left" : "right");
    } catch {
      /* privát mód / megtelt tároló: a választás a menetre érvényes marad */
    }
  }, []);

  // Unmountkor az összes pending timeout törlése (beragadó state megelőzése)
  useEffect(() => () => { timeoutsRef.current.forEach(clearTimeout); }, []);

  /* --- Lebegő feliratok: sávokra osztva, nem fedik egymást (kanban #64) --- */
  const addFloat = useCallback((x: number, y: number, text: string, color: string, kind: FloatingText["kind"]) => {
    const now = performance.now();
    if (kind === "escape") {
      // A közel egyidejű szökések egy összesítő feliratot kapnak (két egymásra csúszó „Elszökött!” helyett).
      const prev = lastEscapeRef.current;
      if (prev && now - prev.at < ESCAPE_MERGE_MS && floatsRef.current.some((f) => f.id === prev.id)) {
        prev.n += 1;
        prev.at = now;
        floatsRef.current = floatsRef.current.map((f) => (f.id === prev.id ? { ...f, text: `${prev.n} elszökött!` } : f));
        setFloats(floatsRef.current);
        return;
      }
    }
    const w = boardSizeRef.current.w;
    const fx = Math.min(w - 64, Math.max(64, x));
    let fy = y;
    for (let k = 0; k < 5; k++) {
      if (!floatsRef.current.some((f) => Math.abs(f.x - fx) < 110 && Math.abs(f.y - fy) < FLOAT_LANE_PX)) break;
      fy -= FLOAT_LANE_PX;
    }
    fy = Math.max(16, fy);
    const id = floatIdRef.current++;
    floatsRef.current = [...floatsRef.current, { id, x: fx, y: fy, text, color, kind }].slice(-8);
    setFloats(floatsRef.current);
    if (kind === "escape") lastEscapeRef.current = { at: now, id, n: 1 };
    later(() => {
      floatsRef.current = floatsRef.current.filter((f) => f.id !== id);
      setFloats(floatsRef.current);
    }, FLOAT_MS);
  }, []);

  /** 3D aréna-robbanás: elkapáskor arany szikraeső, elszökéskor rövid füst (csak látvány). */
  const pushArenaBurst = useCallback((x: number, y: number, kind: ArenaBurst["kind"]) => {
    const burstId = arenaBurstIdRef.current++;
    setArenaBursts((prev) => [...prev.slice(-5), { id: burstId, x, y, kind }]);
    later(() => setArenaBursts((prev) => prev.filter((b) => b.id !== burstId)), 1200);
  }, []);

  /* --- A mag eseményei → hang, rezgés, felirat, robbanás (eseményre, nem képkockánként) --- */
  const onEvent = useCallback(
    (e: BrainRotEvent) => {
      const u = unitRef.current;
      const x = e.x * u;
      const y = e.y * u;
      if (e.type === "catch") {
        haptics("hit");
      } else if (e.type === "kept" || e.type === "direct") {
        pushArenaBurst(x, y, "catch");
        addFloat(x, y - 24, `+${e.n} XP`, "#fbbf24", "gain");
        const m = driverRef.current?.core.state().combo.multiplier ?? 1;
        if (m > maxMultiplierRef.current) maxMultiplierRef.current = m;
        if (e.type === "direct") haptics("success");
        if (e.type === "kept" && m >= 2) {
          sfxLevelUp();
          // Csökkentett mozgásnál nincs villanás (M9).
          if (!reducedMotion) {
            setScreenFlash("rgba(251, 191, 36, 0.15)");
            later(() => setScreenFlash(null), 300);
          }
        }
      } else if (e.type === "lost" || e.type === "escape") {
        // Látható „elszökött” visszajelzés: füst az arénában + felirat (narancs, nem telített piros — K.4/20). A rossz
        // ketrecnél a felirat a ketrec FÖLÖTT (ne a vadászra és a ketrec feliratára essen).
        pushArenaBurst(x, y, "escape");
        addFloat(x, e.type === "lost" ? y - 0.17 * u : y - 18, "Elszökött!", "#fdba74", "escape");
      } else if (e.type === "dazed") {
        addFloat(x, y - 34, "Elfáradt!", "#67e8f9", "info");
      }
    },
    [addFloat, haptics, pushArenaBurst, reducedMotion],
  );
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  /* --- Játék indítása --- */
  const startGame = useCallback(() => {
    // K.4/22: a hang (AudioContext) az indító koppintáson indul — nem az első kérdés pillanatában (az a játékban akadás volt).
    sfxClick();
    runIndexRef.current += 1;
    const seed = seedFrom(seedBase, runIndexRef.current);
    runSeedRef.current = seed;
    pickRngRef.current = createRng(seedFrom(BRAIN_ROT_GAME_ID, seed, "pick")).next;
    runLevelRef.current = levels.level;
    levelClearedRef.current = false;
    scoreSubmittedRef.current = false;
    bestSubmittedRef.current = false;
    difficultyRef.current = levelStartBand(runLevelRef.current, startingDifficulty(userGrade ?? 4));
    gradeSeenRef.current = createGradeQuizSeen();
    answerHistoryRef.current = [];
    maxMultiplierRef.current = 1;
    firstCageSeenRef.current = false;
    driverRef.current = makeDriver(seed);
    q.reset(seed, difficultyRef.current);
    floatsRef.current = [];
    lastEscapeRef.current = null;
    setFloats([]);
    setArenaBursts([]);
    setScreenFlash(null);
    setFeedback(null);
    setExpanded(false);
    setHud(EMPTY_HUD);
    setResult(null);
    setIsNewBest(false);
    setPaused(false);
    setPhase("play");
    // `makeDriver` a mostani tábla-méretet és hangolást olvassa (ref-ekből).
  }, [userGrade, levels.level, q, seedBase]);

  /** A menet lezárása: a horog már lezárta a kérdést (settled); az eredmény a director valós statisztikájából. */
  const endRun = useCallback((forcedCorrect?: number) => {
    const ctl = qRef.current;
    if (!ctl.finished()) ctl.finish();
    const d = driverRef.current!;
    const st = d.core.state();
    const stats = ctl.director?.stats(d.clockMs());
    const correct = Math.max(stats?.correct ?? 0, forcedCorrect ?? 0);
    const wrong = (stats?.wrong ?? 0) + (stats?.timeouts ?? 0);
    setFeedback(null);
    setExpanded(false);
    setResult({
      score: st.score,
      caught: Math.max(st.caught, forcedCorrect ?? 0),
      missed: st.missed,
      lost: st.lost,
      correct,
      total: correct + wrong,
      wrong,
      bestStreak: st.combo.best,
      maxMultiplier: maxMultiplierRef.current,
      seconds: Math.round(Math.min(ROUND_MS, d.clockMs()) / 1000),
    });
    setPhase("over");
  }, []);
  const endRunRef = useRef(endRun);
  endRunRef.current = endRun;

  const pause = useCallback(() => {
    if (phase === "play") setPaused(true);
  }, [phase]);
  const resume = useCallback(() => setPaused(false), []);
  const exitToGames = useCallback(() => {
    setPaused(false);
    qRef.current.finish();
    navigate("/games");
  }, [navigate]);

  // Szünetkor a joystick elenged (a folytatás után új érintés kell — ne vezessen tovább magától).
  useEffect(() => {
    if (!paused) return;
    setJoyReset((n) => n + 1);
    driverRef.current?.core.setInput(0, 0);
  }, [paused]);

  /* --- „Miért?”: szünet + a valódi magyarázókártya --- */
  const openWhy = useCallback(() => {
    const item = qRef.current.view().whyItem;
    if (!item) return;
    setFeedback(
      buildFeedback({
        quiz: item.quiz,
        chosenIndex: item.pickedOriginalIndex,
        // Egyetlen próbálkozás van (a felfedett válasz visszakoppintása megszűnt — terv 5.5, J-BR).
        attempt: 1,
        ageBand: "kid",
      }),
    );
  }, []);
  const closeWhy = useCallback(() => setFeedback(null), []);

  /**
   * Billentyűs válasz (a kérdés-sáv 1–4-e is ezt hívja): szünetben nincs válasz (S13 / review K1 — a háttér inert, de a
   * billentyűs út ellen is védünk).
   */
  const onAnswer = useCallback((idx: number) => {
    if (pausedRef.current) return;
    qRef.current.pick(idx, driverRef.current!.clockMs());
  }, []);

  /* --- Tesztes API (K.2): `forceState({ question: true })` / `phase: "quiz"` → egy lény a vadász kezében + ketrecek --- */
  useEffect(() => {
    return installGameTestApi({
      probe: () => {
        const ctl = qRef.current;
        const d = driverRef.current!;
        const st = d.core.state();
        const stats = ctl.director?.stats(d.clockMs());
        const p = ctl.view().presentation;
        return {
          simTime: d.loop.simTimeMs(),
          questionOpen: ctl.active() ? 1 : 0,
          questionsAnswered: stats?.answered ?? 0,
          questionsCorrect: stats?.correct ?? 0,
          fps: fpsRef.current,
          band: difficultyRef.current,
          intensity: ctl.director?.intensity() ?? null,
          level: runLevelRef.current,
          paceScale: 1.4 - difficultyRef.current * 0.55,
          paused: pausedRef.current ? 1 : 0,
          clock: d.clockMs(),
          timeLeft: d.remainingMs() / 1000,
          caught: st.caught,
          carry: st.carry ? 1 : 0,
          cagesOpen: st.cagesOpen ? 1 : 0,
          playerX: st.player.x,
          playerY: st.player.y,
          creatures: st.creatures.filter((c) => c.active && c.state === "free").length,
          reveal: ctl.view().reveal ? 1 : 0,
          questionId: p?.id ?? null,
          questionSeconds: p ? p.windowMs / 1000 : null,
          // A mag választerületei px-ben a táblához képest (review #485: a kirajzolt ketrecekkel össze kell esniük).
          cageRects: JSON.stringify(
            st.cages.slice(0, st.cageCount).map((c) => [(c.x - c.w / 2) * unitRef.current, (c.y - c.h / 2) * unitRef.current, c.w * unitRef.current, c.h * unitRef.current]),
          ),
        };
      },
      forceState: (patch: GameForcePatch) => {
        if (patch.phase === "quiz-long" || patch.phase === "quiz-longprompt") {
          // A kézi bank és a betöltött évfolyam-bank leghosszabb válaszú / promptú tétele (programmal kikeresve).
          const candidates = [
            ...ALL_QUIZZES.map((q) => ({ quiz: asFour(q), subject: q.category as string, grade: undefined as number | undefined })),
            ...loadedGradeItems().map((g) => ({ quiz: { id: g.id, prompt: g.prompt, options: g.options.slice(), correctIndex: g.correctIndex, explanation: g.explanation }, subject: g.subject as string, grade: g.grade })),
          ];
          const score = (q: { prompt: string; options: string[] }) =>
            patch.phase === "quiz-long" ? Math.max(...q.options.map((o) => o.length)) : q.prompt.length;
          const best = candidates.reduce((a, b) => (score(b.quiz) > score(a.quiz) ? b : a));
          forcedQuizRef.current = bankPlayQuestion(BRAIN_ROT_GAME_ID, best.quiz, best.subject, best.grade);
        }
        if (patch.question || patch.phase === "quiz" || patch.phase === "quiz-long" || patch.phase === "quiz-longprompt") {
          // `phase: "quiz"` a `question: true` kompatibilis álneve (terv 9.): azonnal egy lény a vadász kezében, és kérdés.
          setPaused(false);
          const d = driverRef.current!;
          d.core.forceCatch();
          d.resolve();
          return;
        }
        if (patch.phase === "play") startGame();
        if (patch.phase === "menu") {
          setPaused(false);
          setPhase("menu");
        }
        if (patch.phase === "over") {
          setPaused(false);
          endRun(typeof patch.correctCount === "number" ? patch.correctCount : undefined);
        }
      },
    });
  }, [endRun, startGame]);

  // R = quick-restart az "over" / "menu" képernyőn (csak a gyerek billentyűjére — nincs automatikus újraindítás).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "r" && e.key !== "R") return;
      if (phase === "over" || phase === "menu") {
        e.preventDefault();
        startGame();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startGame]);

  // Asztali gépen: nyilak / WASD = futás, P / Escape = szünet (a ketreceket a kérdés-sáv 1–4 billentyűje is választja).
  useEffect(() => {
    if (phase !== "play") return;
    const keys = new Set<string>();
    const apply = () => {
      const x = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0);
      const y = (keys.has("down") ? 1 : 0) - (keys.has("up") ? 1 : 0);
      driverRef.current?.core.setInput(x, y);
    };
    const dirOf = (k: string): string | null =>
      k === "ArrowLeft" || k === "a" || k === "A" ? "left" : k === "ArrowRight" || k === "d" || k === "D" ? "right" : k === "ArrowUp" || k === "w" || k === "W" ? "up" : k === "ArrowDown" || k === "s" || k === "S" ? "down" : null;
    const onDown = (e: KeyboardEvent) => {
      if (pausedRef.current || document.documentElement.dataset.gameCouponExpired === "true") return;
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        setPaused(true);
        return;
      }
      const dir = dirOf(e.key);
      if (!dir) return;
      e.preventDefault();
      keys.add(dir);
      apply();
    };
    const onUp = (e: KeyboardEvent) => {
      const dir = dirOf(e.key);
      if (!dir || !keys.delete(dir)) return;
      apply();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [phase]);

  /* --- A tábla mérete: az aréna egysége (rövidebb oldal) és a hangolás --- */
  useEffect(() => {
    const el = boardRef.current;
    if (!el || phase !== "play") return;
    const measure = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      boardSizeRef.current = { w, h };
      const unit = Math.min(w, h);
      driverRef.current?.core.setArena(w / unit, h / unit, tuningFor(w, h));
      setBoard((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);

  /* --- Képkocka-hurok (rAF): kérdés-óra, sim, a DOM-elemek helye ref-eken át (nincs React-állapot, KSZ-9) --- */
  const paint = useCallback(() => {
    const st = driverRef.current!.core.state();
    const u = unitRef.current;
    const pl = playerElRef.current;
    if (pl) pl.style.transform = `translate3d(${(st.player.x * u).toFixed(1)}px, ${(st.player.y * u).toFixed(1)}px, 0)`;
    for (const c of st.creatures) {
      if (!c.active) continue;
      const el = creatureEls.current.get(c.id);
      if (el) el.style.transform = `translate3d(${(c.x * u).toFixed(1)}px, ${(c.y * u).toFixed(1)}px, 0)`;
    }
    for (let i = 0; i < st.cageCount; i++) {
      const ring = cageRingRefs.current[i];
      if (!ring) continue;
      ring.style.setProperty("--dwell", String(Math.min(1, st.cages[i]!.dwellMs / CAGE_DWELL_MS)));
      // KSZ-11: az előjelzés (még nem éles) látható állapot a ketrecen.
      const box = ring.parentElement;
      const armed = st.cages[i]!.armed ? "true" : "false";
      if (box && box.dataset.armed !== armed) box.dataset.armed = armed;
    }
  }, []);

  useEffect(() => {
    if (phase !== "play") return;
    let raf = 0;
    let last: number | null = null;
    let fpsAcc = 0;
    let fpsFrames = 0;
    let endAt: number | null = null;
    const tick = (now: number) => {
      const dt = last === null ? 0 : Math.min(250, Math.max(0, now - last));
      last = now;
      fpsAcc += dt;
      fpsFrames += 1;
      if (fpsAcc >= 500) {
        fpsRef.current = Math.round((fpsFrames * 1000) / fpsAcc);
        fpsAcc = 0;
        fpsFrames = 0;
      }
      const d = driverRef.current!;
      // A meghajtó képkockája (a sim ugyanezt hívja): kérdés-óra (szünetben áll) → az óra lejárta → kérdés-sáv →
      // időskála (szünet 0, nyitott kérdés slowMo) → fix lépés → elkapás / ketrec → események.
      d.frame(dt, pausedRef.current, onEventRef.current);
      paint();
      if (d.core.running()) endAt = null;
      if (!d.core.running() && qRef.current.settled()) {
        // A menet vége: a futó megoldás-kijelzés lefutott; egy pillanat, és az eredménylap.
        if (endAt === null) endAt = now + 500;
        if (now >= endAt) {
          endRunRef.current();
          return;
        }
      }
      // #58: `requestGameFrame` — a lejárt kupon alatt a képkocka-hurok áll.
      raf = requestGameFrame(tick);
    };
    raf = requestGameFrame(tick);
    return () => cancelGameFrame(raf);
  }, [phase, paint]);

  // HUD ≤ 10 Hz (KSZ-9): a lények listája (a DOM-elemek kulcsa), a pont, az idő. Szünetben nem frissül (az óra is áll).
  useEffect(() => {
    if (phase !== "play" || paused) return;
    const id = window.setInterval(() => {
      const d = driverRef.current!;
      const st = d.core.state();
      const u = unitRef.current;
      const creatures: HudSnap["creatures"] = [];
      const arena: ArenaRot[] = [];
      for (const c of st.creatures) {
        if (!c.active) continue;
        // A lény kora a VILÁG idejében (szünetben áll, a kérdés alatt lassul) — figyelmeztetés az utolsó 1,5 s-ban.
        const age = brainRotAgeMs({ now: st.worldMs, spawnTime: c.bornMs, pausedTotal: 0, pausedTotalAtSpawn: 0, pausedAt: null });
        const frac = age / c.lifeMs;
        const warning = c.state === "free" && !c.dazed && c.lifeMs - age <= BRAIN_ROT_WARNING_MS;
        const opacity = c.state === "escaping" ? 0.45 : frac > 0.8 && !c.dazed ? Math.max(0.4, 1 - ((frac - 0.8) / 0.2) * 0.6) : 1;
        const size = Math.round(c.r * 2 * u);
        creatures.push({ id: c.id, kind: c.kind, size, warning, opacity, dazed: c.dazed, carried: c.state === "carried" });
        if (c.state === "free") arena.push({ id: c.id, x: c.x * u, y: c.y * u, size, warning, opacity });
      }
      const hint: HudSnap["hint"] = st.worldMs < TUTORIAL_MS ? (firstCageSeenRef.current ? 2 : 1) : 0;
      // Változatlan lény-lista: ugyanaz a tömb (a memo-s réteg nem rajzol újra).
      setHud((prev) => {
        const sameList =
          prev.creatures.length === creatures.length &&
          prev.creatures.every((p, i) => {
            const c = creatures[i]!;
            return p.id === c.id && p.size === c.size && p.warning === c.warning && p.dazed === c.dazed && p.carried === c.carried && Math.abs(p.opacity - c.opacity) < 0.05;
          });
        return {
          score: st.score,
          caught: st.caught,
          combo: st.combo.count,
          multiplier: st.combo.multiplier,
          timeLeft: Math.ceil(d.remainingMs() / 1000),
          creatures: sameList ? prev.creatures : creatures,
          arena,
          carrying: st.carry !== null,
          hint,
        };
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, paused]);

  /* --- A ketrec-zóna a kérdés-kártya (és a jelmagyarázat) mért alja alatt (review #485 B2b, K3) --- */
  const presId = q.state.presentation?.id ?? null;
  const presReveal = q.state.reveal;
  useLayoutEffect(() => {
    if (phase !== "play" || presId === null) return;
    const card = document.querySelector<HTMLElement>('[data-testid="br-quiz"] .play-question-card');
    const boardEl = boardRef.current;
    if (!card || !boardEl) return;
    const measure = () => {
      const c = card.getBoundingClientRect();
      // A jelmagyarázat a kártya alá kerül (a kártya szélességében); fekvő telefonon — ahol a kártya alatt nincs hely egy
      // ketrecsornak — a kártya MELLÉ, jobbra, ha ott elfér (≥ 170 px).
      const sideRoom = window.innerWidth - c.right - 16;
      const side = window.innerWidth > window.innerHeight && window.innerHeight <= 520 && sideRoom >= 170;
      const next = side ? { top: c.top, left: c.right + 8, width: Math.min(300, sideRoom) } : { top: c.bottom + 6, left: c.left, width: c.width };
      setLegendTop((prev) =>
        prev && Math.abs(prev.top - next.top) < 1 && Math.abs(prev.left - next.left) < 1 && Math.abs(prev.width - next.width) < 1 ? prev : next,
      );
      const legend = legendRef.current?.getBoundingClientRect();
      const bottom = Math.max(c.bottom, legend ? legend.bottom : 0);
      const b = boardEl.getBoundingClientRect();
      const topU = Math.max(0, bottom - b.top - 2) / unitRef.current;
      const core = driverRef.current?.core;
      if (!core) return;
      const before = core.state().cageTop;
      core.setCageZone(topU, core.state().cageCompact);
      if (Math.abs(before - core.state().cageTop) > 0.005) setCageZoneVersion((v) => v + 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(card);
    if (legendRef.current) ro.observe(legendRef.current);
    ro.observe(boardEl);
    return () => ro.disconnect();
  }, [phase, presId, presReveal, cageCompact, legendTop !== null]);

  /* --- Bemenet a táblán: böködés / húzás = oda fut a vadász (egyujjas és egeres mód, K.4/17; KSZ-14) --- */
  const boardPointerRef = useRef<number | null>(null);
  const targetFrom = useCallback((clientX: number, clientY: number) => {
    const el = boardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const u = unitRef.current;
    driverRef.current?.core.setTarget((clientX - r.left) / u, (clientY - r.top) / u);
  }, []);
  const onBoardPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (pausedRef.current || (e.button !== undefined && e.button > 0)) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* a szintetikus esemény nem foglalható le — a böködés így is számít */
      }
      boardPointerRef.current = e.pointerId;
      targetFrom(e.clientX, e.clientY);
    },
    [targetFrom],
  );
  const onBoardPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerId !== boardPointerRef.current || pausedRef.current) return;
      targetFrom(e.clientX, e.clientY);
    },
    [targetFrom],
  );
  const releaseBoardPointer = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== boardPointerRef.current) return;
    boardPointerRef.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);
  /** Billentyűvel fókuszált ketrec (Enter / Szóköz): a vadász oda fut — a válasz a beállás, mint érintéssel. */
  const goToCage = useCallback((i: number) => {
    const st = driverRef.current?.core.state();
    const cage = st?.cages[i];
    if (!st || !cage || pausedRef.current) return;
    driverRef.current!.core.setTarget(cage.x, cage.y);
  }, []);

  /* --- Eredmény beküldése --- */
  useEffect(() => {
    if (phase !== "over" || !result || !syncEligibility?.eligible || scoreSubmittedRef.current) return;
    scoreSubmittedRef.current = true;
    void postGameScore({
      gameId: "brain-rot-steal",
      difficulty: "normal",
      runXp: result.score,
      // A menet LEGJOBB kombó-sorozata (K.2 „Pontszám-szerződés”, J12).
      runStreak: result.bestStreak,
      runSeconds: result.seconds,
      runId: newScoreRunId(),
    })
      .then(() => void queryClient.invalidateQueries({ queryKey: ["/api/games/leaderboard"] }))
      .catch(() => {
        scoreSubmittedRef.current = false;
      });
  }, [phase, syncEligibility, result]);

  // Achievement + Daily — egyszer fut "over" átmenetkor.
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([]);
  const achievementCheckedRef = useRef(false);
  useEffect(() => {
    if (phase !== "over") {
      achievementCheckedRef.current = false;
      return;
    }
    if (achievementCheckedRef.current || !result) return;
    achievementCheckedRef.current = true;
    const wasDailyAvailable = isTodaysGameAvailable("brain-rot-steal");
    const newOnes = recordRun({
      game: "brain-rot-steal",
      xpGained: result.score,
      // Valós kérdés-statisztika a directorból (K.2 „Menet-statisztika”); a lejárt kérdés is hibának számít.
      correctAnswers: result.correct,
      wrongAnswers: result.wrong,
      maxStreak: result.bestStreak,
      brainRotsCaught: result.caught,
      maxComboMultiplier: result.maxMultiplier,
      perfect: result.wrong === 0 && result.missed + result.lost === 0 && result.caught >= 5,
    });
    // Daily: ha a játékos legalább 10 brain rot-ot megtartott → "teljesítve".
    if (wasDailyAvailable && result.caught >= BRAIN_ROT_CLEAR_CATCHES) {
      const daily = markDailyCompleted();
      if (daily.achievements.length > 0) newOnes.push(...daily.achievements);
    }
    if (newOnes.length > 0) setNewlyUnlocked(newOnes);
  }, [phase, result]);

  // A sikeres futás (legalább 10 elkapás a kör végén) a következő pályát oldja fel; a menü azt ajánlja.
  const totalCaught = result?.caught ?? 0;
  useEffect(() => {
    if (phase === "over" && totalCaught >= BRAIN_ROT_CLEAR_CATCHES && runLevelRef.current != null && !levelClearedRef.current) {
      levelClearedRef.current = true;
      levels.complete(runLevelRef.current);
    }
  }, [phase, totalCaught]);

  /* --- Legjobb eredmény: helyi mentés (névtelen látogatónál is működik), futásonként egyszer --- */
  useEffect(() => {
    if (phase !== "over" || !result || bestSubmittedRef.current) return;
    bestSubmittedRef.current = true;
    const res = best.submit(result.score);
    setIsNewBest(res.isNewBest && result.score > 0);
  }, [phase, result, best]);

  /* --- Render --- */
  const screenState: GameScreenState =
    phase === "menu" ? "start" : phase === "over" ? "result" : paused ? "paused" : "playing";
  const inRun = phase === "play";
  const won = totalCaught >= BRAIN_ROT_CLEAR_CATCHES;
  const timeTone = hud.timeLeft <= ROUND_LIMIT * 0.15 ? "bad" : hud.timeLeft <= ROUND_LIMIT * 0.3 ? "warn" : "default";
  const view = q.state;
  const pres = view.presentation;
  const coreState = driverRef.current!.core.state();
  const showCages = inRun && !!pres && coreState.cageQuestionId === pres.id;
  const questionOpen = !!pres && !view.reveal;
  const carried = hud.creatures.find((c) => c.carried) ?? null;
  const carriedKind = carried ? BRAIN_ROT_KINDS[carried.kind]! : null;
  const presCategory = categoryOf(pres?.question.subject);
  const playerSize = Math.round(Math.max(44, 0.075 * 2 * unitPx * 1.2));
  const hintText =
    hud.hint === 1
      ? touchCapable
        ? "Húzd a joystickot!"
        : "Bökj a táblára vagy nyilazz!"
      : hud.hint === 2 && questionOpen
        ? "Állj meg a jó ketrecben!"
        : null;
  /* Kombó-szorzó jelvény (csak ha él; változáskor „pop”) — a vezérlősávban / a súgó mellett, nem a ketrecek fölött. */
  const comboBadge =
    hud.multiplier > 1 ? (
      <span
        key={hud.multiplier}
        data-testid="br-combo"
        className={`brainrot-combo ${reducedMotion ? "" : "brainrot-pop"}`}
        aria-label={`Kombó szorzó ×${hud.multiplier}`}
      >
        <Zap className="h-4 w-4" aria-hidden="true" />×{hud.multiplier}
      </span>
    ) : null;
  const hintEl = hintText ? (
    <p className="br-hint" data-testid="br-hint" role="status">
      {hintText}
    </p>
  ) : null;
  const statusPill =
    questionOpen && carriedKind ? (
      <p className="br-status" data-testid="br-status">
        <span aria-hidden="true">{CATEGORY_LABELS[presCategory].icon}</span>{" "}
        {quizTopicLabelHu(pres?.question.subject, CATEGORY_LABELS[presCategory].label)} · {carriedKind.name}{" "}
        <span className="text-amber-300 font-black">{carriedKind.xp * Math.max(1, hud.multiplier)} XP</span>
      </p>
    ) : null;

  return (
    <GameShell
      gameId="BrainRotSteal"
      state={screenState}
      onAutoPause={pause}
      style={{
        background:
          "radial-gradient(circle at 20% 20%, rgba(147, 51, 234, 0.25), transparent 45%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.2), transparent 40%), radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.12), transparent 50%), linear-gradient(180deg, #0c0118 0%, #1a0a2e 50%, #0f172a 100%)",
      }}
    >
      <ClassroomGateModal accent="fuchsia" />
      <AchievementToast achievements={newlyUnlocked} />

      {/* LS-3b: earned play time. Renders nothing when the child has no coupon. */}
      <CouponHud session={coupon} />
      <CouponExpiredOverlay session={coupon} />

      {/* Képernyő-felvillanás nagy kombónál (csökkentett mozgásnál nincs) */}
      <AnimatePresence>
        {screenFlash && (
          <motion.div
            className="fixed inset-0 z-50 pointer-events-none"
            style={{ backgroundColor: screenFlash }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </AnimatePresence>

      {/* --- KEZDŐKÉPERNYŐ --- */}
      {phase === "menu" && (
        <main className="relative z-10 w-full">
          <StartScreen
            title="Brain Rot Lopás"
            subtitle="Üldözd a menekülő lényeket, kapd el őket, és vidd mindet a jó válasz ketrecébe!"
            icon={<span className="brainrot-start-icon">{"\u{1F9E0}"}</span>}
            startLabel="Vadászat indítása!"
            onStart={startGame}
            best={best.best}
            menuKey="brain"
            secondary={
              <Link href="/games" className="game-btn game-btn-secondary" data-testid="br-back">
                <ArrowLeft className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
                Játékok
              </Link>
            }
            settings={
              <div className="flex flex-col gap-3">
                {levels.active && levels.level != null ? (
                  <GradeLevelPicker
                    value={levels.level}
                    unlocked={levels.unlocked}
                    onChange={levels.select}
                    label={`Pálya — ${userGrade}. osztály`}
                  />
                ) : null}
                <div>
                  <p className="mb-2 text-sm font-bold uppercase tracking-wide text-fuchsia-100/85">Joystick</p>
                  <div className="grid grid-cols-2 gap-2" role="group" aria-label="Melyik kézzel irányítasz?">
                    <button type="button" className="br-hand-btn" aria-pressed={!leftHanded} data-testid="br-hand-right" onClick={() => chooseHand(false)}>
                      Jobbkezes (bal oldalt)
                    </button>
                    <button type="button" className="br-hand-btn" aria-pressed={leftHanded} data-testid="br-hand-left" onClick={() => chooseHand(true)}>
                      Balkezes (jobb oldalt)
                    </button>
                  </div>
                </div>
                <GamePedagogyPanel
                  accent="fuchsia"
                  kidMission="Fuss a joystickkal, és kapd el a menekülő lényeket! Elkapáskor négy ketrec nyílik a válaszokkal: vidd a lényt a jó ketrecbe. Jó válasz = a lény a tiéd + kombó! A 90 másodperc közben is megy."
                  parentBody={
                    <>
                      <strong className="text-fuchsia-100/90">Tananyag:</strong> angol szókincs (a központi szóbankból,
                      az évfolyamhoz illő szinten), alap matematika (műveletek, mértékegységek, geometria), magyar
                      nyelvtan (szófajok, ragozás, helyesírás).
                      <br />
                      <strong className="text-fuchsia-100/90">Fejleszt:</strong> gyors döntéshozatal, olvasásértés, térbeli
                      tájékozódás és mozgáskoordináció, matematikai készségek, magyar nyelvtan.
                      <br />
                      <span className="text-white/70">
                        A kérdés alatt a játék lelassul, de nem áll meg; a rossz válasz után a helyes ketrec kivilágít, és a
                        tétel később visszatér. A kisebbeknek nagyobb, lassabb lények jönnek, amelyek tovább maradnak.
                      </span>
                    </>
                  }
                />
                <p data-game-sync className="text-sm text-purple-100/90 rounded-lg border border-purple-700/45 px-3 py-2 bg-slate-900/80">
                  {syncBanner}
                </p>
              </div>
            }
          >
            {levels.level != null && (
              <p className="flex justify-center mb-2">
                <span className="brainrot-level" data-testid="br-level">
                  {"\u{1F3AF}"} {levels.level}. pálya{userGrade != null ? ` · ${userGrade}. osztály` : ""}
                </span>
              </p>
            )}
            <ul className="brainrot-topics" aria-label="Kvíztémák">
              <li><span aria-hidden="true">{"\u{1F1EC}\u{1F1E7}"}</span> Angol</li>
              <li><span aria-hidden="true">{"\u{1F522}"}</span> Matek</li>
              <li><span aria-hidden="true">{"\u{1F4DD}"}</span> Magyar</li>
            </ul>
          </StartScreen>
        </main>
      )}

      {/* --- JÁTÉK --- */}
      {inRun && (
        <>
          <GameHud
            onPause={pause}
            stats={[
              { id: "xp", label: "Pont", value: hud.score },
              {
                id: "streak",
                label: "Sorozat",
                value: hud.combo >= STREAK_GOAL ? `${hud.combo} \u{1F525}` : `${hud.combo}/${STREAK_GOAL}`,
                tone: hud.combo >= STREAK_GOAL ? "good" : "default",
              },
              { id: "caught", label: "Elkapva", value: hud.caught },
            ]}
            progress={{ value: hud.timeLeft, max: ROUND_LIMIT, label: `${hud.timeLeft} mp`, tone: timeTone }}
          />
          <main className="br-main relative z-10 w-full mx-auto" data-touch-controls={touchCapable ? "true" : "false"} data-hand={leftHanded ? "left" : "right"}>
            <div
              ref={boardRef}
              data-collectible-world
              data-testid="br-board"
              className="br-board relative rounded-2xl overflow-hidden border-2 border-purple-500/40 shadow-[0_0_40px_rgba(147,51,234,0.25)]"
              style={{ touchAction: "none" }}
              onPointerDown={onBoardPointerDown}
              onPointerMove={onBoardPointerMove}
              onPointerUp={releaseBoardPointer}
              onPointerCancel={releaseBoardPointer}
              onLostPointerCapture={releaseBoardPointer}
            >
              {/* 3D aréna-háttér (dekoráció; a lények, a vadász és a ketrecek DOM-elemek fölötte) */}
              <BrainRotArena3D rots={hud.arena} bursts={arenaBursts} />

              {/* Q1 Ketrec-zár: a 4 válasz 4 ketrec — a vadász befut és megáll benne (a ketrecre bökve is oda fut). */}
              {showCages && pres && (
                <CageLayer
                  presentation={pres}
                  reveal={view.reveal}
                  cages={coreState.cages}
                  unitPx={unitPx}
                  layoutKey={`${board.w}x${board.h}:${cageZoneVersion}`}
                  compact={cageCompact}
                  disabled={paused}
                  onCage={goToCage}
                  ringRef={setCageRing}
                />
              )}

              {/* Lények (DOM; a helyüket a rAF írja ref-en át — a React csak a listát kezeli, 10 Hz) */}
              <CreatureLayer creatures={hud.creatures} reducedMotion={reducedMotion} register={registerCreature} />

              {/* A vadász (a helyét a rAF írja) */}
              <div
                ref={playerElRef}
                className="br-player"
                data-testid="br-player"
                data-carrying={hud.carrying ? "true" : "false"}
                style={{ width: playerSize, height: playerSize, marginLeft: -playerSize / 2, marginTop: -playerSize / 2 }}
                aria-hidden="true"
              >
                <span className="br-player-ring" />
                <span className="br-player-net">{"\u{1F945}"}</span>
              </div>

              {/* Lebegő feliratok (+XP, Elszökött!) — sávokra osztva, a tábla szélén belül (kanban #64) */}
              {floats.map((ft) => (
                <div
                  key={ft.id}
                  className={`br-float ${reducedMotion ? "br-float-still" : ""}`}
                  data-kind={ft.kind}
                  style={{ left: ft.x, top: ft.y, color: ft.color }}
                >
                  {ft.text}
                </div>
              ))}

              {/* Egeres / billentyűs módban a súgó és a kérdés tárgya a tábla bal felső sarkában (érintősön a vezérlősávban) —
                  így nem takar ketrecet. A tanító súgó (első 30 mp) elsőbbséget kap. */}
              {!touchCapable && (hintEl ?? statusPill ?? comboBadge) && (
                <div className="br-notes">
                  {hintEl ?? statusPill}
                  {comboBadge}
                </div>
              )}
            </div>

            {/* Érintővezérlő CSAK érintős eszközön (M5): joystick bal hüvelykujjra; kérdés alatt saját szünetgomb. */}
            {touchCapable && (
              <div className="br-controls" data-testid="br-touch-controls" data-game-controls data-hand={leftHanded ? "left" : "right"}>
                <VirtualJoystick
                  label="Vadász irányítása"
                  radius="auto"
                  resetSignal={joyReset}
                  onChange={(v) => {
                    // Joystick-reakció (#49): analóg, folytonos görbe; a tárcsa „előre” iránya fölfelé — a táblán y lefelé nő.
                    const s = shapeJoystick(v);
                    driverRef.current?.core.setInput(s.x, -s.y);
                  }}
                />
                <div className="br-controls-side">
                  {hintEl ?? statusPill}
                  <div className="br-controls-row">
                    {comboBadge}
                    {questionOpen && (
                      <button type="button" data-testid="br-quiz-pause" aria-label="Szünet" onClick={pause} className="br-quiz-pause">
                        <Pause className="h-5 w-5" fill="currentColor" strokeWidth={0} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </main>
        </>
      )}

      {inRun && (
        <InlineQuestion
          {...q.bind}
          onPick={onAnswer}
          mode="bar"
          skin="arena"
          disabled={paused}
          onWhy={openWhy}
          testId="br-quiz"
          promptTestId="br-prompt"
          optionTestId={(i) => `br-option-${i}`}
          onExpand={() => setExpanded(true)}
          onCollapse={() => setExpanded(false)}
        />
      )}

      {/* B2: jelölt módban a kérdés-kártya alatt a teljes válaszok, a ketrecekkel azonos jellel (szám + szín). */}
      {inRun && cageCompact && pres && showCages && legendTop && (
        <div
          ref={legendRef}
          className="br-legend"
          data-testid="br-legend"
          style={{ top: legendTop.top, left: legendTop.left, width: legendTop.width }}
          aria-hidden="true"
        >
          {pres.options.map((opt, i) => {
            const st = view.reveal ? (i === view.reveal.correctOptionIndex ? "correct" : i === view.reveal.pickedOptionIndex ? "wrong" : "dim") : "idle";
            return (
              <p key={`${pres.id}-${i}`} className="br-legend-row" data-mark={i} data-state={st}>
                <span className="br-legend-key">{i + 1}</span>
                <span className="br-legend-label">{opt.label}</span>
              </p>
            );
          })}
        </div>
      )}

      {feedback && <QuizFeedbackCard card={feedback} onDismiss={closeWhy} />}

      <PauseMenu
        open={paused && inRun}
        onResume={resume}
        onRestart={startGame}
        onExit={exitToGames}
        exitLabel="Vissza a játékokhoz"
      />

      <ResultScreen
        badges={newlyUnlocked}
        open={phase === "over"}
        testId="br-over"
        title={won ? "Szuper vadászat!" : "Vadászat vége!"}
        won={won}
        score={result?.score ?? 0}
        best={best.best}
        isNewBest={isNewBest}
        correct={result?.correct ?? 0}
        total={result?.total ?? 0}
        // „Újra!” = új menet (nem a magyarázókártya tiltott újrapróbája).
        onRetry={startGame}
        retryLabel="Újra!"
        onBack={() => navigate("/games")}
        extra={
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/5 border border-white/10 px-1 py-1.5">
                <p className="text-xl font-black text-orange-300 leading-tight">{totalCaught}</p>
                <p className="text-sm text-white/70">elkapva</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 px-1 py-1.5">
                <p className="text-xl font-black text-rose-300 leading-tight">{(result?.missed ?? 0) + (result?.lost ?? 0)}</p>
                <p className="text-sm text-white/70">elszökött</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 px-1 py-1.5">
                <p className="text-xl font-black text-pink-300 leading-tight">{result?.bestStreak ?? 0}</p>
                <p className="text-sm text-white/70">sorozat</p>
              </div>
            </div>
            <p className="px-1 text-sm font-bold text-amber-100" data-testid="br-next-goal">
              {won
                ? `Következő cél: tarts meg ${totalCaught + 2} lényt egy vadászat alatt!`
                : `${BRAIN_ROT_CLEAR_CATCHES} megtartott lény nyitja a következő pályát — még ${Math.max(0, BRAIN_ROT_CLEAR_CATCHES - totalCaught)}!`}
            </p>
            <ResultReview items={q.director?.wrongList() ?? []} />
            <p className="text-sm text-white/70">{syncEligibility?.eligible ? "Eredmény elküldve!" : syncBanner}</p>
          </div>
        }
      />

      <style>{BRAIN_ROT_CSS}</style>
    </GameShell>
  );
}

/**
 * A ketrecek rétege (memo: a kérdés-sáv ~10 Hz-es időcsík-frissítése nem rajzolja újra — csak új kérdés, kimenet, szünet
 * vagy átméretezés). A ketrec helye a mag állapotából (a nyíláskor rögzül).
 */
const CageLayer = memo(function CageLayer({
  presentation,
  reveal,
  cages,
  unitPx,
  compact,
  disabled,
  onCage,
  ringRef,
}: {
  presentation: QuestionPresentation;
  reveal: { correctOptionIndex: number; pickedOptionIndex: number | null } | null;
  cages: readonly Cage[];
  unitPx: number;
  /**
   * A tábla mérete: a ketrecek helyét a mag átméretezéskor HELYBEN írja (ugyanaz a tömb), és csak a hosszabbik oldal is
   * változhat (az `unitPx` marad) — ez a kulcs rajzoltatja újra a memo-s réteget (review #485).
   */
  layoutKey: string;
  /** Jelölt mód: a ketrecben csak a jel (a teljes válasz a jelmagyarázatban). */
  compact: boolean;
  disabled: boolean;
  onCage: (i: number) => void;
  ringRef: (i: number, el: HTMLSpanElement | null) => void;
}) {
  return (
    <div className="br-cages" data-testid="br-cages" role="group" aria-label="Ketrecek: vidd a lényt a jó válasz ketrecébe">
      {presentation.options.map((opt, i) => {
        const cage = cages[i];
        if (!cage) return null;
        const st = reveal ? (i === reveal.correctOptionIndex ? "correct" : i === reveal.pickedOptionIndex ? "wrong" : "dim") : "idle";
        return (
          <button
            key={`${presentation.id}-${i}`}
            type="button"
            data-testid={`br-cage-${i}`}
            data-state={st}
            className="br-cage"
            data-mark={i}
            data-compact={compact ? "true" : "false"}
            data-armed="false"
            style={{ left: (cage.x - cage.w / 2) * unitPx, top: (cage.y - cage.h / 2) * unitPx, width: cage.w * unitPx, height: cage.h * unitPx }}
            aria-label={`${i + 1}. ketrec: ${opt.label}`}
            aria-disabled={reveal || disabled ? "true" : undefined}
            onClick={() => onCage(i)}
            {...correctDataAttrs(opt.correct)}
          >
            <span ref={(el) => ringRef(i, el)} className="br-cage-dwell" aria-hidden="true" />
            <span className="br-cage-key" aria-hidden="true">
              {st === "correct" ? "✓" : st === "wrong" ? "✗" : i + 1}
            </span>
            {!compact && (
              <span className="br-cage-label" data-long={cageLabelFont(opt.label) === CAGE_LABEL_FONT_LONG ? "true" : "false"}>
                {opt.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});

/** A lények rétege (memo: csak a 10 Hz-es lista változására rajzol; a helyüket a rAF írja ref-en át). */
const CreatureLayer = memo(function CreatureLayer({
  creatures,
  reducedMotion,
  register,
}: {
  creatures: HudSnap["creatures"];
  reducedMotion: boolean;
  register: (id: number, el: HTMLDivElement | null) => void;
}) {
  return (
    <>
      {creatures.map((c) => {
        const kind = BRAIN_ROT_KINDS[c.kind]!;
        return (
          <div
            key={c.id}
            ref={(el) => register(c.id, el)}
            data-brainrot={c.id}
            data-warning={c.warning ? "true" : "false"}
            data-carried={c.carried ? "true" : "false"}
            className={`brainrot-creature ${c.carried ? "br-carried" : ""} ${c.dazed ? "br-dazed" : ""}`}
            style={{ width: c.size, height: c.size, marginLeft: -c.size / 2, marginTop: -c.size / 2, opacity: c.opacity }}
            aria-hidden="true"
          >
            <span className={`brainrot-body ${reducedMotion ? "" : "brainrot-pop"}`} style={{ width: c.size, height: c.size }}>
              <span
                className={`brainrot-aura ${reducedMotion ? "" : c.warning ? "brainrot-aura-warn" : "brainrot-aura-idle"}`}
                data-warning={c.warning ? "true" : "false"}
              />
              <span className={`brainrot-sprite ${reducedMotion ? "" : c.carried ? "br-struggle" : ""}`}>
                <CollectibleAvatar name={kind.name} value={kind.xp} />
              </span>
            </span>
            {!c.carried && <span className="brainrot-xp">{kind.xp} XP</span>}
            {c.dazed && <span className="br-dazed-mark">💫</span>}
          </div>
        );
      })}
    </>
  );
});

/**
 * A lap stílusa (a közös `index.css` a J0c / J8 szeleté). A ketrec ≥ 48 px, a visszajelzés szín + jel + szöveg (nem csak
 * szín); a hiba narancs, nem telített piros (K.4/20); csökkentett mozgásnál nincs pattanás, küszködés, emelkedő felirat.
 */
const BRAIN_ROT_CSS = `
  .brainrot-start-icon { display: inline-block; filter: drop-shadow(0 4px 10px #0008); }
  [data-game="BrainRotSteal"] .game-start-icon { background: radial-gradient(circle at 30% 25%, #ffffff40, transparent 55%), linear-gradient(160deg, #c026d3, #7c3aed 55%, #f59e0b); box-shadow: 0 14px 34px #c026d34d, inset 0 1px 0 #ffffff66; }
  /* A jelvény-értesítő az eredménykártya FÖLÖTT jelenjen meg (a betűméretet a közös komponens adja, #429). */
  [data-game="BrainRotSteal"] [data-testid^="achievement-toast-"] { z-index: 85; top: max(8px, var(--game-safe-top)); }
  .brainrot-topics { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
  .brainrot-topics li { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 9999px; font-size: 14px; font-weight: 800; color: #f5d0fe; background: #a21caf26; border: 1px solid #e879f940; }
  .brainrot-level { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 9999px; font-size: 14px; font-weight: 800; color: #fde68a; background: #f59e0b1f; border: 1px solid #f59e0b40; }

  .br-main { display: flex; flex-direction: column; gap: 6px; padding-top: 6px; }
  .br-board { flex: 1 1 auto; min-height: 0; width: 100%; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
  [data-collectible-world][data-testid="br-board"] { background: radial-gradient(ellipse at 50% 15%, #8d60cc55, transparent 65%), linear-gradient(160deg, #191944, #241046) !important; }
  .br-controls { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 4px; }
  .br-controls-side { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; min-width: 0; flex: 1 1 auto; }
  .br-controls[data-hand="left"] { flex-direction: row-reverse; }
  .br-controls[data-hand="left"] .br-controls-side { align-items: flex-start; }
  .br-hand-btn { min-height: 52px; padding: 6px 10px; border-radius: 12px; font-size: 15px; font-weight: 800; line-height: 1.2; color: #fff; background: #0f172acc; border: 1px solid #ffffff33; }
  .br-hand-btn[aria-pressed="true"] { background: linear-gradient(180deg, #c026d3, #7c3aed); border-color: #f5d0fe99; }
  @media (orientation: landscape) and (max-height: 520px) {
    /* A közös .game-shell-fixed[data-playing] > main (0,2,1) oszlopot ad — a játék gyökerével erősebb (C-53). */
    [data-game="BrainRotSteal"] .br-main[data-touch-controls="true"] { flex-direction: row-reverse; }
    [data-game="BrainRotSteal"] .br-main[data-touch-controls="true"][data-hand="left"] { flex-direction: row; }
    [data-game="BrainRotSteal"] .br-controls[data-hand="left"] { flex-direction: column-reverse; }
    [data-game="BrainRotSteal"] .br-main[data-touch-controls="true"] .br-board { width: auto; flex: 1 1 auto; }
    .br-controls { flex-direction: column-reverse; justify-content: space-between; padding: 4px 0; width: auto; max-width: 30vw; }
    .br-controls-side { align-items: center; flex: 0 1 auto; }
  }

  .brainrot-creature { position: absolute; left: 0; top: 0; z-index: 2; pointer-events: none; will-change: transform; display: flex; align-items: center; justify-content: center; }
  .brainrot-body { position: relative; display: block; }
  .brainrot-pop { animation: brpop 240ms cubic-bezier(.2,.9,.3,1.3) both; }
  @keyframes brpop { 0% { transform: scale(0); } 70% { transform: scale(1.15); } 100% { transform: scale(1); } }
  .brainrot-aura { position: absolute; inset: -14%; border-radius: 9999px; background: radial-gradient(circle, rgba(168,85,247,.55) 0%, rgba(236,72,153,.18) 45%, transparent 70%); }
  .brainrot-aura[data-warning="true"] { background: radial-gradient(circle, rgba(251,146,60,.75) 0%, rgba(251,146,60,.25) 45%, transparent 72%); }
  .brainrot-aura-idle { animation: brglow 2.2s ease-in-out infinite; }
  .brainrot-aura-warn { animation: brwarn .42s ease-in-out infinite; }
  @keyframes brglow { 0%, 100% { transform: scale(1); opacity: .85; } 50% { transform: scale(1.1); opacity: 1; } }
  @keyframes brwarn { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.32); opacity: .45; } }
  .brainrot-sprite { position: absolute; inset: 0; display: block; filter: drop-shadow(0 6px 10px #0009); }
  .brainrot-xp { position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%); padding: 0 6px; border-radius: 6px; font-size: 12px; line-height: 16px; font-weight: 900; white-space: nowrap; color: #fcd34d; background: #000000b3; }
  .br-carried { z-index: 5; }
  .br-carried .brainrot-body { transform: scale(.78); }
  .br-struggle { animation: brstruggle .32s ease-in-out infinite; }
  @keyframes brstruggle { 0%, 100% { transform: rotate(-12deg); } 50% { transform: rotate(12deg) translateY(-3px); } }
  .br-dazed-mark { position: absolute; top: -10px; right: -6px; font-size: 22px; filter: drop-shadow(0 0 6px #67e8f9); }
  .br-dazed .brainrot-aura { background: radial-gradient(circle, rgba(103,232,249,.6) 0%, rgba(103,232,249,.18) 45%, transparent 70%); }

  .br-player { position: absolute; left: 0; top: 0; z-index: 4; pointer-events: none; will-change: transform; display: flex; align-items: center; justify-content: center; border-radius: 9999px; background: radial-gradient(circle at 35% 30%, #a5f3fc, #0891b2 60%, #164e63); box-shadow: 0 0 0 3px #ecfeff, 0 0 18px #22d3eecc, 0 6px 12px #0009; }
  .br-player-ring { position: absolute; inset: -9px; border-radius: 9999px; border: 2px dashed #a5f3fc99; }
  .br-player[data-carrying="true"] .br-player-ring { border-color: #fde047; border-style: solid; }
  .br-player-net { font-size: 22px; line-height: 1; filter: drop-shadow(0 1px 2px #0009); }

  /* A ketrec-felirat olvasható marad: a ketrecek a lények FÖLÖTT, a vadász alatt. */
  .br-cages { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
  .br-cage { position: absolute; pointer-events: auto; display: flex; align-items: center; gap: 6px; min-width: 48px; min-height: 48px; padding: 6px 8px; border-radius: 16px; color: #fff; text-align: left; cursor: pointer; overflow: hidden;
    background: repeating-linear-gradient(90deg, #ffffff1f 0 3px, transparent 3px 16px), linear-gradient(180deg, #4c1d95e6, #2e1065e6);
    border: 2.5px solid #c4b5fd; box-shadow: 0 0 0 2px #0b0720, 0 0 18px #a78bfa66, inset 0 -4px 0 #00000059; -webkit-tap-highlight-color: transparent; touch-action: none; }
  .br-cage:focus-visible { outline: 3px solid #fef08a; outline-offset: 2px; }
  .br-cage-dwell { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: linear-gradient(90deg, #fde04759 calc(var(--dwell, 0) * 100%), transparent calc(var(--dwell, 0) * 100%)); }
  .br-cage-key { position: relative; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 9999px; font-size: 15px; font-weight: 900; color: #1e1b4b; background: #e9d5ff; }
  .br-cage-label { position: relative; min-width: 0; flex: 1 1 auto; font-size: 15px; font-weight: 800; line-height: 1.18; overflow-wrap: break-word; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; text-shadow: 0 1px 2px #0009; }
  .br-cage-label[data-long="true"] { font-size: 14px; }
  .br-cage[data-state="correct"] { background: linear-gradient(180deg, #15803d, #166534); border-color: #86efac; box-shadow: 0 0 0 2px #0b0720, 0 0 26px #22c55ecc; animation: brcage 0.9s ease-in-out infinite; }
  .br-cage[data-state="correct"] .br-cage-key { background: #22c55e !important; color: #fff; }
  .br-cage[data-state="wrong"] { background: linear-gradient(180deg, #9a3412, #7c2d12); border-color: #fdba74; }
  .br-cage[data-state="wrong"] .br-cage-key { background: #f97316 !important; color: #fff; }
  .br-cage[data-state="dim"] { opacity: .45; }
  /* KSZ-11: előjelzés — a ketrec nyílik (szaggatott keret, halványabb), 600 ms után éles. */
  .br-cage[data-armed="false"][data-state="idle"] { border-style: dashed; opacity: .72; }
  .br-cage[data-compact="true"] { justify-content: center; }
  .br-cage[data-compact="true"] .br-cage-key { width: 44px; height: 44px; font-size: 24px; }
  .br-cage[data-mark="0"] .br-cage-key, .br-legend-row[data-mark="0"] .br-legend-key { background: #fde68a; }
  .br-cage[data-mark="1"] .br-cage-key, .br-legend-row[data-mark="1"] .br-legend-key { background: #a5f3fc; }
  .br-cage[data-mark="2"] .br-cage-key, .br-legend-row[data-mark="2"] .br-legend-key { background: #fbcfe8; }
  .br-cage[data-mark="3"] .br-cage-key, .br-legend-row[data-mark="3"] .br-legend-key { background: #d9f99d; }
  .br-legend { position: fixed; z-index: 60; display: grid; gap: 4px; padding: 6px 8px; border-radius: 14px; background: #1e1038eb; border: 1.5px solid #a3e635a6; box-shadow: 0 8px 22px #00000066; pointer-events: none; }
  .br-legend-row { display: flex; align-items: flex-start; gap: 8px; margin: 0; font-size: 14px; font-weight: 800; line-height: 1.25; color: #fff; overflow-wrap: break-word; }
  .br-legend-key { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 9999px; font-size: 14px; font-weight: 900; color: #1e1b4b; }
  .br-legend-label { min-width: 0; flex: 1 1 auto; }
  .br-legend-row[data-state="correct"] .br-legend-label { color: #86efac; }
  .br-legend-row[data-state="wrong"] .br-legend-label { color: #fdba74; text-decoration: line-through; }
  .br-legend-row[data-state="dim"] { opacity: .5; }
  @keyframes brcage { 0%, 100% { box-shadow: 0 0 0 2px #0b0720, 0 0 16px #22c55e99; } 50% { box-shadow: 0 0 0 2px #0b0720, 0 0 32px #22c55eff; } }

  .br-float { position: absolute; z-index: 5; pointer-events: none; transform: translateX(-50%); white-space: nowrap; font-size: 18px; font-weight: 900; text-shadow: 0 2px 8px #000000d9; animation: brfloat ${FLOAT_MS}ms ease-out both; }
  .br-float-still { animation: brfade ${FLOAT_MS}ms linear both; }
  @keyframes brfloat { 0% { opacity: 0; transform: translate(-50%, 8px) scale(.7); } 15% { opacity: 1; transform: translate(-50%, 0) scale(1); } 100% { opacity: 0; transform: translate(-50%, -34px) scale(1); } }
  @keyframes brfade { 0% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
  .br-controls-row { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
  .br-notes { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
  .brainrot-combo { display: inline-flex; align-items: center; gap: 2px; padding: 4px 10px; border-radius: 9999px; font-size: 16px; font-weight: 900; color: #422006; background: linear-gradient(180deg, #fde047, #f59e0b); box-shadow: 0 4px 14px #f59e0b66; pointer-events: none; }
  .br-hint { margin: 0; max-width: 100%; padding: 6px 12px; border-radius: 12px; font-size: 14px; font-weight: 800; line-height: 1.25; text-align: center; color: #f5f3ff; background: #1e1038e6; border: 1px solid #c4b5fd59; pointer-events: none; }
  .br-status { margin: 0; max-width: 100%; padding: 6px 10px; border-radius: 12px; font-size: 14px; font-weight: 800; line-height: 1.25; color: #f5f3ff; background: #1e1038e6; border: 1px solid #a3e63566; overflow-wrap: anywhere; }
  .br-notes { position: absolute; top: 8px; left: 8px; z-index: 4; max-width: min(46%, 340px); pointer-events: none; }
  .br-notes .br-hint { text-align: left; }
  .br-controls-side .br-hint, .br-controls-side .br-status { text-align: right; }
  .br-quiz-pause { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 16px; color: #fff; background: #ffffff1a; border: 1px solid #ffffff40; }
  @media (prefers-reduced-motion: reduce) {
    .br-cage[data-state="correct"] { animation: none; }
  }
`;
