import { isPlayableQuestion } from "@shared/game-quiz-contract";
import { createAdaptiveSession } from "@/game-engine/adaptiveSession";
import {
  createGradeQuizSeen,
  gradeForGame,
  isGradeQuizSeen,
  markGradeQuizSeen,
  normalizePrompt,
  pickGradeQuiz,
  pickGradeSlotWithVocab,
  pickUnseenMaterial,
  type GradeQuizSeen,
} from "@/game-engine/gradeQuiz";
import { loadClassroomGrade, saveClassroomGrade } from "@/lib/classroomStore";
import { useGradeLevel } from "@/game-engine/useGradeLevel";
import { GradeLevelPicker } from "@/game-engine/GradeLevelPicker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import * as THREE from "three";
import { ArrowLeft, ShieldAlert, Sparkles, Zap } from "lucide-react";
import { motion } from "framer-motion";
import {
  cancelGameFrame,
  GameHud,
  GameShell,
  PauseMenu,
  ResultScreen,
  StartScreen,
  requestGameFrame,
  useBestScore,
  useHaptics,
  useTouchCapable,
  type GameHudStat,
  type GameScreenState,
} from "@/game-engine/mobile";
import { useVocabQuizSource, vocabLevelForGrade } from "@/game-engine/vocab";
import { aimAssistVx } from "@/lib/spaceAsteroid/aimAssist";
import { queryClient } from "@/lib/queryClient";
import GamePedagogyPanel from "@/components/GamePedagogyPanel";
import { gameSyncBannerText, useSyncEligibilityQuery } from "@/hooks/useGameScoreSync";
import AudioToggleButton from "@/components/AudioToggleButton";
import { useCouponSession } from "@/game-engine/useCouponSession";
import { maybeClaimCouponBonus } from "@/game-engine/claimCouponBonus";
import {
  GAME_W,
  GAME_H,
  PLAYER_MAX_SPEED,
  integratePlayer,
  spawnReady,
  splitRock,
  enemyRenderSpin,
  starScrollY,
  playerXLimit,
  visibleHalfWidth,
  CAMERA_FOV_DEG,
  CAMERA_Y,
  CAMERA_Z,
  CAMERA_LOOK_Y,
  BOSS_WAVE,
  HINT_SEC,
  HIT_INVULN_SEC,
  SPAWN_Y_MAX,
  SPAWN_Y_MIN,
  TUTORIAL_SEC,
  WAVE_BANNER_SEC,
  WAVE_COUNT,
  enemyHp,
  pickEnemyKind,
  pickRockSize,
  waveBaseVy,
  waveEnemyCount,
  waveSpawnInterval,
} from "@/lib/spaceAsteroid/physics";
import {
  CRYSTAL_LABEL_MAX_CHARS,
  CRYSTAL_MIN_ZONE_HEIGHT,
  CRYSTAL_RADIUS,
  crystalAt,
  crystalBounds,
  crystalLabelsFit,
  crystalShards,
  hitCrystal,
  rezoneCrystals,
  spawnCrystals,
  stepCrystals,
  type Crystal,
} from "@/lib/spaceAsteroid/crystals";
import {
  ASTEROID_GAME_ID,
  asteroidDirectorConfig,
  createAsteroidDriver,
  questionTotals,
  type AsteroidDriver,
} from "@/lib/spaceAsteroid/sim";
import {
  InlineQuestion,
  ResultReview,
  bankPlayQuestion,
  createPointerTapTracker,
  gradePlayQuestion,
  materialPlayQuestion,
  pointerTapHandlers,
  restoreReviewQuestion,
  usePlayQuestion,
  vocabPlayQuestion,
  type PlayQuestion,
  type QuestionProvider,
  type ShakeOffset,
} from "@/game-engine/play";
import type { GradeQuizItem } from "@/data/gradeQuizBank/types";
import { loadedGradeItems } from "@/data/gradeQuizBank/loader";
import { createRng, seedFrom, type Rng } from "@shared/game-rng";
import { CouponHud, CouponExpiredOverlay } from "@/game-engine/CouponHud";
import { sfxSuccess, sfxError, sfxShoot, sfxHit, sfxExplode, sfxPickup, sfxLevelUp, sfxWarning, sfxWhoosh } from "@/lib/audioEngine";
import { recordRun, type Achievement } from "@/lib/achievements";
import { isTodaysGameAvailable, markDailyCompleted } from "@/lib/dailyChallenge";
import AchievementToast from "@/components/AchievementToast";
import QuizFeedbackCard from "@/game-engine/QuizFeedbackCard";
import { motionScale, useReducedMotion } from "@/game-engine/useReducedMotion";
import VirtualJoystick from "@/game-engine/VirtualJoystick";
import { countRender, registerInputProbe } from "@/game-engine/inputProbe";
import HoldButton from "@/game-engine/HoldButton";
import { shapeJoystick } from "@/game-engine/joystick";
import { buildFeedback, type FeedbackCard } from "@/game-engine/feedback";
import { correctDataAttrs, installGameTestApi, readGameSeed } from "@/game-engine/game-test-hooks";
import { newScoreRunId, postGameScore } from "@/lib/gameScoreRunId";
import {
  LOOK_BUDGET,
  SparkleField,
  createGameRenderer,
  createGlowSprite,
  createPostFx,
  createRoomEnvironment,
  detectLookTier,
  glowTexture,
  type PostFx,
} from "@/game-engine/three-look";
import {
  buildNebula,
  buildPlanet,
  buildStarLayer,
  shockwaveFrame,
  shockwaveTexture,
  type Nebula,
} from "@/game-engine/scenes/spaceBackdrop";

/* =====================================================================
 * Galaktikus Aszteroida Kvíz Vadász – Three.js 3D űrharc
 *
 * Játékmenet összefoglaló (J6a, 2026-11-17 — a kvíz-kapuk megszűntek):
 *  1. Indítás előtt: osztály-választó (1–12). Az osztály alapján a szerver
 *     visszaadja a játékos legutóbbi 3 tananyagához kapcsolt kvíz-tételeket
 *     (`/api/games/material-quizzes?classroom=N&limit=3`). Ha üres a halmaz,
 *     a játék statikus fallback bankra vált.
 *  2. A játék AZONNAL indul, nincs induló kvíz és nincs hullám-kapu: 8 hullám
 *     folyamatosan vált (2 mp „HULLÁM n” felirattal), a 9. hullámban a főellenfél.
 *     Nincs idő-limit: a menet az életek elfogytáig vagy a főellenfél legyőzéséig tart.
 *  3. A kérdés a játék világában érkezik: a kérdés-ütemező (`usePlayQuestion`)
 *     3–4 feliratozott KRISTÁLYT enged a felső sávba. A helyes kristály
 *     kilövése (vagy megérintése) fejlesztést ad (pajzs / hármas lövés / bomba az
 *     áramlat szerint), a rossz kristály 3 apró sziklára hasad, a helyes 1,8 mp-ig
 *     világít. A játék a kérdés alatt fut (0,7× lassítás), nincs modális réteg.
 *  4. Aszteroida-ütközés: −1 élet és 2 mp sérthetetlenség (nincs kvíz).
 *     +1 ÉLET pickup: „+1 élet!”.
 *  5. Mobil-első irányítás (touch gombok) + billentyűzet. Reszponzív.
 *
 * Three.js architektúra:
 *  - PerspectiveCamera enyhén top-down nézőpontja (mintha repülnénk át a
 *    játéktér felett). Játéktér XY síkon, kamera +Z-ből néz.
 *  - 4 ellenfél-típus: szikla-meteor, kristály-meteor, alien-csészealj,
 *    ellenséges vadászgép — mindegyik más 3D mesh-szel és viselkedéssel.
 *  - Csillagmező 3D BufferGeometry pontokkal + halvány nebula plane.
 *  - HUD, kvíz-modál, osztály-választó: React overlay (canvas felett).
 * ===================================================================== */

type EnemyKind = "rock" | "crystal" | "alien" | "fighter" | "boss";

/** Szikra-robbanás színe ellenféltípusonként (a test fő színéhez igazítva). */
const EXPLOSION_COLORS: Record<EnemyKind, string> = {
  rock: "#ffb347",
  crystal: "#6af2ff",
  alien: "#b6ff6a",
  fighter: "#ff5a4f",
  boss: "#ffe66d",
};

type Quiz = {
  id?: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  /** T-1: a MIÉRT rossz válasznál — a lecke exportjából vagy a generátorból. */
  explanation?: string | null;
  topic?: string | null;
  /** `grade`: a közös évfolyam-bankból (3–12. évfolyam, spec 2026-09-29); `vocab`: a központi szóbankból (S10, A8). */
  source?: "material" | "fallback" | "grade" | "vocab";
  /** A közös bank tételének tényleges évfolyama (kimerüléskor a szomszédos évfolyamé is lehet). */
  grade?: number;
};

type EnemyState = {
  id: number;
  kind: EnemyKind;
  size: 1 | 2 | 3; // csak rock-nál releváns: 3 nagy, 2 közepes, 1 kicsi
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  rotSpeed: number;
  hp: number;
  flash: number;
  dead: boolean;
  spawnAt: number;
  // Egyéni AI-paraméterek
  phase: number;
  fireCooldown: number;
  nextSpawnSplit?: number;
};

type BulletState = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  fromEnemy: boolean;
};

type PickupState = {
  id: number;
  kind: "life" | "power" | "shield" | "bomb";
  x: number;
  y: number;
  vy: number;
  life: number;
  rot: number;
};

/** J6a: nincs „quiz” fázis — a kérdés a `play` alatti, nem blokkoló al-állapot (kristályok a világban). */
type Phase = "grade" | "intro" | "play" | "over";

type MaterialQuizApi = {
  classroom: number;
  materials: { id: string; title: string; createdAt: string }[];
  items: {
    id?: string;
    prompt: string;
    options: string[];
    correctIndex: number;
    /** T-1: a MIÉRT rossz válasznál; régi tételeknél hiányzik. */
    explanation?: string | null;
    topic?: string | null;
  }[];
};

const GRADES: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Játéktér méretei: `physics.ts` (18×24). A játékos az alsó 40%-ban mozog. */
const PLAYER_BASE_Y = -GAME_H / 2 + 2.4;

const BULLET_SPEED = 14;
const BULLET_COOLDOWN = 0.18;
const BULLET_TRIPLE_COOLDOWN = 0.10;
const POWER_DURATION = 10; // sec
/** A jó kristály-válasz pajzsa (mp) — ugyanannyi, mint a pajzs-pickupé. */
const CRYSTAL_SHIELD_SEC = 8;
/** A kristály-gomb fél magassága (px): 48 px a legkisebb érintési cél + a lebegés ráhagyása. */
const CRYSTAL_CHIP_HALF_H = 26;
/** A kristályok kérdés-zónájának legalsó pereme a vászon magasságának ekkora hányadánál (a kártya alatti sáv alja, ha több hely van). */
const CRYSTAL_ZONE_BOTTOM = 0.52;

/** Statikus fallback kvíz-bank — ha nincs tananyaghoz kötött kérdés a DB-ben. */
const FALLBACK_QUIZZES: Quiz[] = [
  // === Angol szókincs ===
  { prompt: "Star magyarul:", options: ["bolygó", "csillag", "hold", "felhő"], correctIndex: 1, topic: "english", explanation: "A star szó jelentése csillag az égitestek között. „I can see a star.” = „Látok egy csillagot.”" },
  { prompt: "Spaceship magyarul:", options: ["repülő", "tengeralattjáró", "űrhajó", "hajó"], correctIndex: 2, topic: "english", explanation: "A spaceship magyarul űrhajó, vagyis világűrbeli utazásra való jármű. „The spaceship flies to Mars.” = „Az űrhajó a Marsra repül.”" },
  { prompt: "Asteroid magyarul:", options: ["csillagkép", "üstökös", "aszteroida", "bolygó"], correctIndex: 2, topic: "english", explanation: "Az asteroid magyarul aszteroida, kisebb, Nap körül keringő égitest. „An asteroid moves through space.” = „Egy aszteroida halad az űrben.”" },
  { prompt: "Galaxy magyarul:", options: ["galaxis", "naprendszer", "csillagrendszer", "fekete lyuk"], correctIndex: 0, topic: "english", explanation: "A galaxy magyarul galaxis, sok csillagot, gázt és port tartalmazó rendszer. „The Milky Way is a galaxy.” = „A Tejútrendszer egy galaxis.”" },
  { prompt: "Moon magyarul:", options: ["nap", "hold", "csillag", "föld"], correctIndex: 1, topic: "english", explanation: "A moon magyarul hold, vagyis egy bolygó körül keringő égitest. „The Moon shines at night.” = „A Hold éjjel világít.”" },
  { prompt: "Sun magyarul:", options: ["hold", "csillag", "Nap", "ég"], correctIndex: 2, topic: "english", explanation: "A Sun magyarul Nap, a Naprendszer központi csillaga. „The Sun is very bright.” = „A Nap nagyon fényes.”" },
  { prompt: "Planet magyarul:", options: ["üstökös", "bolygó", "csillag", "üveg"], correctIndex: 1, topic: "english", explanation: "A planet magyarul bolygó: csillag körül keringő, saját fénnyel nem rendelkező égitest. „Earth is a planet.” = „A Föld bolygó.”" },
  { prompt: "Rocket magyarul:", options: ["rakéta", "vonat", "biciklik", "űrlény"], correctIndex: 0, topic: "english", explanation: "A rocket magyarul rakéta, amely hajtóművével nagy sebességre gyorsulhat. „The rocket goes into space.” = „A rakéta az űrbe megy.”" },
  { prompt: "Alien magyarul:", options: ["barát", "űrlény", "ember", "robot"], correctIndex: 1, topic: "english", explanation: "Az alien jelentése űrlény, vagyis feltételezett földön kívüli élőlény. „The alien is friendly.” = „Az űrlény barátságos.”" },
  { prompt: "Earth magyarul:", options: ["hold", "Föld", "ég", "tűz"], correctIndex: 1, topic: "english", explanation: "Az Earth bolygónk neve, magyarul Föld. „Earth goes around the Sun.” = „A Föld a Nap körül kering.”" },
  { prompt: "Light (főnév) magyarul:", options: ["sötét", "fény", "árnyék", "súly"], correctIndex: 1, topic: "english", explanation: "A light főnévként fény, amely lehetővé teszi a látást. „Turn on the light.” = „Kapcsold fel a fényt.”" },
  { prompt: "Speed magyarul:", options: ["sebesség", "súly", "magasság", "idő"], correctIndex: 0, topic: "english", explanation: "A speed sebességet jelent. Az átlagsebesség a megtett út és az eltelt idő hányadosa: 60 km 2 óra alatt átlagosan 30 km/h." },
  { prompt: "Danger magyarul:", options: ["bátorság", "veszély", "biztonság", "pihenés"], correctIndex: 1, topic: "english", explanation: "A danger magyarul veszély, vagyis sérülés vagy kár lehetősége. „Fire is dangerous.” = „A tűz veszélyes.”" },
  { prompt: "Shield magyarul:", options: ["pajzs", "kard", "kalap", "csésze"], correctIndex: 0, topic: "english", explanation: "A shield magyarul pajzs, amely védelmet nyújt támadás ellen. „The knight has a shield.” = „A lovagnak van egy pajzsa.”" },
  { prompt: "Power (erő értelemben) magyarul:", options: ["lassú", "puha", "erő", "kicsi"], correctIndex: 2, topic: "english", explanation: "A power ebben az értelemben erő vagy hatóerő. „The hero has great power.” = „A hősnek nagy ereje van.”" },
  // === Matematika ===
  { prompt: "Mennyi 7 × 8?", options: ["49", "54", "56", "64"], correctIndex: 2, topic: "math", explanation: "7 × 8 = 56: hét darab nyolcas összege 8 + 8 + 8 + 8 + 8 + 8 + 8 = 56." },
  { prompt: "Mennyi 12 + 19?", options: ["29", "30", "31", "32"], correctIndex: 2, topic: "math", explanation: "12 + 19 = 31: előbb 12 + 20 = 32, majd egyet levonva 31-et kapunk." },
  { prompt: "Mennyi 100 - 47?", options: ["43", "53", "57", "63"], correctIndex: 1, topic: "math", explanation: "100 − 47 = 53, mert 100 − 40 = 60, és 60 − 7 = 53." },
  { prompt: "Mennyi 144 ÷ 12?", options: ["10", "11", "12", "13"], correctIndex: 2, topic: "math", explanation: "144 ÷ 12 = 12, mert 12 × 12 = 144. Az osztás a szorzás fordított művelete." },
  { prompt: "Mennyi 9 × 9?", options: ["72", "81", "89", "99"], correctIndex: 1, topic: "math", explanation: "9 × 9 = 81, mert kilencszer kilenc: 9 × 10 − 9 = 90 − 9 = 81." },
  { prompt: "Mennyi a 100 fele?", options: ["25", "40", "50", "75"], correctIndex: 2, topic: "math", explanation: "100 fele 50, mert a felezés ugyanaz, mint a kettővel való osztás: 100 ÷ 2 = 50." },
  { prompt: "Mennyi 25 × 4?", options: ["80", "90", "100", "125"], correctIndex: 2, topic: "math", explanation: "25 × 4 = 100, mert 25 + 25 + 25 + 25 = 100." },
  { prompt: "Hány perc 2 óra?", options: ["60", "90", "120", "180"], correctIndex: 2, topic: "math", explanation: "2 óra = 120 perc, mert 1 óra 60 perc, tehát 2 × 60 = 120." },
  { prompt: "Hány másodperc 3 perc?", options: ["120", "150", "180", "240"], correctIndex: 2, topic: "math", explanation: "3 perc = 180 másodperc, mert 1 perc 60 másodperc, tehát 3 × 60 = 180." },
  { prompt: "Mennyi 56 ÷ 7?", options: ["6", "7", "8", "9"], correctIndex: 2, topic: "math", explanation: "56 ÷ 7 = 8, mert 7 × 8 = 56. A hányados megmutatja, hányszor fér meg a 7 az 56-ban." },
  // === Természet / Űr ===
  { prompt: "Melyik a Naprendszer legnagyobb bolygója?", options: ["Föld", "Mars", "Jupiter", "Szaturnusz"], correctIndex: 2, topic: "nature", explanation: "A Jupiter a Naprendszer legnagyobb bolygója; átmérője jóval nagyobb a Földénél." },
  { prompt: "Hány bolygó van a Naprendszerben?", options: ["6", "7", "8", "9"], correctIndex: 2, topic: "nature", explanation: "A Naprendszerben 8 bolygó van: a Merkúrtól a Neptunuszig. A Plútó törpebolygó, ezért nem számít közéjük." },
  { prompt: "Melyik a hozzánk legközelebbi csillag?", options: ["Sirius", "Polaris", "Nap", "Vega"], correctIndex: 2, topic: "nature", explanation: "A Nap a Földhöz legközelebbi csillag. A többi csillag, például a Sirius, sok fényévnyi távolságra van." },
  { prompt: "Mi a Hold a Föld számára?", options: ["bolygó", "csillag", "kísérő", "üstökös"], correctIndex: 2, topic: "nature", explanation: "A Hold a Föld természetes kísérője, mert gravitációs vonzás hatására a Föld körül kering. Nem bocsát ki saját fényt." },
  { prompt: "Hol található a fő aszteroidaöv?", options: ["a Mars és Jupiter között", "a Föld körül", "a Nap belsejében", "a Hold mögött"], correctIndex: 0, topic: "nature", explanation: "Az aszteroidaöv a Mars és a Jupiter pályája között található sok apró kőzetes égitest területe. Ezek a Nap körül keringenek." },
  { prompt: "Melyik bolygó a Vörös Bolygó?", options: ["Vénusz", "Mars", "Jupiter", "Szaturnusz"], correctIndex: 1, topic: "nature", explanation: "A Marsot vörös bolygónak nevezik, mert felszínén sok vas-oxid, vagyis rozsda található. Ez vöröses színt ad neki." },
  { prompt: "Hány hold kering a Föld körül?", options: ["1", "2", "3", "4"], correctIndex: 0, topic: "nature", explanation: "A Föld körül egy természetes hold, a Hold kering. Más bolygóknak lehet több holdjuk is, például a Jupiternek sok van." },
  { prompt: "Mit termel a növény napfénnyel?", options: ["szén-dioxidot", "oxigént", "vizet", "hidrogént"], correctIndex: 1, topic: "nature", explanation: "A növény fotoszintézis során napfény, víz és szén-dioxid felhasználásával oxigént termel. Közben cukrot is előállít a növekedéshez." },
  // === Magyar nyelvtan ===
  { prompt: "Melyik betű magánhangzó?", options: ["b", "k", "á", "p"], correctIndex: 2, topic: "hungarian", explanation: "Az á magánhangzó, mert kiejtésekor a levegő akadálytalanul áramlik ki. A b, k és p mássalhangzók." },
  { prompt: "Hány szótagból áll a madár szó?", options: ["1", "2", "3", "4"], correctIndex: 1, topic: "hungarian", explanation: "A madár szó két szótagú: ma-dár. A szótagokat általában a bennük lévő magánhangzók száma alapján számoljuk." },
  { prompt: "Melyik a múlt idejű ige?", options: ["fut", "futott", "futni fog", "futna"], correctIndex: 1, topic: "hungarian", explanation: "A futott múlt idejű ige, mert már megtörtént cselekvést fejez ki. A „fut” jelen idejű, a „futni fog” jövő idejű." },
  { prompt: "Melyik főnév többes számú?", options: ["alma", "almák", "almás", "almázik"], correctIndex: 1, topic: "hungarian", explanation: "Az almák többes számú főnév: az -k toldalék jelzi, hogy több almáról van szó. Az alma egyes számú alak." },
  { prompt: "Mi a melléknév: a piros alma?", options: ["alma", "piros", "az", "egy"], correctIndex: 1, topic: "hungarian", explanation: "A piros melléknév, mert az alma tulajdonságát, a színét nevezi meg. Az alma főnév, mert egy tárgyat jelöl." },
];

const ENEMY_BASE_XP: Record<EnemyKind, number> = {
  rock: 25,
  crystal: 60,
  alien: 80,
  fighter: 120,
  boss: 60, // hit-onkénti pont (a boss összes HP * 60 = ~3000 XP a teljesítésért)
};

