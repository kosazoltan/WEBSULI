import { isPlayableQuestion } from "@shared/game-quiz-contract";
import { createAdaptiveSession, adaptiveTimeBudget } from "@/game-engine/adaptiveSession";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import * as THREE from "three";
import { applyRendererLook, createGradientSky, detectLookTier, disposeObjectTree, LOOK_BUDGET, SparkleField } from "@/game-engine/three-look";
import type { PerfControls, PerfOverlay } from "@/game-engine/perf/perfOverlay";
import { perfEnabledFrom } from "@/game-engine/perf/perfFlag";
import { isLightGraphicsFrom, isTouchDeviceFrom, LIGHT_GRAPHICS_MAX_PIXELS, pixelRatioForBudget } from "@/game-engine/perf/pixelBudget";
import { SUN_SHADE_TINT, sunShadeAt, type SunOccluder } from "@/lib/voxelSunShade";
import { useReducedMotion } from "@/game-engine/useReducedMotion";
import { ArrowLeft, Pickaxe, Flame, ArrowBigUp, Pause, Blocks } from "lucide-react";
import VirtualJoystick from "@/game-engine/VirtualJoystick";
import { countRender, registerInputProbe } from "@/game-engine/inputProbe";
import HoldButton from "@/game-engine/HoldButton";
import { shapeJoystick } from "@/game-engine/joystick";
import { motion, AnimatePresence } from "framer-motion";
import { queryClient } from "@/lib/queryClient";
import GamePedagogyPanel from "@/components/GamePedagogyPanel";
import { useCouponSession } from "@/game-engine/useCouponSession";
import { maybeClaimCouponBonus } from "@/game-engine/claimCouponBonus";
import { CouponHud, CouponExpiredOverlay } from "@/game-engine/CouponHud";
import { gameSyncBannerText, useSyncEligibilityQuery } from "@/hooks/useGameScoreSync";
import { useMaterialQuizzes } from "@/hooks/useMaterialQuizzes";
import { useClassroomGrade } from "@/lib/classroomStore";
import { useGradeLevel } from "@/game-engine/useGradeLevel";
import { GradeLevelPicker } from "@/game-engine/GradeLevelPicker";
import ClassroomGateModal from "@/components/ClassroomGateModal";
import AudioToggleButton from "@/components/AudioToggleButton";
import { useStreakProtector } from "@/hooks/useStreakProtector";
import { sfxSuccess, sfxError, sfxLevelUp, sfxWarning } from "@/lib/audioEngine";
import { recordRun, type Achievement } from "@/lib/achievements";
import { isTodaysGameAvailable, markDailyCompleted } from "@/lib/dailyChallenge";
import AchievementToast from "@/components/AchievementToast";
import {
  AIR, GRASS, DIRT, STONE, LOG, LEAVES, COAL, IRON, DIAMOND, BEDROCK,
  CREEPER, SAND, WATER, ZOMBIE, SKELETON, SPIDER,
  WX, WY, WZ,
  type VoxelWorld, type VoxelGenConfig, type PlayerState, type VoxelHit,
  generateVoxelWorld, findVoxelSpawn, stepPlayerPhysics, raycastVoxel,
  vGet, vSet, vIdx, vMineable, collidesAt, isExposed,
  PLAYER_EYE, MOVE_SPEED_BPS, JUMP_VELOCITY, pickStartLook,
} from "@/lib/voxelcraft";
import QuizFeedbackCard from "@/game-engine/QuizFeedbackCard";
import { buildFeedback, type FeedbackCard } from "@/game-engine/feedback";
import {
  blockCraftSubjectFromGradeSubject,
  blockCraftSubjectFromTopic,
  pickBlockCraftGradeSlot,
  type BlockCraftSubject,
} from "@/lib/blockCraftSubjects";
import { GRADE_SUBJECTS } from "@/data/gradeQuizBank";
import {
  createGradeQuizSeen,
  gradeForGame,
  markGradeQuizSeen,
  pickGradeQuiz,
  pickUnseenMaterial,
} from "@/game-engine/gradeQuiz";
import { correctDataAttrs, installGameTestApi } from "@/game-engine/game-test-hooks";
import {
  GameHud,
  GameShell,
  PauseMenu,
  ResultScreen,
  StartScreen,
  useBestScore,
  useHaptics,
  useTouchCapable,
  type GameHudStat,
  type GameScreenState,
} from "@/game-engine/mobile";
import { useVocabQuizSource, vocabLevelForGrade } from "@/game-engine/vocab";

import { newScoreRunId, postGameScore } from "@/lib/gameScoreRunId";
/** 2D pixel-minta cellaméret — a menü-előnézet (MenuBlock) rajzolásához. */
const TILE = 24;

type QuizSubject = BlockCraftSubject;
type Quiz = {
  id?: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  /** T-1: a MIÉRT rossz válasznál — a lecke exportjából vagy a generátorból. */
  explanation?: string | null;
  subject?: QuizSubject;
  /** A játékos tananyagából jött (a 3–12. évfolyamos választásban elsőbbséget élvez). */
  fromMaterial?: boolean;
};
type QuizBankApi = {
  items: {
    id?: string;
    prompt: string;
    options: string[];
    correctIndex: number;
    /** T-1: a MIÉRT rossz válasznál; régi tételeknél hiányzik. */
    explanation?: string | null;
  }[];
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
  /** Hány GYÉMÁNT kötelező a pálya teljesítéséhez (a leírás ígéretéhez kötve). */
  goalDiamonds?: number;
};

const LEVELS: LevelConfig[] = [
  {
    id: 1,
    name: "1. Erdei kezdés",
    description: "Ismerd meg a játékot! Nyílt terepen indulsz. Bányássz 8 blokkot az időkereten belül!",
    goalBlocks: 8,
    goalRareBlocks: 0,
    timeLimit: 240,
    oreMultiplier: 0.7,
    caveCount: 8,
    treeDensity: 0.12,
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
    treeDensity: 0.20,
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
    goalDiamonds: 1, // a leírás ígéri: "legalább 1 gyémánt"
  },
];

/** Pálya-konfig → voxel-világgenerátor paraméterek (Minecraft-klón terep). */
function genCfgFor(cfg: LevelConfig): VoxelGenConfig {
  const desert = cfg.biome === "desert";
  return {
    oreMultiplier: cfg.oreMultiplier,
    treeCount: Math.max(4, Math.round(cfg.treeDensity * 90)) + (cfg.biome === "forest" ? 6 : 0),
    surfaceMobCount: (cfg.id >= 3 ? 3 + cfg.id : 2) + (cfg.isBossLevel ? 3 : 0),
    caveMobCount: cfg.id >= 4 ? 5 : cfg.id === 3 ? 3 : 0,
    lakeCount: desert ? 2 : 1,
    sandPatchCount: desert ? 6 : 1,
    allowZombies: cfg.id >= 3,
  };
}

/** Lerakható blokkok a hotbar-sorrendben (mob és bedrock nem). */
const PLACEABLE_ORDER = [GRASS, DIRT, STONE, SAND, LOG, LEAVES, COAL, IRON, DIAMOND] as const;

const BLOCK_NAME: Record<number, string> = {
  [GRASS]: "Fű", [DIRT]: "Föld", [STONE]: "Kő", [SAND]: "Homok", [LOG]: "Rönk",
  [LEAVES]: "Lomb", [COAL]: "Szén", [IRON]: "Vas", [DIAMOND]: "Gyémánt",
};

