import { isPlayableQuestion } from "@shared/game-quiz-contract";
import { createAdaptiveSession } from "@/game-engine/adaptiveSession";
import {
  createGradeQuizSeen,
  gradeForGame,
  markGradeQuizSeen,
  pickGradeQuiz,
  pickUnseenMaterial,
} from "@/game-engine/gradeQuiz";
import { saveClassroomGrade } from "@/lib/classroomStore";
import { useGradeLevel } from "@/game-engine/useGradeLevel";
import { GradeLevelPicker } from "@/game-engine/GradeLevelPicker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import * as THREE from "three";
import { ArrowLeft, Heart, Star, Zap, RotateCcw, Rocket, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import GamePedagogyPanel from "@/components/GamePedagogyPanel";
import { gameSyncBannerText, useSyncEligibilityQuery } from "@/hooks/useGameScoreSync";
import AudioToggleButton from "@/components/AudioToggleButton";
import { useStreakProtector } from "@/hooks/useStreakProtector";
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
} from "@/lib/spaceAsteroid/physics";
import { CouponHud, CouponExpiredOverlay } from "@/game-engine/CouponHud";
import { sfxSuccess, sfxError, sfxShoot, sfxHit, sfxExplode, sfxPickup, sfxLevelUp, sfxWarning } from "@/lib/audioEngine";
import { recordRun, type Achievement } from "@/lib/achievements";
import { isTodaysGameAvailable, markDailyCompleted } from "@/lib/dailyChallenge";
import AchievementToast from "@/components/AchievementToast";
import QuizFeedbackCard from "@/game-engine/QuizFeedbackCard";
import { useReducedMotion } from "@/game-engine/useReducedMotion";
import VirtualJoystick from "@/game-engine/VirtualJoystick";
import HoldButton from "@/game-engine/HoldButton";
import { joystickToDirections } from "@/game-engine/joystick";
import { buildFeedback, type FeedbackCard } from "@/game-engine/feedback";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { correctDataAttrs, installGameTestApi } from "@/game-engine/game-test-hooks";
import {
  LOOK_BUDGET,
  SparkleField,
  applyRendererLook,
  createGlowSprite,
  createPostFx,
  createRoomEnvironment,
  detectLookTier,
  glowTexture,
  type PostFx,
} from "@/game-engine/three-look";
import { buildNebula, buildPlanet, buildStarLayer, type Nebula } from "@/game-engine/scenes/spaceBackdrop";

/* =====================================================================
 * Galaktikus Aszteroida Kvíz Vadász – Three.js 3D űrharc
 *
 * Játékmenet összefoglaló:
 *  1. Indítás előtt: osztály-választó (1–12). Az osztály alapján a szerver
 *     visszaadja a játékos legutóbbi 3 tananyagához kapcsolt kvíz-tételeket
 *     (`/api/games/material-quizzes?classroom=N&limit=3`). Ha üres a halmaz,
 *     a játék statikus fallback bankra vált.
 *  2. Minden hullám ELEJÉN egy kvíz jelenik meg — csak helyes válaszra
 *     indul a hullám. Rossz válasz → új kvíz, marad a kvíz fázisban.
 *  3. Aszteroida-ütközéskor szintén kvíz: a játék megáll, csak helyes
 *     válaszra folytatódik. Rossz válasz → új kvíz.
 *  4. +1 ÉLET pickup esetén az "élet" mellett megjelenik a felirat:
 *     „Megúsztál egy kvízt!" — minden életpont egy elnyert kvíz-bónusz.
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
  /** `grade`: a közös évfolyam-bankból (3–12. évfolyam, spec 2026-09-29). */
  source?: "material" | "fallback" | "grade";
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

type Phase = "grade" | "intro" | "play" | "quiz" | "over";
type QuizReason = "wave" | "hit";

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
const ROUND_LIMIT_SEC = 360;

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
const BOSS_FINAL_WAVE = 12;

