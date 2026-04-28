import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
import { sfxSuccess, sfxError, sfxShoot, sfxHit, sfxExplode, sfxPickup, sfxLevelUp, sfxWarning } from "@/lib/audioEngine";
import { recordRun, type Achievement } from "@/lib/achievements";
import { isTodaysGameAvailable, markDailyCompleted } from "@/lib/dailyChallenge";
import AchievementToast from "@/components/AchievementToast";

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

type Quiz = {
  prompt: string;
  options: string[];
  correctIndex: number;
  topic?: string | null;
  source?: "material" | "fallback";
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
  items: { id?: string; prompt: string; options: string[]; correctIndex: number; topic?: string | null }[];
};

const GRADES: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Játéktér méretei (három.js world-units). 18×24 — kb. 3:4 portré-ratio, mobil-pásztázható. */
const GAME_W = 18;
const GAME_H = 24;
const PLAYER_BASE_Y = -GAME_H / 2 + 2.4; // játékos a játéktér alsó harmadánál

const PLAYER_SPEED = 7.5;
const BULLET_SPEED = 14;
const BULLET_COOLDOWN = 0.18;
const BULLET_TRIPLE_COOLDOWN = 0.10;
const POWER_DURATION = 10; // sec
const ROUND_LIMIT_SEC = 360;

