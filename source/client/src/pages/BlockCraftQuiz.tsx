import { isPlayableQuestion } from "@shared/game-quiz-contract";
import { createAdaptiveSession, adaptiveTimeBudget } from "@/game-engine/adaptiveSession";
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
import { useCouponSession } from "@/game-engine/useCouponSession";
import { maybeClaimCouponBonus } from "@/game-engine/claimCouponBonus";
import { CouponHud, CouponExpiredOverlay } from "@/game-engine/CouponHud";
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
import {
  AIR, GRASS, DIRT, STONE, LOG, LEAVES, COAL, IRON, DIAMOND, BEDROCK,
  CREEPER, SAND, WATER, ZOMBIE, SKELETON, SPIDER,
  WX, WY, WZ,
  type VoxelWorld, type VoxelGenConfig, type PlayerState, type VoxelHit,
  generateVoxelWorld, findVoxelSpawn, stepPlayerPhysics, raycastVoxel,
  vGet, vSet, vIdx, vMineable, collidesAt, isExposed,
  PLAYER_EYE, MOVE_SPEED_BPS, JUMP_VELOCITY,
} from "@/lib/voxelcraft";
import QuizFeedbackCard from "@/game-engine/QuizFeedbackCard";
import { buildFeedback, type FeedbackCard } from "@/game-engine/feedback";
import { blockCraftSubjectFromTopic, type BlockCraftSubject } from "@/lib/blockCraftSubjects";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { correctDataAttrs, installGameTestApi } from "@/game-engine/game-test-hooks";

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
  const coarsePointer = useCoarsePointer();

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
  const lastTRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  // G1 JAVÍTÁS: a render-loop futásának egyetlen forrása. A step() a rekurzív
  // requestAnimationFrame előtt ezt ellenőrzi, így a loop megállítható ÉS
  // (a scene újraépítése nélkül) újraindítható — korábban a levelComplete/endRun
  // cancelAnimationFrame után soha nem indult újra.
  const runningRef = useRef(false);
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

  useEffect(() => {
    return installGameTestApi({
      forceState: (patch) => {
        if (patch.phase === "menu" || patch.phase === "play" || patch.phase === "levelComplete" || patch.phase === "over") {
          setPhase(patch.phase);
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
  // Keep refs in sync for the canvas loop / global key handlers (avoids stale closure)
  streakRef.current = streak;
  phaseRef.current = phase;
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
  const { items: materialItems } = useMaterialQuizzes(userGrade);

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
    return [...fromMaterial, ...remote, ...QUIZ_FALLBACK];
  }, [bankData, materialItems]);

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
    answerLockedRef.current = false;
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

  /** Bányász-kvíz indítása egy konkrét voxelre (a crosshair-cél). */
  const tryMineAt = useCallback(
    (x: number, y: number, z: number): boolean => {
      const t = vGet(worldRef.current, x, y, z);
      if (!vMineable(t)) return false;
      const p = playerRef.current;
      p.vx = 0;
      p.vz = 0;
      mineTargetRef.current = { x, y, z, t };
      setQuiz(pickQuiz());
      setPhase("quiz");
      return true;
    },
    [pickQuiz],
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
    playerRef.current = {
      x: spawn.x, y: spawn.y, z: spawn.z,
      vx: 0, vy: 0, vz: 0,
      yaw: Math.PI * 0.25, pitch: -0.15, onGround: false,
    };
    pendingBurstRef.current = null;
    lookHitRef.current = null;
    setInventory({});
    setXpFloat(null);
    setAchievement(null);
    if (options.resetSession) {
      adaptiveRef.current.reset(userGrade ?? 4);
      setSessionXp(0);
      setStreak(0);
      setRunSeconds(0);
      setBlocksMined(0);
      setRareBlocks(0);
      setSubjectStats({ english: 0, "english-math": 0, math: 0, nature: 0, hungarian: 0 });
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
  }, [rebuildSubjectPools, userGrade]);

  const startGame = useCallback(() => {
    scoreSubmittedRef.current = false;
    bestStreakRef.current = 0;     // D2: reset run-level best streak on new game
    totalDiamondsRef.current = 0; // D3: reset run-level diamond count on new game
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
    runningRef.current = false; // G1: loop stop (újraindítás a phase-effectből)
    cancelAnimationFrame(rafRef.current);
    lookHitRef.current = null;
    setGameWon(false);
    setPhase("over");
  }, []);

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
      if (phaseRef.current !== "play") return;
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
      const p = playerRef.current;
      p.yaw -= e.movementX * 0.0024;
      p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - e.movementY * 0.0022));
    };
    // D4: reset all movement flags on window blur (prevents stuck keys on tab/window switch)
    const onBlur = () => {
      keysRef.current.fwd = false;
      keysRef.current.back = false;
      keysRef.current.left = false;
      keysRef.current.right = false;
      keysRef.current.jump = false;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", onBlur);
    document.addEventListener("mousemove", mm);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("mousemove", mm);
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const cfg = activeLevelRef.current;
    const scene = new THREE.Scene();
    const skyColor = new THREE.Color(cfg.skyTint.day);
    scene.background = skyColor;
    scene.fog = new THREE.FogExp2(skyColor, cfg.weather === "sandstorm" ? 0.035 : 0.022);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x4a4038, 0.95);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3d6, 1.1);
    sun.position.set(WX * 0.7, WY * 4.5, WZ * 0.3);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 140);
    camera.rotation.order = "YXZ";
    cameraRef.current = camera;

    let appliedW = 0;
    let appliedH = 0;
    const syncSize = () => {
      const { width, height } = desiredCanvasCssSize(canvas);
      if (width === appliedW && height === appliedH) return;
      appliedW = width;
      appliedH = height;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    syncSize();

    const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
    const blockMaterials = makeBlockMaterials();

    // --- Instanced voxel-renderelés (exposed-culling) ---
    let instMeshes: THREE.InstancedMesh[] = [];
    const tmpMat = new THREE.Matrix4();
    const rebuildWorld = () => {
      for (const m of instMeshes) {
        scene.remove(m);
        m.dispose();
      }
      instMeshes = [];
      const w = worldRef.current;
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
        const mat = blockMaterials.get(t);
        if (!mat) return;
        const n = coords.length / 3;
        const mesh = new THREE.InstancedMesh(blockGeometry, mat as THREE.Material | THREE.Material[], n);
        for (let i = 0; i < n; i++) {
          tmpMat.makeTranslation(coords[i * 3]! + 0.5, coords[i * 3 + 1]! + 0.5, coords[i * 3 + 2]! + 0.5);
          mesh.setMatrixAt(i, tmpMat);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (t === WATER || t === LEAVES) mesh.renderOrder = 1;
        scene.add(mesh);
        instMeshes.push(mesh);
      });
    };
    let builtVersion = -1;

    // --- Cél-keret (sárga, pulzáló) a crosshair-blokkon ---
    const hlGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    const hlMat = new THREE.LineBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.95 });
    const highlight = new THREE.LineSegments(hlGeo, hlMat);
    highlight.visible = false;
    scene.add(highlight);

    // --- Felhők (lassan sodródó fehér lapok a világ felett) ---
    const cloudGeo = new THREE.BoxGeometry(8, 0.6, 5);
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.66, fog: false });
    const clouds: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Mesh(cloudGeo, cloudMat);
      c.position.set(Math.random() * WX, WY + 7 + Math.random() * 5, Math.random() * WZ);
      scene.add(c);
      clouds.push(c);
    }

    // --- Időjárás-részecskék a játékos körül ---
    const WEATHER_N = 340;
    let weatherPts: THREE.Points | null = null;
    let weatherGeo: THREE.BufferGeometry | null = null;
    let weatherMat: THREE.PointsMaterial | null = null;
    if (cfg.weather !== "clear") {
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
        color: cfg.weather === "rain" ? 0x9ec7ff : cfg.weather === "snow" ? 0xffffff : 0xe7c878,
        size: cfg.weather === "snow" ? 0.13 : 0.08,
        transparent: true,
        opacity: cfg.weather === "sandstorm" ? 0.55 : 0.8,
        sizeAttenuation: true,
      });
      weatherPts = new THREE.Points(weatherGeo, weatherMat);
      scene.add(weatherPts);
    }

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
    };

    const dirVec = new THREE.Vector3();
    let disposed = false;

    const step = (now: number) => {
      if (disposed) return;
      // G1: leállított loop → nem ütemezünk új frame-et (újraindítás a phase-effectből).
      if (!runningRef.current) return;
      rafRef.current = requestAnimationFrame(step);
      const last = lastTRef.current ?? now;
      const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
      lastTRef.current = now;
      syncSize();

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
      const p = playerRef.current;
      const k = keysRef.current;
      const sinY = Math.sin(p.yaw);
      const cosY = Math.cos(p.yaw);
      let mx = 0;
      let mz = 0;
      if (k.fwd) { mx -= sinY; mz -= cosY; }
      if (k.back) { mx += sinY; mz += cosY; }
      if (k.left) { mx -= cosY; mz += sinY; }
      if (k.right) { mx += cosY; mz -= sinY; }
      const ml = Math.hypot(mx, mz);
      if (ml > 0) {
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
        const pulse = 1 + Math.sin(now / 160) * 0.012;
        highlight.scale.setScalar(pulse);
      } else {
        highlight.visible = false;
      }

      // --- Felhők sodródása ---
      for (const c of clouds) {
        c.position.x += dt * 0.7;
        if (c.position.x > WX + 14) c.position.x = -14;
      }

      // --- Időjárás ---
      if (weatherPts && weatherGeo) {
        const attr = weatherGeo.getAttribute("position") as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        const fallSpeed = cfg.weather === "rain" ? 13 : cfg.weather === "snow" ? 2.4 : 5;
        const driftX = cfg.weather === "sandstorm" ? 9 : cfg.weather === "snow" ? 0.5 : 0;
        for (let i = 0; i < WEATHER_N; i++) {
          arr[i * 3] += driftX * dt + (cfg.weather === "snow" ? Math.sin(now / 700 + i) * dt : 0);
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

      renderer.render(scene, camera);
    };
    lastTRef.current = null;
    // G1: a loop indítását/leállítását a phase-vezérelt effect végzi (lentebb).
    stepRef.current = step;
    if (runningRef.current) rafRef.current = requestAnimationFrame(step);

    return () => {
      disposed = true;
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
      if (weatherPts) scene.remove(weatherPts);
      weatherGeo?.dispose();
      weatherMat?.dispose();
      for (const c of clouds) scene.remove(c);
      cloudGeo.dispose();
      cloudMat.dispose();
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
    const shouldRun = phase === "play" || phase === "quiz";
    if (!shouldRun) {
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
      return;
    }
    if (runningRef.current || !stepRef.current) return;
    runningRef.current = true;
    lastTRef.current = null; // dt-ugrás elkerülése a szünet után
    rafRef.current = requestAnimationFrame(stepRef.current);
  }, [phase]);

  /** G-1: magyarázó kártya rossz válaszra. */
  const [feedback, setFeedback] = useState<FeedbackCard | null>(null);

  const dismissFeedback = useCallback(() => {
    setFeedback(null);
    setRevealCorrectIdx(null);
    setWrongIdx(null);
    setQuiz(pickQuiz());
    answerLockedRef.current = false;
  }, [pickQuiz]);

  const onAnswer = (idx: number) => {
    if (!quiz || phase !== "quiz" || answerLockedRef.current || revealCorrectIdx !== null) return;
    answerLockedRef.current = true;
    const previousBudget = adaptiveTimeBudget(activeLevelRef.current.timeLimit, adaptiveRef.current.band);
    adaptiveRef.current.answer(idx === quiz.correctIndex);
    const nextBudget = adaptiveTimeBudget(activeLevelRef.current.timeLimit, adaptiveRef.current.band);
    setTimeLeft(t => Math.max(1, Math.min(nextBudget, t + nextBudget - previousBudget)));
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
    maybeClaimCouponBonus(coupon, quiz.id);
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

  /** Mobil irány-gombok: lenyomásra/felengedésre a keysRef-et írják. */
  const hold = (k: "fwd" | "back" | "left" | "right" | "jump", v: boolean) => {
    keysRef.current[k] = v;
  };

  const startHold = (e: ReactPointerEvent<HTMLButtonElement>, k: "fwd" | "back" | "left" | "right" | "jump") => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    hold(k, true);
  };

  const endHold = (e: ReactPointerEvent<HTMLButtonElement>, k: "fwd" | "back" | "left" | "right" | "jump") => {
    e.preventDefault();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    hold(k, false);
  };

  /** Crosshair-célzott blokk bányászása (E / bal klikk / Bányász gomb / tap). */
  const tryMineLook = useCallback(() => {
    const hit = lookHitRef.current;
    if (!hit || !vMineable(hit.t)) return;
    tryMineAt(hit.x, hit.y, hit.z);
  }, [tryMineAt]);

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

  /** Mobil look-drag állapot (egy ujjas húzás a canvason = körbenézés). */
  const touchLookRef = useRef<{ id: number; lastX: number; lastY: number; moved: number } | null>(null);

  const onCanvasPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (phase !== "play") return;
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
      canvas.setPointerCapture(e.pointerId);
      touchLookRef.current = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY, moved: 0 };
    },
    [phase, tryMineLook, tryPlaceLook],
  );

  const onCanvasPointerMove = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    const tl = touchLookRef.current;
    if (!tl || tl.id !== e.pointerId) return;
    const dx = e.clientX - tl.lastX;
    const dy = e.clientY - tl.lastY;
    tl.lastX = e.clientX;
    tl.lastY = e.clientY;
    tl.moved += Math.abs(dx) + Math.abs(dy);
    const p = playerRef.current;
    p.yaw -= dx * 0.006;
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - dy * 0.005));
  }, []);

  const onCanvasPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const tl = touchLookRef.current;
      if (!tl || tl.id !== e.pointerId) return;
      touchLookRef.current = null;
      if (tl.moved >= 12) return;
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

  const onCanvasPointerCancel = useCallback(() => {
    touchLookRef.current = null;
  }, []);

  return (
    <div data-game="BlockCraftQuiz" data-playing={phase === "play" || phase === "quiz"}
      className="game-shell-fixed min-h-screen relative overflow-hidden text-white" style={{ background: "radial-gradient(circle at 15% 15%, rgba(34,197,94,0.18), transparent 38%), radial-gradient(circle at 88% 8%, rgba(34,211,238,0.2), transparent 42%), linear-gradient(180deg, #0b1727 0%, #1b2f45 100%)" }}>
      <ClassroomGateModal accent="lime" />
      <AchievementToast achievements={newlyUnlocked} />
      <main className="relative z-10 w-full max-w-xl lg:max-w-3xl mx-auto px-2 sm:px-5 py-2 sm:py-4 min-h-dvh min-h-screen flex flex-col pb-20 sm:pb-10">
        {/* LS-4: earned play time — renders nothing without a coupon. */}
        <CouponHud session={coupon} />
        <CouponExpiredOverlay session={coupon} />
        <header className="flex items-center justify-between gap-1 mb-1">
          <Link href="/games"><Button variant="ghost" size="sm" className="text-white/90 hover:bg-white/10 gap-1 -ml-2 h-11 px-3"><ArrowLeft className="w-4 h-4" />Játékok</Button></Link>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <AudioToggleButton size="icon" />
            <span className="flex items-center gap-1 text-amber-300"><Star className="w-4 h-4" />{totalXp}</span>
            <span className="flex items-center gap-1 text-lime-300"><Flame className="w-4 h-4" />{streak}</span>
          </div>
        </header>

        <Card className="border border-lime-400/45 bg-slate-950/85 backdrop-blur-md shadow-[0_16px_48px_rgba(0,0,0,0.45)] flex-1 flex flex-col min-h-0"><CardContent data-game-card-content className={`flex flex-col flex-1 min-h-0 ${phase === "play" ? "p-1.5 sm:p-3" : "p-3"}`}>
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
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-2 min-h-0">
              <Button size="lg" className="bg-gradient-to-r from-lime-600 to-emerald-800 hover:from-lime-500 hover:to-emerald-700 border border-lime-200/35 font-bold text-white shadow-lg text-base min-h-[44px]" onClick={startGame} data-testid="bc-start">
                <Pickaxe className="w-4 h-4 mr-2" />Indulhat a bányászat!
              </Button>
              <div className="grid grid-cols-5 gap-2 p-2 rounded-xl bg-black/45 border border-lime-700/45">
                {[GRASS, DIRT, SAND, STONE, WATER, LOG, LEAVES, COAL, IRON, DIAMOND].map((t) => <MenuBlock key={t} t={t} />)}
              </div>
              <div className="w-full max-w-sm rounded-xl border border-lime-600/45 bg-slate-900/85 p-3 min-h-0 overflow-hidden">
                <p className="text-[11px] font-bold uppercase tracking-wide text-lime-200 mb-1.5">5 pálya — XP halmozódik</p>
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
              <p className="hidden sm:block text-xs text-white/80 text-center max-w-xs">
                WASD mozgás, Space ugrás, E bányász-kvíz. Mobilon: gombok + koppintás a blokkra.
              </p>
            </div>
          )}

          {/*
            G1: a canvas MINDIG a DOM-ban marad (más fázisokban csak elrejtjük),
            különben a mount-szintű Three.js effect nem találná meg a canvas-t,
            és a scene sosem épülne fel. (Ugyanaz a minta, mint SpaceAsteroidQuiz.)
          */}
          {(() => {
            const cfg = activeLevelRef.current;
            const timePct = Math.min(100, (timeLeft / adaptiveTimeBudget(cfg.timeLimit, adaptiveRef.current.band)) * 100);
            const blocksPct = Math.min(100, (levelBlocks / cfg.goalBlocks) * 100);
            const rarePct = cfg.goalRareBlocks > 0 ? Math.min(100, (levelRare / cfg.goalRareBlocks) * 100) : 100;
            const showPlay = phase === "play" || phase === "quiz";
            return (
              <div className={`game-play-stack flex flex-1 min-h-0 flex-col items-center gap-1.5 ${showPlay ? "" : "hidden"}`}>
                {/* === CANVAS LEGFELÜL (mobil-first) === */}
                <div className="relative rounded-xl overflow-hidden border-2 border-lime-700/70 shadow-[0_0_28px_rgba(34,197,94,0.18)] w-full bg-black game-scene flex-1 min-h-0">
                  <canvas
                    ref={canvasRef}
                    className="block touch-none w-full h-full max-w-full cursor-crosshair select-none"
                    onPointerDown={onCanvasPointerDown}
                    onPointerMove={onCanvasPointerMove}
                    onPointerUp={onCanvasPointerUp}
                    onPointerCancel={onCanvasPointerCancel}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,transparent_54%,rgba(0,0,0,0.22)_100%)]" />
                  {/* Crosshair (Minecraft-stílusú kereszt) */}
                  <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <span className="absolute left-1/2 top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-white/80 mix-blend-difference" />
                    <span className="absolute left-1/2 top-1/2 h-0.5 w-4 -translate-x-1/2 -translate-y-1/2 bg-white/80 mix-blend-difference" />
                  </div>
                  {xpFloat && (
                    <div key={xpFloat.key} className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 text-amber-300 font-extrabold text-lg drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] animate-bounce">
                      +{xpFloat.amount} XP
                    </div>
                  )}
                  <div className={`pointer-events-none absolute left-2 top-2 rounded-lg border bg-slate-950/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                    cfg.isBossLevel
                      ? "border-rose-400 text-rose-200 animate-pulse"
                      : "border-lime-300/40 text-lime-100"
                  }`}>
                    {cfg.isBossLevel ? `★ BOSS ★ ${cfg.name.replace(/^\d+\.\s*/, "")}` : `Pálya ${cfg.id}/${LEVELS.length} · ${cfg.name.replace(/^\d+\.\s*/, "")}`}
                  </div>
                  <div className="pointer-events-none absolute right-2 top-2 rounded-lg border border-cyan-200/25 bg-slate-950/65 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-100 flex items-center gap-1">
                    <span>3D FP</span>
                    {cfg.weather !== "clear" && (
                      <span title={cfg.weather}>
                        {cfg.weather === "rain" ? "🌧" : cfg.weather === "snow" ? "❄" : "🏜"}
                      </span>
                    )}
                  </div>
                  <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 text-[10px] font-semibold text-white/75">
                    <span className="rounded bg-black/45 px-2 py-1 hidden sm:inline">Klikk: irányítás · bal: bányász · jobb: lerak</span>
                    <span className="rounded bg-black/45 px-2 py-1 sm:hidden">Húzás: nézelődés · tap: bányász</span>
                    <span className="rounded bg-black/45 px-2 py-1">Sárga keret = célzott blokk</span>
                  </div>
                </div>
                {/* === HOTBAR (kibányászott blokkok, lerakáshoz) === */}
                {hotbarTypes.length > 0 && (
                  <div className="flex flex-wrap gap-1 w-full justify-center">
                    {hotbarTypes.map((t, i) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSelType(t)}
                        className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-bold transition-colors ${
                          selType === t
                            ? "border-amber-300 bg-amber-500/25 text-amber-100"
                            : "border-white/20 bg-black/40 text-white/75 hover:bg-white/10"
                        }`}
                        title={`${BLOCK_NAME[t] ?? "?"} (${i + 1})`}
                      >
                        <span className="inline-block h-3.5 w-3.5 rounded-sm border border-black/40" style={{ background: MC_PAL[t]?.main ?? "#999" }} />
                        {BLOCK_NAME[t] ?? "?"}
                        <span className="tabular-nums text-white/60">×{inventory[t] ?? 0}</span>
                      </button>
                    ))}
                  </div>
                )}
                {/* === KONTROLLGOMBOK (csak coarse pointer — C2: egérnél a vászon kapja a helyet) === */}
                {coarsePointer ? (
                <div className="grid grid-cols-4 gap-1.5 w-full" data-testid="bc-touch-controls">
                  <Button type="button" size="sm" className="bg-sky-800 hover:bg-sky-700 text-white border border-sky-200/35 shadow-md py-3 text-xs" onPointerDown={(e) => startHold(e, "left")} onPointerUp={(e) => endHold(e, "left")} onPointerCancel={(e) => endHold(e, "left")}>⟵ Balra</Button>
                  <Button type="button" size="sm" className="bg-sky-800 hover:bg-sky-700 text-white border border-sky-200/35 shadow-md py-3 text-xs" onPointerDown={(e) => startHold(e, "fwd")} onPointerUp={(e) => endHold(e, "fwd")} onPointerCancel={(e) => endHold(e, "fwd")}>▲ Előre</Button>
                  <Button type="button" size="sm" className="bg-sky-800 hover:bg-sky-700 text-white border border-sky-200/35 shadow-md py-3 text-xs" onPointerDown={(e) => startHold(e, "back")} onPointerUp={(e) => endHold(e, "back")} onPointerCancel={(e) => endHold(e, "back")}>▼ Hátra</Button>
                  <Button type="button" size="sm" className="bg-sky-800 hover:bg-sky-700 text-white border border-sky-200/35 shadow-md py-3 text-xs" onPointerDown={(e) => startHold(e, "right")} onPointerUp={(e) => endHold(e, "right")} onPointerCancel={(e) => endHold(e, "right")}>Jobbra ⟶</Button>
                  <Button type="button" size="sm" className="bg-violet-700 hover:bg-violet-600 text-white border border-violet-200/35 shadow-md py-3 text-xs" onPointerDown={(e) => startHold(e, "jump")} onPointerUp={(e) => endHold(e, "jump")} onPointerCancel={(e) => endHold(e, "jump")}>Ugrás</Button>
                  <Button type="button" size="sm" className="bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-200/35 touch-manipulation shadow-md py-3 text-xs col-span-2" onClick={tryMineLook}><Pickaxe className="w-3.5 h-3.5 mr-1" />Bányász (E)</Button>
                  <Button type="button" size="sm" className="bg-amber-700 hover:bg-amber-600 text-white border border-amber-200/35 touch-manipulation shadow-md py-3 text-xs" onClick={tryPlaceLook} disabled={(inventory[selType] ?? 0) <= 0}>Lerak (F)</Button>
                </div>
                ) : (
                  <p className="w-full text-center text-[11px] text-white/55" data-testid="bc-keyboard-hint">
                    Billentyűzet: WASD mozgás · Space ugrás · E bányász · F lerak
                  </p>
                )}
                {/* === KOMPAKT HUD === */}
                <div className="w-full flex items-center gap-1.5">
                  <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className={`h-full transition-all ${timePct < 25 ? "bg-gradient-to-r from-rose-500 to-amber-400" : "bg-gradient-to-r from-cyan-400 to-lime-500"}`} style={{ width: `${timePct}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-white/80 tabular-nums min-w-[32px] text-right">{timeLeft}s</span>
                </div>
                <div className="w-full flex items-center justify-between text-[10px] font-semibold text-white/70">
                  <span>XP: <strong className="text-amber-300">{sessionXp}</strong></span>
                  <span>Cél: <strong className="text-lime-300">{levelBlocks}/{cfg.goalBlocks}</strong>{cfg.goalRareBlocks > 0 && <> · <strong className="text-cyan-300">{levelRare}/{cfg.goalRareBlocks}</strong> érc</>}{(cfg.goalDiamonds ?? 0) > 0 && <> · <strong className="text-sky-200">{levelDiamonds}/{cfg.goalDiamonds}</strong> 💎</>}</span>
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
              <div className="flex flex-col items-center justify-center flex-1 gap-3 py-6 text-center" data-testid="bc-level-complete">
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
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-8 text-center" data-testid="bc-over">
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

      <AnimatePresence>{phase === "quiz" && quiz && <motion.div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/80 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div ref={quizDialogRef} role="dialog" aria-modal="true" aria-label="Mini-teszt" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={`game-quiz w-full max-w-md rounded-2xl border-2 border-lime-500/50 bg-slate-950/95 p-4 shadow-2xl ${wrongShake ? "animate-shake" : ""}`}><div className="flex items-center gap-2 mb-1">{(() => { const s = quiz.subject; const label = s === "english" ? "Angol szókincs" : s === "english-math" ? "Angol matek" : s === "math" ? "Matematika" : s === "nature" ? "Környezet" : "Kvíz"; const chipClass = s === "english" ? "bg-lime-600/70 text-lime-50 border-lime-300/60" : s === "english-math" ? "bg-cyan-600/70 text-cyan-50 border-cyan-300/60" : s === "math" ? "bg-amber-600/70 text-amber-50 border-amber-300/60" : s === "nature" ? "bg-emerald-600/70 text-emerald-50 border-emerald-300/60" : "bg-slate-600/70 text-slate-50 border-slate-300/60"; return <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${chipClass}`}>{label}</span>; })()}<span className="text-xs font-bold text-lime-300 uppercase">Mini-teszt</span></div><p className="text-[11px] text-white/65 mb-2">Ha eltalálod, a blokk eltűnik és jön az XP. Rossz válasz: próbáld újra ugyanazt a blokkot — nincs büntető víz, csak gyakorolsz tovább.</p><p className="text-base font-semibold mb-4">{quiz.prompt}</p><div className="game-quiz-answers grid gap-2">{quiz.options.map((o, i) => {
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
        return <Button key={`${o}-${i}`} variant="secondary" className={cls} disabled={revealCorrectIdx !== null} onClick={() => onAnswer(i)} {...correctDataAttrs(i === quiz.correctIndex)}>{o}</Button>;
      })}</div>{streakProtector.warning && <p className="mt-2 text-[11px] text-amber-300/95 font-semibold">⚠ {streakProtector.warning}</p>}{revealCorrectIdx !== null && wrongIdx !== null && <p className="mt-2 text-[11px] text-emerald-300/95">A helyes válasz: <strong>{quiz.options[revealCorrectIdx]}</strong></p>}</motion.div></motion.div>}</AnimatePresence>

      <AnimatePresence>{achievement && <motion.div className="fixed top-16 left-1/2 -translate-x-1/2 z-[70] bg-amber-500/95 text-slate-950 font-bold text-sm px-4 py-2 rounded-xl shadow-xl border border-amber-200/60 whitespace-nowrap" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>{achievement}</motion.div>}</AnimatePresence>
      {feedback && <QuizFeedbackCard card={feedback} onDismiss={dismissFeedback} />}

      <style>{`@keyframes shake {0%,100% { transform: translateX(0); }25% { transform: translateX(-5px); }75% { transform: translateX(5px); }} .animate-shake { animation: shake 0.16s ease-in-out 2; }`}</style>
    </div>
  );
}