/* ============================ Helpers ============================ */

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function randRange(min: number, max: number) {
  return min + Math.random() * (max - min);
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
  const seed = Math.random() * 10;
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

export default function SpaceAsteroidQuiz() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coarsePointer = useCoarsePointer();

  // LS-4 (D3): the play-time coupon earned in a lesson, exactly as in Tsunami —
  // without a coupon this is inert and free play stays the default.
  const coupon = useCouponSession();

  // ----- Játékállapot (UI) -----
  const [phase, setPhase] = useState<Phase>(loadGrade() != null ? "intro" : "grade");
  const [grade, setGrade] = useState<number | null>(loadGrade());
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [powerLevel, setPowerLevel] = useState(0);
  const [powerTimer, setPowerTimer] = useState(0);
  // Pajzs (8-20s teljes invuln) + bomb-készlet (max 5)
  const [shieldTimer, setShieldTimer] = useState(0);
  const [bombs, setBombs] = useState(0);
  // Boss HP (null ha nincs aktív boss)
  const [bossHp, setBossHp] = useState<number | null>(null);
  const bossHpRef = useRef<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(ROUND_LIMIT_SEC);
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [quizReason, setQuizReason] = useState<QuizReason>("wave");
  const [wrongShake, setWrongShake] = useState(false);
  // Helyes-válasz felfedés a kvíz-modálban (zöld outline) + a hibás opció
  // piros outline-ja, 1.5s alatt fade-elődik, majd új kvíz / play.
  const [revealCorrectIdx, setRevealCorrectIdx] = useState<number | null>(null);
  const [wrongIdx, setWrongIdx] = useState<number | null>(null);
  const streakProtector = useStreakProtector();
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [enemiesKilled, setEnemiesKilled] = useState(0);
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([]);
  const [paused, setPaused] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  // Spec 2026-09-29-palyak-szoletra-nyelvek (E szelet): 10 pálya évfolyamonként (3–12.); a futás pályája a startkor rögzül.
  const levels = useGradeLevel("asteroid", grade);
  const runLevelRef = useRef<number | null>(null);
  const levelClearedRef = useRef(false);

  useEffect(() => {
    return installGameTestApi({
      probe: () => {
        const band = adaptiveRef.current.band;
        return { level: runLevelRef.current, band, spawnFactor: 1.4 - band * 0.6 };
      },
      forceState: (patch) => {
        if (patch.phase === "intro" || patch.phase === "grade" || patch.phase === "play" || patch.phase === "over") {
          setPhase(patch.phase);
        }
        if (typeof patch.gameWon === "boolean") setGameWon(patch.gameWon);
        if (typeof patch.correctCount === "number") {
          setScore(Math.max(0, patch.correctCount) * 10);
          setWave(12);
        }
      },
    });
  }, []);

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
  const shakeRef = useRef(0);
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
  const timeoutsRef = useRef<number[]>([]);
  const pushTimeout = useCallback((cb: () => void, ms: number): number => {
    const id = window.setTimeout(() => {
      timeoutsRef.current = timeoutsRef.current.filter((t) => t !== id);
      cb();
    }, ms);
    timeoutsRef.current.push(id);
    return id;
  }, []);

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

  const recentQuizPromptsRef = useRef<string[]>([]);
  const RECENT_WINDOW = 12;
  /** Spec 2026-09-29: a futásban már feltett kérdések (azonosító + prompt) — a közös bank ismétlés-tilalma. */
  const gradeSeenRef = useRef(createGradeQuizSeen());
  const adaptiveRef = useRef(createAdaptiveSession(4));

  /**
   * Kihúz egy nem-régen-mutatott kvízt. Tananyag-kérdéseket részesít előnyben.
   * 3–12. évfolyamon (spec 2026-09-29): nem látott tananyag-kvíz → közös évfolyam-bank
   * (az adaptív sáv szerinti szinten) → a régi általános bank, ha a közös bank üres/kimerült.
   */
  const pickQuiz = useCallback((): Quiz => {
    const sharedGrade = gradeForGame(grade);
    const couponMaterialOnly = coupon.active && quizPool.some((q) => q.source === "material");
    if (sharedGrade != null && !couponMaterialOnly) {
      const seen = gradeSeenRef.current;
      const material = pickUnseenMaterial(quizPool.filter((q) => q.source === "material"), seen);
      if (material) {
        markGradeQuizSeen(seen, material);
        return material;
      }
      const item = pickGradeQuiz({ grade: sharedGrade, band: adaptiveRef.current.band, seen });
      if (item) {
        markGradeQuizSeen(seen, item);
        return {
          id: item.id,
          prompt: item.prompt,
          options: [...item.options],
          correctIndex: item.correctIndex,
          explanation: item.explanation,
          topic: item.subject === "science" ? "nature" : item.subject,
          source: "grade",
          grade: item.grade,
        };
      }
    }
    const pool = quizPool.length > 0 ? quizPool : FALLBACK_QUIZZES;
    const recent = recentQuizPromptsRef.current;
    const matFirst = pool.filter((q) => q.source === "material" && !recent.includes(q.prompt));
    const fbFiltered = pool.filter((q) => q.source !== "material" && !recent.includes(q.prompt));
    const candidates = matFirst.length > 0 ? matFirst : fbFiltered.length > 0 ? fbFiltered : pool;
    const picked = candidates[Math.floor(Math.random() * candidates.length)] ?? FALLBACK_QUIZZES[0]!;
    recent.push(picked.prompt);
    while (recent.length > RECENT_WINDOW) recent.shift();
    return picked;
  }, [quizPool, grade, coupon.active]);

  /* ============== Phase / játékvezérlés ============== */

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    livesRef.current = lives;
  }, [lives]);

  useEffect(() => {
    waveRef.current = wave;
  }, [wave]);

  useEffect(() => {
    powerLevelRef.current = powerLevel;
  }, [powerLevel]);

  useEffect(() => {
    powerTimerRef.current = powerTimer;
  }, [powerTimer]);

  useEffect(() => {
    comboRef.current = combo;
  }, [combo]);

  useEffect(() => {
    enemiesKilledRef.current = enemiesKilled;
  }, [enemiesKilled]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  /** Kör-óra: másodpercenként számol vissza. Szünetben (paused) áll. */
  useEffect(() => {
    // JAVÍTÁS: a szünet korábban nem állította meg az órát → pause alatt is fogyott az idő.
    if (phase !== "play" || paused) return;
    const id = window.setInterval(() => {
      setTimeLeft((s) => {
        if (s <= 1) {
          setPhase("over");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, paused]);

  /** Power-timer (sec). Szünetben (paused) áll. */
  useEffect(() => {
    if (phase !== "play" || paused) return;
    if (powerTimer <= 0) return;
    const id = window.setInterval(() => {
      setPowerTimer((t) => {
        if (t <= 1) {
          setPowerLevel(0);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, paused, powerTimer]);

  const answerLockedRef = useRef(false);

  const enqueueQuiz = useCallback((reason: QuizReason) => {
    answerLockedRef.current = false;
    setQuizReason(reason);
    setActiveQuiz(pickQuiz());
    setPhase("quiz");
  }, [pickQuiz]);

  /** Hullám indítása: spawn count + intro-banner. A kvíz ezt MEGELŐZI. */
  const beginWaveSpawning = useCallback(() => {
    waveIntermissionRef.current = false;
    enemiesSpawnedThisWaveRef.current = 0;
    // Boss-pálya: a 12. hullám egy boss
    enemiesPerWaveRef.current = waveRef.current === BOSS_FINAL_WAVE
      ? 1
      : 4 + Math.min(waveRef.current * 2, 18);
  }, []);

  const startNewRun = useCallback(() => {
    runLevelRef.current = levels.level;
    levelClearedRef.current = false;
    adaptiveRef.current.reset(grade ?? 4, runLevelRef.current);
    gradeSeenRef.current = createGradeQuizSeen();
    answerLockedRef.current = false;
    scoreSubmittedRef.current = false;
    streakProtector.resetProtector();
    setRevealCorrectIdx(null);
    setWrongIdx(null);
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
    scoreRef.current = 0;
    shakeRef.current = 0;
    setScore(0);
    setWave(1);
    setLives(3);
    setCombo(0);
    setPowerLevel(0);
    setPowerTimer(0);
    setShieldTimer(0);
    setBombs(0);
    setTimeLeft(ROUND_LIMIT_SEC);
    setEnemiesKilled(0);
    setGameWon(false);
    setPaused(false);
    setSavedToast(null);
    enemiesPerWaveRef.current = 0;
    enemiesSpawnedThisWaveRef.current = 0;
    waveIntermissionRef.current = false;
    lastTimeRef.current = null;
    gameElapsedRef.current = 0;
    lastSpawnAtRef.current = 0;
    enqueueQuiz("wave");
  }, [enqueueQuiz, grade, levels.level]);

  /** G-1: magyarázó kártya rossz válaszra. */
  const [feedback, setFeedback] = useState<FeedbackCard | null>(null);

  const dismissFeedback = useCallback(() => {
    setFeedback(null);
    setRevealCorrectIdx(null);
    setWrongIdx(null);
    setActiveQuiz(pickQuiz());
    answerLockedRef.current = false;
  }, [pickQuiz]);

  /* ============== Quiz választ feldolgoz ============== */

  const onAnswer = (idx: number) => {
    if (!activeQuiz || phase !== "quiz" || answerLockedRef.current) return;
    answerLockedRef.current = true;
    adaptiveRef.current.answer(idx === activeQuiz.correctIndex);
    if (revealCorrectIdx !== null) return; // 1.5s reveal alatt nincs ismételt válasz
    maybeClaimCouponBonus(coupon, activeQuiz.id, idx);
    if (idx !== activeQuiz.correctIndex) {
      sfxError();
      setWrongShake(true);
      pushTimeout(() => setWrongShake(false), 320);
      setRevealCorrectIdx(activeQuiz.correctIndex);
      setWrongIdx(idx);
      const outcome = streakProtector.handleWrong({ streak: combo });
      if (outcome === "warned") sfxWarning();
      else setCombo(0);
      // G-1: a másfél másodperces felfedés megmutatta, MELYIK a jó válasz, de azt
      // nem, hogy MIÉRT. A téves fogalom így érintetlenül maradt — pedig épp azt
      // kellene javítani. A kártya addig áll, amíg a gyerek be nem zárja.
      setFeedback(
        buildFeedback({
          quiz: {
            prompt: activeQuiz.prompt,
            options: activeQuiz.options,
            correctIndex: activeQuiz.correctIndex,
            // A séma `null`-t is enged (régi sor); a motor `undefined`-ot vár.
            explanation: activeQuiz.explanation ?? undefined,
          },
          chosenIndex: idx,
          attempt: 0,
          ageBand: "kid",
        }),
      );
      return;
    }
    // Helyes válasz
    sfxSuccess();

    setActiveQuiz(null);
    setRevealCorrectIdx(null);
    setWrongIdx(null);
    if (quizReason === "wave") {
      sfxLevelUp();
      // A hullám elindítja a spawning-ot
      beginWaveSpawning();
      // Bónusz pontok jó válaszért
      setScore((s) => s + 50);
      scoreRef.current += 50;
    } else {
      // Hit-quiz után rövid invuln idő
      playerRef.current.invuln = 2.0;
    }
    setPhase("play");
  };

  /* ============== Three.js inicializálás ============== */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const tier = detectLookTier();
    const budget = LOOK_BUDGET[tier];
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier !== "low", alpha: false });
    applyRendererLook(renderer, tier, { exposure: 0.95, shadows: false });
    renderer.setClearColor("#02041a");

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

    const postFx = createPostFx(renderer, scene, camera, tier, { strength: 0.7, radius: 0.45, threshold: 0.86 });

    sceneRefs.current = {
      scene, camera, renderer, starfield, nebula, playerGroup, thrusterMesh, shieldMesh, shieldFullMesh,
      brightStars, planet, postFx, sparkles, thrusterGlow, bulletGlow,
      reducedParticles: budget.particleScale,
      enemiesGroup, bulletsGroup, pickupsGroup,
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
      const dt = last == null ? 0 : Math.min(0.05, (t - last) / 1000);
      lastDtRef.current = dt;

      tickRef.current(dt);
      renderRef.current(t / 1000);

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
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
      sceneRefs.current = null;
    };
  }, []);

  /* ===================== Tick (game logic) ===================== */
  const tick = (dt: number) => {
    if (phaseRef.current !== "play" || pausedRef.current) {
      // Kvíz / szünet alatt nincs játéklogika. A csillagmezőt a render()
      // animálja (egy helyen — korábban itt IS futott, ami dupla-sebességet
      // okozott kvíz alatt).
      void dt;
      return;
    }
    const p = playerRef.current;
    if (!p.alive) return;

    // Játékos mozgás — tehetetlenség + átló-normalizálás (physics.ts)
    let mx = 0, my = 0;
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
    // Pajzs-időzítő — másodpercenként, közben a render már 1s-os granuláris
    if (shieldTimerRef.current > 0) {
      shieldTimerRef.current = Math.max(0, shieldTimerRef.current - dt);
      // 1 másodpercenként frissítjük a state-et a HUD-hoz (perf)
      const ceiled = Math.ceil(shieldTimerRef.current);
      if (ceiled !== Math.ceil(shieldTimerRef.current + dt)) {
        setShieldTimer(ceiled);
      }
    }

    // Lövés
    if ((keysRef.current.fire || touchRef.current.fire) && p.cooldown <= 0) {
      const cd = powerLevelRef.current >= 2 ? BULLET_TRIPLE_COOLDOWN : BULLET_COOLDOWN;
      p.cooldown = cd;
      const id = nextEntityIdRef.current++;
      bulletsRef.current.push({ id, x: p.x, y: p.y + 0.7, vx: 0, vy: BULLET_SPEED, life: 1.6, fromEnemy: false });
      if (powerLevelRef.current >= 1) {
        bulletsRef.current.push({ id: nextEntityIdRef.current++, x: p.x - 0.45, y: p.y + 0.5, vx: -3.0, vy: BULLET_SPEED * 0.96, life: 1.6, fromEnemy: false });
        bulletsRef.current.push({ id: nextEntityIdRef.current++, x: p.x + 0.45, y: p.y + 0.5, vx:  3.0, vy: BULLET_SPEED * 0.96, life: 1.6, fromEnemy: false });
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

    gameElapsedRef.current += dt;

    // Spawn logika a hullámon belül — elapsed óra, nem fali idő (kvíz alatt áll)
    if (!waveIntermissionRef.current && enemiesSpawnedThisWaveRef.current < enemiesPerWaveRef.current) {
      const spawnInterval = clamp(1.4 - waveRef.current * 0.06, 0.4, 1.4) * (1.4 - adaptiveRef.current.band * 0.6);
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
          e.fireCooldown = randRange(1.4, 2.2);
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
        setCombo(0);
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
            handleEnemyDestroyed(e);
          } else {
            sfxHit();
          }
          break;
        }
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
          return; // azonnal meg kell állnunk és kvíz dialógra váltanunk
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
      if (newWave > 12) {
        // Győzelem (elvileg ide csak akkor jutunk, ha a boss-ág nem futott le)
        setGameWon(true);
        setPhase("over");
        return;
      }
      waveRef.current = newWave;
      setWave(newWave);
      // Új hullám kvízzel indul
      enqueueQuiz("wave");
    }

    if (shakeRef.current > 0) shakeRef.current = Math.max(0, shakeRef.current - dt * 8);

    // Boss HP-szinkron a HUD-hoz
    const boss = enemiesRef.current.find((e) => !e.dead && e.kind === "boss");
    if (boss) {
      if (bossHpRef.current !== boss.hp) {
        bossHpRef.current = boss.hp;
        setBossHp(boss.hp);
      }
    } else if (bossHpRef.current !== null) {
      bossHpRef.current = null;
      setBossHp(null);
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
    const refs = sceneRefs.current;
    if (refs) {
      const mesh = buildBossMesh();
      mesh.position.set(e.x, e.y, 0);
      refs.enemiesGroup.add(mesh);
      refs.enemyMeshById.set(id, mesh);
    }
  };

  /** Hullám-spawn: a hullámszámmal súlyozottan vegyíti az ellenfél-típusokat. */
  const spawnEnemyForWave = () => {
    // Boss-pálya: 12. hullám első spawn = boss, utána semmi
    if (waveRef.current === BOSS_FINAL_WAVE) {
      if (enemiesSpawnedThisWaveRef.current === 0) {
        spawnBoss();
      }
      return;
    }
    enemiesSpawnedThisWaveRef.current += 1;
    const w = waveRef.current;
    // Minden hullámmal több crystal/alien/fighter — első hullámban főleg sziklák.
    const roll = Math.random();
    let kind: EnemyKind = "rock";
    if (w >= 2 && roll < 0.10) kind = "crystal";
    else if (w >= 3 && roll < 0.25) kind = "alien";
    else if (w >= 4 && roll < 0.40) kind = "fighter";
    else if (w >= 2 && roll < 0.55) kind = "crystal";
    // ha rock → 70% nagy, 25% közepes, 5% kicsi (rendszerint nagy spawnol, és majd hasad)
    let size: 1 | 2 | 3 = 3;
    if (kind === "rock") {
      const r2 = Math.random();
      size = r2 < 0.70 ? 3 : r2 < 0.95 ? 2 : 1;
    }
    const id = nextEntityIdRef.current++;
    const x = randRange(-GAME_W / 2 + 1.2, GAME_W / 2 - 1.2);
    const y = GAME_H / 2 + randRange(0.6, 2.2);
    const baseVy = -1.0 - Math.min(w * 0.10, 1.6);
    const e: EnemyState = {
      id, kind, size,
      x, y,
      vx: kind === "fighter" ? 0 : randRange(-0.7, 0.7),
      vy: kind === "alien" ? -0.55 : kind === "fighter" ? -0.85 : baseVy + randRange(-0.4, 0.0) - (3 - size) * 0.25,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: kind === "rock" || kind === "crystal" ? randRange(-1.4, 1.4) : 0.6,
      hp: kind === "rock" ? size : kind === "crystal" ? 1 : kind === "alien" ? 2 : 3,
      flash: 0,
      dead: false,
      spawnAt: (lastTimeRef.current ?? 0) / 1000,
      phase: 0,
      fireCooldown: kind === "fighter" ? randRange(1.0, 2.0) : 0,
    };
    enemiesRef.current.push(e);
    // Mesh hozzáadása a Three.js scenehez
    const refs = sceneRefs.current;
    if (refs) {
      let mesh: THREE.Object3D;
      if (kind === "rock") mesh = buildRockMesh(size);
      else if (kind === "crystal") mesh = buildCrystalMesh();
      else if (kind === "alien") mesh = buildAlienMesh();
      else mesh = buildFighterMesh();
      mesh.position.set(x, y, 0);
      refs.enemiesGroup.add(mesh);
      refs.enemyMeshById.set(id, mesh);
    }
  };

  /** Aszteroida-megsemmisülés: pont, lehasadás, pickup-szórás. */
  const handleEnemyDestroyed = (e: EnemyState) => {
    e.dead = true;
    comboRef.current = comboRef.current + 1;
    if (comboRef.current > bestComboRef.current) bestComboRef.current = comboRef.current; // D2
    setCombo(comboRef.current);
    enemiesKilledRef.current += 1;
    setEnemiesKilled(enemiesKilledRef.current);
    if (e.kind === "alien") alienKillsRef.current += 1;
    const baseXp = ENEMY_BASE_XP[e.kind] * (e.kind === "rock" ? e.size : 1);
    const comboBonus = Math.min(20, comboRef.current * 4);
    const total = baseXp + comboBonus;
    scoreRef.current += total;
    setScore(scoreRef.current);

    // BOSS megsemmisült → játék-győzelem (12. hullám clear)
    if (e.kind === "boss") {
      shakeRef.current = 2.5;
      const refs = sceneRefs.current;
      if (refs) {
        refs.flashLight.intensity = 8.0;
        burstAt.set(e.x, e.y, 0.3);
        refs.sparkles.emit(burstAt, { count: 220, color: EXPLOSION_COLORS.boss, speed: 10, life: 1.5, size: 0.45 });
        refs.sparkles.emit(burstAt, { count: 120, color: "#ff7af5", speed: 6, life: 1.2, size: 0.38 });
      }
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
      setGameWon(true);
      pushTimeout(() => setPhase("over"), 1500); // robbanás-effekt ideje
      return;
    }

    // Hasadás csak rock-nál — szétrepülés merőleges kick-kel (physics.ts)
    if (e.kind === "rock" && e.size > 1) {
      const parentSize = e.size as 2 | 3;
      const shards = splitRock(
        { x: e.x, y: e.y, vx: e.vx, vy: e.vy, size: parentSize },
        Math.random,
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
          rot: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 3.6,
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
      if (Math.random() < dropChance) {
        // 4-féle pickup: 40% life, 30% power, 20% shield, 10% bomb
        const r = Math.random();
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
      refs.flashLight.position.set(e.x, e.y, 3);
      refs.flashLight.intensity = 3.5;
      burstAt.set(e.x, e.y, 0.3);
      refs.sparkles.emit(burstAt, {
        count: Math.round(42 * Math.max(0.5, refs.reducedParticles)),
        color: EXPLOSION_COLORS[e.kind],
        speed: 6,
        life: 0.85,
        size: 0.3,
      });
      refs.sparkles.emit(burstAt, { count: 14, color: "#ffffff", speed: 3, life: 0.35, size: 0.5 });
    }
    shakeRef.current = 0.4;
  };

  /** Hit-quiz mechanika: kvízig pause, ellenfelet eltávolítjuk az ütközéskor. */
  const handleHit = (e: EnemyState | null) => {
    if (e) {
      e.dead = true;
      shakeRef.current = 1.0;
      const refs = sceneRefs.current;
      if (refs) {
        refs.flashLight.intensity = 5.5;
        burstAt.set(playerRef.current.x, playerRef.current.y, 0.3);
        refs.sparkles.emit(burstAt, { count: 36, color: "#ff4d6d", speed: 5, life: 0.7, size: 0.3 });
      }
    }
    // AZONNALI takarítás: a tick a kvíz-fázisban korán kilép, a halott
    // ellenfél egyébként a kvíz-overlay alatt a pályán maradna (mesh + state).
    enemiesRef.current = enemiesRef.current.filter((en) => !en.dead);
    comboRef.current = 0;
    setCombo(0);
    // ÉLET-MECHANIKA: ütközés = -1 élet. 0 életnél game over (a HUD szívei
    // eddig csak dekoráció voltak — a lives sosem csökkent).
    const nextLives = Math.max(0, livesRef.current - 1);
    livesRef.current = nextLives;
    setLives(nextLives);
    if (nextLives <= 0) {
      sfxExplode();
      setGameWon(false);
      setPhase("over");
      return;
    }
    playerRef.current.invuln = 0.3; // rövid pre-quiz invuln
    enqueueQuiz("hit");
  };

  /** Pickup begyűjtése. */
  const applyPickup = (pu: PickupState) => {
    sfxPickup();
    if (pu.kind === "life") {
      const next = Math.min(9, livesRef.current + 1);
      livesRef.current = next;
      setLives(next);
      setSavedToast("Megúsztál egy kvízt!");
      pushTimeout(() => setSavedToast(null), 2200);
      scoreRef.current += 35;
      setScore(scoreRef.current);
    } else if (pu.kind === "shield") {
      // Pajzs: 8s teljes invuln (kék gyűrű mutat). Stack-elhető (eddigi shieldTimer + 8s).
      shieldTimerRef.current = Math.min(20, shieldTimerRef.current + 8);
      setShieldTimer(shieldTimerRef.current);
      setSavedToast("Pajzs aktiválva!");
      pushTimeout(() => setSavedToast(null), 1800);
      scoreRef.current += 25;
      setScore(scoreRef.current);
    } else if (pu.kind === "bomb") {
      // Bomb: +1 készletre, B-billentyűvel vagy touch-gombbal süthető le.
      bombsRef.current = Math.min(5, bombsRef.current + 1);
      setBombs(bombsRef.current);
      setSavedToast("Bomba a tárba!");
      pushTimeout(() => setSavedToast(null), 1800);
      scoreRef.current += 30;
      setScore(scoreRef.current);
    } else {
      // Power-up: 1 vagy 2-szintű, mindkét esetben +10s
      const next = Math.min(2, powerLevelRef.current + 1);
      powerLevelRef.current = next;
      setPowerLevel(next);
      powerTimerRef.current = POWER_DURATION;
      setPowerTimer(POWER_DURATION);
      scoreRef.current += 20;
      setScore(scoreRef.current);
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
    if (phaseRef.current !== "play") return;
    bombsRef.current = Math.max(0, bombsRef.current - 1);
    setBombs(bombsRef.current);
    sfxExplode();
    shakeRef.current = 1.5;
    const refs = sceneRefs.current;
    if (refs) {
      refs.flashLight.intensity = 7.0;
      // Bomba: táguló fénygyűrű a hajó körül.
      burstAt.set(playerRef.current.x, playerRef.current.y, 0.2);
      refs.sparkles.emit(burstAt, { count: 180, color: "#7df9ff", speed: 14, life: 0.9, size: 0.34 });
      refs.sparkles.emit(burstAt, { count: 90, color: "#ff7af5", speed: 9, life: 1.1, size: 0.3 });
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
      setCombo(comboRef.current);
    }
    // Ellenséges lövedékek is törlődnek
    for (const b of bulletsRef.current) {
      if (b.fromEnemy) b.life = 0;
    }
  };

  /* ===================== Render (Three.js) ===================== */
  const exhaustOrigin = useMemo(() => new THREE.Vector3(), []);
  const exhaustDir = useMemo(() => new THREE.Vector3(0, -1, 0), []);
  const burstAt = useMemo(() => new THREE.Vector3(), []);
  const render = (now: number) => {
    const refs = sceneRefs.current;
    if (!refs) return;
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
    thrusterMesh.scale.set(1 + Math.random() * 0.2, moving2 ? 1.4 + Math.random() * 0.5 : 0.5, 1);
    thrusterMesh.material.opacity = moving2 ? 0.85 : 0.4;
    refs.thrusterGlow.material.opacity = moving2 ? 0.6 + Math.random() * 0.25 : 0.3;
    // Hajtómű-csóva: meleg szikrák a hajó mögött (mozgáscsökkentésnél ritkábban).
    if (moving2 && playerGroup.visible && frameDt > 0) {
      const rate = (reducedMotionRef.current ? 18 : 70) * refs.reducedParticles;
      const count = Math.floor(rate * frameDt + Math.random());
      if (count > 0) {
        exhaustOrigin.set(p.x, p.y - 1.15, 0.1);
        refs.sparkles.emit(exhaustOrigin, {
          count,
          color: Math.random() < 0.5 ? "#ffcf4a" : "#ff7a3d",
          speed: 2.6,
          life: 0.45,
          size: 0.22,
          direction: exhaustDir,
          directionality: 0.85,
          spread: 0.25,
        });
      }
    }
    refs.sparkles.update(frameDt);
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
      const mesh = refs.enemyMeshById.get(e.id);
      if (!mesh) continue;
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
      const mesh = refs.pickupMeshById.get(pu.id);
      if (!mesh) continue;
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

    // Flash light fadeout
    if (flashLight.intensity > 0) {
      flashLight.intensity = Math.max(0, flashLight.intensity - 0.18);
    }

    // Camera shake.
    // G-5: mozgáscsökkentésnél teljesen elmarad. A rázás okozza a rosszullétet,
    // nem a részecskék — és aki rosszul lesz tőle, nem hibát jelent, hanem
    // abbahagyja a játékot.
    if (shakeRef.current > 0 && !reducedMotionRef.current) {
      camera.position.x = (Math.random() - 0.5) * shakeRef.current * 0.6;
      camera.position.y = CAMERA_Y + (Math.random() - 0.5) * shakeRef.current * 0.4;
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
          if (phaseRef.current === "play") setPaused((q) => !q);
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
    // D4: reset all movement flags on window blur (prevents stuck keys on tab/window switch)
    const onBlur = () => {
      keysRef.current.left = false;
      keysRef.current.right = false;
      keysRef.current.up = false;
      keysRef.current.down = false;
      keysRef.current.fire = false;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

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
    void apiRequest("POST", "/api/games/score", {
      gameId: "space-asteroid-quiz",
      difficulty: "normal",
      runXp: scoreRef.current,
      runStreak: bestComboRef.current, // D2: run-level best, not current
      runSeconds: ROUND_LIMIT_SEC - timeLeft,
    })
      .then(() => void queryClient.invalidateQueries({ queryKey: ["/api/games/leaderboard"] }))
      .catch(() => { scoreSubmittedRef.current = false; });
  }, [phase, syncEligibility, timeLeft]);

  // Achievement + Daily — egyszer fut "over" átmenetkor.
  const achievementCheckedRef = useRef(false);

  // D6 a11y: quiz-overlay dialog ref + Escape + auto-focus
  const quizDialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase !== "quiz") return;
    const t = window.setTimeout(() => {
      const first = quizDialogRef.current?.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]");
      first?.focus();
    }, 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [phase]);
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
      correctAnswers: enemiesKilledRef.current, // ≈ a leszedett ellenfél = helyes válasz proxy
      wrongAnswers: 0,
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

  // A győzelem (12 hullám / boss) a következő pályát oldja fel; a menü azt ajánlja.
  useEffect(() => {
    if (phase === "over" && gameWon && runLevelRef.current != null && !levelClearedRef.current) {
      levelClearedRef.current = true;
      levels.complete(runLevelRef.current);
    }
  }, [phase, gameWon]);

  /* ===================== Render JSX ===================== */
  const onPickGrade = (g: number) => {
    setGrade(g);
    saveGrade(g);
    // Spec 2026-09-29: a saját választó marad, de a közös classroomStore-ba is ír.
    saveClassroomGrade(g);
    setPhase("intro");
  };

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
    <div data-game="SpaceAsteroidQuiz" data-playing={phase === "play" || phase === "quiz"}
      className="game-shell-fixed min-h-screen relative overflow-hidden text-white" style={{
      background: "radial-gradient(ellipse at 22% 18%, rgba(255,0,255,0.18), transparent 38%), radial-gradient(ellipse at 80% 12%, rgba(0,240,255,0.20), transparent 42%), linear-gradient(180deg, #02041a 0%, #08051b 100%)",
    }}>
      <AchievementToast achievements={newlyUnlocked} />
      <main className="relative z-10 w-full max-w-xl lg:max-w-3xl mx-auto px-2 sm:px-5 py-2 sm:py-4 min-h-dvh min-h-screen flex flex-col pb-20 sm:pb-10">
        {/* LS-4: earned play time — renders nothing without a coupon. */}
        <CouponHud session={coupon} />
        <CouponExpiredOverlay session={coupon} />
        <header className="flex items-center justify-between gap-1 mb-1">
          <Link href="/games"><Button variant="ghost" size="sm" className="text-white/90 hover:bg-white/10 gap-1 -ml-2 h-11 px-3"><ArrowLeft className="w-4 h-4" />Játékok</Button></Link>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <AudioToggleButton size="icon" />
            <span className="flex items-center gap-1 text-amber-300"><Star className="w-4 h-4" />{score}</span>
            <span className="flex items-center gap-1 text-emerald-300"><Heart className="w-4 h-4" />{lives}</span>
          </div>
        </header>

        <Card className="border border-cyan-400/45 bg-slate-950/85 backdrop-blur-md shadow-[0_16px_48px_rgba(0,0,0,0.45)] flex-1 flex flex-col min-h-0">
          <CardContent data-game-card-content className={`flex flex-col flex-1 min-h-0 ${phase === "play" || phase === "quiz" ? "p-1.5 sm:p-3" : "p-3"}`}>
            {phase !== "play" && phase !== "quiz" && (
              <div className="flex items-center gap-2 mb-1">
                <Rocket className="w-5 h-5 text-cyan-300" />
                <h1 className="text-base font-extrabold">Galaktikus Aszteroida Kvíz</h1>
              </div>
            )}

            {phase === "grade" && (
              <div className="flex flex-col items-center justify-center flex-1 gap-4 py-6">
                <p className="text-sm font-semibold text-cyan-100/95 max-w-md text-center">
                  Válaszd ki, hányadik osztályos vagy! Az osztályod legutóbbi 3 tananyagából jönnek a kérdések — ami nincs még feldolgozva, azt általános kvízekkel pótoljuk.
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-w-md">
                  {GRADES.map((g) => (
                    <Button
                      key={g}
                      type="button"
                      onClick={() => onPickGrade(g)}
                      className="h-12 text-base font-extrabold bg-gradient-to-br from-cyan-700 to-violet-800 hover:from-cyan-500 hover:to-violet-600 border border-cyan-300/40"
                    >
                      {g}.
                    </Button>
                  ))}
                </div>
                <p className="text-[11px] text-white/50 max-w-md text-center mt-2">
                  Az osztályod a böngésződben tárolódik (nem küldjük el sehova) — később bármikor megváltoztathatod a Menüben.
                </p>
              </div>
            )}

            {phase === "intro" && (
              <>
                <GamePedagogyPanel
                  accent="cyan"
                  className="mb-2"
                  kidMission={'Lődd ki az aszteroidákat, alien csészealjakat és ellenséges vadászgépeket! Minden hullám előtt és minden ütközés után egy gyors kvíz jön — a saját osztályod tananyagából. Helyes válasz → tovább, rossz → új kérdés. Életet adó pickup mellé jár egy bónusz: Megúsztál egy kvízt!'}
                  parentBody={
                    <>
                      <strong className="text-cyan-100/90">Tananyag:</strong> a játékos osztálya és a legutóbbi 3 feltöltött tananyaga alapján a backend automatikusan szállítja a kérdéseket. Ha még nincs kapcsolt kvíz, általános bank szolgál.
                      <br />
                      <strong className="text-cyan-100/90">Fejleszt:</strong> reakcióidő, térbeli figyelem, számolás / olvasás gyors döntés mellett, kitartás (új kvíz rossz válasz után).
                      <br />
                      <span className="text-white/55">A klasszikus akadály + teszt + jutalom ciklust egy 3D shooter formába helyezi.</span>
                    </>
                  }
                />
                <p className="text-[11px] text-cyan-100/90 mb-2 border border-cyan-700/45 rounded px-2 py-1.5 bg-slate-900/95">{syncBanner}</p>
                {matStatusLabel && (
                  <p className="text-[11px] text-amber-100/90 mb-2 border border-amber-700/45 rounded px-2 py-1.5 bg-slate-900/95 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    {matStatusLabel}
                  </p>
                )}
                <div data-game-menu="space" className="flex flex-col items-center justify-center flex-1 gap-3 py-4">
                  <div className="grid grid-cols-2 gap-2 max-w-sm w-full">
                    <div className="rounded-xl border border-cyan-600/45 bg-slate-900/85 p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-cyan-300 font-bold">Szikla</p>
                      <p className="text-[11px] text-white/70">3 méret · hasad</p>
                    </div>
                    <div className="rounded-xl border border-sky-500/55 bg-slate-900/85 p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-sky-300 font-bold">Kristály</p>
                      <p className="text-[11px] text-white/70">+60 XP · pickup</p>
                    </div>
                    <div className="rounded-xl border border-lime-500/55 bg-slate-900/85 p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-lime-300 font-bold">Alien UFO</p>
                      <p className="text-[11px] text-white/70">cikkcakk · +80 XP</p>
                    </div>
                    <div className="rounded-xl border border-rose-500/55 bg-slate-900/85 p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-rose-300 font-bold">Ellenséges vadász</p>
                      <p className="text-[11px] text-white/70">homing · lő · +120 XP</p>
                    </div>
                  </div>
                  <p className="text-xs text-white/80 text-center max-w-xs">A/D vagy nyilak: mozgás, W/▲: előre, Space: tűz, P: szünet. Mobilon a képernyő alján gombok.</p>
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-cyan-500 to-fuchsia-600 hover:from-cyan-400 hover:to-fuchsia-500 border border-cyan-300/40 font-bold text-white shadow-lg text-base"
                    onClick={startNewRun}
                    data-testid="sa-start"
                  >
                    <Rocket className="w-4 h-4 mr-2" />Indulhat — {grade}. osztály{levels.level != null ? ` · ${levels.level}. pálya` : ""}
                  </Button>
                  {levels.active && levels.level != null ? (
                    <GradeLevelPicker
                      value={levels.level}
                      unlocked={levels.unlocked}
                      onChange={levels.select}
                      label={`Pálya — ${grade}. osztály`}
                    />
                  ) : null}
                  <button
                    type="button"
                    className="text-[11px] text-white/50 hover:text-cyan-200 underline-offset-4 hover:underline"
                    onClick={() => { setGrade(null); setPhase("grade"); }}
                  >
                    Más osztály választása
                  </button>
                </div>
              </>
            )}

            {/*
              A canvas-t MINDIG render-eljük (még az "intro"/"grade"/"over" fázisokban
              is), de csak a `display`-jét kontrolláljuk a phase alapján. Így a Three.js
              useEffect azonnal a komponens mountjakor inicializálni tudja a scenet,
              és nem kell minden átmenetnél a teljes 3D scene-t újraépíteni.
            */}
            <div className={`game-play-stack flex flex-1 min-h-0 flex-col items-center gap-1.5 ${phase === "play" || phase === "quiz" ? "" : "hidden"}`}>
                <div className="relative rounded-xl overflow-hidden border-2 border-cyan-700/70 shadow-[0_0_28px_rgba(0,240,255,0.18)] w-full bg-black game-scene flex-1 min-h-0">
                  <canvas ref={canvasRef} className="block touch-manipulation w-full h-full" style={{ width: "100%", height: "100%" }} />
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,transparent_56%,rgba(0,0,0,0.32)_100%)]" />
                  <div className={`pointer-events-none absolute left-2 top-2 rounded-lg border bg-slate-950/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                    wave === BOSS_FINAL_WAVE
                      ? "border-rose-400 text-rose-200 animate-pulse"
                      : "border-cyan-300/40 text-cyan-100"
                  }`}>
                    {wave === BOSS_FINAL_WAVE ? "★ BOSS HULLÁM ★" : `Hullám ${wave}/12`}
                  </div>
                  <div className="pointer-events-none absolute right-2 top-2 rounded-lg border border-amber-300/40 bg-slate-950/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-100 flex items-center gap-1">
                    {timeLeft}s
                  </div>
                  {bossHp !== null && (
                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-2 w-[68%] max-w-md">
                      <div className="rounded border-2 border-rose-400/85 bg-rose-950/85 px-2 py-1.5 shadow-[0_0_20px_rgba(255,80,140,0.55)]">
                        <div className="flex items-center justify-between text-[10px] font-extrabold text-rose-100 uppercase tracking-wider mb-1">
                          <span>★ ALIEN ANYAHAJÓ</span>
                          <span className="tabular-nums">{bossHp} / {BOSS_TOTAL_HP}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-rose-950/80 overflow-hidden border border-rose-300/40">
                          <div
                            className="h-full bg-gradient-to-r from-rose-500 via-fuchsia-400 to-rose-300 transition-all"
                            style={{ width: `${Math.max(0, Math.min(100, (bossHp / BOSS_TOTAL_HP) * 100))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {savedToast && (
                    <motion.div
                      key={savedToast}
                      initial={{ y: -12, opacity: 0, scale: 0.9 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      exit={{ y: -12, opacity: 0 }}
                      className="absolute top-12 left-1/2 -translate-x-1/2 rounded-lg bg-emerald-500/95 text-slate-950 font-bold text-xs px-3 py-1.5 shadow-md flex items-center gap-1.5 pointer-events-none"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      {savedToast}
                    </motion.div>
                  )}
                </div>

                {/* Touch kontrollok — csak coarse pointer (C2). */}
                {coarsePointer ? (
                <div
                  className="flex items-center justify-between gap-3 w-full"
                  data-testid="sa-touch-controls"
                  style={{
                    touchAction: "none",
                    userSelect: "none",
                    WebkitTouchCallout: "none",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <VirtualJoystick
                    label="Hajó irányítása"
                    radius={54}
                    onChange={(v) => {
                      const dirs = joystickToDirections(v);
                      touchRef.current.left = dirs.left;
                      touchRef.current.right = dirs.right;
                      // A joystick „előre" iránya fölfelé mutat; a hajó `up`
                      // vezérlője ugyanezt jelenti.
                      touchRef.current.up = dirs.fwd;
                      touchRef.current.down = dirs.back;
                    }}
                  />
                  <HoldButton
                    label="Tűz"
                    onHoldStart={() => {
                      touchRef.current.fire = true;
                    }}
                    onHoldEnd={() => {
                      touchRef.current.fire = false;
                    }}
                    className="h-[108px] w-[108px] rounded-full bg-rose-700 hover:bg-rose-600 text-white border-2 border-rose-200/40 shadow-lg text-sm font-extrabold flex items-center justify-center active:scale-95"
                  >
                    🚀 TŰZ
                  </HoldButton>
                </div>
                ) : (
                  <p className="w-full text-center text-[11px] text-white/55" data-testid="sa-keyboard-hint">
                    Billentyűzet: nyilak / WASD mozgat · Space tűz · B bomba
                  </p>
                )}

                {/* HUD */}
                <div className="w-full flex items-center gap-1.5">
                  <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className={`h-full transition-all ${timeLeft < 60 ? "bg-gradient-to-r from-rose-500 to-amber-400" : "bg-gradient-to-r from-cyan-400 to-fuchsia-500"}`} style={{ width: `${(timeLeft / ROUND_LIMIT_SEC) * 100}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-white/80 tabular-nums min-w-[32px] text-right">{timeLeft}s</span>
                </div>
                <div className="w-full flex items-center justify-between text-[10px] font-semibold text-white/70 flex-wrap gap-x-2">
                  <span>XP: <strong className="text-amber-300">{score}</strong></span>
                  <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-emerald-300" /><strong>{lives}</strong></span>
                  <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-yellow-300" />{powerLevel > 0 ? `${powerTimer}s` : "–"}</span>
                  <span className={`flex items-center gap-1 ${shieldTimer > 0 ? "text-sky-300 font-bold" : "text-white/50"}`} title="Pajzs (8s teljes invuln)">
                    🛡️ {shieldTimer > 0 ? `${shieldTimer}s` : "–"}
                  </span>
                  <button
                    type="button"
                    onClick={detonateBomb}
                    disabled={bombs <= 0}
                    className={`flex items-center gap-1 ${bombs > 0 ? "text-orange-300 font-bold hover:text-orange-200 cursor-pointer" : "text-white/40 cursor-not-allowed"}`}
                    title="Bomba (B billentyű) — minden ellenfél megsemmisül (boss: -12 HP)"
                    data-testid="button-bomb"
                  >
                    💣 {bombs}
                  </button>
                  <span>Combo: <strong className="text-fuchsia-300">{combo}</strong></span>
                </div>
                <div className="flex gap-2 justify-center w-full">
                  <Button type="button" size="sm" className="bg-amber-600/80 hover:bg-amber-500 text-slate-950 border border-amber-200/45 shadow-md text-xs px-3 py-1" onClick={() => { setPhase("over"); }}>Kör vége</Button>
                </div>
              </div>

            {phase === "over" && (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 py-8 text-center" data-testid="sa-over">
                <Rocket className={`w-12 h-12 ${gameWon ? "text-amber-300" : "text-cyan-400"}`} />
                <p className="text-lg font-bold">{gameWon ? "Kalandod sikeres! Mind a 12 hullám teljesítve!" : "Kör vége"}</p>
                <p className="text-sm text-white/75">XP: <strong className="text-amber-300">{score}</strong> · Hullám: <strong>{wave}/12</strong> · Kilőve: <strong>{enemiesKilled}</strong></p>
                {syncEligibility?.eligible ? <p className="text-xs text-emerald-300/90">Eredmény elküldve.</p> : <p className="text-xs text-white/50 max-w-xs">{syncBanner}</p>}
                <div className="flex gap-2">
                  <Button className="bg-cyan-700 hover:bg-cyan-600" onClick={startNewRun}><RotateCcw className="w-4 h-4 mr-1" />Új kör</Button>
                  <Button variant="outline" className="border-white/40 text-white" onClick={() => { setPhase("intro"); }}>Vissza</Button>
                  <Link href="/games"><Button variant="outline" className="border-white/40 text-white">Lista</Button></Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Quiz overlay — phase==="quiz" */}
      <AnimatePresence>
        {phase === "quiz" && activeQuiz && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Kvíz kérdés"
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/85 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              ref={quizDialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="Mini-teszt"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className={`game-quiz w-full max-w-md rounded-2xl border-2 border-cyan-400/55 bg-slate-950/95 p-4 shadow-2xl ${wrongShake ? "animate-shake-spq" : ""}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                  quizReason === "wave"
                    ? "bg-cyan-600/70 text-cyan-50 border-cyan-300/60"
                    : "bg-rose-600/70 text-rose-50 border-rose-300/60"
                }`}>
                  {quizReason === "wave" ? `Hullám ${wave} kvíz` : "Vészhelyzet — kvíz!"}
                </span>
                <span className="text-xs font-bold text-cyan-300 uppercase">
                  {activeQuiz.source === "material" ? "Tananyagodból" : activeQuiz.source === "grade" ? `${activeQuiz.grade ?? grade}. osztály` : "Általános"}
                </span>
              </div>
              <p className="text-[11px] text-white/65 mb-2">
                {quizReason === "wave"
                  ? "A hullám csak helyes válaszra indul. Rossz válasz → új kérdés."
                  : "Csak helyes válasz után folytatódik a játék. Próbálkozhatsz többször is — minden rossz válaszra új kvíz jön."}
              </p>
              <p className="text-base font-semibold mb-4">{activeQuiz.prompt}</p>
              <div className="game-quiz-answers grid gap-2">
                {activeQuiz.options.map((o, i) => {
                  const isCorrect = revealCorrectIdx === i;
                  const isWrong = wrongIdx === i;
                  const dim = revealCorrectIdx !== null && !isCorrect && !isWrong;
                  const cls = isCorrect
                    ? "min-h-[44px] h-auto py-3 text-left bg-emerald-700/70 hover:bg-emerald-700/70 text-white border-2 border-emerald-300 text-[15px] font-bold"
                    : isWrong
                      ? "min-h-[44px] h-auto py-3 text-left bg-rose-800/70 hover:bg-rose-800/70 text-white border-2 border-rose-300 text-[15px]"
                      : dim
                        ? "min-h-[44px] h-auto py-3 text-left bg-white/5 text-white/40 border border-cyan-900/20 text-[15px]"
                        : "min-h-[44px] h-auto py-3 text-left bg-white/10 hover:bg-cyan-800/55 text-white border border-cyan-900/40 text-[15px]";
                  return (
                    <Button
                      key={`${o}-${i}`}
                      variant="secondary"
                      className={cls}
                      disabled={revealCorrectIdx !== null}
                      onClick={() => onAnswer(i)}
                      {...correctDataAttrs(i === activeQuiz.correctIndex)}
                    >
                      {o}
                    </Button>
                  );
                })}
              </div>
              {streakProtector.warning && (
                <p className="mt-3 text-[11px] text-amber-300/95 font-semibold">⚠ {streakProtector.warning}</p>
              )}
              {revealCorrectIdx !== null && wrongIdx !== null && (
                <p className="mt-3 text-[11px] text-emerald-300/95">
                  A helyes válasz: <strong>{activeQuiz.options[revealCorrectIdx]}</strong>
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes shake-spq {
          0%,100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake-spq { animation: shake-spq 0.16s ease-in-out 2; }
      `}</style>
      {feedback && <QuizFeedbackCard card={feedback} onDismiss={dismissFeedback} />}

    </div>
  );
}