/** Boss össz-HP — 3 fázisra elosztva (50/25/15 = 90 hit a teljes legyőzéshez). */
const BOSS_TOTAL_HP = 90;
const BOSS_PHASE_HP = [50, 25, 15] as const;
/** J6a: 8 hullám + a 9. hullámban a főellenfél (`physics.ts` `BOSS_WAVE`). */
const BOSS_FINAL_WAVE = BOSS_WAVE;

/* ============================ Helpers ============================ */

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Kozmetikai véletlen (ELLENFÉL-szóródás nincs benne): a menet `fxRng`-jéből jön, így a lapon nincs `Math.random` (K.6 őr).
 * A modul-szintű építők (`buildRockMesh`) ezt hívják; a lap a menet indításakor a menet seedelt `fx` forrására állítja.
 */
let cosmeticRandom: () => number = () => 0.5;

/** Egyenletes érték a [min, max) tartományban a megadott (seedelt) forrásból. */
function randRange(rng: () => number, min: number, max: number) {
  return min + rng() * (max - min);
}

/** localStorage segéd — SSR-safe. */
function loadGrade(): number | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("websuli.spaceQuiz.grade") : null;
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
  } catch {
    return null;
  }
}

/**
 * S10 / M8: a játék saját választása, ennek hiányában a közös osztály-tár (a többi játék / a profil írja) —
 * így a játéklistáról két érintéssel indul akkor is, ha ebben a játékban még nem választott osztályt.
 */
function initialGrade(): number | null {
  return loadGrade() ?? loadClassroomGrade();
}

/** Lökéshullám-gyűrű (S10): additív sprite, az életkora a render-hurokban nő. */
type Shockwave = { sprite: THREE.Sprite; age: number; radius: number };

function saveGrade(grade: number): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("websuli.spaceQuiz.grade", String(grade));
    }
  } catch {
    /* no-op */
  }
}

/* ===================== 3D mesh-építők ===================== */

/**
 * Játékos hajója: lapos, "X-Wing" jellegű, neon élek.
 * - középső orr-tüske (cone)
 * - törzs (lapos doboz)
 * - 2 oldalsó szárny (dőlt doboz)
 * - thruster glow (TBD a render-loop-ban)
 */
function buildPlayerShip(): THREE.Group {
  const group = new THREE.Group();
  // Gyöngyházfehér, fémes törzs: a sötét űrben ez a legjobban olvasható sziluett, a színes részek erre ülnek.
  const hullMat = new THREE.MeshStandardMaterial({ color: "#dfe9f7", metalness: 0.62, roughness: 0.3, emissive: "#0d2233", emissiveIntensity: 0.18 });
  const wingMat = new THREE.MeshStandardMaterial({ color: "#5a3dff", metalness: 0.6, roughness: 0.3, emissive: "#1d0f66", emissiveIntensity: 0.55 });
  const trimMat = new THREE.MeshStandardMaterial({ color: "#ff4fd8", emissive: "#ff2bd0", emissiveIntensity: 1.6, roughness: 0.4 });
  const glowCyan = new THREE.MeshStandardMaterial({ color: "#7df9ff", emissive: "#39f3ff", emissiveIntensity: 2.2, roughness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({ color: "#8fe9ff", emissive: "#1aa3d6", emissiveIntensity: 0.55, metalness: 0.9, roughness: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: "#1c2340", metalness: 0.7, roughness: 0.45 });

  // Áramvonalas törzs forgástestként (orr → farok), a Y tengely mentén.
  const hullProfile = [
    new THREE.Vector2(0.0, -0.74),
    new THREE.Vector2(0.2, -0.7),
    new THREE.Vector2(0.33, -0.44),
    new THREE.Vector2(0.38, -0.05),
    new THREE.Vector2(0.33, 0.38),
    new THREE.Vector2(0.2, 0.78),
    new THREE.Vector2(0.07, 1.02),
    new THREE.Vector2(0.0, 1.1),
  ];
  const hull = new THREE.Mesh(new THREE.LatheGeometry(hullProfile, 28), hullMat);
  hull.scale.set(1, 1, 0.6);
  group.add(hull);

  // Világító gerinccsík a törzs tetején és egy orrfény — a bloom ezekből rajzol neon kontúrt.
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.03), glowCyan);
  spine.position.set(0, 0.05, 0.235);
  group.add(spine);
  const noseLight = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), glowCyan);
  noseLight.position.set(0, 1.08, 0.02);
  group.add(noseLight);

  // Hátrahajló, lekerekített szárnyak kihúzott síkidomból, rózsaszín világító élléccel.
  const wingShape = new THREE.Shape();
  // PR #133 review: the outermost point stays inside PLAYER_HALF_WIDTH (0.24 + 0.84 ≈ 1.08 < 1.125).
  wingShape.moveTo(0, 0.28);
  wingShape.lineTo(0.76, -0.1);
  wingShape.quadraticCurveTo(0.86, -0.18, 0.8, -0.33);
  wingShape.lineTo(0.14, -0.44);
  wingShape.lineTo(0, -0.3);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 3 });
  wingGeo.translate(0, 0, -0.04);
  const edge = new THREE.BoxGeometry(0.62, 0.035, 0.05);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(side * 0.24, -0.1, 0);
    wing.scale.x = side;
    group.add(wing);
    const lead = new THREE.Mesh(edge, trimMat);
    lead.position.set(side * 0.6, 0.04, 0.07);
    lead.rotation.z = side * -0.44;
    group.add(lead);
    // Két hajtómű-gondola, a végükön világító gyűrűvel.
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.62, 16), hullMat);
    pod.position.set(side * 0.34, -0.5, -0.02);
    group.add(pod);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.1, 16), darkMat);
    nozzle.position.set(side * 0.34, -0.85, -0.02);
    group.add(nozzle);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.028, 8, 24), glowCyan);
    ring.position.set(side * 0.34, -0.9, -0.02);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    // Ferde farokúszó.
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.3), wingMat);
    fin.position.set(side * 0.16, -0.52, 0.2);
    fin.rotation.z = side * 0.35;
    group.add(fin);
  }

  // Szárnyvégi jelzőfények (bal piros, jobb zöld — mint a repülőkön).
  const tipL = createGlowSprite("#ff4d6d", 0.42, 0.9);
  tipL.position.set(-1.02, -0.42, 0.1);
  group.add(tipL);
  const tipR = createGlowSprite("#4dffb0", 0.42, 0.9);
  tipR.position.set(1.02, -0.42, 0.1);
  group.add(tipR);

  // Üvegkupola a pilótafülke fölött, sötét kerettel.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), glassMat);
  canopy.position.set(0, 0.36, 0.2);
  canopy.scale.set(0.95, 1.7, 0.7);
  group.add(canopy);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 8, 28), darkMat);
  // PR #133 review: in front of the glass's surface (the glass reaches z ≈ 0.244 along the rim), so it is visible.
  frame.position.set(0, 0.36, 0.25);
  frame.scale.set(0.95, 1.7, 1);
  group.add(frame);

  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = false;
      obj.receiveShadow = false;
    }
  });

  return group;
}

/**
 * Kőszikla aszteroida — sűrűbb icosahedron, többoktávos deformáció és
 * csúcsonkénti színezés: a gerincek világosabbak, a kráterek sötétebbek, így
 * a lapos árnyalás mellett is „kőnek" látszik, nem színes golyónak.
 */
function buildRockMesh(size: 1 | 2 | 3): THREE.Mesh {
  const radius = size === 3 ? 1.25 : size === 2 ? 0.78 : 0.46;
  const geo = new THREE.IcosahedronGeometry(radius, size === 1 ? 1 : 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(size === 3 ? "#c56cf0" : size === 2 ? "#ff9f43" : "#ff6b6b");
  const dark = base.clone().multiplyScalar(0.42);
  const light = base.clone().lerp(new THREE.Color("#fff4e0"), 0.35);
  const seed = cosmeticRandom() * 10;
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n1 = Math.sin(x * 3.1 + seed) * Math.cos(y * 2.7 - seed) * Math.sin(z * 3.3 + seed * 0.5);
    const n2 = Math.sin(x * 7.9 + y * 5.3 + seed) * Math.cos(z * 6.1 - seed);
    // Egy-két tompa kráter: a sugár bemélyed ott, ahol a zaj erősen negatív.
    const crater = Math.min(0, n1 + 0.35) * 0.35;
    const n = 1 + n1 * 0.14 + n2 * 0.05 + crater;
    pos.setXYZ(i, x * n, y * n, z * n);
    const t = THREE.MathUtils.clamp(0.5 + (n - 1) * 3.2, 0, 1);
    tmp.copy(dark).lerp(light, t);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.12,
    flatShading: true,
    emissive: size === 3 ? "#2a0838" : size === 2 ? "#2e1606" : "#300808",
    emissiveIntensity: 0.45,
  });
  return new THREE.Mesh(geo, mat);
}

/** Kristály aszteroida — gyémánt-szerű, áttetsző, lágy emisszió. */
function buildCrystalMesh(): THREE.Mesh {
  const geo = new THREE.OctahedronGeometry(0.72, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: "#5ee8ff",
    emissive: "#1a90c0",
    emissiveIntensity: 0.95,
    roughness: 0.18,
    metalness: 0.2,
    flatShading: true,
    transparent: true,
    opacity: 0.92,
  });
  return new THREE.Mesh(geo, mat);
}

/**
 * Kérdés-kristály (J6a): a válasz maga a célpont. Nagyobb és fényesebb, mint a „Drágakő” meteor (arany-bíbor, gyűrűvel,
 * kilövés-jelzéssel), hogy a gyerek ne keverje össze a sima ellenséggel; a felirat a DOM-gombon van (≥ 12 px).
 * A színeket a lap állítja (`setCrystalState`): lebegés = arany, helyes (megoldás) = zöld, elhalványuló = szürke.
 */
function buildAnswerCrystalMesh(): THREE.Group {
  const group = new THREE.Group();
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(CRYSTAL_RADIUS, 0),
    new THREE.MeshStandardMaterial({ color: "#ffd86b", emissive: "#a8561a", emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.25, flatShading: true }),
  );
  gem.scale.set(1, 1.28, 1);
  gem.name = "gem";
  group.add(gem);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(CRYSTAL_RADIUS * 1.25, 0.05, 8, 36),
    new THREE.MeshBasicMaterial({ color: "#fff1b0", transparent: true, opacity: 0.8 }),
  );
  ring.rotation.x = Math.PI / 2.4;
  ring.name = "ring";
  group.add(ring);
  return group;
}

/** Alien csészealj — torus + félgömb fölé, kupola sárga emisszió. */
function buildAlienMesh(): THREE.Group {
  const group = new THREE.Group();
  const ringMat = new THREE.MeshStandardMaterial({
    color: "#a0ff60",
    emissive: "#3a7a18",
    emissiveIntensity: 0.7,
    roughness: 0.45,
    metalness: 0.5,
  });
  const domeMat = new THREE.MeshStandardMaterial({
    color: "#fff700",
    emissive: "#a09000",
    emissiveIntensity: 0.85,
    roughness: 0.2,
    metalness: 0.35,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.18, 12, 22), ringMat);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.18, 22), ringMat);
  disc.rotation.x = Math.PI / 2;
  group.add(disc);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  dome.position.set(0, 0.10, 0);
  dome.scale.set(1, 0.85, 1);
  group.add(dome);
  // Apró villogó pontok a perem körül
  for (let k = 0; k < 5; k++) {
    const ang = (k / 5) * Math.PI * 2;
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshStandardMaterial({ color: "#ff00ff", emissive: "#ff00ff", emissiveIntensity: 1.4 }),
    );
    dot.position.set(Math.cos(ang) * 0.78, 0, Math.sin(ang) * 0.78);
    group.add(dot);
  }
  return group;
}

/** Ellenséges vadászgép — éles háromszög-prizma, lefelé néző orral. */
function buildFighterMesh(): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: "#ff3333",
    emissive: "#5a0a0a",
    emissiveIntensity: 0.55,
    roughness: 0.4,
    metalness: 0.55,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: "#ffcc00",
    emissive: "#5e4a00",
    emissiveIntensity: 0.7,
    roughness: 0.4,
    metalness: 0.5,
  });
  // Lefelé mutató orr (cone Y- felé)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.95, 6), bodyMat);
  nose.rotation.x = Math.PI;
  nose.position.set(0, -0.45, 0);
  group.add(nose);
  // Törzs
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.25), bodyMat);
  body.position.set(0, 0.05, 0);
  group.add(body);
  // Hátsó szárnyak (szétnyíló, V alak)
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.16), accentMat);
  wingL.position.set(-0.5, 0.30, 0.0);
  wingL.rotation.z = -0.32;
  group.add(wingL);
  const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.16), accentMat);
  wingR.position.set(0.5, 0.30, 0.0);
  wingR.rotation.z = 0.32;
  group.add(wingR);
  // Pulzáló sárga "lézerszem"
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.10, 8, 8),
    new THREE.MeshStandardMaterial({ color: "#fff700", emissive: "#fff700", emissiveIntensity: 1.5 }),
  );
  eye.position.set(0, -0.05, 0.16);
  group.add(eye);
  return group;
}

/**
 * Boss alien anyahajó — nagy, többrétegű mesh: 3 koncentrikus tórusz +
 * központi kupola + 6 oldalsó motor-cone. 3 fázisban változik a szín
 * (zöld → narancs → vörös) a phase-szel együtt — ezt a render loop frissíti.
 */
function buildBossMesh(): THREE.Group {
  const group = new THREE.Group();
  const ringMat = new THREE.MeshStandardMaterial({
    color: "#a0ff60",
    emissive: "#3a7a18",
    emissiveIntensity: 0.85,
    roughness: 0.4,
    metalness: 0.55,
  });
  const innerMat = new THREE.MeshStandardMaterial({
    color: "#ff00ff",
    emissive: "#5e1f5e",
    emissiveIntensity: 0.7,
    roughness: 0.35,
    metalness: 0.5,
  });
  const domeMat = new THREE.MeshStandardMaterial({
    color: "#fff700",
    emissive: "#a09000",
    emissiveIntensity: 1.1,
    roughness: 0.18,
    metalness: 0.4,
  });
  // Külső gyűrű (legnagyobb)
  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.32, 14, 32), ringMat);
  outerRing.rotation.x = Math.PI / 2;
  outerRing.name = "boss-outer";
  group.add(outerRing);
  // Középső gyűrű
  const midRing = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.22, 12, 28), innerMat);
  midRing.rotation.x = Math.PI / 2;
  midRing.name = "boss-mid";
  group.add(midRing);
  // Korpus / disc
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.42, 28), ringMat);
  disc.rotation.x = Math.PI / 2;
  disc.name = "boss-disc";
  group.add(disc);
  // Központi kupola
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.85, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  dome.position.set(0, 0.18, 0);
  dome.scale.set(1, 0.85, 1);
  dome.name = "boss-dome";
  group.add(dome);
  // Pulzáló mag-szem
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 12, 10),
    new THREE.MeshStandardMaterial({ color: "#ff0033", emissive: "#ff0033", emissiveIntensity: 1.6 }),
  );
  eye.position.set(0, 0.45, 0);
  eye.name = "boss-eye";
  group.add(eye);
  // 6 oldalsó motor-cone a peremen
  for (let k = 0; k < 6; k++) {
    const ang = (k / 6) * Math.PI * 2;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.6, 8),
      new THREE.MeshStandardMaterial({
        color: "#ff5577",
        emissive: "#ff2244",
        emissiveIntensity: 1.3,
      }),
    );
    cone.position.set(Math.cos(ang) * 2.0, -0.18, Math.sin(ang) * 2.0);
    cone.rotation.x = Math.PI / 2;
    cone.name = `boss-engine-${k}`;
    group.add(cone);
  }
  return group;
}

/** Pajzs pickup — forgó kék kocka pajzs-szimbólummal. */
function buildShieldPickupMesh(): THREE.Group {
  const group = new THREE.Group();
  const cubeMat = new THREE.MeshStandardMaterial({
    color: "#3aa1ff",
    emissive: "#1864c0",
    emissiveIntensity: 1.0,
    roughness: 0.3,
    metalness: 0.5,
    transparent: true,
    opacity: 0.92,
  });
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), cubeMat);
  group.add(cube);
  // "S" alakú belső jelzés (egyszerű 3 doboz)
  const shieldMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    emissive: "#ffffff",
    emissiveIntensity: 1.5,
  });
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.12), shieldMat);
  top.position.set(0, 0.18, 0.18);
  group.add(top);
  const bot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.12), shieldMat);
  bot.position.set(0, -0.18, 0.18);
  group.add(bot);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 16), shieldMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0, 0.18);
  group.add(ring);
  return group;
}

/** Bomb pickup — forgó narancs gömb fekete csíkokkal. */
function buildBombPickupMesh(): THREE.Group {
  const group = new THREE.Group();
  const sphereMat = new THREE.MeshStandardMaterial({
    color: "#ff8800",
    emissive: "#aa3300",
    emissiveIntensity: 1.0,
    roughness: 0.35,
    metalness: 0.45,
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), sphereMat);
  group.add(sphere);
  // Kanóc a tetején
  const wickMat = new THREE.MeshStandardMaterial({
    color: "#ffff00",
    emissive: "#ffff00",
    emissiveIntensity: 1.6,
  });
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.25, 6), wickMat);
  wick.position.set(0, 0.5, 0);
  group.add(wick);
  // Spark a tetején
  const spark = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 6),
    new THREE.MeshBasicMaterial({ color: "#fff700" }),
  );
  spark.position.set(0, 0.65, 0);
  group.add(spark);
  return group;
}

/** Életpont pickup — forgó zöld kocka kereszttel. */
function buildLifePickupMesh(): THREE.Group {
  const group = new THREE.Group();
  const cubeMat = new THREE.MeshStandardMaterial({
    color: "#00ff66",
    emissive: "#0a6a2c",
    emissiveIntensity: 1.0,
    roughness: 0.3,
    metalness: 0.4,
    transparent: true,
    opacity: 0.9,
  });
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), cubeMat);
  group.add(cube);
  // Belső + jel (két keresztező doboz)
  const crossMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    emissive: "#ffffff",
    emissiveIntensity: 1.4,
  });
  const horiz = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.12), crossMat);
  group.add(horiz);
  const vert = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), crossMat);
  group.add(vert);
  return group;
}

/** Power-up pickup — forgó sárga kocka „P" jellel. */
function buildPowerPickupMesh(): THREE.Group {
  const group = new THREE.Group();
  const cubeMat = new THREE.MeshStandardMaterial({
    color: "#fff700",
    emissive: "#7a6e00",
    emissiveIntensity: 1.0,
    roughness: 0.3,
    metalness: 0.4,
    transparent: true,
    opacity: 0.9,
  });
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), cubeMat);
  group.add(cube);
  // Belső villám pulzál (egyszerű cone)
  const boltMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    emissive: "#ffffff",
    emissiveIntensity: 1.6,
  });
  const bolt = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.45, 4), boltMat);
  bolt.rotation.z = -0.4;
  group.add(bolt);
  return group;
}

/* ===================== Komponens ===================== */

/** A HUD pillanatképe: a játékhurok ref-eket ír, a React ≤ 10 Hz-cel kap pillanatképet (K.4/10, KSZ-9). */
type Hud = {
  score: number;
  wave: number;
  lives: number;
  combo: number;
  powerLevel: number;
  powerTimer: number;
  shieldTimer: number;
  bombs: number;
  bossHp: number | null;
  enemiesKilled: number;
  /** A „HULLÁM n” felirat (0 = nincs); a hullámok közt nincs kapu, csak ez a felirat. */
  banner: number;
  /** A tanító súgó (≤ 1 sor) az első másodpercekben látszik. */
  hint: boolean;
  /** A menet előrehaladása 0..1 (a hullámok és a főellenfél felé): a HUD sávja idő helyett ezt mutatja. */
  progress: number;
};
const INITIAL_HUD: Hud = { score: 0, wave: 1, lives: 3, combo: 0, powerLevel: 0, powerTimer: 0, shieldTimer: 0, bombs: 0, bossHp: null, enemiesKilled: 0, banner: 0, progress: 0, hint: false };
/** A HUD legsűrűbb frissítése (ms): 10 Hz. */
const HUD_STEP_MS = 100;

/** A menet seedelt véletlen-forrásai: a világ (érkezés, hasadás, pickup), a kozmetika és a kérdés-kristályok külön. */
type RunRng = { world: Rng; fx: Rng; crystal: Rng; pick: Rng };
function makeRunRng(seed: string | number): RunRng {
  return {
    world: createRng(seedFrom(ASTEROID_GAME_ID, seed, "world")),
    fx: createRng(seedFrom(ASTEROID_GAME_ID, seed, "fx")),
    crystal: createRng(seedFrom(ASTEROID_GAME_ID, seed, "crystals")),
    pick: createRng(seedFrom(ASTEROID_GAME_ID, seed, "pick")),
  };
}

/** A kamera képpont-sorához (a vászon tetejétől, 0..1) tartozó játéksík-magasság (z = 0). Nem a forró úton hívjuk. */
const unprojectTmp = new THREE.Vector3();
function worldYAtScreenFrac(camera: THREE.PerspectiveCamera, frac: number): number {
  unprojectTmp.set(0, 1 - 2 * frac, 0.5).unproject(camera);
  unprojectTmp.sub(camera.position);
  if (Math.abs(unprojectTmp.z) < 1e-6) return CAMERA_LOOK_Y;
  const t = -camera.position.z / unprojectTmp.z;
  return camera.position.y + unprojectTmp.y * t;
}

/**
 * Az évfolyam-bank azon tételei, amelyek opciója nem fér a kristály-feliratba, a választónak „már látott”-nak számítanak
 * (a futás valódi `seen`-je érintetlen marad): előbb a beférő tétel jön, csak ha az elfogy, a hosszabb opciójú.
 */
function seenWithUnfit(seen: GradeQuizSeen, grade: number): GradeQuizSeen {
  const out: GradeQuizSeen = { ids: new Set(seen.ids), prompts: new Set(seen.prompts) };
  for (const it of loadedGradeItems()) {
    if (Math.abs(it.grade - grade) > 1 || crystalLabelsFit(it.options)) continue;
    if (it.id) out.ids.add(it.id);
    out.prompts.add(normalizePrompt(it.prompt));
  }
  return out;
}

