import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import * as THREE from "three";
import { ArrowLeft, Box, Pickaxe, Star, Flame, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import GamePedagogyPanel from "@/components/GamePedagogyPanel";
import GameNextGoalBar from "@/components/GameNextGoalBar";
import { gameSyncBannerText, useSyncEligibilityQuery } from "@/hooks/useGameScoreSync";
import { useMaterialQuizzes } from "@/hooks/useMaterialQuizzes";
import { useClassroomGrade } from "@/lib/classroomStore";
import ClassroomGateModal from "@/components/ClassroomGateModal";
import AudioToggleButton from "@/components/AudioToggleButton";
import { useStreakProtector } from "@/hooks/useStreakProtector";
import { sfxSuccess, sfxError, sfxLevelUp, sfxWarning } from "@/lib/audioEngine";
import { recordRun, type Achievement } from "@/lib/achievements";
import { isTodaysGameAvailable, markDailyCompleted } from "@/lib/dailyChallenge";
import AchievementToast from "@/components/AchievementToast";

const TILE = 24;
const ROWS = 18;
const COLS = 96;
const GRAVITY = 2200;
const MOVE_SPEED = 188;
const JUMP_V = 550;
const PLAYER_W = 14;
const PLAYER_H = 26;
/** Koppintásos bányászás max. hatótáv (Chebyshev, „csempe” egységben); kisebb = kevésbé érzékeny messzi kockákra. */
const MINING_REACH_TILES = 2.85;

const AIR = 0;
const GRASS = 1;
const DIRT = 2;
const STONE = 3;
const LOG = 4;
const LEAVES = 5;
const COAL = 6;
const IRON = 7;
const DIAMOND = 8;
/** Alul: nem bányászható, nem esik át rajta a játékos */
const BEDROCK = 9;
/** Creeper mob a felszínen — bónusz kvíz, dupla XP */
const CREEPER = 10;
/** Homok: sivatag/tengerpart biom, könnyű bányászni */
const SAND = 11;
/** Víz: díszítő blokk (nem bányászható, tengeren / tavon található) */
const WATER = 12;
/** Zombi mob — felszíni, közepesen mélyen is, +2× XP (nehezebb mint creeper). */
const ZOMBIE = 13;
/** Csontváz mob — barlangban, a stone-rétegben, +2.5× XP, ritkább. */
const SKELETON = 14;
/** Pók mob — barlangban a falakon, +2.2× XP, kisebb mint a többi. */
const SPIDER = 15;

type QuizSubject = "english" | "english-math" | "math" | "nature";
type Quiz = { prompt: string; options: string[]; correctIndex: number; subject?: QuizSubject };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type ThreeBlockMesh = THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]>;
type ThreeRuntime = {
  camera: THREE.PerspectiveCamera;
  raycaster: THREE.Raycaster;
  blockMeshes: ThreeBlockMesh[];
};
type QuizBankApi = {
  items: { prompt: string; options: string[]; correctIndex: number }[];
};

/**
 * Pálya-konfiguráció: minden szint külön világgenerálási paraméterekkel,
 * progresszíven nehezedő kihívással. A játékos végigjátssza őket egymás után,
 * a Total XP halmozódik, sorozat resetelődik új pálya elején (frissítő).
 */
type LevelBiome = "forest" | "caves" | "desert" | "diamond" | "standard";
type LevelWeather = "clear" | "rain" | "snow" | "sandstorm";
type LevelConfig = {
  id: number;
  name: string;
  description: string;
  /** Hány blokkot kell kibányászni a pálya teljesítéséhez. */
  goalBlocks: number;
  /** Opcionális: hány ritka blokk (COAL/IRON/DIAMOND/CREEPER) kötelező. */
  goalRareBlocks: number;
  /** Másodperces időkeret a pályára. */
  timeLimit: number;
  /** Érc-arány szorzó (1.0 = alap, 2.0 = kétszerese). */
  oreMultiplier: number;
  /** Barlangok száma (alap: 18 nagyobb világon). */
  caveCount: number;
  /** Fa-sűrűség (0.0–0.30). */
  treeDensity: number;
  /** Biom-eltolódás: melyik bióma dominánsabb. */
  biome: LevelBiome;
  /** Háttérszín a vibrációhoz (3D szcéna kezdő színe). */
  skyTint: { day: string; dusk: string };
  /** Időjárás: alap "clear", magasabb szinteken eső/hó/homokvihar. */
  weather: LevelWeather;
  /** Boss-pálya: külön HUD-banner + 3-4 extra creeper a felszínen. */
  isBossLevel?: boolean;
};

const LEVELS: LevelConfig[] = [
  {
    id: 1,
    name: "1. Erdei kezdés",
    description: "Ismerd meg a játékot. Bányássz 8 blokkot az időkereten belül!",
    goalBlocks: 8,
    goalRareBlocks: 0,
    timeLimit: 240,
    oreMultiplier: 0.7,
    caveCount: 10,
    treeDensity: 0.18,
    biome: "forest",
    skyTint: { day: "#9bd1ee", dusk: "#5d7faf" },
    weather: "clear",
  },
  {
    id: 2,
    name: "2. Sűrű erdő",
    description: "Több fa, sűrűbb növényzet. 12 blokk a célod.",
    goalBlocks: 12,
    goalRareBlocks: 0,
    timeLimit: 240,
    oreMultiplier: 1.0,
    caveCount: 14,
    treeDensity: 0.24,
    biome: "forest",
    skyTint: { day: "#8ac8e7", dusk: "#4f6fa0" },
    weather: "clear",
  },
  {
    id: 3,
    name: "3. Barlangrendszer",
    description: "Sok barlang, vegyes érctelep. 15 blokk + 2 érc kötelező!",
    goalBlocks: 15,
    goalRareBlocks: 2,
    timeLimit: 220,
    oreMultiplier: 1.5,
    caveCount: 28,
    treeDensity: 0.10,
    biome: "caves",
    skyTint: { day: "#7ab1d4", dusk: "#3c5577" },
    weather: "rain",
  },
  {
    id: 4,
    name: "4. Sivatag és tó",
    description: "Homokos biomák, tavak. 18 blokk + 2 érc — vigyázz a vízre!",
    goalBlocks: 18,
    goalRareBlocks: 2,
    timeLimit: 210,
    oreMultiplier: 1.1,
    caveCount: 16,
    treeDensity: 0.10,
    biome: "desert",
    skyTint: { day: "#f4d8a0", dusk: "#c08555" },
    weather: "sandstorm",
  },
  {
    id: 5,
    name: "5. Gyémánt mélységek",
    description: "Sok gyémánt és vas. 22 blokk + 4 érc, köztük legalább 1 gyémánt!",
    goalBlocks: 22,
    goalRareBlocks: 4,
    timeLimit: 200,
    oreMultiplier: 2.4,
    caveCount: 24,
    treeDensity: 0.08,
    biome: "diamond",
    skyTint: { day: "#7494c9", dusk: "#2a3550" },
    weather: "snow",
    isBossLevel: true,
  },
];