/** Statikus fallback kvíz-bank — ha nincs tananyaghoz kötött kérdés a DB-ben. */
const FALLBACK_QUIZZES: Quiz[] = [
  // === Angol szókincs ===
  { prompt: "Star magyarul:", options: ["bolygó", "csillag", "hold", "felhő"], correctIndex: 1, topic: "english" },
  { prompt: "Spaceship magyarul:", options: ["repülő", "tengeralattjáró", "űrhajó", "hajó"], correctIndex: 2, topic: "english" },
  { prompt: "Asteroid magyarul:", options: ["csillagkép", "üstökös", "aszteroida", "bolygó"], correctIndex: 2, topic: "english" },
  { prompt: "Galaxy magyarul:", options: ["galaxis", "naprendszer", "csillagrendszer", "fekete lyuk"], correctIndex: 0, topic: "english" },
  { prompt: "Moon magyarul:", options: ["nap", "hold", "csillag", "föld"], correctIndex: 1, topic: "english" },
  { prompt: "Sun magyarul:", options: ["hold", "csillag", "nap", "ég"], correctIndex: 2, topic: "english" },
  { prompt: "Planet magyarul:", options: ["üstökös", "bolygó", "csillag", "üveg"], correctIndex: 1, topic: "english" },
  { prompt: "Rocket magyarul:", options: ["rakéta", "vonat", "biciklik", "űrlény"], correctIndex: 0, topic: "english" },
  { prompt: "Alien magyarul:", options: ["barát", "űrlény", "ember", "robot"], correctIndex: 1, topic: "english" },
  { prompt: "Earth magyarul:", options: ["hold", "föld", "ég", "tűz"], correctIndex: 1, topic: "english" },
  { prompt: "Light magyarul:", options: ["sötét", "fény", "árnyék", "súly"], correctIndex: 1, topic: "english" },
  { prompt: "Speed magyarul:", options: ["sebesség", "súly", "magasság", "idő"], correctIndex: 0, topic: "english" },
  { prompt: "Danger magyarul:", options: ["bátorság", "veszély", "biztonság", "pihenés"], correctIndex: 1, topic: "english" },
  { prompt: "Shield magyarul:", options: ["pajzs", "kard", "kalap", "csésze"], correctIndex: 0, topic: "english" },
  { prompt: "Power magyarul:", options: ["lassú", "puha", "erő", "kicsi"], correctIndex: 2, topic: "english" },
  // === Matematika ===
  { prompt: "Mennyi 7 × 8?", options: ["49", "54", "56", "64"], correctIndex: 2, topic: "math" },
  { prompt: "Mennyi 12 + 19?", options: ["29", "30", "31", "32"], correctIndex: 2, topic: "math" },
  { prompt: "Mennyi 100 - 47?", options: ["43", "53", "57", "63"], correctIndex: 1, topic: "math" },
  { prompt: "Mennyi 144 ÷ 12?", options: ["10", "11", "12", "13"], correctIndex: 2, topic: "math" },
  { prompt: "Mennyi 9 × 9?", options: ["72", "81", "89", "99"], correctIndex: 1, topic: "math" },
  { prompt: "Mennyi a 100 fele?", options: ["25", "40", "50", "75"], correctIndex: 2, topic: "math" },
  { prompt: "Mennyi 25 × 4?", options: ["80", "90", "100", "125"], correctIndex: 2, topic: "math" },
  { prompt: "Hány perc 2 óra?", options: ["60", "90", "120", "180"], correctIndex: 2, topic: "math" },
  { prompt: "Hány másodperc 3 perc?", options: ["120", "150", "180", "240"], correctIndex: 2, topic: "math" },
  { prompt: "Mennyi 56 ÷ 7?", options: ["6", "7", "8", "9"], correctIndex: 2, topic: "math" },
  // === Természet / Űr ===
  { prompt: "Melyik a Naprendszer legnagyobb bolygója?", options: ["Föld", "Mars", "Jupiter", "Szaturnusz"], correctIndex: 2, topic: "nature" },
  { prompt: "Hány bolygó van a Naprendszerben?", options: ["6", "7", "8", "9"], correctIndex: 2, topic: "nature" },
  { prompt: "Melyik a hozzánk legközelebbi csillag?", options: ["Sirius", "Polaris", "Nap", "Vega"], correctIndex: 2, topic: "nature" },
  { prompt: "Mi a Hold a Föld számára?", options: ["bolygó", "csillag", "kísérő", "üstökös"], correctIndex: 2, topic: "nature" },
  { prompt: "Mi az aszteroidaöv?", options: ["a Mars és Jupiter között", "a Föld körül", "a Nap belsejében", "a Hold mögött"], correctIndex: 0, topic: "nature" },
  { prompt: "Melyik bolygó a Vörös Bolygó?", options: ["Vénusz", "Mars", "Jupiter", "Szaturnusz"], correctIndex: 1, topic: "nature" },
  { prompt: "Hány hold kering a Föld körül?", options: ["1", "2", "3", "4"], correctIndex: 0, topic: "nature" },
  { prompt: "Mit termel a növény napfénnyel?", options: ["szén-dioxidot", "oxigént", "vizet", "hidrogént"], correctIndex: 1, topic: "nature" },
  // === Magyar nyelvtan ===
  { prompt: "Melyik betű magánhangzó?", options: ["b", "k", "á", "p"], correctIndex: 2, topic: "hungarian" },
  { prompt: "Hány szótagból áll a madár szó?", options: ["1", "2", "3", "4"], correctIndex: 1, topic: "hungarian" },
  { prompt: "Melyik a múlt idejű ige?", options: ["fut", "futott", "futni fog", "futna"], correctIndex: 1, topic: "hungarian" },
  { prompt: "Melyik főnév többes számú?", options: ["alma", "almák", "almás", "almázik"], correctIndex: 1, topic: "hungarian" },
  { prompt: "Mi a melléknév: a piros alma?", options: ["alma", "piros", "az", "egy"], correctIndex: 1, topic: "hungarian" },
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
  const bodyMat = new THREE.MeshStandardMaterial({
    color: "#00f0ff",
    emissive: "#0a4a55",
    emissiveIntensity: 0.55,
    roughness: 0.35,
    metalness: 0.55,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: "#ff00ff",
    emissive: "#5e1f5e",
    emissiveIntensity: 0.6,
    roughness: 0.4,
    metalness: 0.45,
  });
  const cockpitMat = new THREE.MeshStandardMaterial({
    color: "#fff700",
    emissive: "#fff7a0",
    emissiveIntensity: 0.85,
    roughness: 0.15,
    metalness: 0.3,
  });

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.0, 8), bodyMat);
  nose.position.set(0, 0.55, 0.05);
  group.add(nose);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.32), bodyMat);
  body.position.set(0, 0.0, 0);
  group.add(body);

  const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.42, 0.18), accentMat);
  wingL.position.set(-0.7, -0.05, 0.02);
  wingL.rotation.z = 0.18;
  group.add(wingL);

  const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.42, 0.18), accentMat);
  wingR.position.set(0.7, -0.05, 0.02);
  wingR.rotation.z = -0.18;
  group.add(wingR);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), cockpitMat);
  cockpit.position.set(0, 0.18, 0.18);
  cockpit.scale.set(1, 1.2, 0.7);
  group.add(cockpit);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.22), accentMat);
  tail.position.set(0, -0.55, 0.04);
  group.add(tail);

  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = false;
      obj.receiveShadow = false;
    }
  });

  return group;
}