/** A lap tétele a közös szűrőnek (`DirectorConfig.promptFits`): azonosító nélküli kézi tételnél üres azonosító. */
const asFourChoice = (q: Quiz) => ({ id: q.id ?? "", prompt: q.prompt, options: q.options, correctIndex: q.correctIndex });

/** Kristály-állapot a megoldás-kijelzéshez: a helyes zölden világít, a választott rossz elmarad (hasadt), a többi elhalványul. */
type CrystalLook = "idle" | "correct" | "gone";


export default function SpaceAsteroidQuiz() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneBoxRef = useRef<HTMLDivElement>(null);
  // S10 / terv 4.5: közös érintés-észlelés (any-pointer: coarse + valódi érintés) — érintős laptop is kap vezérlőt.
  const touchCapable = useTouchCapable();
  const touchCapableRef = useRef(touchCapable);
  touchCapableRef.current = touchCapable;
  const haptics = useHaptics();
  const [, navigate] = useLocation();
  const bestScore = useBestScore("space-asteroid-quiz");
  const [bestInfo, setBestInfo] = useState<{ best: number; isNewBest: boolean } | null>(null);

  // LS-4 (D3): the play-time coupon earned in a lesson, exactly as in Tsunami —
  // without a coupon this is inert and free play stays the default.
  const coupon = useCouponSession();

  // ----- Játékállapot (UI) -----
  const [phase, setPhase] = useState<Phase>(initialGrade() != null ? "intro" : "grade");
  const [grade, setGrade] = useState<number | null>(initialGrade());
  /** A futás kérdés-mérlege az eredményképernyőhöz (a director valós statisztikájából, a menet végén). */
  const [quizCorrect, setQuizCorrect] = useState(0);
  const [quizTotal, setQuizTotal] = useState(0);
  /** S10: a joystick húzásának megszakítása szünetkor / fókuszvesztéskor (VirtualJoystick resetSignal). */
  const [joyReset, setJoyReset] = useState(0);
  const [hud, setHud] = useState<Hud>(INITIAL_HUD);
  const [wrongShake, setWrongShake] = useState(false);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([]);
  const [paused, setPaused] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  // „Miért?” — a játékos kérte magyarázat (a közös QuizFeedbackCard). Amíg nyitva van, a játék áll: az olvasásért nem jár
  // büntetés (terv 9.: a „magyarázat olvasása közben áll az óra” követelmény megmarad).
  const [feedback, setFeedback] = useState<FeedbackCard | null>(null);
  const [expanded, setExpanded] = useState(false);
  const whyOpen = feedback !== null || expanded;
  // K.4/7: a WebGL-környezet elvesztése → szünet + „Grafika újraindítása”; az újraindítás új vászon + új renderer.
  const [gfxLost, setGfxLost] = useState(false);
  const [sceneEpoch, setSceneEpoch] = useState(0);
  // Spec 2026-09-29-palyak-szoletra-nyelvek (E szelet): 10 pálya évfolyamonként (3–12.); a futás pályája a startkor rögzül.
  const levels = useGradeLevel("asteroid", grade);
  const runLevelRef = useRef<number | null>(null);
  const levelClearedRef = useRef(false);
  const { score, wave, lives, combo, powerLevel, powerTimer, shieldTimer, bombs, bossHp, enemiesKilled, banner } = hud;

  const scoreSubmittedRef = useRef(false);
  const { data: syncEligibility } = useSyncEligibilityQuery();
  const syncBanner = useMemo(() => gameSyncBannerText(syncEligibility), [syncEligibility]);

  // ----- Mutable játéklogika ref-ek (nincs re-render minden frame-en) -----
  const playerRef = useRef({
    x: 0,
    y: PLAYER_BASE_Y,
    vx: 0,
    vy: 0,
    invuln: 0, // sec
    cooldown: 0, // sec
    alive: true,
    bobPhase: 0,
  });
  const enemiesRef = useRef<EnemyState[]>([]);
  const bulletsRef = useRef<BulletState[]>([]);
  const pickupsRef = useRef<PickupState[]>([]);
  const lastTimeRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const nextEntityIdRef = useRef(1);
  const enemiesPerWaveRef = useRef(0);
  const enemiesSpawnedThisWaveRef = useRef(0);
  const waveIntermissionRef = useRef(false);
  const waveRef = useRef(1);
  const livesRef = useRef(3);
  const phaseRef = useRef<Phase>(phase);
  const pausedRef = useRef(false);
  const powerLevelRef = useRef(0);
  const powerTimerRef = useRef(0);
  const shieldTimerRef = useRef(0);
  const bombsRef = useRef(0);
  const comboRef = useRef(0);
  const bestComboRef = useRef(0); // D2: run-level best combo (survives combo resets)
  const enemiesKilledRef = useRef(0);
  /** Alien UFO kill-számláló — az alien_killer jelvényhez (10 alien / futás). */
  const alienKillsRef = useRef(0);
  const scoreRef = useRef(0);
  const bossHpRef = useRef<number | null>(null);
  /** Hány hullám-váltás történt a menetben (teszt-kampó: a hullámok kapu nélkül váltják egymást). */
  const waveChangesRef = useRef(0);
  /** A „HULLÁM n” felirat hátralévő játékideje (mp). */
  const bannerLeftRef = useRef(0);
  /** A menet vége (győzelem / vereség): új kérdés nem indul, az eredményképernyő a robbanás után jön. */
  const runOverRef = useRef(false);
  /** A menet valós kérdés-számai és ideje az eredményhez / jelvényhez / pontszám-szinkronhoz (a menet végén rögzül). */
  const runTotalsRef = useRef({ correct: 0, wrong: 0, total: 0, seconds: 0 });
  const hudDirtyRef = useRef(true);
  const hudStampRef = useRef(0);
  const fpsRef = useRef(60);
  /** G-11: a hajó vízszintes határa, a kamera látómezejéből újraszámolva. */
  const playerXLimitRef = useRef<number | undefined>(undefined);
  // G-5: a rajzoló hurok ref-ekből olvas, ezért a beállítást ide tükrözzük.
  const reducedMotion = useReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  // Friss closure-ref-ek a mount-olt RAF loop-hoz (stale closure ellen).
  // A render végén frissülnek; a loop mindig a legutolsó verziót hívja.
  const tickRef = useRef<(dt: number) => void>(() => {});
  const renderRef = useRef<(now: number) => void>(() => {});
  const detonateBombRef = useRef<() => void>(() => {});
  /** Boss legyőzve flag — a tick hullám-vége ága ne duplázza a phase-átmenetet. */
  const bossDefeatedRef = useRef(false);
  const gameElapsedRef = useRef(0);
  const lastSpawnAtRef = useRef(0);
  const lastDtRef = useRef(1 / 60);

  const keysRef = useRef({ left: false, right: false, up: false, down: false, fire: false });
  const touchRef = useRef({ left: false, right: false, up: false, down: false, fire: false });
  /** Joystick-reakció (#49): az analóg tárcsa-érték (−1…1, a görbével), a hurok képkockánként olvassa. */
  const stickRef = useRef({ x: 0, y: 0 });
  // Joystick-reakció (#49): a bemenet → válasz mérő kampója (csak teszt-kampós buildben él).
  countRender("space-page");
  useEffect(
    () =>
      registerInputProbe("space", () => {
        const p = playerRef.current;
        return { x: p.x, y: p.y, vx: p.vx, vy: p.vy, inX: stickRef.current.x, inY: stickRef.current.y };
      }),
    [],
  );
  const timeoutsRef = useRef<number[]>([]);
  const pushTimeout = useCallback((cb: () => void, ms: number): number => {
    const id = window.setTimeout(() => {
      timeoutsRef.current = timeoutsRef.current.filter((t) => t !== id);
      cb();
    }, ms);
    timeoutsRef.current.push(id);
    return id;
  }, []);
  /**
   * S10 / review #426 („elavult időzítők”): minden futás saját azonosítót kap. A futáshoz kötött késleltetés
   * (győzelmi robbanás → eredmény, rázás-visszaállítás, toast) csak akkor fut le, ha közben nem volt újrakezdés
   * vagy kilépés; újrakezdéskor / kilépéskor a függő időzítők törlődnek is.
   */
  const runIdRef = useRef(0);
  const pushRunTimeout = useCallback((cb: () => void, ms: number): number => {
    const runId = runIdRef.current;
    return pushTimeout(() => {
      if (runIdRef.current !== runId) return;
      cb();
    }, ms);
  }, [pushTimeout]);
  const clearPendingTimeouts = useCallback(() => {
    timeoutsRef.current.forEach((t) => window.clearTimeout(t));
    timeoutsRef.current = [];
  }, []);
  /** S10: robbanás-lökéshullámok (a render-hurok tágítja és törli őket). */
  const shockwavesRef = useRef<Shockwave[]>([]);

  // Three.js objektumok — useEffect-ben hozzuk létre, refbe tesszük.
  const sceneRefs = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    starfield: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
    nebula: Nebula;
    brightStars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
    planet: THREE.Group;
    postFx: PostFx;
    sparkles: SparkleField;
    thrusterGlow: THREE.Sprite;
    bulletGlow: { player: THREE.SpriteMaterial; enemy: THREE.SpriteMaterial };
    reducedParticles: number;
    playerGroup: THREE.Group;
    thrusterMesh: THREE.Mesh<THREE.ConeGeometry, THREE.MeshStandardMaterial>;
    shieldMesh: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
    shieldFullMesh: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
    enemiesGroup: THREE.Group;
    bulletsGroup: THREE.Group;
    pickupsGroup: THREE.Group;
    /** S10: robbanás-lökéshullámok rétege. */
    fxGroup: THREE.Group;
    /** J6a: a kérdés-kristályok előre gyártott meshei (poolból; nem látszó = `visible = false`). */
    answerMeshes: THREE.Group[];
    enemyMeshById: Map<number, THREE.Object3D>;
    bulletMeshById: Map<number, THREE.Object3D>;
    pickupMeshById: Map<number, THREE.Object3D>;
    flashLight: THREE.PointLight;
  } | null>(null);

  // ----- Quiz bank lekérdezés (osztály-alapú) -----
  const { data: materialQuizData } = useQuery<MaterialQuizApi>({
    queryKey: ["/api/games/material-quizzes", grade, coupon.lessonId],
    enabled: grade != null || !!coupon.lessonId,
    queryFn: async () => {
      const res = await fetch(`/api/games/material-quizzes?classroom=${grade ?? 0}&limit=3${coupon.lessonId ? `&lessonId=${encodeURIComponent(coupon.lessonId)}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) return { classroom: grade ?? 0, materials: [], items: [] };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const quizPool = useMemo<Quiz[]>(() => {
    const fromMat: Quiz[] = (materialQuizData?.items ?? [])
      .filter(isPlayableQuestion)
      .map((q) => ({
        id: q.id,
        prompt: q.prompt,
        options: [...q.options],
        correctIndex: q.correctIndex,
        // T-1: a bankból jövő magyarázat, ha a lecke exportja hozta.
        explanation: q.explanation ?? undefined,
        topic: q.topic ?? null,
        source: "material" as const,
      }));
    const fb = FALLBACK_QUIZZES.map((q) => ({ ...q, source: "fallback" as const }));
    // Tananyag-kvízek elöl, fallback hátul.
    return coupon.active && fromMat.length ? fromMat : [...fromMat, ...fb];
  }, [materialQuizData, coupon.active]);

  /** Spec 2026-09-29: a futásban már feltett kérdések (azonosító + prompt) — a közös bank ismétlés-tilalma. */
  const gradeSeenRef = useRef(createGradeQuizSeen());
  /** Csak a futás KIINDULÓ sávját adja (pálya szerint); a futás közbeni sávot a kérdés-ütemező áramlat-vezérlője mozgatja. */
  const adaptiveRef = useRef(createAdaptiveSession(4));

  /**
   * S10 / terv A8: az angol kérdés-hely a központi szóbankból (közös napló mind a hét játékra). `null`, amíg
   * tölt, vagy ha a betöltés hibázott — ilyenkor a kézi `FALLBACK_QUIZZES` / évfolyam-bank megy, változatlanul.
   * A bekötés EGY helyen kapcsolható ki: itt (`enabled`).
   */
  const vocab = useVocabQuizSource("en", true);

  /* ============== Kérdésforrás a kérdés-ütemezőhöz (J6a) ============== */

  // A forrás stabil (a director a létrehozáskor kapja meg), ezért ref-eken át olvassa a lap friss állapotát.
  const quizPoolRef = useRef(quizPool);
  quizPoolRef.current = quizPool;
  const gradeRef = useRef(grade);
  gradeRef.current = grade;
  const couponActiveRef = useRef(coupon.active);
  couponActiveRef.current = coupon.active;
  const vocabRef = useRef(vocab);
  vocabRef.current = vocab;
  const runRngRef = useRef<RunRng>(makeRunRng(seedFrom(ASTEROID_GAME_ID, "init")));

  /**
   * A kérdés-ütemező forrása: a régi `pickQuiz` sorrendje szétbontva a közös forrásrendhez (K.2): `material()` = nem látott
   * tananyag-kvíz (`pickUnseenMaterial`), `fresh()` = évfolyam-bank (a szóbank váltja ki az angol helyet) → a régi kézi
   * bank; `restore()` = ismétlés (csak a saját játék / angol szóbank / évfolyam-bank / tananyag tétele).
   */
  const provider = useMemo<QuestionProvider>(() => {
    const couponMaterialOnly = () => couponActiveRef.current && quizPoolRef.current.some((q) => q.source === "material");
    const toMaterialPlay = (m: Quiz): PlayQuestion =>
      materialPlayQuestion(
        { id: m.id ?? "", prompt: m.prompt, options: m.options, correctIndex: m.correctIndex, explanation: m.explanation ?? undefined },
        { subject: m.topic ?? undefined, coupon: couponActiveRef.current },
      );
    return {
      get couponOnly() {
        return couponMaterialOnly();
      },
      material: (ctx) => {
        const seen = gradeSeenRef.current;
        const mats = quizPoolRef.current.filter((q) => q.source === "material");
        if (mats.length === 0) return null;
        // J0c-b: a sávban elolvasható / beférő tétel előbb; a többi hátra kerül (nem jelöljük látottnak).
        const pick = (ctx?.accept ? pickUnseenMaterial(mats.filter((q) => ctx.accept!(asFourChoice(q))), seen) : null) ?? pickUnseenMaterial(mats, seen);
        if (!pick) return null;
        markGradeQuizSeen(seen, pick);
        return toMaterialPlay(pick);
      },
      fresh: ({ band, accept }) => {
        const seen = gradeSeenRef.current;
        const vocab = vocabRef.current;
        const grade = gradeRef.current;
        const sharedGrade = gradeForGame(grade);
        const rng = runRngRef.current.pick.next;
        // S10 / terv A8: az angol kérdés-hely a központi szóbankból (a tananyag-ág UTÁN); `null`, amíg tölt / hibázott.
        const fromVocab = (): PlayQuestion | null => {
          const vq = vocab?.next(vocabLevelForGrade(grade, band)) ?? null;
          if (!vq) return null;
          markGradeQuizSeen(seen, vq);
          return vocabPlayQuestion(vq);
        };
        /** Kézi angol kérdés: a helyes válasza a közös naplóba, hogy a szóbank ne kérdezze vissza ugyanazt a szót. */
        const manual = (q: Quiz): PlayQuestion => {
          if (q.topic === "english" && q.source !== "material") vocab?.markExternal(q.options[q.correctIndex]!);
          return bankPlayQuestion(ASTEROID_GAME_ID, { id: q.id ?? "", prompt: q.prompt, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation ?? undefined }, q.topic ?? undefined);
        };
        if (sharedGrade != null) {
          // A kristály-feliratba nem férő (hosszú opciójú) tételek hátrébb kerülnek: a választó ezeket „látottnak” veszi,
          // és csak ha nincs más, adja őket (a hosszú tételt a sáv csonkítás nélkül mutatja, a kristály 2 sorra vág).
          const pickSeen = seenWithUnfit(seen, sharedGrade);
          // A kiválasztott tétel MINDIG fogy (Brain Rot review #424), akkor is, ha a szóbank váltja ki — különben a
          // `pickGradeQuiz` a legelső nem üres sávban ragadna, és a nem angol tételek elfogyta után csak angolt adna.
          const slot = pickGradeSlotWithVocab({
            pick: () => pickGradeQuiz({ grade: sharedGrade, band, seen: pickSeen, rng }) ?? pickGradeQuiz({ grade: sharedGrade, band, seen, rng }),
            seen,
            vocabNext: fromVocab,
          });
          if (slot?.kind === "vocab") return slot.quiz;
          if (slot) {
            const item = slot.item;
            if (item.subject === "english") vocab?.markExternal(item.options[item.correctIndex]!);
            return gradePlayQuestion(item);
          }
        }
        // A régi (kézi) bank: a még nem látott tételek közül; az angol hely előbb a szóbankból.
        const manualPool = FALLBACK_QUIZZES.filter((q) => !isGradeQuizSeen(seen, q));
        if (manualPool.length === 0) return null;
        const accepted = accept ? manualPool.filter((q) => accept(asFourChoice(q))) : manualPool;
        const candidates = accepted.length > 0 ? accepted : manualPool;
        const picked = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))]!;
        markGradeQuizSeen(seen, picked);
        if (picked.topic === "english" && !couponMaterialOnly()) {
          const vq = fromVocab();
          if (vq) return vq;
        }
        return manual({ ...picked, source: "fallback" });
      },
      // Az ismétlési sor KÖZÖS a hét játékban: csak a saját (Aszteroida) kézi tétel, az angol szóbank, az évfolyam-bank és a
      // tananyag állítható vissza; a más játék kézi bankja a sorban marad (a director a menetre átugorja).
      restore: (item) => {
        if (item.key.startsWith("bank:") && !item.key.startsWith(`bank:${ASTEROID_GAME_ID}:`)) return null;
        return restoreReviewQuestion(item, {
          vocab: (lang) => (lang === "en" ? vocabRef.current : null),
          gradeItem: (id) => loadedGradeItems().find((q: GradeQuizItem) => q.id === id) ?? null,
        });
      },
    };
  }, []);

  /* ============== A menet meghajtója, a kérdés-sáv, a kristályok ============== */

  const seedBase = useMemo(() => readGameSeed() ?? seedFrom(ASTEROID_GAME_ID, new Date().toISOString().slice(0, 10)), []);
  const runIndexRef = useRef(0);
  const runSeedRef = useRef<string | number>(seedFrom(seedBase, 0));
  const directorConfig = useMemo(() => asteroidDirectorConfig(grade), [grade]);
  const driverRef = useRef<AsteroidDriver | null>(null);
  const crystalsRef = useRef<Crystal[]>([]);
  /** A kérdés-kristályok DOM-gombjai (a hurok közvetlenül mozgatja őket, nincs képkockánkénti setState). */
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const crystalTaps = useMemo(() => createPointerTapTracker(), []);
  /** A kristály-zóna utolsó mérése (a kérdés-kártya alja alapján), hogy a kristályok ne a kártya alá kerüljenek. */
  const zoneRef = useRef({ at: 0, cardBottom: -1 });
  const qRef = useRef<ReturnType<typeof usePlayQuestion>>(null as unknown as ReturnType<typeof usePlayQuestion>);

  const makeDriver = (seed: string | number): AsteroidDriver =>
    createAsteroidDriver({
      seed,
      questions: {
        frame: (clock, ctx) => qRef.current?.frame(clock, ctx),
        timeScale: () => qRef.current?.timeScale() ?? 1,
        finished: () => qRef.current?.finished() ?? true,
        finish: () => qRef.current?.finish(),
      },
      // A világ egy fix lépése; a tick maga őrzi, hogy csak `play` fázisban és nem szünetben fut.
      step: (dtMs) => tickRef.current(dtMs / 1000),
      over: () => runOverRef.current,
      reducedMotion,
    });

  /** A kristály-zóna a játéksíkon: a kérdés-kártya ALATT (mért), legalább 64 px magas; `halfWidth` a látható félszélesség. */
  const computeCrystalBounds = useCallback(() => {
    const refs = sceneRefs.current;
    const box = sceneBoxRef.current;
    if (!refs || !box) return crystalBounds({ halfWidth: 8.9, minY: 0.5, maxY: 6 });
    const rect = box.getBoundingClientRect();
    const h = Math.max(1, rect.height);
    const card = document.querySelector<HTMLElement>('[data-testid="sa-question"] .play-question-card');
    const cardBottom = card ? card.getBoundingClientRect().bottom : rect.top + 0.3 * h;
    zoneRef.current.cardBottom = cardBottom;
    // A kristály KÖZEPE a kártya alja + 10 px + a gomb fél magassága (26 px) alá kerül: a gomb teteje sem csúszik a kártya alá.
    const topFrac = Math.min(0.7, Math.max(0.05, (cardBottom + 10 + CRYSTAL_CHIP_HALF_H - rect.top) / h));
    const minPx = 72;
    const bottomFrac = Math.min(0.85, Math.max(topFrac + minPx / h, CRYSTAL_ZONE_BOTTOM));
    const camera = refs.camera;
    const topY = worldYAtScreenFrac(camera, topFrac);
    const bottomY = worldYAtScreenFrac(camera, bottomFrac);
    return crystalBounds({
      // A kristályok a JÁTÉKTÉR fölött lebegnek (fekvő telefonon a látható sáv szélesebb a pályánál: a szélek a vezérlőké).
      halfWidth: Math.min(GAME_W / 2, visibleHalfWidth(camera.fov, camera.aspect, camera.position.z)),
      minY: bottomY,
      maxY: topY,
      // A legkisebb zónamagasság a KÉPPONTBÓL jön (a két sor ≥ 72 px-re van egymástól, a gomb ~52 px magas): a játéksík
      // egység-px aránya a vászon méretétől függ, a fix egység-érték fekvő telefonon kevés volt (M2: fedő válaszcélok).
      minHeight: Math.max(CRYSTAL_MIN_ZONE_HEIGHT, topY - worldYAtScreenFrac(camera, topFrac + minPx / h)),
    });
  }, []);

  const q = usePlayQuestion({
    setup: { config: directorConfig, provider, startBand: adaptiveRef.current.band, seed: runSeedRef.current },
    // Hang és rezgés a lapé (alább, a játékbeli következménnyel együtt): egy kimenet = egy visszajelzés.
    sound: false,
    haptics: false,
    onShow: (p) => {
      sfxWhoosh();
      // A kérdés kristályai a kártya alatti zónába érkeznek (a kártya magassága ekkor még becslés: a hurok újramér).
      crystalsRef.current = spawnCrystals(p, computeCrystalBounds(), runRngRef.current.crystal.next);
    },
    onOutcome: (o, p) => {
      if (o.result === "aborted") {
        crystalsRef.current = [];
        return;
      }
      const idx = o.pickedOriginalIndex === null ? -1 : p.options.findIndex((opt) => opt.originalIndex === o.pickedOriginalIndex);
      const picked = idx >= 0 ? crystalsRef.current[idx] : undefined;
      if (picked?.alive) hitCrystal(crystalsRef.current, picked.id);
      // A lecke-kupon bónusza: a valós (eredeti) opció-index.
      if (o.pickedOriginalIndex !== null) maybeClaimCouponBonus(coupon, p.question.quiz.id, o.pickedOriginalIndex);
      onCrystalOutcome(o.result, picked ?? null);
    },
  });
  qRef.current = q;

  /* ============== Phase / játékvezérlés ============== */

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /**
   * S10 / #422: a vezérlés elengedése (szünet, fókuszvesztés, elforgatás): a billentyű- és érintés-irányok és a
   * tűz nullázva, a joystick futó húzása megszakítva — visszatéréskor semmi nem „ragad be”.
   */
  const releaseControls = useCallback(() => {
    for (const k of ["left", "right", "up", "down", "fire"] as const) {
      keysRef.current[k] = false;
      touchRef.current[k] = false;
    }
    stickRef.current.x = 0;
    stickRef.current.y = 0;
    setJoyReset((n) => n + 1);
  }, []);

  // A játék áll szünetben ÉS amíg a „Miért?” kártya nyitva van (a kérdés-óra és a világ is).
  useEffect(() => {
    pausedRef.current = paused || whyOpen;
    if (paused) releaseControls();
    else if (whyOpen) releaseControls();
  }, [paused, whyOpen, releaseControls]);

  /** A szünet játék közben mindig elérhető (HUD-gomb, a kérdés-sáv gombja, P, automatikus szünet). */
  const pauseGame = useCallback(() => {
    if (phaseRef.current !== "play") return;
    pausedRef.current = true;
    setPaused(true);
  }, []);
  const resumeGame = useCallback(() => {
    // A szünet alatt eltelt idő ne kerüljön egyetlen képkockába (a rAF-hurok dt-je).
    lastTimeRef.current = null;
    pausedRef.current = false;
    setPaused(false);
  }, []);

  /** A HUD-hoz tartozó ref-ek változtak: a következő (≤ 10 Hz-es) pillanatkép már az újat mutatja. */
  const markHud = () => {
    hudDirtyRef.current = true;
  };
  /** HUD-pillanatkép (≤ 10 Hz, KSZ-9): a képkocka-hurok innen frissíti a React-állapotot, nem minden képkockában. */
  const publishHud = (force = false) => {
    const now = performance.now();
    if (!force && (!hudDirtyRef.current || now - hudStampRef.current < HUD_STEP_MS)) return;
    hudStampRef.current = now;
    hudDirtyRef.current = false;
    setHud({
      score: scoreRef.current,
      wave: waveRef.current,
      lives: livesRef.current,
      combo: comboRef.current,
      powerLevel: powerLevelRef.current,
      powerTimer: Math.ceil(powerTimerRef.current),
      shieldTimer: Math.ceil(shieldTimerRef.current),
      bombs: bombsRef.current,
      bossHp: bossHpRef.current,
      enemiesKilled: enemiesKilledRef.current,
      banner: bannerLeftRef.current > 0 ? waveRef.current : 0,
      hint: gameElapsedRef.current < HINT_SEC && !runOverRef.current,
      progress: Math.min(1, (waveRef.current - 1 + (enemiesPerWaveRef.current > 0 ? Math.min(1, enemiesSpawnedThisWaveRef.current / enemiesPerWaveRef.current) : 0)) / (WAVE_COUNT + 1)),
    });
  };

  /** Hullám indítása: spawn count + felirat. Nincs kapu: a hullám azonnal indul. */
  const beginWaveSpawning = useCallback(() => {
    waveIntermissionRef.current = false;
    enemiesSpawnedThisWaveRef.current = 0;
    enemiesPerWaveRef.current = waveEnemyCount(waveRef.current);
    bannerLeftRef.current = WAVE_BANNER_SEC;
    hudDirtyRef.current = true;
  }, []);

  const startNewRun = useCallback(() => {
    // S10 / review #426: új futás → új azonosító, az előző futás függő időzítői törölve.
    runIdRef.current += 1;
    clearPendingTimeouts();
    setFeedback(null);
    setExpanded(false);
    setWrongShake(false);
    setQuizCorrect(0);
    setQuizTotal(0);
    setBestInfo(null);
    releaseControls();
    runLevelRef.current = levels.level;
    levelClearedRef.current = false;
    adaptiveRef.current.reset(grade ?? 4, runLevelRef.current);
    gradeSeenRef.current = createGradeQuizSeen();
    scoreSubmittedRef.current = false;
    // A menet seedje (K.4/13): azonos seed → azonos hullám-érkezés, hasadás, pickup és kérdéssor.
    runIndexRef.current += 1;
    const seed = seedFrom(seedBase, runIndexRef.current);
    runSeedRef.current = seed;
    runRngRef.current = makeRunRng(seed);
    cosmeticRandom = runRngRef.current.fx.next;
    driverRef.current = makeDriver(seed);
    crystalsRef.current = [];
    runOverRef.current = false;
    runTotalsRef.current = { correct: 0, wrong: 0, total: 0, seconds: 0 };
    enemiesRef.current = [];
    bulletsRef.current = [];
    pickupsRef.current = [];
    nextEntityIdRef.current = 1;
    playerRef.current = { x: 0, y: PLAYER_BASE_Y, vx: 0, vy: 0, invuln: 1.5, cooldown: 0, alive: true, bobPhase: 0 };
    waveRef.current = 1;
    livesRef.current = 3;
    powerLevelRef.current = 0;
    powerTimerRef.current = 0;
    shieldTimerRef.current = 0;
    bombsRef.current = 0;
    comboRef.current = 0;
    bestComboRef.current = 0; // D2: reset run-level best combo on new run
    enemiesKilledRef.current = 0;
    alienKillsRef.current = 0;
    bossDefeatedRef.current = false;
    bossHpRef.current = null;
    waveChangesRef.current = 0;
    scoreRef.current = 0;
    setGameWon(false);
    setPaused(false);
    setSavedToast(null);
    enemiesPerWaveRef.current = 0;
    enemiesSpawnedThisWaveRef.current = 0;
    waveIntermissionRef.current = false;
    lastTimeRef.current = null;
    gameElapsedRef.current = 0;
    lastSpawnAtRef.current = 0;
    bannerLeftRef.current = 0;
    // Nincs induló kvíz: az első hullám AZONNAL indul (5.6: 0–10 mp azonnal akció, az első szikla 1 mp-nél).
    q.reset(seed, adaptiveRef.current.band);
    beginWaveSpawning();
    publishHud(true);
    setPhase("play");
  }, [grade, levels.level, clearPendingTimeouts, releaseControls, seedBase, q, beginWaveSpawning]);

  /**
   * A menet vége (győzelem / vereség / „Kör vége”): a kérdés lezárul (a nyitott kérdés „aborted”, nem hiba és nem ismétlés),
   * az eredmény a director VALÓS statisztikájából jön (a régi „leszedett ellenfél ≈ helyes válasz” közelítés megszűnt).
   */
  const endRun = useCallback((won: boolean, forcedCorrect?: number) => {
    runOverRef.current = true;
    const ctl = qRef.current;
    if (!ctl.finished()) ctl.finish();
    const clock = driverRef.current?.clockMs() ?? 0;
    const totals = questionTotals(ctl.director?.stats(clock));
    const correct = Math.max(totals.correct, forcedCorrect ?? 0);
    const total = Math.max(correct, totals.total);
    runTotalsRef.current = { correct, wrong: Math.max(0, total - correct), total, seconds: Math.round(clock / 1000) };
    setQuizCorrect(correct);
    setQuizTotal(total);
    setFeedback(null);
    setExpanded(false);
    setGameWon(won);
    publishHud(true);
    setPhase("over");
  }, []);

  /* ============== „Miért?”: szünet + a valódi magyarázókártya ============== */

  const openWhy = useCallback(() => {
    const item = qRef.current.view().whyItem;
    if (!item) return;
    setFeedback(
      buildFeedback({
        quiz: item.quiz,
        chosenIndex: item.pickedOriginalIndex,
        // Egyetlen próbálkozás van (a megoldás mutatása utáni újrapróba megszűnt — terv 5.6, J-SA).
        attempt: 1,
        ageBand: "kid",
      }),
    );
  }, []);
  const closeWhy = useCallback(() => setFeedback(null), []);

  /* ============== Kristály-válasz ============== */

  /** A kristályok DOM-gombja / billentyű (1–4): a válasz a kristály „kilövése” — csak játék közben, nem szünetben. */
  const onAnswer = (idx: number) => {
    // K1: szünetben (és a „Miért?” alatt) nincs válasz — a billentyűs út ellen is védünk.
    if (phaseRef.current !== "play" || pausedRef.current) return;
    qRef.current.pick(idx, driverRef.current?.clockMs());
  };

  /** A válasz következménye a játékvilágban (≤ 2 s, K.4/23): fejlesztés (jó) vagy hasadás (rossz). */
  const onCrystalOutcome = (result: "correct" | "wrong" | "timeout", crystal: Crystal | null) => {
    const refs = sceneRefs.current;
    const k = motionScale(reducedMotionRef.current).particles;
    if (result === "correct") {
      sfxSuccess();
      haptics("success");
      applyCrystalUpgrade();
      scoreRef.current += 50;
      driverRef.current?.pace.signal("combat");
      if (refs && crystal) {
        burstAt.set(crystal.x, crystal.y, 0.3);
        refs.sparkles.emit(burstAt, { count: Math.round(56 * k), color: "#ffe27a", speed: 7, life: 0.8, size: 0.32 });
        refs.sparkles.emit(burstAt, { count: Math.round(18 * k), color: "#ffffff", speed: 3, life: 0.4, size: 0.5 });
        spawnShockwave(crystal.x, crystal.y, CRYSTAL_RADIUS, "#ffe27a");
      }
      markHud();
      return;
    }
    sfxError();
    haptics("error");
    // M9: csökkentett mozgásnál nincs rázás (a narancs keret és a „Miért?” jelez).
    if (!reducedMotionRef.current) {
      setWrongShake(true);
      pushRunTimeout(() => setWrongShake(false), 320);
    }
    driverRef.current?.pace.signal("wrong");
    // A rossz kristály 3 apró sziklára hasad (a hajó felé hullnak) — veszély, nem menetvég. Lejáratnál nem hasad semmi.
    if (result === "wrong" && crystal) {
      if (refs) {
        burstAt.set(crystal.x, crystal.y, 0.3);
        refs.sparkles.emit(burstAt, { count: Math.round(30 * k), color: "#ff9f43", speed: 5, life: 0.6, size: 0.28 });
        spawnShockwave(crystal.x, crystal.y, CRYSTAL_RADIUS, "#ff9f43");
      }
      for (const s of crystalShards({ x: crystal.x, y: crystal.y }, runRngRef.current.world.next)) addShardRock(s);
    }
    markHud();
  };

  /* ============== teszt-kampó (K.2) ============== */
  useEffect(() => {
    return installGameTestApi({
      probe: () => {
        const ctl = qRef.current;
        const driver = driverRef.current;
        const clock = driver?.clockMs() ?? 0;
        const st = ctl.director?.stats(clock);
        const band = ctl.director?.band() ?? adaptiveRef.current.band;
        const view = ctl.view();
        return {
          simTime: driver?.loop.simTimeMs() ?? 0,
          questionOpen: ctl.active() ? 1 : 0,
          questionsAnswered: st?.answered ?? 0,
          questionsCorrect: st?.correct ?? 0,
          fps: fpsRef.current,
          band,
          intensity: ctl.director?.intensity() ?? null,
          level: runLevelRef.current,
          spawnFactor: 1.4 - band * 0.6,
          questionId: view.presentation?.id ?? null,
          reveal: view.reveal ? 1 : 0,
          wave: waveRef.current,
          lives: livesRef.current,
          score: scoreRef.current,
          crystals: crystalsRef.current.filter((c) => c.alive).length,
          enemies: enemiesRef.current.length,
          paused: pausedRef.current ? 1 : 0,
          over: runOverRef.current ? 1 : 0,
          clock,
          // A főellenfél hulláma (9.) és a kapuk hiánya: a hullám-váltás a `waveChanges`-ben látszik.
          waveChanges: waveChangesRef.current,
          invuln: playerRef.current.invuln,
          // K.4/2, K.4/7: rajzolási hívások és GPU-memória (a menet alatt nem nőhet: minden elem poolból / törléskor eldobva).
          drawCalls: sceneRefs.current?.renderer.info.render.calls ?? null,
          geometries: sceneRefs.current?.renderer.info.memory.geometries ?? null,
          textures: sceneRefs.current?.renderer.info.memory.textures ?? null,
        };
      },
      forceState: (patch) => {
        if (patch.phase === "intro" || patch.phase === "grade") {
          setPaused(false);
          setPhase(patch.phase);
        }
        // `phase: "play"`: a futó menet marad; ha nem fut, új menet indul (a régi „csak fázist vált” viselkedés helyett,
        // mert a játék a meghajtó nélkül nem fut).
        if (patch.phase === "play" && phaseRef.current !== "play") startNewRun();
        // `phase: "quiz"` a `question: true` kompatibilis álneve (terv 9.): azonnal nyit egy kérdést.
        if (patch.question || patch.phase === "quiz") {
          setPaused(false);
          qRef.current.request("trigger", driverRef.current?.clockMs() ?? 0);
        }
        if (typeof patch.gameWon === "boolean") setGameWon(patch.gameWon);
        if (typeof patch.correctCount === "number") {
          const n = Math.max(0, patch.correctCount);
          scoreRef.current = n * 10;
          waveRef.current = WAVE_COUNT;
          markHud();
        }
        if (patch.phase === "over") endRun(patch.gameWon === true, typeof patch.correctCount === "number" ? Math.max(0, patch.correctCount) : undefined);
      },
    });
  }, [endRun, startNewRun]);

  /* ============== Three.js inicializálás ============== */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const tier = detectLookTier();
    const budget = LOOK_BUDGET[tier];
    // KSZ-8: a közös renderer-gyár (pixelarány a tier plafonján, ACES, sRGB); WebGL nélkül nincs jelenet (a menü működik).
    const renderer = createGameRenderer(canvas, tier, { exposure: 0.95, shadows: false });
    if (!renderer) return;
    renderer.setClearColor("#02041a");
    // K.4/7: a WebGL-környezet elvesztése → szünet + „Grafika újraindítása” gomb (új vászon + új renderer).
    const onContextLost = (e: Event) => {
      e.preventDefault();
      setGfxLost(true);
      pausedRef.current = true;
      setPaused(true);
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#050a2a", 0.012);
    // Studio reflections make the metal hulls and crystals read as toys, not flat paint.
    const environment = budget.environment ? createRoomEnvironment(renderer) : null;
    if (environment) {
      scene.environment = environment.texture;
      scene.environmentIntensity = 0.3;
    }

    // G-12: a kameraállás a fizika-modulból jön, mert teszt őrzi, hogy a
    // játékos teljes mozgássávja a képen belül maradjon. A korábbi értékekkel
    // (y=-2.5, lookAt 1.5) a hajó kiinduló helye a képernyő alsó éle ALATT volt.
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 1, 0.1, 100);
    camera.position.set(0, CAMERA_Y, CAMERA_Z);
    camera.lookAt(0, CAMERA_LOOK_Y, 0);

    // Fények: hideg-meleg ég/talaj félgömb, erős kulcsfény elölről-fentről,
    // és két színes peremfény HÁTULRÓL — ettől kap minden test neon kontúrt
    // a sötét háttér előtt (a gyerekszem ezt olvassa „3D"-nek).
    scene.add(new THREE.AmbientLight("#8fb8ff", 0.18));
    scene.add(new THREE.HemisphereLight("#a9e4ff", "#3b1052", 0.55));
    const key = new THREE.DirectionalLight("#fff6e8", 1.35);
    key.position.set(5, 9, 12);
    scene.add(key);
    const rimL = new THREE.DirectionalLight("#ff4fd8", 1.6);
    rimL.position.set(-10, 6, -8);
    scene.add(rimL);
    const rimR = new THREE.DirectionalLight("#27e6ff", 1.5);
    rimR.position.set(10, -4, -8);
    scene.add(rimR);
    const accentL = new THREE.PointLight("#ff00ff", 14, 28, 1.6);
    accentL.position.set(-9, 4, 6);
    scene.add(accentL);
    const accentR = new THREE.PointLight("#00f0ff", 14, 28, 1.6);
    accentR.position.set(9, -4, 6);
    scene.add(accentR);
    // Lokális flash light, amit ütközéskor felvillantunk
    const flashLight = new THREE.PointLight("#fff700", 0, 14);
    flashLight.position.set(0, 0, 4);
    scene.add(flashLight);

    // Csillagmező — apró, sűrű réteg (ezt görgeti a starScrollY) + kevés,
    // nagy fényes csillag lassabban: a két sebesség adja a mélységet.
    const starCount = Math.round(1500 * Math.max(0.6, budget.particleScale));
    const starfield = buildStarLayer(starCount, GAME_W * 2.2, GAME_H * 2.2, 2, 16, 0.16);
    scene.add(starfield);
    const brightStars = buildStarLayer(Math.round(90 * Math.max(0.6, budget.particleScale)), GAME_W * 2.6, GAME_H * 2.6, 6, 14, 0.55);
    scene.add(brightStars);

    // Élő, gomolygó nebula (fbm-shader) a teljes háttérben.
    const nebula = buildNebula(GAME_W * 4.2, GAME_H * 3.4, tier);
    nebula.position.set(0, CAMERA_LOOK_Y, -18);
    scene.add(nebula);

    // Távoli gyűrűs gázóriás a jobb felső sarokban — a játéktér szélén, hogy ne zavarjon.
    const planet = buildPlanet(2.3);
    planet.position.set(GAME_W * 0.5, GAME_H * 0.42, -14);
    scene.add(planet);

    // Szikrák: hajtómű-csóva, robbanás, találat — egyetlen rajzhívás.
    const sparkles = new SparkleField(scene, Math.round(900 * budget.particleScale) + 120);
    const bulletGlow = {
      player: new THREE.SpriteMaterial({ map: glowTexture(), color: "#fff36b", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
      enemy: new THREE.SpriteMaterial({ map: glowTexture(), color: "#ff4d7a", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    };

    // Játékos hajó
    const playerGroup = buildPlayerShip();
    scene.add(playerGroup);

    // Thruster (kis cone hajó alatt, animáljuk amplitúdóval)
    const thrusterMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.6, 6),
      new THREE.MeshStandardMaterial({ color: "#fff700", emissive: "#fff700", emissiveIntensity: 1.6, transparent: true, opacity: 0.85 }),
    );
    thrusterMesh.rotation.x = Math.PI;
    thrusterMesh.position.set(0, -1.0, 0.06);
    playerGroup.add(thrusterMesh);
    // Izzó udvar a hajtómű körül — bloom nélkül (low/medium) is ragyog.
    const thrusterGlow = createGlowSprite("#ffb43f", 1.5, 0.55);
    thrusterGlow.position.set(0, -1.05, 0.1);
    playerGroup.add(thrusterGlow);

    // Pajzs gyűrű (csak power esetén látható)
    const shieldMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.045, 8, 32),
      new THREE.MeshBasicMaterial({ color: "#fff700", transparent: true, opacity: 0.7 }),
    );
    shieldMesh.rotation.x = Math.PI / 2;
    shieldMesh.visible = false;
    playerGroup.add(shieldMesh);

    // Második (kék) pajzsgyűrű — a "shield" pickup aktív állapotát jelzi
    // (külön a sárga power-pajzstól, hogy egyszerre is működhet a kettő).
    const shieldFullMesh = new THREE.Mesh(
      new THREE.TorusGeometry(1.18, 0.075, 10, 36),
      new THREE.MeshBasicMaterial({ color: "#3aa1ff", transparent: true, opacity: 0.75 }),
    );
    shieldFullMesh.rotation.x = Math.PI / 2;
    shieldFullMesh.visible = false;
    playerGroup.add(shieldFullMesh);

    // Csoportok ellenfelekhez / lövedékekhez / pickupokhoz
    const enemiesGroup = new THREE.Group();
    scene.add(enemiesGroup);
    const bulletsGroup = new THREE.Group();
    scene.add(bulletsGroup);
    const pickupsGroup = new THREE.Group();
    scene.add(pickupsGroup);
    const fxGroup = new THREE.Group();
    scene.add(fxGroup);
    // J6a: a kérdés-kristályok meshei egyszer, előre (KSZ-6: pool; a nem látszó elem `visible = false`).
    const answerMeshes: THREE.Group[] = [];
    for (let i = 0; i < 4; i++) {
      const m = buildAnswerCrystalMesh();
      m.visible = false;
      scene.add(m);
      answerMeshes.push(m);
    }

    // Shader-előmelegítés (K.4/8): minden ellenfél- / pickup-anyag egyszer lefordul a MENÜ alatt (a jelenet a lap betöltésekor
    // épül), nem az első megjelenéskor játék közben — a 4×-es CPU-lassításon az első-használati fordítások 50–130 ms-os
    // hosszú feladatok voltak. Aszinkron fordítás (`compileAsync`): az előmelegítő elemeket a fordítás VÉGÉN töröljük (a
    // fordítás közbeni törlés `GL_INVALID_VALUE` figyelmeztetést ad). A csoport a kamera mögött áll, a rajzban nem látszik.
    let sceneDisposed = false;
    {
      const warm = new THREE.Group();
      warm.position.set(0, 0, -400);
      scene.add(warm);
      for (const m of [
        buildRockMesh(3), buildRockMesh(2), buildRockMesh(1), buildCrystalMesh(), buildAlienMesh(), buildFighterMesh(), buildBossMesh(),
        buildLifePickupMesh(), buildShieldPickupMesh(), buildBombPickupMesh(), buildPowerPickupMesh(),
      ]) warm.add(m);
      const cleanup = () => {
        if (sceneDisposed) return;
        warm.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            for (const mat of Array.isArray(o.material) ? o.material : [o.material]) mat.dispose();
          } else if (o instanceof THREE.Sprite) {
            o.material.dispose(); // a közös izzás-textúra marad (a `glowTexture()` gyorsítótárból él)
          }
        });
        scene.remove(warm);
      };
      void renderer.compileAsync(scene, camera).then(cleanup, cleanup);
    }

    const postFx = createPostFx(renderer, scene, camera, tier, { strength: 0.7, radius: 0.45, threshold: 0.86 });

    sceneRefs.current = {
      scene, camera, renderer, starfield, nebula, playerGroup, thrusterMesh, shieldMesh, shieldFullMesh,
      brightStars, planet, postFx, sparkles, thrusterGlow, bulletGlow,
      reducedParticles: budget.particleScale,
      enemiesGroup, bulletsGroup, pickupsGroup, fxGroup, answerMeshes,
      enemyMeshById: new Map(),
      bulletMeshById: new Map(),
      pickupMeshById: new Map(),
      flashLight,
    };

    /* ===================== Resize ===================== */
    const handleResize = () => {
      if (!canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      renderer.setSize(w, h, false);
      postFx.setSize(w, h);
      sparkles.setViewportHeight(h * renderer.getPixelRatio(), CAMERA_FOV_DEG);
      camera.aspect = w / h;
      // S10: fekvő telefonon a vászon sokkal szélesebb, mint álló nézetben — a háttérköd síkja (z = −18) a két
      // szélén véget ért, sötét trapéz látszott. A sík vízszintesen annyira nyúlik, hogy a látómezőt kitöltse.
      const nebulaDist = camera.position.z + 18;
      const needW = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * nebulaDist * camera.aspect * 1.25;
      nebula.scale.x = Math.max(1, needW / (GAME_W * 4.2));
      // A játéksík a z=0 körül van, a kamera z=22-nél áll.
      playerXLimitRef.current = playerXLimit(
        visibleHalfWidth(camera.fov, camera.aspect, camera.position.z),
      );
      camera.updateProjectionMatrix();
    };
    handleResize();
    const ro = new ResizeObserver(handleResize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener("resize", handleResize);

    /* ===================== Render loop ===================== */
    // FONTOS: ref-eken keresztül hívjuk a tick/render-t, NEM közvetlen
    // closure-ből. A mount-kori closure befagyasztaná a quiz-pool-t
    // (pickQuiz → quizPool) és minden későbbi logika-frissítést — az async
    // betöltött tananyag-kvízeket a játék sosem látná.
    const loop = (t: number) => {
      const last = lastTimeRef.current;
      lastTimeRef.current = t;
      // A valós képkocka-idő (ms, legfeljebb 50): a meghajtó ebből fix 1/60 s-os lépéseket gyárt (KSZ-4); a rajz a valós
      // időt használja (csillagok, részecskék).
      const realDt = last == null ? 0 : Math.min(50, t - last);
      lastDtRef.current = realDt / 1000;
      if (realDt > 0) fpsRef.current = fpsRef.current * 0.9 + (1000 / realDt) * 0.1;
      const driver = driverRef.current;
      if (driver && phaseRef.current === "play") driver.frame(realDt, pausedRef.current);
      renderRef.current(t / 1000);
      publishHud();

      rafRef.current = requestGameFrame(loop);
    };
    // #58: `requestGameFrame` — a lejárt kupon alatt a képkocka-hurok áll (a sim a szünet-úton áll, a render is).
    rafRef.current = requestGameFrame(loop);

    return () => {
      sceneDisposed = true;
      cancelGameFrame(rafRef.current);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      window.removeEventListener("resize", handleResize);
      ro.disconnect();
      // Dispose minden mesh / material / texture (a közös glow-textúra kivételével)
      sparkles.dispose();
      const shared = glowTexture();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Sprite) {
          if (!(obj instanceof THREE.Sprite)) obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            if (m.map && m.map !== shared) m.map.dispose();
            m.dispose();
          });
        }
      });
      bulletGlow.player.dispose();
      bulletGlow.enemy.dispose();
      environment?.dispose();
      postFx.dispose();
      renderer.dispose();
      shockwavesRef.current = [];
      sceneRefs.current = null;
    };
  }, [sceneEpoch]);

  /* ===================== Tick (game logic) ===================== */
  const tick = (dt: number) => {
    if (phaseRef.current !== "play" || pausedRef.current) {
      // Szünet / „Miért?” alatt nincs játéklogika (a meghajtó ilyenkor nem is lépteti). A csillagmezőt a render()
      // animálja (egy helyen — korábban itt IS futott, ami dupla-sebességet okozott).
      void dt;
      return;
    }
    const p = playerRef.current;
    if (!p.alive) return;

    // Játékos mozgás — tehetetlenség + átló-normalizálás (physics.ts)
    // Joystick-reakció (#49): a tárcsa analóg (kis kitérés = lassú, finom mozgás); a billentyű digitális.
    let mx = stickRef.current.x, my = stickRef.current.y;
    if (keysRef.current.left || touchRef.current.left) mx -= 1;
    if (keysRef.current.right || touchRef.current.right) mx += 1;
    if (keysRef.current.up || touchRef.current.up) my += 1;
    if (keysRef.current.down || touchRef.current.down) my -= 1;
    // G-11: a vízszintes határ a KAMERÁBÓL jön, nem konstansból. Álló telefonon
    // a látható sáv keskenyebb a 18 egységes pályánál, ezért a hajó a pályán
    // belül maradva is kicsúszott a képből (mérve: Pixel 7, jobb szél, félig).
    const integrated = integratePlayer(p, { mx, my }, dt, playerXLimitRef.current);
    p.x = integrated.x;
    p.y = integrated.y;
    p.vx = integrated.vx;
    p.vy = integrated.vy;
    p.bobPhase = integrated.bobPhase;
    if (p.cooldown > 0) p.cooldown -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    // Pajzs- és erő-időzítő, a „HULLÁM n” felirat: játékidőben (szünetben és a „Miért?” alatt a meghajtó nem lép, ezért áll);
    // a HUD-pillanatkép (≤ 10 Hz) másodpercenként egyszer kap új értéket (KSZ-9).
    if (shieldTimerRef.current > 0) {
      const before = Math.ceil(shieldTimerRef.current);
      shieldTimerRef.current = Math.max(0, shieldTimerRef.current - dt);
      if (Math.ceil(shieldTimerRef.current) !== before) markHud();
    }
    if (powerTimerRef.current > 0) {
      const before = Math.ceil(powerTimerRef.current);
      powerTimerRef.current = Math.max(0, powerTimerRef.current - dt);
      if (powerTimerRef.current <= 0) powerLevelRef.current = 0;
      if (Math.ceil(powerTimerRef.current) !== before) markHud();
    }
    if (bannerLeftRef.current > 0) {
      bannerLeftRef.current = Math.max(0, bannerLeftRef.current - dt);
      if (bannerLeftRef.current === 0) markHud();
    }
    if (gameElapsedRef.current < HINT_SEC && gameElapsedRef.current + dt >= HINT_SEC) markHud();

    // Lövés
    if ((keysRef.current.fire || touchRef.current.fire) && p.cooldown <= 0) {
      const cd = powerLevelRef.current >= 2 ? BULLET_TRIPLE_COOLDOWN : BULLET_COOLDOWN;
      p.cooldown = cd;
      const id = nextEntityIdRef.current++;
      // S10 / terv 4.6/6: célzássegéd CSAK érintéses tüzelésnél (érintős eszközön a tűzgomb); billentyűzetnél a
      // lövés változatlanul egyenesen felfelé megy.
      const touchAssist = touchRef.current.fire && touchCapableRef.current;
      const centerVx = touchAssist
        ? aimAssistVx({ x: p.x, y: p.y }, enemiesRef.current.map((e) => ({ x: e.x, y: e.y, alive: !e.dead })))
        : 0;
      bulletsRef.current.push({ id, x: p.x, y: p.y + 0.7, vx: centerVx, vy: BULLET_SPEED, life: 1.6, fromEnemy: false });
      if (powerLevelRef.current >= 1) {
        bulletsRef.current.push({ id: nextEntityIdRef.current++, x: p.x - 0.45, y: p.y + 0.5, vx: centerVx - 3.0, vy: BULLET_SPEED * 0.96, life: 1.6, fromEnemy: false });
        bulletsRef.current.push({ id: nextEntityIdRef.current++, x: p.x + 0.45, y: p.y + 0.5, vx: centerVx + 3.0, vy: BULLET_SPEED * 0.96, life: 1.6, fromEnemy: false });
      }
      sfxShoot();
    }

    // Lövedékek frissítése
    for (const b of bulletsRef.current) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.y > GAME_H / 2 + 1 || b.y < -GAME_H / 2 - 1 || Math.abs(b.x) > GAME_W / 2 + 1) b.life = 0;
    }

    // Kérdés-kristályok (J6a): lassú lebegés; a játékos lövedéke a kristályt „kilövi” — ez a válasz. A célzássegéd
    // (`aimAssistVx`) csak az ellenfeleket kapja: a kristály kiválasztása a játékosé (U-J6-1).
    const crystals = crystalsRef.current;
    if (crystals.length > 0) {
      stepCrystals(crystals, dt);
      if (qRef.current.active()) {
        for (const b of bulletsRef.current) {
          if (b.life <= 0 || b.fromEnemy) continue;
          const c = crystalAt(crystals, b.x, b.y);
          if (c) {
            b.life = 0;
            onAnswer(c.optionIndex);
            break;
          }
        }
      } else if (!qRef.current.view().presentation) {
        // a kérdés és a megoldás-kijelzés lezárult: a kristályok eltűnnek
        crystalsRef.current = [];
      }
    }

    gameElapsedRef.current += dt;

    // Spawn logika a hullámon belül — elapsed óra, nem fali idő (kvíz alatt áll)
    if (!waveIntermissionRef.current && enemiesSpawnedThisWaveRef.current < enemiesPerWaveRef.current) {
      const spawnInterval = waveSpawnInterval(waveRef.current, qRef.current.director?.band() ?? adaptiveRef.current.band);
      const emptyField = enemiesRef.current.length === 0;
      if (spawnReady({
        elapsed: gameElapsedRef.current,
        lastSpawnAt: lastSpawnAtRef.current,
        interval: spawnInterval,
        emptyField,
      })) {
        spawnEnemyForWave();
        lastSpawnAtRef.current = gameElapsedRef.current;
      }
    }

    // Ellenfelek frissítése
    for (const e of enemiesRef.current) {
      if (e.dead) continue;
      e.phase += dt;
      e.rot += e.rotSpeed * dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.kind === "alien") {
        // Sin-mozgás X-en, lassú lefelé süllyedés
        e.x += Math.sin(e.phase * 1.6) * 1.6 * dt;
        e.y += e.vy * dt;
      } else if (e.kind === "fighter") {
        // Cél felé húzás (homing-light): X felé közelít a játékoshoz
        const dx = playerRef.current.x - e.x;
        e.vx += clamp(dx * 0.4, -1.5, 1.5) * dt;
        e.vx = clamp(e.vx, -3.5, 3.5);
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.fireCooldown -= dt;
        if (e.fireCooldown <= 0 && e.y > -GAME_H / 2 + 5) {
          e.fireCooldown = randRange(runRngRef.current.world.next, 1.4, 2.2);
          // Lövedék a játékos felé
          const dxh = playerRef.current.x - e.x;
          const dyh = playerRef.current.y - e.y;
          const len = Math.max(0.1, Math.hypot(dxh, dyh));
          bulletsRef.current.push({
            id: nextEntityIdRef.current++,
            x: e.x, y: e.y - 0.5,
            vx: (dxh / len) * 7,
            vy: (dyh / len) * 7,
            life: 2.5,
            fromEnemy: true,
          });
        }
      } else if (e.kind === "boss") {
        // Boss AI — 3 fázis. e.phase = total elapsed time, NEM ütközés-számláló.
        // Fázis-számítás: a maradék HP alapján.
        const remaining = e.hp;
        const bossPhase =
          remaining > BOSS_TOTAL_HP - BOSS_PHASE_HP[0]
            ? 0
            : remaining > BOSS_TOTAL_HP - BOSS_PHASE_HP[0] - BOSS_PHASE_HP[1]
              ? 1
              : 2;
        // Sin-mozgás X-en, fázissal arányos amplitúdóval és frekvenciával
        const ampX = 4 + bossPhase * 1.5;
        const freq = 0.7 + bossPhase * 0.5;
        e.x = Math.sin(e.phase * freq) * ampX;
        // Lassú lefelé süllyedés, de stabil "fight zone" magasságon megáll
        const targetY = GAME_H / 2 - 3.5;
        if (e.y > targetY) e.y += e.vy * dt;
        else e.y = targetY;
        // Spread-lövés frekvencia fázisszerint
        const fireInterval = bossPhase === 0 ? 2.5 : bossPhase === 1 ? 1.5 : 1.0;
        e.fireCooldown -= dt;
        if (e.fireCooldown <= 0) {
          e.fireCooldown = fireInterval;
          // 3-irányú spread + fázis 2-ben +2 további szórt lövés
          const angles = bossPhase === 2
            ? [-0.6, -0.3, 0, 0.3, 0.6]
            : bossPhase === 1
              ? [-0.4, 0, 0.4]
              : [0];
          for (const ang of angles) {
            const dxh = playerRef.current.x - e.x + Math.sin(ang) * 6;
            const dyh = playerRef.current.y - e.y;
            const len = Math.max(0.1, Math.hypot(dxh, dyh));
            bulletsRef.current.push({
              id: nextEntityIdRef.current++,
              x: e.x,
              y: e.y - 1.2,
              vx: (dxh / len) * 6,
              vy: (dyh / len) * 6,
              life: 3.0,
              fromEnemy: true,
            });
          }
        }
      } else {
        // rock + crystal: lefelé sodródik az init vy + vx-szel
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      }

      // X-tengely határ — visszapattan
      if (e.x < -GAME_W / 2 + 0.6) { e.x = -GAME_W / 2 + 0.6; e.vx = Math.abs(e.vx); }
      if (e.x >  GAME_W / 2 - 0.6) { e.x =  GAME_W / 2 - 0.6; e.vx = -Math.abs(e.vx); }

      // Játéktér aljáról kifutás → büntetés (pont/komboresete)
      if (e.y < -GAME_H / 2 - 1.2) {
        e.dead = true;
        comboRef.current = 0;
        markHud();
      }
    }

    // Lövedék × ellenfél ütközés
    for (const e of enemiesRef.current) {
      if (e.dead) continue;
      const radius = enemyRadius(e);
      for (const b of bulletsRef.current) {
        if (b.life <= 0 || b.fromEnemy) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        if (dx * dx + dy * dy < radius * radius) {
          b.life = 0;
          e.flash = 0.12;
          e.hp -= 1;
          if (e.hp <= 0) {
            sfxExplode();
            haptics("hit");
            handleEnemyDestroyed(e);
          } else {
            sfxHit();
            haptics("hit");
            // Találati szikra a becsapódás helyén — a több HP-s célnál is látszik, hogy talált.
            const refs = sceneRefs.current;
            if (refs) {
              burstAt.set(b.x, b.y + 0.2, 0.3);
              refs.sparkles.emit(burstAt, {
                count: Math.max(3, Math.round(10 * refs.reducedParticles * motionScale(reducedMotionRef.current).particles)),
                color: EXPLOSION_COLORS[e.kind],
                speed: 3.5,
                life: 0.3,
                size: 0.22,
              });
            }
          }
          break;
        }
      }
    }

    // Közeli veszély → a mini-Director intenzitása nő (a kérdés a nyugodt pillanatot részesíti előnyben, KSZ-15).
    for (const e of enemiesRef.current) {
      if (e.dead || e.kind === "boss") continue;
      if (e.y > p.y && e.y - p.y < 4.5 && Math.abs(e.x - p.x) < 3) {
        driverRef.current?.pace.signal("nearThreat", dt);
        break;
      }
    }

    // Ellenfél × játékos ütközés (vagy ellenséges lövedék × játékos)
    // Pajzs aktív → minden ütközés blokkolva (mintha invuln lenne)
    if (p.invuln <= 0 && shieldTimerRef.current <= 0) {
      for (const e of enemiesRef.current) {
        if (e.dead) continue;
        const radius = enemyRadius(e) + 0.55;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        if (dx * dx + dy * dy < radius * radius) {
          handleHit(e);
          return; // a találat a lépés végét jelenti (a 2 mp sérthetetlenség a következő lépéstől védi a hajót)
        }
      }
      for (const b of bulletsRef.current) {
        if (!b.fromEnemy || b.life <= 0) continue;
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        if (dx * dx + dy * dy < 0.7 * 0.7) {
          b.life = 0;
          handleHit(null);
          return;
        }
      }
    }

    // Pickupok frissítése
    for (const pu of pickupsRef.current) {
      pu.y += pu.vy * dt;
      pu.rot += dt * 2.5;
      pu.life -= dt;
      if (pu.y < -GAME_H / 2 - 1) pu.life = 0;
      // Játékos felveszi
      const dx = pu.x - p.x;
      const dy = pu.y - p.y;
      if (pu.life > 0 && dx * dx + dy * dy < 1.1 * 1.1) {
        pu.life = 0;
        applyPickup(pu);
      }
    }

    // Takarítás
    enemiesRef.current = enemiesRef.current.filter((e) => !e.dead);
    bulletsRef.current = bulletsRef.current.filter((b) => b.life > 0);
    pickupsRef.current = pickupsRef.current.filter((pu) => pu.life > 0);

    // Hullám-vége detektálás. Boss legyőzésekor a handleEnemyDestroyed boss-ága
    // kezeli a győzelem-átmenetet (1.5s effekt-késleltetéssel) — itt NEM duplázzuk.
    if (
      !bossDefeatedRef.current &&
      !waveIntermissionRef.current &&
      enemiesSpawnedThisWaveRef.current >= enemiesPerWaveRef.current &&
      enemiesRef.current.length === 0
    ) {
      waveIntermissionRef.current = true;
      const newWave = waveRef.current + 1;
      if (newWave > BOSS_FINAL_WAVE) {
        // Győzelem (elvileg ide csak akkor jutunk, ha a boss-ág nem futott le)
        endRun(true);
        return;
      }
      // J6a: nincs hullám-kapu — a hullám AZONNAL vált, a „HULLÁM n” felirat 2 mp-ig látszik; a hullám-bónusz teljesítményhez
      // kötött és determinisztikus (a régi „+50 a jó induló kvízért” helyett).
      waveRef.current = newWave;
      waveChangesRef.current += 1;
      scoreRef.current += 50;
      sfxLevelUp();
      beginWaveSpawning();
    }

    // Boss HP-szinkron a HUD-hoz
    const boss = enemiesRef.current.find((e) => !e.dead && e.kind === "boss");
    if (boss) {
      if (bossHpRef.current !== boss.hp) {
        bossHpRef.current = boss.hp;
        markHud();
      }
    } else if (bossHpRef.current !== null) {
      bossHpRef.current = null;
      markHud();
    }
  };

  /** Enemy radius (kollizációhoz). */
  const enemyRadius = (e: EnemyState): number => {
    if (e.kind === "rock") return e.size === 3 ? 1.25 : e.size === 2 ? 0.8 : 0.5;
    if (e.kind === "crystal") return 0.72;
    if (e.kind === "alien") return 0.85;
    if (e.kind === "boss") return 2.0;
    return 0.62; // fighter
  };

  /**
   * Boss spawn — a 12. hullám elején. Egyetlen, hatalmas alien anyahajó
   * 90 HP-vel, 3 fázisban különböző AI-vel:
   *   - Fázis 0 (50 HP): lassú sin-mozgás, lassú spread-lövés (1/2.5s)
   *   - Fázis 1 (25 HP): közepes sebesség, gyorsabb lövés (1/1.5s)
   *   - Fázis 2 (15 HP): gyors mozgás, gyakori spread-lövés (1/1.0s)
   *
   * A 12. hullám az alap-spawn helyett egyetlen bosst tartalmaz —
   * a `enemiesPerWaveRef = 1` és `spawnEnemyForWave()` boss-mesh-t pakol.
   */
  const spawnBoss = () => {
    enemiesSpawnedThisWaveRef.current += 1;
    const id = nextEntityIdRef.current++;
    const e: EnemyState = {
      id,
      kind: "boss",
      size: 3, // dummy, nem használjuk boss esetén
      x: 0,
      y: GAME_H / 2 - 0.5, // a játéktér tetején spawnol
      vx: 0,
      vy: -0.18, // lassan ereszkedik
      rot: 0,
      rotSpeed: 0.4,
      hp: BOSS_TOTAL_HP,
      flash: 0,
      dead: false,
      spawnAt: (lastTimeRef.current ?? 0) / 1000,
      phase: 0,
      fireCooldown: 1.5, // pre-fight pause
    };
    enemiesRef.current.push(e);
    // A főellenfél érkezése: figyelmeztető hang (a ≥ 600 ms-os előjelzés a lassú ereszkedés + az első lövés 1,5 mp-es késleltetése).
    sfxWarning();
    const refs = sceneRefs.current;
    if (refs) {
      const mesh = buildBossMesh();
      mesh.position.set(e.x, e.y, 0);
      refs.enemiesGroup.add(mesh);
      refs.enemyMeshById.set(id, mesh);
    }
  };

  /** Egy ellenfél a jelenethez (építés a fajta szerint): a spawn és a render (újraindított jelenet) is ezt hívja. */
  const makeEnemyMesh = (e: EnemyState): THREE.Object3D => {
    if (e.kind === "boss") return buildBossMesh();
    if (e.kind === "rock") return buildRockMesh(e.size);
    if (e.kind === "crystal") return buildCrystalMesh();
    if (e.kind === "alien") return buildAlienMesh();
    return buildFighterMesh();
  };

  /** Hullám-spawn: a hullámszámmal súlyozottan vegyíti az ellenfél-típusokat (a képlet a `physics.ts`-ben, a szimulációval közös). */
  const spawnEnemyForWave = () => {
    const rng = runRngRef.current.world.next;
    // Boss-pálya: a 9. hullám első spawn = boss, utána semmi
    if (waveRef.current === BOSS_FINAL_WAVE) {
      if (enemiesSpawnedThisWaveRef.current === 0) {
        spawnBoss();
      }
      return;
    }
    enemiesSpawnedThisWaveRef.current += 1;
    markHud();
    const w = waveRef.current;
    // Minden hullámmal több crystal/alien/fighter — első hullámban főleg sziklák.
    const kind: EnemyKind = pickEnemyKind(w, rng());
    // ha rock → 70% nagy, 25% közepes, 5% kicsi (rendszerint nagy spawnol, és majd hasad)
    const size: 1 | 2 | 3 = kind === "rock" ? pickRockSize(rng()) : 3;
    const id = nextEntityIdRef.current++;
    const x = randRange(rng, -GAME_W / 2 + 1.2, GAME_W / 2 - 1.2);
    const y = randRange(rng, SPAWN_Y_MIN, SPAWN_Y_MAX);
    const baseVy = waveBaseVy(w);
    const e: EnemyState = {
      id, kind, size,
      x, y,
      vx: kind === "fighter" ? 0 : randRange(rng, -0.7, 0.7),
      vy: kind === "alien" ? -0.55 : kind === "fighter" ? -0.85 : baseVy + randRange(rng, -0.4, 0.0) - (3 - size) * 0.25,
      rot: rng() * Math.PI * 2,
      rotSpeed: kind === "rock" || kind === "crystal" ? randRange(rng, -1.4, 1.4) : 0.6,
      hp: enemyHp(kind, size),
      flash: 0,
      dead: false,
      spawnAt: gameElapsedRef.current,
      phase: 0,
      fireCooldown: kind === "fighter" ? randRange(rng, 1.0, 2.0) : 0,
    };
    enemiesRef.current.push(e);
    // Mesh hozzáadása a Three.js scenehez
    const refs = sceneRefs.current;
    if (refs) {
      const mesh = makeEnemyMesh(e);
      mesh.position.set(x, y, 0);
      refs.enemiesGroup.add(mesh);
      refs.enemyMeshById.set(id, mesh);
    }
  };

  /** A rossz kristály hasadéka: egy apró (1-es) szikla a jelenetbe és az ellenfelek közé. */
  const addShardRock = (shard: { x: number; y: number; vx: number; vy: number }) => {
    const rng = runRngRef.current.world.next;
    const e: EnemyState = {
      id: nextEntityIdRef.current++,
      kind: "rock",
      size: 1,
      x: shard.x,
      y: shard.y,
      vx: shard.vx,
      vy: shard.vy,
      rot: rng() * Math.PI * 2,
      rotSpeed: (rng() - 0.5) * 3.6,
      hp: enemyHp("rock", 1),
      flash: 0,
      dead: false,
      spawnAt: gameElapsedRef.current,
      phase: 0,
      fireCooldown: 0,
    };
    enemiesRef.current.push(e);
    const refs = sceneRefs.current;
    if (refs) {
      const mesh = makeEnemyMesh(e);
      mesh.position.set(e.x, e.y, 0);
      refs.enemiesGroup.add(mesh);
      refs.enemyMeshById.set(e.id, mesh);
    }
  };

  /** A képernyőrázás egyetlen útja (KSZ-10): trauma² a közös `feel`-ben (plafon, lecsengés, csökkentett mozgásnál 0). */
  const addTrauma = (amount: number) => {
    driverRef.current?.feel.addTrauma(amount);
  };

  /**
   * A jó kristály-válasz fejlesztése (végrehajtás J6a): az áramlat-intenzitás szerint — alacsonynál PAJZS (a nehézségben lévő
   * játékos védelmet kap), közepesnél HÁRMAS LÖVÉS, magasnál BOMBA. Játékbeli következmény ≤ 2 mp-en belül (K.4/23).
   */
  const applyCrystalUpgrade = () => {
    const intensity = qRef.current.director?.intensity() ?? 0.4;
    if (intensity < 0.34) {
      shieldTimerRef.current = Math.min(20, shieldTimerRef.current + CRYSTAL_SHIELD_SEC);
      setSavedToast("Pajzs!");
    } else if (intensity < 0.67) {
      powerLevelRef.current = 2;
      powerTimerRef.current = POWER_DURATION;
      setSavedToast("Hármas lövés!");
    } else {
      bombsRef.current = Math.min(5, bombsRef.current + 1);
      setSavedToast("Bomba a tárba!");
    }
    pushRunTimeout(() => setSavedToast(null), 1800);
    markHud();
  };

  /**
   * S10 / terv 4.6/6 „látványosabb robbanások”: táguló lökéshullám-gyűrű (additív sprite, 0 → 2,2× sugár
   * 260 ms alatt, átlátszóság 0,8 → 0). Egyszerre legfeljebb 12 él (gyenge eszközön is olcsó: egy négyzet / gyűrű).
   */
  /**
   * S10 / review #426: a győzelmi robbanás utáni eredmény-váltás a futáshoz kötött (`pushRunTimeout`) — újrakezdés
   * vagy kilépés után nem fut le; szünet vagy kvíz alatt nem vált fázist, hanem kivárja a folytatást.
   */
  const finishRunAfter = (ms: number) => {
    pushRunTimeout(() => {
      if (pausedRef.current) {
        finishRunAfter(250);
        return;
      }
      if (phaseRef.current !== "play") return;
      endRun(true);
    }, ms);
  };

  const spawnShockwave = (x: number, y: number, radius: number, color: string) => {
    const refs = sceneRefs.current;
    if (!refs) return;
    const list = shockwavesRef.current;
    if (list.length >= 12) {
      const old = list.shift()!;
      refs.fxGroup.remove(old.sprite);
      old.sprite.material.dispose();
    }
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: shockwaveTexture(),
        color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    sprite.position.set(x, y, 0.4);
    sprite.scale.set(0.001, 0.001, 1);
    refs.fxGroup.add(sprite);
    list.push({ sprite, age: 0, radius });
  };

  /** Aszteroida-megsemmisülés: pont, lehasadás, pickup-szórás. */
  const handleEnemyDestroyed = (e: EnemyState) => {
    e.dead = true;
    comboRef.current = comboRef.current + 1;
    if (comboRef.current > bestComboRef.current) bestComboRef.current = comboRef.current; // D2
    enemiesKilledRef.current += 1;
    if (e.kind === "alien") alienKillsRef.current += 1;
    const baseXp = ENEMY_BASE_XP[e.kind] * (e.kind === "rock" ? e.size : 1);
    const comboBonus = Math.min(20, comboRef.current * 4);
    const total = baseXp + comboBonus;
    scoreRef.current += total;
    markHud();

    // BOSS megsemmisült → játék-győzelem (a 9. hullám, a főellenfél legyőzése)
    if (e.kind === "boss") {
      addTrauma(1);
      const refs = sceneRefs.current;
      if (refs) {
        const k = motionScale(reducedMotionRef.current).particles;
        refs.flashLight.intensity = reducedMotionRef.current ? 4.0 : 8.0;
        burstAt.set(e.x, e.y, 0.3);
        refs.sparkles.emit(burstAt, { count: Math.round(220 * k), color: EXPLOSION_COLORS.boss, speed: 10, life: 1.5, size: 0.45 });
        refs.sparkles.emit(burstAt, { count: Math.round(120 * k), color: "#ff7af5", speed: 6, life: 1.2, size: 0.38 });
        // Lassan hulló, gravitációs törmelék a nagy robbanás után.
        refs.sparkles.emit(burstAt, { count: Math.round(80 * k), color: "#ffd27a", speed: 4, life: 1.8, size: 0.3, gravity: 3 });
      }
      spawnShockwave(e.x, e.y, enemyRadius(e) * 1.4, EXPLOSION_COLORS.boss);
      spawnShockwave(e.x, e.y, enemyRadius(e) * 0.8, "#ff7af5");
      // Hatalmas pickup-shower jutalmul (3 life + 2 power + 1 shield)
      const showerKinds: PickupState["kind"][] = ["life", "life", "life", "power", "power", "shield"];
      for (let k = 0; k < showerKinds.length; k++) {
        const pid = nextEntityIdRef.current++;
        const ang = (k / showerKinds.length) * Math.PI * 2;
        const pu: PickupState = {
          id: pid,
          kind: showerKinds[k]!,
          x: e.x + Math.cos(ang) * 2.5,
          y: e.y + Math.sin(ang) * 1.5,
          vy: -1.0,
          life: 14,
          rot: 0,
        };
        pickupsRef.current.push(pu);
        if (refs) {
          const mesh = pu.kind === "life" ? buildLifePickupMesh()
            : pu.kind === "shield" ? buildShieldPickupMesh()
            : pu.kind === "bomb" ? buildBombPickupMesh()
            : buildPowerPickupMesh();
          mesh.position.set(pu.x, pu.y, 0);
          refs.pickupsGroup.add(mesh);
          refs.pickupMeshById.set(pid, mesh);
        }
      }
      // Boss legyőzve: a flag megakadályozza, hogy a tick hullám-vége ága
      // PÁRHUZAMOSAN (azonnal) over-re váltson — így a 1.5s robbanás-pause
      // ténylegesen lejátszódik a phase-átmenet előtt.
      bossDefeatedRef.current = true;
      // A menet vége: új kérdés nem indul; a nyitott kérdés „aborted” (nem hiba, nem ismétlés).
      runOverRef.current = true;
      setGameWon(true);
      finishRunAfter(1500); // robbanás-effekt ideje
      return;
    }

    // Hasadás csak rock-nál — szétrepülés merőleges kick-kel (physics.ts)
    if (e.kind === "rock" && e.size > 1) {
      const parentSize = e.size as 2 | 3;
      const shards = splitRock(
        { x: e.x, y: e.y, vx: e.vx, vy: e.vy, size: parentSize },
        runRngRef.current.world.next,
      );
      for (const shard of shards) {
        const id = nextEntityIdRef.current++;
        const child: EnemyState = {
          id,
          kind: "rock",
          size: shard.size,
          x: shard.x,
          y: shard.y,
          vx: shard.vx,
          vy: shard.vy,
          rot: runRngRef.current.world.next() * Math.PI * 2,
          rotSpeed: (runRngRef.current.world.next() - 0.5) * 3.6,
          hp: shard.size,
          flash: 0,
          dead: false,
          spawnAt: gameElapsedRef.current,
          phase: 0,
          fireCooldown: 0,
        };
        enemiesRef.current.push(child);
        const refs = sceneRefs.current;
        if (refs) {
          const mesh = buildRockMesh(child.size);
          mesh.position.set(child.x, child.y, 0);
          refs.enemiesGroup.add(mesh);
          refs.enemyMeshById.set(id, mesh);
        }
      }
      // Hasadásnál nem spawnolunk pickupot
    } else {
      // Pickup-esély: kis aszteroida vagy crystal/alien/fighter ölés esetén
      const dropChance = e.kind === "rock" ? 0.18 : e.kind === "crystal" ? 0.32 : e.kind === "alien" ? 0.40 : 0.32;
      if (runRngRef.current.world.next() < dropChance) {
        // 4-féle pickup: 40% life, 30% power, 20% shield, 10% bomb
        const r = runRngRef.current.world.next();
        const kind: PickupState["kind"] =
          r < 0.40 ? "life" : r < 0.70 ? "power" : r < 0.90 ? "shield" : "bomb";
        const pid = nextEntityIdRef.current++;
        const pu: PickupState = {
          id: pid,
          kind,
          x: e.x,
          y: e.y,
          vy: -1.4,
          life: 9,
          rot: 0,
        };
        pickupsRef.current.push(pu);
        const refs = sceneRefs.current;
        if (refs) {
          const mesh = kind === "life" ? buildLifePickupMesh()
            : kind === "shield" ? buildShieldPickupMesh()
            : kind === "bomb" ? buildBombPickupMesh()
            : buildPowerPickupMesh();
          mesh.position.set(pu.x, pu.y, 0);
          refs.pickupsGroup.add(mesh);
          refs.pickupMeshById.set(pid, mesh);
        }
      }
    }
    // Flash light pulzálás + szikra-robbanás a test színében
    const refs = sceneRefs.current;
    if (refs) {
      const k = motionScale(reducedMotionRef.current).particles;
      const big = e.kind === "rock" ? e.size / 3 : e.kind === "fighter" ? 1 : 0.8;
      refs.flashLight.position.set(e.x, e.y, 3);
      refs.flashLight.intensity = reducedMotionRef.current ? 2.0 : 3.5;
      burstAt.set(e.x, e.y, 0.3);
      refs.sparkles.emit(burstAt, {
        count: Math.round(42 * Math.max(0.5, refs.reducedParticles) * k),
        color: EXPLOSION_COLORS[e.kind],
        speed: 6,
        life: 0.85,
        size: 0.3,
      });
      refs.sparkles.emit(burstAt, { count: Math.round(14 * k), color: "#ffffff", speed: 3, life: 0.35, size: 0.5 });
      // Izzó törmelék gravitációval: a robbanás „súlyt” kap, nem csak szétfröccsen.
      refs.sparkles.emit(burstAt, {
        count: Math.round((10 + 14 * big) * Math.max(0.5, refs.reducedParticles) * k),
        color: "#ffb347",
        speed: 3.2,
        life: 1.1,
        size: 0.26,
        gravity: 2.5,
      });
    }
    spawnShockwave(e.x, e.y, enemyRadius(e), EXPLOSION_COLORS[e.kind]);
    addTrauma(0.16);
  };

  /**
   * Ütközés (J6a): −1 élet és 2 mp sérthetetlenség — nincs kvíz, a játék nem áll meg. A mini-Director sérülés-jelzést kap
   * (a kérdés a nyugodt pillanatot részesíti előnyben), a találat rövid hitstoppal és mértékletes rázással jár (KSZ-10).
   */
  const handleHit = (e: EnemyState | null) => {
    haptics("hit");
    if (e) {
      e.dead = true;
      const refs = sceneRefs.current;
      if (refs) {
        refs.flashLight.intensity = reducedMotionRef.current ? 2.5 : 5.5;
        burstAt.set(playerRef.current.x, playerRef.current.y, 0.3);
        refs.sparkles.emit(burstAt, {
          count: Math.round(36 * motionScale(reducedMotionRef.current).particles),
          color: "#ff9f43",
          speed: 5,
          life: 0.7,
          size: 0.3,
        });
      }
      spawnShockwave(playerRef.current.x, playerRef.current.y, 0.9, "#ff9f43");
    }
    addTrauma(0.5);
    driverRef.current?.feel.hitstop(80);
    driverRef.current?.pace.signal("damage");
    // Az ütköző ellenfél azonnal eltűnik a pályáról (mesh + állapot).
    enemiesRef.current = enemiesRef.current.filter((en) => !en.dead);
    // Tanító szakasz (K.4/25): az első 30 mp-ben az ütközés nem von le életet (a kép / hang / rázás megvan).
    if (gameElapsedRef.current < TUTORIAL_SEC) {
      playerRef.current.invuln = HIT_INVULN_SEC;
      return;
    }
    comboRef.current = 0;
    // ÉLET-MECHANIKA: ütközés = −1 élet. 0 életnél a menet véget ér.
    const nextLives = Math.max(0, livesRef.current - 1);
    livesRef.current = nextLives;
    markHud();
    if (nextLives <= 0) {
      sfxExplode();
      endRun(false);
      return;
    }
    playerRef.current.invuln = HIT_INVULN_SEC;
  };

  /** Pickup begyűjtése. */
  const applyPickup = (pu: PickupState) => {
    sfxPickup();
    if (pu.kind === "life") {
      const next = Math.min(9, livesRef.current + 1);
      livesRef.current = next;
      setSavedToast("+1 élet!");
      pushTimeout(() => setSavedToast(null), 2200);
      scoreRef.current += 35;
      markHud();
    } else if (pu.kind === "shield") {
      // Pajzs: 8s teljes invuln (kék gyűrű mutat). Stack-elhető (eddigi shieldTimer + 8s).
      shieldTimerRef.current = Math.min(20, shieldTimerRef.current + 8);
      setSavedToast("Pajzs aktiválva!");
      pushTimeout(() => setSavedToast(null), 1800);
      scoreRef.current += 25;
      markHud();
    } else if (pu.kind === "bomb") {
      // Bomb: +1 készletre, B-billentyűvel vagy touch-gombbal süthető le.
      bombsRef.current = Math.min(5, bombsRef.current + 1);
      setSavedToast("Bomba a tárba!");
      pushTimeout(() => setSavedToast(null), 1800);
      scoreRef.current += 30;
      markHud();
    } else {
      // Power-up: 1 vagy 2-szintű, mindkét esetben +10s
      const next = Math.min(2, powerLevelRef.current + 1);
      powerLevelRef.current = next;
      powerTimerRef.current = POWER_DURATION;
      scoreRef.current += 20;
      markHud();
    }
  };

  /**
   * Bomb-süt: minden élő ellenfelet (kivéve boss-t — annak csak HP-t vesz)
   * azonnal megsemmisít, hatalmas vizuális robbanással.
   */
  /**
   * Bomb-süt: minden élő ellenfél megsemmisül (boss: -12 HP).
   * COMBO-EXPLOIT FIX: a bomba EGYETLEN +1 combót ad, nem kill-enkéntit —
   * korábban 8 enemy = +8 combo egy frame-ben, duzzasztott XP-vel.
   * Nem useCallback — minden render friss closure-t kap, a keyboard-handler
   * a detonateBombRef-en keresztül hívja.
   */
  const detonateBomb = () => {
    if (bombsRef.current <= 0) return;
    if (phaseRef.current !== "play" || pausedRef.current) return;
    bombsRef.current = Math.max(0, bombsRef.current - 1);
    sfxExplode();
    haptics("hit");
    addTrauma(0.7);
    markHud();
    const refs = sceneRefs.current;
    if (refs) {
      const k = motionScale(reducedMotionRef.current).particles;
      refs.flashLight.intensity = reducedMotionRef.current ? 3.5 : 7.0;
      // Bomba: táguló fénygyűrű a hajó körül.
      burstAt.set(playerRef.current.x, playerRef.current.y, 0.2);
      refs.sparkles.emit(burstAt, { count: Math.round(180 * k), color: "#7df9ff", speed: 14, life: 0.9, size: 0.34 });
      refs.sparkles.emit(burstAt, { count: Math.round(90 * k), color: "#ff7af5", speed: 9, life: 1.1, size: 0.3 });
    }
    // Combo-snapshot: a handleEnemyDestroyed kill-enként növelné — a bomba
    // után visszaállítjuk snapshot+1-re (1 akció = 1 combo-lépés).
    const comboBefore = comboRef.current;
    let killedAny = false;
    for (const e of enemiesRef.current) {
      if (e.dead) continue;
      if (e.kind === "boss") {
        e.flash = 0.2;
        e.hp = Math.max(0, e.hp - 12);
        if (e.hp <= 0) {
          handleEnemyDestroyed(e);
          killedAny = true;
        }
      } else {
        handleEnemyDestroyed(e);
        killedAny = true;
      }
    }
    if (killedAny) {
      comboRef.current = comboBefore + 1;
      if (comboRef.current > bestComboRef.current) bestComboRef.current = comboRef.current; // D2
      markHud();
    }
    // Ellenséges lövedékek is törlődnek
    for (const b of bulletsRef.current) {
      if (b.fromEnemy) b.life = 0;
    }
    // A bomba saját gyűrűi a leölt célok gyűrűi UTÁN: a 12-es korlát a legrégebbit veti el, ne a bombáét.
    spawnShockwave(playerRef.current.x, playerRef.current.y, 4.2, "#7df9ff");
    spawnShockwave(playerRef.current.x, playerRef.current.y, 2.6, "#ff7af5");
  };

  /* ===================== Render (Three.js) ===================== */
  const exhaustOrigin = useMemo(() => new THREE.Vector3(), []);
  const exhaustDir = useMemo(() => new THREE.Vector3(0, -1, 0), []);
  const burstAt = useMemo(() => new THREE.Vector3(), []);
  /** A rázás (feel) kimenete — a forró úton nincs allokáció (KSZ-5). */
  const shakeOut = useMemo<ShakeOffset>(() => ({ x: 0, y: 0, rot: 0 }), []);
  const projectTmp = useMemo(() => new THREE.Vector3(), []);
  /** A kristály-mesh utolsó kirajzolt állapota (színváltás csak változáskor). */
  const crystalLookRef = useRef<Array<CrystalLook | "hidden">>(["hidden", "hidden", "hidden", "hidden"]);
  const render = (now: number) => {
    const refs = sceneRefs.current;
    if (!refs) return;
    // Kanban #69 (havi audit): a menüben (osztályválasztó / kezdőképernyő) a vászon rejtett — nincs mit rajzolni, a jelenet
    // és a hurok nem fogyaszt GPU-t. A játék / eredmény alatt rajzol.
    if (phaseRef.current === "grade" || phaseRef.current === "intro") return;
    const { camera, starfield, playerGroup, thrusterMesh, shieldMesh, shieldFullMesh, flashLight } = refs;
    const frameDt = lastDtRef.current;

    // Csillagok pásztázása (lassú lefelé Y-mozgás), játék közben gyorsabb
    const moving = phaseRef.current === "play" && !pausedRef.current;
    const pos = starfield.geometry.attributes.position;
    const starDt = lastDtRef.current;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, starScrollY(pos.getY(i), starDt, moving));
    }
    pos.needsUpdate = true;
    // A fényes csillagok fele sebességgel sodródnak — parallaxis.
    const bright = refs.brightStars.geometry.attributes.position;
    for (let i = 0; i < bright.count; i++) {
      bright.setY(i, starScrollY(bright.getY(i), starDt * 0.5, moving));
    }
    bright.needsUpdate = true;
    if (!reducedMotionRef.current) {
      refs.nebula.material.uniforms.time.value = now;
      const spinner = refs.planet.userData.spin as THREE.Object3D | undefined;
      if (spinner) spinner.rotation.y += frameDt * 0.05;
    }

    // Játékos
    const p = playerRef.current;
    playerGroup.position.x = p.x;
    playerGroup.position.y = p.y + Math.sin(p.bobPhase) * 0.04;
    playerGroup.position.z = 0;
    // Bedöntés mozgásirányhoz
    const tilt = clamp(p.vx / Math.max(1, PLAYER_MAX_SPEED), -1, 1);
    playerGroup.rotation.z = -tilt * 0.45;
    playerGroup.rotation.y = tilt * 0.18;
    // Thruster pulzálás
    const moving2 = phaseRef.current === "play";
    thrusterMesh.scale.set(1 + cosmeticRandom() * 0.2, moving2 ? 1.4 + cosmeticRandom() * 0.5 : 0.5, 1);
    thrusterMesh.material.opacity = moving2 ? 0.85 : 0.4;
    refs.thrusterGlow.material.opacity = moving2 ? 0.6 + cosmeticRandom() * 0.25 : 0.3;
    // Hajtómű-csóva: meleg szikrák a hajó mögött (mozgáscsökkentésnél ritkábban).
    if (moving2 && playerGroup.visible && frameDt > 0) {
      const rate = (reducedMotionRef.current ? 18 : 70) * refs.reducedParticles;
      const count = Math.floor(rate * frameDt + cosmeticRandom());
      if (count > 0) {
        exhaustOrigin.set(p.x, p.y - 1.15, 0.1);
        refs.sparkles.emit(exhaustOrigin, {
          count,
          color: cosmeticRandom() < 0.5 ? "#ffcf4a" : "#ff7a3d",
          speed: 2.6,
          life: 0.45,
          size: 0.22,
          direction: exhaustDir,
          directionality: 0.85,
          spread: 0.25,
        });
      }
    }
    // Szünetben a részecskék is megállnak (a játék „kimerevedik”, nem fut tovább a háttérben).
    refs.sparkles.update(pausedRef.current ? 0 : frameDt);
    // Pajzs (sárga — power-up)
    shieldMesh.visible = powerLevelRef.current > 0;
    shieldMesh.rotation.z += 0.04;
    shieldMesh.rotation.y = now * 1.2;
    if (shieldMesh.visible) {
      shieldMesh.material.opacity = 0.55 + Math.sin(now * 6) * 0.25;
    }
    // Pajzs (kék — shield pickup)
    shieldFullMesh.visible = shieldTimerRef.current > 0;
    shieldFullMesh.rotation.z -= 0.06;
    shieldFullMesh.rotation.y = now * 1.5;
    if (shieldFullMesh.visible) {
      shieldFullMesh.material.opacity = 0.55 + Math.sin(now * 4) * 0.30;
    }
    // Invuln villogás (de csak ha NINCS pajzs)
    if (shieldTimerRef.current <= 0) {
      playerGroup.visible = !(p.invuln > 0 && Math.floor(p.invuln * 30) % 2 === 0);
    } else {
      playerGroup.visible = true;
    }

    // Ellenfelek mesh-pozíciók
    for (const e of enemiesRef.current) {
      let mesh = refs.enemyMeshById.get(e.id);
      if (!mesh) {
        // K.4/7: a „Grafika újraindítása” új jelenetet épít — a futó ellenfelek meshe itt épül újra.
        mesh = makeEnemyMesh(e);
        refs.enemiesGroup.add(mesh);
        refs.enemyMeshById.set(e.id, mesh);
      }
      mesh.position.set(e.x, e.y, 0);
      const spin = enemyRenderSpin(e.kind, now, e.rot, e.vx);
      mesh.rotation.set(spin.x, spin.y, spin.z);
      // Flash highlight (rövid fehér emissive felvillanás)
      if (mesh instanceof THREE.Mesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.emissive) {
          if (e.flash > 0) mat.emissiveIntensity = 1.6;
          else mat.emissiveIntensity = e.kind === "crystal" ? 0.95 : 0.45;
        }
      }
    }
    // Halottakat törlünk
    const deadEnemyIds: number[] = [];
    refs.enemyMeshById.forEach((mesh, id) => {
      const stillExists = enemiesRef.current.some((e) => e.id === id);
      if (!stillExists) {
        refs.enemiesGroup.remove(mesh);
        if (mesh instanceof THREE.Mesh) {
          mesh.geometry.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => m.dispose());
        } else {
          mesh.traverse((o: THREE.Object3D) => {
            if (o instanceof THREE.Mesh) {
              o.geometry.dispose();
              const mats = Array.isArray(o.material) ? o.material : [o.material];
              mats.forEach((m: THREE.Material) => m.dispose());
            }
          });
        }
        deadEnemyIds.push(id);
      }
    });
    deadEnemyIds.forEach((id) => refs.enemyMeshById.delete(id));

    // Lövedékek
    for (const b of bulletsRef.current) {
      let mesh = refs.bulletMeshById.get(b.id);
      if (!mesh) {
        const color = b.fromEnemy ? "#ff5577" : "#fff700";
        mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
        );
        // Lézer-udvar: közös anyag, ezért a lövedék törlése nem szabadítja fel.
        const halo = new THREE.Sprite(b.fromEnemy ? refs.bulletGlow.enemy : refs.bulletGlow.player);
        halo.scale.set(0.6, 1.1, 1);
        mesh.add(halo);
        refs.bulletsGroup.add(mesh);
        refs.bulletMeshById.set(b.id, mesh);
      }
      mesh.position.set(b.x, b.y, 0.05);
      mesh.rotation.z = Math.atan2(b.vx, b.vy);
    }
    const deadBulletIds: number[] = [];
    refs.bulletMeshById.forEach((mesh, id) => {
      const stillExists = bulletsRef.current.some((b) => b.id === id);
      if (!stillExists) {
        refs.bulletsGroup.remove(mesh);
        if (mesh instanceof THREE.Mesh) {
          mesh.geometry.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => m.dispose());
        }
        deadBulletIds.push(id);
      }
    });
    deadBulletIds.forEach((id) => refs.bulletMeshById.delete(id));

    // Pickupok
    for (const pu of pickupsRef.current) {
      let mesh = refs.pickupMeshById.get(pu.id);
      if (!mesh) {
        mesh = pu.kind === "life" ? buildLifePickupMesh()
          : pu.kind === "shield" ? buildShieldPickupMesh()
          : pu.kind === "bomb" ? buildBombPickupMesh()
          : buildPowerPickupMesh();
        refs.pickupsGroup.add(mesh);
        refs.pickupMeshById.set(pu.id, mesh);
      }
      mesh.position.set(pu.x, pu.y, 0);
      mesh.rotation.set(now * 1.6, now * 1.6, pu.rot);
    }
    const deadPickupIds: number[] = [];
    refs.pickupMeshById.forEach((mesh, id) => {
      const stillExists = pickupsRef.current.some((pu) => pu.id === id);
      if (!stillExists) {
        refs.pickupsGroup.remove(mesh);
        mesh.traverse((o: THREE.Object3D) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m: THREE.Material) => m.dispose());
          }
        });
        deadPickupIds.push(id);
      }
    });
    deadPickupIds.forEach((id) => refs.pickupMeshById.delete(id));

    // Kérdés-kristályok (J6a): a 3D mesh és a DOM-gomb (a koppintható / billentyűzetes cél) ugyanazon a világ-pozíción.
    // Nyitott kérdésnél minden kristály látszik; megoldás-kijelzés közben csak a helyes (zölden világít, ≥ 1,8 mp), a többi
    // (köztük a kiválasztott, szétesett rossz) elmarad. A DOM-gombokat közvetlenül mozgatjuk (nincs képkockánkénti setState).
    {
      const view = qRef.current.view();
      const reveal = view.reveal;
      const open = view.presentation !== null && !reveal;
      const list = crystalsRef.current;
      const canvasEl = refs.renderer.domElement;
      const cw = canvasEl.clientWidth;
      const ch = canvasEl.clientHeight;
      // A kártya magassága a hosszú prompttól / a megoldás-sortól függ: ~5 képkockánként újramérjük a zónát.
      if (list.length > 0 && now - zoneRef.current.at > 0.2) {
        zoneRef.current.at = now;
        rezoneCrystals(list, computeCrystalBounds(), 0.35);
      }
      for (let i = 0; i < refs.answerMeshes.length; i++) {
        const mesh = refs.answerMeshes[i]!;
        const c = list[i];
        const chip = chipRefs.current[i];
        let look: CrystalLook | "hidden" = "hidden";
        if (c) {
          if (open) look = c.alive ? "idle" : "hidden";
          else if (reveal) look = reveal.correctOptionIndex === i ? "correct" : "hidden";
        }
        if (crystalLookRef.current[i] !== look) {
          crystalLookRef.current[i] = look;
          mesh.visible = look !== "hidden";
          const gem = mesh.getObjectByName("gem") as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | undefined;
          if (gem) {
            gem.material.color.set(look === "correct" ? "#6cff9c" : "#ffd86b");
            gem.material.emissive.set(look === "correct" ? "#117a3a" : "#a8561a");
          }
        }
        // A gomb láthatósága KÉPKOCKÁNKÉNT egyeztetve (nem csak váltáskor): a következő kérdés gombjai új DOM-elemek, amelyek
        // rejtve indulnak — a „look” változatlan „idle” maradhat az előző kérdésről.
        if (chip) {
          const vis = look === "hidden" ? "hidden" : "visible";
          if (chip.style.visibility !== vis) chip.style.visibility = vis;
        }
        if (!c || look === "hidden") continue;
        mesh.position.set(c.x, c.y + (reducedMotionRef.current ? 0 : Math.sin(now * 1.7 + i * 1.3) * 0.16), 0.2);
        mesh.rotation.y = reducedMotionRef.current ? 0 : now * 0.9 + i;
        const pulse = look === "correct" ? 1.18 + (reducedMotionRef.current ? 0 : Math.sin(now * 8) * 0.06) : 1;
        // A 3D kristály a DOM-gomb körül „kikandikál” (a gomb a felirat és a koppintható cél; a kristály a fény és a találati gömb).
        const size = pulse * 1.55;
        mesh.scale.set(size, size, size);
        if (chip && cw > 0 && ch > 0) {
          projectTmp.set(c.x, c.y, 0.2).project(camera);
          const px = (projectTmp.x * 0.5 + 0.5) * cw;
          const py = (-projectTmp.y * 0.5 + 0.5) * ch;
          chip.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -50%)`;
        }
      }
    }

    // S10: lökéshullám-gyűrűk tágulása és elhalványulása (szünetben megáll, mint a játék).
    if (shockwavesRef.current.length > 0) {
      const waveDt = pausedRef.current ? 0 : frameDt;
      const alive: Shockwave[] = [];
      for (const w of shockwavesRef.current) {
        w.age += waveDt;
        const f = shockwaveFrame(w.age, w.radius);
        if (f.done) {
          refs.fxGroup.remove(w.sprite);
          w.sprite.material.dispose();
          continue;
        }
        w.sprite.scale.set(f.scale, f.scale, 1);
        // Csökkentett mozgásnál halványabb (nem villan), de a találat jele megmarad.
        w.sprite.material.opacity = reducedMotionRef.current ? f.opacity * 0.5 : f.opacity;
        alive.push(w);
      }
      shockwavesRef.current = alive;
    }

    // Flash light fadeout
    if (flashLight.intensity > 0) {
      flashLight.intensity = Math.max(0, flashLight.intensity - 0.18);
    }

    // Camera shake.
    // G-5: mozgáscsökkentésnél teljesen elmarad. A rázás okozza a rosszullétet,
    // nem a részecskék — és aki rosszul lesz tőle, nem hibát jelent, hanem
    // abbahagyja a játékot.
    const feel = driverRef.current?.feel;
    const canvasH = refs.renderer.domElement.clientHeight;
    if (feel && !reducedMotionRef.current && phaseRef.current === "play" && !pausedRef.current && canvasH > 0) {
      // A feel képpontban adja az elmozdulást (a nézet magasságának legfeljebb 1%-a); játéksíkra váltva.
      feel.shakeOffset(shakeOut, canvasH);
      const unitsPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z) / canvasH;
      camera.position.x = shakeOut.x * unitsPerPx;
      camera.position.y = CAMERA_Y + shakeOut.y * unitsPerPx;
    } else {
      camera.position.x = 0;
      camera.position.y = CAMERA_Y;
    }
    camera.lookAt(0, CAMERA_LOOK_Y, 0);

    refs.postFx.render();
  };

  // Friss closure-ök publikálása a mount-olt RAF loop felé (stale closure fix):
  // minden render után a loop a LEGUTOLSÓ tick/render definíciót hívja, így a
  // mount után betöltött quiz-pool és minden logika-frissítés érvényesül.
  tickRef.current = tick;
  renderRef.current = render;
  detonateBombRef.current = detonateBomb;

  /* ===================== Billentyűzet ===================== */
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
      switch (e.key) {
        case "ArrowLeft": case "a": case "A": keysRef.current.left = true; break;
        case "ArrowRight": case "d": case "D": keysRef.current.right = true; break;
        case "ArrowUp": case "w": case "W": keysRef.current.up = true; break;
        case "ArrowDown": case "s": case "S": keysRef.current.down = true; break;
        case " ": keysRef.current.fire = true; break;
        case "p": case "P":
          if (phaseRef.current === "play") {
            if (pausedRef.current) resumeGame();
            else pauseGame();
          }
          break;
        case "b": case "B":
          // Ref-en át — a mount-kori effect closure ne fagyassza be a stale verziót.
          if (phaseRef.current === "play") detonateBombRef.current();
          break;
      }
    };
    const ku = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft": case "a": case "A": keysRef.current.left = false; break;
        case "ArrowRight": case "d": case "D": keysRef.current.right = false; break;
        case "ArrowUp": case "w": case "W": keysRef.current.up = false; break;
        case "ArrowDown": case "s": case "S": keysRef.current.down = false; break;
        case " ": keysRef.current.fire = false; break;
      }
    };
    // D4: reset all movement flags on window blur (prevents stuck keys on tab/window switch).
    // S10: az érintés-irányok, a tűz és a joystick húzása is (korábban a touchRef beragadhatott).
    const onBlur = () => releaseControls();
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", onBlur);
    };
  }, [pauseGame, resumeGame, releaseControls]);

  // D4: clear all registered timeouts on unmount (prevents late state-update warnings)
  useEffect(() => () => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
  }, []);

  // R = quick-restart az "over" / "intro" / "grade" képernyőn.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "r" && e.key !== "R") return;
      if (phase === "over" || phase === "intro") {
        e.preventDefault();
        startNewRun();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startNewRun]);

  /*
   * A korábbi startHold/endHold gomb-kezelők elhagyva: a vezérlést a
   * VirtualJoystick és a HoldButton vette át, azok maguk intézik a pointer
   * capture-t és a preventDefaultot.
   */

  /* ===================== Eredmény-szinkron ===================== */
  useEffect(() => {
    if (phase !== "over" || !syncEligibility?.eligible || scoreSubmittedRef.current) return;
    scoreSubmittedRef.current = true;
    void postGameScore({
      gameId: "space-asteroid-quiz",
      difficulty: "normal",
      runXp: scoreRef.current,
      runStreak: bestComboRef.current, // D2: run-level best, not current
      // A menet VALÓS ideje (a kérdés-óra, szünetben nem fut): nincs idő-limit, a hossz az életekből / a főellenfélből jön.
      runSeconds: runTotalsRef.current.seconds,
      runId: newScoreRunId(),
    })
      .then(() => void queryClient.invalidateQueries({ queryKey: ["/api/games/leaderboard"] }))
      .catch(() => { scoreSubmittedRef.current = false; });
  }, [phase, syncEligibility]);

  // Achievement + Daily — egyszer fut "over" átmenetkor.
  const achievementCheckedRef = useRef(false);

  useEffect(() => {
    if (phase !== "over") {
      achievementCheckedRef.current = false;
      return;
    }
    if (achievementCheckedRef.current) return;
    achievementCheckedRef.current = true;
    const wasDailyAvailable = isTodaysGameAvailable("space-asteroid-quiz");
    const newOnes = recordRun({
      game: "space-asteroid-quiz",
      xpGained: scoreRef.current,
      // Valós kérdés-statisztika a directorból (K.2 „Menet-statisztika”); a lejárt kérdés hibának számít.
      correctAnswers: runTotalsRef.current.correct,
      wrongAnswers: runTotalsRef.current.wrong,
      maxStreak: bestComboRef.current, // D2: run-level best, not current
      enemiesKilled: enemiesKilledRef.current,
      alienKills: alienKillsRef.current,
      perfect: gameWon && bestComboRef.current >= 5,
      fullClear: gameWon,
      highestWave: waveRef.current,
    });
    if (wasDailyAvailable && gameWon) {
      const daily = markDailyCompleted();
      if (daily.achievements.length > 0) newOnes.push(...daily.achievements);
    }
    if (newOnes.length > 0) setNewlyUnlocked(newOnes);
  }, [phase, gameWon]);

  // A győzelem (8 hullám + a főellenfél) a következő pályát oldja fel; a menü azt ajánlja.
  useEffect(() => {
    if (phase === "over" && gameWon && runLevelRef.current != null && !levelClearedRef.current) {
      levelClearedRef.current = true;
      levels.complete(runLevelRef.current);
    }
  }, [phase, gameWon]);

  /* ===================== Eredmény + legjobb ===================== */
  // S10 / M7: a futás végén egyszer a helyi legjobb eredménybe (névtelen látogatónál is működik).
  useEffect(() => {
    if (phase !== "over" || bestInfo) return;
    setBestInfo(bestScore.submit(score));
  }, [phase, score, bestInfo, bestScore]);

  /** „Kör vége” (a szünet menü kilépése): a futás lezárul, az eredményképernyő jön. */
  const endRound = useCallback(() => {
    runIdRef.current += 1;
    clearPendingTimeouts();
    releaseControls();
    setFeedback(null);
    setPaused(false);
    endRun(false);
  }, [clearPendingTimeouts, releaseControls, endRun]);

  const backToMenu = useCallback(() => {
    runIdRef.current += 1;
    clearPendingTimeouts();
    setPaused(false);
    runOverRef.current = true;
    setPhase("intro");
  }, [clearPendingTimeouts]);

  /** K.4/7: „Grafika újraindítása” — új vászon és új renderer; a futó ellenfelek meshe a rajzoláskor újraépül. */
  const restartGraphics = useCallback(() => {
    setGfxLost(false);
    setSceneEpoch((n) => n + 1);
  }, []);

  /* ===================== Render JSX ===================== */
  const onPickGrade = (g: number) => {
    setGrade(g);
    saveGrade(g);
    // Spec 2026-09-29: a saját választó marad, de a közös classroomStore-ba is ír.
    saveClassroomGrade(g);
    setPhase("intro");
  };

  // A kérdés-sáv nézete (≈ 10 Hz): a kristály-gombok ebből épülnek, a pozíciót a hurok közvetlenül mozgatja.
  const qView = q.state;
  const inRun = phase === "play";
  const stageVisible = inRun || phase === "over";
  const screen: GameScreenState =
    phase === "grade" || phase === "intro" ? "start" : phase === "over" ? "result" : paused ? "paused" : "playing";
  const hudStats: GameHudStat[] = [
    {
      id: "wave",
      label: "Hullám",
      value: wave >= BOSS_FINAL_WAVE ? "BOSS" : `${wave}/${WAVE_COUNT}`,
      tone: wave >= BOSS_FINAL_WAVE ? "bad" : "default",
    },
    { id: "score", label: "Pont", value: score.toLocaleString("hu-HU") },
    { id: "lives", label: "Élet", value: `♥ ${lives}`, tone: lives <= 1 ? "bad" : "good" },
  ];
  // J6a: idő helyett hullám / élet — a sáv a menet előrehaladása (a hullámok és a főellenfél felé), nincs visszaszámláló.
  const progressMax = WAVE_COUNT + 1;
  const progressValue = Math.min(progressMax, hud.progress * progressMax);
  const progressLabel = wave >= BOSS_FINAL_WAVE ? "Főellenfél" : `Hullám ${wave}/${WAVE_COUNT}`;
  const gradeButtons = (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="Osztály választása">
      {GRADES.map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => onPickGrade(g)}
          aria-pressed={g === grade}
          className={`game-btn min-h-12 px-0 text-lg ${g === grade ? "game-btn-primary" : "game-btn-secondary"}`}
        >
          {g}.
        </button>
      ))}
    </div>
  );

  // Mat-quiz info az első kvíz előtt vagy menüben
  const matStatusLabel = (() => {
    if (!grade) return null;
    if (!materialQuizData) return "Tananyag-kvízek betöltése…";
    const n = materialQuizData.items?.length ?? 0;
    const m = materialQuizData.materials?.length ?? 0;
    if (n === 0) return `${grade}. osztály: nincs kapcsolt tananyag-kvíz, általános bankból kérdezünk.`;
    return `${grade}. osztály: ${n} kérdés a legutóbbi ${m} tananyagodból + általános bank.`;
  })();

  return (
    <GameShell
      gameId="SpaceAsteroidQuiz"
      state={screen}
      onAutoPause={pauseGame}
      style={{
        background: "radial-gradient(ellipse at 22% 18%, rgba(255,0,255,0.18), transparent 38%), radial-gradient(ellipse at 80% 12%, rgba(0,240,255,0.20), transparent 42%), linear-gradient(180deg, #02041a 0%, #08051b 100%)",
      }}
    >
      <AchievementToast achievements={newlyUnlocked} />
      {inRun && (
        <GameHud
          stats={hudStats}
          onPause={pauseGame}
          progress={{ value: progressValue, max: progressMax, label: progressLabel, tone: lives <= 1 ? "warn" : "default" }}
        />
      )}
      <main
        className={`sa-main relative z-10 w-full mx-auto flex flex-col ${screen === "start" ? "min-h-dvh" : ""}`}
        style={inRun ? { paddingTop: 4 } : undefined}
      >
        {/* LS-4: earned play time — renders nothing without a coupon. */}
        <CouponHud session={coupon} />
        <CouponExpiredOverlay session={coupon} />

        {screen === "start" && (
          <div className="sa-topbar flex items-center justify-between gap-2">
            <Link href="/games" className="game-btn game-btn-ghost min-h-12 gap-1.5 px-3 text-base">
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
              Játékok
            </Link>
            <AudioToggleButton size="icon" className="!h-12 !w-12" />
          </div>
        )}

        {phase === "grade" && (
          <section className="game-start" aria-labelledby="sa-grade-title">
            <header className="game-start-head">
              <div className="game-start-icon" aria-hidden="true">🚀</div>
              <h1 id="sa-grade-title" className="game-start-title">Galaktikus Aszteroida</h1>
              <p className="game-start-subtitle">
                Hányadik osztályos vagy? Az osztályod tananyagából jönnek a kérdések — amit még nem dolgoztatok fel,
                azt általános kvízekkel pótoljuk.
              </p>
            </header>
            <div className="w-full max-w-sm">{gradeButtons}</div>
            <p className="text-sm text-white/60 max-w-sm">
              Az osztályod csak a böngésződben tárolódik — később a Beállításokban bármikor megváltoztathatod.
            </p>
          </section>
        )}

        {phase === "intro" && (
          <StartScreen
            title="Galaktikus Aszteroida"
            subtitle="Lődd szét az aszteroidákat! A kérdések kristályokban érkeznek: lődd ki a helyeset, és erősödik a hajód."
            icon={<span>🚀</span>}
            startLabel={`Indulhat — ${grade}. osztály`}
            startTestId="sa-start"
            onStart={startNewRun}
            best={bestScore.best}
            menuKey="space"
            settings={
              <div className="flex flex-col gap-3">
                <p className="text-sm font-semibold text-cyan-100">Osztály</p>
                {gradeButtons}
                {levels.active && levels.level != null ? (
                  <GradeLevelPicker
                    value={levels.level}
                    unlocked={levels.unlocked}
                    onChange={levels.select}
                    label={`Pálya — ${grade}. osztály`}
                  />
                ) : null}
                {matStatusLabel && (
                  <p className="text-sm text-amber-100/90 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 mt-0.5 text-amber-300 shrink-0" aria-hidden="true" />
                    {matStatusLabel}
                  </p>
                )}
                <p className="text-sm text-cyan-100/80" data-game-sync>{syncBanner}</p>
              </div>
            }
          >
            {levels.level != null && (
              <p className="text-sm font-semibold text-cyan-100/85">{levels.level}. pálya · a Beállításokban váltható</p>
            )}
            <details className="game-start-settings sa-howto mt-2 w-full">
              <summary>
                <span aria-hidden="true">👾</span>
                Ellenfelek és irányítás
              </summary>
              <div className="game-start-settings-body flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { name: "Szikla", note: "3 méret · szétesik", cls: "border-cyan-500/50 text-cyan-200" },
                    { name: "Drágakő", note: "+60 pont · ajándék", cls: "border-sky-400/50 text-sky-200" },
                    { name: "Ufó", note: "cikkcakk · +80 pont", cls: "border-lime-400/50 text-lime-200" },
                    { name: "Vadászgép", note: "visszalő · +120 pont", cls: "border-rose-400/50 text-rose-200" },
                  ].map((x) => (
                    <div key={x.name} className={`rounded-2xl border bg-slate-900/70 px-3 py-2 text-left ${x.cls}`}>
                      <p className="text-sm font-extrabold uppercase tracking-wide">{x.name}</p>
                      <p className="text-sm text-white/75">{x.note}</p>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-white/75">
                  {touchCapable
                    ? "Bal hüvelykujj: joystick · jobb: tűz (célzássegéddel) · középen a bomba."
                    : "Nyilak / WASD: mozgás · Space: tűz · B: bomba · P: szünet."}
                </p>
              </div>
            </details>
            <GamePedagogyPanel
              accent="cyan"
              className="mt-2 text-left"
              kidMission={'Lődd ki az aszteroidákat, alien csészealjakat és ellenséges vadászgépeket! Közben feliratos kristályok lebegnek be: a saját osztályod tananyagából jön a kérdés, és a helyes választ tartalmazó kristályt kell kilőnöd (vagy megérintened). A helyes kristály erősít — pajzs, hármas lövés vagy bomba —, a rossz kristály apró sziklákra hasad. Ütközésnél csak egy életed megy el, a játék nem áll meg.'}
              parentBody={
                <>
                  <strong className="text-cyan-100/90">Tananyag:</strong> a játékos osztálya és a legutóbbi 3 feltöltött tananyaga alapján a backend automatikusan szállítja a kérdéseket. Ha még nincs kapcsolt kvíz, általános bank szolgál; az angol szavak a központi szóbankból jönnek, ismétlés nélkül.
                  <br />
                  <strong className="text-cyan-100/90">Fejleszt:</strong> reakcióidő, térbeli figyelem, számolás / olvasás gyors döntés mellett; a hibázott tétel később visszatér (térközös ismétlés).
                  <br />
                  <span className="text-white/55">A klasszikus akadály + teszt + jutalom ciklust egy 3D shooter formába helyezi.</span>
                </>
              }
            />
          </StartScreen>
        )}

            {/*
              A canvas-t MINDIG render-eljük (még az "intro"/"grade"/"over" fázisokban
              is), de csak a `display`-jét kontrolláljuk a phase alapján. Így a Three.js
              useEffect azonnal a komponens mountjakor inicializálni tudja a scenet,
              és nem kell minden átmenetnél a teljes 3D scene-t újraépíteni.
            */}
            <div className={`sa-stage ${stageVisible ? "" : "hidden"}`}>
                <div ref={sceneBoxRef} className="sa-scene game-scene relative rounded-2xl overflow-hidden border border-cyan-400/40 shadow-[0_0_28px_rgba(0,240,255,0.18)] w-full bg-black">
                  <canvas key={sceneEpoch} ref={canvasRef} className="block touch-manipulation w-full h-full" style={{ width: "100%", height: "100%" }} />
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,transparent_56%,rgba(0,0,0,0.32)_100%)]" />
                  {/*
                    Kérdés-kristályok (J6a): a válasz a célpont. A DOM-gombok a 3D kristályok vetített helyén ülnek (a hurok
                    közvetlenül mozgatja őket): koppintható, billentyűzettel (1–4) és képernyőolvasóval is elérhető; a lövedék
                    a 3D kristályt találja el. ≥ 48 px, a felirat ≤ 2 sor (a hosszabb tételt a forrás hátrébb sorolja).
                  */}
                  {inRun && qView.presentation && (
                    <div
                      className={`sa-crystals ${wrongShake ? "animate-shake-spq" : ""}`}
                      data-testid="sa-crystals"
                      data-quiz-id={qView.presentation.question.quiz.id ?? undefined}
                      data-quiz-source={qView.presentation.question.source}
                      data-open={qView.reveal ? "false" : "true"}
                    >
                      {qView.presentation.options.map((opt, idx) => {
                        const st = qView.reveal ? (idx === qView.reveal.correctOptionIndex ? "correct" : "dim") : "idle";
                        // Megoldás-kijelzés közben csak a helyes kristály marad (zölden világít); a többi (köztük a kiválasztott,
                        // szétesett rossz) eltűnik a rétegből — a mérők és a képernyőolvasó sem találkozik láthatatlan gombbal.
                        if (st === "dim") return null;
                        return (
                          <button
                            key={`${qView.presentation!.id}-${idx}`}
                            ref={(el) => {
                              chipRefs.current[idx] = el;
                            }}
                            type="button"
                            className="sa-crystal"
                            data-testid={`sa-crystal-${idx}`}
                            data-state={st}
                            data-option-index={idx}
                            style={{ transform: "translate3d(-200px, -200px, 0)", visibility: "hidden" }}
                            aria-label={`Kristály: ${opt.label}`}
                            aria-disabled={qView.reveal || paused ? "true" : undefined}
                            aria-keyshortcuts={String(idx + 1)}
                            {...pointerTapHandlers(crystalTaps, idx, () => onAnswer(idx))}
                            {...correctDataAttrs(opt.correct)}
                          >
                            <span className="sa-crystal-gem" aria-hidden="true" />
                            <span className="sa-crystal-label" data-long={opt.label.length > CRYSTAL_LABEL_MAX_CHARS || /S{9,}/.test(opt.label) ? "true" : "false"}>
                              {opt.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {inRun && hud.hint && banner === 0 && (
                    <p className="sa-hint pointer-events-none" data-testid="sa-hint" role="status">
                      {touchCapable ? "Bal ujj: mozgás · jobb ujj: tűz" : "Nyilak: mozgás · Szóköz: tűz"}
                    </p>
                  )}
                  {inRun && banner > 0 && (
                    <div className="pointer-events-none absolute left-1/2 top-[58%] -translate-x-1/2 text-center" data-testid="sa-wave-banner" role="status">
                      <span className="sa-wave-banner">{banner >= BOSS_FINAL_WAVE ? "FŐELLENFÉL!" : `HULLÁM ${banner}`}</span>
                    </div>
                  )}
                  {inRun && (powerLevel > 0 || shieldTimer > 0) && (
                    <div className="pointer-events-none absolute left-2 top-2 flex flex-col gap-1.5">
                      {powerLevel > 0 && (
                        <span className="sa-chip border-yellow-300/50 text-yellow-100">
                          <Zap className="w-4 h-4 text-yellow-300" aria-hidden="true" />
                          {powerLevel >= 2 ? "Hármas" : "Dupla"} · {powerTimer} mp
                        </span>
                      )}
                      {shieldTimer > 0 && (
                        <span className="sa-chip border-sky-300/50 text-sky-100">🛡️ Pajzs · {shieldTimer} mp</span>
                      )}
                    </div>
                  )}
                  {inRun && combo >= 2 && (
                    <motion.span
                      key={reducedMotion ? "combo" : combo}
                      initial={reducedMotion ? false : { scale: 1.35, opacity: 0.6 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 520, damping: 22 }}
                      className={`sa-chip pointer-events-none absolute right-2 ${bossHp !== null ? "top-16" : "top-2"} ${
                        combo >= 10 ? "border-fuchsia-300/70 text-fuchsia-100" : "border-amber-300/60 text-amber-100"
                      }`}
                    >
                      ×{combo} kombó
                    </motion.span>
                  )}
                  {inRun && bossHp !== null && (
                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-2 w-[72%] max-w-md">
                      <div className="rounded-xl border-2 border-rose-400/85 bg-rose-950/85 px-2.5 py-1.5 shadow-[0_0_20px_rgba(255,80,140,0.55)]">
                        <div className="flex items-center justify-between text-xs font-extrabold text-rose-100 uppercase tracking-wider mb-1">
                          <span>★ Alien anyahajó</span>
                          <span className="tabular-nums">{bossHp} / {BOSS_TOTAL_HP}</span>
                        </div>
                        <div className="h-2 rounded-full bg-rose-950/80 overflow-hidden border border-rose-300/40">
                          <div
                            className="h-full bg-gradient-to-r from-rose-500 via-fuchsia-400 to-rose-300 transition-all"
                            style={{ width: `${Math.max(0, Math.min(100, (bossHp / BOSS_TOTAL_HP) * 100))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {inRun && savedToast && (
                    <motion.div
                      key={savedToast}
                      initial={reducedMotion ? false : { y: -12, opacity: 0, scale: 0.9 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      exit={{ y: -12, opacity: 0 }}
                      className="absolute top-[66%] left-1/2 -translate-x-1/2 rounded-xl bg-emerald-400/95 text-slate-950 font-extrabold text-sm px-3 py-1.5 shadow-md flex items-center gap-1.5 pointer-events-none whitespace-nowrap"
                    >
                      <ShieldAlert className="w-4 h-4" aria-hidden="true" />
                      {savedToast}
                    </motion.div>
                  )}
                </div>

                {/* S10 / terv 4.5–4.6: érintővezérlő CSAK érintős eszközön, képernyőhöz méretezett joystick és tűzgomb. */}
                {inRun && (touchCapable ? (
                <div
                  className="sa-controls"
                  data-testid="sa-touch-controls"
                  data-game-controls
                  style={{
                    touchAction: "none",
                    userSelect: "none",
                    WebkitTouchCallout: "none",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <VirtualJoystick
                    label="Hajó irányítása"
                    radius="auto"
                    resetSignal={joyReset}
                    onChange={(v) => {
                      // Joystick-reakció (#49): analóg, folytonos görbe — nem négy logikai gomb 0,35-ös küszöbbel.
                      // A joystick „előre" iránya fölfelé mutat; a hajó `my` vezérlője ugyanezt jelenti.
                      const s = shapeJoystick(v);
                      stickRef.current.x = s.x;
                      stickRef.current.y = s.y;
                    }}
                  />
                  {/* A jobb hüvelykujj klasztere: bomba + tűz (álló és fekvő nézetben is a jobb szélen). */}
                  <div className="sa-actions">
                  <button
                    type="button"
                    onClick={detonateBomb}
                    disabled={bombs <= 0}
                    aria-label={`Bomba (${bombs} db) — minden ellenfél megsemmisül`}
                    className={`game-action-btn sa-bomb relative border-2 font-extrabold ${
                      bombs > 0
                        ? "bg-gradient-to-b from-orange-400 to-orange-700 border-orange-100/60 text-white shadow-[0_0_22px_rgba(255,140,40,0.55)]"
                        : "bg-slate-800/80 border-white/15 text-white/45"
                    }`}
                    data-testid="button-bomb"
                  >
                    <span className="text-2xl leading-none" aria-hidden="true">💣</span>
                    <span className="sa-badge tabular-nums">{bombs}</span>
                  </button>
                  <div className="sa-fire-wrap">
                    <HoldButton
                      label="Tűz"
                      size="auto"
                      onHoldStart={() => {
                        touchRef.current.fire = true;
                        haptics("tap");
                      }}
                      onHoldEnd={() => {
                        touchRef.current.fire = false;
                      }}
                      className="sa-fire flex-col gap-0.5 bg-gradient-to-b from-rose-500 to-rose-800 text-white border-2 border-rose-100/50 shadow-[0_0_26px_rgba(255,60,100,0.55)] font-extrabold active:scale-95 transition-transform"
                    >
                      <span className="text-2xl leading-none" aria-hidden="true">🚀</span>
                      <span className="text-sm tracking-wider">TŰZ</span>
                    </HoldButton>
                  </div>
                  </div>
                </div>
                ) : (
                  <div className="sa-keys flex items-center justify-center gap-3 w-full">
                    <p className="text-sm text-white/70 text-center" data-testid="sa-keyboard-hint">
                      Billentyűzet: nyilak / WASD mozgat · Space tűz · B bomba · P szünet
                    </p>
                    <button
                      type="button"
                      onClick={detonateBomb}
                      disabled={bombs <= 0}
                      title="Bomba (B billentyű) — minden ellenfél megsemmisül (boss: -12 HP)"
                      className="game-btn game-btn-secondary shrink-0"
                      data-testid="button-bomb"
                    >
                      💣 {bombs}
                    </button>
                  </div>
                ))}
              </div>
      </main>

      {/*
        A kérdés-sáv (J6a): NEM modális — a játék alatta fut (0,7× lassítás), nincs inert háttér, nincs fókuszlopás. A prompt a
        felső sávban, a válaszok a vásznon lebegő kristályok; a sáv saját szünetgombja és a „Miért?” a közös komponensből.
      */}
      {phase === "play" && (
        <InlineQuestion
          {...q.bind}
          onPick={onAnswer}
          mode="bar"
          skin="space"
          disabled={paused}
          onWhy={openWhy}
          testId="sa-question"
          promptTestId="sa-prompt"
          optionTestId={(i) => `sa-option-${i}`}
          pauseTestId="sa-quiz-pause"
          onPause={pauseGame}
          onExpand={() => setExpanded(true)}
          onCollapse={() => setExpanded(false)}
        />
      )}

      <PauseMenu open={paused && inRun} onResume={resumeGame} onRestart={startNewRun} onExit={endRound} exitLabel="Kör vége">
        <p className="text-sm text-slate-300">
          Hullám {wave >= BOSS_FINAL_WAVE ? "BOSS" : `${wave}/${WAVE_COUNT}`} · {score.toLocaleString("hu-HU")} pont · ♥ {lives}
        </p>
        {/* K.4/7: elveszett WebGL-környezet — a menet szünetel (ez a menü), az újraindítás új vásznat és renderert ad; a menet állapota megmarad. */}
        {gfxLost && (
          <div className="mt-3 flex flex-col items-center gap-2" role="alert" data-testid="sa-gfx-lost">
            <p className="text-sm font-semibold text-amber-200">A grafika megakadt.</p>
            <button type="button" className="game-btn game-btn-primary min-h-12" data-testid="sa-gfx-restart" onClick={restartGraphics}>
              Grafika újraindítása
            </button>
          </div>
        )}
      </PauseMenu>

      <ResultScreen
        badges={newlyUnlocked}
        open={phase === "over"}
        testId="sa-over"
        title={gameWon ? "Legyőzted a főellenfelet!" : "Kör vége"}
        won={gameWon}
        score={score}
        best={bestInfo?.best ?? bestScore.best}
        isNewBest={bestInfo?.isNewBest ?? false}
        correct={quizCorrect}
        total={quizTotal}
        onRetry={startNewRun}
        retryLabel="Új kör"
        onBack={() => navigate("/games")}
        extra={
          <div className="flex flex-col gap-2">
            <p>
              Hullám: <strong>{Math.min(wave, WAVE_COUNT)}/{WAVE_COUNT}</strong> · Kilőve: <strong>{enemiesKilled}</strong>
            </p>
            <ResultReview items={q.director?.wrongList() ?? []} />
            <p className={syncEligibility?.eligible ? "text-emerald-300" : "text-slate-300"}>
              {syncEligibility?.eligible ? "Eredmény elküldve." : syncBanner}
            </p>
            <button type="button" className="game-btn game-btn-ghost w-full" onClick={backToMenu}>
              Menü (osztály, pálya)
            </button>
          </div>
        }
      />

      <style>{`
        @keyframes shake-spq {
          0%,100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake-spq { animation: shake-spq 0.16s ease-in-out 2; }
        .sa-stage { position: relative; display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; gap: 8px; }
        .sa-stage.hidden { display: none; }
        .sa-scene { flex: 1 1 0; min-height: 0; }
        .sa-controls {
          position: relative; z-index: 30; flex: 0 0 auto;
          display: flex; align-items: flex-end; justify-content: space-between; gap: 12px;
          padding: 0 2px;
        }
        .sa-controls > * { flex: 0 0 auto; }
        .sa-actions { display: flex; align-items: flex-end; gap: 14px; }
        .sa-actions .sa-bomb { margin-bottom: calc(var(--game-action-size) * 0.55); flex-direction: column; }
        .sa-fire-wrap { --game-action-size: clamp(64px, 21vmin, 104px); }
        .sa-fire-wrap .sa-fire { display: inline-flex; }
        .sa-badge {
          position: absolute; top: -4px; right: -4px; min-width: 24px; height: 24px; padding: 0 6px;
          border-radius: 9999px; background: #0b172d; border: 2px solid #fdba74; color: #fff;
          font-size: 13px; line-height: 20px; text-align: center;
        }
        .sa-chip {
          display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 9999px;
          border-width: 1px; background: #0b172dcc; font-size: 13px; font-weight: 800;
          -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
        }
        .sa-crystals { position: absolute; inset: 0; z-index: 20; pointer-events: none; overflow: hidden; }
        .sa-crystal {
          position: absolute; left: 0; top: 0; pointer-events: auto; touch-action: manipulation; will-change: transform;
          min-width: 64px; max-width: 98px; min-height: 52px; padding: 6px 13px; margin: 0; border: 0; background: none; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center; text-align: center; color: #1b1203; font-weight: 800;
          filter: drop-shadow(0 0 9px rgba(255, 210, 63, 0.75));
        }
        /* a gomb alakja: lapos tetejű, csúcsos oldalú kristály (hatszög) — a felirat fölötte, a fény a gomb körül */
        .sa-crystal-gem {
          position: absolute; inset: 0; z-index: 0; animation: sa-bob 2.6s ease-in-out infinite;
          clip-path: polygon(14% 0, 86% 0, 100% 50%, 86% 100%, 14% 100%, 0 50%);
          background: linear-gradient(160deg, #fffbe0 0%, #ffe27a 38%, #ffb52e 100%);
        }
        .sa-crystal:focus-visible { outline: 3px solid #fff; outline-offset: 3px; border-radius: 12px; }
        .sa-crystal-label { position: relative; z-index: 1; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; font-size: 14px; line-height: 1.15; }
        .sa-crystal-label[data-long="true"] { font-size: 12px; }
        .sa-crystal[data-state="correct"] { filter: drop-shadow(0 0 14px rgba(74, 222, 128, 0.95)); }
        .sa-crystal[data-state="correct"] .sa-crystal-gem { background: linear-gradient(160deg, #eafff1 0%, #86efac 40%, #22c55e 100%); }
        .sa-crystal[data-state="dim"] { opacity: 0.5; }
        @keyframes sa-bob { 0%, 100% { transform: translateY(-2px); } 50% { transform: translateY(2px); } }
        @media (prefers-reduced-motion: reduce) { .sa-crystal-gem { animation: none; } }
        .sa-hint {
          position: absolute; left: 50%; top: 58%; transform: translateX(-50%); max-width: 92%; margin: 0; padding: 4px 12px; text-align: center;
          border-radius: 9999px; font-size: 14px; font-weight: 800; color: #fff; background: rgba(8, 5, 27, 0.72); border: 1px solid rgba(165, 180, 252, 0.6);
        }
        .sa-wave-banner {
          display: inline-block; padding: 6px 16px; border-radius: 9999px; font-size: 20px; font-weight: 900; letter-spacing: 0.08em;
          color: #fff; background: rgba(8, 5, 27, 0.72); border: 2px solid rgba(165, 180, 252, 0.8);
        }
        /* A kérdés-sáv a HUD (és a hullám-sáv) alatt kezdődik. */
        .play-question[data-skin="space"] { --play-question-top: calc(max(4px, var(--game-safe-top)) + 96px); }
        @media (max-height: 500px) and (min-width: 560px) {
          /* Fekvő kezdőképernyő: a súgó a jobb hasábba, az indítógomb alá (a közös rács egész sorát nem foglalja). */
          [data-game="SpaceAsteroidQuiz"] .game-start-head { grid-row: 1 / span 2; }
          [data-game="SpaceAsteroidQuiz"] .game-start-extra { grid-column: 2; align-self: start; }
          [data-game="SpaceAsteroidQuiz"] .game-start-actions { align-self: end; }
          [data-game="SpaceAsteroidQuiz"] .game-start-subtitle { font-size: 15px; }
          [data-game="SpaceAsteroidQuiz"] .game-start[data-game-start] { padding-block: 8px; row-gap: 6px; }
        }
        @media (orientation: landscape) and (max-height: 560px) {
          /* Fekvő telefonon a vezérlők a vászon két szélére kerülnek (a pálya középen van, a szélek üresek). */
          .sa-controls { position: absolute; left: 6px; right: 6px; bottom: 6px; pointer-events: none; }
          .sa-controls > * { pointer-events: auto; }
        }
      `}</style>
      {feedback && <QuizFeedbackCard card={feedback} onDismiss={closeWhy} />}
    </GameShell>
  );
}