const QUIZ_FALLBACK: Quiz[] = [
  // ============================================================
  // === ANGOL SZÓKINCS (alap, Minecraft-témájú) ================
  // ============================================================
  { prompt: "„Stone” jelentése:", options: ["kő", "hó", "fény", "híd"], correctIndex: 0, subject: "english" },
  { prompt: "„Pickaxe” jelentése:", options: ["lapát", "csákány", "kard", "háló"], correctIndex: 1, subject: "english" },
  { prompt: "„Diamond” magyarul:", options: ["arany", "gyémánt", "szén", "vas"], correctIndex: 1, subject: "english" },
  { prompt: "„Forest” magyarul:", options: ["tenger", "hegy", "erdő", "hűtő"], correctIndex: 2, subject: "english" },
  { prompt: "„Build” jelentése:", options: ["épít", "fut", "ugrik", "bányászik"], correctIndex: 0, subject: "english" },
  { prompt: "Mit jelent: „Craft a tool”?", options: ["eszközt készít", "futni tanul", "többet alszik", "vizet gyűjt"], correctIndex: 0, subject: "english" },
  { prompt: "„Grass” magyarul:", options: ["fű", "jég", "kő", "ég"], correctIndex: 0, subject: "english" },
  { prompt: "„Dirt” magyarul:", options: ["homok", "föld", "víz", "ég"], correctIndex: 1, subject: "english" },
  { prompt: "„Wood” / faanyag angolul a játékban gyakran:", options: ["water", "wood", "wind", "wolf"], correctIndex: 1, subject: "english" },
  { prompt: "„Leaves” jelentése:", options: ["gyökerek", "levelek", "kövek", "felhők"], correctIndex: 1, subject: "english" },
  { prompt: "„Coal” magyarul:", options: ["réz", "szén", "cukor", "kő"], correctIndex: 1, subject: "english" },
  { prompt: "„Iron” magyarul:", options: ["arany", "vas", "ezüst", "réz"], correctIndex: 1, subject: "english" },
  { prompt: "„Jump” jelentése:", options: ["fut", "ugrás / ugrik", "áll", "esik"], correctIndex: 1, subject: "english" },
  { prompt: "„Mine” ebben a játékban:", options: ["fest", "bányászik", "főz", "úszik"], correctIndex: 1, subject: "english" },
  { prompt: "„Block” jelentése:", options: ["kocka / blokk", "labda", "ajtó", "ablak"], correctIndex: 0, subject: "english" },
  { prompt: "„Sky” magyarul:", options: ["föld", "ég / égbolt", "víz", "erdő"], correctIndex: 1, subject: "english" },
  { prompt: "„River” magyarul:", options: ["hegy", "folyó", "út", "ház"], correctIndex: 1, subject: "english" },
  { prompt: "„Bridge” magyarul:", options: ["híd", "bástya", "bokor", "bárány"], correctIndex: 0, subject: "english" },
  { prompt: "„Castle” magyarul:", options: ["kert", "vár", "vonat", "villa"], correctIndex: 1, subject: "english" },
  { prompt: "„Star” magyarul:", options: ["hold", "csillag", "felhő", "szél"], correctIndex: 1, subject: "english" },
  { prompt: "„Moon” magyarul:", options: ["nap", "hold", "hó", "hajó"], correctIndex: 1, subject: "english" },
  { prompt: "„Rain” magyarul:", options: ["hó", "eső", "szél", "nap"], correctIndex: 1, subject: "english" },
  { prompt: "„Snow” magyarul:", options: ["jég", "hó", "eső", "homok"], correctIndex: 1, subject: "english" },
  { prompt: "„Happy” magyarul:", options: ["szomorú", "boldog", "fáradt", "mérges"], correctIndex: 1, subject: "english" },
  { prompt: "„Big” magyarul:", options: ["kicsi", "nagy", "lassú", "rövid"], correctIndex: 1, subject: "english" },
  { prompt: "„Small” magyarul:", options: ["nagy", "kicsi", "kövér", "mély"], correctIndex: 1, subject: "english" },
  // === SZITUÁCIÓS MINECRAFT KÉRDÉSEK ===
  { prompt: "Éjszaka van, zombik jönnek! Mit csinálsz?", options: ["Build a shelter", "Go swimming", "Take a nap", "Eat diamonds"], correctIndex: 0, subject: "english" },
  { prompt: "A creeper felrobban! Angolul:", options: ["The creeper explodes!", "The creeper sleeps", "The creeper sings", "The creeper dances"], correctIndex: 0, subject: "english" },
  { prompt: "Hogyan mondod: 'Készíts egy kardot'?", options: ["Craft a sword", "Cook a sword", "Plant a sword", "Drink a sword"], correctIndex: 0, subject: "english" },
  { prompt: "Mit jelent: 'Watch out for lava!'?", options: ["Vigyázz a lávára!", "Nézd a vizet!", "Keresd a gyémántot!", "Építs házat!"], correctIndex: 0, subject: "english" },
  { prompt: "Éhes vagy Minecraftban. Mit csinálsz?", options: ["Find food", "Mine stone", "Jump around", "Sleep outside"], correctIndex: 0, subject: "english" },
  { prompt: "'You found diamonds!' mit jelent?", options: ["Gyémántot találtál!", "Köveket látod!", "Fát vágsz!", "Vizet iszol!"], correctIndex: 0, subject: "english" },
  { prompt: "Milyen eszközzel bányászol követ? Angolul:", options: ["With a pickaxe", "With a sword", "With a shovel", "With a bucket"], correctIndex: 0, subject: "english" },
  { prompt: "'Help! A skeleton is shooting at me!' mit jelent?", options: ["Segítség! Egy csontváz lő rám!", "Segítség! Éhes vagyok!", "Hol van a ház?", "Fussunk!"], correctIndex: 0, subject: "english" },
  { prompt: "'It’s dangerous to go alone!' mit jelent?", options: ["Veszélyes egyedl menni!", "Gyorsan bányássz!", "Keress vizet!", "Hol a gyémánt?"], correctIndex: 0, subject: "english" },
  { prompt: "'Run! The creeper is behind you!' mit jelent?", options: ["Fuss! A creeper mögötted van!", "Allé! Zombi jön!", "Keress barlangot!", "Gyúíts tüzet!"], correctIndex: 0, subject: "english" },
  // === CRAFTING RECEPTEK ===
  { prompt: "Mi kell a fáklyához? (angolul)", options: ["Coal + Stick", "Iron + Wood", "Diamond + Stone", "Grass + Dirt"], correctIndex: 0, subject: "english" },
  { prompt: "'Crafting table' magyarul:", options: ["munkasztal / kézműasztal", "konyhaasztal", "íróasztal", "kereskedő"], correctIndex: 0, subject: "english" },
  { prompt: "Mi kell a kardhoz? (alap: fa + fa) Angolul:", options: ["Wood + Wood", "Stone + Grass", "Coal + Stick", "Dirt + Sand"], correctIndex: 0, subject: "english" },
  { prompt: "'Sword' magyarul:", options: ["kard", "pajzs", "páncél", "nyíl"], correctIndex: 0, subject: "english" },
  { prompt: "'Bow' magyarul a Minecraftban:", options: ["ij", "kard", "pajzs", "csákány"], correctIndex: 0, subject: "english" },
  // === MOB-OK ANGOLUL ===
  { prompt: "Skeleton = ?", options: ["csontváz", "zombi", "pók", "deneér"], correctIndex: 0, subject: "english" },
  { prompt: "A 'Villager' magyarul:", options: ["falusi", "katona", "király", "boszorkány"], correctIndex: 0, subject: "english" },
  { prompt: "Creeper = ?", options: ["robbanó zöld szörny", "repülő deneér", "vörös sárkány", "vízi hal"], correctIndex: 0, subject: "english" },
  { prompt: "Zombie = ?", options: ["zombi", "démon", "kísértet", "varjú"], correctIndex: 0, subject: "english" },
  { prompt: "Spider = ?", options: ["pók", "hangya", "méh", "bogarak"], correctIndex: 0, subject: "english" },
  { prompt: "Witch = ?", options: ["boszorkány", "harcos", "varázslos herceg", "tündér"], correctIndex: 0, subject: "english" },
  { prompt: "Enderman = ?", options: ["magas fekete lény", "zöld creeper", "csontváz", "vízi szörny"], correctIndex: 0, subject: "english" },
  // === BIOME-OK ===
  { prompt: "Desert biome = ?", options: ["sivatag", "óceán", "dzsungel", "hegy"], correctIndex: 0, subject: "english" },
  { prompt: "'Nether' magyarul kb.:", options: ["alvílág / pokol", "mennyország", "óceán", "erdő"], correctIndex: 0, subject: "english" },
  { prompt: "Jungle biome = ?", options: ["dzsungel", "sivatag", "tundra", "folyó"], correctIndex: 0, subject: "english" },
  { prompt: "Ocean biome = ?", options: ["óceán", "hegy", "völgy", "barlang"], correctIndex: 0, subject: "english" },
  { prompt: "Swamp biome = ?", options: ["mocsár", "sivatag", "mező", "tenger"], correctIndex: 0, subject: "english" },
  // === SURVIVAL TIPPEK ===
  { prompt: "First night tip: 'Dig into a hillside!' Mit jelent?", options: ["Áss bele egy dombba!", "Ugorj a vízbe!", "Fuss el!", "Aludj a fán!"], correctIndex: 0, subject: "english" },
  { prompt: "'Always bring food on adventures!' mit jelent?", options: ["Mindig vigyél ételt a kalandhoz!", "Felejtsd el az ételt!", "Csak vizet igyy", "Aludj sokat!"], correctIndex: 0, subject: "english" },
  { prompt: "'Mine deeper for rare ores!' mit jelent?", options: ["Mélyebbre bányássz ritka ércekért!", "Maradj a felszínen!", "Keress vizet!", "Gyűjts fát!"], correctIndex: 0, subject: "english" },
  { prompt: "'Don't dig straight down!' mit jelent?", options: ["Ne áss egyenesen le!", "Mindig lefelé ássz!", "Gyorsan fuss!", "Bányássz követ!"], correctIndex: 0, subject: "english" },
  // === EXTRA SZÓKINCS ===
  { prompt: "'Shield' magyarul:", options: ["pajzs", "kard", "sisak", "csizma"], correctIndex: 0, subject: "english" },
  { prompt: "'Armor' magyarul:", options: ["páncél", "kesztyű", "sapka", "táska"], correctIndex: 0, subject: "english" },
  { prompt: "'Cave' magyarul:", options: ["barlang", "folyó", "völgy", "domb"], correctIndex: 0, subject: "english" },
  { prompt: "'Lava' magyarul:", options: ["láva", "víz", "homok", "jég"], correctIndex: 0, subject: "english" },
  { prompt: "'Torch' magyarul:", options: ["fáklya", "lámpa", "gyertya", "tűz"], correctIndex: 0, subject: "english" },
  { prompt: "'Chest' magyarul a játékban:", options: ["láda / mellény", "asztal", "ajtó", "ablak"], correctIndex: 0, subject: "english" },
  { prompt: "'Spawn' jelentése Minecraftban:", options: ["megjelenés / születési pont", "tárgy", "csontváz", "bányász"], correctIndex: 0, subject: "english" },
  { prompt: "Hogyan mondod: 'Gyere ide!'?", options: ["Come here!", "Go away!", "Mine this!", "Build that!"], correctIndex: 0, subject: "english" },
  { prompt: "'Careful!' angolul, ha veszely van:", options: ["Careful! / Watch out!", "Hello!", "Good job!", "Let's go!"], correctIndex: 0, subject: "english" },
  { prompt: "'Hungry' magyarul:", options: ["éhes", "szomjas", "fáradt", "beteg"], correctIndex: 0, subject: "english" },
  { prompt: "'Dangerous' magyarul:", options: ["veszélyes", "békés", "mély", "gyönyörű"], correctIndex: 0, subject: "english" },
  // ============================================================
  // === ANGOL MATEMATIKA (math vocabulary + egyszerű műveletek) =
  // ============================================================
  { prompt: "What is 'add' in Hungarian?", options: ["szoroz", "összead", "kivon", "oszt"], correctIndex: 1, subject: "english-math" },
  { prompt: "What is 'subtract' in Hungarian?", options: ["összead", "kivon", "szoroz", "oszt"], correctIndex: 1, subject: "english-math" },
  { prompt: "What is 'multiply' in Hungarian?", options: ["szoroz", "összead", "kivon", "oszt"], correctIndex: 0, subject: "english-math" },
  { prompt: "What is 'divide' in Hungarian?", options: ["szoroz", "oszt", "összead", "kivon"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Two plus three equals?' (2 + 3 = ?)", options: ["four", "five", "six", "seven"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Four times two equals?' (4 × 2 = ?)", options: ["six", "eight", "ten", "twelve"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Ten minus four equals?' (10 - 4 = ?)", options: ["five", "six", "seven", "eight"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Twelve divided by three equals?' (12 ÷ 3 = ?)", options: ["three", "four", "five", "six"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Half of ten is?' (10 fele?)", options: ["three", "four", "five", "six"], correctIndex: 2, subject: "english-math" },
  { prompt: "'Double of six is?' (6 kétszerese?)", options: ["ten", "twelve", "fourteen", "sixteen"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Number' jelentése:", options: ["szám", "szín", "szó", "sor"], correctIndex: 0, subject: "english-math" },
  { prompt: "'Equal' magyarul:", options: ["nagyobb", "egyenlő", "kisebb", "közel"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Greater than' magyarul:", options: ["kisebb, mint", "nagyobb, mint", "egyenlő", "nem egyenlő"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Less than' magyarul:", options: ["nagyobb, mint", "egyenlő", "kisebb, mint", "közel"], correctIndex: 2, subject: "english-math" },
  { prompt: "'Sum' magyarul matekban:", options: ["összeg", "különbség", "szorzat", "hányados"], correctIndex: 0, subject: "english-math" },
  { prompt: "'Difference' magyarul matekban:", options: ["összeg", "különbség", "szorzat", "hányados"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Product' magyarul matekban:", options: ["összeg", "különbség", "szorzat", "hányados"], correctIndex: 2, subject: "english-math" },
  { prompt: "'Quotient' magyarul matekban:", options: ["összeg", "különbség", "szorzat", "hányados"], correctIndex: 3, subject: "english-math" },
  { prompt: "'Triangle' magyarul:", options: ["kör", "négyzet", "háromszög", "téglalap"], correctIndex: 2, subject: "english-math" },
  { prompt: "'Square' magyarul mértanban:", options: ["kör", "négyzet", "háromszög", "téglalap"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Circle' magyarul:", options: ["kör", "négyzet", "háromszög", "téglalap"], correctIndex: 0, subject: "english-math" },
  { prompt: "'Rectangle' magyarul:", options: ["kör", "négyzet", "háromszög", "téglalap"], correctIndex: 3, subject: "english-math" },
  { prompt: "'Half' magyarul:", options: ["egész", "fél", "negyed", "harmad"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Quarter' magyarul (tört):", options: ["egész", "fél", "negyed", "harmad"], correctIndex: 2, subject: "english-math" },
  { prompt: "How many sides does a triangle have?", options: ["2", "3", "4", "5"], correctIndex: 1, subject: "english-math" },
  { prompt: "How many sides does a square have?", options: ["3", "4", "5", "6"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Even number' magyarul:", options: ["páros szám", "páratlan szám", "prím szám", "nulla"], correctIndex: 0, subject: "english-math" },
  { prompt: "'Odd number' magyarul:", options: ["páros szám", "páratlan szám", "prím szám", "nulla"], correctIndex: 1, subject: "english-math" },
  // ============================================================
  // === EGYSZERŰ MAGYAR MATEMATIKA (1-4. osztály szint) =========
  // ============================================================
  { prompt: "Mennyi 5 + 3?", options: ["6", "7", "8", "9"], correctIndex: 2, subject: "math" },
  { prompt: "Mennyi 9 - 4?", options: ["3", "4", "5", "6"], correctIndex: 2, subject: "math" },
  { prompt: "Mennyi 7 + 6?", options: ["11", "12", "13", "14"], correctIndex: 2, subject: "math" },
  { prompt: "Mennyi 15 - 8?", options: ["5", "6", "7", "8"], correctIndex: 2, subject: "math" },
  { prompt: "Mennyi 4 × 3?", options: ["9", "10", "11", "12"], correctIndex: 3, subject: "math" },
  { prompt: "Mennyi 6 × 2?", options: ["10", "12", "14", "16"], correctIndex: 1, subject: "math" },
  { prompt: "Mennyi 8 × 5?", options: ["35", "40", "45", "50"], correctIndex: 1, subject: "math" },
  { prompt: "Mennyi 18 ÷ 3?", options: ["5", "6", "7", "8"], correctIndex: 1, subject: "math" },
  { prompt: "Mennyi 24 ÷ 4?", options: ["5", "6", "7", "8"], correctIndex: 1, subject: "math" },
  { prompt: "Mennyi 100 - 37?", options: ["53", "63", "73", "83"], correctIndex: 1, subject: "math" },
  { prompt: "Mennyi 25 + 48?", options: ["63", "73", "83", "93"], correctIndex: 1, subject: "math" },
  { prompt: "Hány cm van 1 méterben?", options: ["10", "100", "1000", "10000"], correctIndex: 1, subject: "math" },
  { prompt: "Hány perc van 1 órában?", options: ["30", "45", "60", "100"], correctIndex: 2, subject: "math" },
  { prompt: "Hány nap van 1 hétben?", options: ["5", "6", "7", "8"], correctIndex: 2, subject: "math" },
  { prompt: "Hány hónap van 1 évben?", options: ["10", "11", "12", "13"], correctIndex: 2, subject: "math" },
  { prompt: "Mennyi a 10 fele?", options: ["2", "4", "5", "6"], correctIndex: 2, subject: "math" },
  { prompt: "Mennyi a 8 kétszerese?", options: ["10", "14", "16", "18"], correctIndex: 2, subject: "math" },
  { prompt: "Melyik a páros szám?", options: ["3", "7", "8", "11"], correctIndex: 2, subject: "math" },
  { prompt: "Melyik a páratlan szám?", options: ["4", "6", "9", "10"], correctIndex: 2, subject: "math" },
  { prompt: "Hány oldala van egy háromszögnek?", options: ["2", "3", "4", "5"], correctIndex: 1, subject: "math" },
  { prompt: "Hány oldala van egy négyzetnek?", options: ["3", "4", "5", "6"], correctIndex: 1, subject: "math" },
  { prompt: "Hány csúcsa van egy kockának?", options: ["4", "6", "8", "12"], correctIndex: 2, subject: "math" },
  { prompt: "Mennyi 12 + 12?", options: ["22", "24", "26", "28"], correctIndex: 1, subject: "math" },
  { prompt: "Hány nulla van 1000-ben?", options: ["2", "3", "4", "5"], correctIndex: 1, subject: "math" },
  { prompt: "Mennyi 7 × 7?", options: ["42", "49", "56", "63"], correctIndex: 1, subject: "math" },
  { prompt: "Mennyi 9 × 9?", options: ["72", "81", "90", "99"], correctIndex: 1, subject: "math" },
  { prompt: "Mennyi a 20 fele?", options: ["8", "10", "12", "15"], correctIndex: 1, subject: "math" },
  { prompt: "Ha 3 almám van és kapok 4-et, hány lesz?", options: ["5", "6", "7", "8"], correctIndex: 2, subject: "math" },
  { prompt: "Ha 10 cukorkám volt és 6-ot megettem, hány maradt?", options: ["3", "4", "5", "6"], correctIndex: 1, subject: "math" },
  { prompt: "Mennyi 50 + 50?", options: ["90", "100", "110", "150"], correctIndex: 1, subject: "math" },
  // ============================================================
  // === KÖRNYEZETISMERET (egyszerű, 1-4. osztály szint) =========
  // ============================================================
  { prompt: "Mi a fő különbség a fa és a növény között?", options: ["A fa nagyobb, fás szárú növény", "A fa nem él", "A növény nem zöld", "Nincs különbség"], correctIndex: 0, subject: "nature" },
  { prompt: "Mi a fő különbség a növény és az állat között?", options: ["A növény fotoszintetizál, az állat mozog és eszik", "Az állat mindig nagyobb", "A növény is eszik húst", "Nincs különbség"], correctIndex: 0, subject: "nature" },
  { prompt: "Mit csinál a növény a napfénnyel?", options: ["Eszik", "Alszik", "Fotoszintetizál (táplálékot készít)", "Elfut"], correctIndex: 2, subject: "nature" },
  { prompt: "Mi a tölgy?", options: ["Állat", "Fa", "Gomba", "Hal"], correctIndex: 1, subject: "nature" },
  { prompt: "Melyik növény NEM fa?", options: ["tölgy", "bükk", "pipacs", "fenyő"], correctIndex: 2, subject: "nature" },
  { prompt: "Melyik állat NEM emlős?", options: ["kutya", "macska", "tyúk", "ló"], correctIndex: 2, subject: "nature" },
  { prompt: "Hány lába van egy póknak?", options: ["4", "6", "8", "10"], correctIndex: 2, subject: "nature" },
  { prompt: "Hány lába van egy rovarnak (pl. méh)?", options: ["4", "6", "8", "10"], correctIndex: 1, subject: "nature" },
  { prompt: "Mit csinál a méh a virággal?", options: ["Eszi", "Nektárt gyűjt és beporzja", "Kitépi", "Elrejti"], correctIndex: 1, subject: "nature" },
  { prompt: "Mi lesz a lárvából idővel?", options: ["Növény", "Kő", "Pillangó vagy bogár", "Hal"], correctIndex: 2, subject: "nature" },
  { prompt: "Melyik évszakban hullik le a levél?", options: ["tavasz", "nyár", "ősz", "tél"], correctIndex: 2, subject: "nature" },
  { prompt: "Melyik évszakban van a legmelegebb?", options: ["tavasz", "nyár", "ősz", "tél"], correctIndex: 1, subject: "nature" },
  { prompt: "Mi a fő különbség nappal és éjszaka között?", options: ["A Föld forgása miatt a Nap látszólagos állása", "A Hold eltűnik", "A csillagok elfogynak", "Nincs különbség"], correctIndex: 0, subject: "nature" },
  { prompt: "Mit iszik a növény?", options: ["tejet", "vizet (gyökerein át)", "levegőt", "semmit"], correctIndex: 1, subject: "nature" },
  { prompt: "Hol él a hal?", options: ["levegőben", "földben", "vízben", "fán"], correctIndex: 2, subject: "nature" },
  { prompt: "Mivel lélegzik a hal?", options: ["tüdővel", "kopoltyúval", "orral", "szájjal"], correctIndex: 1, subject: "nature" },
  { prompt: "Melyik a mi bolygónk?", options: ["Mars", "Hold", "Föld", "Nap"], correctIndex: 2, subject: "nature" },
  { prompt: "Mi a Nap?", options: ["csillag", "bolygó", "hold", "üstökös"], correctIndex: 0, subject: "nature" },
  { prompt: "Mi a Hold?", options: ["csillag", "bolygó", "a Föld kísérője", "galaxis"], correctIndex: 2, subject: "nature" },
  { prompt: "Hány napból áll egy hét?", options: ["5", "6", "7", "8"], correctIndex: 2, subject: "nature" },
  { prompt: "Milyen halmazállapotú a jég?", options: ["folyékony", "szilárd", "légnemű", "ragadós"], correctIndex: 1, subject: "nature" },
  { prompt: "Milyen halmazállapotú a víz?", options: ["folyékony", "szilárd", "légnemű", "kristályos"], correctIndex: 0, subject: "nature" },
  { prompt: "Milyen halmazállapotú a levegő?", options: ["folyékony", "szilárd", "légnemű", "porszerű"], correctIndex: 2, subject: "nature" },
  { prompt: "Mi képződik, ha a víz forró lesz?", options: ["Jég", "Gőz / pára", "Só", "Homok"], correctIndex: 1, subject: "nature" },
  { prompt: "Melyik állat tojik tojást?", options: ["ló", "kutya", "tyúk", "macska"], correctIndex: 2, subject: "nature" },
  { prompt: "Melyik NEM madár?", options: ["veréb", "galamb", "denevér", "fecske"], correctIndex: 2, subject: "nature" },
  { prompt: "Mit eszik a nyúl?", options: ["húst", "növényeket (füvet, répát)", "köveket", "fémet"], correctIndex: 1, subject: "nature" },
  { prompt: "Mit eszik a farkas?", options: ["csak füvet", "csak gyümölcsöt", "húst (ragadozó)", "köveket"], correctIndex: 2, subject: "nature" },
  { prompt: "Milyen halmazállapotú a gyémánt?", options: ["folyékony", "szilárd", "légnemű", "gázszerű"], correctIndex: 1, subject: "nature" },
  { prompt: "Honnan származik az eső?", options: ["a földből", "a felhőkből", "a kőzetekből", "a fákból"], correctIndex: 1, subject: "nature" },
  { prompt: "Mitől nő a növény?", options: ["víztől, napfénytől, levegőtől", "csak vacsorától", "köztől", "semmitől"], correctIndex: 0, subject: "nature" },
  { prompt: "Mi a legnagyobb szárazföldi állat?", options: ["oroszlán", "elefánt", "ló", "tigris"], correctIndex: 1, subject: "nature" },
  { prompt: "Melyik a leghidegebb évszak?", options: ["tavasz", "nyár", "ősz", "tél"], correctIndex: 3, subject: "nature" },
  // ============================================================
  // === TOVÁBBI MATEMATIKA (bővítés v2, 2026-04-21) =============
  // ============================================================
  { prompt: "Mennyi 13 + 17?", options: ["28", "29", "30", "31"], correctIndex: 2, subject: "math" },
  { prompt: "Mennyi 45 - 27?", options: ["16", "18", "20", "22"], correctIndex: 1, subject: "math" },
  { prompt: "Mennyi 8 + 9?", options: ["16", "17", "18", "19"], correctIndex: 1, subject: "math" },
  { prompt: "Mennyi 20 - 7?", options: ["11", "12", "13", "14"], correctIndex: 2, subject: "math" },
  { prompt: "Mennyi 16 + 14?", options: ["28", "29", "30", "31"], correctIndex: 2, subject: "math" },
  { prompt: "Mennyi 3 × 6?", options: ["15", "18", "21", "24"], correctIndex: 1, subject: "math" },
  { prompt: "Mennyi 5 × 7?", options: ["30", "35", "40", "45"], correctIndex: 1, subject: "math" },
  { prompt: "Mennyi 6 × 8?", options: ["42", "46", "48", "54"], correctIndex: 2, subject: "math" },
  { prompt: "Mennyi 56 ÷ 7?", options: ["6", "7", "8", "9"], correctIndex: 2, subject: "math" },
  { prompt: "Mennyi 72 ÷ 9?", options: ["6", "7", "8", "9"], correctIndex: 2, subject: "math" },
  { prompt: "Mennyi 36 ÷ 6?", options: ["4", "5", "6", "7"], correctIndex: 2, subject: "math" },
  { prompt: "Hány dm van 1 méterben?", options: ["5", "10", "100", "1000"], correctIndex: 1, subject: "math" },
  { prompt: "Hány mm van 1 cm-ben?", options: ["5", "10", "100", "1000"], correctIndex: 1, subject: "math" },
  { prompt: "Hány dkg van 1 kg-ban?", options: ["10", "100", "1000", "10000"], correctIndex: 1, subject: "math" },
  { prompt: "Hány dl van 1 literben?", options: ["5", "10", "100", "1000"], correctIndex: 1, subject: "math" },
  { prompt: "Hány másodperc van 1 percben?", options: ["30", "45", "60", "100"], correctIndex: 2, subject: "math" },
  { prompt: "Hány óra van egy napon?", options: ["12", "18", "24", "48"], correctIndex: 2, subject: "math" },
  { prompt: "Mennyi a 100 fele?", options: ["25", "50", "75", "150"], correctIndex: 1, subject: "math" },
  { prompt: "Mennyi a 50 kétszerese?", options: ["75", "100", "150", "200"], correctIndex: 1, subject: "math" },
  { prompt: "Melyik a legnagyobb?", options: ["25", "52", "125", "99"], correctIndex: 2, subject: "math" },
  { prompt: "Melyik a legkisebb?", options: ["18", "81", "8", "28"], correctIndex: 2, subject: "math" },
  { prompt: "Ha egy dobozban 6 ceruza van, hány ceruza van 4 dobozban?", options: ["20", "22", "24", "26"], correctIndex: 2, subject: "math" },
  { prompt: "Ha 24 almát 4 embernek egyenlően osztunk, mennyi jut egynek?", options: ["4", "5", "6", "8"], correctIndex: 2, subject: "math" },
  { prompt: "Ha 50-ből elveszek 15-öt, mennyi marad?", options: ["25", "30", "35", "40"], correctIndex: 2, subject: "math" },
  { prompt: "Mennyi 1000 - 250?", options: ["650", "750", "850", "950"], correctIndex: 1, subject: "math" },
  // ============================================================
  // === TOVÁBBI KÖRNYEZETISMERET (bővítés v2) =====================
  // ============================================================
  { prompt: "Mi az a szivacs?", options: ["növény", "kőzet", "tengeri állat", "gáz"], correctIndex: 2, subject: "nature" },
  { prompt: "Mi a különbség a gomba és a növény között?", options: ["A gomba nem fotoszintetizál", "A gomba mindig piros", "A gomba nem él", "Nincs különbség"], correctIndex: 0, subject: "nature" },
  { prompt: "Melyik a legerősebb csontunk?", options: ["ujj", "comb", "fül", "orr"], correctIndex: 1, subject: "nature" },
  { prompt: "Melyik szervvel lélegzünk?", options: ["máj", "tüdő", "gyomor", "vese"], correctIndex: 1, subject: "nature" },
  { prompt: "Melyik szervvel pumpál vért a tested?", options: ["agy", "tüdő", "szív", "máj"], correctIndex: 2, subject: "nature" },
  { prompt: "Milyen színű a vér a testedben?", options: ["kék", "piros", "zöld", "fekete"], correctIndex: 1, subject: "nature" },
  { prompt: "Hány foga van egy felnőtt embernek (bölcsességfog nélkül)?", options: ["20", "28", "32", "40"], correctIndex: 1, subject: "nature" },
  { prompt: "Mit termel a növény nappal?", options: ["szén-dioxidot", "oxigént", "füstöt", "vizet"], correctIndex: 1, subject: "nature" },
  { prompt: "Hol van a szív a testedben?", options: ["lábban", "fejben", "a mellkas bal oldalán", "a has jobb oldalán"], correctIndex: 2, subject: "nature" },
  { prompt: "Melyik a legnagyobb óceán?", options: ["Atlanti", "Indiai", "Csendes (Pacific)", "Jégtenger"], correctIndex: 2, subject: "nature" },
  { prompt: "Milyen bolygó a Mars?", options: ["gázóriás", "kőzetbolygó", "hold", "csillag"], correctIndex: 1, subject: "nature" },
  { prompt: "Melyik állat a leggyorsabb?", options: ["csiga", "teknős", "gepárd", "ló"], correctIndex: 2, subject: "nature" },
  { prompt: "Melyik állat szúr?", options: ["teve", "szarvas", "szúnyog", "nyuszi"], correctIndex: 2, subject: "nature" },
  { prompt: "Hány kontinens van a Földön?", options: ["5", "6", "7", "8"], correctIndex: 2, subject: "nature" },
  { prompt: "Mi a Szahara?", options: ["óceán", "sivatag", "folyó", "jégmező"], correctIndex: 1, subject: "nature" },
  { prompt: "Mi Magyarország fővárosa?", options: ["Debrecen", "Szeged", "Pécs", "Budapest"], correctIndex: 3, subject: "nature" },
  { prompt: "Milyen hosszú az év?", options: ["300 nap", "365 nap", "400 nap", "500 nap"], correctIndex: 1, subject: "nature" },
  // ============================================================
  // === TOVÁBBI ANGOL MATEMATIKA (bővítés v2) =====================
  // ============================================================
  { prompt: "'Five plus six equals?' (5 + 6 = ?)", options: ["ten", "eleven", "twelve", "thirteen"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Eight minus three equals?' (8 - 3 = ?)", options: ["four", "five", "six", "seven"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Nine times two equals?' (9 × 2 = ?)", options: ["sixteen", "eighteen", "twenty", "twenty-two"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Zero' magyarul:", options: ["egy", "null", "tíz", "száz"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Hundred' magyarul:", options: ["tíz", "száz", "ezer", "millió"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Thousand' magyarul:", options: ["száz", "ezer", "millió", "milliárd"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Line' magyarul mértanban:", options: ["pont", "egyenes", "görbe", "sík"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Point' magyarul mértanban:", options: ["pont", "egyenes", "kör", "sík"], correctIndex: 0, subject: "english-math" },
  { prompt: "'Angle' magyarul:", options: ["szög", "oldal", "csúcs", "lap"], correctIndex: 0, subject: "english-math" },
  { prompt: "'Cube' magyarul mértanban:", options: ["gömb", "kocka", "kúp", "henger"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Sphere' magyarul:", options: ["kocka", "gömb", "henger", "kúp"], correctIndex: 1, subject: "english-math" },
  { prompt: "'Cylinder' magyarul:", options: ["kocka", "gömb", "henger", "kúp"], correctIndex: 2, subject: "english-math" },
];

const XP_BY_TILE: Record<number, number> = {
  [GRASS]: 20,
  [DIRT]: 24,
  [STONE]: 34,
  [LOG]: 30,
  [LEAVES]: 18,
  [COAL]: 56,
  [IRON]: 88,
  [DIAMOND]: 140,
  [AIR]: 0,
  [BEDROCK]: 0,
  [CREEPER]: 280,
  [SAND]: 22,
  [WATER]: 0,
  [ZOMBIE]: 320, // +2× nehezebb XP-ben mint a creeper
  [SKELETON]: 380, // legritkább, legtöbb XP
  [SPIDER]: 260,
};

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function buildWorld(config: LevelConfig): Uint8Array {
  const g = new Uint8Array(ROWS * COLS);
  let base = 8;
  const topByCol: number[] = [];

  for (let c = 0; c < COLS; c++) {
    base += randInt(-1, 1);
    base = Math.max(5, Math.min(10, base));
    const top = Math.max(4, Math.min(11, Math.round(base + Math.sin(c * 0.24) * 1.2)));
    topByCol.push(top);
    for (let r = 0; r < ROWS; r++) {
      const i = r * COLS + c;
      if (r < top) g[i] = AIR;
      else if (r === top) g[i] = GRASS;
      else if (r < top + 3) g[i] = DIRT;
      else g[i] = STONE;
    }
  }

  const caveCount = config.caveCount;
  for (let n = 0; n < caveCount; n++) {
    const cx = randInt(5, COLS - 6);
    const cy = randInt(9, ROWS - 2);
    const rx = randInt(2, 4);
    const ry = randInt(1, 2);
    for (let r = cy - ry; r <= cy + ry; r++) {
      for (let c = cx - rx; c <= cx + rx; c++) {
        if (r <= 0 || c <= 0 || r >= ROWS - 1 || c >= COLS - 1) continue;
        const nx = (c - cx) / rx;
        const ny = (r - cy) / ry;
        if (nx * nx + ny * ny < 1.1) g[r * COLS + c] = AIR;
      }
    }
  }

  for (let c = 8; c < COLS - 8; c++) {
    const top = topByCol[c] ?? 8;
    if (Math.random() < config.treeDensity) {
      // Több pályán nagyobb a mob-arány (nehezebb pályán több bónusz-mob).
      const mobChance = config.biome === "diamond" ? 0.30 : config.biome === "caves" ? 0.24 : 0.18;
      if (Math.random() < mobChance && top - 1 >= 0) {
        // 3. szinttől zombi is megjelenhet a felszínen (40% esély a creeper helyett)
        const useZombie = config.id >= 3 && Math.random() < 0.4;
        g[(top - 1) * COLS + c] = useZombie ? ZOMBIE : CREEPER;
      } else {
        const h = randInt(2, 4);
        for (let t = 1; t <= h; t++) g[(top - t) * COLS + c] = LOG;
        const tr = top - h;
        for (let dr = -2; dr <= 1; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const rr = tr + dr;
            const cc = c + dc;
            if (rr > 0 && rr < ROWS && cc > 0 && cc < COLS && Math.abs(dc) + Math.abs(dr) <= 3) {
              if (g[rr * COLS + cc] === AIR) g[rr * COLS + cc] = LEAVES;
            }
          }
        }
      }
    }
    // Érc-elhelyezés a level config szerint. 'diamond' biomon több gyémánt+vas.
    const oreMul = config.oreMultiplier;
    const coalP = 0.052 * oreMul;
    const ironP = config.biome === "diamond" ? 0.072 * oreMul + 0.020 : 0.072 * oreMul;
    const diamondP = config.biome === "diamond" ? 0.080 * oreMul + 0.025 : 0.080 * oreMul;
    for (let r = top + 2; r < ROWS - 1; r++) {
      const i = r * COLS + c;
      if (g[i] !== STONE) continue;
      const roll = Math.random();
      if (roll < coalP) g[i] = COAL;
      else if (roll < ironP) g[i] = IRON;
      else if (roll < diamondP) g[i] = DIAMOND;
    }
  }

  // Bióma-eltolódás: 'desert' pályán sok homok+tó, 'forest' minimális.
  const biomeBaseCount = config.biome === "desert" ? 6 : config.biome === "forest" ? 2 : 4;
  const biomeCount = biomeBaseCount + randInt(0, 2);
  const sandyChance = config.biome === "desert" ? 0.45 : 0.6;
  for (let b = 0; b < biomeCount; b++) {
    const bStart = randInt(8, COLS - 14);
    const bWidth = randInt(4, 8);
    const isSandy = Math.random() < sandyChance;
    for (let c = bStart; c < bStart + bWidth && c < COLS; c++) {
      const top = topByCol[c] ?? 8;
      if (isSandy) {
        for (let dr = 0; dr < 4; dr++) {
          const rr = top + dr;
          if (rr < ROWS - 1) {
            const idx = rr * COLS + c;
            if (g[idx] === GRASS || g[idx] === DIRT) g[idx] = SAND;
          }
        }
      } else {
        const waterDepth = randInt(2, 3);
        for (let dr = 0; dr < waterDepth; dr++) {
          const rr = top + dr;
          if (rr < ROWS - 1) g[rr * COLS + c] = WATER;
        }
        for (let dr = waterDepth; dr < waterDepth + 2; dr++) {
          const rr = top + dr;
          if (rr < ROWS - 1) {
            const idx = rr * COLS + c;
            if (g[idx] === DIRT || g[idx] === STONE) g[idx] = SAND;
          }
        }
        if (top > 0 && g[(top - 1) * COLS + c] === GRASS) {
          g[(top - 1) * COLS + c] = AIR;
        }
      }
    }
  }

  // === BOSS-PÁLYA: 3 extra creeper a felszínen véletlenszerű X-pozíciókon ===
  if (config.isBossLevel) {
    let placed = 0;
    let attempts = 0;
    while (placed < 3 && attempts < 30) {
      attempts++;
      const c = randInt(8, COLS - 9);
      const top = topByCol[c] ?? 8;
      if (top - 1 >= 0 && (g[(top - 1) * COLS + c] ?? AIR) === AIR) {
        g[(top - 1) * COLS + c] = CREEPER;
        placed++;
      }
    }
  }

  // === BARLANG-MOBOK (skeleton + spider) ===
  // Csak a 4-5. szinten, a barlang-falakon (STONE cella, ami AIR-rel szomszédos).
  // Skeleton 5% esély (id≥4), spider 4% esély (id≥5).
  if (config.id >= 4) {
    const skeletonChance = 0.05;
    const spiderChance = config.id >= 5 ? 0.04 : 0;
    for (let r = 6; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        const i = r * COLS + c;
        if (g[i] !== STONE) continue;
        // Csak akkor mob, ha legalább egy szomszéd AIR (cave-fal)
        const hasAirNeighbor =
          g[i - 1] === AIR ||
          g[i + 1] === AIR ||
          g[i - COLS] === AIR ||
          g[i + COLS] === AIR;
        if (!hasAirNeighbor) continue;
        const roll = Math.random();
        if (roll < skeletonChance) g[i] = SKELETON;
        else if (roll < skeletonChance + spiderChance) g[i] = SPIDER;
      }
    }
  }

  for (let c = 0; c < COLS; c++) {
    g[(ROWS - 1) * COLS + c] = BEDROCK;
  }

  return g;
}

function findSpawn(world: Uint8Array): { x: number; y: number } {
  const c = 6;
  for (let r = 1; r < ROWS; r++) {
    const i = r * COLS + c;
    if (world[i] !== AIR) {
      return { x: c * TILE + 4, y: r * TILE - 0.1 };
    }
  }
  return { x: 6 * TILE, y: 7 * TILE };
}

function solid(t: number) {
  // A víz nem szolid (átúszható); AO és ütközés figyelmen kívül hagyja.
  return t !== AIR && t !== WATER;
}

/** Játszható-e a cella (AIR vagy bányászható tömb) */
function mineable(t: number) {
  // WATER nem bányászható (díszítő tenger), BEDROCK sem, AIR üresség.
  return t !== AIR && t !== BEDROCK && t !== WATER;
}

/** Belső canvas-koordináta a megjelenített méret és a buffer eltérése esetén is. */
function pointerOnCanvas(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / Math.max(1, rect.width);
  const scaleY = canvas.height / Math.max(1, rect.height);
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

/** Kb. 3,5 csempe „Minecraft” hatótáv a játékos középpontjától. */
function playerCanReachTile(p: { x: number; y: number }, tc: number, tr: number) {
  const pcx = p.x + PLAYER_W / 2;
  const pcy = p.y - PLAYER_H / 2;
  const tcx = tc * TILE + TILE / 2;
  const tcy = tr * TILE + TILE / 2;
  return Math.max(Math.abs(tcx - pcx), Math.abs(tcy - pcy)) <= TILE * MINING_REACH_TILES;
}

function canStandAt(world: Uint8Array, footX: number, footY: number): boolean {
  const gx0 = Math.floor(footX / TILE);
  const gx1 = Math.floor((footX + PLAYER_W) / TILE);
  const gyFoot = Math.floor(footY / TILE);
  const gyHead = Math.floor((footY - PLAYER_H) / TILE);
  if (gx0 < 0 || gx1 >= COLS || gyHead < 0 || gyFoot >= ROWS) return false;
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gy = gyHead; gy <= gyFoot; gy++) {
      if (gy < 0 || gx < 0 || gx >= COLS || gy >= ROWS) continue;
      const cell = world[gy * COLS + gx] ?? AIR;
      if (solid(cell)) return false;
    }
  }
  if (gyFoot + 1 >= ROWS) return false;
  let ground = false;
  for (let gx = gx0; gx <= gx1; gx++) {
    const below = world[(gyFoot + 1) * COLS + gx] ?? AIR;
    if (solid(below)) ground = true;
  }
  return ground;
}

function canStepTo(world: Uint8Array, footX: number, footY: number): boolean {
  const gx0 = Math.floor(footX / TILE);
  const gx1 = Math.floor((footX + PLAYER_W) / TILE);
  const gyFoot = Math.floor(footY / TILE);
  const gyHead = Math.floor((footY - PLAYER_H) / TILE);
  if (gx0 < 0 || gx1 >= COLS || gyHead < 0 || gyFoot >= ROWS) return false;
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gy = gyHead; gy <= gyFoot; gy++) {
      if (gy < 0 || gx < 0 || gx >= COLS || gy >= ROWS) continue;
      const cell = world[gy * COLS + gx] ?? AIR;
      if (solid(cell)) return false;
    }
  }
  return true;
}

/** Felfelé / szomszéd oszlopokban keresünk biztonságos állást (gödör, kvíz utáni lyuk). */
function rescuePlayerIfNeeded(world: Uint8Array, p: { x: number; y: number; vx: number; vy: number; onGround: boolean }) {
  const centerCol = Math.max(0, Math.min(COLS - 1, Math.floor((p.x + PLAYER_W / 2) / TILE)));
  for (const dc of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
    const col = Math.max(0, Math.min(COLS - 1, centerCol + dc));
    const footX = col * TILE + 4;
    for (let groundRow = ROWS - 2; groundRow >= 1; groundRow--) {
      const footY = groundRow * TILE - 0.01;
      if (canStandAt(world, footX, footY)) {
        p.x = Math.max(2, Math.min(COLS * TILE - PLAYER_W - 2, footX));
        p.y = footY;
        p.vx = 0;
        p.vy = 0;
        p.onGround = true;
        return;
      }
    }
  }
  const spawn = findSpawn(world);
  p.x = spawn.x;
  p.y = spawn.y;
  p.vx = 0;
  p.vy = 0;
  p.onGround = false;
}

/** Kvíz után: tömbbe ragadás, kibányászott talaj, vagy mélyen üresen esés alatt. */
function needsRescueAfterMine(world: Uint8Array, p: { x: number; y: number }, mined: { c: number; r: number; t: number } | null) {
  if (!canStandAt(world, p.x, p.y)) return true;
  const gx0 = Math.floor(p.x / TILE);
  const gx1 = Math.floor((p.x + PLAYER_W) / TILE);
  const gyFoot = Math.floor(p.y / TILE);
  let hasGroundBelow = false;
  if (gyFoot + 1 < ROWS) {
    for (let gx = gx0; gx <= gx1; gx++) {
      if (gx < 0 || gx >= COLS) continue;
      if (solid(world[(gyFoot + 1) * COLS + gx] ?? AIR)) {
        hasGroundBelow = true;
        break;
      }
    }
  }
  if (mined && mined.r === gyFoot + 1 && mined.c >= gx0 && mined.c <= gx1 && !hasGroundBelow) return true;
  const deep = p.y > ROWS * TILE - TILE * 4;
  return deep && !hasGroundBelow;
}

function tileRand(c: number, r: number, seed: number) {
  const n = Math.sin(c * 127.1 + r * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

/**
 * Minecraft-szerű pixel-pontos blokk renderelés.
 * Minden blokk saját 12×12 virtuális pixelmátrixot kap (TILE=24 → 2px/unit),
 * deterministikusan a (c, r) koordináta alapján a tileRand() seed-del.
 * AO: opcionálisan a szomszédos szilárd cellák alapján sötétíti az éleket.
 */
// Minecraft-hű pixel palette (Java Edition 1.x-alapú). Minden blokk 4-6 árnyalatot kap.
const MC_PAL: Record<number, { main: string; dark: string; darker: string; light: string; accent?: string; accent2?: string }> = {
  [GRASS]:   { main: "#5DA132", dark: "#3F7A23", darker: "#2C5A18", light: "#7BC74A", accent: "#8BDB52" },
  [DIRT]:    { main: "#8A5A2E", dark: "#6B4422", darker: "#4F3218", light: "#A8724A", accent: "#99653C" },
  [STONE]:   { main: "#7A7A7A", dark: "#5E5E5E", darker: "#424242", light: "#9A9A9A", accent: "#6A6A6A" },
  [LOG]:     { main: "#6B4423", dark: "#4E3119", darker: "#35200F", light: "#8B5E33", accent: "#2B1A0B", accent2: "#A67848" },
  [LEAVES]:  { main: "#2E7A1E", dark: "#215818", darker: "#153610", light: "#4BA530", accent: "#67C24A" },
  [COAL]:    { main: "#7A7A7A", dark: "#5E5E5E", darker: "#1C1C1C", light: "#9A9A9A", accent: "#0A0A0A" },
  [IRON]:    { main: "#7A7A7A", dark: "#5E5E5E", darker: "#424242", light: "#9A9A9A", accent: "#D8A56E", accent2: "#B28048" },
  [DIAMOND]: { main: "#7A7A7A", dark: "#5E5E5E", darker: "#424242", light: "#9A9A9A", accent: "#5ECEE8", accent2: "#B8F4FA" },
  [BEDROCK]: { main: "#4A4A4A", dark: "#2C2C2C", darker: "#111111", light: "#5C5C5C", accent: "#1A1A1A" },
  [CREEPER]: { main: "#4BA84B", dark: "#368A36", darker: "#1F5C1F", light: "#6CC46C", accent: "#0A0A0A", accent2: "#FFFFFF" },
  [SAND]:    { main: "#D9C27A", dark: "#B69A55", darker: "#80673A", light: "#F0DE9C", accent: "#C8AD67" },
  [WATER]:   { main: "#3E79D8", dark: "#2650A8", darker: "#17326C", light: "#72B7FF", accent: "#B8E6FF", accent2: "#1E438F" },
  // Új mob-blokkok (CREEPER mintáját követve, eltérő színekkel)
  [ZOMBIE]:   { main: "#3A6B45", dark: "#2A4F32", darker: "#162A1A", light: "#588B5C", accent: "#0A0A0A", accent2: "#7DC174" }, // sötét-zöldes-hús, bőr
  [SKELETON]: { main: "#D8D6CE", dark: "#A6A498", darker: "#62605A", light: "#F2F0E6", accent: "#0A0A0A", accent2: "#0E1B36" }, // csont-fehér + sötét szem
  [SPIDER]:   { main: "#1F1A18", dark: "#0E0A09", darker: "#040303", light: "#3A2C28", accent: "#FF4D40", accent2: "#7A1810" }, // fekete pók + piros szem
};

const BLOCK_3D_SIZE = 1;
/**
 * Klasszikus Minecraft-kocka (1×1×1) — minden lane-be ugyanezt a geometriát
 * használjuk; per-face textúra GRASS-en marad.
 */
const BLOCK_3D_DEPTH = 1.0;
const WORLD_CENTER_X = COLS / 2;
const WATER_SURFACE_Z = 0.08;
/**
 * 5 párhuzamos blokk-réteg z-tengelyen → "4 kocka mély út" megjelenés.
 * Eddig egyetlen rétegnél a játéktér laposnak (= 2D-falnak) tűnt.
 * Most a 2D world-array-t z-tengelyen 5× duplikáljuk, minden cellához
 * 5 mesh kerül z=-2.0, -1.0, 0.0, +1.0, +2.0 pozíciókba — így a kamera
 * 17°-os lefelé-tilt-jénél a felső blokkok mind az 5 sora látszik egymás
 * mögött, igazi voxel-mélységgel. A játékos a +2.0 lane FRONT-FACE előtt
 * sétál (z=+2.55), így ütközik a "legfelső" sor felületével.
 */
const WORLD_LANES = [-2.0, -1.0, 0.0, 1.0, 2.0] as const;
/** Az a lane, ahol a játékos sétál (legközelebbi a kamerához). */
const FRONT_LANE_Z = WORLD_LANES[WORLD_LANES.length - 1]!;
/**
 * Játékos a legközelebbi lane FRONT-FACE síkja előtt 0.05 unit-tal.
 * Front-face = FRONT_LANE_Z + BLOCK_3D_DEPTH/2 = +2.5 → player z = +2.55.
 * A foot pixel-pontosan a legfelső sor blokk-tetején, közvetlenül a
 * kamera felé eső lap előtt — nincs parallax-eltolódás.
 */
const PLAYER_DEPTH_Z = FRONT_LANE_Z + BLOCK_3D_DEPTH / 2 + 0.05;

function tileTo3d(c: number, r: number, z = 0) {
  return new THREE.Vector3(c - WORLD_CENTER_X + 0.5, ROWS - r - 0.5, z);
}

/**
 * Avatar group Y-offset = +0.97 unit a foot pixel-pozíció felett, mert
 * az új Steve-arányú avatar legalsó mesh-je (boot-bottom) a group origintől
 * -0.97 egységre van. Így a foot mesh **pontosan** a blokk-tető Y-jával
 * esik egybe (foot_world_y = ROWS - p.y/TILE), nincs lebegés és nincs clip.
 */
function playerTo3d(p: { x: number; y: number }) {
  return new THREE.Vector3(p.x / TILE - WORLD_CENTER_X + PLAYER_W / TILE / 2, ROWS - p.y / TILE + 0.97, PLAYER_DEPTH_Z);
}

function blockDepthZ(cell: number) {
  return cell === WATER ? WATER_SURFACE_Z : 0;
}

function desiredCanvasCssSize(el: HTMLCanvasElement) {
  const parent = el.parentElement;
  const parentW = Math.max(320, Math.floor(parent?.clientWidth ?? 380));
  const maxH = parentW >= 640 ? 520 : 440;
  const height = Math.min(maxH, Math.max(300, Math.round(parentW * 0.56)));
  return { width: parentW, height };
}

function sizeCanvasElement(el: HTMLCanvasElement) {
  const { width, height } = desiredCanvasCssSize(el);
  if (el.width !== width) el.width = width;
  if (el.height !== height) el.height = height;
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
}

function rendererCssSize(el: HTMLCanvasElement) {
  const rect = el.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width || el.clientWidth || desiredCanvasCssSize(el).width)),
    height: Math.max(1, Math.round(rect.height || el.clientHeight || desiredCanvasCssSize(el).height)),
  };
}

/**
 * 12×12 színrácsból CanvasTexture: pixel-perfekt, NearestFilter, sRGB.
 * Méret = 12 × pixelScale (alapértelmezett 14 → 168×168 px). Ennek a célja:
 * elég nagy felbontás, hogy közeli kameránál is élesek legyenek a pixelek.
 */
function gridToTexture(grid: string[][], pixelScale = 14): THREE.CanvasTexture {
  const size = 12 * pixelScale;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        ctx.fillStyle = grid[py][px];
        ctx.fillRect(px * pixelScale, py * pixelScale, pixelScale, pixelScale);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.anisotropy = 1;
  return tex;
}

/** Csak a fű felső 3 sora + apró cseppek — fű-tetejű blokk top-face. */
function buildGrassTopPattern(): string[][] {
  const pal = MC_PAL[GRASS];
  const grid: string[][] = Array.from({ length: 12 }, () => Array(12).fill(pal.main));
  for (let py = 0; py < 12; py++) {
    for (let px = 0; px < 12; px++) {
      const h = tileRand(px * 1.7, py * 1.3, 11.7);
      grid[py][px] = h < 0.18 ? pal.light! : h < 0.50 ? pal.main : h < 0.82 ? pal.dark : pal.darker;
    }
  }
  return grid;
}

/** 12×12 dirt-only minta (grass alja, vagy kenyérszerű föld blokk). */
function buildPureDirtPattern(): string[][] {
  const pal = MC_PAL[DIRT];
  const grid: string[][] = Array.from({ length: 12 }, () => Array(12).fill(pal.main));
  for (let py = 0; py < 12; py++) {
    for (let px = 0; px < 12; px++) {
      const h = tileRand(px * 2.1, py * 1.9, 53.9);
      grid[py][px] = h < 0.14 ? pal.light! : h < 0.45 ? pal.main : h < 0.82 ? pal.dark : pal.darker;
    }
  }
  return grid;
}

/**
 * 3D anyagrendszer: minden blokktípushoz CanvasTexture (a 2D pixelmintából).
 * GRASS-nál külön top/side/bottom textúra (mint a valódi Minecraftban):
 *  - top: tisztán fű
 *  - side: fű-tető + dirt body (használjuk mcBlockPatternBuild(GRASS) outputot)
 *  - bottom: tiszta dirt
 *
 * Box face order: +X, -X, +Y (top), -Y (bottom), +Z, -Z.
 */
function makeBlockMaterials() {
  const buildTex = (t: number, c = 0, r = 0) => gridToTexture(mcBlockPatternBuild(t, c, r));

  const stdMat = (
    tex: THREE.Texture,
    options: Partial<THREE.MeshStandardMaterialParameters> = {},
  ) =>
    new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.92,
      metalness: 0.02,
      ...options,
    });

  // GRASS — per-face textúra: top=fű, sides=fű+dirt, bottom=dirt.
  const grassTopTex = gridToTexture(buildGrassTopPattern());
  const grassSideTex = buildTex(GRASS);
  const dirtTex = gridToTexture(buildPureDirtPattern());
  const grassMaterials: THREE.MeshStandardMaterial[] = [
    stdMat(grassSideTex), // +X (right side)
    stdMat(grassSideTex), // -X (left side)
    stdMat(grassTopTex),  // +Y (top — tiszta fű)
    stdMat(dirtTex),      // -Y (bottom — tiszta dirt)
    stdMat(grassSideTex), // +Z (front)
    stdMat(grassSideTex), // -Z (back)
  ];

  // LOG — top/bottom = évgyűrűs fa-keresztmetszet, sides = függőleges rostok.
  const logSideTex = buildTex(LOG);
  const logTopGrid: string[][] = Array.from({ length: 12 }, () => Array(12).fill(MC_PAL[LOG].main));
  const logPal = MC_PAL[LOG];
  for (let py = 0; py < 12; py++) {
    for (let px = 0; px < 12; px++) {
      const dx = px - 5.5;
      const dy = py - 5.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Évgyűrűs hatás: 3 koncentrikus sávolás.
      const ring = Math.floor(dist / 1.5);
      logTopGrid[py][px] = ring % 2 === 0 ? logPal.main : logPal.light!;
      if (dist < 1.4) logTopGrid[py][px] = logPal.accent ?? logPal.darker;
    }
  }
  const logTopTex = gridToTexture(logTopGrid);
  const logMaterials: THREE.MeshStandardMaterial[] = [
    stdMat(logSideTex), stdMat(logSideTex),
    stdMat(logTopTex),  stdMat(logTopTex),
    stdMat(logSideTex), stdMat(logSideTex),
  ];

  const map = new Map<number, THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]>();
  map.set(GRASS, grassMaterials);
  map.set(LOG, logMaterials);
  map.set(DIRT, stdMat(dirtTex));
  map.set(STONE, stdMat(buildTex(STONE)));
  map.set(LEAVES, stdMat(buildTex(LEAVES), { transparent: true, opacity: 0.93, alphaTest: 0.05 }));
  map.set(COAL, stdMat(buildTex(COAL), { emissive: new THREE.Color("#111111"), emissiveIntensity: 0.20 }));
  map.set(IRON, stdMat(buildTex(IRON), { emissive: new THREE.Color("#8a4f24"), emissiveIntensity: 0.20 }));
  map.set(DIAMOND, stdMat(buildTex(DIAMOND), { emissive: new THREE.Color("#2dd4e8"), emissiveIntensity: 0.50 }));
  map.set(BEDROCK, stdMat(buildTex(BEDROCK)));
  map.set(CREEPER, stdMat(buildTex(CREEPER), { emissive: new THREE.Color("#145214"), emissiveIntensity: 0.32 }));
  map.set(SAND, stdMat(buildTex(SAND)));
  map.set(WATER, stdMat(buildTex(WATER), { transparent: true, opacity: 0.62, roughness: 0.18, metalness: 0.06 }));
  map.set(ZOMBIE, stdMat(buildTex(ZOMBIE), { emissive: new THREE.Color("#1a3a1f"), emissiveIntensity: 0.28 }));
  map.set(SKELETON, stdMat(buildTex(SKELETON), { emissive: new THREE.Color("#7a7870"), emissiveIntensity: 0.18 }));
  map.set(SPIDER, stdMat(buildTex(SPIDER), { emissive: new THREE.Color("#3a0a06"), emissiveIntensity: 0.24 }));
  return map;
}

/**
 * Minecraft-Steve-szerű arányú avatar:
 *  - Fej: 0.5×0.5×0.5 (Minecraft 8/8/8 px)
 *  - Törzs: 0.5×0.75×0.25 (8/12/4 px)
 *  - Kar/láb: 0.25×0.75×0.25 (4/12/4 px)
 * Karaktermagasság ~1.85 unit, jól illeszkedik 1×1 blokkos talajhoz.
 */
function createPlayerAvatar() {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: "#E0AC7E", roughness: 0.78 });
  const hair = new THREE.MeshStandardMaterial({ color: "#3A2417", roughness: 0.9 });
  const face = new THREE.MeshStandardMaterial({ color: "#E0AC7E", roughness: 0.78 });
  const shirt = new THREE.MeshStandardMaterial({ color: "#26B5E8", roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: "#2C3F8F", roughness: 0.88 });
  const boot = new THREE.MeshStandardMaterial({ color: "#0F172A", roughness: 0.9 });
  const pick = new THREE.MeshStandardMaterial({ color: "#A16207", roughness: 0.72 });
  const metal = new THREE.MeshStandardMaterial({ color: "#CBD5E1", roughness: 0.40, metalness: 0.22 });

  const addBox = (name: string, size: [number, number, number], pos: [number, number, number], mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.name = name;
    mesh.position.set(...pos);
    group.add(mesh);
    return mesh;
  };

  // Lábak (Steve 4x12x4 px → 0.25×0.75×0.25)
  addBox("leg-left", [0.25, 0.75, 0.25], [-0.13, -0.50, 0], pants);
  addBox("leg-right", [0.25, 0.75, 0.25], [0.13, -0.50, 0], pants);
  addBox("boot-left", [0.27, 0.10, 0.30], [-0.13, -0.92, 0.025], boot);
  addBox("boot-right", [0.27, 0.10, 0.30], [0.13, -0.92, 0.025], boot);
  // Törzs (8x12x4 px → 0.5×0.75×0.25)
  addBox("torso", [0.50, 0.75, 0.25], [0, 0.27, 0], shirt);
  // Karok (4x12x4 px → 0.25×0.75×0.25)
  addBox("arm-left", [0.25, 0.75, 0.25], [-0.375, 0.27, 0], skin);
  addBox("arm-right", [0.25, 0.75, 0.25], [0.375, 0.27, 0], skin);
  // Fej (8x8x8 px → 0.5×0.5×0.5)
  addBox("head", [0.50, 0.50, 0.50], [0, 0.92, 0], face);
  // Haj overlay (vékony tetejű réteg)
  addBox("hair", [0.52, 0.12, 0.52], [0, 1.13, 0], hair);
  addBox("hair-back", [0.52, 0.30, 0.10], [0, 1.02, -0.21], hair);
  // Szemek (kicsi sötét pixel-foltok az arc oldalán)
  const eyeMat = new THREE.MeshStandardMaterial({ color: "#1A1A1A", roughness: 0.9 });
  addBox("eye-l", [0.06, 0.06, 0.04], [-0.10, 0.95, 0.26], eyeMat);
  addBox("eye-r", [0.06, 0.06, 0.04], [0.10, 0.95, 0.26], eyeMat);
  // Csákány a jobb kéznél
  const handleMesh = addBox("pick-handle", [0.05, 0.55, 0.05], [0.50, 0.25, 0.15], pick);
  handleMesh.rotation.z = -0.55;
  const headMesh = addBox("pick-head", [0.34, 0.10, 0.10], [0.62, 0.50, 0.16], metal);
  headMesh.rotation.z = -0.55;

  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  return group;
}

/**
 * Determinisztikus blokk-textúra cache (module-scoped).
 * Mivel mcBlockPattern() kimenete tisztán determinisztikus (t, c, r) alapján,
 * a render loop hot-pathán cache-eljük Map-be.
 *
 * Felső határ (memória-biztonsági korlát):
 *   ROWS × COLS × block-types = 16 × 64 × 10 ≈ 10 240–11 264 bejegyzés
 *   (AIR=0 nem cache-eli, drawBlock "if (!t) return" mögött).
 *   Egy bejegyzés = 12×12 grid = 144 string-referencia (MC_PAL konstansokra mutatnak)
 *     + 13 array objektum + Map overhead.
 *   Reality-check: runtime memory-footprint ~15–25 MB (nem ~2–3 MB, mint korábban
 *   becsültem). Dinamikus world / végtelen koordináta-domain esetén korlátlan
 *   növekedés — de a jelenlegi kódban ilyen útvonal nincs (ROWS/COLS fix, MenuBlock
 *   csak konstans mintát kér).
 *
 * A hover animáció és pulse overlay-ek nem mennek a cache-be, azok a drawBlock-ban futnak.
 */
const mcBlockPatternCache: Map<string, string[][]> = new Map();

/**
 * Determinisztikus pixelmátrix egy blokkhoz. U=TILE/12 unit-méret (2px TILE=24-nél).
 * Visszaadja a 12x12 színmátrixot (a pal alapján kiválasztva). Cache-elt.
 */
function mcBlockPattern(t: number, c: number, r: number): string[][] {
  const cacheKey = t + ":" + c + ":" + r;
  const cached = mcBlockPatternCache.get(cacheKey);
  if (cached) return cached;
  const grid = mcBlockPatternBuild(t, c, r);
  mcBlockPatternCache.set(cacheKey, grid);
  return grid;
}

/** Determinisztikus pattern építő (belső — cache-elt wrapper hívja meg). */
function mcBlockPatternBuild(t: number, c: number, r: number): string[][] {
  const pal = MC_PAL[t] || MC_PAL[STONE];
  const grid: string[][] = Array.from({ length: 12 }, () => Array(12).fill(pal.main));

  if (t === GRASS) {
    // Felső 3 sor: zöld fű (vegyes árnyalat, pixelezett felső él).
    for (let py = 0; py < 3; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 11.7);
        grid[py][px] = h < 0.22 ? pal.light! : h < 0.55 ? pal.main : pal.dark;
      }
    }
    // Fű-cseppek lecsorognak a DIRT-re (1-2 pixel).
    for (let px = 0; px < 12; px++) {
      if (tileRand(c + px, r, 29.1) < 0.25) grid[3][px] = pal.dark;
      if (tileRand(c + px, r, 37.3) < 0.12) grid[4][px] = pal.darker;
    }
    // Alatta DIRT textúra.
    const dPal = MC_PAL[DIRT];
    for (let py = 3; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        if (py === 3 && grid[py][px] !== pal.main) continue; // fű-csepp maradjon
        const h = tileRand(c + px, r + py, 41.3);
        grid[py][px] = h < 0.16 ? dPal.light! : h < 0.42 ? dPal.main : h < 0.8 ? dPal.dark : dPal.darker;
      }
    }
  } else if (t === DIRT) {
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 53.9);
        grid[py][px] = h < 0.14 ? pal.light! : h < 0.45 ? pal.main : h < 0.82 ? pal.dark : pal.darker;
      }
    }
  } else if (t === STONE) {
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 67.2);
        grid[py][px] = h < 0.18 ? pal.light! : h < 0.52 ? pal.main : h < 0.85 ? pal.dark : pal.darker;
      }
    }
    // Repedések (sötét pixelvonalak).
    const crackSeed = tileRand(c, r, 81.5);
    if (crackSeed < 0.5) {
      const cx = Math.floor(crackSeed * 10) + 1;
      const cy = Math.floor(tileRand(c, r, 91.3) * 8) + 2;
      for (let i = 0; i < 4; i++) {
        const px = Math.max(0, Math.min(11, cx + i - 1));
        const py = Math.max(0, Math.min(11, cy + Math.floor((tileRand(c, r, 103 + i) - 0.5) * 2)));
        grid[py][px] = pal.darker;
      }
    }
  } else if (t === LOG) {
    // Oldalirányú rostok: függőleges fekete/világos vonalak.
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        // Rostok x-pozíciója csak a col-tól függ, r nem vált.
        const band = Math.floor(px / 2) + Math.floor(tileRand(c, r + py, 17.3) * 1.3);
        if (band % 3 === 0) grid[py][px] = pal.dark;
        else if (band % 3 === 1) grid[py][px] = pal.main;
        else grid[py][px] = pal.light!;
      }
    }
    // Évgyűrű-jellegű pontok (random sötét foltok).
    for (let k = 0; k < 4; k++) {
      const rx = Math.floor(tileRand(c, r, 27 + k) * 11);
      const ry = Math.floor(tileRand(c, r, 31 + k) * 11);
      grid[ry][rx] = pal.accent!;
    }
  } else if (t === LEAVES) {
    // Ritka, levélszerű pixelmintázat — több árnyék.
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 127.1);
        grid[py][px] = h < 0.10 ? pal.accent! : h < 0.30 ? pal.light! : h < 0.60 ? pal.main : h < 0.85 ? pal.dark : pal.darker;
      }
    }
    // Ritka fekete pontok (levelek közti hézagok).
    for (let k = 0; k < 5; k++) {
      const rx = Math.floor(tileRand(c, r, 151 + k) * 12);
      const ry = Math.floor(tileRand(c, r, 173 + k) * 12);
      grid[ry][rx] = pal.darker;
    }
  } else if (t === COAL) {
    // Stone alapra fekete pixelcsomók.
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 191.3);
        grid[py][px] = h < 0.18 ? pal.light! : h < 0.52 ? pal.main : h < 0.85 ? pal.dark : pal.darker;
      }
    }
    const clusters = [[3, 3], [8, 4], [4, 8], [9, 9]];
    clusters.forEach(([cx, cy], idx) => {
      if (tileRand(c, r, 200 + idx) < 0.75) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const px = cx + dx;
            const py = cy + dy;
            if (px >= 0 && px < 12 && py >= 0 && py < 12) {
              if (tileRand(c + px, r + py, 211 + idx) < 0.78) grid[py][px] = pal.accent!;
            }
          }
        }
      }
    });
  } else if (t === IRON) {
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 233.7);
        grid[py][px] = h < 0.18 ? pal.light! : h < 0.52 ? pal.main : h < 0.85 ? pal.dark : pal.darker;
      }
    }
    // Narancs-barna vas-csomók.
    const clusters = [[2, 4], [7, 3], [5, 8], [10, 9]];
    clusters.forEach(([cx, cy], idx) => {
      if (tileRand(c, r, 250 + idx) < 0.70) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const px = cx + dx;
            const py = cy + dy;
            if (px >= 0 && px < 12 && py >= 0 && py < 12) {
              const rv = tileRand(c + px, r + py, 261 + idx);
              if (rv < 0.7) grid[py][px] = rv < 0.3 ? pal.accent2! : pal.accent!;
            }
          }
        }
      }
    });
  } else if (t === DIAMOND) {
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 277.1);
        grid[py][px] = h < 0.18 ? pal.light! : h < 0.52 ? pal.main : h < 0.85 ? pal.dark : pal.darker;
      }
    }
    // Ciánkék gyémánt pixelcsomók — ritkábbak, de fényesebbek.
    const clusters = [[3, 4], [8, 7], [5, 9]];
    clusters.forEach(([cx, cy], idx) => {
      if (tileRand(c, r, 290 + idx) < 0.80) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const px = cx + dx;
            const py = cy + dy;
            if (px >= 0 && px < 12 && py >= 0 && py < 12) {
              const rv = tileRand(c + px, r + py, 301 + idx);
              if (rv < 0.78) grid[py][px] = rv < 0.35 ? pal.accent2! : pal.accent!;
            }
          }
        }
      }
    });
  } else if (t === BEDROCK) {
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 317.3);
        grid[py][px] = h < 0.16 ? pal.light! : h < 0.48 ? pal.main : h < 0.78 ? pal.dark : pal.darker;
      }
    }
    // Sötét foltok (a bedrock jellegzetes "összevissza" mintázata).
    for (let k = 0; k < 6; k++) {
      const rx = Math.floor(tileRand(c, r, 331 + k) * 12);
      const ry = Math.floor(tileRand(c, r, 347 + k) * 12);
      grid[ry][rx] = pal.accent!;
    }
  } else if (t === CREEPER) {
    // Bázis: pixeles zöld mintázat.
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 373.5);
        grid[py][px] = h < 0.22 ? pal.light! : h < 0.60 ? pal.main : h < 0.88 ? pal.dark : pal.darker;
      }
    }
    // Szemek (2x2 fekete) + szemfehér (1x1).
    grid[4][2] = pal.accent!; grid[4][3] = pal.accent!;
    grid[5][2] = pal.accent!; grid[5][3] = pal.accent!;
    grid[4][8] = pal.accent!; grid[4][9] = pal.accent!;
    grid[5][8] = pal.accent!; grid[5][9] = pal.accent!;
    // Creeper száj (klasszikus "mmm" alak).
    grid[7][4] = pal.accent!; grid[7][5] = pal.accent!;
    grid[7][6] = pal.accent!; grid[7][7] = pal.accent!;
    grid[8][3] = pal.accent!; grid[8][4] = pal.accent!;
    grid[8][7] = pal.accent!; grid[8][8] = pal.accent!;
    grid[9][3] = pal.accent!; grid[9][8] = pal.accent!;
  } else if (t === ZOMBIE) {
    // Bázis: zöldes-húsos pixeles mintázat (CREEPER-szerű, sötétebb-foltos).
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 419.7);
        grid[py][px] = h < 0.20 ? pal.light! : h < 0.58 ? pal.main : h < 0.88 ? pal.dark : pal.darker;
      }
    }
    // Sebek / foltok: random sötétebb pötty (4 db)
    for (let k = 0; k < 4; k++) {
      const px = Math.floor(tileRand(c, r, 433 + k) * 11);
      const py = Math.floor(tileRand(c, r, 449 + k) * 11);
      grid[py][px] = pal.accent2!; // világosabb húsos folt
    }
    // Üres szemek (1x2 sötét)
    grid[4][2] = pal.accent!; grid[5][2] = pal.accent!;
    grid[4][9] = pal.accent!; grid[5][9] = pal.accent!;
    // Nyitott száj (lefelé ívelő, 4 pixel)
    grid[7][4] = pal.accent!; grid[7][5] = pal.accent!;
    grid[7][6] = pal.accent!; grid[7][7] = pal.accent!;
    grid[8][5] = pal.accent!; grid[8][6] = pal.accent!;
  } else if (t === SKELETON) {
    // Bázis: csontfehér zajos mintázat.
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 467.3);
        grid[py][px] = h < 0.20 ? pal.light! : h < 0.55 ? pal.main : h < 0.85 ? pal.dark : pal.darker;
      }
    }
    // Üres koponya-szem-üregek (2x2 sötét, mélyebbek mint creeper)
    grid[3][2] = pal.accent!; grid[3][3] = pal.accent!;
    grid[4][2] = pal.accent!; grid[4][3] = pal.accent!;
    grid[5][3] = pal.darker;
    grid[3][8] = pal.accent!; grid[3][9] = pal.accent!;
    grid[4][8] = pal.accent!; grid[4][9] = pal.accent!;
    grid[5][8] = pal.darker;
    // Orrlyuk
    grid[6][5] = pal.accent!; grid[6][6] = pal.accent!;
    // Fogazat (vízszintes 6 fog)
    grid[8][3] = pal.accent!; grid[8][4] = pal.accent!;
    grid[8][5] = pal.accent!; grid[8][6] = pal.accent!;
    grid[8][7] = pal.accent!; grid[8][8] = pal.accent!;
    grid[9][3] = pal.darker; grid[9][5] = pal.darker; grid[9][7] = pal.darker;
  } else if (t === SPIDER) {
    // Bázis: fekete-szőrös mintázat
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 503.1);
        grid[py][px] = h < 0.18 ? pal.light! : h < 0.55 ? pal.main : h < 0.85 ? pal.dark : pal.darker;
      }
    }
    // 8 láb a peremen (4 oldalsó pár)
    grid[2][0] = pal.accent2!; grid[3][1] = pal.accent2!;
    grid[2][11] = pal.accent2!; grid[3][10] = pal.accent2!;
    grid[5][0] = pal.accent2!; grid[5][11] = pal.accent2!;
    grid[7][0] = pal.accent2!; grid[7][11] = pal.accent2!;
    grid[9][0] = pal.accent2!; grid[10][1] = pal.accent2!;
    grid[9][11] = pal.accent2!; grid[10][10] = pal.accent2!;
    // 8 piros pók-szem (kompakt cluster középen)
    grid[5][4] = pal.accent!; grid[5][5] = pal.accent!;
    grid[5][6] = pal.accent!; grid[5][7] = pal.accent!;
    grid[6][4] = pal.accent!; grid[6][7] = pal.accent!;
    // Csáp / állkapocs (4 pixel a száj alatt)
    grid[7][5] = pal.darker; grid[7][6] = pal.darker;
    grid[8][4] = pal.darker; grid[8][7] = pal.darker;
  } else if (t === SAND) {
    // Homok: finomabb szemcsék, vízszintes rétegek, enyhén szóródó pixelek.
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 389.7);
        grid[py][px] = h < 0.14 ? pal.light! : h < 0.58 ? pal.main : h < 0.88 ? pal.dark : pal.darker;
      }
    }
    // Vízszintes rétegződés (horizontális homokcsíkok).
    for (let py = 2; py < 12; py += 3) {
      for (let px = 0; px < 12; px++) {
        if (tileRand(c + px, r + py, 401.3) < 0.35) grid[py][px] = pal.accent!;
      }
    }
    // Szórt "szemcsék" (világosabb pontok).
    for (let k = 0; k < 3; k++) {
      const rx = Math.floor(tileRand(c, r, 417 + k) * 12);
      const ry = Math.floor(tileRand(c, r, 429 + k) * 12);
      grid[ry][rx] = pal.light!;
    }
  } else if (t === WATER) {
    // Víz: hullámzó mintázat, mély kék felső rész, világos "tükröző" csíkok.
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        const h = tileRand(c + px, r + py, 443.1);
        grid[py][px] = h < 0.22 ? pal.light! : h < 0.55 ? pal.main : h < 0.85 ? pal.dark : pal.darker;
      }
    }
    // Világos hullám csíkok (felső 3 sor).
    for (let py = 0; py < 3; py++) {
      for (let px = 0; px < 12; px++) {
        if (tileRand(c + px, r + py, 457.3) < 0.45) grid[py][px] = pal.accent!;
      }
    }
    // Mély foltok alul (deep water).
    for (let py = 9; py < 12; py++) {
      for (let px = 0; px < 12; px++) {
        if (tileRand(c + px, r + py, 471.5) < 0.38) grid[py][px] = pal.accent2!;
      }
    }
  }

  return grid;
}