const QUIZ_FALLBACK: Quiz[] = [
  // ============================================================
  // === ANGOL SZÓKINCS (alap, Minecraft-témájú) ================
  // ============================================================
  { prompt: "„Stone” jelentése:", options: ["kő", "hó", "fény", "híd"], correctIndex: 0, subject: "english", explanation: "A stone kő. Példa: „The stone is hard.” = „A kő kemény.”" },
  { prompt: "„Pickaxe” jelentése:", options: ["lapát", "csákány", "kard", "háló"], correctIndex: 1, subject: "english", explanation: "A pickaxe csákány, amelyet bányászáshoz használnak. „I have a pickaxe.” = „Van egy csákányom.”" },
  { prompt: "„Diamond” magyarul:", options: ["arany", "gyémánt", "szén", "vas"], correctIndex: 1, subject: "english", explanation: "A diamond gyémánt. „This diamond is blue.” = „Ez a gyémánt kék.”" },
  { prompt: "„Forest” magyarul:", options: ["tenger", "hegy", "erdő", "hűtő"], correctIndex: 2, subject: "english", explanation: "A forest erdő, sok fával borított terület. „The forest is dark.” = „Az erdő sötét.”" },
  { prompt: "„Build” jelentése:", options: ["épít", "fut", "ugrik", "bányászik"], correctIndex: 0, subject: "english", explanation: "A build ige jelentése épít. „We build a house.” = „Házat építünk.”" },
  { prompt: "Mit jelent: „Craft a tool”?", options: ["eszközt készít", "futni tanul", "többet alszik", "vizet gyűjt"], correctIndex: 0, subject: "english", explanation: "A craft azt jelenti, hogy elkészít valamit alapanyagokból, a tool pedig eszköz. „Craft a tool.” = „Készíts eszközt.”" },
  { prompt: "„Grass” magyarul:", options: ["fű", "jég", "kő", "ég"], correctIndex: 0, subject: "english", explanation: "A grass fű. „The grass is green.” = „A fű zöld.”" },
  { prompt: "„Dirt” magyarul:", options: ["homok", "föld", "víz", "ég"], correctIndex: 1, subject: "english", explanation: "A dirt föld vagy piszok; játékban általában földblokk. „The dirt is brown.” = „A föld barna.”" },
  { prompt: "„Wood” / faanyag angolul a játékban gyakran:", options: ["water", "wood", "wind", "wolf"], correctIndex: 1, subject: "english", explanation: "A wood faanyag vagy fa. „I need wood.” = „Faanyagra van szükségem.”" },
  { prompt: "„Leaves” jelentése:", options: ["gyökerek", "levelek", "kövek", "felhők"], correctIndex: 1, subject: "english", explanation: "A leaves a leaf, vagyis levél többes száma. „The leaves are green.” = „A levelek zöldek.”" },
  { prompt: "„Coal” magyarul:", options: ["réz", "szén", "cukor", "kő"], correctIndex: 1, subject: "english", explanation: "A coal szén, amely tüzelőanyag is lehet. „Coal is black.” = „A szén fekete.”" },
  { prompt: "„Iron” magyarul:", options: ["arany", "vas", "ezüst", "réz"], correctIndex: 1, subject: "english", explanation: "Az iron vas. „Iron is strong.” = „A vas erős.”" },
  { prompt: "„Jump” jelentése:", options: ["fut", "ugrás / ugrik", "áll", "esik"], correctIndex: 1, subject: "english", explanation: "A jump lehet főnévként ugrás, igeként pedig ugrik. „I jump high.” = „Magasra ugrom.”" },
  { prompt: "„Mine” ebben a játékban:", options: ["fest", "bányászik", "főz", "úszik"], correctIndex: 1, subject: "english", explanation: "A mine itt igeként bányászik; főnévként bányát is jelenthet. „We mine coal.” = „Szenet bányászunk.”" },
  { prompt: "„Block” jelentése:", options: ["kocka / blokk", "labda", "ajtó", "ablak"], correctIndex: 0, subject: "english", explanation: "A block játékokban építőelem, vagyis blokk vagy kocka. „Break the block.” = „Törd ki a blokkot.”" },
  { prompt: "„Sky” magyarul:", options: ["föld", "ég / égbolt", "víz", "erdő"], correctIndex: 1, subject: "english", explanation: "A sky az ég vagy égbolt. „The sky is blue.” = „Az ég kék.”" },
  { prompt: "„River” magyarul:", options: ["hegy", "folyó", "út", "ház"], correctIndex: 1, subject: "english", explanation: "A river folyó, természetes vízfolyás. „The river is long.” = „A folyó hosszú.”" },
  { prompt: "„Bridge” magyarul:", options: ["híd", "bástya", "bokor", "bárány"], correctIndex: 0, subject: "english", explanation: "A bridge híd, amely két partot vagy területet köt össze. „Cross the bridge.” = „Menj át a hídon.”" },
  { prompt: "„Castle” magyarul:", options: ["kert", "vár", "vonat", "villa"], correctIndex: 1, subject: "english", explanation: "A castle vár, általában nagy, erődített épület. „The castle is old.” = „A vár régi.”" },
  { prompt: "„Star” magyarul:", options: ["hold", "csillag", "felhő", "szél"], correctIndex: 1, subject: "english", explanation: "A star csillag. „I see a star.” = „Látok egy csillagot.”" },
  { prompt: "„Moon” magyarul:", options: ["nap", "hold", "hó", "hajó"], correctIndex: 1, subject: "english", explanation: "A moon hold, a Föld természetes kísérője. „The moon is bright.” = „A hold fényes.”" },
  { prompt: "„Rain” magyarul:", options: ["hó", "eső", "szél", "nap"], correctIndex: 1, subject: "english", explanation: "A rain eső; lehet főnév és ige is. „The rain is cold.” = „Az eső hideg.”" },
  { prompt: "„Snow” magyarul:", options: ["jég", "hó", "eső", "homok"], correctIndex: 1, subject: "english", explanation: "A snow hó. „The snow is white.” = „A hó fehér.”" },
  { prompt: "„Happy” magyarul:", options: ["szomorú", "boldog", "fáradt", "mérges"], correctIndex: 1, subject: "english", explanation: "A happy boldog; érzést vagy jókedvet fejez ki. „I am happy.” = „Boldog vagyok.”" },
  { prompt: "„Big” magyarul:", options: ["kicsi", "nagy", "lassú", "rövid"], correctIndex: 1, subject: "english", explanation: "A big nagy, méretre utaló melléknév. „The house is big.” = „A ház nagy.”" },
  { prompt: "„Small” magyarul:", options: ["nagy", "kicsi", "kövér", "mély"], correctIndex: 1, subject: "english", explanation: "A small kicsi, a big ellentéte. „The cat is small.” = „A macska kicsi.”" },
  // === SZITUÁCIÓS MINECRAFT KÉRDÉSEK ===
  { prompt: "Éjszaka van, zombik jönnek! Mit csinálsz?", options: ["Build a shelter", "Go swimming", "Take a nap", "Eat diamonds"], correctIndex: 0, subject: "english", explanation: "Éjszaka a menedék megépítése védelmet ad a szörnyek ellen. „Build a shelter.” = „Építs menedéket.”" },
  { prompt: "A creeper felrobban! Angolul:", options: ["The creeper explodes!", "The creeper sleeps", "The creeper sings", "The creeper dances"], correctIndex: 0, subject: "english", explanation: "Az explode jelentése felrobban; a creeper egyes számú, ezért explodes alakot használunk. „The creeper explodes!” = „A creeper felrobban!”" },
  { prompt: "Hogyan mondod: 'Készíts egy kardot'?", options: ["Craft a sword", "Cook a sword", "Plant a sword", "Drink a sword"], correctIndex: 0, subject: "english", explanation: "A craft készít, a sword kard. „Craft a sword.” = „Készíts egy kardot.”" },
  { prompt: "Mit jelent: 'Watch out for lava!'?", options: ["Vigyázz a lávára!", "Nézd a vizet!", "Keresd a gyémántot!", "Építs házat!"], correctIndex: 0, subject: "english", explanation: "A watch out for figyelmeztetés: vigyázz valamire. „Watch out for lava!” = „Vigyázz a lávára!”" },
  { prompt: "Éhes vagy Minecraftban. Mit csinálsz?", options: ["Find food", "Mine stone", "Jump around", "Sleep outside"], correctIndex: 0, subject: "english", explanation: "Éhségkor ételt kell keresni, mert az életerő és a futás is az éhségcsíktól függ. Angolul: „Find food.” = „Keress ételt.”" },
  { prompt: "'You found diamonds!' mit jelent?", options: ["Gyémántot találtál!", "Köveket látod!", "Fát vágsz!", "Vizet iszol!"], correctIndex: 0, subject: "english", explanation: "A „found” a „find” múlt ideje, jelentése: talált. Egyszerű példa: „You found gold.” = „Aranyat találtál.”" },
  { prompt: "Milyen eszközzel bányászol követ? Angolul:", options: ["With a pickaxe", "With a sword", "With a shovel", "With a bucket"], correctIndex: 0, subject: "english", explanation: "A kő bányászására a pickaxe, vagyis csákány való. Példa: „I mine stone with a pickaxe.” = „Csákánnyal bányászok követ.”" },
  { prompt: "'Help! A skeleton is shooting at me!' mit jelent?", options: ["Segítség! Egy csontváz lő rám!", "Segítség! Éhes vagyok!", "Hol van a ház?", "Fussunk!"], correctIndex: 0, subject: "english", explanation: "A „skeleton” csontváz, a „is shooting at me” pedig azt jelenti, hogy rám lő. Példa: „A skeleton has a bow.” = „A csontváznál íj van.”" },
  { prompt: "'It’s dangerous to go alone!' mit jelent?", options: ["Veszélyes egyedül menni!", "Gyorsan bányássz!", "Keress vizet!", "Hol a gyémánt?"], correctIndex: 0, subject: "english", explanation: "A „dangerous” jelentése veszélyes, az „alone” pedig egyedül. Példa: „It is dangerous at night.” = „Éjszaka veszélyes.”" },
  { prompt: "'Run! The creeper is behind you!' mit jelent?", options: ["Fuss! A creeper mögötted van!", "Allé! Zombi jön!", "Keress barlangot!", "Gyúíts tüzet!"], correctIndex: 0, subject: "english", explanation: "A „behind you” jelentése mögötted van, ezért gyorsan el kell futni. Példa: „The creeper is behind me.” = „A creeper mögöttem van.”" },
  // === CRAFTING RECEPTEK ===
  { prompt: "Mi kell a fáklyához? (angolul)", options: ["Coal + Stick", "Iron + Wood", "Diamond + Stone", "Grass + Dirt"], correctIndex: 0, subject: "english", explanation: "A fáklya készítéséhez szén és bot kell; a coal a szén, a stick a bot. Példa: „I need coal and a stick.” = „Szénre és egy botra van szükségem.”" },
  { prompt: "'Crafting table' magyarul:", options: ["munkasztal / kézműasztal", "konyhaasztal", "íróasztal", "kereskedő"], correctIndex: 0, subject: "english", explanation: "A crafting table a tárgykészítéshez használt munkasztal vagy kézműasztal. Példa: „Make a crafting table.” = „Készíts munkasztalt.”" },
  { prompt: "Hogyan mondod angolul: két fadeszka és egy bot?", options: ["Two wood planks and a stick", "Stone + Grass", "Coal + Stick", "Dirt + Sand"], correctIndex: 0, subject: "english", explanation: "A wood plank fadeszka, a stick bot. Kettő többes számmal: two wood planks; egy bot: a stick." },
  { prompt: "'Sword' magyarul:", options: ["kard", "pajzs", "páncél", "nyíl"], correctIndex: 0, subject: "english", explanation: "A sword kard, közelharcra használható fegyver. Példa: „My sword is strong.” = „A kardom erős.”" },
  { prompt: "'Bow' magyarul a Minecraftban:", options: ["íj", "kard", "pajzs", "csákány"], correctIndex: 0, subject: "english", explanation: "A bow íj, amely nyilakat lő ki, ezért távolsági fegyver. Példa: „I have a bow and arrows.” = „Van egy íjam és nyilaim.”" },
  // === MOB-OK ANGOLUL ===
  { prompt: "Skeleton = ?", options: ["csontváz", "zombi", "pók", "deneér"], correctIndex: 0, subject: "english", explanation: "A skeleton jelentése csontváz; a Minecraftban általában íjjal támad. Példa: „The skeleton is shooting.” = „A csontváz lő.”" },
  { prompt: "A 'Villager' magyarul:", options: ["falusi", "katona", "király", "boszorkány"], correctIndex: 0, subject: "english", explanation: "A villager falusi lakos, akivel kereskedni lehet a játékban. Példa: „The villager trades emeralds.” = „A falusi smaragdokkal kereskedik.”" },
  { prompt: "Creeper = ?", options: ["robbanó zöld szörny", "repülő deneér", "vörös sárkány", "vízi hal"], correctIndex: 0, subject: "english", explanation: "A creeper egy zöld, robbanó ellenséges lény; közel érve felrobbanhat. Példa: „The creeper is dangerous.” = „A creeper veszélyes.”" },
  { prompt: "Zombie = ?", options: ["zombi", "démon", "kísértet", "varjú"], correctIndex: 0, subject: "english", explanation: "A zombie magyarul zombi, egy közelharcban támadó ellenség. Példa: „A zombie is coming.” = „Egy zombi közeledik.”" },
  { prompt: "Spider = ?", options: ["pók", "hangya", "méh", "bogarak"], correctIndex: 0, subject: "english", explanation: "A spider pók; a Minecraftban gyorsan mozoghat és meg tud mászni falakat. Példa: „The spider climbs a wall.” = „A pók megmászik egy falat.”" },
  { prompt: "Witch = ?", options: ["boszorkány", "harcos", "varázslos herceg", "tündér"], correctIndex: 0, subject: "english", explanation: "A witch boszorkány, aki italokat dobálhat a játékosra. Példa: „The witch throws a potion.” = „A boszorkány eldob egy főzetet.”" },
  { prompt: "Enderman = ?", options: ["magas fekete lény", "zöld creeper", "csontváz", "vízi szörny"], correctIndex: 0, subject: "english", explanation: "Az Enderman magas, fekete lény, amely gyakran teleportál. Példa: „The Enderman is tall.” = „Az Enderman magas.”" },
  // === BIOME-OK ===
  { prompt: "Desert biome = ?", options: ["sivatag", "óceán", "dzsungel", "hegy"], correctIndex: 0, subject: "english", explanation: "A desert biome sivatagi életközösség, ahol sok a homok és kevés a növényzet. Példa: „The desert is hot.” = „A sivatag forró.”" },
  { prompt: "'Nether' magyarul kb.:", options: ["alvilág / pokol", "mennyország", "óceán", "erdő"], correctIndex: 0, subject: "english", explanation: "A Nether egy veszélyes, alvilágszerű külön dimenzió a Minecraftban. Példa: „The Nether has lava.” = „A Netherben láva van.”" },
  { prompt: "Jungle biome = ?", options: ["dzsungel", "sivatag", "tundra", "folyó"], correctIndex: 0, subject: "english", explanation: "A jungle biome dzsungel, sűrű fákkal és sok növénnyel. Példa: „Jungles have tall trees.” = „A dzsungelekben magas fák vannak.”" },
  { prompt: "Ocean biome = ?", options: ["óceán", "hegy", "völgy", "barlang"], correctIndex: 0, subject: "english", explanation: "Az ocean biome óceán, vagyis nagy, összefüggő vízterület. Példa: „The ocean is deep.” = „Az óceán mély.”" },
  { prompt: "Swamp biome = ?", options: ["mocsár", "sivatag", "mező", "tenger"], correctIndex: 0, subject: "english", explanation: "A swamp biome mocsár, amely sekély vízzel és nedves területekkel jellemző. Példa: „The swamp is wet.” = „A mocsár nedves.”" },
  // === SURVIVAL TIPPEK ===
  { prompt: "First night tip: 'Dig into a hillside!' Mit jelent?", options: ["Áss bele egy dombba!", "Ugorj a vízbe!", "Fuss el!", "Aludj a fán!"], correctIndex: 0, subject: "english", explanation: "A „dig into” azt jelenti, hogy beleásni valamibe; a hillside domboldal. Példa: „Dig into the mountain.” = „Áss bele a hegybe.”" },
  { prompt: "'Always bring food on adventures!' mit jelent?", options: ["Mindig vigyél ételt a kalandhoz!", "Felejtsd el az ételt!", "Csak vizet igyy", "Aludj sokat!"], correctIndex: 0, subject: "english", explanation: "Az „always” mindig, a „bring food” pedig ételt vinni. Példa: „Bring food on your trip.” = „Vigyél ételt az utadra.”" },
  { prompt: "'Mine deeper for rare ores!' mit jelent?", options: ["Mélyebbre bányássz ritka ércekért!", "Maradj a felszínen!", "Keress vizet!", "Gyűjts fát!"], correctIndex: 0, subject: "english", explanation: "A „deeper” mélyebbre, a „rare ores” ritka ércek. Mélyebben többféle értékes ércet találhatunk. Példa: „Mine for iron.” = „Bányássz vasért.”" },
  { prompt: "'Don't dig straight down!' mit jelent?", options: ["Ne áss egyenesen le!", "Mindig lefelé ássz!", "Gyorsan fuss!", "Bányássz követ!"], correctIndex: 0, subject: "english", explanation: "A „straight down” jelentése egyenesen lefelé; ez veszélyes, mert lávába vagy mély üregbe eshetsz. Példa: „Do not dig down.” = „Ne áss lefelé.”" },
  // === EXTRA SZÓKINCS ===
  { prompt: "'Shield' magyarul:", options: ["pajzs", "kard", "sisak", "csizma"], correctIndex: 0, subject: "english", explanation: "A shield pajzs, amellyel támadásokat lehet kivédeni. Példa: „Use your shield.” = „Használd a pajzsodat.”" },
  { prompt: "'Armor' magyarul:", options: ["páncél", "kesztyű", "sapka", "táska"], correctIndex: 0, subject: "english", explanation: "Az armor páncél, amely csökkenti az elszenvedett sebzést. Példa: „Iron armor protects you.” = „A vaspáncél megvéd.”" },
  { prompt: "'Cave' magyarul:", options: ["barlang", "folyó", "völgy", "domb"], correctIndex: 0, subject: "english", explanation: "A cave barlang, vagyis föld alatti természetes üreg vagy járatrendszer. Példa: „There is a cave nearby.” = „Van egy barlang a közelben.”" },
  { prompt: "'Lava' magyarul:", options: ["láva", "víz", "homok", "jég"], correctIndex: 0, subject: "english", explanation: "A „lava” magyarul láva. Példa: „The lava is hot.” – „A láva forró.”" },
  { prompt: "'Torch' magyarul:", options: ["fáklya", "lámpa", "gyertya", "tűz"], correctIndex: 0, subject: "english", explanation: "A „torch” fáklya, amely fényt ad. Példa: „Carry a torch at night.” – „Vigyél fáklyát éjjel.”" },
  { prompt: "'Chest' magyarul a játékban:", options: ["láda", "asztal", "ajtó", "ablak"], correctIndex: 0, subject: "english", explanation: "A játékokban a „chest” általában láda, amelyben tárgyakat tárolunk. Példa: „Open the chest.” – „Nyisd ki a ládát.”" },
  { prompt: "'Spawn' jelentése Minecraftban:", options: ["megjelenés / születési pont", "tárgy", "csontváz", "bányász"], correctIndex: 0, subject: "english", explanation: "A „spawn” Minecraftban megjelenést vagy kezdőpontot jelent. Példa: „I spawned near a village.” – „Egy falu közelében jelentem meg.”" },
  { prompt: "Hogyan mondod: 'Gyere ide!'?", options: ["Come here!", "Go away!", "Mine this!", "Build that!"], correctIndex: 0, subject: "english", explanation: "A „Come here!” jelentése: „Gyere ide!” A come mozgást fejez ki a beszélő felé. Példa: „Come here, please!” – „Gyere ide, kérlek!”" },
  { prompt: "Hogyan mondod angolul: Vigyázz!?", options: ["Careful! / Watch out!", "Hello!", "Good job!", "Let's go!"], correctIndex: 0, subject: "english", explanation: "A „Careful!” jelentése: „Vigyázz!” A „Watch out!” is figyelmeztetés, főleg közvetlen veszély esetén. Példa: „Watch out for lava!” – „Vigyázz a lávára!”" },
  { prompt: "'Hungry' magyarul:", options: ["éhes", "szomjas", "fáradt", "beteg"], correctIndex: 0, subject: "english", explanation: "A „hungry” magyarul éhes, vagyis valaki enni szeretne. Példa: „I am hungry.” – „Éhes vagyok.”" },
  { prompt: "'Dangerous' magyarul:", options: ["veszélyes", "békés", "mély", "gyönyörű"], correctIndex: 0, subject: "english", explanation: "A „dangerous” jelentése veszélyes. Példa: „This cave is dangerous.” – „Ez a barlang veszélyes.”" },
  // ============================================================
  // === ANGOL MATEMATIKA (math vocabulary + egyszerű műveletek) =
  // ============================================================
  { prompt: "What is 'add' in Hungarian?", options: ["szoroz", "összead", "kivon", "oszt"], correctIndex: 1, subject: "english-math", explanation: "Az „add” jelentése összead. Összeadáskor számokat egyesítünk: 2 + 3 = 5. Példa: „Add two and three.” – „Add össze a kettőt és a hármat.”" },
  { prompt: "What is 'subtract' in Hungarian?", options: ["összead", "kivon", "szoroz", "oszt"], correctIndex: 1, subject: "english-math", explanation: "A „subtract” jelentése kivon. Kivonáskor egy számból elveszünk: 8 − 3 = 5. Példa: „Subtract three from eight.” – „Vonj ki hármat nyolcból.”" },
  { prompt: "What is 'multiply' in Hungarian?", options: ["szoroz", "összead", "kivon", "oszt"], correctIndex: 0, subject: "english-math", explanation: "A „multiply” jelentése szoroz. A 4 × 3 azt jelenti, hogy négyszer veszünk hármat: 4 × 3 = 12. Példa: „Multiply four by three.” – „Szorozd meg a négyet hárommal.”" },
  { prompt: "What is 'divide' in Hungarian?", options: ["szoroz", "oszt", "összead", "kivon"], correctIndex: 1, subject: "english-math", explanation: "A „divide” jelentése oszt. Osztáskor egy mennyiséget egyenlő részekre bontunk: 12 ÷ 3 = 4. Példa: „Divide twelve by three.” – „Oszd el a tizenkettőt hárommal.”" },
  { prompt: "'Two plus three equals?' (2 + 3 = ?)", options: ["four", "five", "six", "seven"], correctIndex: 1, subject: "english-math", explanation: "Kettőhöz háromat adva ötöt kapunk: 2 + 3 = 5. Angolul az öt: five." },
  { prompt: "'Four times two equals?' (4 × 2 = ?)", options: ["six", "eight", "ten", "twelve"], correctIndex: 1, subject: "english-math", explanation: "A négyszer kettő négy darab kettőt jelent: 2 + 2 + 2 + 2 = 8. Angolul a nyolc: eight." },
  { prompt: "'Ten minus four equals?' (10 - 4 = ?)", options: ["five", "six", "seven", "eight"], correctIndex: 1, subject: "english-math", explanation: "Tízből négyet kivonva hat marad: 10 − 4 = 6. Angolul a hat: six." },
  { prompt: "'Twelve divided by three equals?' (12 ÷ 3 = ?)", options: ["three", "four", "five", "six"], correctIndex: 1, subject: "english-math", explanation: "A 12-t három egyenlő részre osztva minden részben 4 lesz: 12 ÷ 3 = 4. Angolul: four." },
  { prompt: "'Half of ten is?' (10 fele?)", options: ["three", "four", "five", "six"], correctIndex: 2, subject: "english-math", explanation: "A tíz fele öt, mert 10 ÷ 2 = 5. Angolul az öt: five." },
  { prompt: "'Double of six is?' (6 kétszerese?)", options: ["ten", "twelve", "fourteen", "sixteen"], correctIndex: 1, subject: "english-math", explanation: "A hat kétszerese 12, mert 6 + 6 = 12, vagyis 2 × 6 = 12. Angolul: twelve." },
  { prompt: "'Number' jelentése:", options: ["szám", "szín", "szó", "sor"], correctIndex: 0, subject: "english-math", explanation: "A „number” jelentése szám. Példa: „Seven is a number.” – „A hét egy szám.”" },
  { prompt: "'Equal' magyarul:", options: ["nagyobb", "egyenlő", "kisebb", "közel"], correctIndex: 1, subject: "english-math", explanation: "Az „equal” magyarul egyenlő: két mennyiség értéke ugyanaz. Példa: „Two plus two equals four.” – „Kettő meg kettő egyenlő néggyel.”" },
  { prompt: "'Greater than' magyarul:", options: ["kisebb, mint", "nagyobb, mint", "egyenlő", "nem egyenlő"], correctIndex: 1, subject: "english-math", explanation: "A „greater than” jelentése nagyobb, mint. Például 7 > 4, mert a hét nagyobb négynél." },
  { prompt: "'Less than' magyarul:", options: ["nagyobb, mint", "egyenlő", "kisebb, mint", "közel"], correctIndex: 2, subject: "english-math", explanation: "A „less than” jelentése kisebb, mint. Például 3 < 8, mert a három kisebb nyolcnál." },
  { prompt: "'Sum' magyarul matekban:", options: ["összeg", "különbség", "szorzat", "hányados"], correctIndex: 0, subject: "english-math", explanation: "Az összeadás eredményét összegnek nevezzük. Például 4 + 5 = 9 esetén a 9 az összeg." },
  { prompt: "'Difference' magyarul matekban:", options: ["összeg", "különbség", "szorzat", "hányados"], correctIndex: 1, subject: "english-math", explanation: "A kivonás eredménye a különbség. Például 9 − 4 = 5 esetén az 5 a különbség." },
  { prompt: "'Product' magyarul matekban:", options: ["összeg", "különbség", "szorzat", "hányados"], correctIndex: 2, subject: "english-math", explanation: "A szorzás eredménye a szorzat. Például 3 × 4 = 12 esetén a 12 a szorzat." },
  { prompt: "'Quotient' magyarul matekban:", options: ["összeg", "különbség", "szorzat", "hányados"], correctIndex: 3, subject: "english-math", explanation: "Az osztás eredményét hányadosnak nevezzük. Például 12 ÷ 3 = 4 esetén a 4 a hányados." },
  { prompt: "'Triangle' magyarul:", options: ["kör", "négyzet", "háromszög", "téglalap"], correctIndex: 2, subject: "english-math", explanation: "A „triangle” magyarul háromszög, mert három oldala és három csúcsa van. Példa: „Draw a triangle.” – „Rajzolj egy háromszöget.”" },
  { prompt: "'Square' magyarul mértanban:", options: ["kör", "négyzet", "háromszög", "téglalap"], correctIndex: 1, subject: "english-math", explanation: "A „square” mértanban négyzet: négy egyforma hosszú oldala és négy derékszöge van. Példa: „The square has four sides.” – „A négyzetnek négy oldala van.”" },
  { prompt: "'Circle' magyarul:", options: ["kör", "négyzet", "háromszög", "téglalap"], correctIndex: 0, subject: "english-math", explanation: "A „circle” magyarul kör. A körvonal minden pontja ugyanakkora távolságra van a középponttól. Példa: „Draw a circle.” – „Rajzolj egy kört.”" },
  { prompt: "'Rectangle' magyarul:", options: ["kör", "négyzet", "háromszög", "téglalap"], correctIndex: 3, subject: "english-math", explanation: "A „rectangle” magyarul téglalap. Négy derékszöge van, szemközti oldalai egyenlők. Példa: „A door is a rectangle.” – „Az ajtó téglalap.”" },
  { prompt: "'Half' magyarul:", options: ["egész", "fél", "negyed", "harmad"], correctIndex: 1, subject: "english-math", explanation: "A „half” jelentése fél, vagyis egy egész két egyenlő részének egyike. Példa: „Half of the cake is mine.” – A torta fele az enyém." },
  { prompt: "'Quarter' magyarul (tört):", options: ["egész", "fél", "negyed", "harmad"], correctIndex: 2, subject: "english-math", explanation: "A „quarter” tört értelemben negyed: az egész négy egyenlő részre osztva. Példa: „I ate a quarter of the pizza.” – Megettem a pizza negyedét." },
  { prompt: "How many sides does a triangle have?", options: ["2", "3", "4", "5"], correctIndex: 1, subject: "english-math", explanation: "A háromszögnek 3 oldala van; neve is erre utal: három szakasz zárja körül a síkidomot." },
  { prompt: "How many sides does a square have?", options: ["3", "4", "5", "6"], correctIndex: 1, subject: "english-math", explanation: "A négyzetnek 4 oldala van, és mind a négy oldala egyenlő hosszúságú. Szomszédos oldalai derékszöget zárnak be." },
  { prompt: "'Even number' magyarul:", options: ["páros szám", "páratlan szám", "prím szám", "nulla"], correctIndex: 0, subject: "english-math", explanation: "Az „even number” páros szám: maradék nélkül osztható 2-vel. Példa: „Eight is an even number.” – A nyolc páros szám." },
  { prompt: "'Odd number' magyarul:", options: ["páros szám", "páratlan szám", "prím szám", "nulla"], correctIndex: 1, subject: "english-math", explanation: "Az „odd number” páratlan szám: 2-vel osztva 1 a maradéka. Példa: „Seven is an odd number.” – A hét páratlan szám." },
  // ============================================================
  // === EGYSZERŰ MAGYAR MATEMATIKA (1-4. osztály szint) =========
  // ============================================================
  { prompt: "Mennyi 5 + 3?", options: ["6", "7", "8", "9"], correctIndex: 2, subject: "math", explanation: "5 + 3 = 8, mert az öthöz még három egységet adunk: 6, 7, 8." },
  { prompt: "Mennyi 9 - 4?", options: ["3", "4", "5", "6"], correctIndex: 2, subject: "math", explanation: "9 − 4 = 5, mert kilencből négyet elvéve öt marad: 9 − 1 − 1 − 1 − 1 = 5." },
  { prompt: "Mennyi 7 + 6?", options: ["11", "12", "13", "14"], correctIndex: 2, subject: "math", explanation: "7 + 6 = 13: a héthez hozzáadunk hatot, vagyis 7 + 3 + 3 = 10 + 3 = 13." },
  { prompt: "Mennyi 15 - 8?", options: ["5", "6", "7", "8"], correctIndex: 2, subject: "math", explanation: "15 − 8 = 7, mert 15-ből 5 elvétele után 10 marad, majd még 3 elvétele után 7." },
  { prompt: "Mennyi 4 × 3?", options: ["9", "10", "11", "12"], correctIndex: 3, subject: "math", explanation: "4 × 3 = 12, mert négy darab hármas összege: 3 + 3 + 3 + 3 = 12." },
  { prompt: "Mennyi 6 × 2?", options: ["10", "12", "14", "16"], correctIndex: 1, subject: "math", explanation: "6 × 2 = 12, mert hat kétszerese hat és még hat: 6 + 6 = 12." },
  { prompt: "Mennyi 8 × 5?", options: ["35", "40", "45", "50"], correctIndex: 1, subject: "math", explanation: "8 × 5 = 40, mert nyolcszor ötöt adunk össze: 5 + 5 + 5 + 5 + 5 + 5 + 5 + 5 = 40." },
  { prompt: "Mennyi 18 ÷ 3?", options: ["5", "6", "7", "8"], correctIndex: 1, subject: "math", explanation: "18 ÷ 3 = 6, mert 6 × 3 = 18. Az osztás a szorzás fordított művelete." },
  { prompt: "Mennyi 24 ÷ 4?", options: ["5", "6", "7", "8"], correctIndex: 1, subject: "math", explanation: "24 ÷ 4 = 6, mert 6 × 4 = 24. Ennyi jut egy csoportba, ha 24-et négyfelé osztunk." },
  { prompt: "Mennyi 100 - 37?", options: ["53", "63", "73", "83"], correctIndex: 1, subject: "math", explanation: "100 − 37 = 63: 100 − 30 = 70, majd 70 − 7 = 63." },
  { prompt: "Mennyi 25 + 48?", options: ["63", "73", "83", "93"], correctIndex: 1, subject: "math", explanation: "25 + 48 = 73: 20 + 40 = 60, az 5 + 8 = 13, így 60 + 13 = 73." },
  { prompt: "Hány cm van 1 méterben?", options: ["10", "100", "1000", "10000"], correctIndex: 1, subject: "math", explanation: "1 méter 100 centiméter, mert a centiméter a méter századrésze: 1 cm = 0,01 m." },
  { prompt: "Hány perc van 1 órában?", options: ["30", "45", "60", "100"], correctIndex: 2, subject: "math", explanation: "1 óra 60 perc. Az óra számlapján a nagymutató egy teljes kör alatt 60 percet halad." },
  { prompt: "Hány nap van 1 hétben?", options: ["5", "6", "7", "8"], correctIndex: 2, subject: "math", explanation: "1 hét 7 napból áll: hétfő, kedd, szerda, csütörtök, péntek, szombat és vasárnap." },
  { prompt: "Hány hónap van 1 évben?", options: ["10", "11", "12", "13"], correctIndex: 2, subject: "math", explanation: "1 évben 12 hónap van, januártól decemberig. Egy közönséges év 365 napos." },
  { prompt: "Mennyi a 10 fele?", options: ["2", "4", "5", "6"], correctIndex: 2, subject: "math", explanation: "A 10 fele 5, mert a felezés osztás 2-vel: 10 ÷ 2 = 5." },
  { prompt: "Mennyi a 8 kétszerese?", options: ["10", "14", "16", "18"], correctIndex: 2, subject: "math", explanation: "A 8 kétszerese 16, mert a kétszerezés azt jelenti, hogy a számot önmagához adjuk: 8 + 8 = 16." },
  { prompt: "Melyik a páros szám?", options: ["3", "7", "8", "11"], correctIndex: 2, subject: "math", explanation: "A 8 páros szám, mert 2-vel maradék nélkül osztható: 8 ÷ 2 = 4." },
  { prompt: "Melyik a páratlan szám?", options: ["4", "6", "9", "10"], correctIndex: 2, subject: "math", explanation: "A 9 páratlan szám, mert 2-vel osztva 4 maradék 1: 9 = 2 × 4 + 1." },
  { prompt: "Hány oldala van egy háromszögnek?", options: ["2", "3", "4", "5"], correctIndex: 1, subject: "math", explanation: "A háromszög 3 oldalból áll. Három egyenes szakasz kapcsolódik össze zárt síkidommá." },
  { prompt: "Hány oldala van egy négyzetnek?", options: ["3", "4", "5", "6"], correctIndex: 1, subject: "math", explanation: "A négyzetnek 4 oldala van. Ezek egyenlők, és a négy belső szöge mind derékszög." },
  { prompt: "Hány csúcsa van egy kockának?", options: ["4", "6", "8", "12"], correctIndex: 2, subject: "math", explanation: "A kockának 8 csúcsa van. A csúcsok azok a pontok, ahol a kocka élei találkoznak." },
  { prompt: "Mennyi 12 + 12?", options: ["22", "24", "26", "28"], correctIndex: 1, subject: "math", explanation: "12 + 12 = 24, mert két tucat összege 24: 10 + 10 = 20 és 2 + 2 = 4." },
  { prompt: "Hány nulla van 1000-ben?", options: ["2", "3", "4", "5"], correctIndex: 1, subject: "math", explanation: "Az 1000-ben 3 nulla van: 1000 = 1 × 1000, vagyis egy ezres és három nulla." },
  { prompt: "Mennyi 7 × 7?", options: ["42", "49", "56", "63"], correctIndex: 1, subject: "math", explanation: "7 × 7 = 49, mert hét darab hetest adunk össze: 7+7+7+7+7+7+7 = 49." },
  { prompt: "Mennyi 9 × 9?", options: ["72", "81", "90", "99"], correctIndex: 1, subject: "math", explanation: "9 × 9 = 81, hiszen kilencszer kilencet összeadva 81-et kapunk." },
  { prompt: "Mennyi a 20 fele?", options: ["8", "10", "12", "15"], correctIndex: 1, subject: "math", explanation: "A fele azt jelenti, hogy kettővel osztunk: 20 ÷ 2 = 10." },
  { prompt: "Ha 3 almám van és kapok 4-et, hány lesz?", options: ["5", "6", "7", "8"], correctIndex: 2, subject: "math", explanation: "A kapott almákat hozzáadjuk: 3 + 4 = 7, tehát ennyi almád lesz." },
  { prompt: "Ha 10 cukorkám volt és 6-ot megettem, hány maradt?", options: ["3", "4", "5", "6"], correctIndex: 1, subject: "math", explanation: "Az elfogyasztott cukorkákat kivonjuk: 10 − 6 = 4 marad." },
  { prompt: "Mennyi 50 + 50?", options: ["90", "100", "110", "150"], correctIndex: 1, subject: "math", explanation: "Ötven és ötven együtt száz: 50 + 50 = 100." },
  // ============================================================
  // === KÖRNYEZETISMERET (egyszerű, 1-4. osztály szint) =========
  // ============================================================
  { prompt: "Melyik állítás igaz a fára mint növényre?", options: ["A fa nagyobb, fás szárú növény", "A fa nem él", "A növény nem zöld", "Nincs különbség"], correctIndex: 0, subject: "nature", explanation: "A fa a növények egyik csoportja: fás, tartós szára van, és általában magasra nő." },
  { prompt: "Mi a fő különbség a növény és az állat között?", options: ["A növény fotoszintetizál, az állat mozog és eszik", "Az állat mindig nagyobb", "A növény is eszik húst", "Nincs különbség"], correctIndex: 0, subject: "nature", explanation: "A növények többnyire fotoszintézissel készítik táplálékukat, az állatok pedig kész táplálékot fogyasztanak." },
  { prompt: "Mit csinál a növény a napfénnyel?", options: ["Eszik", "Alszik", "Fotoszintetizál (táplálékot készít)", "Elfut"], correctIndex: 2, subject: "nature", explanation: "A növény a napfény energiájával fotoszintézis során cukrot, vagyis táplálékot készít." },
  { prompt: "Mi a tölgy?", options: ["Állat", "Fa", "Gomba", "Hal"], correctIndex: 1, subject: "nature", explanation: "A tölgy fa: fás szárú növény, amelynek termése a makk." },
  { prompt: "Melyik növény NEM fa?", options: ["tölgy", "bükk", "pipacs", "fenyő"], correctIndex: 2, subject: "nature", explanation: "A pipacs lágyszárú virágos növény, nem fás törzsű fa." },
  { prompt: "Melyik állat NEM emlős?", options: ["kutya", "macska", "tyúk", "ló"], correctIndex: 2, subject: "nature", explanation: "A tyúk madár, toll borítja és tojással szaporodik; az emlősök kicsinyeiket tejjel táplálják." },
  { prompt: "Hány lába van egy póknak?", options: ["4", "6", "8", "10"], correctIndex: 2, subject: "nature", explanation: "A pókoknak nyolc lábuk van, ezért nem rovarok, hanem pókszabásúak." },
  { prompt: "Hány lába van egy rovarnak (pl. méh)?", options: ["4", "6", "8", "10"], correctIndex: 1, subject: "nature", explanation: "A rovarok testének három pár lába van, ezért összesen 6 lábuk van." },
  { prompt: "Mit csinál a méh a virággal?", options: ["Eszi", "Nektárt gyűjt és beporozza", "Kitépi", "Elrejti"], correctIndex: 1, subject: "nature", explanation: "A méh nektárt gyűjt, közben virágport visz egyik virágról a másikra, így beporoz." },
  { prompt: "Mi lesz a rovar lárvájából a fejlődés végén?", options: ["Növény", "Kő", "Kifejlett rovar, például pillangó vagy bogár", "Hal"], correctIndex: 2, subject: "nature", explanation: "A lárva fejlődés után kifejlett rovarrá alakul; például hernyóból báb után pillangó lesz." },
  { prompt: "Melyik évszakban hullik le a levél?", options: ["tavasz", "nyár", "ősz", "tél"], correctIndex: 2, subject: "nature", explanation: "Ősszel sok lombhullató fa levele elszíneződik, majd lehullik a téli időszak előtt." },
  { prompt: "Melyik évszakban van a legmelegebb?", options: ["tavasz", "nyár", "ősz", "tél"], correctIndex: 1, subject: "nature", explanation: "Nyáron kapjuk általában a legtöbb és legerősebb napsütést, ezért ekkor van a legmelegebb." },
  { prompt: "Mi okozza a nappal és az éjszaka váltakozását?", options: ["A Föld forgása miatt a Nap látszólagos állása", "A Hold eltűnik", "A csillagok elfogynak", "Nincs különbség"], correctIndex: 0, subject: "nature", explanation: "A Föld forgása miatt hol a Nap felé, hol az ellenkező irányba nézünk: így váltakozik a nappal és az éjszaka." },
  { prompt: "Mit iszik a növény?", options: ["tejet", "vizet (gyökerein át)", "levegőt", "semmit"], correctIndex: 1, subject: "nature", explanation: "A növény a gyökerein keresztül vizet vesz fel a talajból, és azt a szárába, leveleibe szállítja." },
  { prompt: "Hol él a hal?", options: ["levegőben", "földben", "vízben", "fán"], correctIndex: 2, subject: "nature", explanation: "A hal vízben él, testének és légzésének működése ehhez az élőhelyhez alkalmazkodott." },
  { prompt: "Mivel lélegzik a hal?", options: ["tüdővel", "kopoltyúval", "orral", "szájjal"], correctIndex: 1, subject: "nature", explanation: "A hal kopoltyúval lélegzik: ezzel vonja ki a vízben oldott oxigént." },
  { prompt: "Melyik a mi bolygónk?", options: ["Mars", "Hold", "Föld", "Nap"], correctIndex: 2, subject: "nature", explanation: "A Föld a Naprendszer bolygója, ezen élnek az emberek és sok más élőlény." },
  { prompt: "Mi a Nap?", options: ["csillag", "bolygó", "hold", "üstökös"], correctIndex: 0, subject: "nature", explanation: "A Nap csillag: saját fénye és hője van, mert a belsejében energia termelődik." },
  { prompt: "Mi a Hold?", options: ["csillag", "bolygó", "a Föld kísérője", "galaxis"], correctIndex: 2, subject: "nature", explanation: "A Hold a Föld természetes kísérője, vagyis a Föld körül kering." },
  { prompt: "Hány napból áll egy hét?", options: ["5", "6", "7", "8"], correctIndex: 2, subject: "nature", explanation: "Egy hét 7 napból áll: hétfőtől vasárnapig tart." },
  { prompt: "Milyen halmazállapotú a jég?", options: ["folyékony", "szilárd", "légnemű", "ragadós"], correctIndex: 1, subject: "nature", explanation: "A jég szilárd halmazállapotú víz: alakja van, és nem folyik szét." },
  { prompt: "Milyen halmazállapotú a víz szobahőmérsékleten?", options: ["folyékony", "szilárd", "légnemű", "kristályos"], correctIndex: 0, subject: "nature", explanation: "A víz folyékony halmazállapotú: folyik, és felveszi az edény alakját." },
  { prompt: "Milyen halmazállapotú a levegő?", options: ["folyékony", "szilárd", "légnemű", "porszerű"], correctIndex: 2, subject: "nature", explanation: "A levegő légnemű: nincs saját alakja, és kitölti azt a teret, ahol van." },
  { prompt: "Mivé alakul a folyékony víz párolgáskor?", options: ["Jég", "Vízgőzzé", "Só", "Homok"], correctIndex: 1, subject: "nature", explanation: "Párolgáskor a folyékony vízből légnemű vízgőz lesz. A vízgőz láthatatlan; a látható köd apró folyékony vízcseppekből áll." },
  { prompt: "Melyik állat tojik tojást?", options: ["ló", "kutya", "tyúk", "macska"], correctIndex: 2, subject: "nature", explanation: "A tyúk madár, ezért tojással szaporodik. Az emlősök, például a ló, a kutya és a macska élő utódot hoznak világra." },
  { prompt: "Melyik NEM madár?", options: ["veréb", "galamb", "denevér", "fecske"], correctIndex: 2, subject: "nature", explanation: "A denevér emlős: szőr borítja, kicsinyeit tejjel táplálja. Bár repül, nem madár." },
  { prompt: "Mit eszik a nyúl?", options: ["húst", "növényeket (füvet, répát)", "köveket", "fémet"], correctIndex: 1, subject: "nature", explanation: "A nyúl növényevő állat, füvet, leveleket és zöldségeket is eszik. Fogai a növényi részek rágásához alkalmazkodtak." },
  { prompt: "Mit eszik a farkas?", options: ["csak füvet", "csak gyümölcsöt", "húst (ragadozó)", "köveket"], correctIndex: 2, subject: "nature", explanation: "A farkas ragadozó, táplálékának fő része hús. Éles fogai és erős állkapcsa a zsákmány elfogásában segítik." },
  { prompt: "Milyen halmazállapotú a gyémánt?", options: ["folyékony", "szilárd", "légnemű", "gázszerű"], correctIndex: 1, subject: "nature", explanation: "A gyémánt szilárd halmazállapotú, mert saját alakja és térfogata van. Szénatomok nagyon rendezett szerkezetéből áll." },
  { prompt: "Honnan származik az eső?", options: ["a földből", "a felhőkből", "a kőzetekből", "a fákból"], correctIndex: 1, subject: "nature", explanation: "Az eső a felhőkből hullik le, amikor a bennük lévő vízcseppek elég nagyra és nehézzé válnak." },
  { prompt: "Mitől nő a növény?", options: ["víztől, napfénytől, levegőtől és tápanyagoktól", "csak vacsorától", "köztől", "semmitől"], correctIndex: 0, subject: "nature", explanation: "A növény növekedéséhez vízre, napfényre és levegőre van szükség; a talajból tápanyagokat is felvesz." },
  { prompt: "Mi a legnagyobb szárazföldi állat?", options: ["oroszlán", "elefánt", "ló", "tigris"], correctIndex: 1, subject: "nature", explanation: "Az elefánt a legnagyobb szárazföldi állat. Az afrikai elefánt tömege akár több tonna is lehet." },
  { prompt: "Melyik a leghidegebb évszak?", options: ["tavasz", "nyár", "ősz", "tél"], correctIndex: 3, subject: "nature", explanation: "A tél a leghidegebb évszak, mert ilyenkor rövidebb ideig süt a Nap, és kisebb szögben éri a felszínt." },
  // ============================================================
  // === TOVÁBBI MATEMATIKA (bővítés v2, 2026-04-21) =============
  // ============================================================
  { prompt: "Mennyi 13 + 17?", options: ["28", "29", "30", "31"], correctIndex: 2, subject: "math", explanation: "13 + 17 = 30, mert 10 + 10 = 20 és 3 + 7 = 10; így 20 + 10 = 30." },
  { prompt: "Mennyi 45 - 27?", options: ["16", "18", "20", "22"], correctIndex: 1, subject: "math", explanation: "45 − 27 = 18. Először 45 − 20 = 25, majd 25 − 7 = 18." },
  { prompt: "Mennyi 8 + 9?", options: ["16", "17", "18", "19"], correctIndex: 1, subject: "math", explanation: "8 + 9 = 17. Gondolhatunk rá így: 8 + 8 = 16, ehhez még 1-et adva 17-et kapunk." },
  { prompt: "Mennyi 20 - 7?", options: ["11", "12", "13", "14"], correctIndex: 2, subject: "math", explanation: "20 − 7 = 13. Ha húszból elveszünk hét egységet, tíz és még három marad." },
  { prompt: "Mennyi 16 + 14?", options: ["28", "29", "30", "31"], correctIndex: 2, subject: "math", explanation: "16 + 14 = 30, mert 10 + 10 = 20, a maradék 6 + 4 = 10; összesen 30." },
  { prompt: "Mennyi 3 × 6?", options: ["15", "18", "21", "24"], correctIndex: 1, subject: "math", explanation: "3 × 6 = 18, mert háromszor hatot veszünk: 6 + 6 + 6 = 18." },
  { prompt: "Mennyi 5 × 7?", options: ["30", "35", "40", "45"], correctIndex: 1, subject: "math", explanation: "5 × 7 = 35, mert ötször hetet veszünk: 7 + 7 + 7 + 7 + 7 = 35." },
  { prompt: "Mennyi 6 × 8?", options: ["42", "46", "48", "54"], correctIndex: 2, subject: "math", explanation: "6 × 8 = 48, mert hatszor nyolc: 8 + 8 + 8 + 8 + 8 + 8 = 48." },
  { prompt: "Mennyi 56 ÷ 7?", options: ["6", "7", "8", "9"], correctIndex: 2, subject: "math", explanation: "56 ÷ 7 = 8, mert 7 × 8 = 56. Osztáskor azt keressük, hányszor van meg a 7 az 56-ban." },
  { prompt: "Mennyi 72 ÷ 9?", options: ["6", "7", "8", "9"], correctIndex: 2, subject: "math", explanation: "72 ÷ 9 = 8, mert 9 × 8 = 72. Az osztást szorzással lehet ellenőrizni." },
  { prompt: "Mennyi 36 ÷ 6?", options: ["4", "5", "6", "7"], correctIndex: 2, subject: "math", explanation: "36 ÷ 6 = 6, mert 6 × 6 = 36. Hat egyenlő részre osztva minden részbe 6 jut." },
  { prompt: "Hány dm van 1 méterben?", options: ["5", "10", "100", "1000"], correctIndex: 1, subject: "math", explanation: "1 méter 10 deciméter, mert a deciméter a méter tizedrésze: 1 dm = 0,1 m." },
  { prompt: "Hány mm van 1 cm-ben?", options: ["5", "10", "100", "1000"], correctIndex: 1, subject: "math", explanation: "1 centiméter 10 milliméter. A milliméter kisebb mértékegység: 1 mm a centiméter tizede." },
  { prompt: "Hány dkg van 1 kg-ban?", options: ["10", "100", "1000", "10000"], correctIndex: 1, subject: "math", explanation: "1 kilogramm 100 dekagramm, mert 1 dkg = 10 g, míg 1 kg = 1000 g; 1000 ÷ 10 = 100." },
  { prompt: "Hány dl van 1 literben?", options: ["5", "10", "100", "1000"], correctIndex: 1, subject: "math", explanation: "1 liter 10 deciliter, mert a deciliter a liter tizedrésze: 1 dl = 0,1 l." },
  { prompt: "Hány másodperc van 1 percben?", options: ["30", "45", "60", "100"], correctIndex: 2, subject: "math", explanation: "Egy perc 60 másodpercből áll. Az időmérésben ez alapvető váltószám: 60 s = 1 perc." },
  { prompt: "Hány óra van egy napon?", options: ["12", "18", "24", "48"], correctIndex: 2, subject: "math", explanation: "Egy naptári nap 24 óra: az éjféltől délig tartó 12 óra és a déltől éjfélig tartó 12 óra együtt 24. A világos és sötét időszak hossza évszakonként változik." },
  { prompt: "Mennyi a 100 fele?", options: ["25", "50", "75", "150"], correctIndex: 1, subject: "math", explanation: "100 fele 50, mert a felezés osztást jelent: 100 ÷ 2 = 50." },
  { prompt: "Mennyi a 50 kétszerese?", options: ["75", "100", "150", "200"], correctIndex: 1, subject: "math", explanation: "50 kétszerese 100, mert a kétszerezés azt jelenti, hogy kettővel szorzunk: 50 × 2 = 100." },
  { prompt: "Melyik a legnagyobb?", options: ["25", "52", "125", "99"], correctIndex: 2, subject: "math", explanation: "A felsorolt számok közül a 125 a legnagyobb, mert háromjegyű, míg a többi csak egy- vagy kétjegyű." },
  { prompt: "Melyik a legkisebb?", options: ["18", "81", "8", "28"], correctIndex: 2, subject: "math", explanation: "A felsorolt számok közül a 8 a legkisebb. Egyjegyű szám, és kisebb minden megadott kétjegyű számnál." },
  { prompt: "Ha egy dobozban 6 ceruza van, hány ceruza van 4 dobozban?", options: ["20", "22", "24", "26"], correctIndex: 2, subject: "math", explanation: "Négy doboz tartalma: 4 × 6 = 24, mert minden dobozban ugyanannyi ceruza van." },
  { prompt: "Ha 24 almát 4 embernek egyenlően osztunk, mennyi jut egynek?", options: ["4", "5", "6", "8"], correctIndex: 2, subject: "math", explanation: "Az egyenlő elosztást osztással számoljuk: 24 ÷ 4 = 6 alma jut egy embernek." },
  { prompt: "Ha 50-ből elveszek 15-öt, mennyi marad?", options: ["25", "30", "35", "40"], correctIndex: 2, subject: "math", explanation: "Az elvételt kivonással fejezzük ki: 50 − 15 = 35, tehát ennyi marad." },
  { prompt: "Mennyi 1000 - 250?", options: ["650", "750", "850", "950"], correctIndex: 1, subject: "math", explanation: "A kivonásnál 1000-ből 250-et veszünk el: 1000 − 250 = 750." },
  // ============================================================
  // === TOVÁBBI KÖRNYEZETISMERET (bővítés v2) =====================
  // ============================================================
  { prompt: "Mi a természetben élő szivacs?", options: ["növény", "kőzet", "vízi állat", "gáz"], correctIndex: 2, subject: "nature", explanation: "A szivacs egyszerű felépítésű, vízben élő állat; testén átáramoltatja és megszűri a vizet." },
  { prompt: "Mi a különbség a gomba és a növény között?", options: ["A gomba nem fotoszintetizál", "A gomba mindig piros", "A gomba nem él", "Nincs különbség"], correctIndex: 0, subject: "nature", explanation: "A gombák nem fotoszintetizálnak, ezért nem maguk készítik a tápanyagukat fény segítségével." },
  { prompt: "Melyik az ember leghosszabb csontja?", options: ["ujj", "combcsont", "fül", "orr"], correctIndex: 1, subject: "nature", explanation: "A combcsont a combban található hosszú csont, amely a csípő és a térd között helyezkedik el." },
  { prompt: "Melyik szervvel lélegzünk?", options: ["máj", "tüdő", "gyomor", "vese"], correctIndex: 1, subject: "nature", explanation: "A tüdő a légzés szerve: itt jut az oxigén a vérbe, és innen távozik a szén-dioxid." },
  { prompt: "Melyik szervvel pumpál vért a tested?", options: ["agy", "tüdő", "szív", "máj"], correctIndex: 2, subject: "nature", explanation: "A szív izmos szerv, amely összehúzódásaival folyamatosan keringeti a vért a testben." },
  { prompt: "Milyen színű a vér a testedben?", options: ["kék", "piros", "zöld", "fekete"], correctIndex: 1, subject: "nature", explanation: "A vér vörös a hemoglobin nevű festékanyag miatt; oxigénszegényen sötétebb vörösnek látszik." },
  { prompt: "Hány foga van egy felnőtt embernek (bölcsességfog nélkül)?", options: ["20", "28", "32", "40"], correctIndex: 1, subject: "nature", explanation: "Bölcsességfogak nélkül egy felnőttnek általában 28 foga van: felül 14, alul 14." },
  { prompt: "Mit termel a növény nappal?", options: ["szén-dioxidot", "oxigént", "füstöt", "vizet"], correctIndex: 1, subject: "nature", explanation: "Nappal a növények fotoszintézissel oxigént bocsátanak ki, miközben fény segítségével tápanyagot készítenek." },
  { prompt: "Hol van a szív a testedben?", options: ["lábban", "fejben", "a mellkasban, kissé balra", "a has jobb oldalán"], correctIndex: 2, subject: "nature", explanation: "A szív a mellkasban, a két tüdő között található, és kissé a test bal oldala felé helyezkedik el." },
  { prompt: "Melyik a legnagyobb óceán?", options: ["Atlanti", "Indiai", "Csendes (Pacific)", "Jégtenger"], correctIndex: 2, subject: "nature", explanation: "A Csendes-óceán a Föld legnagyobb és legmélyebb óceánja, Ázsia és Amerika között terül el." },
  { prompt: "Milyen bolygó a Mars?", options: ["gázóriás", "kőzetbolygó", "hold", "csillag"], correctIndex: 1, subject: "nature", explanation: "A Mars kőzetbolygó: szilárd felszíne van, nem főként gázokból áll, mint a gázóriások." },
  { prompt: "Melyik a leggyorsabb szárazföldi állat?", options: ["csiga", "teknős", "gepárd", "ló"], correctIndex: 2, subject: "nature", explanation: "A gepárd a leggyorsabb szárazföldi állat, rövid távon akár 100 km/h fölötti sebességet is elérhet." },
  { prompt: "Melyik állat szúr?", options: ["teve", "szarvas", "szúnyog", "nyuszi"], correctIndex: 2, subject: "nature", explanation: "A szúnyog szájszervével szúrja át a bőrt, hogy vért szívjon; a nőstényeknek erre petéik fejlődéséhez van szükségük." },
  { prompt: "Hány kontinens van a hétkontinenses felosztásban?", options: ["5", "6", "7", "8"], correctIndex: 2, subject: "nature", explanation: "Ebben a felosztásban 7 kontinens van: Európa, Ázsia, Afrika, Észak-Amerika, Dél-Amerika, Ausztrália és Antarktisz." },
  { prompt: "Mi a Szahara?", options: ["óceán", "sivatag", "folyó", "jégmező"], correctIndex: 1, subject: "nature", explanation: "A Szahara Észak-Afrikában fekvő, rendkívül nagy forró sivatag; nem óceán vagy folyó." },
  { prompt: "Mi Magyarország fővárosa?", options: ["Debrecen", "Szeged", "Pécs", "Budapest"], correctIndex: 3, subject: "nature", explanation: "Budapest Magyarország fővárosa, amelyet a Duna két partján fekvő városrészek alkotnak." },
  { prompt: "Hány napos a közönséges, nem szökőév?", options: ["300 nap", "365 nap", "400 nap", "500 nap"], correctIndex: 1, subject: "nature", explanation: "Egy közönséges év 365 napos; szökőévben 366 nap van, hogy a naptár kövesse a Föld keringését." },
  // ============================================================
  // === TOVÁBBI ANGOL MATEMATIKA (bővítés v2) =====================
  // ============================================================
  { prompt: "'Five plus six equals?' (5 + 6 = ?)", options: ["ten", "eleven", "twelve", "thirteen"], correctIndex: 1, subject: "english-math", explanation: "Összeadáskor a mennyiségeket egyesítjük: 5 + 6 = 11. English: Five plus six equals eleven. – Öt meg hat egyenlő tizenegy." },
  { prompt: "'Eight minus three equals?' (8 - 3 = ?)", options: ["four", "five", "six", "seven"], correctIndex: 1, subject: "english-math", explanation: "Kivonáskor elvesszük a második számot az elsőből: 8 − 3 = 5. English: Eight minus three equals five. – Nyolc mínusz három egyenlő öt." },
  { prompt: "'Nine times two equals?' (9 × 2 = ?)", options: ["sixteen", "eighteen", "twenty", "twenty-two"], correctIndex: 1, subject: "english-math", explanation: "A szorzás ismételt összeadás: 9 × 2 = 9 + 9 = 18. English: Nine times two equals eighteen. – Kilencszer kettő tizennyolc." },
  { prompt: "'Zero' magyarul:", options: ["egy", "nulla", "tíz", "száz"], correctIndex: 1, subject: "english-math", explanation: "A zero magyarul nulla, számjeggyel 0. Példa: Zero apples. = Nulla alma, vagyis egy alma sincs." },
  { prompt: "'Hundred' magyarul:", options: ["tíz", "száz", "ezer", "millió"], correctIndex: 1, subject: "english-math", explanation: "A hundred magyarul száz, vagyis 100. English: One hundred students are here. – Száz diák van itt." },
  { prompt: "'Thousand' magyarul:", options: ["száz", "ezer", "millió", "milliárd"], correctIndex: 1, subject: "english-math", explanation: "A thousand magyarul ezer, vagyis 1000. English: A thousand birds flew away. – Ezer madár elrepült." },
  { prompt: "'Line' magyarul mértanban:", options: ["pont", "egyenes", "görbe", "sík"], correctIndex: 1, subject: "english-math", explanation: "Mértanban a line magyarul egyenes: olyan vonal, amely mindkét irányban végtelen. English: Draw a line. – Rajzolj egy egyenest." },
  { prompt: "'Point' magyarul mértanban:", options: ["pont", "egyenes", "kör", "sík"], correctIndex: 0, subject: "english-math", explanation: "Mértanban a point magyarul pont, amelynek nincs hossza, szélessége vagy vastagsága. English: Mark a point. – Jelölj meg egy pontot." },
  { prompt: "'Angle' magyarul:", options: ["szög", "oldal", "csúcs", "lap"], correctIndex: 0, subject: "english-math", explanation: "Az angle magyarul szög. Két közös kezdőpontú félegyenes a síkot két szögtartományra bontja. Példa: a right angle = derékszög." },
  { prompt: "'Cube' magyarul mértanban:", options: ["gömb", "kocka", "kúp", "henger"], correctIndex: 1, subject: "english-math", explanation: "A cube mértani testként kocka. Példa: „The cube has six faces.” = „A kockának hat lapja van.”" },
  { prompt: "'Sphere' magyarul:", options: ["kocka", "gömb", "henger", "kúp"], correctIndex: 1, subject: "english-math", explanation: "A sphere magyarul gömb, amelynek minden felszíni pontja azonos távol van a középponttól. „The ball is a sphere.” = „A labda gömb.”" },
  { prompt: "'Cylinder' magyarul:", options: ["kocka", "gömb", "henger", "kúp"], correctIndex: 2, subject: "english-math", explanation: "A cylinder henger: két egybevágó körlapja és ívelt palástja van. „The can is a cylinder.” = „A doboz henger.”" },
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

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
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


function desiredCanvasCssSize(el: HTMLCanvasElement) {
  const parent = el.parentElement;
  const parentW = Math.max(1, Math.floor(parent?.clientWidth ?? 380));
  const height = Math.max(1, Math.floor(parent?.clientHeight ?? 300));
  return { width: parentW, height };
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
type BlockMaterial = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial | THREE.MeshPhongMaterial;

/**
 * `lite` (telefonos szint: low / medium — terv: docs/specs/2026-11-17-kockavadasz-telefon-gyors.md, 3/b, 3/d): a PBR helyett olcsó
 * Lambert-árnyalás ugyanazzal a textúrával és önvilágítással; a lomb átlátszatlan (a textúrája teljesen fedő), a víz Phong
 * (megmarad a csillanás). `lite === false` (high szint) a korábbi anyagokat adja, változatlanul.
 */
function makeBlockMaterials(lite = false) {
  const buildTex = (t: number, c = 0, r = 0) => gridToTexture(mcBlockPatternBuild(t, c, r));

  const stdMat = (
    tex: THREE.Texture,
    options: Partial<THREE.MeshStandardMaterialParameters> = {},
  ): BlockMaterial => {
    if (lite) {
      const m = new THREE.MeshLambertMaterial({ map: tex });
      if (options.emissive !== undefined) m.emissive.set(options.emissive);
      if (options.emissiveIntensity !== undefined) m.emissiveIntensity = options.emissiveIntensity;
      return m;
    }
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.92,
      metalness: 0.02,
      ...options,
    });
  };

  // GRASS — per-face textúra: top=fű, sides=fű+dirt, bottom=dirt.
  const grassTopTex = gridToTexture(buildGrassTopPattern());
  const grassSideTex = buildTex(GRASS);
  const dirtTex = gridToTexture(buildPureDirtPattern());
  const grassMaterials: BlockMaterial[] = [
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
  const logMaterials: BlockMaterial[] = [
    stdMat(logSideTex), stdMat(logSideTex),
    stdMat(logTopTex),  stdMat(logTopTex),
    stdMat(logSideTex), stdMat(logSideTex),
  ];

  const map = new Map<number, BlockMaterial | BlockMaterial[]>();
  map.set(GRASS, grassMaterials);
  map.set(LOG, logMaterials);
  map.set(DIRT, stdMat(dirtTex));
  map.set(STONE, stdMat(buildTex(STONE)));
  map.set(LEAVES, lite ? stdMat(buildTex(LEAVES)) : stdMat(buildTex(LEAVES), { transparent: true, opacity: 0.93, alphaTest: 0.05 }));
  map.set(COAL, stdMat(buildTex(COAL), { emissive: new THREE.Color("#111111"), emissiveIntensity: 0.20 }));
  map.set(IRON, stdMat(buildTex(IRON), { emissive: new THREE.Color("#8a4f24"), emissiveIntensity: 0.20 }));
  map.set(DIAMOND, stdMat(buildTex(DIAMOND), { emissive: new THREE.Color("#2dd4e8"), emissiveIntensity: 0.50 }));
  map.set(BEDROCK, stdMat(buildTex(BEDROCK)));
  map.set(CREEPER, stdMat(buildTex(CREEPER), { emissive: new THREE.Color("#145214"), emissiveIntensity: 0.32 }));
  map.set(SAND, stdMat(buildTex(SAND)));
  // Áttetsző, csillogó víz: alacsony érdesség → napfény-csillanás a felszínen.
  const waterTex = buildTex(WATER);
  waterTex.wrapS = THREE.RepeatWrapping;
  waterTex.wrapT = THREE.RepeatWrapping;
  map.set(
    WATER,
    lite
      ? new THREE.MeshPhongMaterial({ map: waterTex, transparent: true, opacity: 0.78, shininess: 90, specular: 0x8fb8d8 })
      : stdMat(waterTex, { transparent: true, opacity: 0.78, roughness: 0.15, metalness: 0.1 }),
  );
  map.set(ZOMBIE, stdMat(buildTex(ZOMBIE), { emissive: new THREE.Color("#1a3a1f"), emissiveIntensity: 0.28 }));
  map.set(SKELETON, stdMat(buildTex(SKELETON), { emissive: new THREE.Color("#7a7870"), emissiveIntensity: 0.18 }));
  map.set(SPIDER, stdMat(buildTex(SPIDER), { emissive: new THREE.Color("#3a0a06"), emissiveIntensity: 0.24 }));
  return map;
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

/**
 * S11 kétujjas vezérlés: érintéssel a körbenézés csak a vászon JOBB 60%-án indulhat (a bal 40% a joystick
 * hüvelykujjáé). `x` a vászonhoz relatív érintési pont, `width` a vászon szélessége.
 */
const LOOK_ZONE_START = 0.4;
function isLookZone(x: number, width: number): boolean {
  return width <= 0 || x >= width * LOOK_ZONE_START;
}

export default function BlockCraftQuiz() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // S11: a közös érintés-észlelés (any-pointer: coarse + maxTouchPoints) — érintős laptop is kap vezérlőt.
  const touchCapable = useTouchCapable();
  const haptics = useHaptics();
  const bestScore = useBestScore("block-craft-quiz");
  const [, navigate] = useLocation();

  // LS-4 (D3): the play-time coupon earned in a lesson, exactly as in BrainRot —
  // without a coupon this is inert and free play stays the default.
  const coupon = useCouponSession();

  const worldRef = useRef<VoxelWorld>(generateVoxelWorld(genCfgFor(LEVELS[0]!)));
  const playerRef = useRef<PlayerState>({
    x: WX / 2 + 0.5, y: WY, z: WZ / 2 + 0.5,
    vx: 0, vy: 0, vz: 0,
    yaw: Math.PI * 0.25, pitch: -0.15, onGround: false,
  });
  // First-person irányítás (Minecraft-séma): W/A/S/D + Space.
  const keysRef = useRef({ fwd: false, back: false, left: false, right: false, jump: false });
  /** Joystick-reakció (#49): az analóg tárcsa-érték (x jobbra, y előre; −1…1, a görbével). */
  const stickRef = useRef({ x: 0, y: 0 });
  // Joystick-reakció (#49): a bemenet → válasz mérő kampója (csak teszt-kampós buildben él). A sebesség a nézés
  // irányához mért oldal- (strafe) és előre-komponensre bontva.
  countRender("blockcraft-page");
  useEffect(
    () =>
      registerInputProbe("blockcraft", () => {
        const p = playerRef.current;
        const s = Math.sin(p.yaw);
        const c = Math.cos(p.yaw);
        return { x: p.x, z: p.z, yaw: p.yaw, strafe: p.vx * c - p.vz * s, fwd: -(p.vx * s + p.vz * c), inX: stickRef.current.x };
      }),
    [],
  );
  const lastTRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  // G1 JAVÍTÁS: a render-loop futásának egyetlen forrása. A step() a rekurzív
  // requestAnimationFrame előtt ezt ellenőrzi, így a loop megállítható ÉS
  // (a scene újraépítése nélkül) újraindítható — korábban a levelComplete/endRun
  // cancelAnimationFrame után soha nem indult újra.
  const runningRef = useRef(false);
  /** #58: a lefutott render-lépések száma (teszt-kampó `probe().frames`: méri, hogy a ciklus áll-e). */
  const frameCountRef = useRef(0);
  /** `?perf=1`: a lap React-renderjeinek futó számlálója (a mérőpanel „React-render / s” sora). */
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  /** A scene-effect által beállított render-lépés — a loop-vezérlő effect innen indítja újra. */
  const stepRef = useRef<((now: number) => void) | null>(null);
  const mineTargetRef = useRef<{ x: number; y: number; z: number; t: number } | null>(null);
  const streakRef = useRef(0);
  /** A crosshair alatt lévő blokk (a render-loop frissíti minden frame-ben). */
  const lookHitRef = useRef<VoxelHit | null>(null);
  /** Az aktív FP-kamera — mobil tap-raycast a koppintott pont felé. */
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  /** Sikeres bányászás után ide kerül a por-effekt helye — a visszatérő engine lejátssza. */
  const pendingBurstRef = useRef<{ x: number; y: number; z: number; t: number } | null>(null);
  /** E/F billentyű → aktuális mine/place akció (stale-closure-mentes híd). */
  const mineActionRef = useRef<() => void>(() => {});
  const placeActionRef = useRef<() => void>(() => {});
  const hotbarKeyRef = useRef<(slot: number) => void>(() => {});
  const inventoryRef = useRef<Partial<Record<number, number>>>({});
  const selTypeRef = useRef<number>(DIRT);
  const worldVersionRef = useRef(0);
  // Aktuális pálya konfigurációja — a render loop closure-ja ezen keresztül lát
  // mindig friss égszín / fény paramétereket; setState helyett ref, hogy a re-effect
  // ne ölje meg a renderert minden szintátmenetnél.
  const activeLevelRef = useRef<LevelConfig>(LEVELS[0]!);
  const adaptiveRef = useRef(createAdaptiveSession(4));
  // Spec 2026-09-29-palyak-szoletra-nyelvek (E szelet): 10 pálya évfolyamonként (3–12.); a futás pályája a startkor rögzül.
  const runLevelRef = useRef<number | null>(null);
  const levelClearedRef = useRef(false);
  const answerLockedRef = useRef(false);

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
  /** E24: a „Bányász” gomb / koppintás célpont nélkül magyar segítő üzenetet ad (nem néma). */
  const [mineHint, setMineHint] = useState(false);
  const [rareBlocks, setRareBlocks] = useState(0);
  // Achievement-toast queue: az "over" phase-be lépéskor töltődik fel.
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([]);
  // Multi-level state: aktuális szint indexe + szint-specifikus számlálók.
  const [levelIdx, setLevelIdx] = useState(0);
  const [levelBlocks, setLevelBlocks] = useState(0);
  const [levelRare, setLevelRare] = useState(0);
  /** Pálya-szintű gyémánt-számláló — az 5. pálya "legalább 1 gyémánt" céljához. */
  const [levelDiamonds, setLevelDiamonds] = useState(0);
  // D2/D3: run-level (cross-level) trackers that survive per-level resets.
  const bestStreakRef = useRef(0);      // highest streak reached during the whole run
  const totalDiamondsRef = useRef(0);   // total real DIAMOND tiles mined during the whole run
  const [levelStartXp, setLevelStartXp] = useState(0);
  const [gameWon, setGameWon] = useState(false);
  /** S11: szünet (a játékóra, a fizika és a render-ciklus áll; a kvíz-fázis megmarad). */
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  /** G-1: magyarázó kártya rossz válaszra. */
  const [feedback, setFeedback] = useState<FeedbackCard | null>(null);
  /** S11: a futás jó / összes válasza (az eredményképernyő csillagaihoz). */
  const answeredRef = useRef(0);
  const [correctInRun, setCorrectInRun] = useState(0);
  /** S11: a joystick futó húzásának megszakítása (szünet, kvíz, fókuszvesztés) — a VirtualJoystick resetSignal-ja. */
  const [joyReset, setJoyReset] = useState(0);
  const [bestResult, setBestResult] = useState<{ best: number; isNewBest: boolean } | null>(null);
  const bestSubmittedRef = useRef(false);
  /** S11: a vezérlés-tipp minden pálya elején néhány másodpercig látszik (utána a vászon tiszta). */
  const [showHint, setShowHint] = useState(false);
  /** A teszt-API a mindenkori kérdésválasztót hívja (a telepítő effekt csak egyszer fut). */
  const pickQuizRef = useRef<() => Quiz>(() => QUIZ_FALLBACK[0]!);

  useEffect(() => {
    return installGameTestApi({
      probe: () => {
        const band = adaptiveRef.current.band;
        return {
          level: runLevelRef.current,
          band,
          timeBudget: adaptiveTimeBudget(LEVELS[0]!.timeLimit, band),
          // S11 kétujjas mérés: a nézés iránya és az előre-mozgás jelzője (1 / 0 — a probe típusa szám / szöveg).
          yaw: playerRef.current.yaw,
          moveFwd: keysRef.current.fwd || stickRef.current.y > 0 ? 1 : 0,
          phase: phaseRef.current,
          paused: pausedRef.current ? 1 : 0,
          frames: frameCountRef.current,
        };
      },
      forceState: (patch) => {
        if (patch.phase === "menu" || patch.phase === "play" || patch.phase === "levelComplete" || patch.phase === "over") {
          setPhase(patch.phase);
        }
        // S11 (M9, M10): kvíz kiváltása blokk nélkül (a válasz nem bányász ki semmit).
        if (patch.phase === "quiz") {
          mineTargetRef.current = null;
          setQuiz(pickQuizRef.current());
          setPhase("quiz");
        }
        if (typeof patch.gameWon === "boolean") setGameWon(patch.gameWon);
        if (typeof patch.correctCount === "number") setSessionXp(Math.max(0, patch.correctCount) * 10);
      },
    });
  }, []);
  // Subject-breakdown: melyik tantárgyból hány jó választ adott.
  const [subjectStats, setSubjectStats] = useState<Record<QuizSubject, number>>({
    english: 0,
    "english-math": 0,
    math: 0,
    nature: 0,
    hungarian: 0,
    science: 0,
    history: 0,
  });
  const [timeLeft, setTimeLeft] = useState(LEVELS[0]!.timeLimit);
  const [achievement, setAchievement] = useState<string | null>(null);
  // Inventory (Minecraft-hotbar): kibányászott blokkok típusonként, lerakáshoz.
  const [inventory, setInventory] = useState<Partial<Record<number, number>>>({});
  const [selType, setSelType] = useState<number>(DIRT);
  /** Lebegő "+XP" jelzés a crosshair mellett sikeres bányászás után. */
  const [xpFloat, setXpFloat] = useState<{ amount: number; key: number } | null>(null);
  const scoreSubmittedRef = useRef(false);
  const phaseRef = useRef<Phase>("menu");
  // D1: ref-guard — a Three.js scene csak egyszer épül fel ugyanazon play-session-ban
  const sceneBuiltRef = useRef(false);
  // Dekoratív mozgás (felhő-sodródás, időjárás, víz-csillanás) a rendszer-beállítás szerint.
  const reducedMotion = useReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  // Keep refs in sync for the canvas loop / global key handlers (avoids stale closure)
  streakRef.current = streak;
  phaseRef.current = phase;
  reducedMotionRef.current = reducedMotion;
  inventoryRef.current = inventory;
  selTypeRef.current = selType;

  const hotbarTypes = useMemo(
    () => PLACEABLE_ORDER.filter((t) => (inventory[t] ?? 0) > 0),
    [inventory],
  );

  // Ha a kiválasztott típus elfogyott, ugorjunk az első elérhetőre.
  useEffect(() => {
    if (hotbarTypes.length > 0 && !hotbarTypes.includes(selType as (typeof PLACEABLE_ORDER)[number])) {
      setSelType(hotbarTypes[0]!);
    }
  }, [hotbarTypes, selType]);

  // S11: az elismerő felirat eltüntetése feliratonként — egy korábbi felirat időzítője nem törölheti a későbbit
  // (a régi, hívásonkénti setTimeout a 2,5 s-on belül érkező új feliratot is idő előtt eltüntette).
  useEffect(() => {
    if (!achievement) return;
    const id = window.setTimeout(() => setAchievement(null), 2500);
    return () => window.clearTimeout(id);
  }, [achievement]);

  // XP-felirat automatikus eltüntetése.
  useEffect(() => {
    if (!xpFloat) return;
    const id = window.setTimeout(() => setXpFloat(null), 1600);
    return () => window.clearTimeout(id);
  }, [xpFloat]);

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
  const levels = useGradeLevel("blockcraft", userGrade);
  const { items: materialItems } = useMaterialQuizzes(userGrade, undefined, coupon.lessonId);

  const bank = useMemo<Quiz[]>(() => {
    // 1) Tananyag-kvízek (AI-generált, az osztályod legutóbbi 3 anyagából).
    //    Topic → BlockCraft `subject` mapping (angol/matek/környezet/magyar).
    const fromMaterial: Quiz[] = materialItems
      .filter(isPlayableQuestion)
      .map((q) => {
        const subject = blockCraftSubjectFromTopic(q.topic);
        return {
          id: q.id,
          prompt: q.prompt,
          options: [...q.options],
          correctIndex: q.correctIndex,
        // T-1: a bankból jövő magyarázat, ha a lecke exportja hozta.
        explanation: q.explanation ?? undefined,
          subject,
          fromMaterial: true,
        };
      });
    // 2) Régi quiz-bank (block-craft-quiz gameId-vel mentett tételek)
    const remote: Quiz[] = (bankData?.items ?? [])
      .filter(isPlayableQuestion)
      .map((q) => ({
        id: q.id,
        prompt: q.prompt,
        options: [...q.options],
        correctIndex: q.correctIndex,
        // T-1: a bankból jövő magyarázat, ha a lecke exportja hozta.
        explanation: q.explanation ?? undefined,
        subject: "english" as QuizSubject,
      }));
    // 3) Statikus fallback (Minecraft-tematikus angol/matek/környezet/magyar)
    return coupon.active && fromMaterial.length ? fromMaterial : [...fromMaterial, ...remote, ...QUIZ_FALLBACK];
  }, [bankData, materialItems, coupon.active]);

  /**
   * Stratified pool: a kvízeket tantargy szerint csoportosítja és minden
   * körben (round) újrakeveri, hogy NE ismétlődjenek közel egymáshoz.
   * Round-robin stratégia: sorban angol → angol-matek → matek → környezet
   * → angol stb. Így egyenletes lesz a tananyag-elosztas.
   */
  const subjectOrder = useMemo<QuizSubject[]>(
    () => ["english", "english-math", "math", "nature", "hungarian"],
    [],
  );
  const subjectPoolsRef = useRef<Map<QuizSubject, Quiz[]>>(new Map());
  const subjectCursorsRef = useRef<Map<QuizSubject, number>>(new Map());
  const subjectRoundRef = useRef(0);
  const recentPromptsRef = useRef<string[]>([]);
  const RECENT_WINDOW = 16; // Ennyi kérdést nem ismétlünk vissza egymás után.
  /** Spec 2026-09-29: a futásban már feltett kérdések (azonosító + prompt) és a közös tárgy-körforgás. */
  const gradeSeenRef = useRef(createGradeQuizSeen());
  const gradeSubjectRoundRef = useRef(0);

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
  }, [rebuildSubjectPools, userGrade]);

  // S11: a pálya eleji vezérlés-tipp 6 s játékidő után eltűnik (kvíz / szünet alatt az időzítő nem fut).
  useEffect(() => {
    if (!showHint || phase !== "play" || paused || coupon.expired) return;
    const id = window.setTimeout(() => setShowHint(false), 6000);
    return () => window.clearTimeout(id);
  }, [showHint, phase, paused, coupon.expired]);

  // A játékóra csak játék közben jár: kvíz és szünet alatt áll (S11), és a lejárt kupon után is (#58: a lejárati
  // párbeszéd alatt a gyerek nem tud beavatkozni, a pálya ideje nem fogyhat tovább).
  useEffect(() => {
    if (coupon.expired) return;
    if (phase !== "play" || paused) return;
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
  }, [phase, paused, coupon.expired]);

  /**
   * S11 / A8 — központi szóbank (közös napló a hét játékkal). `null`, amíg tölt / ha a betöltés hibázott: akkor a
   * kézi bankok mennek változatlanul. A bekötés EGY helyen kapcsolható ki: itt (`enabled`).
   */
  const vocab = useVocabQuizSource("en", true);

  /**
   * Stratified + non-repeating quiz picker.
   * Stratégia:
   *  1. Round-robin subject kiválasztás (angol → angol-matek → matek → környezet)
   *  2. Adott subject sorrendbe szűrt pool-jából cursor-rel haladunk
   *  3. Ha a pool végére értünk, újrakeverjük és a cursor nullazódik
   *  4. Ha a választott kérdés szerepel a RECENT_WINDOW-ban, átugorjuk
   */
  const pickQuiz = useCallback((): Quiz => {
    answerLockedRef.current = false;
    // Spec 2026-09-29: 3–12. évfolyamon nem látott tananyag-kvíz → közös évfolyam-bank a közös
    // tárgyak körforgásával (üres tárgy kimarad) → a saját bank kiegészítésként (alább).
    const sharedGrade = gradeForGame(userGrade);
    const couponMaterialOnly = coupon.active && bank.some((q) => q.fromMaterial);
    const seen = gradeSeenRef.current;
    // A tananyag-kvíz elsőbbsége (terv 4.4): a nem látott lecke-kérdés a szóbank ÉS az évfolyam-bank előtt.
    const material = sharedGrade != null && !couponMaterialOnly ? pickUnseenMaterial(bank.filter((q) => q.fromMaterial), seen) : null;
    if (material) {
      markGradeQuizSeen(seen, material);
      return material;
    }
    /**
     * S11 / A8: angol kérdés-helyen a központi szóbank (a tananyag-ág UTÁN). A szóbankos kérdés a futás saját
     * `seen`-jébe is bekerül, így a meglévő tartalmi duplikátum-szűrő is látja.
     */
    const fromVocab = (): Quiz | null => {
      const vq = vocab?.next(vocabLevelForGrade(userGrade, adaptiveRef.current.band)) ?? null;
      if (!vq) return null;
      markGradeQuizSeen(seen, vq);
      return {
        id: vq.id,
        prompt: vq.prompt,
        options: [...vq.options],
        correctIndex: vq.correctIndex,
        explanation: vq.explanation,
        subject: "english",
      };
    };
    /** Kézi angol kérdés: a helyes válasza a közös naplóba, hogy a szóbank ne kérdezze vissza ugyanazt a szót. */
    const manualEnglish = (q: Quiz): Quiz => {
      if ((q.subject ?? "english") === "english" && !q.fromMaterial) vocab?.markExternal(q.options[q.correctIndex]!);
      return q;
    };
    if (sharedGrade != null && !couponMaterialOnly) {
      for (let i = 0; i < GRADE_SUBJECTS.length; i++) {
        const subject = GRADE_SUBJECTS[gradeSubjectRoundRef.current++ % GRADE_SUBJECTS.length]!;
        // A választott tétel MINDIG fogy, akkor is, ha a szóbank váltja ki (Brain Rot #424 review-lelet).
        const slot = pickBlockCraftGradeSlot({
          subject,
          pick: () => pickGradeQuiz({ grade: sharedGrade, band: adaptiveRef.current.band, subjects: [subject], seen }),
          seen,
          vocabNext: fromVocab,
        });
        if (!slot) continue;
        if (slot.kind === "vocab") return slot.quiz;
        const item = slot.item;
        return manualEnglish({
          id: item.id,
          prompt: item.prompt,
          options: [...item.options],
          correctIndex: item.correctIndex,
          explanation: item.explanation,
          subject: blockCraftSubjectFromGradeSubject(item.subject),
        });
      }
    }
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
          // S11 / A8: a saját bank angol helyén (nem tananyag) is a szóbank kérdez, ha van; különben a kézi tétel.
          if (subj === "english" && !candidate.fromMaterial && !couponMaterialOnly) {
            const vq = fromVocab();
            if (vq) return vq;
          }
          return manualEnglish(candidate);
        }
      }
      subjectCursorsRef.current.set(subj, cursor);
    }
    // Végső fallback — sose kellene idejutnunk.
    return manualEnglish(bank[Math.floor(Math.random() * bank.length)] ?? QUIZ_FALLBACK[0]!);
  }, [bank, rebuildSubjectPools, subjectOrder, userGrade, coupon.active, vocab]);
  pickQuizRef.current = pickQuiz;

  /** S11: minden mozgásjelző nullázása + a joystick futó húzásának és a körbenézésnek a megszakítása. */
  const touchLookRef = useRef<{ id: number; lastX: number; lastY: number; moved: number; look: boolean } | null>(null);
  const releaseMovement = useCallback(() => {
    const k = keysRef.current;
    k.fwd = false;
    k.back = false;
    k.left = false;
    k.right = false;
    k.jump = false;
    stickRef.current.x = 0;
    stickRef.current.y = 0;
    touchLookRef.current = null;
    setJoyReset((n) => n + 1);
  }, []);
  /** A játék saját pointer-lock elengedése (kvíz, szünet, kör vége) — ez NEM vált ki automatikus szünetet. */
  const selfUnlockRef = useRef(false);
  const releasePointerLock = useCallback(() => {
    if (typeof document === "undefined" || !document.pointerLockElement) return;
    selfUnlockRef.current = true;
    document.exitPointerLock?.();
  }, []);

  /** Bányász-kvíz indítása egy konkrét voxelre (a crosshair-cél). */
  const tryMineAt = useCallback(
    (x: number, y: number, z: number): boolean => {
      const t = vGet(worldRef.current, x, y, z);
      if (!vMineable(t)) return false;
      if (pausedRef.current) return false;
      const p = playerRef.current;
      p.vx = 0;
      p.vz = 0;
      // S11: a kvíz alatt áll a játék — a futó mozgás (joystick, billentyű) nem viszi tovább a játékost.
      releaseMovement();
      // Egérrel a kvíz válaszaihoz szabad kurzor kell (különben Esc-et kellene nyomni a kattintáshoz).
      releasePointerLock();
      haptics("tap");
      mineTargetRef.current = { x, y, z, t };
      setQuiz(pickQuiz());
      setPhase("quiz");
      return true;
    },
    [pickQuiz, haptics, releaseMovement],
  );

  /**
   * Egyetlen pálya elindítása: a totalXp/sessionXp NEM resetelődik (átvitt érték),
   * a level-specifikus számlálók viszont (blocks/rare/timeLeft) friss állapotból indulnak.
   */
  const beginLevel = useCallback((idx: number, options: { resetSession: boolean; carryXpFrom: number }) => {
    const cfg = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, idx))]!;
    activeLevelRef.current = cfg;
    worldRef.current = generateVoxelWorld(genCfgFor(cfg));
    worldVersionRef.current++;
    const spawn = findVoxelSpawn(worldRef.current);
    // E24: a kezdő nézés egy elérhető, bányászható blokkra mutat — a gyerek az első koppintásra kvízt kap.
    const startLook = pickStartLook(worldRef.current, spawn, Math.PI * 0.25, -0.15);
    playerRef.current = {
      x: spawn.x, y: spawn.y, z: spawn.z,
      vx: 0, vy: 0, vz: 0,
      yaw: startLook.yaw, pitch: startLook.pitch, onGround: false,
    };
    pendingBurstRef.current = null;
    lookHitRef.current = null;
    mineTargetRef.current = null;
    setInventory({});
    setXpFloat(null);
    setAchievement(null);
    // S11: egy előző futás / pálya függő kvíze, magyarázókártyája és szünete nem marad át.
    setQuiz(null);
    setFeedback(null);
    setRevealCorrectIdx(null);
    setWrongIdx(null);
    setPaused(false);
    setShowHint(true);
    releaseMovement();
    if (options.resetSession) {
      adaptiveRef.current.reset(userGrade ?? 4, runLevelRef.current);
      gradeSeenRef.current = createGradeQuizSeen();
      answeredRef.current = 0;
      setCorrectInRun(0);
      bestSubmittedRef.current = false;
      setBestResult(null);
      setSessionXp(0);
      setStreak(0);
      setRunSeconds(0);
      setBlocksMined(0);
      setRareBlocks(0);
      setSubjectStats({ english: 0, "english-math": 0, math: 0, nature: 0, hungarian: 0, science: 0, history: 0 });
    } else {
      // Új pálya kezdetén streak frissítés (kezdjük újra), de XP marad.
      setStreak(0);
    }
    setLevelBlocks(0);
    setLevelRare(0);
    setLevelDiamonds(0);
    setLevelStartXp(options.carryXpFrom);
    setTimeLeft(adaptiveTimeBudget(cfg.timeLimit, adaptiveRef.current.band));
    answerLockedRef.current = false;
    setPhase("play");
    lastTRef.current = null;
    // Minden pályán friss kérdés-sorrend.
    rebuildSubjectPools();
  }, [rebuildSubjectPools, userGrade, releaseMovement]);

  const startGame = useCallback(() => {
    runLevelRef.current = levels.level;
    levelClearedRef.current = false;
    scoreSubmittedRef.current = false;
    bestStreakRef.current = 0;     // D2: reset run-level best streak on new game
    totalDiamondsRef.current = 0; // D3: reset run-level diamond count on new game
    setLevelIdx(0);
    setGameWon(false);
    streakProtector.resetProtector();
    beginLevel(0, { resetSession: true, carryXpFrom: 0 });
  }, [beginLevel, streakProtector, levels.level]);

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
    runningRef.current = false; // G1: loop stop (újraindítás a phase-effectből)
    cancelAnimationFrame(rafRef.current);
    lookHitRef.current = null;
    // S11: a kör vége a szünet menüből is jöhet — a függő kvíz / kártya / szünet nem marad az eredmény alatt.
    mineTargetRef.current = null;
    setQuiz(null);
    setFeedback(null);
    setRevealCorrectIdx(null);
    setWrongIdx(null);
    setPaused(false);
    releaseMovement();
    releasePointerLock();
    setGameWon(false);
    setPhase("over");
  }, [releaseMovement]);

  /**
   * S11 — szünet: a játékóra, a fizika és a render-ciklus áll; a pointer lock elenged (az egér szabad a menühöz),
   * minden mozgásjelző és a joystick futó húzása nullázódik (visszatéréskor nem ragad be a vezérlés).
   */
  const pauseGame = useCallback(() => {
    const ph = phaseRef.current;
    if (ph !== "play" && ph !== "quiz") return;
    releaseMovement();
    releasePointerLock();
    setPaused(true);
  }, [releaseMovement]);

  const resumeGame = useCallback(() => {
    lastTRef.current = null; // dt-ugrás elkerülése a szünet után
    setPaused(false);
  }, []);
  /** A mount-szintű billentyű-kezelő hídjai (stale-closure-mentes). */
  const pauseActionRef = useRef(pauseGame);
  pauseActionRef.current = pauseGame;
  const releaseMovementRef = useRef(releaseMovement);
  releaseMovementRef.current = releaseMovement;

  // Globális billentyűzet (Minecraft-séma): WASD/nyilak + Space + E (bányász)
  // + F (lerakás) + 1-9 (hotbar) + egér-nézelődés pointer lock alatt.
  useEffect(() => {
    const setKey = (code: string, v: boolean): boolean => {
      const k = keysRef.current;
      switch (code) {
        case "KeyW": case "ArrowUp": k.fwd = v; return true;
        case "KeyS": case "ArrowDown": k.back = v; return true;
        case "KeyA": case "ArrowLeft": k.left = v; return true;
        case "KeyD": case "ArrowRight": k.right = v; return true;
        case "Space": k.jump = v; return true;
        default: return false;
      }
    };
    const kd = (e: KeyboardEvent) => {
      if (phaseRef.current !== "play" || pausedRef.current) return;
      if (e.code === "KeyP") {
        e.preventDefault();
        pauseActionRef.current();
        return;
      }
      if (setKey(e.code, true)) {
        e.preventDefault();
        return;
      }
      if (e.code === "KeyE") {
        e.preventDefault();
        mineActionRef.current();
      } else if (e.code === "KeyF") {
        e.preventDefault();
        placeActionRef.current();
      } else if (/^Digit[1-9]$/.test(e.code)) {
        hotbarKeyRef.current(parseInt(e.code.slice(5), 10) - 1);
      }
    };
    const ku = (e: KeyboardEvent) => {
      setKey(e.code, false);
    };
    const mm = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvasRef.current) return;
      if (pausedRef.current || phaseRef.current !== "play") return;
      const p = playerRef.current;
      p.yaw -= e.movementX * 0.0024;
      p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - e.movementY * 0.0022));
    };
    // D4: reset all movement flags on window blur (prevents stuck keys on tab/window switch).
    // S11: a joystick futó húzása és a körbenézés is megszakad (releaseMovement).
    const onBlur = () => {
      releaseMovementRef.current();
    };
    // S11: ha játék közben a böngésző elengedi a pointer lockot (Esc), a játék szünetre vált — a szünet menüből
    // folytatható (a kvíz megnyitásakor a lockot a játék maga engedi el, az nem szünet).
    let wasLocked = false;
    const onLockChange = () => {
      const locked = document.pointerLockElement === canvasRef.current;
      const byGame = selfUnlockRef.current;
      selfUnlockRef.current = false;
      if (wasLocked && !locked && !byGame && phaseRef.current === "play" && !pausedRef.current) pauseActionRef.current();
      wasLocked = locked;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", onBlur);
    document.addEventListener("mousemove", mm);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, []);

  /**
   * First-person voxel engine (Minecraft-klón):
   *  - InstancedMesh blokktípusonként, csak az exposed (látható) voxelek
   *  - kamera a játékos szeménél (1.62), YXZ Euler (yaw/pitch)
   *  - voxel-DDA raycast a crosshair-célhoz + sárga cél-keret
   *  - gravitáció + AABB ütközés sub-steppinggel (lásd stepPlayerPhysics)
   *  - időjárás-részecskék + sodródó felhők + bányász-por
   */
  // D1: scene mount-szintű effect — NEM phase-függő; phaseRef-et használja a render-loopban
  // G1 JAVÍTÁS: a korábbi `if (phaseRef.current !== "play") return;` guard mountkor
  // (phase === "menu") mindig kilépett, és az effect deps üres → a scene SOHA nem épült fel.
  // Most a canvas is végig a DOM-ban van, így mountkor felépíthető; a loop külön vezérelt.
  useEffect(() => {
    if (sceneBuiltRef.current) return;
    const canvas = canvasRef.current;
    // A "megépült" flag csak akkor áll be, ha tényleg van canvas — különben
    // egy hiányzó canvas véglegesen letiltaná a scene felépítését.
    if (!canvas) return;
    sceneBuiltRef.current = true;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    // Közös látvány: ACES tónus, sRGB, szint szerinti pixelarány-plafon és árnyék-térkép.
    const tier = detectLookTier();
    const budget = LOOK_BUDGET[tier];
    // Telefonos szint (low / medium): nincs árnyéktérkép (képpontonként 5 mintavétel volt), olcsó anyag, kisebb anizotrópia —
    // a kép mélységét sütött blokk-árnyék adja (lásd `rebuildWorld`). A high szint változatlan.
    const lite = tier !== "high";
    applyRendererLook(renderer, tier, { exposure: 1.0, shadows: !lite });
    const shadowsOn = renderer.shadowMap.enabled;
    // Az árnyék-térkép típusa (PCFShadowMap) a közös applyRendererLook-ból jön (S13 / E21).
    // A világ statikus (csak bányászáskor/lerakáskor változik) → az árnyék-térképet
    // csak újraépítéskor rajzoljuk újra, nem minden frame-ben.
    renderer.shadowMap.autoUpdate = false;

    const cfg0 = activeLevelRef.current;
    const scene = new THREE.Scene();
    const skyColor = new THREE.Color(cfg0.skyTint.day);
    scene.background = skyColor;
    const fog = new THREE.FogExp2(skyColor, cfg0.weather === "sandstorm" ? 0.035 : 0.022);
    scene.fog = fog;

    // Meleg, barátságos fénymérleg: égbolt-kék felülről, meleg föld-visszaverődés alulról,
    // plusz oldalról-felülről érkező napfény — a kocka oldalai így jól elkülönülnek.
    const hemi = new THREE.HemisphereLight(0xdcecff, 0x7a6848, 0.95);
    scene.add(hemi);
    // ≈45° magas nap, a kezdő nézési irányhoz képest elöl-oldalt → a fák és kockák
    // árnyéka jól láthatóan a játékos felé, a fűre vetül.
    const sunDir = new THREE.Vector3(0.06, 0.72, -0.7).normalize();
    const worldCenter = new THREE.Vector3(WX / 2, 4, WZ / 2);
    const sun = new THREE.DirectionalLight(0xfff0d2, 2.7);
    sun.position.copy(worldCenter).addScaledVector(sunDir, 60);
    sun.target.position.copy(worldCenter);
    scene.add(sun);
    scene.add(sun.target);
    if (shadowsOn) {
      // Szoros ortografikus árnyék-kamera a teljes WX×WZ világ fölött.
      sun.castShadow = true;
      sun.shadow.mapSize.set(budget.shadowMapSize, budget.shadowMapSize);
      const half = Math.hypot(WX, WZ) / 2 + 2;
      const sc = sun.shadow.camera;
      sc.left = -half;
      sc.right = half;
      sc.top = half;
      sc.bottom = -half;
      sc.near = 20;
      sc.far = 60 + half + WY;
      sc.updateProjectionMatrix();
      // Kockás világ: kis negatív bias + normál-irányú eltolás → nincs csíkos „acne”,
      // és a vetett árnyék nem válik le a kocka aljáról (peter-panning).
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = budget.shadowMapSize >= 2048 ? 0.035 : 0.06;
    }

    // Gradiens égbolt napkoronggal; a pálya égszínéből számolva (applyLevelLook).
    const sky = createGradientSky({
      top: skyColor,
      horizon: skyColor,
      sunDirection: sunDir,
      sunColor: "#fff1c9",
      sunSize: 0.016,
      radius: 120,
    });
    // Az égbolt NEM kap ACES-tónusleképezést: az kifakítaná a telített rajzfilm-kéket.
    sky.material.toneMapped = false;
    scene.add(sky);

    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 140);
    camera.rotation.order = "YXZ";
    cameraRef.current = camera;

    // Szikra-részecskék (bányászás + víz-csillanás) — egyetlen draw call.
    const sparkles = new SparkleField(scene, Math.round(260 * budget.particleScale) + 40);

    const bufferSize = new THREE.Vector2();
    let appliedW = 0;
    let appliedH = 0;
    // A felbontás alapértéke a szint dpr-plafonja (nem csökken). Képpontszám-plafon csak „könnyű grafika” módban van (gyenge
    // eszköz jelei — a Szökőár `isLowEnd` szabálya), a `?perf=1` panel pedig kézzel skálázhat (`perfScale`).
    const basePixelRatio = renderer.getPixelRatio();
    let perfScale = 1;
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const touchDevice = isTouchDeviceFrom(typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches, Math.min(window.screen?.width ?? 0, window.screen?.height ?? 0));
    const lightGraphics = lite && isLightGraphicsFrom({ tier, touchDevice, reducedMotion: reducedMotionRef.current, memoryGb: typeof deviceMemory === "number" ? deviceMemory : null });
    const syncSize = () => {
      const { width, height } = desiredCanvasCssSize(canvas);
      if (width === appliedW && height === appliedH) return;
      appliedW = width;
      appliedH = height;
      const ratio = pixelRatioForBudget(width, height, basePixelRatio * perfScale, lightGraphics ? LIGHT_GRAPHICS_MAX_PIXELS : null);
      if (ratio !== renderer.getPixelRatio()) renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      sparkles.setViewportHeight(renderer.getDrawingBufferSize(bufferSize).y, camera.fov);
    };
    syncSize();
    // A képkocka-hurok nem olvas elrendezést: a méretet a megfigyelő jelzésére számoljuk újra (forgatás, kihajtás, menü → játék).
    let sizeDirty = true;
    const markSizeDirty = () => {
      sizeDirty = true;
    };
    const sizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(markSizeDirty);
    if (sizeObserver && canvas.parentElement) sizeObserver.observe(canvas.parentElement);
    window.addEventListener("resize", markSizeDirty);

    const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
    const blockMaterials = makeBlockMaterials(lite);
    // Éles közeli pixelek (Nearest nagyítás), de a távoli kockák ne „zajosodjanak”:
    // mipmap + anizotróp szűrés kicsinyítéskor (a képpont-rajzolat olvasható marad).
    const maxAniso = tier === "low" ? 1 : Math.min(lite ? 2 : 8, renderer.capabilities.getMaxAnisotropy());
    const waterMats: BlockMaterial[] = [];
    const prepareMaterials = (set: Map<number, BlockMaterial | BlockMaterial[]>) => set.forEach((mat, t) => {
      for (const m of Array.isArray(mat) ? mat : [mat]) {
        if (m.map) {
          m.map.generateMipmaps = true;
          m.map.minFilter = THREE.NearestMipmapLinearFilter;
          m.map.anisotropy = maxAniso;
          m.map.needsUpdate = true;
        }
        if (t === WATER) {
          waterMats.push(m);
          continue;
        }
        // Olcsó „ambient occlusion”: a kocka oldallapjai alul enyhén sötétebbek,
        // a felső élük felé világosodnak → a kockák kiemelkednek, a textúra olvasható marad.
        m.onBeforeCompile = (shader) => {
          const decl = "#include <common>\nvarying vec3 vBcLocal;\nvarying vec3 vBcNormal;";
          shader.vertexShader = shader.vertexShader
            .replace("#include <common>", decl)
            .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBcLocal = position;\nvBcNormal = normal;");
          shader.fragmentShader = shader.fragmentShader.replace("#include <common>", decl).replace(
            "#include <map_fragment>",
            [
              "#include <map_fragment>",
              "float bcSide = 1.0 - abs(vBcNormal.y);",
              "float bcShade = mix(0.8, 1.04, smoothstep(-0.5, 0.45, vBcLocal.y));",
              "float bcUnder = vBcNormal.y < -0.5 ? 0.78 : 1.0;",
              "diffuseColor.rgb *= mix(1.0, bcShade, bcSide) * bcUnder;",
            ].join("\n"),
          );
        };
        m.customProgramCacheKey = () => "bc-block-ao";
      }
    });
    prepareMaterials(blockMaterials);
    // `?perf=1` „Anyag” kapcsoló: a másik anyagkészlet (telefonon PBR, high szinten Lambert) lustán épül.
    let altMaterials: Map<number, BlockMaterial | BlockMaterial[]> | null = null;
    let activeMaterials = blockMaterials;

    // --- Instanced voxel-renderelés (exposed-culling) ---
    let instMeshes: THREE.InstancedMesh[] = [];
    /** Szabad ég alatti vízfelszín-cellák (x, y, z hármasok) a csillanásokhoz. */
    const waterTops: number[] = [];
    const tmpMat = new THREE.Matrix4();
    const shadeColor = new THREE.Color();
    const rebuildWorld = () => {
      for (const m of instMeshes) {
        scene.remove(m);
        m.dispose();
      }
      instMeshes = [];
      waterTops.length = 0;
      const w = worldRef.current;
      // Sütött blokk-árnyék (árnyéktérkép nélkül): mi áll a nap felőli átlóban — tömör blokk, lomb vagy semmi.
      const occluderAt = (x: number, y: number, z: number): SunOccluder => {
        if (x < 0 || y < 0 || z < 0 || x >= WX || y >= WY || z >= WZ) return 0;
        const t = w[vIdx(x, y, z)]!;
        return t === AIR || t === WATER ? 0 : t === LEAVES ? 1 : 2;
      };
      const byType = new Map<number, number[]>();
      for (let y = 0; y < WY; y++) {
        for (let z = 0; z < WZ; z++) {
          for (let x = 0; x < WX; x++) {
            const t = w[vIdx(x, y, z)]!;
            if (t === AIR) continue;
            // Vízoszlopból csak a felszín látszik; szolidból csak az exposed.
            if (t === WATER) {
              if (vGet(w, x, y + 1, z) === WATER) continue;
            } else if (!isExposed(w, x, y, z)) {
              continue;
            }
            let arr = byType.get(t);
            if (!arr) {
              arr = [];
              byType.set(t, arr);
            }
            arr.push(x, y, z);
          }
        }
      }
      byType.forEach((coords, t) => {
        const mat = activeMaterials.get(t);
        if (!mat) return;
        const n = coords.length / 3;
        const mesh = new THREE.InstancedMesh(blockGeometry, mat as THREE.Material | THREE.Material[], n);
        for (let i = 0; i < n; i++) {
          tmpMat.makeTranslation(coords[i * 3]! + 0.5, coords[i * 3 + 1]! + 0.5, coords[i * 3 + 2]! + 0.5);
          mesh.setMatrixAt(i, tmpMat);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (!shadowsOn && t !== WATER) {
          for (let i = 0; i < n; i++) {
            const tint = SUN_SHADE_TINT[sunShadeAt(occluderAt, coords[i * 3]!, coords[i * 3 + 1]!, coords[i * 3 + 2]!, WY)]!;
            mesh.setColorAt(i, shadeColor.setRGB(tint[0], tint[1], tint[2]));
          }
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
        if (t === WATER || t === LEAVES) mesh.renderOrder = 1;
        if (shadowsOn) {
          // A víz fogad árnyékot, de nem vet (áttetsző felszín).
          mesh.castShadow = t !== WATER;
          mesh.receiveShadow = true;
        }
        if (t === WATER) {
          for (let i = 0; i < n; i++) {
            const wx = coords[i * 3]!;
            const wy = coords[i * 3 + 1]!;
            const wz = coords[i * 3 + 2]!;
            if (vGet(w, wx, wy + 1, wz) === AIR) waterTops.push(wx, wy + 1, wz);
          }
        }
        scene.add(mesh);
        instMeshes.push(mesh);
      });
      renderer.shadowMap.needsUpdate = true;
    };
    let builtVersion = -1;

    // --- `?perf=1`: eszközön belüli mérőpanel (terv: docs/specs/2026-11-17-kockavadasz-telefon.md, 6. szakasz) ---
    // A modul csak a paraméterrel töltődik be; nélküle a hurokban három `null`-ellenőrzés a többlet.
    let perfDisposed = false;
    const perfControls: PerfControls = {
      shadowsAvailable: shadowsOn,
      simpleLabel: lite ? ["Lambert", "PBR"] : ["PBR", "Lambert"],
      setShadows(on) {
        sun.castShadow = on;
        renderer.shadowMap.needsUpdate = true;
      },
      setResolution(scale) {
        perfScale = scale;
        appliedW = 0;
        syncSize();
      },
      setSimpleMaterials(on) {
        if (on && !altMaterials) {
          altMaterials = makeBlockMaterials(!lite);
          prepareMaterials(altMaterials);
        }
        activeMaterials = on && altMaterials ? altMaterials : blockMaterials;
        // Review #504 (vak, L5): a víz-animáció csak az aktív készlet vízanyagát lépteti (a lista nem halmozódik).
        waterMats.length = 0;
        const water = activeMaterials.get(WATER);
        if (water) waterMats.push(...(Array.isArray(water) ? water : [water]));
        builtVersion = -1;
      },
      setFog(on) {
        scene.fog = on ? fog : null;
      },
    };
    let perf: PerfOverlay | null = null;
    if (perfEnabledFrom(window.location.search) && canvas.parentElement) {
      const host = canvas.parentElement;
      import("@/game-engine/perf/perfOverlay").then(
        (mod) => {
          if (perfDisposed) return;
          perf = mod.createPerfOverlay({ renderer, host, tier, title: "Kockavadász", controls: perfControls, getReactRenders: () => renderCountRef.current,
            isRunning: () => runningRef.current,
            // A panel a pályajelző (a felső HUD utolsó sora) alá kerül.
            getTopInset: () => {
              const chip = host.parentElement?.querySelector('[data-testid="bc-level-chip"]') ?? document.querySelector('[data-testid="bc-level-chip"]');
              return chip ? chip.getBoundingClientRect().bottom - host.getBoundingClientRect().top + 6 : 4;
            },
          });
        },
        () => {
          // A mérőpanel nélkül a játék változatlanul fut.
        },
      );
    }

    // --- Cél-keret (sárga, pulzáló) a crosshair-blokkon ---
    const hlGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    const hlMat = new THREE.LineBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.95 });
    const highlight = new THREE.LineSegments(hlGeo, hlMat);
    highlight.visible = false;
    scene.add(highlight);

    // --- Bolyhos felhők: 3–5 dobozból álló csoportok, lágy árnyalással, lassan sodródnak ---
    const cloudGeo = new THREE.BoxGeometry(1, 1, 1);
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      emissive: 0xdde7f4,
      emissiveIntensity: 0.62,
      transparent: true,
      opacity: 0.95,
      fog: false,
    });
    const cloudRoot = new THREE.Group();
    scene.add(cloudRoot);
    const CLOUD_MARGIN = 34;
    const clouds: THREE.Group[] = [];
    const cloudCount = tier === "low" ? 8 : 13;
    for (let i = 0; i < cloudCount; i++) {
      const g = new THREE.Group();
      const baseW = 7 + Math.random() * 7;
      const baseD = 4.5 + Math.random() * 3.5;
      const base = new THREE.Mesh(cloudGeo, cloudMat);
      base.scale.set(baseW, 1.3, baseD);
      g.add(base);
      // Keskenyebb „has” alul → alulról nézve is lépcsős, puha forma.
      const belly = new THREE.Mesh(cloudGeo, cloudMat);
      belly.scale.set(baseW * 0.72, 0.7, baseD * 0.7);
      belly.position.set((Math.random() - 0.5) * baseW * 0.15, -0.95, (Math.random() - 0.5) * baseD * 0.15);
      g.add(belly);
      const puffs = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < puffs; k++) {
        const puff = new THREE.Mesh(cloudGeo, cloudMat);
        const pw = baseW * (0.3 + Math.random() * 0.3);
        const pd = baseD * (0.45 + Math.random() * 0.35);
        const ph = 1.1 + Math.random() * 1.1;
        puff.scale.set(pw, ph, pd);
        puff.position.set(
          (Math.random() - 0.5) * (baseW - pw) * 0.9,
          0.3 + ph * 0.5,
          (Math.random() - 0.5) * (baseD - pd) * 0.8,
        );
        g.add(puff);
      }
      g.position.set(
        -CLOUD_MARGIN + Math.random() * (WX + CLOUD_MARGIN * 2),
        WY + 10 + Math.random() * 6,
        -CLOUD_MARGIN + Math.random() * (WZ + CLOUD_MARGIN * 2),
      );
      cloudRoot.add(g);
      clouds.push(g);
    }

    // --- Időjárás-részecskék a játékos körül (a pálya időjárása szerint újraépül) ---
    const WEATHER_N = 340;
    let weatherKind: LevelWeather = "clear";
    let weatherPts: THREE.Points | null = null;
    let weatherGeo: THREE.BufferGeometry | null = null;
    let weatherMat: THREE.PointsMaterial | null = null;
    const clearWeather = () => {
      if (weatherPts) scene.remove(weatherPts);
      weatherGeo?.dispose();
      weatherMat?.dispose();
      weatherPts = null;
      weatherGeo = null;
      weatherMat = null;
    };
    const buildWeather = (kind: LevelWeather) => {
      clearWeather();
      weatherKind = kind;
      if (kind === "clear") return;
      weatherGeo = new THREE.BufferGeometry();
      const pos = new Float32Array(WEATHER_N * 3);
      const p0 = playerRef.current;
      for (let i = 0; i < WEATHER_N; i++) {
        pos[i * 3] = p0.x + (Math.random() - 0.5) * 28;
        pos[i * 3 + 1] = p0.y + Math.random() * 14;
        pos[i * 3 + 2] = p0.z + (Math.random() - 0.5) * 28;
      }
      weatherGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      weatherMat = new THREE.PointsMaterial({
        color: kind === "rain" ? 0x9ec7ff : kind === "snow" ? 0xffffff : 0xe7c878,
        size: kind === "snow" ? 0.13 : 0.08,
        transparent: true,
        opacity: kind === "sandstorm" ? 0.55 : 0.8,
        sizeAttenuation: true,
      });
      weatherPts = new THREE.Points(weatherGeo, weatherMat);
      scene.add(weatherPts);
    };

    // --- Pályánkénti hangulat: égbolt-gradiens, köd = horizont, felhő- és fényárnyalat ---
    const white = new THREE.Color(0xffffff);
    const hsl = { h: 0, s: 0, l: 0 };
    let lookLevel: LevelConfig | null = null;
    const applyLevelLook = (cfg: LevelConfig) => {
      lookLevel = cfg;
      const day = new THREE.Color(cfg.skyTint.day);
      day.getHSL(hsl);
      // Zenit: mélyebb, telítettebb; horizont: világos, párás.
      // Élénk rajzfilm-ég: a pálya árnyalatából telített, sötétebb zenit és világos,
      // de színes horizont (erdei pálya: ≈ #2f8cff → #bfe9ff).
      const warm = cfg.weather === "sandstorm";
      const top = new THREE.Color().setHSL(
        warm ? hsl.h : Math.min(0.64, hsl.h + 0.035),
        1,
        warm ? 0.62 : Math.max(0.42, hsl.l * 0.76),
      );
      const horizon = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s + 0.35), Math.min(0.88, hsl.l + 0.1));
      const u = sky.material.uniforms;
      (u.topColor.value as THREE.Color).copy(top);
      (u.horizonColor.value as THREE.Color).copy(horizon);
      (u.bottomColor.value as THREE.Color).copy(horizon).multiplyScalar(0.85);
      skyColor.copy(horizon);
      fog.color.copy(horizon);
      fog.density = cfg.weather === "sandstorm" ? 0.035 : 0.022;
      hemi.color.copy(horizon).lerp(white, 0.35);
      cloudMat.color.set(cfg.weather === "rain" ? 0xd9e0e8 : cfg.weather === "sandstorm" ? 0xf6e7c6 : 0xffffff);
      cloudMat.emissive.set(cfg.weather === "sandstorm" ? 0xe3d2ad : cfg.weather === "rain" ? 0xa9b3c2 : 0xdde7f4);
      sun.intensity = cfg.weather === "rain" ? 2.1 : 2.7;
      if (cfg.weather !== weatherKind || !weatherPts) buildWeather(cfg.weather);
    };
    applyLevelLook(cfg0);

    // --- Bányász-por burst-ök ---
    type Burst = {
      pts: THREE.Points;
      geo: THREE.BufferGeometry;
      mat: THREE.PointsMaterial;
      vel: Float32Array;
      life: number;
    };
    const bursts: Burst[] = [];
    const spawnBurst = (bx: number, by: number, bz: number, t: number) => {
      const N = 16;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(N * 3);
      const vel = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = bx + 0.5 + (Math.random() - 0.5) * 0.6;
        pos[i * 3 + 1] = by + 0.5 + (Math.random() - 0.5) * 0.6;
        pos[i * 3 + 2] = bz + 0.5 + (Math.random() - 0.5) * 0.6;
        vel[i * 3] = (Math.random() - 0.5) * 3.4;
        vel[i * 3 + 1] = 1.5 + Math.random() * 3.2;
        vel[i * 3 + 2] = (Math.random() - 0.5) * 3.4;
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: new THREE.Color(MC_PAL[t]?.main ?? "#ffffff"),
        size: 0.12,
        transparent: true,
        opacity: 1,
      });
      const pts = new THREE.Points(geo, mat);
      scene.add(pts);
      bursts.push({ pts, geo, mat, vel, life: 0.7 });
      // Csillogó szikrák a por mellé: a blokk világos árnyalatában, ritka ércnél arany-fehér extra.
      const center = new THREE.Vector3(bx + 0.5, by + 0.5, bz + 0.5);
      const calm = reducedMotionRef.current;
      const pal = MC_PAL[t];
      sparkles.emit(center, {
        count: Math.max(6, Math.round(26 * budget.particleScale * (calm ? 0.5 : 1))),
        color: pal?.light ?? "#ffffff",
        speed: calm ? 1.2 : 3.6,
        life: 0.85,
        gravity: calm ? 0 : 5,
        size: 0.13,
        spread: 0.7,
        direction: new THREE.Vector3(0, 1, 0),
        directionality: 0.35,
      });
      if (t === DIAMOND || t === IRON || t === COAL) {
        sparkles.emit(center, {
          count: Math.max(5, Math.round(16 * budget.particleScale)),
          color: t === DIAMOND ? "#b8f6ff" : "#ffe7a3",
          speed: calm ? 0.8 : 2.4,
          life: 1.1,
          size: 0.2,
          spread: 0.5,
        });
      }
    };

    const dirVec = new THREE.Vector3();
    const glintPos = new THREE.Vector3();
    let glintAcc = 0;
    let disposed = false;

    const step = (now: number) => {
      if (disposed) return;
      // G1: leállított loop → nem ütemezünk új frame-et (újraindítás a phase-effectből).
      if (!runningRef.current) return;
      frameCountRef.current += 1;
      rafRef.current = requestAnimationFrame(step);
      const last = lastTRef.current ?? now;
      const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
      // A hurok (újra)indulása (szünet / folytatás) a `lastTRef === null` — a panel ebből tudja, hogy a rés nem képkocka (L1).
      perf?.frameStart(now, lastTRef.current === null);
      // A hurok (újra)indulásának első képkockáján is mérünk: a vászon szülője ekkor válik láthatóvá.
      if (sizeDirty || !sizeObserver || lastTRef.current === null) {
        sizeDirty = false;
        syncSize();
      }
      lastTRef.current = now;

      // Új pálya → új égbolt/köd/időjárás (a scene egyszer épül, a pálya viszont váltakozik).
      if (lookLevel !== activeLevelRef.current) applyLevelLook(activeLevelRef.current);
      const calm = reducedMotionRef.current;
      // Világ-mesh frissítés bányászás/lerakás után
      if (builtVersion !== worldVersionRef.current) {
        rebuildWorld();
        builtVersion = worldVersionRef.current;
      }
      // Kvíz után visszatérve: por-effekt a kibányászott blokk helyén
      if (pendingBurstRef.current) {
        const b = pendingBurstRef.current;
        pendingBurstRef.current = null;
        spawnBurst(b.x, b.y, b.z, b.t);
      }

      // --- Mozgás (yaw-relatív WASD, mint a Minecraftban) ---
      // S11: kvíz alatt a játékos áll (a világ tovább rajzolódik, a fizika nem lép) — a kvíz alatt áll a játék.
      const p = playerRef.current;
      const k = keysRef.current;
      if (phaseRef.current === "play") {
        const sinY = Math.sin(p.yaw);
        const cosY = Math.cos(p.yaw);
        let mx = 0;
        let mz = 0;
        if (k.fwd) { mx -= sinY; mz -= cosY; }
        if (k.back) { mx += sinY; mz += cosY; }
        if (k.left) { mx -= cosY; mz += sinY; }
        if (k.right) { mx += cosY; mz -= sinY; }
        // Joystick-reakció (#49): a tárcsa analóg — a nagysága a sebesség (finom lépés kis kitérésnél).
        const st = stickRef.current;
        mx += st.x * cosY - st.y * sinY;
        mz += -st.x * sinY - st.y * cosY;
        const ml = Math.hypot(mx, mz);
        if (ml > 1) {
          mx /= ml;
          mz /= ml;
        }
        p.vx = mx * MOVE_SPEED_BPS;
        p.vz = mz * MOVE_SPEED_BPS;
        if (k.jump && p.onGround) {
          p.vy = JUMP_VELOCITY;
          p.onGround = false;
        }
        stepPlayerPhysics(worldRef.current, p, dt);
        // Biztonsági háló: ha bármi miatt a világ alá esne, vissza a spawnra.
        if (p.y < -4) {
          const s = findVoxelSpawn(worldRef.current);
          p.x = s.x; p.y = s.y; p.z = s.z;
          p.vx = 0; p.vy = 0; p.vz = 0;
        }
      }

      // --- Kamera a szemnél ---
      camera.position.set(p.x, p.y + PLAYER_EYE, p.z);
      camera.rotation.y = p.yaw;
      camera.rotation.x = p.pitch;

      // --- Crosshair-cél raycast (DDA a voxel-rácson) ---
      camera.getWorldDirection(dirVec);
      const hit = raycastVoxel(
        worldRef.current,
        camera.position.x, camera.position.y, camera.position.z,
        dirVec.x, dirVec.y, dirVec.z,
        4.6,
      );
      lookHitRef.current = hit;
      if (hit && vMineable(hit.t)) {
        highlight.visible = true;
        highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
        const pulse = calm ? 1 : 1 + Math.sin(now / 160) * 0.012;
        highlight.scale.setScalar(pulse);
      } else {
        highlight.visible = false;
      }

      // Az égbolt-kupola a kamerával mozog (mindig a vágósíkon belül marad).
      sky.position.copy(camera.position);

      // --- Felhők sodródása, víz-áramlás és csillanás (reduced motion alatt áll) ---
      if (!calm) {
        for (const c of clouds) {
          c.position.x += dt * 0.7;
          if (c.position.x > WX + CLOUD_MARGIN) c.position.x = -CLOUD_MARGIN;
        }
        for (const m of waterMats) {
          if (m.map) m.map.offset.x = (m.map.offset.x + dt * 0.035) % 1;
        }
        glintAcc += dt * 7 * budget.particleScale;
        while (glintAcc >= 1 && waterTops.length > 0) {
          glintAcc -= 1;
          const i = Math.floor(Math.random() * (waterTops.length / 3)) * 3;
          const gx = waterTops[i]! + 0.15 + Math.random() * 0.7;
          const gz = waterTops[i + 2]! + 0.15 + Math.random() * 0.7;
          if (Math.hypot(gx - p.x, gz - p.z) > 24) continue;
          glintPos.set(gx, waterTops[i + 1]! + 0.02, gz);
          sparkles.emit(glintPos, { count: 1, color: "#f4fbff", speed: 0.12, life: 0.7, size: 0.16 });
        }
        if (waterTops.length === 0) glintAcc = 0;
      }
      sparkles.update(dt);

      // --- Időjárás ---
      if (weatherPts && weatherGeo && !calm) {
        const attr = weatherGeo.getAttribute("position") as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        const fallSpeed = weatherKind === "rain" ? 13 : weatherKind === "snow" ? 2.4 : 5;
        const driftX = weatherKind === "sandstorm" ? 9 : weatherKind === "snow" ? 0.5 : 0;
        for (let i = 0; i < WEATHER_N; i++) {
          arr[i * 3] += driftX * dt + (weatherKind === "snow" ? Math.sin(now / 700 + i) * dt : 0);
          arr[i * 3 + 1] -= fallSpeed * dt;
          if (arr[i * 3 + 1]! < p.y - 4 || Math.abs(arr[i * 3]! - p.x) > 16) {
            arr[i * 3] = p.x + (Math.random() - 0.5) * 28;
            arr[i * 3 + 1] = p.y + 7 + Math.random() * 8;
            arr[i * 3 + 2] = p.z + (Math.random() - 0.5) * 28;
          }
        }
        attr.needsUpdate = true;
      }

      // --- Por-burst-ök ---
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i]!;
        b.life -= dt;
        if (b.life <= 0) {
          scene.remove(b.pts);
          b.geo.dispose();
          b.mat.dispose();
          bursts.splice(i, 1);
          continue;
        }
        const attr = b.geo.getAttribute("position") as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        for (let j = 0; j < arr.length / 3; j++) {
          b.vel[j * 3 + 1]! -= 14 * dt;
          arr[j * 3] += b.vel[j * 3]! * dt;
          arr[j * 3 + 1] += b.vel[j * 3 + 1]! * dt;
          arr[j * 3 + 2] += b.vel[j * 3 + 2]! * dt;
        }
        attr.needsUpdate = true;
        b.mat.opacity = Math.min(1, b.life / 0.35);
      }

      perf?.beforeRender();
      renderer.render(scene, camera);
      perf?.afterRender();
    };
    lastTRef.current = null;
    // G1: a loop indítását/leállítását a phase-vezérelt effect végzi (lentebb).
    stepRef.current = step;
    if (runningRef.current) rafRef.current = requestAnimationFrame(step);

    return () => {
      disposed = true;
      perfDisposed = true;
      perf?.dispose();
      perf = null;
      sizeObserver?.disconnect();
      window.removeEventListener("resize", markSizeDirty);
      altMaterials?.forEach((mat) => {
        for (const m of Array.isArray(mat) ? mat : [mat]) {
          m.map?.dispose();
          m.dispose();
        }
      });
      runningRef.current = false;
      stepRef.current = null;
      cancelAnimationFrame(rafRef.current);
      cameraRef.current = null;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      for (const m of instMeshes) {
        scene.remove(m);
        m.dispose();
      }
      for (const b of bursts) {
        scene.remove(b.pts);
        b.geo.dispose();
        b.mat.dispose();
      }
      clearWeather();
      scene.remove(cloudRoot);
      disposeObjectTree(cloudRoot);
      scene.remove(sky);
      disposeObjectTree(sky);
      sparkles.dispose();
      scene.remove(sun.target);
      sun.dispose();
      hlGeo.dispose();
      hlMat.dispose();
      blockGeometry.dispose();
      blockMaterials.forEach((mat) => {
        const list = Array.isArray(mat) ? mat : [mat];
        for (const m of list) {
          m.map?.dispose();
          m.dispose();
        }
      });
      renderer.dispose();
      sceneBuiltRef.current = false; // D1: reset on cleanup
    };
  }, []); // D1: mount-szintű — phase-változásra NEM épül újra a scene

  /**
   * G1: render-loop vezérlés. A scene egyszer épül fel (fenti effect), a loop
   * viszont a phase szerint indul/áll — így új kör, következő pálya és kvíz után
   * is újraindul, míg levelComplete/over/menu alatt nem pörgeti a GPU-t.
   */
  useEffect(() => {
    // S11: szünetben a render-ciklus is áll (gyenge eszközön akkut is kímél).
    // #58: a lejárt kupon után is — a lejárati párbeszéd alatt a voxel-jelenet nem renderelhet tovább (a vászon az utolsó
    // képkockát mutatja). Szoftveres WebGL-en a futó ciklus minden bemenetet egy ~0,2–0,7 s-os képkockára várakoztatott.
    const shouldRun = (phase === "play" || phase === "quiz") && !paused;
    if (!shouldRun || coupon.expired) {
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
      return;
    }
    if (runningRef.current || !stepRef.current) return;
    runningRef.current = true;
    lastTRef.current = null; // dt-ugrás elkerülése a szünet után
    rafRef.current = requestAnimationFrame(stepRef.current);
  }, [phase, paused, coupon.expired]);

  // #58: lejáratkor a futó mozgás és a pointer lock elengedése a JÁTÉK kezdeményezésére (selfUnlock) — így a böngésző
  // Esc-es lock-elengedése nem nyit szünet menüt a lejárati párbeszéd alatt, és az egér szabadon eléri a gombot.
  useEffect(() => {
    if (!coupon.expired) return;
    releaseMovement();
    releasePointerLock();
  }, [coupon.expired, releaseMovement, releasePointerLock]);

  const dismissFeedback = useCallback(() => {
    setFeedback(null);
    setRevealCorrectIdx(null);
    setWrongIdx(null);
    setQuiz(pickQuiz());
    answerLockedRef.current = false;
  }, [pickQuiz]);

  const onAnswer = (idx: number) => {
    if (!quiz || phase !== "quiz" || paused || answerLockedRef.current || revealCorrectIdx !== null) return;
    answerLockedRef.current = true;
    answeredRef.current += 1;
    const previousBudget = adaptiveTimeBudget(activeLevelRef.current.timeLimit, adaptiveRef.current.band);
    adaptiveRef.current.answer(idx === quiz.correctIndex);
    const nextBudget = adaptiveTimeBudget(activeLevelRef.current.timeLimit, adaptiveRef.current.band);
    setTimeLeft(t => Math.max(1, Math.min(nextBudget, t + nextBudget - previousBudget)));
    maybeClaimCouponBonus(coupon, quiz.id, idx);
    if (idx !== quiz.correctIndex) {
      sfxError();
      haptics("error");
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
      // G-1: a másfél másodperces felfedés megmutatta, MELYIK a jó válasz, de azt
      // nem, hogy MIÉRT. A téves fogalom így érintetlenül maradt — pedig épp azt
      // kellene javítani. A kártya addig áll, amíg a gyerek be nem zárja.
      setFeedback(
        buildFeedback({
          quiz: {
            prompt: quiz.prompt,
            options: quiz.options,
            correctIndex: quiz.correctIndex,
            // A séma `null`-t is enged (régi sor); a motor `undefined`-ot vár.
            explanation: quiz.explanation ?? undefined,
          },
          chosenIndex: idx,
          attempt: 0,
          ageBand: "kid",
        }),
      );
      return;
    }

    sfxSuccess();
    haptics("success");
    setCorrectInRun((n) => n + 1);

    const tgt = mineTargetRef.current;
    let levelGoalReached = false;
    if (tgt) {
      vSet(worldRef.current, tgt.x, tgt.y, tgt.z, AIR);
      worldVersionRef.current++;
      pendingBurstRef.current = { x: tgt.x, y: tgt.y, z: tgt.z, t: tgt.t };
      // A kibányászott blokk a hotbar-ba kerül (mob nem gyűjthető — Minecraft-logika).
      if ((PLACEABLE_ORDER as readonly number[]).includes(tgt.t)) {
        const minedType = tgt.t;
        setInventory((inv) => ({ ...inv, [minedType]: (inv[minedType] ?? 0) + 1 }));
      }
      const isCreeper = tgt.t === CREEPER;
      const isMob = tgt.t === CREEPER || tgt.t === ZOMBIE || tgt.t === SKELETON || tgt.t === SPIDER;
      const isRare = tgt.t === COAL || tgt.t === IRON || tgt.t === DIAMOND || isMob;
      const baseXp = XP_BY_TILE[tgt.t] ?? 24;
      // Mob-ölés bónusz: minden mob 2× XP, de a base értékek már nehezebbek (CREEPER 280, ZOMBIE 320, SKELETON 380, SPIDER 260)
      const add = (isMob ? baseXp * 2 : baseXp) + streak * 4;
      const newBlocks = blocksMined + 1;
      const newLevelBlocks = levelBlocks + 1;
      const newLevelRare = levelRare + (isRare ? 1 : 0);
      const isDiamond = tgt.t === DIAMOND;
      const newLevelDiamonds = levelDiamonds + (isDiamond ? 1 : 0);
      const newStreak = streak + 1;
      // D2: track run-level best streak (does not reset between levels)
      if (newStreak > bestStreakRef.current) bestStreakRef.current = newStreak;
      // D3: track run-level real diamonds mined
      if (isDiamond) totalDiamondsRef.current += 1;
      setSessionXp((x) => x + add);
      setTotalXp((x) => x + add);
      setBlocksMined(newBlocks);
      if (isRare) setRareBlocks((n) => n + 1);
      setLevelBlocks(newLevelBlocks);
      setLevelRare(newLevelRare);
      if (isDiamond) setLevelDiamonds(newLevelDiamonds);
      setStreak(newStreak);
      const subj = quiz.subject ?? "english";
      setSubjectStats((prev) => ({ ...prev, [subj]: prev[subj] + 1 }));
      setXpFloat({ amount: add, key: Date.now() });

      // Pálya-cél ellenőrzés: blokkszám + ritkacél + opcionális gyémánt-cél
      // (az 5. pálya leírása "legalább 1 gyémánt"-ot ígér — most ténylegesen kötelező).
      const cfg = activeLevelRef.current;
      if (
        newLevelBlocks >= cfg.goalBlocks &&
        newLevelRare >= cfg.goalRareBlocks &&
        newLevelDiamonds >= (cfg.goalDiamonds ?? 0)
      ) {
        levelGoalReached = true;
      }

      if (tgt.t === DIAMOND && rareBlocks === 0) {
        setAchievement("Első gyémánt megtalálva!");
      } else if (newBlocks === 10) {
        setAchievement("10. blokk kibányászva!");
      } else if (newStreak === 5) {
        setAchievement("5-ös sorozat elérve!");
      } else if (isCreeper) {
        setAchievement("Creeper legyőzve! Dupla XP!");
      }
    }
    mineTargetRef.current = null;
    setQuiz(null);
    // FP-fizika: ha a lábunk alatti blokkot bányásztuk ki, a gravitáció
    // szabályosan leejt a gödörbe — ez a Minecraft-viselkedés, nincs "rescue".
    if (levelGoalReached) {
      sfxLevelUp();
      runningRef.current = false; // G1: loop stop (újraindítás a phase-effectből)
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
    void postGameScore({
      gameId: "block-craft-quiz",
      difficulty: "normal",
      runXp: sessionXp,
      runStreak: streak,
      runSeconds,
      runId: newScoreRunId(),
    })
      .then(() => void queryClient.invalidateQueries({ queryKey: ["/api/games/leaderboard"] }))
      .catch(() => {
        scoreSubmittedRef.current = false;
      });
  }, [phase, syncEligibility, sessionXp, streak, runSeconds]);

  /* S11 — legjobb eredmény: helyi mentés (névtelen látogatónál is működik), futásonként egyszer. */
  useEffect(() => {
    if (phase !== "over" || bestSubmittedRef.current) return;
    bestSubmittedRef.current = true;
    setBestResult(bestScore.submit(sessionXp));
  }, [phase, sessionXp, bestScore]);

  // Achievement + Daily Challenge tracking — az "over" phase átmenetnél egyszer fut.
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
    const wasDailyAvailable = isTodaysGameAvailable("block-craft-quiz");
    const newOnes = recordRun({
      game: "block-craft-quiz",
      xpGained: sessionXp,
      correctAnswers: blocksMined, // ≈ helyes válaszok = kibányászott blokkok
      wrongAnswers: 0,
      maxStreak: bestStreakRef.current, // D2: run-level best streak, not current
      blocksMined,
      diamondsMined: totalDiamondsRef.current, // D3: real diamonds, not rareBlocks/3 estimate
      perfect: streak >= blocksMined && blocksMined >= 5,
      fullClear: gameWon,
      highestLevel: levelIdx + 1,
    });
    if (wasDailyAvailable && gameWon) {
      const daily = markDailyCompleted();
      if (daily.achievements.length > 0) newOnes.push(...daily.achievements);
    }
    if (newOnes.length > 0) setNewlyUnlocked(newOnes);
    // Szándékosan csak `phase`-re iratkozunk fel — a recordRun egyszer fut "over"
    // átmenetenként, nem akarjuk, hogy minden state-mutáció (sessionXp, streak stb.)
    // újra triggerelje.
  }, [phase]);

  // A győzelem (mind az 5 bánya) a következő pályát oldja fel; a menü azt ajánlja.
  useEffect(() => {
    if (phase === "over" && gameWon && runLevelRef.current != null && !levelClearedRef.current) {
      levelClearedRef.current = true;
      levels.complete(runLevelRef.current);
    }
  }, [phase, gameWon]);

  /** Mobil irány-gombok: lenyomásra/felengedésre a keysRef-et írják. */
  const hold = (k: "fwd" | "back" | "left" | "right" | "jump", v: boolean) => {
    keysRef.current[k] = v;
  };

  /**
   * S11: esemény nélküli nyomva tartás — a capture-t és a böngésző-gesztusok tiltását a `HoldButton` végzi
   * (pointerdown-ra azonnal aktivál, pointerup / pointercancel enged el, pointerleave nincs).
   */
  const startHold = (k: "fwd" | "back" | "left" | "right" | "jump") => {
    if (pausedRef.current || phaseRef.current !== "play") return;
    hold(k, true);
  };

  const endHold = (k: "fwd" | "back" | "left" | "right" | "jump") => {
    hold(k, false);
  };

  /** Crosshair-célzott blokk bányászása (E / bal klikk / Bányász gomb / tap). */
  const tryMineLook = useCallback(() => {
    const hit = lookHitRef.current;
    if (!hit || !vMineable(hit.t)) {
      // E24: nem néma — a gyerek megtudja, mit tegyen (menjen közelebb / nézzen egy blokkra).
      if (!pausedRef.current && phaseRef.current === "play") {
        haptics("error");
        setMineHint(true);
      }
      return;
    }
    tryMineAt(hit.x, hit.y, hit.z);
  }, [tryMineAt, haptics]);

  useEffect(() => {
    if (!mineHint) return;
    const id = window.setTimeout(() => setMineHint(false), 3200);
    return () => window.clearTimeout(id);
  }, [mineHint]);

  /** Blokk-lerakás a célzott blokk megcélzott lapjára (F / jobb klikk / Lerak gomb). */
  const tryPlaceLook = useCallback(() => {
    const hit = lookHitRef.current;
    if (!hit) return;
    const t = selTypeRef.current;
    if ((inventoryRef.current[t] ?? 0) <= 0) return;
    const nx = hit.x + hit.nx;
    const ny = hit.y + hit.ny;
    const nz = hit.z + hit.nz;
    // Bedrock-szint (y=0) fölé és a világhatáron belülre rakhatunk.
    if (nx < 0 || ny < 1 || nz < 0 || nx >= WX || ny >= WY || nz >= WZ) return;
    const w = worldRef.current;
    const cur = vGet(w, nx, ny, nz);
    if (cur !== AIR && cur !== WATER) return;
    vSet(w, nx, ny, nz, t);
    // Minecraft-szabály: a saját testünkbe nem rakhatunk blokkot.
    const p = playerRef.current;
    if (collidesAt(w, p.x, p.y, p.z)) {
      vSet(w, nx, ny, nz, cur);
      return;
    }
    worldVersionRef.current++;
    setInventory((inv) => ({ ...inv, [t]: Math.max(0, (inv[t] ?? 0) - 1) }));
  }, []);

  // E/F billentyű hídjai (a globális keydown handler ref-en keresztül hív).
  mineActionRef.current = tryMineLook;
  placeActionRef.current = tryPlaceLook;
  hotbarKeyRef.current = (slot: number) => {
    const t = hotbarTypes[slot];
    if (t != null) setSelType(t);
  };

  /*
   * Mobil look-drag (a `touchLookRef` fent): egy ujjas húzás a vászon JOBB 60%-án = körbenézés. S11 kétujjas
   * vezérlés: a bal hüvelykujj a joystické (saját elem, saját pointerId + capture), a jobb a vászoné — a két
   * érintés külön pointerId-t követ, így egyszerre működnek. A vászon bal 40%-án induló érintés nem forgat
   * (ott a joystick-zóna van), de a rövid koppintás ott is bányászik.
   */
  const onCanvasPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (phase !== "play" || paused) return;
      e.preventDefault();
      const canvas = e.currentTarget;
      if (e.pointerType === "mouse") {
        // Desktop: első kattintás = pointer lock; lock alatt bal = bányász, jobb = lerak.
        if (document.pointerLockElement !== canvas) {
          canvas.requestPointerLock?.();
          return;
        }
        if (e.button === 2) tryPlaceLook();
        else tryMineLook();
        return;
      }
      // Egy már futó körbenéző ujj mellett a második vászon-érintés nem veszi át a nézést.
      if (touchLookRef.current) return;
      canvas.setPointerCapture?.(e.pointerId);
      const rect = canvas.getBoundingClientRect();
      const look = isLookZone(e.clientX - rect.left, rect.width);
      touchLookRef.current = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY, moved: 0, look };
    },
    [phase, paused, tryMineLook, tryPlaceLook],
  );

  const onCanvasPointerMove = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    const tl = touchLookRef.current;
    if (!tl || tl.id !== e.pointerId) return;
    const dx = e.clientX - tl.lastX;
    const dy = e.clientY - tl.lastY;
    tl.lastX = e.clientX;
    tl.lastY = e.clientY;
    tl.moved += Math.abs(dx) + Math.abs(dy);
    if (!tl.look || pausedRef.current || phaseRef.current !== "play") return;
    const p = playerRef.current;
    p.yaw -= dx * 0.006;
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - dy * 0.005));
  }, []);

  const onCanvasPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const tl = touchLookRef.current;
      if (!tl || tl.id !== e.pointerId) return;
      touchLookRef.current = null;
      if (tl.moved >= 12 || pausedRef.current || phaseRef.current !== "play") return;
      // Rövid tap = bányászás. A koppintott képernyőpont felé lövünk sugarat
      // (Minecraft mobil-viselkedés), fallback a crosshair-célra.
      const cam = cameraRef.current;
      const canvas = e.currentTarget;
      if (cam) {
        const rect = canvas.getBoundingClientRect();
        const ndcX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        const ndcY = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
        const dir = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(cam).sub(cam.position).normalize();
        const hit = raycastVoxel(
          worldRef.current,
          cam.position.x, cam.position.y, cam.position.z,
          dir.x, dir.y, dir.z,
          5.2,
        );
        if (hit && vMineable(hit.t)) {
          tryMineAt(hit.x, hit.y, hit.z);
          return;
        }
      }
      tryMineLook();
    },
    [tryMineAt, tryMineLook],
  );

  const onCanvasPointerCancel = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (touchLookRef.current?.id === e.pointerId) touchLookRef.current = null;
  }, []);

  // S11 — a keret állapota és a HUD adatai.
  const cfg = activeLevelRef.current;
  const timeBudget = adaptiveTimeBudget(cfg.timeLimit, adaptiveRef.current.band);
  const inRun = phase === "play" || phase === "quiz";
  const screenState: GameScreenState =
    phase === "menu" ? "start" : inRun ? (paused ? "paused" : "playing") : "result";
  const timeTone: "default" | "warn" | "bad" =
    timeLeft <= timeBudget * 0.15 ? "bad" : timeLeft <= timeBudget * 0.3 ? "warn" : "default";
  const hudStats: GameHudStat[] = [
    { id: "xp", label: "XP", value: sessionXp },
    { id: "streak", label: "Sorozat", value: `🔥 ${streak}`, tone: streak >= 5 ? "good" : "default" },
    {
      id: "blocks",
      label: "Blokk",
      value: `${levelBlocks}/${cfg.goalBlocks}`,
      tone: levelBlocks >= cfg.goalBlocks ? "good" : "default",
    },
    ...(cfg.goalRareBlocks > 0
      ? [{
          id: "ore",
          label: "Érc",
          value: `${levelRare}/${cfg.goalRareBlocks}`,
          tone: levelRare >= cfg.goalRareBlocks ? ("good" as const) : ("default" as const),
        }]
      : []),
    ...((cfg.goalDiamonds ?? 0) > 0
      ? [{
          id: "diamond",
          label: "Gyémánt",
          value: `💎 ${levelDiamonds}/${cfg.goalDiamonds}`,
          tone: levelDiamonds >= (cfg.goalDiamonds ?? 0) ? ("good" as const) : ("default" as const),
        }]
      : []),
  ];
  const isLastLevel = levelIdx >= LEVELS.length - 1;
  const totalAnswered = Math.max(answeredRef.current, correctInRun);
  const levelName = cfg.name.replace(/^\d+\.\s*/, "");
  const selCount = inventory[selType] ?? 0;

  return (
    <GameShell
      gameId="BlockCraftQuiz"
      state={screenState}
      onAutoPause={pauseGame}
      style={{ background: "radial-gradient(circle at 15% 15%, rgba(34,197,94,0.18), transparent 38%), radial-gradient(circle at 88% 8%, rgba(34,211,238,0.2), transparent 42%), linear-gradient(180deg, #0b1727 0%, #1b2f45 100%)" }}
    >
      <ClassroomGateModal accent="lime" />
      <AchievementToast achievements={newlyUnlocked} />
      <main
        className="relative z-10 w-full mx-auto min-h-dvh min-h-screen flex flex-col"
        // Játék közben a vászon kitölti a képernyőt (a HUD rajta lebeg); a biztonsági sávot a HUD, a vezérlősáv és az
        // alsó sáv saját eltolása tartja (S2 szerződés: csak a --game-safe-* változók).
        style={inRun ? { padding: 0, maxWidth: "none" } : undefined}
      >
        {/* LS-4: earned play time — renders nothing without a coupon. */}
        <CouponHud session={coupon} />
        <CouponExpiredOverlay session={coupon} />

        {phase === "menu" && (
          <StartScreen
            title="Kockavadász kvíz"
            subtitle="Bányássz a kockavilágban! Minden blokk előtt egy gyors kvíz — jó válaszra jár az XP."
            icon={<Pickaxe className="h-10 w-10" strokeWidth={2.4} aria-hidden="true" />}
            startLabel={`Indulhat a bányászat!${levels.level != null ? ` · ${levels.level}. pálya` : ""}`}
            startTestId="bc-start"
            onStart={startGame}
            best={bestScore.best}
            menuKey="blockcraft"
            secondary={
              <>
                <Link href="/games" className="game-btn game-btn-secondary">
                  <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                  Játékok
                </Link>
                <GamePedagogyPanel
                  accent="lime"
                  className="game-btn game-btn-secondary min-h-12 text-base text-center"
                  kidMission="Bányássz blokkokat egy kockavilágban! Minden blokk előtt rövid kvíz jön: angol szókincs, angol matek, magyar matek vagy környezetismeret. Csak helyes válaszra tűnik el a kő (és kapsz XP-et + sorozat-lángot). Időre is figyelj — a kör végén összesítjük a pontjaidat."
                  parentBody={
                    <>
                      <strong className="text-lime-100/90">Tananyag:</strong> 4 tárgy kvízformában — angol szókincs (tárgyak, helyzetek; a központi szóbankból, ismétlés nélkül), angol matek (vocabulary + műveletek), egyszerű magyar matek (1–4. oszt.) és környezetismeret (növény/állat/természet). A bányászat motivációt ad az ismétléshez.
                      <br />
                      <strong className="text-lime-100/90">Fejleszt:</strong> olvasásértés gyors döntés mellett, fejszámolás, idegen nyelvi gondolkozás, természettudományos összefüggés-látás, térbeli tájékozódás és kéz-szem koordináció (billentyű / érintés).
                      <br />
                      <span className="text-white/70">
                        Akadály (fizikai pálya) + teszt (kvíz) + jutalom (XP, blokk eltűnik) minden lépésnél összekapcsolva — erős, azonnali visszajelzés.
                      </span>
                    </>
                  }
                />
              </>
            }
            settings={
              <div className="flex flex-col gap-3">
                {levels.active && levels.level != null ? (
                  <GradeLevelPicker
                    value={levels.level}
                    unlocked={levels.unlocked}
                    onChange={levels.select}
                    label={`Nehézségi pálya — ${userGrade}. osztály`}
                  />
                ) : null}
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-lime-200 mb-1.5">5 bánya — az XP halmozódik</p>
                  <ul className="space-y-1 text-sm text-white/85">
                    {LEVELS.map((lv) => (
                      <li key={lv.id} className="flex items-center justify-between gap-2 border-b border-lime-900/30 last:border-b-0 pb-1 last:pb-0">
                        <span className="font-semibold text-lime-100/95">{lv.name}</span>
                        <span className="text-white/65 tabular-nums">
                          {lv.goalBlocks} blokk{lv.goalRareBlocks > 0 ? ` + ${lv.goalRareBlocks} érc` : ""} · {Math.floor(lv.timeLimit / 60)}:{String(lv.timeLimit % 60).padStart(2, "0")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-wrap gap-1.5" aria-hidden="true">
                  {[GRASS, DIRT, SAND, STONE, WATER, LOG, LEAVES, COAL, IRON, DIAMOND].map((t) => <MenuBlock key={t} t={t} />)}
                </div>
                <p className="text-sm text-white/80">
                  {touchCapable
                    ? "Bal hüvelykujj: mozgás (tárcsa) · jobb hüvelykujj: körbenézés húzással · koppintás a blokkra vagy Bányász gomb: kvíz."
                    : "WASD mozgás, Space ugrás, E bányász-kvíz, F lerakás, 1–9 blokkválasztás, P szünet."}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-white/80">Hang</span>
                  <AudioToggleButton showLabel className="h-12 min-w-12" />
                </div>
                <p className="text-sm text-lime-100/90 border border-lime-700/45 rounded-lg px-3 py-2 bg-slate-900/95">{syncBanner}</p>
              </div>
            }
          >
            <p className="text-sm text-lime-100/85 text-center">
              Összes XP ebben a munkamenetben: <strong className="text-amber-300">{totalXp}</strong>
            </p>
          </StartScreen>
        )}

        {/*
          G1: a canvas MINDIG a DOM-ban marad (más fázisokban csak elrejtjük),
          különben a mount-szintű Three.js effect nem találná meg a canvas-t,
          és a scene sosem épülne fel. (Ugyanaz a minta, mint SpaceAsteroidQuiz.)
          S11: játék közben a vászon teljes képernyős; a HUD és az érintővezérlő rajta lebeg.
        */}
        <div className={`bc-play relative flex flex-1 min-h-0 flex-col ${inRun ? "" : "hidden"}`}>
          <div className="game-scene relative flex-1 min-h-0 w-full overflow-hidden bg-black">
            <canvas
              ref={canvasRef}
              className="block touch-none w-full h-full max-w-full cursor-crosshair select-none"
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              onPointerCancel={onCanvasPointerCancel}
              onContextMenu={(e) => e.preventDefault()}
            />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,transparent_58%,rgba(0,0,0,0.28)_100%)]" />
            {/* Célkereszt (Minecraft-stílusú kereszt, sötét kontúrral minden háttéren látható) */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
              <span className="absolute left-1/2 top-1/2 h-6 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow-[0_0_0_1.5px_rgba(0,0,0,0.55)]" />
              <span className="absolute left-1/2 top-1/2 h-[3px] w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow-[0_0_0_1.5px_rgba(0,0,0,0.55)]" />
            </div>
            <AnimatePresence>
              {xpFloat && (
                <motion.div
                  key={xpFloat.key}
                  className="pointer-events-none absolute left-1/2 top-[40%] -translate-x-1/2 text-amber-300 font-black text-2xl drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]"
                  initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.7 }}
                  animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: -28, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.6, ease: "easeOut" }}
                >
                  +{xpFloat.amount} XP
                </motion.div>
              )}
            </AnimatePresence>

            {/* HUD a vászon tetején (S2 GameHud: idő, XP, sorozat, blokk-cél; 48 px-es szünet gomb). */}
            {inRun && (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col">
                <GameHud
                  stats={hudStats}
                  onPause={pauseGame}
                  progress={{ value: timeLeft, max: timeBudget, label: `${timeLeft} mp`, tone: timeTone }}
                />
                <div
                  className="mt-1.5 flex flex-wrap items-center gap-1.5"
                  style={{ paddingLeft: "max(8px, var(--game-safe-left))", paddingRight: "max(8px, var(--game-safe-right))" }}
                >
                  <span
                    className={`rounded-full border bg-slate-950/75 px-3 py-1 text-xs font-extrabold uppercase tracking-wide backdrop-blur-sm ${
                      cfg.isBossLevel ? "border-rose-400 text-rose-200" : "border-lime-300/45 text-lime-100"
                    }`}
                    data-testid="bc-level-chip"
                  >
                    {cfg.isBossLevel ? `★ Boss · ${levelName}` : `Pálya ${cfg.id}/${LEVELS.length} · ${levelName}`}
                    {cfg.weather !== "clear" && (
                      <span className="ml-1.5" title={cfg.weather}>
                        {cfg.weather === "rain" ? "🌧" : cfg.weather === "snow" ? "❄" : "🏜"}
                      </span>
                    )}
                  </span>
                  {mineHint && phase === "play" && !paused && (
                    <span
                      role="status"
                      data-testid="bc-mine-hint"
                      className="rounded-full border border-amber-300/60 bg-slate-950/85 px-3 py-1 text-xs font-bold text-amber-100 backdrop-blur-sm"
                    >
                      Nincs blokk a célkereszt alatt — menj közelebb, és nézz egy blokkra!
                    </span>
                  )}
                  {showHint && phase === "play" && (
                    <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-sm">
                      {touchCapable ? "Bal: mozgás · jobb: nézelődés · koppintás: bányászás" : "Kattints a vászonra · bal klikk: bányász · jobb: lerak"}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* === ÉRINTŐVEZÉRLŐ (csak érintős eszközön — egérnél a vászon kapja a helyet) === */}
            {touchCapable && inRun ? (
              <div
                className="game-touch-layer bc-touch-layer"
                data-game-controls
                data-testid="bc-touch-controls"
                style={{ touchAction: "none", userSelect: "none", WebkitTouchCallout: "none", WebkitTapHighlightColor: "transparent" }}
              >
                {/*
                 * Egységes köralakú vezérlés (spec 2026-09-20): a négy irány-gomb helyett ugyanaz a
                 * tárcsa, mint az Aszteroidában. S11: a sugár a képernyőhöz igazodik (radius="auto"), és
                 * a joystick a bal hüvelykujjé — a jobb hüvelykujj közben a vászon jobb részén néz körbe.
                 */}
                <VirtualJoystick
                  label="Mozgás"
                  radius="auto"
                  resetSignal={joyReset}
                  className="bc-joystick"
                  onChange={(v) => {
                    if (pausedRef.current || phaseRef.current !== "play") return;
                    // Joystick-reakció (#49): analóg, folytonos görbe — nem négy logikai gomb 0,35-ös küszöbbel.
                    const s = shapeJoystick(v);
                    stickRef.current.x = s.x;
                    stickRef.current.y = s.y;
                  }}
                />
                {/* Akciógombok ívben a jobb alsó sarokban: Ugrás a legnagyobb, mellette Bányász, fölötte Lerak. */}
                <div className="bc-actions" style={{ pointerEvents: "none" }}>
                  <button
                    type="button"
                    className="game-action-btn bc-act bc-act-place pointer-events-auto"
                    onClick={tryPlaceLook}
                    disabled={selCount <= 0}
                    aria-label={selCount > 0 ? `Lerak: ${BLOCK_NAME[selType] ?? "blokk"} (${selCount})` : "Lerak — előbb bányássz blokkot"}
                    style={{ touchAction: "none" }}
                  >
                    {selCount > 0 ? (
                      <span
                        className="h-6 w-6 rounded-md border-2 border-black/40 shadow-inner"
                        style={{ background: MC_PAL[selType]?.main ?? "#999" }}
                        aria-hidden="true"
                      />
                    ) : (
                      <Blocks className="h-6 w-6" aria-hidden="true" />
                    )}
                    <span className="bc-act-label" aria-hidden="true">Lerak</span>
                  </button>
                  <button
                    type="button"
                    className="game-action-btn bc-act bc-act-mine pointer-events-auto"
                    onClick={tryMineLook}
                    aria-label="Bányász"
                    style={{ touchAction: "none" }}
                  >
                    <Pickaxe className="h-7 w-7" aria-hidden="true" />
                    <span className="bc-act-label" aria-hidden="true">Bányász</span>
                  </button>
                  <HoldButton
                    size="auto"
                    label="Ugrás"
                    className="bc-act bc-act-jump pointer-events-auto"
                    onHoldStart={() => startHold("jump")}
                    onHoldEnd={() => endHold("jump")}
                  >
                    <ArrowBigUp className="h-8 w-8" aria-hidden="true" />
                    <span className="bc-act-label" aria-hidden="true">Ugrás</span>
                  </HoldButton>
                </div>
              </div>
            ) : null}
          </div>

          {/* === Alsó sáv: hotbar (kibányászott blokkok, lerakáshoz) + billentyű-tipp === */}
          {inRun && (
            <div
              className="bc-bottom flex shrink-0 flex-col gap-1 bg-slate-950/90 border-t border-lime-700/40"
              data-touch={touchCapable ? "true" : "false"}
              style={{
                padding: "6px max(8px, var(--game-safe-right)) max(6px, var(--game-safe-bottom)) max(8px, var(--game-safe-left))",
              }}
            >
              <div className="overflow-x-auto">
                {hotbarTypes.length === 0 ? (
                  <p className="bc-hotbar-empty flex min-h-12 items-center justify-center px-2 text-center text-sm leading-snug text-white/70">
                    Ide kerülnek a kibányászott blokkok — {touchCapable ? "a Lerak gombbal" : "F-fel"} építhetsz velük.
                  </p>
                ) : (
                <div className="mx-auto flex w-max items-center gap-1.5" data-testid="bc-hotbar">
                  {hotbarTypes.map((t, i) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSelType(t)}
                        aria-label={`${BLOCK_NAME[t] ?? "Blokk"}: ${inventory[t] ?? 0} db`}
                        aria-pressed={selType === t}
                        className={`flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-xl border-2 px-2 text-sm font-extrabold transition-colors ${
                          selType === t
                            ? "border-amber-300 bg-amber-500/25 text-amber-100 shadow-[0_0_14px_rgba(251,191,36,0.35)]"
                            : "border-white/20 bg-black/40 text-white/85 hover:bg-white/10"
                        }`}
                        title={`${BLOCK_NAME[t] ?? "?"} (${i + 1})`}
                      >
                        <span className="inline-block h-6 w-6 rounded-md border-2 border-black/40" style={{ background: MC_PAL[t]?.main ?? "#999" }} aria-hidden="true" />
                        <span className="hidden sm:inline text-xs">{BLOCK_NAME[t] ?? "?"}</span>
                        <span className="tabular-nums">×{inventory[t] ?? 0}</span>
                      </button>
                    ))}
                </div>
                )}
              </div>
              {!touchCapable && (
                <p className="w-full text-center text-xs text-white/65" data-testid="bc-keyboard-hint">
                  Billentyűzet: WASD mozgás · Space ugrás · E bányász · F lerak · 1–9 blokk · P szünet
                </p>
              )}
            </div>
          )}
        </div>
      </main>

      <AnimatePresence>
        {phase === "quiz" && quiz && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm"
            style={{
              padding:
                "max(8px, var(--game-safe-top)) max(8px, var(--game-safe-right)) max(8px, var(--game-safe-bottom)) max(8px, var(--game-safe-left))",
            }}
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              ref={quizDialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="Mini-teszt"
              data-testid="bc-quiz"
              initial={reducedMotion ? false : { y: 36, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className={`game-quiz bc-quiz w-full max-w-lg max-h-full overflow-y-auto rounded-3xl border-2 border-lime-400/55 bg-slate-950/95 p-4 shadow-[0_20px_56px_rgba(34,197,94,0.28)] ${
                wrongShake && !reducedMotion ? "animate-shake" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                {(() => {
                  const s = quiz.subject;
                  const label = s === "english" ? "Angol szókincs" : s === "english-math" ? "Angol matek" : s === "math" ? "Matematika" : s === "nature" ? "Környezet" : s === "science" ? "Természettudomány" : s === "history" ? "Történelem" : s === "hungarian" ? "Magyar" : "Kvíz";
                  const chipClass = s === "english" ? "bg-lime-600/70 text-lime-50 border-lime-300/60" : s === "english-math" ? "bg-cyan-600/70 text-cyan-50 border-cyan-300/60" : s === "math" ? "bg-amber-600/70 text-amber-50 border-amber-300/60" : s === "nature" ? "bg-emerald-600/70 text-emerald-50 border-emerald-300/60" : "bg-slate-600/70 text-slate-50 border-slate-300/60";
                  return <span className={`text-xs font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-full border ${chipClass}`}>{label}</span>;
                })()}
                <span className="text-sm font-black text-lime-300 uppercase">Mini-teszt</span>
                {/* A teljes képernyős kvízréteg eltakarja a HUD szünetgombját — itt is lehet megállni (#426 review-lelet). */}
                <button
                  type="button"
                  data-testid="bc-quiz-pause"
                  aria-label="Szünet"
                  onClick={pauseGame}
                  className="ml-auto inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white hover:bg-white/20"
                >
                  <Pause className="h-5 w-5" fill="currentColor" strokeWidth={0} aria-hidden="true" />
                </button>
              </div>
              <p className="bc-quiz-hint mt-1 text-sm text-white/70 leading-snug">Jó válasz: eltűnik a blokk, és jár az XP. Rossznál megmutatjuk, miért.</p>
              <p className="mt-2 mb-3 text-lg sm:text-xl font-bold leading-snug text-white" data-testid="bc-prompt">{quiz.prompt}</p>
              <div className="game-quiz-answers bc-quiz-answers grid gap-2">
                {quiz.options.map((o, i) => {
                  const isCorrect = revealCorrectIdx === i;
                  const isWrong = wrongIdx === i;
                  const dim = revealCorrectIdx !== null && !isCorrect && !isWrong;
                  const cls = isCorrect
                    ? "bg-emerald-700/80 hover:bg-emerald-700/80 text-white border-2 border-emerald-300 font-bold"
                    : isWrong
                      ? "bg-rose-800/80 hover:bg-rose-800/80 text-white border-2 border-rose-300"
                      : dim
                        ? "bg-white/5 text-white/40 border border-lime-900/20"
                        : "bg-slate-900/95 hover:bg-lime-800/55 active:bg-lime-700/70 text-white border border-lime-500/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]";
                  return (
                    <button
                      key={`${o}-${i}`}
                      type="button"
                      className={`game-answer-btn flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime-300 ${cls}`}
                      disabled={revealCorrectIdx !== null}
                      data-state={isCorrect ? "correct" : isWrong ? "wrong" : "idle"}
                      onClick={() => onAnswer(i)}
                      {...correctDataAttrs(i === quiz.correctIndex)}
                    >
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/35 text-sm font-black text-lime-100" aria-hidden="true">{"ABCD"[i] ?? i + 1}</span>
                      <span className="min-w-0 flex-1">{o}</span>
                    </button>
                  );
                })}
              </div>
              {streakProtector.warning && <p className="mt-2 text-sm text-amber-300/95 font-semibold">⚠ {streakProtector.warning}</p>}
              {revealCorrectIdx !== null && wrongIdx !== null && <p className="mt-2 text-sm text-emerald-300/95">A helyes válasz: <strong>{quiz.options[revealCorrectIdx]}</strong></p>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {achievement && (
          <motion.div
            className="fixed left-1/2 -translate-x-1/2 z-[70] bg-amber-500/95 text-slate-950 font-extrabold text-sm px-4 py-2 rounded-xl shadow-xl border border-amber-200/60 whitespace-nowrap pointer-events-none"
            style={{ top: "calc(max(4px, var(--game-safe-top)) + 104px)" }}
            initial={reducedMotion ? false : { opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
          >
            {achievement}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Szünetben a kártya a menü alá nem kerülhet (z-90 > z-80): addig elrejtjük, folytatáskor visszajön. */}
      {feedback && !paused && <QuizFeedbackCard card={feedback} onDismiss={dismissFeedback} />}

      <PauseMenu
        open={paused && inRun}
        onResume={resumeGame}
        onRestart={startGame}
        onExit={endRun}
        exitLabel="Kör vége"
      />

      <ResultScreen
        badges={newlyUnlocked}
        open={phase === "levelComplete"}
        testId="bc-level-complete"
        title="Pálya teljesítve!"
        won
        score={sessionXp}
        best={bestScore.best}
        correct={correctInRun}
        total={totalAnswered}
        onRetry={startNextLevel}
        retryLabel={isLastLevel ? "Befejezés — összesítés!" : `Tovább a ${levelIdx + 2}. pályára`}
        onBack={endRun}
        backLabel="Befejezés most"
        extra={
          <div className="flex flex-col items-center gap-2">
            <p className="text-base font-bold text-lime-100">{cfg.name}</p>
            <div className="flex flex-wrap justify-center gap-1.5 text-sm text-white/90">
              <span className="rounded-full bg-lime-700/55 px-2.5 py-1"><strong className="text-lime-100">{levelBlocks}</strong> blokk</span>
              <span className="rounded-full bg-cyan-700/55 px-2.5 py-1"><strong className="text-cyan-100">{levelRare}</strong> érc</span>
              <span className="rounded-full bg-amber-700/55 px-2.5 py-1"><strong className="text-amber-100">+{sessionXp - levelStartXp}</strong> XP</span>
              <span className="rounded-full bg-orange-700/55 px-2.5 py-1 inline-flex items-center gap-1"><Flame className="w-4 h-4 text-orange-300" /><strong>{streak}</strong></span>
            </div>
            {!isLastLevel && (
              <p className="text-sm text-white/75 max-w-sm">Következő: <strong className="text-lime-200">{LEVELS[levelIdx + 1]!.name}</strong> — {LEVELS[levelIdx + 1]!.description}</p>
            )}
          </div>
        }
      />

      <ResultScreen
        badges={newlyUnlocked}
        open={phase === "over"}
        testId="bc-over"
        title={gameWon ? "Bajnok lettél! Mind az 5 pálya kész!" : "Bányászat vége"}
        won={gameWon}
        score={sessionXp}
        best={bestResult?.best ?? bestScore.best}
        isNewBest={(bestResult?.isNewBest ?? false) && sessionXp > 0}
        correct={correctInRun}
        total={totalAnswered}
        onRetry={startGame}
        retryLabel="Új próbálkozás"
        onBack={() => navigate("/games")}
        extra={
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-white/85">
              Blokkok: <strong>{blocksMined}</strong> · Érc: <strong>{rareBlocks}</strong> · Pálya: <strong>{levelIdx + 1}/{LEVELS.length}</strong>
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center max-w-sm">
              <span className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border bg-lime-600/70 text-lime-50 border-lime-300/60">Angol: {subjectStats.english}</span>
              <span className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border bg-cyan-600/70 text-cyan-50 border-cyan-300/60">Angol-matek: {subjectStats["english-math"]}</span>
              <span className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border bg-amber-600/70 text-amber-50 border-amber-300/60">Matek: {subjectStats.math}</span>
              <span className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border bg-emerald-600/70 text-emerald-50 border-emerald-300/60">Környezet: {subjectStats.nature}</span>
              {subjectStats.hungarian > 0 && <span className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border bg-fuchsia-600/70 text-fuchsia-50 border-fuchsia-300/60">Magyar: {subjectStats.hungarian}</span>}
              {subjectStats.science > 0 && <span className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border bg-sky-600/70 text-sky-50 border-sky-300/60">Természettudomány: {subjectStats.science}</span>}
              {subjectStats.history > 0 && <span className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border bg-rose-600/70 text-rose-50 border-rose-300/60">Történelem: {subjectStats.history}</span>}
            </div>
            {syncEligibility?.eligible ? <p className="text-sm text-emerald-300/90">Eredmény elküldve.</p> : <p className="text-sm text-white/60 max-w-xs">{syncBanner}</p>}
          </div>
        }
      />

      <style>{`
        @keyframes shake {0%,100% { transform: translateX(0); }25% { transform: translateX(-5px); }75% { transform: translateX(5px); }}
        .animate-shake { animation: shake 0.16s ease-in-out 2; }
        /* S11 — akciógombok ívben (Ugrás a legnagyobb: --game-action-size × 1,15), felirat-kapszula a kör alján. */
        .bc-actions { display: grid; grid-template-columns: auto auto; grid-template-rows: auto auto; align-items: end; justify-items: center; column-gap: 12px; row-gap: 14px; }
        .bc-act { position: relative; color: #fff; border: 2px solid rgba(255,255,255,.35); box-shadow: 0 6px 18px rgba(0,0,0,.45), inset 0 2px 0 rgba(255,255,255,.25), inset 0 -4px 0 rgba(0,0,0,.25); -webkit-tap-highlight-color: transparent; user-select: none; transition: transform .08s ease, filter .12s ease; }
        .bc-act:active { transform: scale(.92); filter: brightness(1.15); }
        .bc-act:disabled { opacity: .45; filter: grayscale(.6); }
        .bc-act-place { grid-column: 2; grid-row: 1; background: radial-gradient(circle at 35% 30%, #fbbf24, #b45309 70%); }
        .bc-act-mine { grid-column: 1; grid-row: 2; margin-bottom: 18px; background: radial-gradient(circle at 35% 30%, #4ade80, #047857 70%); }
        .bc-act-jump.game-action-btn { grid-column: 2; grid-row: 2; width: calc(var(--game-action-size) * 1.15); height: calc(var(--game-action-size) * 1.15); background: radial-gradient(circle at 35% 30%, #a78bfa, #5b21b6 70%); }
        .bc-act-label { position: absolute; left: 50%; bottom: -10px; transform: translateX(-50%); white-space: nowrap; font-size: 14px; line-height: 1; font-weight: 800; padding: 3px 8px; border-radius: 9999px; background: rgba(2,6,23,.82); border: 1px solid rgba(255,255,255,.22); color: #fff; pointer-events: none; }
        @media (prefers-reduced-motion: reduce) { .bc-act { transition: none; } .bc-act:active { transform: none; } }
        /* Alacsony fekvő nézet: a kvíz válaszai két oszlopban, a súgó-sor elrejtve, hogy minden kiférjen.
           Érintős fekvő nézetben a hotbar a vászonra kerül, a joystick és az akciógombok közé (a vászon kapja a magasságot). */
        @media (max-height: 500px) and (min-width: 560px) {
          .bc-bottom[data-touch="true"] { position: absolute; z-index: 25; left: 50%; transform: translateX(-50%); bottom: max(8px, var(--game-safe-bottom)); max-width: 52%; padding: 0 !important; background: transparent; border: 0; pointer-events: none; }
          .bc-bottom[data-touch="true"] button { pointer-events: auto; }
          .bc-bottom[data-touch="true"] .bc-hotbar-empty { display: none; }
          .bc-quiz-answers { grid-template-columns: 1fr 1fr; }
          .bc-quiz-hint { display: none; }
          .bc-quiz { padding: 12px; }
        }
      `}</style>
    </GameShell>
  );
}