/** Kőszikla aszteroida — szabálytalan icosahedron-deformációval, kráteres. */
function buildRockMesh(size: 1 | 2 | 3): THREE.Mesh {
  const radius = size === 3 ? 1.25 : size === 2 ? 0.78 : 0.46;
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  // Deformáció — minden vertex sugarát kissé módosítjuk, így nem perfectly gömb.
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = 1 + (Math.sin(x * 4.7 + y * 3.1) + Math.cos(z * 2.4)) * 0.10;
    pos.setXYZ(i, x * n, y * n, z * n);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: size === 3 ? "#ff44ff" : size === 2 ? "#ff9933" : "#ff5555",
    roughness: 0.85,
    metalness: 0.18,
    flatShading: true,
    emissive: size === 3 ? "#420942" : size === 2 ? "#3a1f0a" : "#3a0a0a",
    emissiveIntensity: 0.35,
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

  const scoreSubmittedRef = useRef(false);
  const { data: syncEligibility } = useSyncEligibilityQuery();
  const syncBanner = useMemo(() => gameSyncBannerText(syncEligibility), [syncEligibility]);

  // ----- Mutable játéklogika ref-ek (nincs re-render minden frame-en) -----
  const playerRef = useRef({
    x: 0,
    y: PLAYER_BASE_Y,
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
  const enemiesKilledRef = useRef(0);
  const scoreRef = useRef(0);
  const shakeRef = useRef(0);

  const keysRef = useRef({ left: false, right: false, up: false, down: false, fire: false });
  const touchRef = useRef({ left: false, right: false, up: false, fire: false });

  // Three.js objektumok — useEffect-ben hozzuk létre, refbe tesszük.
  const sceneRefs = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    starfield: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
    nebula: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
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
    queryKey: ["/api/games/material-quizzes", grade],
    enabled: grade != null,
    queryFn: async () => {
      const res = await fetch(`/api/games/material-quizzes?classroom=${grade}&limit=3`, {
        credentials: "include",
      });
      if (!res.ok) return { classroom: grade ?? 0, materials: [], items: [] };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const quizPool = useMemo<Quiz[]>(() => {
    const fromMat: Quiz[] = (materialQuizData?.items ?? [])
      .filter((q) => Array.isArray(q.options) && q.options.length === 4)
      .map((q) => ({
        prompt: q.prompt,
        options: q.options.slice(0, 4),
        correctIndex: q.correctIndex,
        topic: q.topic ?? null,
        source: "material" as const,
      }));
    const fb = FALLBACK_QUIZZES.map((q) => ({ ...q, source: "fallback" as const }));
    // Tananyag-kvízek elöl, fallback hátul.
    return [...fromMat, ...fb];
  }, [materialQuizData]);

  const recentQuizPromptsRef = useRef<string[]>([]);
  const RECENT_WINDOW = 12;

  /** Kihúz egy nem-régen-mutatott kvízt. Tananyag-kérdéseket részesít előnyben. */
  const pickQuiz = useCallback((): Quiz => {
    const pool = quizPool.length > 0 ? quizPool : FALLBACK_QUIZZES;
    const recent = recentQuizPromptsRef.current;
    const matFirst = pool.filter((q) => q.source === "material" && !recent.includes(q.prompt));
    const fbFiltered = pool.filter((q) => q.source !== "material" && !recent.includes(q.prompt));
    const candidates = matFirst.length > 0 ? matFirst : fbFiltered.length > 0 ? fbFiltered : pool;
    const picked = candidates[Math.floor(Math.random() * candidates.length)] ?? FALLBACK_QUIZZES[0]!;
    recent.push(picked.prompt);
    while (recent.length > RECENT_WINDOW) recent.shift();
    return picked;
  }, [quizPool]);

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

  /** Kör-óra: másodpercenként számol vissza. */
  useEffect(() => {
    if (phase !== "play") return;
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
  }, [phase]);

  /** Power-timer (sec). */
  useEffect(() => {
    if (phase !== "play") return;
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
  }, [phase, powerTimer]);

  const enqueueQuiz = useCallback((reason: QuizReason) => {
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
    scoreSubmittedRef.current = false;
    streakProtector.resetProtector();
    setRevealCorrectIdx(null);
    setWrongIdx(null);
    enemiesRef.current = [];
    bulletsRef.current = [];
    pickupsRef.current = [];
    nextEntityIdRef.current = 1;
    playerRef.current = { x: 0, y: PLAYER_BASE_Y, invuln: 1.5, cooldown: 0, alive: true, bobPhase: 0 };
    waveRef.current = 1;
    livesRef.current = 3;
    powerLevelRef.current = 0;
    powerTimerRef.current = 0;
    shieldTimerRef.current = 0;
    bombsRef.current = 0;
    comboRef.current = 0;
    enemiesKilledRef.current = 0;
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
    enqueueQuiz("wave");
  }, [enqueueQuiz]);

  /* ============== Quiz választ feldolgoz ============== */

  const onAnswer = (idx: number) => {
    if (!activeQuiz) return;
    if (revealCorrectIdx !== null) return; // 1.5s reveal alatt nincs ismételt válasz
    if (idx !== activeQuiz.correctIndex) {
      sfxError();
      setWrongShake(true);
      window.setTimeout(() => setWrongShake(false), 320);
      setRevealCorrectIdx(activeQuiz.correctIndex);
      setWrongIdx(idx);
      const outcome = streakProtector.handleWrong({ streak: combo });
      if (outcome === "warned") sfxWarning();
      else setCombo(0);
      // Reveal után új kvíz (még quiz fázisban)
      window.setTimeout(() => {
        setRevealCorrectIdx(null);
        setWrongIdx(null);
        setActiveQuiz(pickQuiz());
      }, 1500);
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
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor("#02041a");

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#03061f", 0.022);

    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
    camera.position.set(0, -2.5, 22);
    camera.lookAt(0, 1.5, 0);

    // Fények: enyhe ambient + erős keyfény fent + színes accentek
    const ambient = new THREE.AmbientLight("#a4d4ff", 0.55);
    scene.add(ambient);
    const key = new THREE.DirectionalLight("#ffffff", 1.6);
    key.position.set(4, 8, 9);
    scene.add(key);
    const accentL = new THREE.PointLight("#ff00ff", 1.2, 28);
    accentL.position.set(-9, 4, 6);
    scene.add(accentL);
    const accentR = new THREE.PointLight("#00f0ff", 1.2, 28);
    accentR.position.set(9, -4, 6);
    scene.add(accentR);
    // Lokális flash light, amit ütközéskor felvillantunk
    const flashLight = new THREE.PointLight("#fff700", 0, 14);
    flashLight.position.set(0, 0, 4);
    scene.add(flashLight);

    // Csillagmező — több ezer pont, három rétegben (parallax dept).
    const starCount = 1500;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * GAME_W * 2.2;
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * GAME_H * 2.2;
      starPositions[i * 3 + 2] = -randRange(2, 16);
      const c = 0.5 + Math.random() * 0.5;
      const tint = Math.random();
      // Vegyes színek: fehér, halvány kék, halvány lila
      if (tint < 0.7) {
        starColors[i * 3] = c; starColors[i * 3 + 1] = c; starColors[i * 3 + 2] = c;
      } else if (tint < 0.85) {
        starColors[i * 3] = c * 0.6; starColors[i * 3 + 1] = c * 0.85; starColors[i * 3 + 2] = c;
      } else {
        starColors[i * 3] = c; starColors[i * 3 + 1] = c * 0.6; starColors[i * 3 + 2] = c;
      }
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true,
    });
    const starfield = new THREE.Points(starGeo, starMat);
    scene.add(starfield);

    // Hatalmas távoli nebula plane (radial gradient texture procedural canvasszal)
    const nebulaCanvas = document.createElement("canvas");
    nebulaCanvas.width = 512; nebulaCanvas.height = 512;
    const nebCtx = nebulaCanvas.getContext("2d");
    if (nebCtx) {
      const grad = nebCtx.createRadialGradient(256, 256, 30, 256, 256, 256);
      grad.addColorStop(0, "rgba(120,40,180,0.55)");
      grad.addColorStop(0.4, "rgba(40,80,200,0.30)");
      grad.addColorStop(0.7, "rgba(0,40,90,0.15)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      nebCtx.fillStyle = grad;
      nebCtx.fillRect(0, 0, 512, 512);
      // Csillag-szem-szórás
      for (let k = 0; k < 80; k++) {
        nebCtx.fillStyle = "rgba(255,255,255," + (Math.random() * 0.5 + 0.3) + ")";
        nebCtx.fillRect(Math.random() * 512, Math.random() * 512, 1.4, 1.4);
      }
    }
    const nebulaTex = new THREE.CanvasTexture(nebulaCanvas);
    nebulaTex.colorSpace = THREE.SRGBColorSpace;
    const nebula = new THREE.Mesh(
      new THREE.PlaneGeometry(GAME_W * 2.4, GAME_H * 2.4),
      new THREE.MeshBasicMaterial({ map: nebulaTex, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    nebula.position.set(0, 0, -10);
    scene.add(nebula);

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

    sceneRefs.current = {
      scene, camera, renderer, starfield, nebula, playerGroup, thrusterMesh, shieldMesh, shieldFullMesh,
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
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(240, Math.floor(rect.height));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    handleResize();
    const ro = new ResizeObserver(handleResize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener("resize", handleResize);

    /* ===================== Render loop ===================== */
    const loop = (t: number) => {
      const last = lastTimeRef.current;
      lastTimeRef.current = t;
      const dt = last == null ? 0 : Math.min(0.05, (t - last) / 1000);

      tick(dt);
      render(t / 1000);

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", handleResize);
      ro.disconnect();
      // Dispose minden mesh / material / texture
      starGeo.dispose();
      starMat.dispose();
      nebulaTex.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => { m.map?.dispose(); m.dispose(); });
        }
      });
      renderer.dispose();
      sceneRefs.current = null;
    };
  }, []);

  /* ===================== Tick (game logic) ===================== */
  const tick = (dt: number) => {
    if (phaseRef.current !== "play" || pausedRef.current) {
      // Csillag-pásztázás akkor is megy, hogy ne legyen "befagyva" a háttér
      const refs = sceneRefs.current;
      if (refs) {
        const pos = refs.starfield.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          let y = pos.getY(i);
          y -= dt * 0.4;
          if (y < -GAME_H * 1.2) y = GAME_H * 1.2;
          pos.setY(i, y);
        }
        pos.needsUpdate = true;
      }
      return;
    }
    const p = playerRef.current;
    if (!p.alive) return;

    // Játékos mozgás
    let mx = 0, my = 0;
    if (keysRef.current.left || touchRef.current.left) mx -= 1;
    if (keysRef.current.right || touchRef.current.right) mx += 1;
    if (keysRef.current.up || touchRef.current.up) my += 1;
    if (keysRef.current.down) my -= 1;
    p.x += mx * PLAYER_SPEED * dt;
    p.y += my * PLAYER_SPEED * 0.65 * dt;
    p.x = clamp(p.x, -GAME_W / 2 + 0.7, GAME_W / 2 - 0.7);
    p.y = clamp(p.y, -GAME_H / 2 + 1.6, -GAME_H / 2 + 6.4);
    p.bobPhase += dt * 4;
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

    // Spawn logika a hullámon belül
    if (!waveIntermissionRef.current && enemiesSpawnedThisWaveRef.current < enemiesPerWaveRef.current) {
      // Időközök: hullámmal arányosan rövidülnek, max 0.4 sec/spawn
      const spawnInterval = clamp(1.4 - waveRef.current * 0.06, 0.4, 1.4);
      const ready = enemiesRef.current.length === 0
        ? true
        : (enemiesRef.current[enemiesRef.current.length - 1]!.spawnAt + spawnInterval) < (lastTimeRef.current ?? 0) / 1000;
      if (ready) {
        spawnEnemyForWave();
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

    // Hullám-vége detektálás
    if (
      !waveIntermissionRef.current &&
      enemiesSpawnedThisWaveRef.current >= enemiesPerWaveRef.current &&
      enemiesRef.current.length === 0
    ) {
      waveIntermissionRef.current = true;
      const newWave = waveRef.current + 1;
      if (newWave > 12) {
        // Győzelem
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
    setCombo(comboRef.current);
    enemiesKilledRef.current += 1;
    setEnemiesKilled(enemiesKilledRef.current);
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
      // Set win flag — a tick következő iterációja phase-t "over"-re vált.
      setGameWon(true);
      window.setTimeout(() => setPhase("over"), 1500); // hagyjunk pár frame-et a robbanás-effektre
      return;
    }

    // Hasadás csak rock-nál
    if (e.kind === "rock" && e.size > 1) {
      for (let k = 0; k < 2; k++) {
        const id = nextEntityIdRef.current++;
        const child: EnemyState = {
          id,
          kind: "rock",
          size: (e.size - 1) as 1 | 2,
          x: e.x + randRange(-0.4, 0.4),
          y: e.y + randRange(-0.2, 0.2),
          vx: e.vx + randRange(-1.2, 1.2),
          vy: e.vy + randRange(-0.4, 0.4),
          rot: Math.random() * Math.PI * 2,
          rotSpeed: randRange(-1.8, 1.8),
          hp: e.size - 1,
          flash: 0,
          dead: false,
          spawnAt: (lastTimeRef.current ?? 0) / 1000,
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
    // Flash light pulzálás
    const refs = sceneRefs.current;
    if (refs) {
      refs.flashLight.position.set(e.x, e.y, 3);
      refs.flashLight.intensity = 3.5;
    }
    shakeRef.current = 0.4;
  };

  /** Hit-quiz mechanika: kvízig pause, ellenfelet eltávolítjuk az ütközéskor. */
  const handleHit = (e: EnemyState | null) => {
    if (e) {
      e.dead = true;
      shakeRef.current = 1.0;
      const refs = sceneRefs.current;
      if (refs) refs.flashLight.intensity = 5.5;
    }
    comboRef.current = 0;
    setCombo(0);
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
      window.setTimeout(() => setSavedToast(null), 2200);
      scoreRef.current += 35;
      setScore(scoreRef.current);
    } else if (pu.kind === "shield") {
      // Pajzs: 8s teljes invuln (kék gyűrű mutat). Stack-elhető (eddigi shieldTimer + 8s).
      shieldTimerRef.current = Math.min(20, shieldTimerRef.current + 8);
      setShieldTimer(shieldTimerRef.current);
      setSavedToast("Pajzs aktiválva!");
      window.setTimeout(() => setSavedToast(null), 1800);
      scoreRef.current += 25;
      setScore(scoreRef.current);
    } else if (pu.kind === "bomb") {
      // Bomb: +1 készletre, B-billentyűvel vagy touch-gombbal süthető le.
      bombsRef.current = Math.min(5, bombsRef.current + 1);
      setBombs(bombsRef.current);
      setSavedToast("Bomba a tárba!");
      window.setTimeout(() => setSavedToast(null), 1800);
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
  const detonateBomb = useCallback(() => {
    if (bombsRef.current <= 0) return;
    if (phaseRef.current !== "play") return;
    bombsRef.current = Math.max(0, bombsRef.current - 1);
    setBombs(bombsRef.current);
    sfxExplode();
    shakeRef.current = 1.5;
    const refs = sceneRefs.current;
    if (refs) refs.flashLight.intensity = 7.0;
    // Minden enemy meghal (kivéve boss — annak 12 HP-t levesz)
    for (const e of enemiesRef.current) {
      if (e.dead) continue;
      if (e.kind === "boss") {
        e.flash = 0.2;
        e.hp = Math.max(0, e.hp - 12);
        if (e.hp <= 0) handleEnemyDestroyed(e);
      } else {
        handleEnemyDestroyed(e);
      }
    }
    // Ellenséges lövedékek is törlődnek
    for (const b of bulletsRef.current) {
      if (b.fromEnemy) b.life = 0;
    }
  }, []);

  /* ===================== Render (Three.js) ===================== */
  const render = (now: number) => {
    const refs = sceneRefs.current;
    if (!refs) return;
    const { scene, camera, renderer, starfield, playerGroup, thrusterMesh, shieldMesh, shieldFullMesh, flashLight } = refs;

    // Csillagok pásztázása (lassú lefelé Y-mozgás), játék közben gyorsabb
    const moving = phaseRef.current === "play" && !pausedRef.current;
    const pos = starfield.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i);
      y -= (moving ? 1.4 : 0.4) * (1 / 60);
      if (y < -GAME_H * 1.2) y = GAME_H * 1.2;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;

    // Játékos
    const p = playerRef.current;
    playerGroup.position.x = p.x;
    playerGroup.position.y = p.y + Math.sin(p.bobPhase) * 0.04;
    playerGroup.position.z = 0;
    // Bedöntés mozgásirányhoz
    const tilt = clamp((keysRef.current.right || touchRef.current.right ? 1 : 0) - (keysRef.current.left || touchRef.current.left ? 1 : 0), -1, 1);
    playerGroup.rotation.z = -tilt * 0.45;
    playerGroup.rotation.y = tilt * 0.18;
    // Thruster pulzálás
    const moving2 = phaseRef.current === "play";
    thrusterMesh.scale.set(1 + Math.random() * 0.2, moving2 ? 1.4 + Math.random() * 0.5 : 0.5, 1);
    thrusterMesh.material.opacity = moving2 ? 0.85 : 0.4;
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
      mesh.rotation.set(now * 0.3 + e.rot, now * 0.25 + e.rot, e.rot);
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

    // Camera shake
    if (shakeRef.current > 0) {
      camera.position.x = (Math.random() - 0.5) * shakeRef.current * 0.6;
      camera.position.y = -2.5 + (Math.random() - 0.5) * shakeRef.current * 0.4;
    } else {
      camera.position.x = 0;
      camera.position.y = -2.5;
    }
    camera.lookAt(0, 1.5, 0);

    renderer.render(scene, camera);
  };

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
          if (phaseRef.current === "play") detonateBomb();
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
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
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

  /* ===================== Touch gomb-handler-ek ===================== */
  const startHold = (e: ReactPointerEvent<HTMLButtonElement>, k: "left" | "right" | "up" | "fire") => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    touchRef.current[k] = true;
  };
  const endHold = (e: ReactPointerEvent<HTMLButtonElement>, k: "left" | "right" | "up" | "fire") => {
    e.preventDefault();
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    touchRef.current[k] = false;
  };

  /* ===================== Eredmény-szinkron ===================== */
  useEffect(() => {
    if (phase !== "over" || !syncEligibility?.eligible || scoreSubmittedRef.current) return;
    scoreSubmittedRef.current = true;
    void apiRequest("POST", "/api/games/score", {
      gameId: "space-asteroid-quiz",
      difficulty: "normal",
      runXp: scoreRef.current,
      runStreak: comboRef.current,
      runSeconds: ROUND_LIMIT_SEC - timeLeft,
    })
      .then(() => void queryClient.invalidateQueries({ queryKey: ["/api/games/leaderboard"] }))
      .catch(() => { scoreSubmittedRef.current = false; });
  }, [phase, syncEligibility, timeLeft]);

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
      correctAnswers: enemiesKilledRef.current, // ≈ a leszedett ellenfél = helyes válasz proxy
      wrongAnswers: 0,
      maxStreak: comboRef.current,
      enemiesKilled: enemiesKilledRef.current,
      perfect: gameWon && comboRef.current >= 5,
      fullClear: gameWon,
      highestWave: waveRef.current,
    });
    if (wasDailyAvailable && gameWon) {
      markDailyCompleted();
    }
    if (newOnes.length > 0) setNewlyUnlocked(newOnes);
  }, [phase, gameWon]);

  /* ===================== Render JSX ===================== */
  const onPickGrade = (g: number) => {
    setGrade(g);
    saveGrade(g);
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
    <div className="game-shell-fixed min-h-screen relative overflow-hidden text-white" style={{
      background: "radial-gradient(ellipse at 22% 18%, rgba(255,0,255,0.18), transparent 38%), radial-gradient(ellipse at 80% 12%, rgba(0,240,255,0.20), transparent 42%), linear-gradient(180deg, #02041a 0%, #08051b 100%)",
    }}>
      <AchievementToast achievements={newlyUnlocked} />
      <main className="relative z-10 w-full max-w-xl lg:max-w-3xl mx-auto px-2 sm:px-5 py-2 sm:py-4 min-h-dvh min-h-screen flex flex-col pb-20 sm:pb-10">
        <header className="flex items-center justify-between gap-1 mb-1">
          <Link href="/games"><Button variant="ghost" size="sm" className="text-white/90 hover:bg-white/10 gap-1 -ml-2"><ArrowLeft className="w-4 h-4" />Játékok</Button></Link>
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
                <div className="flex flex-col items-center justify-center flex-1 gap-3 py-4">
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
                  >
                    <Rocket className="w-4 h-4 mr-2" />Indulhat — {grade}. osztály
                  </Button>
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
            <div className={`flex flex-col items-center gap-1.5 ${phase === "play" || phase === "quiz" ? "" : "hidden"}`}>
                <div className="relative rounded-xl overflow-hidden border-2 border-cyan-700/70 shadow-[0_0_28px_rgba(0,240,255,0.18)] w-full bg-black min-h-[min(56dvh,420px)] sm:min-h-[360px]">
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

                {/* Touch kontrollok */}
                <div className="grid grid-cols-4 gap-1.5 w-full">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-sky-800 hover:bg-sky-700 text-white border border-sky-200/35 shadow-md py-3 text-xs"
                    onPointerDown={(e) => startHold(e, "left")}
                    onPointerUp={(e) => endHold(e, "left")}
                    onPointerCancel={(e) => endHold(e, "left")}
                    onPointerLeave={(e) => endHold(e, "left")}
                  >Balra</Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-violet-700 hover:bg-violet-600 text-white border border-violet-200/35 shadow-md py-3 text-xs"
                    onPointerDown={(e) => startHold(e, "up")}
                    onPointerUp={(e) => endHold(e, "up")}
                    onPointerCancel={(e) => endHold(e, "up")}
                    onPointerLeave={(e) => endHold(e, "up")}
                  >Előre</Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-sky-800 hover:bg-sky-700 text-white border border-sky-200/35 shadow-md py-3 text-xs"
                    onPointerDown={(e) => startHold(e, "right")}
                    onPointerUp={(e) => endHold(e, "right")}
                    onPointerCancel={(e) => endHold(e, "right")}
                    onPointerLeave={(e) => endHold(e, "right")}
                  >Jobbra</Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-rose-700 hover:bg-rose-600 text-white border border-rose-200/35 shadow-md py-3 text-xs"
                    onPointerDown={(e) => startHold(e, "fire")}
                    onPointerUp={(e) => endHold(e, "fire")}
                    onPointerCancel={(e) => endHold(e, "fire")}
                    onPointerLeave={(e) => endHold(e, "fire")}
                  >🚀 TŰZ</Button>
                </div>

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
                    title="Bomba (B billentyű) — minden ellenfél megsemmisül"
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
              <div className="flex flex-col items-center justify-center flex-1 gap-3 py-8 text-center">
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
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/85 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className={`w-full max-w-md rounded-2xl border-2 border-cyan-400/55 bg-slate-950/95 p-4 shadow-2xl ${wrongShake ? "animate-shake-spq" : ""}`}
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
                  {activeQuiz.source === "material" ? "Tananyagodból" : "Általános"}
                </span>
              </div>
              <p className="text-[11px] text-white/65 mb-2">
                {quizReason === "wave"
                  ? "A hullám csak helyes válaszra indul. Rossz válasz → új kérdés."
                  : "Csak helyes válasz után folytatódik a játék. Próbálkozhatsz többször is — minden rossz válaszra új kvíz jön."}
              </p>
              <p className="text-base font-semibold mb-4">{activeQuiz.prompt}</p>
              <div className="grid gap-2">
                {activeQuiz.options.map((o, i) => {
                  const isCorrect = revealCorrectIdx === i;
                  const isWrong = wrongIdx === i;
                  const dim = revealCorrectIdx !== null && !isCorrect && !isWrong;
                  const cls = isCorrect
                    ? "h-auto py-3 text-left bg-emerald-700/70 hover:bg-emerald-700/70 text-white border-2 border-emerald-300 text-[15px] font-bold"
                    : isWrong
                      ? "h-auto py-3 text-left bg-rose-800/70 hover:bg-rose-800/70 text-white border-2 border-rose-300 text-[15px]"
                      : dim
                        ? "h-auto py-3 text-left bg-white/5 text-white/40 border border-cyan-900/20 text-[15px]"
                        : "h-auto py-3 text-left bg-white/10 hover:bg-cyan-800/55 text-white border border-cyan-900/40 text-[15px]";
                  return (
                    <Button
                      key={`${o}-${i}`}
                      variant="secondary"
                      className={cls}
                      disabled={revealCorrectIdx !== null}
                      onClick={() => onAnswer(i)}
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
    </div>
  );
}