type NeighborSolid = { top: boolean; bottom: boolean; left: boolean; right: boolean };

function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  time: number,
  worldCol?: number,
  worldRow?: number,
  light?: { sunX: number; sunY: number; viewW: number; viewH: number },
  neighbors?: NeighborSolid,
) {
  if (!t) return;
  const c = worldCol ?? Math.floor(x / TILE);
  const r = worldRow ?? Math.floor(y / TILE);

  // 12x12 unit-grid, TILE=24 esetén minden unit = 2 pixel (pixel-perfekt).
  const U = TILE / 12;
  const grid = mcBlockPattern(t, c, r);

  for (let py = 0; py < 12; py++) {
    for (let px = 0; px < 12; px++) {
      ctx.fillStyle = grid[py][px];
      ctx.fillRect(x + px * U, y + py * U, U + 0.5, U + 0.5); // +0.5 anti-gap
    }
  }

  // Glow aura ritka érceknek (IRON, DIAMOND pulzálóan).
  if (t === DIAMOND || t === IRON || t === COAL) {
    const pulse = 0.5 + Math.sin(time * 0.003 + c * 0.7 + r * 1.3) * 0.5;
    const glowColor = t === DIAMOND ? "rgba(120,235,250," : t === IRON ? "rgba(216,165,110," : "rgba(60,60,70,";
    ctx.fillStyle = glowColor + (0.08 + pulse * 0.08) + ")";
    ctx.fillRect(x, y, TILE, TILE);
  }

  // CREEPER: halvány pulzálás a robbanás-készenlétre.
  if (t === CREEPER) {
    const pulse = 0.5 + Math.sin(time * 0.004) * 0.5;
    ctx.fillStyle = `rgba(255,255,180,${0.06 + pulse * 0.07})`;
    ctx.fillRect(x, y, TILE, TILE);
  }

  // LEAVES: fű/szél animáció — finom világos csíkok.
  if (t === LEAVES) {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#9BE67E";
    for (let k = 0; k < 3; k++) {
      const wind = Math.sin(time * 0.0025 + k * 1.7 + c * 0.6) * 1.5;
      ctx.fillRect(Math.round(x + 4 + k * 7 + wind), Math.round(y + 3 + k * 2), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // GRASS: apró fűszálak animációval a tetején.
  if (t === GRASS) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#B7F07A";
    for (let k = 0; k < 4; k++) {
      const wind = Math.sin(time * 0.003 + k + c * 0.6) * 1.1;
      const bx = Math.round(x + 3 + k * 5 + wind);
      ctx.fillRect(bx, Math.round(y - 1), 1, 2);
    }
    ctx.globalAlpha = 1;
  }

  // Napfény shading — ugyanaz a logika, de most a pixel-textúra fölött.
  if (light) {
    const cx = x + TILE * 0.5;
    const cy = y + TILE * 0.5;
    const toSunX = clamp01((light.sunX - cx) / Math.max(1, light.viewW) + 0.5);
    const toSunY = clamp01((light.sunY - cy) / Math.max(1, light.viewH) + 0.5);
    const lit = clamp01(0.2 + toSunX * 0.45 + (1 - toSunY) * 0.35);
    const shade = clamp01(1 - lit);

    // Napfény csillogás a felső élen.
    ctx.fillStyle = `rgba(255,255,220,${0.04 + lit * 0.08})`;
    ctx.fillRect(x, y, TILE, U * 1.2);

    // Napárnyék a távolabbi oldalon.
    ctx.fillStyle = `rgba(0,0,0,${0.05 + shade * 0.14})`;
    ctx.fillRect(x + TILE - U * 2, y, U * 2, TILE);
  }

  // Ambient Occlusion — sötétítés azon éleknél, ahol van szomszéd szilárd blokk.
  if (neighbors) {
    ctx.fillStyle = "rgba(0,0,0,0.26)";
    if (neighbors.top) {
      ctx.fillRect(x, y, TILE, U * 0.9);
    }
    if (neighbors.bottom) {
      ctx.fillRect(x, y + TILE - U * 0.9, TILE, U * 0.9);
    }
    if (neighbors.left) {
      ctx.fillRect(x, y, U * 0.9, TILE);
    }
    if (neighbors.right) {
      ctx.fillRect(x + TILE - U * 0.9, y, U * 0.9, TILE);
    }
  }

  // Klasszikus Minecraft-keret: fekete pixel-él (1 pixel).
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  if (!neighbors?.top)    ctx.fillRect(x, y, TILE, 1);
  if (!neighbors?.bottom) ctx.fillRect(x, y + TILE - 1, TILE, 1);
  if (!neighbors?.left)   ctx.fillRect(x, y, 1, TILE);
  if (!neighbors?.right)  ctx.fillRect(x + TILE - 1, y, 1, TILE);
}

function MenuBlock({ t }: { t: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext("2d");
    if (c) {
      c.imageSmoothingEnabled = false;
      drawBlock(c, 0, 0, t, performance.now(), 0, 0);
    }
  }, [t]);
  return <canvas ref={ref} width={TILE} height={TILE} className="rounded border border-black/40" style={{ imageRendering: "pixelated" as const }} />;
}

type Phase = "menu" | "play" | "quiz" | "levelComplete" | "over";

export default function BlockCraftQuiz() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<Uint8Array>(buildWorld(LEVELS[0]!));
  const playerRef = useRef({ x: 8 * TILE, y: 7 * TILE, vx: 0, vy: 0, facing: 1, onGround: false, tick: 0 });
  const keysRef = useRef({ left: false, right: false, jump: false, mine: false });
  const touchRef = useRef({ left: false, right: false, jump: false });
  const lastTRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const mineTargetRef = useRef<{ c: number; r: number; t: number } | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const streakRef = useRef(0);
  const xpPopupRef = useRef<{ amount: number; wx: number; wy: number; life: number } | null>(null);
  const hoverCellRef = useRef<{ c: number; r: number } | null>(null);
  const pointerNdcRef = useRef(new THREE.Vector2(0, 0));
  const threeRuntimeRef = useRef<ThreeRuntime | null>(null);
  const worldVersionRef = useRef(0);
  // Aktuális pálya konfigurációja — a render loop closure-ja ezen keresztül lát
  // mindig friss égszín / fény paramétereket; setState helyett ref, hogy a re-effect
  // ne ölje meg a renderert minden szintátmenetnél.
  const activeLevelRef = useRef<LevelConfig>(LEVELS[0]!);

  const [phase, setPhase] = useState<Phase>("menu");
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [wrongShake, setWrongShake] = useState(false);
  // Helyes-válasz felfedés a kvíz-modálban (zöld outline) + a hibás opció
  // piros outline-ja, 1.5s alatt fade-elődik, majd jön az új kvíz.
  const [revealCorrectIdx, setRevealCorrectIdx] = useState<number | null>(null);
  const [wrongIdx, setWrongIdx] = useState<number | null>(null);
  const streakProtector = useStreakProtector();
  const [sessionXp, setSessionXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [totalXp, setTotalXp] = useState(0);
  const [runSeconds, setRunSeconds] = useState(0);
  const [blocksMined, setBlocksMined] = useState(0);
  const [rareBlocks, setRareBlocks] = useState(0);
  // Achievement-toast queue: az "over" phase-be lépéskor töltődik fel.
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([]);
  // Multi-level state: aktuális szint indexe + szint-specifikus számlálók.
  const [levelIdx, setLevelIdx] = useState(0);
  const [levelBlocks, setLevelBlocks] = useState(0);
  const [levelRare, setLevelRare] = useState(0);
  const [levelStartXp, setLevelStartXp] = useState(0);
  const [gameWon, setGameWon] = useState(false);
  // Subject-breakdown: melyik tantárgyból hány jó választ adott.
  const [subjectStats, setSubjectStats] = useState<Record<QuizSubject, number>>({
    english: 0,
    "english-math": 0,
    math: 0,
    nature: 0,
  });
  const [timeLeft, setTimeLeft] = useState(LEVELS[0]!.timeLimit);
  const [achievement, setAchievement] = useState<string | null>(null);
  const scoreSubmittedRef = useRef(false);
  // Keep streakRef in sync for the canvas loop (avoids stale closure)
  streakRef.current = streak;

  const { data: syncEligibility } = useSyncEligibilityQuery();
  const syncBanner = useMemo(() => gameSyncBannerText(syncEligibility), [syncEligibility]);

  const { data: bankData } = useQuery<QuizBankApi>({
    queryKey: ["/api/games/quiz-bank/block-craft-quiz"],
    queryFn: async () => {
      const res = await fetch("/api/games/quiz-bank/block-craft-quiz", { credentials: "include" });
      if (!res.ok) return { items: [] };
      return res.json();
    },
  });

  // Az osztály-szintű tananyag-bázis: a játékos legutóbbi 3 anyagából AI-vel
  // generált kvíz-tételek (Claude). Ha még nincs kapcsolt kérdés, üres marad.
  const { grade: userGrade } = useClassroomGrade();
  const { items: materialItems } = useMaterialQuizzes(userGrade);

  const bank = useMemo<Quiz[]>(() => {
    // 1) Tananyag-kvízek (AI-generált, az osztályod legutóbbi 3 anyagából).
    //    Topic → BlockCraft `subject` mapping (angol/matek/környezet/magyar).
    const fromMaterial: Quiz[] = materialItems
      .filter((q) => Array.isArray(q.options) && q.options.length === 4)
      .map((q) => {
        const t = (q.topic ?? "").toLowerCase();
        const subject: QuizSubject =
          t === "math" ? "math"
          : t === "nature" ? "nature"
          : t === "english" ? "english"
          : "english"; // hungarian topic alapú kérdéseket "english" csoportba tesszük
        return {
          prompt: q.prompt,
          options: q.options.slice(0, 4),
          correctIndex: q.correctIndex,
          subject,
        };
      });
    // 2) Régi quiz-bank (block-craft-quiz gameId-vel mentett tételek)
    const remote: Quiz[] = (bankData?.items ?? [])
      .filter((q) => q.options?.length > 1)
      .map((q) => ({
        prompt: q.prompt,
        options: q.options.slice(0, 4),
        correctIndex: q.correctIndex,
        subject: "english" as QuizSubject,
      }));
    // 3) Statikus fallback (Minecraft-tematikus angol/matek/környezet/magyar)
    return [...fromMaterial, ...remote, ...QUIZ_FALLBACK];
  }, [bankData, materialItems]);

  /**
   * Stratified pool: a kvízeket tantargy szerint csoportosítja és minden
   * körben (round) újrakeveri, hogy NE ismétlődjenek közel egymáshoz.
   * Round-robin stratégia: sorban angol → angol-matek → matek → környezet
   * → angol stb. Így egyenletes lesz a tananyag-elosztas.
   */
  const subjectOrder = useMemo<QuizSubject[]>(() => ["english", "english-math", "math", "nature"], []);
  const subjectPoolsRef = useRef<Map<QuizSubject, Quiz[]>>(new Map());
  const subjectCursorsRef = useRef<Map<QuizSubject, number>>(new Map());
  const subjectRoundRef = useRef(0);
  const recentPromptsRef = useRef<string[]>([]);
  const RECENT_WINDOW = 16; // Ennyi kérdést nem ismétlünk vissza egymás után.

  /** Keveri a bank-et subject szerint és Fisher–Yates shuffle-lal */
  const rebuildSubjectPools = useCallback(() => {
    const pools = new Map<QuizSubject, Quiz[]>();
    for (const subj of subjectOrder) pools.set(subj, []);
    for (const q of bank) {
      const subj = (q.subject ?? "english") as QuizSubject;
      const arr = pools.get(subj) ?? [];
      arr.push(q);
      pools.set(subj, arr);
    }
    // Fisher–Yates shuffle minden tantargyon.
    for (const subj of subjectOrder) {
      const arr = pools.get(subj) ?? [];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j]!, arr[i]!];
      }
    }
    subjectPoolsRef.current = pools;
    subjectCursorsRef.current = new Map(subjectOrder.map((s) => [s, 0]));
    // Véletlen kezdő subject, hogy ne mindig angollal induljon a kör.
    subjectRoundRef.current = Math.floor(Math.random() * subjectOrder.length);
    recentPromptsRef.current = [];
  }, [bank, subjectOrder]);

  // Automatikus rebuilder: ha a bank változik (pl. remote data beérkezik), újrakeverjük.
  useEffect(() => {
    rebuildSubjectPools();
  }, [rebuildSubjectPools]);

  useEffect(() => {
    if (phase !== "play") return;
    const id = setInterval(() => {
      setRunSeconds((s) => s + 1);
      setTimeLeft((s) => {
        if (s <= 1) {
          setPhase("over");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  /**
   * Stratified + non-repeating quiz picker.
   * Stratégia:
   *  1. Round-robin subject kiválasztás (angol → angol-matek → matek → környezet)
   *  2. Adott subject sorrendbe szűrt pool-jából cursor-rel haladunk
   *  3. Ha a pool végére értünk, újrakeverjük és a cursor nullazódik
   *  4. Ha a választott kérdés szerepel a RECENT_WINDOW-ban, átugorjuk
   */
  const pickQuiz = useCallback((): Quiz => {
    const pools = subjectPoolsRef.current;
    if (pools.size === 0) {
      rebuildSubjectPools();
    }
    const recent = recentPromptsRef.current;

    for (let attempt = 0; attempt < subjectOrder.length * 4; attempt++) {
      const subj = subjectOrder[subjectRoundRef.current % subjectOrder.length]!;
      subjectRoundRef.current++;
      const pool = subjectPoolsRef.current.get(subj) ?? [];
      if (pool.length === 0) continue;

      let cursor = subjectCursorsRef.current.get(subj) ?? 0;

      for (let poolTry = 0; poolTry < pool.length; poolTry++) {
        if (cursor >= pool.length) {
          // Pool körbeért → újrakeverés.
          for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j]!, pool[i]!];
          }
          cursor = 0;
        }
        const candidate = pool[cursor]!;
        cursor++;

        if (!recent.includes(candidate.prompt)) {
          subjectCursorsRef.current.set(subj, cursor);
          recent.push(candidate.prompt);
          while (recent.length > RECENT_WINDOW) recent.shift();
          return candidate;
        }
      }
      subjectCursorsRef.current.set(subj, cursor);
    }
    // Végső fallback — sose kellene idejutnunk.
    return QUIZ_FALLBACK[Math.floor(Math.random() * QUIZ_FALLBACK.length)] ?? QUIZ_FALLBACK[0]!;
  }, [rebuildSubjectPools, subjectOrder]);

  const spawnDust = useCallback((x: number, y: number, tile: number) => {
    const color: Record<number, string> = {
      [GRASS]: "#7cd057", [DIRT]: "#a67a4d", [STONE]: "#afb4ba", [LOG]: "#8f6642", [LEAVES]: "#54bc60", [COAL]: "#727882", [IRON]: "#d4bfaa", [DIAMOND]: "#9ff8ff", [AIR]: "#fff", [SAND]: "#e6d29a", [WATER]: "#5E94E0", [CREEPER]: "#4ba84b",
    };
    for (let i = 0; i < 12; i++) {
      particlesRef.current.push({ x, y, vx: randInt(-80, 80), vy: randInt(-150, -40), life: 0.5 + Math.random() * 0.5, color: color[tile] || "#fff" });
    }
  }, []);

  const tryMineAt = useCallback(
    (tc: number, tr: number, opts?: { skipReach?: boolean }): boolean => {
      const p = playerRef.current;
      const w = worldRef.current;
      if (tr < 0 || tr >= ROWS || tc < 0 || tc >= COLS) return false;
      if (!opts?.skipReach && !playerCanReachTile(p, tc, tr)) return false;
      const t = w[tr * COLS + tc] ?? AIR;
      if (!mineable(t)) return false;
      p.vx = 0;
      p.vy = 0;
      const tcx = tc * TILE + TILE / 2;
      p.facing = tcx >= p.x + PLAYER_W / 2 ? 1 : -1;
      mineTargetRef.current = { c: tc, r: tr, t };
      // Stale-hover visszaállítás play → quiz átmenetnél:
      // kvíz megjelenése előtt nincs szükség hover indikátorra.
      hoverCellRef.current = null;
      setQuiz(pickQuiz());
      setPhase("quiz");
      return true;
    },
    [pickQuiz],
  );

  /** E / Bányász gomb: az arc előtti oszlopban a legközelebbi (lábtól felfelé) bányászható cella. */
  const tryMine = useCallback(() => {
    const p = playerRef.current;
    const cx = Math.floor((p.x + PLAYER_W / 2) / TILE) + p.facing;
    if (cx < 0 || cx >= COLS) return;
    const rFoot = Math.min(ROWS - 1, Math.floor(p.y / TILE) + 1);
    const rTop = Math.max(0, Math.floor((p.y - PLAYER_H) / TILE));
    for (let tr = rFoot; tr >= rTop; tr--) {
      if (tryMineAt(cx, tr, { skipReach: true })) return;
    }
  }, [tryMineAt]);

  /**
   * Egyetlen pálya elindítása: a totalXp/sessionXp NEM resetelődik (átvitt érték),
   * a level-specifikus számlálók viszont (blocks/rare/timeLeft) friss állapotból indulnak.
   */
  const beginLevel = useCallback((idx: number, options: { resetSession: boolean; carryXpFrom: number }) => {
    const cfg = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, idx))]!;
    activeLevelRef.current = cfg;
    worldRef.current = buildWorld(cfg);
    worldVersionRef.current++;
    const spawn = findSpawn(worldRef.current);
    playerRef.current = { x: spawn.x, y: spawn.y, vx: 0, vy: 0, facing: 1, onGround: false, tick: 0 };
    particlesRef.current = [];
    xpPopupRef.current = null;
    hoverCellRef.current = null;
    setAchievement(null);
    if (options.resetSession) {
      setSessionXp(0);
      setStreak(0);
      setRunSeconds(0);
      setBlocksMined(0);
      setRareBlocks(0);
      setSubjectStats({ english: 0, "english-math": 0, math: 0, nature: 0 });
    } else {
      // Új pálya kezdetén streak frissítés (kezdjük újra), de XP marad.
      setStreak(0);
    }
    setLevelBlocks(0);
    setLevelRare(0);
    setLevelStartXp(options.carryXpFrom);
    setTimeLeft(cfg.timeLimit);
    setPhase("play");
    lastTRef.current = null;
    // Minden pályán friss kérdés-sorrend.
    rebuildSubjectPools();
  }, [rebuildSubjectPools]);

  const startGame = useCallback(() => {
    scoreSubmittedRef.current = false;
    setLevelIdx(0);
    setGameWon(false);
    streakProtector.resetProtector();
    beginLevel(0, { resetSession: true, carryXpFrom: 0 });
  }, [beginLevel, streakProtector]);

  /** Következő szint: az XP/streak/rare továbbvitt, a pálya friss. */
  const startNextLevel = useCallback(() => {
    const next = levelIdx + 1;
    if (next >= LEVELS.length) {
      // Utolsó pálya után „all clear” — a játék győzelmi állapotba lép.
      setGameWon(true);
      setPhase("over");
      return;
    }
    setLevelIdx(next);
    beginLevel(next, { resetSession: false, carryXpFrom: sessionXp });
  }, [beginLevel, levelIdx, sessionXp]);

  const endRun = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    hoverCellRef.current = null;
    setGameWon(false);
    setPhase("over");
  }, []);

  const tryMineRef = useRef(tryMine);
  tryMineRef.current = tryMine;
  const endRunRef = useRef(endRun);
  endRunRef.current = endRun;

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") keysRef.current.left = true;
      if (e.code === "ArrowRight" || e.code === "KeyD") keysRef.current.right = true;
      if (e.code === "ArrowUp" || e.code === "KeyW" || e.code === "Space") {
        e.preventDefault();
        keysRef.current.jump = true;
      }
      if (e.code === "KeyE") keysRef.current.mine = true;
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") keysRef.current.left = false;
      if (e.code === "ArrowRight" || e.code === "KeyD") keysRef.current.right = false;
      if (e.code === "ArrowUp" || e.code === "KeyW" || e.code === "Space") keysRef.current.jump = false;
      if (e.code === "KeyE") keysRef.current.mine = false;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  useEffect(() => {
    if (phase !== "play") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    sizeCanvasElement(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#8fc7e9", 0.035);

    const camera = new THREE.PerspectiveCamera(48, Math.max(1, canvas.width) / Math.max(1, canvas.height), 0.1, 120);
    const raycaster = new THREE.Raycaster();
    raycaster.far = 28;
    threeRuntimeRef.current = { camera, raycaster, blockMeshes: [] };

    const ambient = new THREE.HemisphereLight("#e9f8ff", "#3a4a30", 1.7);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight("#fff5d0", 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    sun.shadow.camera.left = -22;
    sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.04;
    scene.add(sun);
    scene.add(sun.target);

    // Második, gyengébb fényforrás a játékos elöl-mögötti megvilágításához
    // (kitölti a sun által dobott árnyékot — több részlet látható a blokkokon).
    const fillLight = new THREE.DirectionalLight("#bcd6ff", 0.55);
    fillLight.position.set(0, 6, 12);
    scene.add(fillLight);

    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(COLS * 1.6, ROWS * 1.6),
      new THREE.MeshBasicMaterial({ color: "#8cc7e8" }),
    );
    backdrop.position.set(0, ROWS / 2, -8.5);
    scene.add(backdrop);

    // Távoli felhőréteg (parallax háttér), a kamera mozgásával együtt halványan eltolódik.
    const cloudGeometry = new THREE.PlaneGeometry(COLS * 1.4, 4);
    const cloudCanvas = document.createElement("canvas");
    cloudCanvas.width = 256; cloudCanvas.height = 64;
    const cloudCtx = cloudCanvas.getContext("2d");
    if (cloudCtx) {
      cloudCtx.fillStyle = "rgba(0,0,0,0)";
      cloudCtx.fillRect(0, 0, 256, 64);
      for (let i = 0; i < 8; i++) {
        const cx = Math.random() * 256;
        const cy = 14 + Math.random() * 36;
        const radius = 10 + Math.random() * 18;
        cloudCtx.fillStyle = `rgba(255,255,255,${0.55 + Math.random() * 0.25})`;
        cloudCtx.beginPath();
        cloudCtx.arc(cx, cy, radius, 0, Math.PI * 2);
        cloudCtx.fill();
        cloudCtx.beginPath();
        cloudCtx.arc(cx + radius * 0.7, cy + radius * 0.1, radius * 0.85, 0, Math.PI * 2);
        cloudCtx.fill();
      }
    }
    const cloudTex = new THREE.CanvasTexture(cloudCanvas);
    cloudTex.wrapS = THREE.RepeatWrapping;
    cloudTex.repeat.set(2, 1);
    const cloudPlane = new THREE.Mesh(
      cloudGeometry,
      new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.85 }),
    );
    cloudPlane.position.set(0, ROWS - 1.5, -7.4);
    scene.add(cloudPlane);

    /**
     * Időjárás-részecske rendszer (Points-buffer, ~600 részecske).
     * Az aktuális level config.weather alapján dönti el a render-loop:
     *   - "rain":      hosszú, kék-fehér csíkok lefelé esnek nagy sebességgel
     *   - "snow":      apró fehér pelyhek lassan "lebegnek" oldalra ingadozva
     *   - "sandstorm": narancs-sárga homokszemcsék, vízszintesen söprűzik
     *   - "clear":     a részecskék elrejtve, üresjárat
     * A részecskék alappozíciói egyszer generáltak, a render frame
     * újra-pozicionálja őket a Y-tengelyen (és X-en sin-bgaval, ha hó).
     */
    const WEATHER_PARTICLES = 600;
    const weatherPositions = new Float32Array(WEATHER_PARTICLES * 3);
    const weatherSeeds = new Float32Array(WEATHER_PARTICLES); // X-mozgás-seed
    for (let i = 0; i < WEATHER_PARTICLES; i++) {
      weatherPositions[i * 3] = (Math.random() - 0.5) * COLS * 1.4;
      weatherPositions[i * 3 + 1] = Math.random() * ROWS * 1.4;
      weatherPositions[i * 3 + 2] = Math.random() * 3 - 1;
      weatherSeeds[i] = Math.random() * Math.PI * 2;
    }
    const weatherGeo = new THREE.BufferGeometry();
    weatherGeo.setAttribute("position", new THREE.BufferAttribute(weatherPositions, 3));
    const weatherMat = new THREE.PointsMaterial({
      size: 0.18,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
      color: "#ffffff",
      depthWrite: false,
    });
    const weatherPoints = new THREE.Points(weatherGeo, weatherMat);
    weatherPoints.visible = false;
    scene.add(weatherPoints);

    /**
     * Klasszikus Minecraft-szerű kocka-geometria (1×1×1, ~0.99 a hézag-él miatt).
     * Egyetlen mesh-réteg → 3× kevesebb dráho, nincsenek 3-lanes belső lap-artifaktok.
     * A játékos a +Z front-face síkban sétál (PLAYER_DEPTH_Z = +0.55), így a 17°-os
     * lefelé-nyíló kamerán nincs parallax-eltolódás a foot ↔ block-top között.
     */
    const blockGeometry = new THREE.BoxGeometry(BLOCK_3D_SIZE * 0.99, BLOCK_3D_SIZE * 0.99, BLOCK_3D_DEPTH);
    const blockMaterials = makeBlockMaterials();
    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    const targetBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.06, 1.06, BLOCK_3D_DEPTH + 0.05),
      new THREE.MeshBasicMaterial({ color: "#fef08a", wireframe: true, transparent: true, opacity: 0.95 }),
    );
    targetBox.visible = false;
    scene.add(targetBox);

    const playerAvatar = createPlayerAvatar();
    // Kezdő pose: már a player aktuális facing-je szerint álljon, hogy első frame-en
    // ne legyen frontális → oldalra fordulás "snap". (facing=+1 → +π/2)
    playerAvatar.rotation.y = playerRef.current.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(playerAvatar);

    const xpOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 10, 10),
      new THREE.MeshBasicMaterial({ color: "#fde047", transparent: true, opacity: 0.9 }),
    );
    xpOrb.visible = false;
    scene.add(xpOrb);

    const auraMaterial = new THREE.MeshBasicMaterial({ color: "#fbbf24", transparent: true, opacity: 0.72 });
    const auraGeometry = new THREE.SphereGeometry(0.055, 8, 8);
    const auraOrbs = Array.from({ length: 12 }, () => {
      const orb = new THREE.Mesh(auraGeometry, auraMaterial);
      orb.visible = false;
      scene.add(orb);
      return orb;
    });

    const dustMaterial = new THREE.PointsMaterial({ color: "#f5d38a", size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.88 });
    let dustPoints: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | null = null;
    let renderedWorldVersion = -1;
    let renderWidth = 0;
    let renderHeight = 0;

    const rebuildWorldMeshes = () => {
      while (worldGroup.children.length) worldGroup.remove(worldGroup.children[0]!);
      const meshes: ThreeBlockMesh[] = [];
      const w = worldRef.current;
      const lastLaneIdx = WORLD_LANES.length - 1;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = w[r * COLS + c] ?? AIR;
          if (!cell) continue;
          const material = blockMaterials.get(cell) ?? blockMaterials.get(STONE)!;
          // Mind a 5 lane-en duplikáljuk a blokkot. A FRONT lane (legközelebbi
          // a kamerához) lesz a raycast-target — onnan bányász a játékos.
          for (let li = 0; li < WORLD_LANES.length; li++) {
            const laneZ = WORLD_LANES[li]!;
            const isFront = li === lastLaneIdx;
            const mesh = new THREE.Mesh(blockGeometry, material) as ThreeBlockMesh;
            mesh.userData = { c, r, t: cell, laneZ, isFront };
            mesh.position.copy(tileTo3d(c, r, laneZ + blockDepthZ(cell)));
            // Víz: laposabb, kissé szűkebb (úszó felület hatás).
            if (cell === WATER) mesh.scale.set(1.0, 0.66, 1.0);
            // Levelek: kicsit kisebbek, hézag-érzet a faágak között.
            if (cell === LEAVES) mesh.scale.set(0.96, 0.96, 0.98);
            // Csak a FRONT lane vet árnyékot (perf), a háttér-rétegek receiveShadow.
            mesh.castShadow = cell !== WATER && isFront;
            mesh.receiveShadow = true;
            worldGroup.add(mesh);
            meshes.push(mesh);
          }
        }
      }
      threeRuntimeRef.current = { camera, raycaster, blockMeshes: meshes };
      renderedWorldVersion = worldVersionRef.current;
    };

    const pickTargetBlock = () => {
      const runtime = threeRuntimeRef.current;
      if (!runtime) return null;
      runtime.raycaster.setFromCamera(pointerNdcRef.current, runtime.camera);
      const hits = runtime.raycaster.intersectObjects(runtime.blockMeshes, false);
      for (const hit of hits) {
        const data = hit.object.userData as { c?: number; r?: number; t?: number };
        if (typeof data.c !== "number" || typeof data.r !== "number" || typeof data.t !== "number") continue;
        if (!mineable(data.t)) continue;
        if (!playerCanReachTile(playerRef.current, data.c, data.r)) continue;
        return { c: data.c, r: data.r, t: data.t };
      }
      return null;
    };

    rebuildWorldMeshes();

    const loop = (t: number) => {
      const last = lastTRef.current;
      lastTRef.current = t;
      const dt = last == null ? 0 : Math.min(0.033, (t - last) / 1000);
      const p = playerRef.current;
      const w = worldRef.current;

      if (keysRef.current.mine) {
        keysRef.current.mine = false;
        const target = hoverCellRef.current;
        if (target && tryMineAt(target.c, target.r)) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }
        tryMineRef.current();
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const left = keysRef.current.left || touchRef.current.left;
      const right = keysRef.current.right || touchRef.current.right;
      const jump = keysRef.current.jump || touchRef.current.jump;

      p.vx = left ? -MOVE_SPEED : right ? MOVE_SPEED : 0;
      if (left) p.facing = -1;
      if (right) p.facing = 1;
      if (Math.abs(p.vx) > 0.1) p.tick += dt * 60;
      const wasOnGround = p.onGround;
      if (jump && p.onGround) {
        p.vy = -JUMP_V;
        p.onGround = false;
      }

      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.x = Math.max(2, Math.min(COLS * TILE - PLAYER_W - 2, p.x));
      p.onGround = false;

      const gx0 = Math.floor(p.x / TILE);
      const gx1 = Math.floor((p.x + PLAYER_W) / TILE);
      const gy0 = Math.floor((p.y - PLAYER_H) / TILE);
      const gy1 = Math.floor(p.y / TILE);

      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          if (gy < 0 || gx < 0 || gx >= COLS || gy >= ROWS) continue;
          const cell = w[gy * COLS + gx] ?? AIR;
          if (!solid(cell)) continue;
          const bx = gx * TILE;
          const by = gy * TILE;
          const px0 = p.x;
          const px1 = p.x + PLAYER_W;
          const py0 = p.y - PLAYER_H;
          const py1 = p.y;
          if (px1 > bx && px0 < bx + TILE && py1 > by && py0 < by + TILE) {
            const overlapX = Math.min(px1 - bx, bx + TILE - px0);
            const overlapY = Math.min(py1 - by, by + TILE - py0);

            if (overlapX < overlapY) {
              const stepCandidateY = by - 0.01;
              const canAutoStep = wasOnGround && p.vy >= 0 && py1 > by && py1 - by < TILE * 0.85 && canStepTo(w, p.x, stepCandidateY);
              if (canAutoStep) {
                p.y = stepCandidateY;
                p.vy = 0;
                p.onGround = true;
              } else if (px0 < bx) p.x = bx - PLAYER_W - 0.01;
              else p.x = bx + TILE + 0.01;
              p.vx = 0;
            } else {
              if (py1 - by < by + TILE - py0) {
                p.y = by - 0.01;
                p.vy = 0;
                p.onGround = true;
              } else {
                p.y = by + TILE + PLAYER_H + 0.01;
                p.vy = 0;
              }
            }
          }
        }
      }

      const parts = particlesRef.current;
      for (let i = parts.length - 1; i >= 0; i--) {
        parts[i].x += parts[i].vx * dt;
        parts[i].y += parts[i].vy * dt;
        parts[i].vy += 420 * dt;
        parts[i].life -= dt;
        if (parts[i].life <= 0) parts.splice(i, 1);
      }

      if (p.y > ROWS * TILE + TILE * 5) {
        endRunRef.current();
        return;
      }

      if (renderedWorldVersion !== worldVersionRef.current) {
        rebuildWorldMeshes();
      }
      const { width: CW, height: CH } = rendererCssSize(canvas);
      if (CW !== renderWidth || CH !== renderHeight) {
        renderer.setSize(CW, CH, false);
        camera.aspect = CW / CH;
        camera.updateProjectionMatrix();
        renderWidth = CW;
        renderHeight = CH;
      }

      const playerPos = playerTo3d(p);
      playerAvatar.position.copy(playerPos);
      // Steve a mozgás irányába fordul (90°-os profil-nézet a kamera felé).
      // Steve "front" iránya az avatar lokális +Z (orr/szemek a +Z oldalon).
      // facing=+1 (jobbra megy a játéktérben) → arc +X felé mutasson →
      // Y-rotation +π/2 (mátrix [0,0,1; 0,1,0; -1,0,0] forgatja (0,0,1)→(1,0,0)).
      // facing=-1 → -π/2.
      const targetYRot = p.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
      playerAvatar.rotation.y = THREE.MathUtils.lerp(playerAvatar.rotation.y, targetYRot, 0.22);
      const stride = Math.sin(p.tick * 0.35) * Math.min(1, Math.abs(p.vx) / MOVE_SPEED);
      const leftLeg = playerAvatar.getObjectByName("leg-left");
      const rightLeg = playerAvatar.getObjectByName("leg-right");
      const leftArm = playerAvatar.getObjectByName("arm-left");
      const rightArm = playerAvatar.getObjectByName("arm-right");
      if (leftLeg) leftLeg.rotation.x = stride * 0.55;
      if (rightLeg) rightLeg.rotation.x = -stride * 0.55;
      if (leftArm) leftArm.rotation.x = -stride * 0.45;
      if (rightArm) rightArm.rotation.x = stride * 0.45;
      // Csákány a "kamera felőli" karban: a 90°-os forgatás után az
      // egyik kar a -Z (kamera mögé) esik. facing=+1 (rotation +π/2) esetén
      // az eredeti +X (jobb) kar a -Z-re fordul → háta mögé esik. Ezért a
      // csákányt a -X (bal) karhoz tesszük → forgás után +Z-re kerül = látható.
      const pickSide = p.facing > 0 ? -1 : 1;
      const pickHandle = playerAvatar.getObjectByName("pick-handle");
      const pickHead = playerAvatar.getObjectByName("pick-head");
      if (pickHandle) {
        pickHandle.position.x = 0.50 * pickSide;
        pickHandle.rotation.z = -0.55 * pickSide;
      }
      if (pickHead) {
        pickHead.position.x = 0.62 * pickSide;
        pickHead.rotation.z = -0.55 * pickSide;
      }

      const speedRatio = Math.min(1, Math.abs(p.vx) / MOVE_SPEED);
      const lookAhead = p.facing * (0.65 + speedRatio * 0.85);
      // Kamera kissé közelebb a karakterhez, és kicsit lejjebb néz: jobb "platformer"
      // típusú nézőszög, ahol a játékos és a blokkok szögei élesen kirajzolódnak.
      const desiredCamera = new THREE.Vector3(playerPos.x - lookAhead * 0.55, playerPos.y + 2.6, 9.4);
      camera.position.lerp(desiredCamera, last == null ? 1 : 0.06);
      camera.lookAt(playerPos.x + lookAhead * 0.6, playerPos.y - 0.18, 0.6);

      const cycle = (Math.sin(t * 0.00008) + 1) * 0.5;
      // Pálya-specifikus égszín-keverés: minden level saját day/dusk színpalettával.
      const cfg = activeLevelRef.current;
      const dayColor = new THREE.Color(cfg.skyTint.day);
      const duskColor = new THREE.Color(cfg.skyTint.dusk);
      const skyColor = duskColor.clone().lerp(dayColor, cycle);
      scene.background = skyColor;
      backdrop.material.color.copy(skyColor);
      scene.fog = new THREE.FogExp2(skyColor, 0.026 + (1 - cycle) * 0.020);
      sun.position.set(playerPos.x - 6 + Math.cos(t * 0.00025) * 7, playerPos.y + 11, 8);
      sun.target.position.set(playerPos.x, playerPos.y, 0);
      sun.intensity = 1.4 + cycle * 1.6;
      ambient.intensity = 1.1 + cycle * 0.8;
      // Felhők lassan úsznak — parallax háttér.
      cloudPlane.position.x = playerPos.x * 0.18 + Math.sin(t * 0.0001) * 1.4;
      cloudPlane.position.y = playerPos.y * 0.4 + ROWS - 1.2;

      // === IDŐJÁRÁS-RÉSZECSKÉK ===
      const weather = activeLevelRef.current.weather;
      if (weather === "clear") {
        weatherPoints.visible = false;
      } else {
        weatherPoints.visible = true;
        // Részecskék újrapozíciózása + Y-rebreak ha lefuts a játéktér alá
        const wPos = weatherPoints.geometry.attributes.position;
        let fallSpeed = 0.22; // alap: hó / sandstorm
        let xSwayAmp = 0.0;
        let particleColor = "#ffffff";
        if (weather === "rain") {
          fallSpeed = 0.55;
          particleColor = "#9ed1ff";
          xSwayAmp = 0.0;
        } else if (weather === "snow") {
          fallSpeed = 0.10;
          particleColor = "#ffffff";
          xSwayAmp = 0.04;
        } else if (weather === "sandstorm") {
          fallSpeed = 0.04;
          particleColor = "#ffd06b";
          xSwayAmp = 0.30;
        }
        weatherMat.color.set(particleColor);
        weatherMat.size = weather === "rain" ? 0.22 : weather === "snow" ? 0.18 : 0.12;
        weatherMat.opacity = weather === "rain" ? 0.78 : weather === "snow" ? 0.92 : 0.55;
        for (let i = 0; i < WEATHER_PARTICLES; i++) {
          let py = wPos.getY(i);
          let px = wPos.getX(i);
          py -= fallSpeed;
          if (xSwayAmp > 0) {
            px += Math.sin(t * 0.001 + weatherSeeds[i]!) * xSwayAmp;
            // ha kifut a határból, visszateszi
            if (px < -COLS * 0.7) px = COLS * 0.7;
            if (px > COLS * 0.7) px = -COLS * 0.7;
          }
          // Y-wrap: a játéktér tetejére vissza
          if (py < playerPos.y - ROWS * 0.7) {
            py = playerPos.y + ROWS * 0.6 + Math.random() * 4;
            px = (Math.random() - 0.5) * COLS * 1.3;
          }
          wPos.setXY(i, px, py);
        }
        wPos.needsUpdate = true;
        // A részecske-cloud követi a játékos X-pozícióját, hogy mindig "vele essen"
        weatherPoints.position.x = playerPos.x;
      }

      // Víz-blokkok finom hullámzása (függőleges sin-elmozdulás).
      const waveTime = t * 0.0014;
      for (const m of threeRuntimeRef.current?.blockMeshes ?? []) {
        const data = m.userData as { t?: number; c?: number; r?: number };
        if (data.t === WATER && typeof data.c === "number" && typeof data.r === "number") {
          const wave = Math.sin(waveTime + data.c * 0.85 + data.r * 0.4) * 0.05;
          const base = tileTo3d(data.c, data.r, blockDepthZ(WATER));
          m.position.y = base.y + wave;
        }
      }

      const target = pickTargetBlock();
      hoverCellRef.current = target ? { c: target.c, r: target.r } : null;
      targetBox.visible = Boolean(target);
      if (target) {
        // Targetbox a FRONT lane-en jelenjen meg (legközelebb a kamerához
        // és a játékoshoz), nem a középső lane-en — különben "elcsúszna".
        targetBox.position.copy(tileTo3d(target.c, target.r, FRONT_LANE_Z + blockDepthZ(target.t)));
        const pulse = 1.02 + Math.sin(t * 0.008) * 0.035;
        targetBox.scale.setScalar(pulse);
      }

      if (dustPoints) {
        scene.remove(dustPoints);
        dustPoints.geometry.dispose();
        dustPoints = null;
      }
      if (parts.length > 0) {
        const positions = new Float32Array(parts.length * 3);
        parts.forEach((ptx, idx) => {
          positions[idx * 3] = ptx.x / TILE - WORLD_CENTER_X;
          positions[idx * 3 + 1] = ROWS - ptx.y / TILE;
          positions[idx * 3 + 2] = 1.05;
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        dustPoints = new THREE.Points(geometry, dustMaterial);
        scene.add(dustPoints);
      }

      if (streakRef.current >= 3) {
        const auraCount = Math.min(12, 4 + streakRef.current * 2);
        auraOrbs.forEach((orb, ai) => {
          orb.visible = ai < auraCount;
          if (!orb.visible) return;
          const angle = (t * 0.003 + ai * (Math.PI * 2 / auraCount)) % (Math.PI * 2);
          const rad = 0.72 + Math.sin(t * 0.008 + ai) * 0.14;
          orb.position.set(playerPos.x + Math.cos(angle) * rad, playerPos.y + Math.sin(angle) * rad, playerPos.z + 0.18);
        });
      } else {
        auraOrbs.forEach((orb) => {
          orb.visible = false;
        });
      }

      const xpPop = xpPopupRef.current;
      if (xpPop) {
        xpPop.life -= dt;
        if (xpPop.life <= 0) {
          xpPopupRef.current = null;
          xpOrb.visible = false;
        } else {
          const rise = (1.5 - xpPop.life) * 0.85;
          xpOrb.visible = true;
          xpOrb.position.set(xpPop.wx / TILE - WORLD_CENTER_X, ROWS - xpPop.wy / TILE + rise, 1.22);
          xpOrb.scale.setScalar(0.95 + Math.sin(t * 0.015) * 0.16);
        }
      } else {
        xpOrb.visible = false;
      }

      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      threeRuntimeRef.current = null;
      if (dustPoints) dustPoints.geometry.dispose();
      // Explicit textúra-dispose: a CanvasTexture-öket nem GC-eli a Three.js,
      // ezért minden szintátmenetnél magunknak kell felszabadítani a GPU oldalon.
      blockMaterials.forEach((entry) => {
        const mats = Array.isArray(entry) ? entry : [entry];
        mats.forEach((mat) => {
          mat.map?.dispose();
          mat.dispose();
        });
      });
      cloudTex.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
    };
  }, [phase, tryMineAt]);

  const onAnswer = (idx: number) => {
    if (!quiz) return;
    if (revealCorrectIdx !== null) return; // 1.5s reveal alatt nincs ismételt válasz
    if (idx !== quiz.correctIndex) {
      sfxError();
      setWrongShake(true);
      setTimeout(() => setWrongShake(false), 320);
      // Helyes válasz felfedése + 1.5s "freeze" → utána új kvíz
      setRevealCorrectIdx(quiz.correctIndex);
      setWrongIdx(idx);
      const outcome = streakProtector.handleWrong({ streak });
      if (outcome === "warned") {
        sfxWarning();
      } else {
        setStreak(0);
      }
      window.setTimeout(() => {
        setRevealCorrectIdx(null);
        setWrongIdx(null);
        setQuiz(pickQuiz());
      }, 1500);
      return;
    }

    sfxSuccess();
    const tgt = mineTargetRef.current;
    let levelGoalReached = false;
    if (tgt) {
      worldRef.current[tgt.r * COLS + tgt.c] = AIR;
      worldVersionRef.current++;
      spawnDust((tgt.c + 0.5) * TILE, (tgt.r + 0.5) * TILE, tgt.t);
      const isCreeper = tgt.t === CREEPER;
      const isMob = tgt.t === CREEPER || tgt.t === ZOMBIE || tgt.t === SKELETON || tgt.t === SPIDER;
      const isRare = tgt.t === COAL || tgt.t === IRON || tgt.t === DIAMOND || isMob;
      const baseXp = XP_BY_TILE[tgt.t] ?? 24;
      // Mob-ölés bónusz: minden mob 2× XP, de a base értékek már nehezebbek (CREEPER 280, ZOMBIE 320, SKELETON 380, SPIDER 260)
      const add = (isMob ? baseXp * 2 : baseXp) + streak * 4;
      const newBlocks = blocksMined + 1;
      const newLevelBlocks = levelBlocks + 1;
      const newLevelRare = levelRare + (isRare ? 1 : 0);
      const newStreak = streak + 1;
      setSessionXp((x) => x + add);
      setTotalXp((x) => x + add);
      setBlocksMined(newBlocks);
      if (isRare) setRareBlocks((n) => n + 1);
      setLevelBlocks(newLevelBlocks);
      setLevelRare(newLevelRare);
      setStreak(newStreak);
      const subj = quiz.subject ?? "english";
      setSubjectStats((prev) => ({ ...prev, [subj]: prev[subj] + 1 }));
      xpPopupRef.current = { amount: add, wx: (tgt.c + 0.5) * TILE, wy: (tgt.r + 0.5) * TILE, life: 1.5 };

      // Pálya-cél ellenőrzés: blokkszám + opcionális ritkacél.
      const cfg = activeLevelRef.current;
      if (newLevelBlocks >= cfg.goalBlocks && newLevelRare >= cfg.goalRareBlocks) {
        levelGoalReached = true;
      }

      if (tgt.t === DIAMOND && rareBlocks === 0) {
        setAchievement("Első gyémánt megtalálva!");
        setTimeout(() => setAchievement(null), 2500);
      } else if (newBlocks === 10) {
        setAchievement("10. blokk kibányászva!");
        setTimeout(() => setAchievement(null), 2500);
      } else if (newStreak === 5) {
        setAchievement("5-ös sorozat elérve!");
        setTimeout(() => setAchievement(null), 2500);
      } else if (isCreeper) {
        setAchievement("Creeper legyőzve! Dupla XP!");
        setTimeout(() => setAchievement(null), 2500);
      }
    }
    mineTargetRef.current = null;
    setQuiz(null);
    hoverCellRef.current = null;
    {
      const p = playerRef.current;
      p.vx = 0;
      p.vy = 0;
      if (needsRescueAfterMine(worldRef.current, p, tgt)) {
        rescuePlayerIfNeeded(worldRef.current, p);
      }
    }
    if (levelGoalReached) {
      sfxLevelUp();
      cancelAnimationFrame(rafRef.current);
      setPhase("levelComplete");
    } else {
      setPhase("play");
    }
  };

  // R = quick-restart az "over" / "menu" / "levelComplete" képernyőn.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "r" && e.key !== "R") return;
      if (phase === "over" || phase === "menu") {
        e.preventDefault();
        startGame();
      } else if (phase === "levelComplete") {
        e.preventDefault();
        startNextLevel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startGame, startNextLevel]);

  useEffect(() => {
    if (phase !== "over" || !syncEligibility?.eligible || scoreSubmittedRef.current) return;
    scoreSubmittedRef.current = true;
    void apiRequest("POST", "/api/games/score", {
      gameId: "block-craft-quiz",
      difficulty: "normal",
      runXp: sessionXp,
      runStreak: streak,
      runSeconds,
    })
      .then(() => void queryClient.invalidateQueries({ queryKey: ["/api/games/leaderboard"] }))
      .catch(() => {
        scoreSubmittedRef.current = false;
      });
  }, [phase, syncEligibility, sessionXp, streak, runSeconds]);

  // Achievement + Daily Challenge tracking — az "over" phase átmenetnél egyszer fut.
  const achievementCheckedRef = useRef(false);
  useEffect(() => {
    if (phase !== "over") {
      achievementCheckedRef.current = false;
      return;
    }
    if (achievementCheckedRef.current) return;
    achievementCheckedRef.current = true;
    const wasDailyAvailable = isTodaysGameAvailable("block-craft-quiz");
    const newOnes = recordRun({
      game: "block-craft-quiz",
      xpGained: sessionXp,
      correctAnswers: blocksMined, // ≈ helyes válaszok = kibányászott blokkok
      wrongAnswers: 0,
      maxStreak: streak,
      blocksMined,
      diamondsMined: rareBlocks > 0 ? Math.max(1, Math.floor(rareBlocks / 3)) : 0,
      perfect: streak >= blocksMined && blocksMined >= 5,
      fullClear: gameWon,
      highestLevel: levelIdx + 1,
    });
    if (wasDailyAvailable && gameWon) {
      markDailyCompleted();
    }
    if (newOnes.length > 0) setNewlyUnlocked(newOnes);
    // Szándékosan csak `phase`-re iratkozunk fel — a recordRun egyszer fut "over"
    // átmenetenként, nem akarjuk, hogy minden state-mutáció (sessionXp, streak stb.)
    // újra triggerelje.
  }, [phase]);

  const resizeCanvas = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    sizeCanvasElement(el);
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [phase, resizeCanvas]);

  const hold = (k: "left" | "right" | "jump", v: boolean) => {
    touchRef.current[k] = v;
  };

  const startHold = (e: ReactPointerEvent<HTMLButtonElement>, k: "left" | "right" | "jump") => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    hold(k, true);
  };

  const endHold = (e: ReactPointerEvent<HTMLButtonElement>, k: "left" | "right" | "jump") => {
    e.preventDefault();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    hold(k, false);
  };

  const updatePointerNdc = useCallback((canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const { x, y } = pointerOnCanvas(canvas, clientX, clientY);
    pointerNdcRef.current.set((x / Math.max(1, canvas.width)) * 2 - 1, -(y / Math.max(1, canvas.height)) * 2 + 1);
  }, []);

  const pickCurrent3dTarget = useCallback(() => {
    const runtime = threeRuntimeRef.current;
    if (!runtime) return hoverCellRef.current;
    runtime.raycaster.setFromCamera(pointerNdcRef.current, runtime.camera);
    const hits = runtime.raycaster.intersectObjects(runtime.blockMeshes, false);
    for (const hit of hits) {
      const data = hit.object.userData as { c?: number; r?: number; t?: number };
      if (typeof data.c !== "number" || typeof data.r !== "number" || typeof data.t !== "number") continue;
      if (mineable(data.t) && playerCanReachTile(playerRef.current, data.c, data.r)) {
        return { c: data.c, r: data.r };
      }
    }
    return hoverCellRef.current;
  }, []);

  const mineSelectedTarget = useCallback(() => {
    const target = pickCurrent3dTarget();
    if (!target || !tryMineAt(target.c, target.r)) tryMine();
  }, [pickCurrent3dTarget, tryMine, tryMineAt]);

  const onCanvasPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (phase !== "play") return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      const canvas = e.currentTarget;
      updatePointerNdc(canvas, e.clientX, e.clientY);
      mineSelectedTarget();
    },
    [phase, mineSelectedTarget, updatePointerNdc],
  );

  /** 3D raycast célzás: a render loop ebből számolja az aktuális bányászható blokkot. */
  const onCanvasPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (phase !== "play") return;
      updatePointerNdc(e.currentTarget, e.clientX, e.clientY);
    },
    [phase, updatePointerNdc],
  );

  const onCanvasPointerLeave = useCallback(() => {
    pointerNdcRef.current.set(0, 0);
    hoverCellRef.current = null;
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden text-white" style={{ background: "radial-gradient(circle at 15% 15%, rgba(34,197,94,0.18), transparent 38%), radial-gradient(circle at 88% 8%, rgba(34,211,238,0.2), transparent 42%), linear-gradient(180deg, #0b1727 0%, #1b2f45 100%)" }}>
      <ClassroomGateModal accent="lime" />
      <AchievementToast achievements={newlyUnlocked} />
      <main className="relative z-10 w-full max-w-xl lg:max-w-3xl mx-auto px-2 sm:px-5 py-2 sm:py-4 min-h-dvh min-h-screen flex flex-col pb-20 sm:pb-10">
        <header className="flex items-center justify-between gap-1 mb-1">
          <Link href="/games"><Button variant="ghost" size="sm" className="text-white/90 hover:bg-white/10 gap-1 -ml-2"><ArrowLeft className="w-4 h-4" />Játékok</Button></Link>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <AudioToggleButton size="icon" />
            <span className="flex items-center gap-1 text-amber-300"><Star className="w-4 h-4" />{totalXp}</span>
            <span className="flex items-center gap-1 text-lime-300"><Flame className="w-4 h-4" />{streak}</span>
          </div>
        </header>

        <Card className="border border-lime-400/45 bg-slate-950/85 backdrop-blur-md shadow-[0_16px_48px_rgba(0,0,0,0.45)] flex-1 flex flex-col min-h-0"><CardContent className={`flex flex-col flex-1 min-h-0 ${phase === "play" ? "p-1.5 sm:p-3" : "p-3"}`}>
          {phase !== "play" && <div className="flex items-center gap-2 mb-1"><Box className="w-5 h-5 text-lime-400" /><h1 className="text-base font-extrabold">Kockavadász kvíz</h1></div>}
          {phase !== "play" && <><GamePedagogyPanel
            accent="lime"
            className="mb-2"
            kidMission="Bányássz blokkokat egy kockavilágban! Minden blokk előtt rövid kvíz jön: angol szókincs, angol matek, magyar matek vagy környezetismeret. Csak helyes válaszra tűnik el a kő (és kapsz XP-et + sorozat-lángot). Időre is figyelj — a kör végén összesítjük a pontjaidat."
            parentBody={
              <>
                <strong className="text-lime-100/90">Tananyag:</strong> 4 tárgy kvízformában — angol szókincs (tárgyak, helyzetek), angol matek (vocabulary + műveletek), egyszerű magyar matek (1–4. oszt.) és környezetismeret (növény/állat/természet). A bányászat motivációt ad az ismétléshez.
                <br />
                <strong className="text-lime-100/90">Fejleszt:</strong> olvasásértés gyors döntés mellett, fejszámolás, idegen nyelvi gondolkozás, természettudományos összefüggés-látás, térbeli tájékozódás és kéz-szem koordináció (billentyű / érintés).
                <br />
                <span className="text-white/55">
                  Akadály (fizikai pálya) + teszt (kvíz) + jutalom (XP, blokk eltűnik) minden lépésnél összekapcsolva — erős, azonnali visszajelzés.
                </span>
              </>
            }
          />
          <p className="text-[11px] text-lime-100/90 mb-2 border border-lime-700/45 rounded px-2 py-1.5 bg-slate-900/95">{syncBanner}</p></>}

          {phase === "menu" && (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-4">
              <div className="grid grid-cols-5 gap-2 p-3 rounded-xl bg-black/45 border border-lime-700/45">
                {[GRASS, DIRT, SAND, STONE, WATER, LOG, LEAVES, COAL, IRON, DIAMOND].map((t) => <MenuBlock key={t} t={t} />)}
              </div>
              <div className="w-full max-w-sm rounded-xl border border-lime-600/45 bg-slate-900/85 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-lime-200 mb-1.5">5 progresszív pálya — XP halmozódik</p>
                <ul className="space-y-1 text-[11px] text-white/85">
                  {LEVELS.map((lv) => (
                    <li key={lv.id} className="flex items-center justify-between gap-2 border-b border-lime-900/30 last:border-b-0 pb-1 last:pb-0">
                      <span className="font-semibold text-lime-100/95">{lv.name}</span>
                      <span className="text-white/60 tabular-nums">
                        {lv.goalBlocks} blokk{lv.goalRareBlocks > 0 ? ` + ${lv.goalRareBlocks} érc` : ""} · {Math.floor(lv.timeLimit / 60)}:{String(lv.timeLimit % 60).padStart(2, "0")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-white/80 text-center max-w-xs">A/D vagy nyilak: mozgás, Space: ugrás, E vagy Bányász: kvíz. Koppints a kockára, ha közel vagy hozzá.</p>
              <Button size="lg" className="bg-gradient-to-r from-lime-600 to-emerald-800 hover:from-lime-500 hover:to-emerald-700 border border-lime-200/35 font-bold text-white shadow-lg text-base" onClick={startGame}>
                <Pickaxe className="w-4 h-4 mr-2" />Indulhat a bányászat!
              </Button>
            </div>
          )}

          {phase === "play" && (() => {
            const cfg = activeLevelRef.current;
            const timePct = (timeLeft / cfg.timeLimit) * 100;
            const blocksPct = Math.min(100, (levelBlocks / cfg.goalBlocks) * 100);
            const rarePct = cfg.goalRareBlocks > 0 ? Math.min(100, (levelRare / cfg.goalRareBlocks) * 100) : 100;
            return (
              <div className="flex flex-col items-center gap-1.5">
                {/* === CANVAS LEGFELÜL (mobil-first) === */}
                <div className="relative rounded-xl overflow-hidden border-2 border-lime-700/70 shadow-[0_0_28px_rgba(34,197,94,0.18)] w-full bg-black min-h-[min(50dvh,340px)] sm:min-h-[280px]">
                  <canvas ref={canvasRef} className="block touch-manipulation w-full max-w-full cursor-crosshair" style={{ imageRendering: "pixelated" as const }} onPointerDown={onCanvasPointerDown} onPointerMove={onCanvasPointerMove} onPointerLeave={onCanvasPointerLeave} />
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,transparent_54%,rgba(0,0,0,0.28)_100%)]" />
                  <div className="pointer-events-none absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/55">
                    <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-200 shadow-[0_0_10px_rgba(254,240,138,0.85)]" />
                  </div>
                  <div className={`pointer-events-none absolute left-2 top-2 rounded-lg border bg-slate-950/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                    cfg.isBossLevel
                      ? "border-rose-400 text-rose-200 animate-pulse"
                      : "border-lime-300/40 text-lime-100"
                  }`}>
                    {cfg.isBossLevel ? `★ BOSS ★ ${cfg.name.replace(/^\d+\.\s*/, "")}` : `Pálya ${cfg.id}/${LEVELS.length} · ${cfg.name.replace(/^\d+\.\s*/, "")}`}
                  </div>
                  <div className="pointer-events-none absolute right-2 top-2 rounded-lg border border-cyan-200/25 bg-slate-950/65 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-100 flex items-center gap-1">
                    <span>3D</span>
                    {cfg.weather !== "clear" && (
                      <span title={cfg.weather}>
                        {cfg.weather === "rain" ? "🌧" : cfg.weather === "snow" ? "❄" : "🏜"}
                      </span>
                    )}
                  </div>
                  <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 text-[10px] font-semibold text-white/75">
                    <span className="rounded bg-black/45 px-2 py-1">Célozz és bányássz: E / koppintás</span>
                    <span className="rounded bg-black/45 px-2 py-1">Sárga keret = kvízblokk</span>
                  </div>
                </div>
                {/* === KONTROLLGOMBOK közvetlenül a canvas alatt === */}
                <div className="grid grid-cols-4 gap-1.5 w-full">
                  <Button type="button" size="sm" className="bg-sky-800 hover:bg-sky-700 text-white border border-sky-200/35 shadow-md py-3 text-xs" onPointerDown={(e) => startHold(e, "left")} onPointerUp={(e) => endHold(e, "left")} onPointerCancel={(e) => endHold(e, "left")} onPointerLeave={(e) => endHold(e, "left")}>Balra</Button>
                  <Button type="button" size="sm" className="bg-violet-700 hover:bg-violet-600 text-white border border-violet-200/35 shadow-md py-3 text-xs" onPointerDown={(e) => startHold(e, "jump")} onPointerUp={(e) => endHold(e, "jump")} onPointerCancel={(e) => endHold(e, "jump")} onPointerLeave={(e) => endHold(e, "jump")}>Ugrás</Button>
                  <Button type="button" size="sm" className="bg-sky-800 hover:bg-sky-700 text-white border border-sky-200/35 shadow-md py-3 text-xs" onPointerDown={(e) => startHold(e, "right")} onPointerUp={(e) => endHold(e, "right")} onPointerCancel={(e) => endHold(e, "right")} onPointerLeave={(e) => endHold(e, "right")}>Jobbra</Button>
                  <Button type="button" size="sm" className="bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-200/35 touch-manipulation shadow-md py-3 text-xs" onClick={mineSelectedTarget}><Pickaxe className="w-3.5 h-3.5 mr-1" />Bányász</Button>
                </div>
                {/* === KOMPAKT HUD === */}
                <div className="w-full flex items-center gap-1.5">
                  <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className={`h-full transition-all ${timePct < 25 ? "bg-gradient-to-r from-rose-500 to-amber-400" : "bg-gradient-to-r from-cyan-400 to-lime-500"}`} style={{ width: `${timePct}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-white/80 tabular-nums min-w-[32px] text-right">{timeLeft}s</span>
                </div>
                <div className="w-full flex items-center justify-between text-[10px] font-semibold text-white/70">
                  <span>XP: <strong className="text-amber-300">{sessionXp}</strong></span>
                  <span>Cél: <strong className="text-lime-300">{levelBlocks}/{cfg.goalBlocks}</strong>{cfg.goalRareBlocks > 0 && <> · <strong className="text-cyan-300">{levelRare}/{cfg.goalRareBlocks}</strong> érc</>}</span>
                  <span className="flex items-center gap-0.5"><Flame className="w-3 h-3 text-orange-400" />{streak}</span>
                </div>
                {/* === Cél sáv: blokk-célt mutat (a streak helyett) === */}
                <GameNextGoalBar
                  accent="lime"
                  headline={blocksPct >= 100 && rarePct >= 100 ? "Cél elérve!" : `Pálya cél: ${levelBlocks}/${cfg.goalBlocks} blokk${cfg.goalRareBlocks > 0 ? ` + ${levelRare}/${cfg.goalRareBlocks} érc` : ""}`}
                  subtitle=""
                  current={Math.min(levelBlocks, cfg.goalBlocks)}
                  target={cfg.goalBlocks}
                  className="w-full"
                />
                <div className="flex gap-2 justify-center w-full">
                  <Button type="button" size="sm" className="bg-amber-600/80 hover:bg-amber-500 text-slate-950 border border-amber-200/45 shadow-md text-xs px-3 py-1" onClick={endRun}>Kör vége</Button>
                </div>
              </div>
            );
          })()}

          {phase === "levelComplete" && (() => {
            const cfg = activeLevelRef.current;
            const isLast = levelIdx >= LEVELS.length - 1;
            const earned = sessionXp - levelStartXp;
            return (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 py-6 text-center">
                <div className="flex items-center gap-2"><Star className="w-9 h-9 text-amber-300" /><Star className="w-12 h-12 text-amber-200" /><Star className="w-9 h-9 text-amber-300" /></div>
                <p className="text-lg font-extrabold text-lime-200">Pálya teljesítve!</p>
                <p className="text-sm font-semibold text-white/90">{cfg.name}</p>
                <div className="flex flex-wrap gap-2 justify-center text-[12px] text-white/85">
                  <span className="rounded bg-lime-700/55 px-2 py-1"><strong className="text-lime-100">{levelBlocks}</strong> blokk</span>
                  <span className="rounded bg-cyan-700/55 px-2 py-1"><strong className="text-cyan-100">{levelRare}</strong> érc</span>
                  <span className="rounded bg-amber-700/55 px-2 py-1"><strong className="text-amber-100">+{earned}</strong> XP</span>
                  <span className="rounded bg-orange-700/55 px-2 py-1 flex items-center gap-1"><Flame className="w-3 h-3 text-orange-300" /><strong>{streak}</strong></span>
                </div>
                {!isLast && (
                  <p className="text-xs text-white/70 max-w-sm">Következő: <strong className="text-lime-200">{LEVELS[levelIdx + 1]!.name}</strong> — {LEVELS[levelIdx + 1]!.description}</p>
                )}
                <div className="flex gap-2 flex-wrap justify-center">
                  {!isLast ? (
                    <Button className="bg-gradient-to-r from-lime-600 to-emerald-700 hover:from-lime-500 hover:to-emerald-600 font-bold" onClick={startNextLevel}>
                      <Pickaxe className="w-4 h-4 mr-1" />Tovább a {levelIdx + 2}. pályára
                    </Button>
                  ) : (
                    <Button className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 font-bold text-slate-950" onClick={startNextLevel}>
                      <Star className="w-4 h-4 mr-1" />Befejezés — összesítés!
                    </Button>
                  )}
                  <Button variant="outline" className="border-white/40 text-white" onClick={endRun}>Befejezés most</Button>
                </div>
              </div>
            );
          })()}

          {phase === "over" && (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-8 text-center">
              <Box className={`w-12 h-12 ${gameWon ? "text-amber-300" : "text-lime-400"}`} />
              <p className="text-lg font-bold">{gameWon ? "Bajnok lettél! Mind az 5 pálya teljesítve!" : "Bányászat vége"}</p>
              <p className="text-sm font-semibold text-lime-100/90 max-w-sm">
                {gameWon
                  ? `Eljutottál az utolsó pályáig — ${LEVELS.length}/${LEVELS.length} pálya kipipálva. Próbáld meg újra még magasabb pontszámért!`
                  : "Minden jó kvíz egy-egy tantárgyból erősített — nézd meg az XP-t, a sorozatot és a tantárgyi lebontást!"}
              </p>
              <p className="text-sm text-white/75">XP: <strong className="text-amber-300">{sessionXp}</strong> · Blokkok: <strong>{blocksMined}</strong> · Érc: <strong>{rareBlocks}</strong> · Pálya: <strong>{levelIdx + 1}/{LEVELS.length}</strong></p>
              <div className="flex flex-wrap gap-1.5 justify-center max-w-sm">
                <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border bg-lime-600/70 text-lime-50 border-lime-300/60">Angol: {subjectStats.english}</span>
                <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border bg-cyan-600/70 text-cyan-50 border-cyan-300/60">Angol-matek: {subjectStats["english-math"]}</span>
                <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border bg-amber-600/70 text-amber-50 border-amber-300/60">Matek: {subjectStats.math}</span>
                <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border bg-emerald-600/70 text-emerald-50 border-emerald-300/60">Környezet: {subjectStats.nature}</span>
              </div>
              {syncEligibility?.eligible ? <p className="text-xs text-emerald-300/90">Eredmény elküldve.</p> : <p className="text-xs text-white/50 max-w-xs">{syncBanner}</p>}
              <div className="flex gap-2">
                <Button className="bg-lime-700 hover:bg-lime-600" onClick={startGame}><RotateCcw className="w-4 h-4 mr-1" />Új próbálkozás</Button>
                <Link href="/games"><Button variant="outline" className="border-white/40 text-white">Lista</Button></Link>
              </div>
            </div>
          )}
        </CardContent></Card>
      </main>

      <AnimatePresence>{phase === "quiz" && quiz && <motion.div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/80 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={`w-full max-w-md rounded-2xl border-2 border-lime-500/50 bg-slate-950/95 p-4 shadow-2xl ${wrongShake ? "animate-shake" : ""}`}><div className="flex items-center gap-2 mb-1">{(() => { const s = quiz.subject; const label = s === "english" ? "Angol szókincs" : s === "english-math" ? "Angol matek" : s === "math" ? "Matematika" : s === "nature" ? "Környezet" : "Kvíz"; const chipClass = s === "english" ? "bg-lime-600/70 text-lime-50 border-lime-300/60" : s === "english-math" ? "bg-cyan-600/70 text-cyan-50 border-cyan-300/60" : s === "math" ? "bg-amber-600/70 text-amber-50 border-amber-300/60" : s === "nature" ? "bg-emerald-600/70 text-emerald-50 border-emerald-300/60" : "bg-slate-600/70 text-slate-50 border-slate-300/60"; return <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${chipClass}`}>{label}</span>; })()}<span className="text-xs font-bold text-lime-300 uppercase">Mini-teszt</span></div><p className="text-[11px] text-white/65 mb-2">Ha eltalálod, a blokk eltűnik és jön az XP. Rossz válasz: próbáld újra ugyanazt a blokkot — nincs büntető víz, csak gyakorolsz tovább.</p><p className="text-base font-semibold mb-4">{quiz.prompt}</p><div className="grid gap-2">{quiz.options.map((o, i) => {
        const isCorrect = revealCorrectIdx === i;
        const isWrong = wrongIdx === i;
        const dim = revealCorrectIdx !== null && !isCorrect && !isWrong;
        const cls = isCorrect
          ? "h-auto py-3 text-left bg-emerald-700/70 hover:bg-emerald-700/70 text-white border-2 border-emerald-300 text-[15px] font-bold"
          : isWrong
            ? "h-auto py-3 text-left bg-rose-800/70 hover:bg-rose-800/70 text-white border-2 border-rose-300 text-[15px]"
            : dim
              ? "h-auto py-3 text-left bg-white/5 text-white/40 border border-lime-900/20 text-[15px]"
              : "h-auto py-3 text-left bg-white/10 hover:bg-lime-800/50 text-white border border-lime-900/40 text-[15px]";
        return <Button key={`${o}-${i}`} variant="secondary" className={cls} disabled={revealCorrectIdx !== null} onClick={() => onAnswer(i)}>{o}</Button>;
      })}</div>{streakProtector.warning && <p className="mt-2 text-[11px] text-amber-300/95 font-semibold">⚠ {streakProtector.warning}</p>}{revealCorrectIdx !== null && wrongIdx !== null && <p className="mt-2 text-[11px] text-emerald-300/95">A helyes válasz: <strong>{quiz.options[revealCorrectIdx]}</strong></p>}</motion.div></motion.div>}</AnimatePresence>

      <AnimatePresence>{achievement && <motion.div className="fixed top-16 left-1/2 -translate-x-1/2 z-[70] bg-amber-500/95 text-slate-950 font-bold text-sm px-4 py-2 rounded-xl shadow-xl border border-amber-200/60 whitespace-nowrap" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>{achievement}</motion.div>}</AnimatePresence>
      <style>{`@keyframes shake {0%,100% { transform: translateX(0); }25% { transform: translateX(-5px); }75% { transform: translateX(5px); }} .animate-shake { animation: shake 0.16s ease-in-out 2; }`}</style>
    </div>
  );
}
