/**
 * Kockavadász „Rúnabánya” (J3a — végrehajtás `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` J3 / J3a;
 * terv 5.3). A játék az elsődleges: a sima blokk kérdés nélkül bányászható (tartással vagy koppintással), a kérdés a
 * világító rúnaércnél jön Rúna-zárként — a válaszok a világban lebegő rúnaköveken, a világ közben lassítva fut. A régi
 * teljes képernyős kvíz-modál és a „quiz” fázis megszűnt; a magyarázókártya csak a „Miért?” gombra nyílik.
 *
 * Rétegek (KSZ-1): a tiszta mag (`@/lib/blockcraft/core`: bányászás, rúnaérc, zár, zsákmány, fix lépésű hurok) → a
 * three-nézet (ez a fájl: voxel-render, rúnakövek, por) → React UI (HUD ≤ 10 Hz, kérdés-sáv, rúnagombok).
 */
import { isPlayableQuestion } from "@shared/game-quiz-contract";
import { createRng, seedFrom, type Rng } from "@shared/game-rng";
import { createAdaptiveSession, adaptiveTimeBudget } from "@/game-engine/adaptiveSession";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import * as THREE from "three";
import { createGameRenderer, createGradientSky, detectLookTier, disposeObjectTree, LOOK_BUDGET, SparkleField } from "@/game-engine/three-look";
import type { PerfControls, PerfOverlay } from "@/game-engine/perf/perfOverlay";
import { perfEnabledFrom } from "@/game-engine/perf/perfFlag";
import { isLightGraphicsFrom, isTouchDeviceFrom, LIGHT_GRAPHICS_MAX_PIXELS, scaledPixelRatio } from "@/game-engine/perf/pixelBudget";
import { SUN_SHADE_TINT, sunShadeAt, type SunOccluder } from "@/lib/voxelSunShade";
import { useReducedMotion } from "@/game-engine/useReducedMotion";
import { ArrowLeft, Pickaxe, Flame, ArrowBigUp, Blocks, Gem, Pause, RefreshCw } from "lucide-react";
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
import { sfxSuccess, sfxError, sfxLevelUp, sfxClick, sfxPickup, sfxWhoosh } from "@/lib/audioEngine";
import { recordRun, type Achievement } from "@/lib/achievements";
import { isTodaysGameAvailable, markDailyCompleted } from "@/lib/dailyChallenge";
import AchievementToast from "@/components/AchievementToast";
import {
  AIR, GRASS, DIRT, STONE, LOG, LEAVES, COAL, IRON, DIAMOND, BEDROCK,
  CREEPER, SAND, WATER, ZOMBIE, SKELETON, SPIDER, RUNE_ORE,
  WX, WY, WZ,
  type VoxelWorld, type PlayerState, type VoxelHit,
  generateVoxelWorld, findVoxelSpawn, stepPlayerPhysics, raycastVoxel,
  vGet, vSet, vIdx, vMineable, collidesAt, isExposed, lookDirection,
  PLAYER_EYE, MOVE_SPEED_BPS, JUMP_VELOCITY, pickStartLook, groundStartTarget,
} from "@/lib/voxelcraft";
import {
  BLOCK_CRAFT_GAME_ID,
  BLOCK_CRAFT_LEVELS as LEVELS,
  RUNE_STONE_SIZE,
  blockCraftDirectorConfig,
  createRuneMine,
  genCfgFor,
  levelClockTick,
  mineTimeMs,
  nearestRune,
  type LevelConfig,
  type LevelWeather,
  type RuneMine,
  type RuneMineEvent,
} from "@/lib/blockcraft/core";
import QuizFeedbackCard from "@/game-engine/QuizFeedbackCard";
import { buildFeedback, type FeedbackCard } from "@/game-engine/feedback";
import {
  blockCraftSubjectFromGradeSubject,
  blockCraftSubjectFromTopic,
  pickBlockCraftGradeSlot,
  type BlockCraftSubject,
} from "@/lib/blockCraftSubjects";
import { GRADE_SUBJECTS } from "@/data/gradeQuizBank";
import { loadedGradeItems } from "@/data/gradeQuizBank/loader";
import type { GradeQuizItem } from "@/data/gradeQuizBank/types";
import {
  createGradeQuizSeen,
  gradeForGame,
  markGradeQuizSeen,
  pickGradeQuiz,
  pickUnseenMaterial,
} from "@/game-engine/gradeQuiz";
import { correctDataAttrs, installGameTestApi, readGameSeed } from "@/game-engine/game-test-hooks";
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
import { requestGameFrame, cancelGameFrame } from "@/game-engine/mobile";
import { useVocabQuizSource, vocabLevelForGrade, type VocabQuiz } from "@/game-engine/vocab";
import {
  InlineQuestion,
  PLAY_QUESTION_RECHECK_EVENT,
  ResultReview,
  bankPlayQuestion,
  createPointerTapTracker,
  gradePlayQuestion,
  materialPlayQuestion,
  pointerTapHandlers,
  restoreReviewQuestion,
  useGameSpeech,
  usePlayQuestion,
  useQuestionDirector,
  vocabPlayQuestion,
  type PlayQuestion,
  type QuestionOutcome,
  type QuestionPresentation,
  type QuestionProvider,
} from "@/game-engine/play";

import { newScoreRunId, postGameScore } from "@/lib/gameScoreRunId";
import { BLOCK_CRAFT_SCORE_KEY } from "@shared/game-score-keys";
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

/**
 * A rúnakövek színe + betűje (U-J3-1: szöveg-sprite nincs a közös rétegben → színkódolt A/B/C/D kő a világban, a
 * válasz szövege a hozzá tartozó, azonos színű rúnagombon). Színtévesztőknek a betű is jelöl, nem csak a szín.
 */
const RUNE_LETTERS = ["A", "B", "C", "D"] as const;
const RUNE_COLORS = ["#38bdf8", "#f59e0b", "#a3e635", "#f472b6"] as const;
/** Review #484 M2 (lapi védelem): ennél hosszabb húzás a rúnagombon (pl. körbenézés) nem válasz, akkor sem, ha a gombon belül ért véget. */
const RUNE_TAP_MOVE_PX = 12;

/** A kérdés tárgya a tárgy-statisztikához (eredményképernyő). */
const SUBJECT_OF_GRADE = (item: GradeQuizItem): QuizSubject => blockCraftSubjectFromGradeSubject(item.subject);

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
  // J3a: rúnaérc — sötét kő világító türkiz-lila rúnajelekkel (messziről is feltűnik).
  [RUNE_ORE]: { main: "#2B2540", dark: "#1C1830", darker: "#0F0C1C", light: "#4A3F6B", accent: "#5EEAD4", accent2: "#C084FC" },
};

/** 12×12 rúnaérc-minta: sötét kőalap, középen világító rúnakereszt, sarkokban kristályszikrák. */
function buildRunePattern(): string[][] {
  const pal = MC_PAL[RUNE_ORE]!;
  const grid: string[][] = Array.from({ length: 12 }, () => Array(12).fill(pal.main));
  for (let py = 0; py < 12; py++) {
    for (let px = 0; px < 12; px++) {
      const h = tileRand(px * 1.9, py * 2.3, 71.3);
      grid[py][px] = h < 0.18 ? pal.light : h < 0.55 ? pal.main : h < 0.85 ? pal.dark : pal.darker;
    }
  }
  // Rúnajel: függőleges szár + két ferde ág (egyszerű, pixeles „rúna”).
  for (let py = 2; py <= 9; py++) grid[py][5] = pal.accent!;
  for (let k = 0; k < 3; k++) {
    grid[3 + k][6 + k] = pal.accent!;
    grid[6 + k][4 - k] = pal.accent!;
  }
  for (const [x, y] of [[1, 1], [10, 2], [2, 10], [9, 9]] as const) grid[y][x] = pal.accent2!;
  return grid;
}


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
      // Review #484: az emissziós térkép nélkül a teljes blokk (a sötét kőalap is) egységes fehér fényt kapna — csak a jel izzik.
      if (options.emissiveMap !== undefined) m.emissiveMap = options.emissiveMap;
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
  // J3a: a rúnaérc önvilágító (a rúnajel a saját textúrájával izzik), hogy a gyerek messziről is megtalálja.
  const runeTex = gridToTexture(buildRunePattern());
  map.set(RUNE_ORE, stdMat(runeTex, { emissive: new THREE.Color("#ffffff"), emissiveMap: runeTex, emissiveIntensity: 0.75, roughness: 0.6 }));
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

/**
 * J3a: a menet fázisai (K.4/11). A kérdés NEM külön fázis, hanem a „play” al-állapota (Rúna-zár, kérdés-sáv) — a régi
 * „quiz” fázis és a teljes képernyős modál megszűnt (végrehajtás J3a 3.). A teszt-kampó `forceState({ phase: "quiz" })`
 * kompatibilis álnév: azonnal Rúna-zárat nyit (K.2).
 */
type Phase = "menu" | "play" | "levelComplete" | "over";

/**
 * S11 kétujjas vezérlés: érintéssel a körbenézés csak a vászon JOBB 60%-án indulhat (a bal 40% a joystick
 * hüvelykujjáé). `x` a vászonhoz relatív érintési pont, `width` a vászon szélessége.
 */
const LOOK_ZONE_START = 0.4;
function isLookZone(x: number, width: number): boolean {
  return width <= 0 || x >= width * LOOK_ZONE_START;
}

/** A nap kulcsa a seedhez (KSZ-3: `seedFrom(gameId, dátum, kör)`), helyi idő szerint. */
function dayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** `Quiz` → a közös `FourChoiceQuiz` alak (a séma `null` magyarázatot is enged, a motor `undefined`-ot vár). */
function toFourChoice(q: Quiz): { id: string; prompt: string; options: string[]; correctIndex: number; explanation?: string } {
  return { id: q.id ?? "", prompt: q.prompt, options: q.options.slice(), correctIndex: q.correctIndex, ...(q.explanation ? { explanation: q.explanation } : {}) };
}

/** A HUD ≤ 10 Hz-es pillanatképe (KSZ-9: a képkocka-hurokban nincs React-állapot). */
type HudSnap = { runes: number; goal: number; crystals: number; combo: number; multiplier: number; xp: number; blocks: number; armed: boolean };
const EMPTY_HUD: HudSnap = { runes: 0, goal: LEVELS[0]!.runeGoal, crystals: 0, combo: 0, multiplier: 1, xp: 0, blocks: 0, armed: false };

const EMPTY_SUBJECTS: Record<QuizSubject, number> = { english: 0, "english-math": 0, math: 0, nature: 0, hungarian: 0, science: 0, history: 0 };

export default function BlockCraftQuiz() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // S11: a közös érintés-észlelés (any-pointer: coarse + maxTouchPoints) — érintős laptop is kap vezérlőt.
  const touchCapable = useTouchCapable();
  const haptics = useHaptics();
  // D-04: a Rúnabánya pontskálája új kulcs alá ment; a régi „block-craft-quiz” helyi rekord archívként megmarad.
  const bestScore = useBestScore(BLOCK_CRAFT_SCORE_KEY);
  const [, navigate] = useLocation();

  // LS-4 (D3): the play-time coupon earned in a lesson, exactly as in BrainRot —
  // without a coupon this is inert and free play stays the default.
  const coupon = useCouponSession();

  const worldRef = useRef<VoxelWorld>(new Uint8Array(WX * WY * WZ));
  const playerRef = useRef<PlayerState>({
    x: WX / 2 + 0.5, y: WY, z: WZ / 2 + 0.5,
    vx: 0, vy: 0, vz: 0,
    yaw: Math.PI * 0.25, pitch: -0.15, onGround: false,
  });
  /** Az előző fix lépés utáni helyzet — a kamera a kettő között interpolál (K.4/9). */
  const prevPosRef = useRef({ x: WX / 2 + 0.5, y: WY, z: WZ / 2 + 0.5 });
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
  // (a scene újraépítése nélkül) újraindítható.
  const runningRef = useRef(false);
  /** #58: a lefutott render-lépések száma (teszt-kampó `probe().frames`: méri, hogy a ciklus áll-e). */
  const frameCountRef = useRef(0);
  /** A scene-effect által beállított render-lépés — a loop-vezérlő effect innen indítja újra. */
  const stepRef = useRef<((now: number) => void) | null>(null);
  /** A crosshair alatt lévő blokk (a render-loop frissíti minden frame-ben). */
  const lookHitRef = useRef<VoxelHit | null>(null);
  /** Az aktív FP-kamera — mobil tap-raycast a koppintott pont felé. */
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  /** A mag eseményeiből érkező por-effektek (a render-loop játssza le). */
  const pendingBurstRef = useRef<Array<{ x: number; y: number; z: number; t: number; big: boolean }>>([]);
  /** E/F billentyű → aktuális mine/place akció (stale-closure-mentes híd). */
  const mineStartRef = useRef<() => void>(() => {});
  const mineEndRef = useRef<() => void>(() => {});
  const placeActionRef = useRef<() => void>(() => {});
  const hotbarKeyRef = useRef<(slot: number) => void>(() => {});
  const inventoryRef = useRef<Partial<Record<number, number>>>({});
  const selTypeRef = useRef<number>(DIRT);
  const worldVersionRef = useRef(0);
  /**
   * Review #484 M1: a megváltozott cellák (`vIdx`) — a világ-mesh csak ezeket és a szomszédjaikat frissíti (O(1) blokkonként).
   * `worldFullRef`: teljes újraépítés (új pálya, WebGL-visszaállás).
   */
  const dirtyCellsRef = useRef<number[]>([]);
  const rendererMemRef = useRef<{ geometries: number; textures: number } | null>(null);
  /** A 3D-rúnakövek (teszt-kampó: a vetített képernyő-téglalapjuk a takarás méréséhez, review #484 N1). */
  const stoneMeshesRef = useRef<THREE.Mesh[]>([]);
  const stoneProjVec = useMemo(() => new THREE.Vector3(), []);
  /** A kérdés nélkül tört Rúna-zárak száma a menetben (teszt-kampó, review #484 M5: kupon módban 0). */
  const freeLocksRef = useRef(0);
  /** Teszt-kampó (review #484 vak K6): a lap renderjeinek száma (nyitott kérdés alatti újrarajzolás mérése). */
  const renderCountRef = useRef(0);
  /** Teszt-kampó (diagnosztika, review #484 vak K1): az utolsó vászon-koppintás útja és a döntés oka. */
  const lastTapRef = useRef("");
  renderCountRef.current += 1;
  /**
   * Review #484 N1: a kövek képernyő-sávja (CSS px, a nézetablakhoz) — a kérdéskártya alja és a rúnagombok (álló) / az alsó
   * vezérlők (fekvő) teteje között, fekvőben a két rúnaoszlop között. A zár alatt ~5 Hz-cel frissül (DOM-mérés), a képkocka-
   * hurok ebből helyezi el a köveket a kamera előtt. `null`: nincs érvényes sáv (a kövek a mag kezdő elrendezésében maradnak).
   */
  const stoneBandRef = useRef<{ top: number; bottom: number; left: number; right: number; landscape: boolean } | null>(null);
  const worldFullRef = useRef(true);
  // Aktuális pálya konfigurációja — a render loop closure-ja ezen keresztül lát
  // mindig friss égszín / fény paramétereket.
  const activeLevelRef = useRef<LevelConfig>(LEVELS[0]!);
  const adaptiveRef = useRef(createAdaptiveSession(4));
  // Spec 2026-09-29-palyak-szoletra-nyelvek (E szelet): 10 pálya évfolyamonként (3–12.); a futás pályája a startkor rögzül.
  const runLevelRef = useRef<number | null>(null);
  /** A menet kezdő sávja: a pálya ideje ebből jön, a válaszok nem módosítják (végrehajtás J3a 3.). */
  const runStartBandRef = useRef(0.4);
  const levelClearedRef = useRef(false);
  /** A menet seedje (`?seed=` teszt-kampóval rögzíthető) és a menet sorszáma. */
  const seedRef = useRef<number | string>(readGameSeed() ?? seedFrom(BLOCK_CRAFT_GAME_ID, dayKey()));
  const runCounterRef = useRef(0);
  /** A kérdés-sorsolás seedelt RNG-je (menetenként újra — a determinizmus-őr a lapra is fut). */
  const pickRngRef = useRef<Rng>(createRng(seedFrom(BLOCK_CRAFT_GAME_ID, "init", "pick")));
  /** Kozmetikai véletlen (felhők, időjárás, por) — külön seedelt `fxRng` (KSZ-2). */
  const fxRngRef = useRef<Rng>(createRng(seedFrom(BLOCK_CRAFT_GAME_ID, "init", "fx")));
  /** A Rúnabánya magja (menetenként új). */
  const mineRef = useRef<RuneMine | null>(null);
  const fpsRef = useRef(60);

  const [phase, setPhase] = useState<Phase>("menu");
  /** A rossz válasz rövid rázása a rúnasoron (csökkentett mozgásnál nincs). */
  const [wrongShake, setWrongShake] = useState(false);
  const [totalXp, setTotalXp] = useState(0);
  const [runSeconds, setRunSeconds] = useState(0);
  /** E24: a „Bányász” gomb / koppintás célpont nélkül magyar segítő üzenetet ad (nem néma). */
  const [mineHint, setMineHint] = useState(false);
  // Achievement-toast queue: az "over" phase-be lépéskor töltődik fel.
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([]);
  const [levelIdx, setLevelIdx] = useState(0);
  const [levelStartXp, setLevelStartXp] = useState(0);
  /** Review #484 vak K2: a rúnaréteg szünetgombja éppen a kártya alá kerülne (megoldás-kijelzés) → rejtve. */
  const [quizPauseCovered, setQuizPauseCovered] = useState(false);
  const quizPauseCoveredRef = useRef(false);
  const levelStartAnswersRef = useRef({ correct: 0, total: 0 });
  const [gameWon, setGameWon] = useState(false);
  /** S11: szünet (a játékóra, a fizika és a render-ciklus áll). */
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  /** G-1 / J0c: a magyarázókártya — csak a „Miért?”-re nyílik (szünettel), nem magától. */
  const [why, setWhy] = useState<FeedbackCard | null>(null);
  const whyRef = useRef(false);
  whyRef.current = why !== null;
  /**
   * J0c-b (review #484, Vercel): a két sorra vágott kérdés „Mutasd” gombbal kibontva — olvasás közben szünet (a világ, a
   * pálya órája és a kérdés-óra is áll), a „Tovább” folytatja. Ugyanaz, mint a Matek / Szólétra `expanded` állapota.
   */
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(false);
  expandedRef.current = expanded;
  /** Csak teszt-kampó: a következő rúnazár kérdése (pl. a bank leghosszabb válaszai — a mobil mérő levágás-esete). */
  const forcedQuizRef = useRef<{ id: string; prompt: string; options: string[]; correctIndex: number } | null>(null);
  const forcedSeqRef = useRef(0);
  /** S11: a joystick futó húzásának megszakítása (szünet, fókuszvesztés) — a VirtualJoystick resetSignal-ja. */
  const [joyReset, setJoyReset] = useState(0);
  const [bestResult, setBestResult] = useState<{ best: number; isNewBest: boolean } | null>(null);
  const bestSubmittedRef = useRef(false);
  /** S11: a vezérlés-tipp minden pálya elején néhány másodpercig látszik (utána a vászon tiszta). */
  const [showHint, setShowHint] = useState(false);
  /** A WebGL-kontextus elveszett (K.4/7): szünet + „Grafika újraindítása” gomb. */
  const [glLost, setGlLost] = useState(false);
  /** A helyreállítási kísérlet nem hozta vissza a kontextust (natív vesztés): a réteg az oldal újratöltését kínálja. */
  const [glRestoreFailed, setGlRestoreFailed] = useState(false);
  const restoreGlRef = useRef<() => void>(() => {});
  const [hud, setHud] = useState<HudSnap>(EMPTY_HUD);
  const hudRef = useRef<HudSnap>(EMPTY_HUD);
  hudRef.current = hud;

  // Subject-breakdown: melyik tantárgyból hány jó választ adott.
  const [subjectStats, setSubjectStats] = useState<Record<QuizSubject, number>>(EMPTY_SUBJECTS);
  const [timeLeft, setTimeLeft] = useState(LEVELS[0]!.timeLimit);
  /** A pálya-óra igazsága (review #484 L3: a lejárat-döntés nem a `setTimeLeft` frissítőjében, mellékhatásként fut). */
  const timeLeftRef = useRef(LEVELS[0]!.timeLimit);
  const [achievement, setAchievement] = useState<string | null>(null);
  // Inventory (Minecraft-hotbar): kibányászott blokkok típusonként, lerakáshoz.
  const [inventory, setInventory] = useState<Partial<Record<number, number>>>({});
  const [selType, setSelType] = useState<number>(DIRT);
  /** Lebegő "+XP" jelzés a crosshair mellett sikeres bányászás után. */
  const [xpFloat, setXpFloat] = useState<{ amount: number; key: number; rune: boolean } | null>(null);
  const xpKeyRef = useRef(0);
  const scoreSubmittedRef = useRef(false);
  const phaseRef = useRef<Phase>("menu");
  // D1: ref-guard — a Three.js scene csak egyszer épül fel ugyanazon play-session-ban
  const sceneBuiltRef = useRef(false);
  // Dekoratív mozgás (felhő-sodródás, időjárás, víz-csillanás) a rendszer-beállítás szerint.
  const reducedMotion = useReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  // Keep refs in sync for the canvas loop / global key handlers (avoids stale closure)
  phaseRef.current = phase;
  reducedMotionRef.current = reducedMotion;
  inventoryRef.current = inventory;
  selTypeRef.current = selType;

  /** Rúnaréteg és élő HUD-elemek (közvetlen DOM-írás a képkocka-hurokból, React-render nélkül — KSZ-9). */
  const mineRingRef = useRef<HTMLDivElement>(null);
  const compassRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!wrongShake) return;
    const id = window.setTimeout(() => setWrongShake(false), 320);
    return () => window.clearTimeout(id);
  }, [wrongShake]);

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
   * → angol stb. Így egyenletes lesz a tananyag-elosztas. A keverés a menet seedelt RNG-jéből (determinizmus-őr).
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
    const rng = pickRngRef.current;
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
        const j = rng.int(i + 1);
        [arr[i], arr[j]] = [arr[j]!, arr[i]!];
      }
    }
    subjectPoolsRef.current = pools;
    subjectCursorsRef.current = new Map(subjectOrder.map((s) => [s, 0]));
    // Véletlen kezdő subject, hogy ne mindig angollal induljon a kör.
    subjectRoundRef.current = rng.int(subjectOrder.length);
    recentPromptsRef.current = [];
  }, [bank, subjectOrder]);

  // Automatikus rebuilder: ha a bank változik (pl. remote data beérkezik), újrakeverjük.
  useEffect(() => {
    rebuildSubjectPools();
  }, [rebuildSubjectPools, userGrade]);

  // S11: a pálya eleji vezérlés-tipp 6 s játékidő után eltűnik (szünet alatt az időzítő nem fut).
  useEffect(() => {
    if (!showHint || phase !== "play" || paused || coupon.expired) return;
    const id = window.setTimeout(() => setShowHint(false), 6000);
    return () => window.clearTimeout(id);
  }, [showHint, phase, paused, coupon.expired]);

  // A játékóra csak játék közben jár: szünet alatt áll (S11), a „Miért?” kártya olvasása alatt is (J0c), a lejárt
  // kupon után is (#58), és amíg a WebGL-környezet elveszett (review #484 L1: a játék áll, az óra se járjon). A pálya ideje
  // NEM függ a válaszok helyességétől (J3a: a régi időcsökkentés megszűnt).
  useEffect(() => {
    if (coupon.expired || why || expanded || glLost) return;
    if (phase !== "play" || paused) return;
    const id = setInterval(() => {
      // Review #484: a pálya-cél teljesülése után (a megoldás-kijelzés még fut) az óra áll — a határidő előtt teljesített
      // pálya nem járhat le (`levelClockTick`, szabály a magban). L3: a fázis és az óra ugyanabban a pillanatban olvasva.
      const minePhase = mineRef.current?.state().phase ?? "play";
      if (minePhase !== "play") return;
      const s = timeLeftRef.current;
      const next = levelClockTick(s, minePhase);
      timeLeftRef.current = next.timeLeft;
      setRunSeconds((r) => r + 1);
      setTimeLeft(next.timeLeft);
      if (next.expired) setPhase("over");
    }, 1000);
    return () => clearInterval(id);
  }, [phase, paused, coupon.expired, why, expanded, glLost]);

  /**
   * S11 / A8 — központi szóbank (közös napló a hét játékkal). `null`, amíg tölt / ha a betöltés hibázott: akkor a
   * kézi bankok mennek változatlanul. A bekötés EGY helyen kapcsolható ki: itt (`enabled`).
   */
  const vocab = useVocabQuizSource("en", true);

  /* ------------------------------------------------------------------------------------------------------------ */
  /* Kérdésforrás (K.2 forrásrend): tananyag → (ismétlés: a director) → évfolyam-bank / szóbank / saját bank        */
  /* ------------------------------------------------------------------------------------------------------------ */

  const bankRef = useRef(bank);
  bankRef.current = bank;
  const couponActiveRef = useRef(coupon.active);
  couponActiveRef.current = coupon.active;
  const userGradeRef = useRef(userGrade);
  userGradeRef.current = userGrade;
  const vocabRef = useRef(vocab);
  vocabRef.current = vocab;

  /**
   * Tananyag-elsőbbség (terv 4.4, J7): a nem látott lecke-kérdés a szóbank ÉS az évfolyam-bank előtt. Kupon módban
   * (lecke-kupon, van tananyag) CSAK tananyag jöhet (`couponOnly`, terv 8.6).
   */
  const pickMaterial = useCallback((accept?: (quiz: { id: string; prompt: string; options: string[]; correctIndex: number }) => boolean): PlayQuestion | null => {
    const sharedGrade = gradeForGame(userGradeRef.current);
    const couponMaterialOnly = couponActiveRef.current && bankRef.current.some((q) => q.fromMaterial);
    if (sharedGrade == null && !couponMaterialOnly) return null;
    const pool = bankRef.current.filter((q) => q.fromMaterial);
    const seen = gradeSeenRef.current;
    // J0c-b: a sávban elolvasható / beférő tétel előbb; a többi hátra kerül (nem jelöljük látottnak).
    const material = pickUnseenMaterial(accept ? pool.filter((q) => accept(toFourChoice(q))) : pool, seen) ?? pickUnseenMaterial(pool, seen);
    if (!material) return null;
    markGradeQuizSeen(seen, material);
    return materialPlayQuestion(toFourChoice(material), {
      subject: material.subject,
      coupon: couponMaterialOnly,
      ...(sharedGrade != null ? { grade: sharedGrade } : {}),
    });
  }, []);

  /**
   * Új tétel a meglévő választóval (S11 / A8): 3–12. évfolyamon a közös évfolyam-bank a közös tárgyak körforgásával (az
   * angol helyen a központi szóbank), különben / kiegészítésként a saját bank tárgy-rétegzett, ismétlés nélküli köre.
   */
  const pickFresh = useCallback((): PlayQuestion | null => {
    const sharedGrade = gradeForGame(userGrade);
    const couponMaterialOnly = coupon.active && bank.some((q) => q.fromMaterial);
    if (couponMaterialOnly) return null;
    const seen = gradeSeenRef.current;
    const pickRandom = () => pickRngRef.current.next();
    /**
     * S11 / A8: angol kérdés-helyen a központi szóbank (a tananyag-ág UTÁN). A szóbankos kérdés a futás saját
     * `seen`-jébe is bekerül, így a meglévő tartalmi duplikátum-szűrő is látja.
     */
    const fromVocab = (): PlayQuestion | null => {
      const vq: VocabQuiz | null = vocab?.next(vocabLevelForGrade(userGrade, adaptiveRef.current.band)) ?? null;
      if (!vq) return null;
      markGradeQuizSeen(seen, vq);
      return { ...vocabPlayQuestion(vq), subject: "english" };
    };
    /** Kézi angol kérdés: a helyes válasza a közös naplóba, hogy a szóbank ne kérdezze vissza ugyanazt a szót. */
    const manualEnglish = (q: Quiz): PlayQuestion => {
      if ((q.subject ?? "english") === "english" && !q.fromMaterial) vocab?.markExternal(q.options[q.correctIndex]!);
      return bankPlayQuestion(BLOCK_CRAFT_GAME_ID, toFourChoice(q), q.subject ?? "english");
    };
    if (sharedGrade != null) {
      for (let i = 0; i < GRADE_SUBJECTS.length; i++) {
        const subject = GRADE_SUBJECTS[gradeSubjectRoundRef.current++ % GRADE_SUBJECTS.length]!;
        // A választott tétel MINDIG fogy, akkor is, ha a szóbank váltja ki (Brain Rot #424 review-lelet).
        const slot = pickBlockCraftGradeSlot({
          subject,
          pick: () => pickGradeQuiz({ grade: sharedGrade, band: adaptiveRef.current.band, subjects: [subject], seen, rng: pickRandom }),
          seen,
          vocabNext: fromVocab,
        });
        if (!slot) continue;
        if (slot.kind === "vocab") return slot.quiz;
        const item = slot.item;
        if (item.subject === "english") vocab?.markExternal(item.options[item.correctIndex]!);
        return { ...gradePlayQuestion(item), subject: SUBJECT_OF_GRADE(item) };
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
          // Pool körbeért → újrakeverés (a menet seedelt RNG-jéből).
          for (let i = pool.length - 1; i > 0; i--) {
            const j = pickRngRef.current.int(i + 1);
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
          if (subj === "english" && !candidate.fromMaterial) {
            const vq = fromVocab();
            if (vq) return vq;
          }
          return manualEnglish(candidate);
        }
      }
      subjectCursorsRef.current.set(subj, cursor);
    }
    return null;
  }, [bank, rebuildSubjectPools, subjectOrder, userGrade, coupon.active, vocab]);
  const pickFreshRef = useRef(pickFresh);
  pickFreshRef.current = pickFresh;

  /** A közös ismétlési sorból csak a saját tétel jön vissza (szóbank angol, évfolyam-bank, saját bank, tananyag). */
  const ownsReviewKey = useCallback(
    (key: string) => key.startsWith("vocab:en:") || key.startsWith("grade:") || key.startsWith("mat:") || key.startsWith(`bank:${BLOCK_CRAFT_GAME_ID}:`),
    [],
  );
  const provider = useMemo<QuestionProvider>(
    () => ({
      get couponOnly() {
        return couponActiveRef.current && bankRef.current.some((q) => q.fromMaterial);
      },
      material: (ctx) => {
        const forced = forcedQuizRef.current;
        if (forced) {
          forcedQuizRef.current = null;
          return bankPlayQuestion(BLOCK_CRAFT_GAME_ID, forced);
        }
        return pickMaterial(ctx?.accept);
      },
      fresh: () => pickFreshRef.current(),
      legacyReviewFits: (it) => ownsReviewKey(it.key),
      restore: (it) => {
        if (!ownsReviewKey(it.key)) return null;
        const q = restoreReviewQuestion(it, {
          vocab: (l) => (l === "en" ? vocabRef.current : null),
          gradeItem: (id) => loadedGradeItems().find((g) => g.id === id) ?? null,
        });
        if (q) markGradeQuizSeen(gradeSeenRef.current, { id: q.quiz.id, prompt: q.quiz.prompt });
        return q;
      },
    }),
    [pickMaterial, ownsReviewKey],
  );

  /* ------------------------------------------------------------------------------------------------------------ */
  /* Kérdés-ütemező + kérdés-sáv (J0c) és a Rúnabánya magja                                                        */
  /* ------------------------------------------------------------------------------------------------------------ */

  const directorConfig = useMemo(() => blockCraftDirectorConfig(gradeForGame(userGrade) ?? null), [userGrade]);
  const directorApi = useQuestionDirector({ config: directorConfig, provider, startBand: 0.4, seed: seedRef.current });
  const speech = useGameSpeech();
  const qRef = useRef<ReturnType<typeof usePlayQuestion> | null>(null);
  /** A menet vége egyszer (pálya teljesítve) — a képkocka-hurok kéri. */
  const levelWonRef = useRef<() => void>(() => {});

  const q = usePlayQuestion({
    director: directorApi.director,
    speech,
    // A hang és a rezgés a lapon (rúna-hangok, `haptics("success" | "error")`), hogy a játék saját visszajelzése menjen.
    sound: false,
    haptics: false,
    onShow: (p: QuestionPresentation) => {
      mineRef.current?.noteShow(p);
      sfxWhoosh();
    },
    onOutcome: (o: QuestionOutcome, p: QuestionPresentation) => {
      mineRef.current?.applyOutcome(o, p);
      if (o.result === "aborted") return;
      const correct = o.result === "correct";
      adaptiveRef.current.answer(correct);
      if (o.pickedOriginalIndex !== null) maybeClaimCouponBonus(coupon, p.question.quiz.id, o.pickedOriginalIndex);
      if (correct) {
        sfxSuccess();
        haptics("success");
        const subj = (p.question.subject ?? "english") as QuizSubject;
        setSubjectStats((prev) => ({ ...prev, [subj]: (prev[subj] ?? 0) + 1 }));
      } else {
        sfxError();
        haptics("error");
        setWrongShake(true);
      }
    },
  });
  qRef.current = q;

  /** Egy fix lépés játékos-mozgása (voxel-fizika) — a mag hívja a fix lépésű hurokból (K.4/9, KSZ-4). */
  const movePlayer = useCallback((dtMs: number) => {
    const p = playerRef.current;
    const prev = prevPosRef.current;
    prev.x = p.x;
    prev.y = p.y;
    prev.z = p.z;
    const k = keysRef.current;
    const dt = dtMs / 1000;
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
        prev.x = p.x; prev.y = p.y; prev.z = p.z;
      }
    }
  }, []);

  const createMine = useCallback(
    (seed: number | string): RuneMine =>
      createRuneMine({
        seed,
        questions: () => qRef.current,
        minGapMs: directorConfig.minGapMs,
        player: () => playerRef.current,
        movePlayer,
      }),
    [directorConfig.minGapMs, movePlayer],
  );

  /** S11: minden mozgásjelző nullázása + a joystick futó húzásának és a körbenézésnek a megszakítása. */
  const touchLookRef = useRef<{ id: number; lastX: number; lastY: number; moved: number; look: boolean; downAt: number } | null>(null);
  /** A koppintás-sugár újrahasznált vektora (review #484 L4: nincs koppintásonkénti `new`). */
  const tapDirRef = useRef(new THREE.Vector3());
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
    mineRef.current?.release();
    setJoyReset((n) => n + 1);
  }, []);
  /** A játék saját pointer-lock elengedése (szünet, kör vége, „Miért?”) — ez NEM vált ki automatikus szünetet. */
  const selfUnlockRef = useRef(false);
  const releasePointerLock = useCallback(() => {
    if (typeof document === "undefined" || !document.pointerLockElement) return;
    selfUnlockRef.current = true;
    document.exitPointerLock?.();
  }, []);

  /**
   * Egyetlen pálya elindítása: a menet (XP, kombó, kristály, kérdés-statisztika) a pályák között megmarad, a pálya
   * friss, seedelt világgal indul. `resetSession`: új menet (új mag, új director, új seedek).
   */
  const beginLevel = useCallback((idx: number, options: { resetSession: boolean; carryXpFrom: number }) => {
    const cfg = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, idx))]!;
    activeLevelRef.current = cfg;
    const seed = seedRef.current;
    if (options.resetSession || !mineRef.current) {
      runCounterRef.current += 1;
      const n = runCounterRef.current;
      adaptiveRef.current.reset(userGrade ?? 4, runLevelRef.current);
      runStartBandRef.current = adaptiveRef.current.band;
      pickRngRef.current = createRng(seedFrom(BLOCK_CRAFT_GAME_ID, seed, "pick", n));
      fxRngRef.current = createRng(seedFrom(BLOCK_CRAFT_GAME_ID, seed, "fx", n));
      gradeSeenRef.current = createGradeQuizSeen();
      mineRef.current = createMine(seedFrom(seed, n));
      directorApi.reset(seedFrom(seed, n), adaptiveRef.current.band);
      bestSubmittedRef.current = false;
      setBestResult(null);
      setRunSeconds(0);
      setSubjectStats(EMPTY_SUBJECTS);
      rebuildSubjectPools();
    }
    const n = runCounterRef.current;
    const world = generateVoxelWorld(genCfgFor(cfg), createRng(seedFrom(BLOCK_CRAFT_GAME_ID, seed, "world", n, idx)).next);
    worldRef.current = world;
    worldFullRef.current = true;
    dirtyCellsRef.current.length = 0;
    worldVersionRef.current++;
    const spawn = findVoxelSpawn(world);
    const baseYaw = Math.PI * 0.25;
    playerRef.current = {
      x: spawn.x, y: spawn.y, z: spawn.z,
      vx: 0, vy: 0, vz: 0,
      yaw: baseYaw, pitch: -0.5, onGround: false,
    };
    prevPosRef.current = { x: spawn.x, y: spawn.y, z: spawn.z };
    // Az első rúnaérc a kezdő nézés irányában nő (cél-jelző: „Gyűjts N rúnaércet!”) — látszik, de nem a célkereszt alatt.
    const facing = lookDirection(baseYaw, 0);
    mineRef.current!.startLevel(world, idx, { x: facing.x, z: facing.z });
    // E24 + kanban #64: a kezdő nézés egy elérhető, bányászható SIMA blokkra mutat — a talajra / egy közeli blokkra, nem
    // a fák lombkoronájába (`groundStartTarget`) és nem a rúnaércre (az első koppintás bányászik, nem kérdez: terv 5.3 0–10 mp).
    const ground = groundStartTarget(spawn.y);
    const startLook = pickStartLook(world, spawn, baseYaw, -0.5, 3.2, (h) => ground(h) && h.t !== RUNE_ORE);
    playerRef.current.yaw = startLook.yaw;
    playerRef.current.pitch = startLook.pitch;
    qRef.current?.reset();
    pendingBurstRef.current = [];
    lookHitRef.current = null;
    setInventory({});
    setXpFloat(null);
    setAchievement(null);
    setWhy(null);
    setExpanded(false);
    setPaused(false);
    setShowHint(true);
    releaseMovement();
    setLevelStartXp(options.carryXpFrom);
    // Review #484 vak K4: a pálya-vége képernyő a PÁLYA jó válaszait mutatja (a menet eddigi összesítése levonva).
    {
      const ls = qRef.current?.director?.stats(mineRef.current?.clockMs() ?? 0);
      levelStartAnswersRef.current = { correct: ls?.correct ?? 0, total: (ls?.correct ?? 0) + (ls?.wrong ?? 0) + (ls?.timeouts ?? 0) };
    }
    const st = mineRef.current!.state();
    setHud({ runes: 0, goal: st.goal, crystals: st.crystals, combo: st.combo.count, multiplier: st.combo.multiplier, xp: st.xp, blocks: st.blocks, armed: false });
    // A pálya ideje a menet KEZDŐ sávjából (a választott nehézségi pályából) — a válaszok nem módosítják.
    timeLeftRef.current = adaptiveTimeBudget(cfg.timeLimit, runStartBandRef.current);
    setTimeLeft(timeLeftRef.current);
    setPhase("play");
    lastTRef.current = null;
  }, [rebuildSubjectPools, userGrade, releaseMovement, createMine, directorApi]);

  const startGame = useCallback(() => {
    runLevelRef.current = levels.level;
    levelClearedRef.current = false;
    scoreSubmittedRef.current = false;
    setLevelIdx(0);
    setGameWon(false);
    beginLevel(0, { resetSession: true, carryXpFrom: 0 });
  }, [beginLevel, levels.level]);

  /** Következő szint: az XP / kombó / kristály továbbvitt, a pálya friss. */
  const startNextLevel = useCallback(() => {
    const next = levelIdx + 1;
    if (next >= LEVELS.length) {
      // Utolsó pálya után „all clear” — a játék győzelmi állapotba lép.
      setGameWon(true);
      setPhase("over");
      return;
    }
    setLevelIdx(next);
    beginLevel(next, { resetSession: false, carryXpFrom: mineRef.current?.state().xp ?? 0 });
  }, [beginLevel, levelIdx]);

  const endRun = useCallback(() => {
    runningRef.current = false; // G1: loop stop (újraindítás a phase-effectből)
    cancelGameFrame(rafRef.current);
    lookHitRef.current = null;
    // S11: a kör vége a szünet menüből is jöhet — a nyitott kérdés „megszakítva” zárul, a kártya / szünet nem marad.
    qRef.current?.finish();
    setWhy(null);
    setExpanded(false);
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
    if (phaseRef.current !== "play") return;
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

  // Globális billentyűzet (Minecraft-séma): WASD/nyilak + Space + E (bányász, tartható) + F (lerakás) + 1-9 (hotbar)
  // + egér-nézelődés pointer lock alatt. Nyitott Rúna-zárnál az 1–4 a kérdés-sávé (InlineQuestion), nem a hotbaré.
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
      if (phaseRef.current !== "play" || pausedRef.current || whyRef.current) return;
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
        if (!e.repeat) mineStartRef.current();
      } else if (e.code === "KeyF") {
        e.preventDefault();
        placeActionRef.current();
      } else if (/^Digit[1-9]$/.test(e.code) && !qRef.current?.active()) {
        hotbarKeyRef.current(parseInt(e.code.slice(5), 10) - 1);
      }
    };
    const ku = (e: KeyboardEvent) => {
      setKey(e.code, false);
      if (e.code === "KeyE") mineEndRef.current();
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
    // folytatható (amikor a lockot a játék maga engedi el, az nem szünet).
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
    // KSZ-8 / K.4/1: a közös `createGameRenderer` (ACES, sRGB, a tier pixelarány-plafonja, low tieren antialias nélkül).
    const tier = detectLookTier();
    const budget = LOOK_BUDGET[tier];
    // Telefonos szint (low / medium): nincs árnyéktérkép (képpontonként 5 mintavétel volt), olcsó anyag, kisebb anizotrópia —
    // a kép mélységét sütött blokk-árnyék adja (lásd `shadeCell`). A high szint változatlan (#504).
    const lite = tier !== "high";
    const created = createGameRenderer(canvas, tier, { exposure: 1.0, shadows: !lite });
    if (!created) {
      // WebGL nélkül nincs 3D jelenet: a „Grafika újraindítása” réteg jelzi (a menü és a kilépés elérhető marad).
      setGlLost(true);
      return;
    }
    sceneBuiltRef.current = true;
    const renderer = created;
    // K.4/7 memória-mérés (review #484 M1): a three.js élő számlálói (geometriák, textúrák) a teszt-kampónak.
    rendererMemRef.current = renderer.info.memory;
    const shadowsOn = renderer.shadowMap.enabled;
    // K.4/7: elveszett WebGL-kontextus → szünet + „Grafika újraindítása”; visszaálláskor a világ újraépül.
    const onContextLost = (e: Event) => {
      e.preventDefault();
      setGlLost(true);
      pauseActionRef.current();
    };
    const onContextRestored = () => {
      setGlLost(false);
      setGlRestoreFailed(false);
      worldFullRef.current = true;
      worldVersionRef.current++;
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);
    // Review #484 (Vercel): a renderer.forceContextRestore() a WEBGL_lose_context kiterjesztést az ELVESZETT kontextustól kérné —
    // ott null, a gomb hatástalan. A kiterjesztést ezért az élő kontextustól, előre kérjük le. Natív vesztésnél a böngésző a
    // preventDefault után magától állítja vissza (webglcontextrestored); ha a kísérlet után sem jön vissza, a réteg az oldal
    // újratöltését kínálja (nincs néma, hatástalan gomb).
    const loseExt = renderer.getContext().getExtension("WEBGL_lose_context");
    restoreGlRef.current = () => {
      try {
        loseExt?.restoreContext();
      } catch {
        /* natív vesztés: a restoreContext nem alkalmazható — a lenti időzítő dönt */
      }
      window.setTimeout(() => {
        if (renderer.getContext().isContextLost()) setGlRestoreFailed(true);
      }, 2500);
    };
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
      // A panel százaléka a plafonos 100 %-ot skálázza (2026-11-21 vak kör L3): aktív plafonnál is három különböző felbontás.
      const ratio = scaledPixelRatio(width, height, basePixelRatio, perfScale, lightGraphics ? LIGHT_GRAPHICS_MAX_PIXELS : null);
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
    // 2. vak kör L2 (G-7): a megfigyelő az adott képkocka rAF-lépése UTÁN, a festés ELŐTT jelez — az a kép még a régi pufferrel
    // készült. Futó hurokban itt (a friss elrendezésből, képkockánkénti olvasás nélkül) azonnal alkalmazzuk az új méretet és
    // újrarajzolunk, így a festett első kép már az új méretű.
    const onParentResize = () => {
      sizeDirty = true;
      if (disposed || !runningRef.current || lastTRef.current === null) return;
      sizeDirty = false;
      const prevW = appliedW;
      const prevH = appliedH;
      syncSize();
      if (appliedW !== prevW || appliedH !== prevH) renderer.render(scene, camera);
    };
    const sizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onParentResize);
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
    // Review #484 M1: blokktípusonként EGY InstancedMesh (a draw call-ok száma nem nő), de a bányászás / lerakás / rúnaérc
    // csak a megváltozott cellát és 6 szomszédját frissíti (cserés törlés + hozzáfűzés), nem járja be a 48×14×48 rácsot.
    // A teljes újraépítés csak új pályánál és WebGL-visszaállásnál fut.
    type TypeMesh = { mesh: THREE.InstancedMesh; cells: number[] };
    const typeMeshes = new Map<number, TypeMesh>();
    const cellSlot = new Int32Array(WX * WY * WZ).fill(-1);
    const cellType = new Uint8Array(WX * WY * WZ);
    /** Szabad ég alatti vízfelszín-cellák (x, y, z hármasok) a csillanásokhoz (teljes újraépítéskor számolva — kozmetika). */
    const waterTops: number[] = [];
    const tmpMat = new THREE.Matrix4();
    // Sütött blokk-árnyék (#504, árnyéktérkép nélküli szinten): a példányszín a nap felőli átló takarásából. A J3a inkrementális
    // frissítése miatt cellánként számoljuk: új / áthelyezett példánynál, és a változott cella alatti átló celláinál.
    const shadeColor = new THREE.Color();
    const bakeShade = !shadowsOn;
    const occluderAt = (x: number, y: number, z: number): SunOccluder => {
      if (x < 0 || y < 0 || z < 0 || x >= WX || y >= WY || z >= WZ) return 0;
      const ot = worldRef.current[vIdx(x, y, z)]!;
      return ot === AIR || ot === WATER ? 0 : ot === LEAVES ? 1 : 2;
    };
    const shadeSlot = (tm: TypeMesh, t: number, slot: number, x: number, y: number, z: number) => {
      if (!bakeShade || t === WATER) return;
      const tint = SUN_SHADE_TINT[sunShadeAt(occluderAt, x, y, z, WY)]!;
      tm.mesh.setColorAt(slot, shadeColor.setRGB(tint[0], tint[1], tint[2]));
      if (tm.mesh.instanceColor) tm.mesh.instanceColor.needsUpdate = true;
    };
    const disposeTypeMeshes = () => {
      typeMeshes.forEach((tm) => {
        scene.remove(tm.mesh);
        tm.mesh.dispose();
      });
      typeMeshes.clear();
    };
    const makeTypeMesh = (t: number, capacity: number): TypeMesh | null => {
      const mat = activeMaterials.get(t);
      if (!mat) return null;
      const cap = Math.max(16, capacity);
      const mesh = new THREE.InstancedMesh(blockGeometry, mat as THREE.Material | THREE.Material[], cap);
      mesh.count = 0;
      // A példányszín-attribútum az első rajzolás előtt létezik (különben a shader példányszín nélkül fordulna le).
      if (bakeShade && t !== WATER) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      // A példányok a világ bármely pontjára kerülhetnek: a (lusta) befoglaló gömb elavulna → nincs mesh-szintű vágás.
      mesh.frustumCulled = false;
      if (t === WATER || t === LEAVES) mesh.renderOrder = 1;
      if (shadowsOn) {
        // A víz fogad árnyékot, de nem vet (áttetsző felszín).
        mesh.castShadow = t !== WATER;
        mesh.receiveShadow = true;
      }
      scene.add(mesh);
      return { mesh, cells: [] };
    };
    /** A cella látható típusa: vízoszlopból csak a felszín, szolidból csak a szabad lapú (exposed); 0 = nem látszik. */
    const visibleType = (w: VoxelWorld, x: number, y: number, z: number): number => {
      const t = w[vIdx(x, y, z)]!;
      if (t === AIR) return 0;
      if (t === WATER) return vGet(w, x, y + 1, z) === WATER ? 0 : WATER;
      return isExposed(w, x, y, z) ? t : 0;
    };
    const removeCell = (idx: number) => {
      const t = cellType[idx]!;
      if (t === 0) return;
      const tm = typeMeshes.get(t);
      const slot = cellSlot[idx]!;
      cellType[idx] = 0;
      cellSlot[idx] = -1;
      if (!tm || slot < 0) return;
      const last = tm.mesh.count - 1;
      if (slot !== last) {
        const moved = tm.cells[last]!;
        tm.mesh.getMatrixAt(last, tmpMat);
        tm.mesh.setMatrixAt(slot, tmpMat);
        if (tm.mesh.instanceColor) {
          tm.mesh.getColorAt(last, shadeColor);
          tm.mesh.setColorAt(slot, shadeColor);
          tm.mesh.instanceColor.needsUpdate = true;
        }
        tm.cells[slot] = moved;
        cellSlot[moved] = slot;
      }
      tm.cells.pop();
      tm.mesh.count = last;
      tm.mesh.instanceMatrix.needsUpdate = true;
    };
    const addCell = (idx: number, t: number, x: number, y: number, z: number) => {
      let tm = typeMeshes.get(t) ?? null;
      if (!tm) {
        tm = makeTypeMesh(t, 64);
        if (!tm) return;
        typeMeshes.set(t, tm);
      }
      if (tm.mesh.count >= tm.mesh.instanceMatrix.count) {
        // Betelt: kétszeres kapacitású mesh, a mátrixok átmásolva (ritka — a kezdő kapacitás bőséges).
        const grown = makeTypeMesh(t, tm.mesh.instanceMatrix.count * 2)!;
        for (let i = 0; i < tm.mesh.count; i++) {
          tm.mesh.getMatrixAt(i, tmpMat);
          grown.mesh.setMatrixAt(i, tmpMat);
          if (tm.mesh.instanceColor && grown.mesh.instanceColor) {
            tm.mesh.getColorAt(i, shadeColor);
            grown.mesh.setColorAt(i, shadeColor);
          }
        }
        if (grown.mesh.instanceColor) grown.mesh.instanceColor.needsUpdate = true;
        grown.mesh.count = tm.mesh.count;
        grown.cells = tm.cells;
        scene.remove(tm.mesh);
        tm.mesh.dispose();
        tm = grown;
        typeMeshes.set(t, tm);
      }
      const slot = tm.mesh.count;
      tmpMat.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
      tm.mesh.setMatrixAt(slot, tmpMat);
      tm.cells.push(idx);
      tm.mesh.count = slot + 1;
      tm.mesh.instanceMatrix.needsUpdate = true;
      cellSlot[idx] = slot;
      cellType[idx] = t;
      shadeSlot(tm, t, slot, x, y, z);
    };
    /** A (x, y, z) változása a nap felőli átlón alatta lévő cellák árnyalatát érinti: (x, y − k, z + k). */
    const reshadeBelow = (x: number, y: number, z: number) => {
      if (!bakeShade) return;
      for (let k = 1; y - k >= 0 && z + k < WZ; k++) {
        const ci = vIdx(x, y - k, z + k);
        const ct = cellType[ci]!;
        if (ct === 0) continue;
        const tm = typeMeshes.get(ct);
        const slot = cellSlot[ci]!;
        if (tm && slot >= 0) shadeSlot(tm, ct, slot, x, y - k, z + k);
      }
    };
    const refreshCell = (w: VoxelWorld, x: number, y: number, z: number) => {
      if (x < 0 || y < 0 || z < 0 || x >= WX || y >= WY || z >= WZ) return;
      const idx = vIdx(x, y, z);
      const want = visibleType(w, x, y, z);
      if (cellType[idx] === want) return;
      removeCell(idx);
      if (want !== 0) addCell(idx, want, x, y, z);
    };
    const rebuildWorld = () => {
      disposeTypeMeshes();
      cellSlot.fill(-1);
      cellType.fill(0);
      waterTops.length = 0;
      const w = worldRef.current;
      const byType = new Map<number, number[]>();
      for (let y = 0; y < WY; y++) {
        for (let z = 0; z < WZ; z++) {
          for (let x = 0; x < WX; x++) {
            const t = visibleType(w, x, y, z);
            if (t === 0) continue;
            let arr = byType.get(t);
            if (!arr) {
              arr = [];
              byType.set(t, arr);
            }
            arr.push(x, y, z);
            if (t === WATER && vGet(w, x, y + 1, z) === AIR) waterTops.push(x, y + 1, z);
          }
        }
      }
      byType.forEach((coords, t) => {
        const n = coords.length / 3;
        // Tartalék a bányászás / lerakás során előbukkanó új lapoknak (a növekedés ritka).
        const tm = makeTypeMesh(t, Math.ceil(n * 1.5) + 64);
        if (!tm) return;
        typeMeshes.set(t, tm);
        for (let i = 0; i < n; i++) addCell(vIdx(coords[i * 3]!, coords[i * 3 + 1]!, coords[i * 3 + 2]!), t, coords[i * 3]!, coords[i * 3 + 1]!, coords[i * 3 + 2]!);
      });
      renderer.shadowMap.needsUpdate = true;
      rebuildBeacons();
    };
    /** A megváltozott cellák és 6 szomszédjuk frissítése (M1). */
    const updateDirtyCells = (dirty: number[]) => {
      const w = worldRef.current;
      for (const idx of dirty) {
        const x = idx % WX;
        const z = Math.floor(idx / WX) % WZ;
        const y = Math.floor(idx / (WX * WZ));
        refreshCell(w, x, y, z);
        refreshCell(w, x + 1, y, z);
        refreshCell(w, x - 1, y, z);
        refreshCell(w, x, y + 1, z);
        refreshCell(w, x, y - 1, z);
        refreshCell(w, x, y, z + 1);
        refreshCell(w, x, y, z - 1);
        reshadeBelow(x, y, z);
      }
      renderer.shadowMap.needsUpdate = true;
      rebuildBeacons();
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
        // A típusonkénti példányhálók az új anyaggal épülnek újra (teljes újraépítés).
        worldFullRef.current = true;
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
            // A panel a teljes felső HUD alá kerül — a sort törő súgó és bányászjelzés alá is (2026-11-21 vak kör L4).
            getTopInset: () => {
              const hud = host.parentElement?.querySelector('[data-testid="bc-top-hud"]') ?? document.querySelector('[data-testid="bc-top-hud"]');
              return hud ? hud.getBoundingClientRect().bottom - host.getBoundingClientRect().top + 6 : 4;
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

    /** Kozmetikai véletlen (felhő, időjárás, por) — seedelt `fxRng`, a játékmenetet nem érinti (KSZ-2). */
    const fx = () => fxRngRef.current.next();

    // --- Rúna-zár: 4 lebegő rúnakő (pool, KSZ-6), színkódolt A/B/C/D betűvel (U-J3-1) ---
    const stoneGeo = new THREE.BoxGeometry(RUNE_STONE_SIZE, RUNE_STONE_SIZE, RUNE_STONE_SIZE);
    const letterTex = RUNE_LETTERS.map((letter, i) => {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      const g = c.getContext("2d");
      if (g) {
        g.fillStyle = "#1e1b2e";
        g.fillRect(0, 0, 64, 64);
        g.strokeStyle = RUNE_COLORS[i]!;
        g.lineWidth = 8;
        g.strokeRect(4, 4, 56, 56);
        g.fillStyle = RUNE_COLORS[i]!;
        g.font = "bold 44px sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(letter, 32, 35);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    });
    const stoneMats = letterTex.map(
      (tex, i) => new THREE.MeshStandardMaterial({ map: tex, emissive: new THREE.Color(RUNE_COLORS[i]!), emissiveMap: tex, emissiveIntensity: 0.6, roughness: 0.5 }),
    );
    const stones = stoneMats.map((m) => {
      // Review #484 N1: a kövek a képernyő szabad sávjában lebegnek a kamera előtt — a terep (az érc, egy domb) nem takarja őket.
      m.depthTest = false;
      m.depthWrite = false;
      // Az áttetsző menetben, utolsóként rajzolódnak (a lomb / víz áttetsző menete különben fölülírná őket).
      m.transparent = true;
      m.opacity = 1;
      const mesh = new THREE.Mesh(stoneGeo, m);
      mesh.visible = false;
      mesh.renderOrder = 10;
      scene.add(mesh);
      return mesh;
    });
    // A kövek képernyő-sávos elhelyezésének újrahasznált segédei (a képkocka-hurokban nincs foglalás).
    const aimTarget = { x: 0, y: 0, z: 0 };
    const slotDir = new THREE.Vector3();
    const camFwd = new THREE.Vector3();
    const oreCorner = new THREE.Vector3();
    const slotWorld: { x: number; y: number; z: number }[] = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }));
    const slotScreen: { x: number; y: number }[] = [0, 1, 2, 3].map(() => ({ x: 0, y: 0 }));
    /**
     * Review #484 N1: a 4 kő helye a képernyő szabad sávjában (2×2, a rúnagombok kiosztása szerint), a kamera előtt olyan
     * mélységben, hogy a vetített méretük a sávhoz illjen; az érc vetülete mellé kerülnek, ha van hely. A mag `tapRay`-e
     * ezekkel számol (`setLockStones`), az ércre célzott koppintás így sem választ (az érc-szabály a magban).
     */
    const placeStonesInBand = (ore: { x: number; y: number; z: number }, count: number): boolean => {
      const band = stoneBandRef.current;
      if (!band || count !== 4) return false;
      const rect = canvas.getBoundingClientRect();
      const bw = band.right - band.left;
      const bh = band.bottom - band.top;
      const pad = 4;
      // `box`: a forgó kocka vetített befoglaló mérete (px); a kocka élének vetülete ennek ~1/1,45-öde.
      const box = Math.min(84, (bh - 3 * pad) / 2, (bw - 4 * pad) / 4);
      if (box < 26) return false;
      const size = box / 1.45;
      // Az érc vetülete (8 sarok) — ha van mellette hely, a kőoszlopok az érc két oldalára kerülnek.
      let oreL = Infinity;
      let oreR = -Infinity;
      let oreT = Infinity;
      let oreB = -Infinity;
      for (let i = 0; i < 8; i++) {
        oreCorner.set(ore.x + (i & 1), ore.y + (i & 2 ? 1 : 0), ore.z + (i & 4 ? 1 : 0)).project(camera);
        if (oreCorner.z > 1) continue;
        const sx = rect.left + ((oreCorner.x + 1) / 2) * rect.width;
        const sy = rect.top + ((1 - oreCorner.y) / 2) * rect.height;
        oreL = Math.min(oreL, sx);
        oreR = Math.max(oreR, sx);
        oreT = Math.min(oreT, sy);
        oreB = Math.max(oreB, sy);
      }
      const leftRoom = oreL - band.left;
      const rightRoom = band.right - oreR;
      const xMinL = band.left + box / 2 + pad;
      const xMaxR = band.right - box / 2 - pad;
      const xL = leftRoom >= box + 2 * pad && leftRoom < bw ? Math.max(xMinL, band.left + leftRoom / 2) : xMinL;
      const xR = rightRoom >= box + 2 * pad && rightRoom < bw ? Math.min(xMaxR, band.right - rightRoom / 2) : xMaxR;
      // Két sor a sáv alján és tetején, legalább `box + pad` távolságra egymástól.
      const y1 = band.top + pad + box / 2;
      const y2 = Math.max(y1 + box + pad, band.bottom - pad - box / 2);
      // Álló: A bal-fent, B jobb-fent, C bal-lent, D jobb-lent; fekvő: A, B bal oszlop, C, D jobb (mint a rúnagombok).
      const order = band.landscape
        ? [[xL, y1], [xL, y2], [xR, y1], [xR, y2]]
        : [[xL, y1], [xR, y1], [xL, y2], [xR, y2]];
      // Review #484 vak K1: egy kő se lógjon az érc vetületére (ott az érc-szabály miatt a koppintás nem választana, és a
      // bányászó koppintás sem érheti el) — ütközésnél előbb vízszintesen az érc mellé, ha ott nincs hely, a sávon belül az
      // érc fölé / alá tolódik.
      const half = box / 2 + pad;
      for (const slot of order) {
        const hitsOre = () => slot[0]! + half > oreL && slot[0]! - half < oreR && slot[1]! + half > oreT && slot[1]! - half < oreB;
        if (!hitsOre()) continue;
        const left = slot[0]! <= (oreL + oreR) / 2;
        const nx = left ? oreL - half : oreR + half;
        if (nx - half >= band.left && nx + half <= band.right) {
          slot[0] = nx;
          continue;
        }
        const up = oreT - half;
        const down = oreB + half;
        if (slot[1]! <= (oreT + oreB) / 2 && up - half >= band.top) slot[1] = up;
        else if (down + half <= band.bottom) slot[1] = down;
        else if (up - half >= band.top) slot[1] = up;
      }
      // Mélység: a kocka (RUNE_STONE_SIZE) vetített mérete ≈ `size` px.
      const halfH = rect.height / 2;
      const depth = (RUNE_STONE_SIZE * halfH) / (Math.tan((camera.fov * Math.PI) / 360) * size);
      camera.getWorldDirection(camFwd);
      for (let i = 0; i < 4; i++) {
        const sx = order[i]![0]!;
        const sy = order[i]![1]!;
        slotScreen[i]!.x = sx;
        slotScreen[i]!.y = sy;
        const nx = ((sx - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        const ny = -((sy - rect.top) / Math.max(1, rect.height)) * 2 + 1;
        slotDir.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
        const t = depth / Math.max(0.2, slotDir.dot(camFwd));
        slotWorld[i]!.x = camera.position.x + slotDir.x * t;
        slotWorld[i]!.y = camera.position.y + slotDir.y * t;
        slotWorld[i]!.z = camera.position.z + slotDir.z * t;
      }
      return true;
    };
    // --- Rúnaérc-jelzőfény: vékony, áttetsző fényoszlop minden érc fölött (messziről is látszik) ---
    const beaconGeo = new THREE.BoxGeometry(0.18, 6, 0.18);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x8cf5e6, transparent: true, opacity: 0.35, depthWrite: false, fog: false });
    const beacons = new THREE.InstancedMesh(beaconGeo, beaconMat, 32);
    beacons.count = 0;
    beacons.frustumCulled = false;
    scene.add(beacons);
    const rebuildBeacons = () => {
      const ores = mineRef.current?.state().ores ?? [];
      const n = Math.min(32, ores.length);
      for (let i = 0; i < n; i++) {
        const o = ores[i]!;
        tmpMat.makeTranslation(o.x + 0.5, o.y + 4, o.z + 0.5);
        beacons.setMatrixAt(i, tmpMat);
      }
      beacons.count = n;
      beacons.instanceMatrix.needsUpdate = true;
    };
    const stoneColor = new THREE.Color();
    stoneMeshesRef.current = stones;

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
      const baseW = 7 + fx() * 7;
      const baseD = 4.5 + fx() * 3.5;
      const base = new THREE.Mesh(cloudGeo, cloudMat);
      base.scale.set(baseW, 1.3, baseD);
      g.add(base);
      // Keskenyebb „has” alul → alulról nézve is lépcsős, puha forma.
      const belly = new THREE.Mesh(cloudGeo, cloudMat);
      belly.scale.set(baseW * 0.72, 0.7, baseD * 0.7);
      belly.position.set((fx() - 0.5) * baseW * 0.15, -0.95, (fx() - 0.5) * baseD * 0.15);
      g.add(belly);
      const puffs = 1 + Math.floor(fx() * 3);
      for (let k = 0; k < puffs; k++) {
        const puff = new THREE.Mesh(cloudGeo, cloudMat);
        const pw = baseW * (0.3 + fx() * 0.3);
        const pd = baseD * (0.45 + fx() * 0.35);
        const ph = 1.1 + fx() * 1.1;
        puff.scale.set(pw, ph, pd);
        puff.position.set(
          (fx() - 0.5) * (baseW - pw) * 0.9,
          0.3 + ph * 0.5,
          (fx() - 0.5) * (baseD - pd) * 0.8,
        );
        g.add(puff);
      }
      g.position.set(
        -CLOUD_MARGIN + fx() * (WX + CLOUD_MARGIN * 2),
        WY + 10 + fx() * 6,
        -CLOUD_MARGIN + fx() * (WZ + CLOUD_MARGIN * 2),
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
        pos[i * 3] = p0.x + (fx() - 0.5) * 28;
        pos[i * 3 + 1] = p0.y + fx() * 14;
        pos[i * 3 + 2] = p0.z + (fx() - 0.5) * 28;
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
    const spawnBurst = (bx: number, by: number, bz: number, t: number, big: boolean) => {
      if (!big) {
        // Ütés (koppintós bányászás): csak néhány szikra a közös SparkleField-ből — nincs új geometria (KSZ-6).
        burstCenter.set(bx + 0.5, by + 0.5, bz + 0.5);
        sparkles.emit(burstCenter, { count: 5, color: MC_PAL[t]?.light ?? "#ffffff", speed: reducedMotionRef.current ? 0.6 : 2.2, life: 0.4, size: 0.1, spread: 0.5 });
        return;
      }
      const N = 16;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(N * 3);
      const vel = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = bx + 0.5 + (fx() - 0.5) * 0.6;
        pos[i * 3 + 1] = by + 0.5 + (fx() - 0.5) * 0.6;
        pos[i * 3 + 2] = bz + 0.5 + (fx() - 0.5) * 0.6;
        vel[i * 3] = (fx() - 0.5) * 3.4;
        vel[i * 3 + 1] = 1.5 + fx() * 3.2;
        vel[i * 3 + 2] = (fx() - 0.5) * 3.4;
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
      if (t === DIAMOND || t === IRON || t === COAL || t === RUNE_ORE) {
        sparkles.emit(center, {
          count: Math.max(5, Math.round((t === RUNE_ORE ? 30 : 16) * budget.particleScale)),
          color: t === RUNE_ORE ? "#5eead4" : t === DIAMOND ? "#b8f6ff" : "#ffe7a3",
          speed: calm ? 0.8 : 2.4,
          life: 1.1,
          size: 0.2,
          spread: 0.5,
        });
      }
    };

    const dirVec = new THREE.Vector3();
    const burstCenter = new THREE.Vector3();
    const glintPos = new THREE.Vector3();
    let glintAcc = 0;
    let disposed = false;
    let fpsAcc = 0;
    let fpsFrames = 0;

    const step = (now: number) => {
      if (disposed) return;
      // G1: leállított loop → nem ütemezünk új frame-et (újraindítás a phase-effectből).
      if (!runningRef.current) return;
      frameCountRef.current += 1;
      // #58: `requestGameFrame` — a lejárt kupon alatt a képkocka-hurok áll (a fenti futás-vezérlő mellett biztonsági háló).
      rafRef.current = requestGameFrame(step);
      const last = lastTRef.current ?? now;
      const realMs = Math.min(250, Math.max(0, now - last));
      // A kozmetika (felhő, por, időjárás) változó dt-vel fut; a JÁTÉKMENET a mag fix lépésű hurkában (K.4/9, KSZ-4).
      const dt = Math.min(0.05, Math.max(0.0001, realMs / 1000));
      // A hurok (újra)indulása (szünet / folytatás) a `lastTRef === null` — a panel ebből tudja, hogy a rés nem képkocka (L1).
      perf?.frameStart(now, lastTRef.current === null);
      // A hurok (újra)indulásának első képkockáján is mérünk: a vászon szülője ekkor válik láthatóvá.
      const restarted = lastTRef.current === null;
      lastTRef.current = now;
      fpsAcc += realMs;
      fpsFrames += 1;
      if (fpsAcc >= 500) {
        fpsRef.current = Math.round((fpsFrames * 1000) / fpsAcc);
        fpsAcc = 0;
        fpsFrames = 0;
      }
      if (sizeDirty || !sizeObserver || restarted) {
        sizeDirty = false;
        syncSize();
      }

      // Új pálya → új égbolt/köd/időjárás (a scene egyszer épül, a pálya viszont váltakozik).
      if (lookLevel !== activeLevelRef.current) applyLevelLook(activeLevelRef.current);
      const calm = reducedMotionRef.current;

      // --- A mag: célkereszt-cél → fix lépésű hurok (mozgás, bányászás, rúnaérc), kérdés-sáv, események ---
      const mine = mineRef.current;
      let alpha = 1;
      if (mine) {
        const lh = lookHitRef.current;
        // Review #484 vak K5: újrahasznált célobjektum (a mag a koordinátákat azonnal felhasználja / lemásolja) — nincs
        // képkockánkénti foglalás.
        if (lh && vMineable(lh.t)) {
          aimTarget.x = lh.x;
          aimTarget.y = lh.y;
          aimTarget.z = lh.z;
          mine.aim(aimTarget);
        } else mine.aim(null);
        alpha = mine.frame(realMs, pausedRef.current || whyRef.current || expandedRef.current);
        mine.drain(handleMineEventRef.current);
        // A pálya-cél után a futó megoldás-kijelzés még kifut (J0c), csak utána jön az eredményképernyő.
        if (mine.state().phase === "won" && qRef.current?.settled()) levelWonRef.current();
      }
      // Világ-mesh frissítés bányászás / lerakás / új rúnaérc után
      if (builtVersion !== worldVersionRef.current) {
        const dirty = dirtyCellsRef.current;
        if (worldFullRef.current || builtVersion < 0) rebuildWorld();
        else updateDirtyCells(dirty);
        worldFullRef.current = false;
        dirty.length = 0;
        builtVersion = worldVersionRef.current;
      }
      // Por-effektek a mag eseményeiből (ütés, kibányászott blokk, rúnaérc).
      for (const b of pendingBurstRef.current) spawnBurst(b.x, b.y, b.z, b.t, b.big);
      pendingBurstRef.current.length = 0;

      // --- Kamera a szemnél (két fix lépés között interpolálva) ---
      const p = playerRef.current;
      const pv = prevPosRef.current;
      camera.position.set(pv.x + (p.x - pv.x) * alpha, pv.y + (p.y - pv.y) * alpha + PLAYER_EYE, pv.z + (p.z - pv.z) * alpha);
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
      const mining = mine?.state().mining;
      let progress = 0;
      if (hit && vMineable(hit.t)) {
        highlight.visible = true;
        highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
        const pulse = calm ? 1 : 1 + Math.sin(now / 160) * 0.012;
        highlight.scale.setScalar(pulse);
        if (mining && hit.t !== RUNE_ORE && mining.key === vIdx(hit.x, hit.y, hit.z)) {
          progress = Math.min(1, Math.max(mining.pressing ? mining.pressMs / mineTimeMs(hit.t) : 0, mining.hits / 3));
        }
        hlMat.color.set(hit.t === RUNE_ORE ? 0x5eead4 : progress > 0 ? 0xff9f43 : 0xffe066);
      } else {
        highlight.visible = false;
      }
      // Bányászás-gyűrű a célkereszt körül (közvetlen DOM-írás, csak változáskor — KSZ-9).
      const ring = mineRingRef.current;
      if (ring) {
        const key = String(Math.round(progress * 20));
        if (ring.dataset.p !== key) {
          ring.dataset.p = key;
          ring.style.setProperty("--p", String(Number(key) / 20));
        }
      }

      // --- Rúna-zár: a rúnakövek a világban (a kérdés-sáv megoldás-kijelzéséig) ---
      const lock = mine?.state().lock ?? null;
      const view = qRef.current?.view();
      const shown = lock && view?.presentation && view.presentation.id === lock.presentationId ? lock : null;
      const rev = shown ? view?.reveal ?? null : null;
      // Review #484 N1: a kövek a képernyő szabad sávjába (a kamerához igazítva, képkockánként); a mag is ezt a helyet kapja.
      if (shown && mine && !shown.resolved && placeStonesInBand(shown.ore, shown.stones.length)) mine.setLockStones(slotWorld);
      for (let i = 0; i < stones.length; i++) {
        const s = stones[i]!;
        const at = shown?.stones[i];
        if (!at) {
          s.visible = false;
          continue;
        }
        s.visible = true;
        const bob = calm ? 0 : Math.sin(now / 380 + i * 1.3) * 0.06;
        s.position.set(at.x, at.y + bob, at.z);
        s.rotation.y = calm ? 0 : now / 900 + i;
        let scale = 1;
        let glow = 0.6;
        // Review #484 B1: élesítés (400 ms) — a kövek kicsiről nőnek és halványan izzanak; addig nem választhatók.
        const armT = mine && shown ? (mine.clockMs() - shown.openedAt) / Math.max(1, shown.armedAt - shown.openedAt) : 1;
        if (!rev && armT < 1) {
          scale = 0.35 + 0.65 * Math.max(0, armT);
          glow = 0.2;
        }
        if (rev) {
          // Hibánál a helyes rúna felvillan (nagyobb, izzik), a többi elhalványul (terv 5.3 Q1).
          if (i === rev.correctOptionIndex) {
            scale = 1.35;
            glow = 1.8;
          } else {
            scale = 0.75;
            glow = 0.12;
          }
        }
        s.scale.setScalar(scale);
        const mat = s.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = glow;
        if (rev && i === rev.correctOptionIndex) mat.emissive.copy(stoneColor.set("#4ade80"));
        else mat.emissive.copy(stoneColor.set(RUNE_COLORS[i]!));
      }

      // --- Iránytű a legközelebbi rúnaérchez (közvetlen DOM-írás) ---
      const comp = compassRef.current;
      if (comp && mine) {
        const st = mine.state();
        const near = st.lock && !st.lock.resolved ? null : nearestRune(st.ores, p.x, p.z);
        const visible = !!near?.ore && near.dist > 2.2;
        const hidden = visible ? "false" : "true";
        if (comp.dataset.hidden !== hidden) comp.dataset.hidden = hidden;
        if (visible && near?.ore) {
          const dx = near.ore.x + 0.5 - p.x;
          const dz = near.ore.z + 0.5 - p.z;
          const right = dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw);
          const fwd = -dx * Math.sin(p.yaw) - dz * Math.cos(p.yaw);
          comp.style.setProperty("--a", `${Math.atan2(right, fwd).toFixed(3)}rad`);
          const label = `${Math.round(near.dist)} m`;
          const span = comp.lastElementChild as HTMLElement | null;
          if (span && span.textContent !== label) span.textContent = label;
        }
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
          const i = Math.floor(fx() * (waterTops.length / 3)) * 3;
          const gx = waterTops[i]! + 0.15 + fx() * 0.7;
          const gz = waterTops[i + 2]! + 0.15 + fx() * 0.7;
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
            arr[i * 3] = p.x + (fx() - 0.5) * 28;
            arr[i * 3 + 1] = p.y + 7 + fx() * 8;
            arr[i * 3 + 2] = p.z + (fx() - 0.5) * 28;
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
    if (runningRef.current) rafRef.current = requestGameFrame(step);

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
      cancelGameFrame(rafRef.current);
      cameraRef.current = null;
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      restoreGlRef.current = () => {};
      for (const s of stones) scene.remove(s);
      stoneGeo.dispose();
      stoneMats.forEach((m) => m.dispose());
      letterTex.forEach((t) => t.dispose());
      scene.remove(beacons);
      beacons.dispose();
      beaconGeo.dispose();
      beaconMat.dispose();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      disposeTypeMeshes();
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
   * G1: render-loop vezérlés. A scene egyszer épül fel (fenti effect), a loop viszont a phase szerint indul / áll —
   * így új kör és következő pálya után is újraindul, míg levelComplete / over / menu alatt nem pörgeti a GPU-t. A
   * „Miért?” kártya olvasása alatt is áll (J0c: a magyarázat alatt az óra és a kérdés-óra áll).
   */
  useEffect(() => {
    // S11: szünetben a render-ciklus is áll (gyenge eszközön akkut is kímél).
    // #58: a lejárt kupon után is — a lejárati párbeszéd alatt a voxel-jelenet nem renderelhet tovább (a vászon az utolsó
    // képkockát mutatja). Szoftveres WebGL-en a futó ciklus minden bemenetet egy ~0,2–0,7 s-os képkockára várakoztatott.
    const shouldRun = phase === "play" && !paused && !why && !expanded && !glLost;
    if (!shouldRun || coupon.expired) {
      runningRef.current = false;
      cancelGameFrame(rafRef.current);
      return;
    }
    if (runningRef.current || !stepRef.current) return;
    runningRef.current = true;
    lastTRef.current = null; // dt-ugrás elkerülése a szünet után
    rafRef.current = requestGameFrame(stepRef.current);
  }, [phase, paused, why, expanded, glLost, coupon.expired]);

  // #58: lejáratkor a futó mozgás és a pointer lock elengedése a JÁTÉK kezdeményezésére (selfUnlock) — így a böngésző
  // Esc-es lock-elengedése nem nyit szünet menüt a lejárati párbeszéd alatt, és az egér szabadon eléri a gombot.
  useEffect(() => {
    if (!coupon.expired) return;
    releaseMovement();
    releasePointerLock();
  }, [coupon.expired, releaseMovement, releasePointerLock]);

  // A menet vége (időlejárat, kilépés): a nyitott kérdés „megszakítva” zárul (nem hiba, nem ismétlés — J0c).
  useEffect(() => {
    if (phase === "over" || phase === "menu") qRef.current?.finish();
  }, [phase]);

  /** A mag eseményei → kép + hang + rezgés ugyanabban a képkockában (K.4/18). A kérdés-hangot az `onOutcome` adja. */
  const handleMineEventRef = useRef<(e: RuneMineEvent) => void>(() => {});
  handleMineEventRef.current = (e: RuneMineEvent) => {
    if (e.type === "hit") {
      pendingBurstRef.current.push({ x: e.x, y: e.y, z: e.z, t: e.t, big: false });
      haptics("tap");
      sfxClick();
    } else if (e.type === "mined") {
      pendingBurstRef.current.push({ x: e.x, y: e.y, z: e.z, t: e.t, big: true });
      dirtyCellsRef.current.push(vIdx(e.x, e.y, e.z));
      worldVersionRef.current++;
      // A kibányászott blokk a hotbar-ba kerül (mob nem gyűjthető — Minecraft-logika).
      if ((PLACEABLE_ORDER as readonly number[]).includes(e.t)) {
        const minedType = e.t;
        setInventory((inv) => ({ ...inv, [minedType]: (inv[minedType] ?? 0) + 1 }));
      }
      sfxPickup();
      haptics("tap");
      if (e.xp > 0) setXpFloat({ amount: e.xp, key: ++xpKeyRef.current, rune: false });
      const st = mineRef.current?.state();
      if (e.t === DIAMOND && st?.diamonds === 1) setAchievement("Első gyémánt megtalálva!");
      else if (st?.blocks === 10) setAchievement("10. blokk kibányászva!");
    } else if (e.type === "runeOpen") {
      releasePointerLock();
    } else if (e.type === "runeBreak") {
      pendingBurstRef.current.push({ x: e.ore.x, y: e.ore.y, z: e.ore.z, t: RUNE_ORE, big: true });
      dirtyCellsRef.current.push(vIdx(e.ore.x, e.ore.y, e.ore.z));
      worldVersionRef.current++;
      setXpFloat({ amount: e.xp, key: ++xpKeyRef.current, rune: true });
      if (e.result === "free") {
        freeLocksRef.current += 1;
        sfxPickup();
      }
      if (e.result === "correct" && e.combo === 3) setAchievement("Kombó ×2 — dupla rúnaerő!");
      else if (e.result === "correct" && e.combo === 6) setAchievement("Kombó ×3 — rúnamester!");
    } else if (e.type === "runeSpawn" || e.type === "runeGone") {
      dirtyCellsRef.current.push(vIdx(e.ore.x, e.ore.y, e.ore.z));
      worldVersionRef.current++;
    } else if (e.type === "goal") {
      setAchievement("Megvan a jelzőtűz összes rúnaérce!");
    }
  };

  /** A pálya-cél teljesült és a megoldás-kijelzés lefutott → eredményképernyő (egyszer). */
  const levelWonFiredRef = useRef(false);
  levelWonRef.current = () => {
    if (levelWonFiredRef.current || phaseRef.current !== "play") return;
    levelWonFiredRef.current = true;
    runningRef.current = false; // G1: loop stop (újraindítás a phase-effectből)
    cancelGameFrame(rafRef.current);
    sfxLevelUp();
    releaseMovement();
    releasePointerLock();
    setPhase("levelComplete");
  };
  useEffect(() => {
    if (phase === "play") levelWonFiredRef.current = false;
  }, [phase, levelIdx]);

  /**
   * Review #484 N1: nyitott zárnál ~5 Hz-cel mérjük a kövek szabad sávját (a kérdéskártya alja és a rúnagombok / alsó vezérlők
   * között), és a kártya prompt-sorszámát (`--bc-pq-lines`) úgy korlátozzuk, hogy a kártya, a kősáv és a rúnagombok ne fedjék
   * egymást — a hosszabb szöveg a közös „Mutasd”-dal olvasható.
   */
  const lockVisible = phase === "play" && q.bind.presentation !== null;
  useEffect(() => {
    if (!lockVisible) {
      stoneBandRef.current = null;
      return;
    }
    const root = document.documentElement;
    const MIN_BAND = 84; // két kősor (≥ 30 px) + rések
    // CI #484 (betűkészlet-függés): a `data-long` fokozat karakterszámból becsül; szélesebb tartalék betűkészlettel (pl. a
    // Linux DejaVu Sans) a hosszú válaszok több sorba törnek, a gombsor a minimális (2 soros) kártyába nő. Ilyenkor a mért
    // ütközés alapján a gombok betűmérete lépcsőzetesen csökken (kérdésenként csak lefelé — nincs oda-vissza ugrálás).
    const RUNE_MIN_FS = 11;
    let runeFit: { key: string; fs: number | null } = { key: "", fs: null };
    const measure = () => {
      const canvas = canvasRef.current;
      const card = document.querySelector<HTMLElement>(".play-question[data-skin=\"mine\"] .play-question-card");
      const prompt = document.querySelector<HTMLElement>(".play-question[data-skin=\"mine\"] .play-question-prompt");
      const runes = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="bc-quiz"] .bc-rune'));
      if (!canvas || !card || runes.length === 0) return;
      const cr = canvas.getBoundingClientRect();
      const landscape = window.matchMedia("(max-height: 500px) and (min-width: 560px)").matches;
      const rr = runes.map((el) => el.getBoundingClientRect());
      const hud = document.querySelector<HTMLElement>("[data-game-hud]")?.getBoundingClientRect();
      const visibleRect = (sel: string) => {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return null;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 ? r : null;
      };
      let bottomLimit: number;
      let left = cr.left + 4;
      let right = cr.right - 4;
      if (landscape) {
        // Fekvő: a két rúnaoszlop között, a hotbar / az alsó vezérlők fölött.
        const mid = (cr.left + cr.right) / 2;
        for (const r of rr) {
          if (r.right <= mid) left = Math.max(left, r.right + 6);
          else if (r.left >= mid) right = Math.min(right, r.left - 6);
        }
        bottomLimit = cr.bottom - 6;
        for (const sel of ['[data-testid="bc-hotbar"]', ".bc-act-jump", '[data-testid="virtual-joystick"]']) {
          const r = visibleRect(sel);
          if (r && r.right > left && r.left < right) bottomLimit = Math.min(bottomLimit, r.top - 6);
        }
      } else {
        bottomLimit = Math.min(...rr.map((r) => r.top)) - 6;
        // A rúnaréteg szünetgombja (a gombsor fölött, jobbra) is takarna: a sáv fölötte végződik.
        // A helye akkor is számít, ha éppen rejtett (`visibility: hidden` — a doboza megmarad).
        const pauseEl = document.querySelector<HTMLElement>('[data-testid="bc-quiz-pause"]');
        const pause = pauseEl && getComputedStyle(pauseEl).display !== "none" ? pauseEl.getBoundingClientRect() : null;
        if (pause && pause.width > 0) bottomLimit = Math.min(bottomLimit, pause.top - 6);
      }
      // Jelölt sávok: (1) a kártya és a gombsor / alsó vezérlők között; (2) álló nézetben a gombsor ALATT, a tárcsa és az
      // akciógombok között (kis képernyőn, hosszú válaszoknál csak itt van hely). A nagyobb kőméretet adó nyer.
      type Band = { top: number; bottom: number; left: number; right: number; landscape: boolean };
      const boxOf = (b: Band) => Math.min(84, (b.bottom - b.top - 12) / 2, (b.right - b.left - 16) / 4);
      let belowBand: Band | null = null;
      if (!landscape) {
        const joy = visibleRect('[data-testid="virtual-joystick"]');
        const jump = visibleRect(".bc-act-jump");
        const hotbar = visibleRect('[data-testid="bc-hotbar"]') ?? visibleRect(".bc-bottom");
        belowBand = {
          top: Math.max(...rr.map((r) => r.bottom)) + 6,
          bottom: Math.min(cr.bottom, hotbar ? hotbar.top : cr.bottom) - 6,
          left: joy ? joy.right + 6 : cr.left + 4,
          right: jump ? jump.left - 6 : cr.right - 4,
          landscape: false,
        };
      }
      // A kártya prompt-sorszáma: a kártya ne lógjon a gombsorra; ha a kövek csak a kártya alatt férnek el, nekik is marad hely.
      const reserve = belowBand && boxOf(belowBand) >= 34 ? 0 : MIN_BAND;
      if (prompt) {
        const cs = getComputedStyle(prompt);
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.28;
        const pr = prompt.getBoundingClientRect();
        const chromeBelow = card.getBoundingClientRect().bottom - pr.bottom;
        const room = bottomLimit - reserve - pr.top - Math.max(0, chromeBelow);
        const lines = Math.max(2, Math.min(7, Math.floor(room / lh)));
        if (root.style.getPropertyValue("--bc-pq-lines") !== String(lines)) {
          root.style.setProperty("--bc-pq-lines", String(lines));
          // Review #484: a szűkebb korlát levághatja a korábban beférő promptot — a kérdés-sáv mérje újra („Mutasd”).
          window.dispatchEvent(new Event(PLAY_QUESTION_RECHECK_EVENT));
        }
        if (!landscape) {
          const key = runes.map((el) => el.textContent ?? "").join("\u0001");
          if (runeFit.key !== key) {
            runeFit = { key, fs: null };
            for (const el of runes) el.style.removeProperty("font-size");
          }
          const overlap = card.getBoundingClientRect().bottom - Math.min(...rr.map((r) => r.top));
          if (lines === 2 && overlap > -2) {
            const cur = runeFit.fs ?? (parseFloat(getComputedStyle(runes[0]!).fontSize) || 16);
            const next = Math.max(RUNE_MIN_FS, Math.floor(cur) - 1);
            if (next < cur) {
              runeFit.fs = next;
              for (const el of runes) el.style.setProperty("font-size", `${next}px`);
            }
          }
        }
      }
      const cardRect = card.getBoundingClientRect();
      const cardBottom = cardRect.bottom;
      // Review #484 vak K2: ha a kártya (pl. a megoldás-kijelzés „Miért?” sorával) a rúnaréteg szünetgombjára lóg, a gomb
      // rejtett marad (a HUD szünetgombja mindig elérhető); amint nem lóg rá, újra látszik.
      {
        const pauseEl = document.querySelector<HTMLElement>('[data-testid="bc-quiz-pause"]');
        const pr = pauseEl && getComputedStyle(pauseEl).display !== "none" ? pauseEl.getBoundingClientRect() : null;
        const covered = !!pr && pr.width > 0 && pr.top < cardRect.bottom && pr.bottom > cardRect.top && pr.left < cardRect.right && pr.right > cardRect.left;
        // Csak változáskor állítunk állapotot (az egyezésnél is lefutó frissítő a lapot 5 Hz-en újrarajzolná — K6).
        if (quizPauseCoveredRef.current !== covered) {
          quizPauseCoveredRef.current = covered;
          setQuizPauseCovered(covered);
        }
      }
      const top = Math.max(cardBottom, hud?.bottom ?? 0) + 6;
      const cands: Band[] = [{ top, bottom: bottomLimit, left, right, landscape }];
      if (belowBand) cands.push(belowBand);
      let best: Band | null = null;
      for (const c of cands) if (boxOf(c) >= 26 && (!best || boxOf(c) > boxOf(best))) best = c;
      stoneBandRef.current = best;
    };
    measure();
    const id = window.setInterval(measure, 200);
    return () => {
      window.clearInterval(id);
      stoneBandRef.current = null;
      root.style.removeProperty("--bc-pq-lines");
    };
  }, [lockVisible]);

  // HUD ≤ 10 Hz (KSZ-9): a mag állapotából pillanatkép, csak változáskor.
  useEffect(() => {
    if (phase !== "play") return;
    const id = window.setInterval(() => {
      const st = mineRef.current?.state();
      if (!st) return;
      const armed = mineRef.current?.lockArmed() ?? false;
      const h = hudRef.current;
      // Review #484 vak K6: csak tényleges változáskor állítunk állapotot — a funkcionális frissítő egyezésnél is lefuttatná a
      // 4000 soros lapot (10 Hz-en, a kérdés-sáv 10 Hz-e mellé).
      if (h.runes === st.opened && h.goal === st.goal && h.crystals === st.crystals && h.combo === st.combo.count && h.xp === st.xp && h.blocks === st.blocks && h.armed === armed) return;
      const next: HudSnap = { runes: st.opened, goal: st.goal, crystals: st.crystals, combo: st.combo.count, multiplier: st.combo.multiplier, xp: st.xp, blocks: st.blocks, armed };
      hudRef.current = next;
      setHud(next);
    }, 100);
    return () => window.clearInterval(id);
  }, [phase]);

  /* ---------------- „Miért?”: szünet + a valódi magyarázókártya (G-1) ---------------- */
  const openWhy = useCallback(() => {
    const item = qRef.current?.view().whyItem; // a vezérlő őrzi: az új kérdés nem írja felül (review #446)
    if (!item) return;
    releaseMovement();
    releasePointerLock();
    setWhy(
      buildFeedback({
        quiz: {
          prompt: item.quiz.prompt,
          options: item.quiz.options,
          correctIndex: item.quiz.correctIndex,
          // A séma `null`-t is enged (régi sor); a motor `undefined`-ot vár.
          explanation: item.quiz.explanation ?? undefined,
        },
        chosenIndex: item.pickedOriginalIndex,
        attempt: 1,
        ageBand: "kid",
      }),
    );
  }, [releaseMovement, releasePointerLock]);
  const closeWhy = useCallback(() => {
    lastTRef.current = null;
    setWhy(null);
  }, []);

  const startGameRef = useRef(startGame);
  startGameRef.current = startGame;

  /**
   * Teszt-kampó (review #484 N1): a látható rúnakövek vetített képernyő-téglalapja (CSS px, a nézetablakhoz), JSON-szövegként —
   * a kocka 8 sarkát vetítjük a kamerával. Csak a probe hívásakor számol (a képkocka-hurokban nincs költsége).
   */
  const stoneRectsNow = useCallback((): Array<{ x0: number; y0: number; x1: number; y1: number } | null> => {
    const cam = cameraRef.current;
    const canvas = canvasRef.current;
    if (!cam || !canvas) return [];
    const r = canvas.getBoundingClientRect();
    const v = stoneProjVec;
    return stoneMeshesRef.current.map((m) => {
      if (!m.visible) return null;
      const h = (RUNE_STONE_SIZE / 2) * m.scale.x;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < 8; i++) {
        v.set(m.position.x + (i & 1 ? h : -h), m.position.y + (i & 2 ? h : -h), m.position.z + (i & 4 ? h : -h)).project(cam);
        const sx = r.left + ((v.x + 1) / 2) * r.width;
        const sy = r.top + ((1 - v.y) / 2) * r.height;
        x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
      }
      return { x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(x1), y1: Math.round(y1) };
    });
  }, [stoneProjVec]);
  const stoneScreenRects = (): string => JSON.stringify(stoneRectsNow());
  /** Teszt-kampó: a nyitott zár ércének vetített képernyő-téglalapja (a kő ↔ érc átfedés méréséhez). */
  const oreScreenRect = (): string => {
    const cam = cameraRef.current;
    const canvas = canvasRef.current;
    const ore = mineRef.current?.state().lock?.ore;
    if (!cam || !canvas || !ore) return "null";
    const r = canvas.getBoundingClientRect();
    const v = stoneProjVec;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      v.set(ore.x + (i & 1), ore.y + (i & 2 ? 1 : 0), ore.z + (i & 4 ? 1 : 0)).project(cam);
      if (v.z > 1) continue;
      const sx = r.left + ((v.x + 1) / 2) * r.width;
      const sy = r.top + ((1 - v.y) / 2) * r.height;
      x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
    }
    return Number.isFinite(x0) ? JSON.stringify({ x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(x1), y1: Math.round(y1) }) : "null";
  };

  /* ---------------- teszt-kampó (K.2) ---------------- */
  useEffect(() => {
    return installGameTestApi({
      probe: () => {
        const mine = mineRef.current;
        const st = mine?.state();
        const ctl = qRef.current;
        const stats = ctl?.director?.stats(mine?.clockMs() ?? 0);
        const view = ctl?.view();
        return {
          simTime: mine?.loop.simTimeMs() ?? 0,
          questionOpen: ctl?.active() ? 1 : 0,
          questionsAnswered: stats?.answered ?? 0,
          questionsCorrect: stats?.correct ?? 0,
          fps: fpsRef.current,
          band: ctl?.director?.band() ?? null,
          intensity: ctl?.director?.intensity() ?? null,
          level: runLevelRef.current,
          adaptiveBand: adaptiveRef.current.band,
          timeBudget: adaptiveTimeBudget(LEVELS[0]!.timeLimit, runStartBandRef.current),
          // S11 kétujjas mérés: a nézés iránya és az előre-mozgás jelzője (1 / 0 — a probe típusa szám / szöveg).
          yaw: playerRef.current.yaw,
          moveFwd: keysRef.current.fwd || stickRef.current.y > 0 ? 1 : 0,
          phase: phaseRef.current,
          paused: pausedRef.current ? 1 : 0,
          frames: frameCountRef.current,
          runes: st?.opened ?? 0,
          runeGoal: st?.goal ?? 0,
          crystals: st?.crystals ?? 0,
          combo: st?.combo.count ?? 0,
          blocks: st?.blocks ?? 0,
          timeScale: mine?.loop.timeScale() ?? 1,
          lockOpen: st?.lock && !st.lock.resolved ? 1 : 0,
          reveal: view?.reveal ? 1 : 0,
          questionId: view?.presentation?.id ?? null,
          clock: mine?.clockMs() ?? 0,
          why: whyRef.current ? 1 : 0,
          expanded: expandedRef.current ? 1 : 0,
          armed: mine?.lockArmed() ? 1 : 0,
          timeLeft: timeLeftRef.current,
          pressing: st?.mining.pressing ? 1 : 0,
          stoneRects: stoneScreenRects(),
          oreRect: oreScreenRect(),
          questionKey: view?.presentation?.question.key ?? null,
          questionSource: view?.presentation?.question.source ?? null,
          freeLocks: freeLocksRef.current,
          renders: renderCountRef.current,
          lastTap: lastTapRef.current,
          runRunes: st?.runOpened ?? 0,
          stoneBand: JSON.stringify(stoneBandRef.current),
          geometries: rendererMemRef.current?.geometries ?? 0,
          textures: rendererMemRef.current?.textures ?? 0,
        };
      },
      forceState: (patch) => {
        if (patch.phase === "menu") setPhase("menu");
        if (patch.phase === "play" && phaseRef.current !== "play") startGameRef.current();
        if (patch.phase === "levelComplete" || patch.phase === "over") setPhase(patch.phase);
        // A következő rúnazár kérdése (teszt): a `question` és a `runeAhead` kampóval is használható.
        const quiz = (patch as { quiz?: unknown }).quiz as { prompt?: unknown; options?: unknown; correctIndex?: unknown } | undefined;
        if (quiz && typeof quiz.prompt === "string" && Array.isArray(quiz.options) && typeof quiz.correctIndex === "number") {
          forcedQuizRef.current = { id: `forced-${++forcedSeqRef.current}`, prompt: quiz.prompt, options: quiz.options.map(String), correctIndex: quiz.correctIndex };
        }
        // K.2: azonnali kérdés — rúnaérc a játékos elé és Rúna-zár (a „quiz” kompatibilis álnév, terv 9.).
        if (patch.question === true || patch.phase === "quiz") {
          const mine = mineRef.current;
          if (mine && phaseRef.current === "play") {
            const p = playerRef.current;
            const f = lookDirection(p.yaw, 0);
            const ore = mine.forceLock({ x: f.x, z: f.z });
            mine.drain(handleMineEventRef.current);
            if (ore) {
              // Mintha a gyerek odanézett és megérintette volna: a célkereszt az ércre mutat (a rúnakövek körülötte).
              const dx = ore.x + 0.5 - p.x;
              const dy = ore.y + 0.5 - (p.y + PLAYER_EYE);
              const dz = ore.z + 0.5 - p.z;
              p.yaw = Math.atan2(-dx, -dz);
              p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
            }
          }
        }
        // Review #484 teszt-kampók: `runeAhead` — rúnaérc a játékos elé, zár NÉLKÜL, a célkereszt rá (a megérintést a
        // teszt végzi valódi érintéssel); `timeLeft` — a pálya-óra hátralévő ideje (a kijelzés a következő óra-lépésben
        // frissül); `runesLeft` — ennyi rúnaérc hiányzik a pálya-célból.
        const extra = patch as { runeAhead?: unknown; timeLeft?: unknown; runesLeft?: unknown };
        const mineX = mineRef.current;
        if (mineX && phaseRef.current === "play") {
          if (typeof extra.runesLeft === "number") {
            const st = mineX.state();
            st.opened = Math.max(0, st.goal - extra.runesLeft);
          }
          if (typeof extra.timeLeft === "number") timeLeftRef.current = extra.timeLeft;
          if (extra.runeAhead === true) {
            const p = playerRef.current;
            const f = lookDirection(p.yaw, 0);
            const ore = mineX.placeRuneAhead({ x: f.x, z: f.z });
            mineX.drain(handleMineEventRef.current);
            if (ore) {
              const dx = ore.x + 0.5 - p.x;
              const dy = ore.y + 0.5 - (p.y + PLAYER_EYE);
              const dz = ore.z + 0.5 - p.z;
              p.yaw = Math.atan2(-dx, -dz);
              p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
            }
          }
        }
        if (typeof patch.gameWon === "boolean") setGameWon(patch.gameWon);
      },
    });
  }, []);

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

  /** A menet összesítője (eredményképernyő): a mag és a kérdés-statisztika (valós kérdés-számok — J3a adathiba). */
  const runSummary = () => {
    const st = mineRef.current?.state();
    const stats = qRef.current?.director?.stats(mineRef.current?.clockMs() ?? 0);
    const correct = stats?.correct ?? 0;
    const wrong = (stats?.wrong ?? 0) + (stats?.timeouts ?? 0);
    return {
      xp: st?.xp ?? 0,
      bestCombo: st?.combo.best ?? 0,
      crystals: st?.crystals ?? 0,
      blocks: st?.blocks ?? 0,
      diamonds: st?.diamonds ?? 0,
      runes: st?.opened ?? 0,
      runRunes: st?.runOpened ?? 0,
      goal: st?.goal ?? 0,
      correct,
      wrong,
      total: correct + wrong,
    };
  };

  useEffect(() => {
    if (phase !== "over" || !syncEligibility?.eligible || scoreSubmittedRef.current) return;
    scoreSubmittedRef.current = true;
    const sum = runSummary();
    void postGameScore({
      // D-04: új ranglista (új pontkulcs); a régi Kockavadász-rekordok a régi kulcs alatt archívak.
      gameId: BLOCK_CRAFT_SCORE_KEY,
      difficulty: "normal",
      runXp: sum.xp,
      // J3a / terv J12: a menet LEGJOBB kombó-sorozata (a régi kód a pillanatnyi sorozatot küldte).
      runStreak: sum.bestCombo,
      runSeconds,
      runId: newScoreRunId(),
    })
      .then(() => void queryClient.invalidateQueries({ queryKey: ["/api/games/leaderboard"] }))
      .catch(() => {
        scoreSubmittedRef.current = false;
      });
  }, [phase, syncEligibility, runSeconds]);

  /* S11 — legjobb eredmény: helyi mentés (névtelen látogatónál is működik), futásonként egyszer. */
  useEffect(() => {
    if (phase !== "over" || bestSubmittedRef.current) return;
    bestSubmittedRef.current = true;
    const xp = mineRef.current?.state().xp ?? 0;
    setBestResult(bestScore.submit(xp));
    setTotalXp((t) => t + xp);
  }, [phase, bestScore]);

  // Achievement + Daily Challenge tracking — az "over" phase átmenetnél egyszer fut.
  const achievementCheckedRef = useRef(false);
  useEffect(() => {
    if (phase !== "over") {
      achievementCheckedRef.current = false;
      return;
    }
    if (achievementCheckedRef.current) return;
    achievementCheckedRef.current = true;
    const sum = runSummary();
    const wasDailyAvailable = isTodaysGameAvailable("block-craft-quiz");
    const newOnes = recordRun({
      game: "block-craft-quiz",
      xpGained: sum.xp,
      // J3a: valós kérdés-statisztika (a director-ból), nem a kibányászott blokkok száma.
      correctAnswers: sum.correct,
      wrongAnswers: sum.wrong,
      maxStreak: sum.bestCombo,
      blocksMined: sum.blocks,
      diamondsMined: sum.diamonds,
      perfect: sum.correct >= 5 && sum.wrong === 0,
      fullClear: gameWon,
      highestLevel: levelIdx + 1,
    });
    if (wasDailyAvailable && gameWon) {
      const daily = markDailyCompleted();
      if (daily.achievements.length > 0) newOnes.push(...daily.achievements);
    }
    if (newOnes.length > 0) setNewlyUnlocked(newOnes);
    // Szándékosan csak `phase`-re iratkozunk fel — a recordRun egyszer fut "over" átmenetenként.
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

  /**
   * Bányászás a célkereszt alatti blokkon (E / bal klikk / Bányász gomb): nyomva tartva a blokktípus ideje alatt
   * kibányászza, rövid nyomás egy „ütés” (3 ütés = egy blokk); rúnaércen Rúna-zárat nyit. KÉRDÉS NÉLKÜL (J3a).
   * Review #484 B1: bányászó gesztus SOSEM választ rúnakövet (a válasz külön, szándékos gesztus: rúnagomb / rúnakőre
   * koppintás / 1–4 billentyű), és nyitott zár alatt nem is bányászik.
   */
  const startMine = useCallback(() => {
    if (pausedRef.current || phaseRef.current !== "play" || whyRef.current || expandedRef.current) return;
    const mine = mineRef.current;
    if (!mine) return;
    const lock = mine.state().lock;
    if (lock && !lock.resolved) return;
    const hit = lookHitRef.current;
    if (!hit || !vMineable(hit.t)) {
      // E24: nem néma — a gyerek megtudja, mit tegyen (menjen közelebb / nézzen egy blokkra).
      haptics("error");
      setMineHint(true);
      return;
    }
    mine.aim({ x: hit.x, y: hit.y, z: hit.z });
    mine.press();
  }, [haptics]);
  const endMine = useCallback(() => {
    mineRef.current?.release();
  }, []);

  useEffect(() => {
    if (!mineHint) return;
    const id = window.setTimeout(() => setMineHint(false), 3200);
    return () => window.clearTimeout(id);
  }, [mineHint]);

  /** Blokk-lerakás a célzott blokk megcélzott lapjára (F / jobb klikk / Lerak gomb). */
  const tryPlaceLook = useCallback(() => {
    if (pausedRef.current || phaseRef.current !== "play") return;
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
    dirtyCellsRef.current.push(vIdx(nx, ny, nz));
    worldVersionRef.current++;
    setInventory((inv) => ({ ...inv, [t]: Math.max(0, (inv[t] ?? 0) - 1) }));
  }, []);

  // E/F billentyű hídjai (a globális keydown handler ref-en keresztül hív).
  mineStartRef.current = startMine;
  mineEndRef.current = endMine;
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
        // Desktop: első kattintás = pointer lock; lock alatt bal = bányász (tartható), jobb = lerak.
        if (document.pointerLockElement !== canvas) {
          canvas.requestPointerLock?.();
          return;
        }
        if (e.button === 2) tryPlaceLook();
        else startMine();
        return;
      }
      lastTapRef.current = `le:${e.pointerType}:${Math.round(e.clientX)},${Math.round(e.clientY)}`;
      // Egy már futó körbenéző ujj mellett a második vászon-érintés nem veszi át a nézést.
      if (touchLookRef.current) {
        lastTapRef.current = `lenyomás-elnyelve:${touchLookRef.current.id}`;
        return;
      }
      canvas.setPointerCapture?.(e.pointerId);
      const rect = canvas.getBoundingClientRect();
      const look = isLookZone(e.clientX - rect.left, rect.width);
      // B1: a lenyomás kérdés-órás ideje — csak a zár élesítése UTÁN indult koppintás választhat rúnakövet.
      const downAt = mineRef.current?.clockMs() ?? 0;
      touchLookRef.current = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY, moved: 0, look, downAt };
    },
    [phase, paused, startMine, tryPlaceLook],
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
      if (e.pointerType === "mouse") {
        endMine();
        return;
      }
      const tl = touchLookRef.current;
      if (!tl || tl.id !== e.pointerId) {
        lastTapRef.current = `nincs-lenyomás:${tl ? `${tl.id}≠${e.pointerId}` : "null"}`;
        return;
      }
      touchLookRef.current = null;
      if (tl.moved >= 12 || pausedRef.current || whyRef.current || expandedRef.current || phaseRef.current !== "play") {
        lastTapRef.current = `kihagyva:moved=${Math.round(tl.moved)}`;
        return;
      }
      const mine = mineRef.current;
      if (!mine) return;
      // Rövid tap = egy „ütés” (3 ütés = egy blokk); rúnaércen Rúna-zár. Nyitott zárnál a koppintás csak akkor választ,
      // ha a rúnakövet a sugár első voxel-találata ELŐTT éri, és a lenyomás az élesítés után indult (review #484 B1) —
      // egyébként nyitott zár alatt nem történik semmi (nem bányászik, nem válaszol).
      // A koppintott képernyőpont felé lövünk sugarat (Minecraft mobil-viselkedés), tartalék a célkereszt-cél.
      const cam = cameraRef.current;
      const canvas = e.currentTarget;
      const lock = mine.state().lock;
      const lockOpenNow = !!lock && !lock.resolved;
      lastTapRef.current = `fel:zár=${lock ? (lock.resolved ? `kész(${lock.resolved})` : "nyitva") : "nincs"}:cam=${cam ? 1 : 0}`;
      if (cam) {
        const rect = canvas.getBoundingClientRect();
        const ndcX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        const ndcY = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
        const dir = tapDirRef.current.set(ndcX, ndcY, 0.5).unproject(cam).sub(cam.position).normalize();
        const hit = raycastVoxel(
          worldRef.current,
          cam.position.x, cam.position.y, cam.position.z,
          dir.x, dir.y, dir.z,
          5.2,
        );
        if (lockOpenNow) {
          // Review #484 vak K1: a látható kő találata a vetített képernyő-téglalapja alapján, a terep ELŐTT (a kövek a sávban,
          // mélységteszt nélkül rajzolódnak — a 3D sugár a talajnál elakadna). Ujjnyi ráhagyás 8 px; több találatnál a közelebbi
          // középpont nyer. Az érc-szabály és az élesítés a magban (`tapStone`).
          const px = e.clientX;
          const py = e.clientY;
          let best = -1;
          let bestD = Infinity;
          stoneRectsNow().forEach((sr, i) => {
            if (!sr || px < sr.x0 - 8 || px > sr.x1 + 8 || py < sr.y0 - 8 || py > sr.y1 + 8) return;
            const d = Math.hypot(px - (sr.x0 + sr.x1) / 2, py - (sr.y0 + sr.y1) / 2);
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          });
          if (best >= 0) {
            const ok = mine.tapStone(best, cam.position, dir, tl.downAt);
            const lk = mine.state().lock;
            lastTapRef.current = `kő:${best}:${ok ? "választott" : "elutasítva"}:down=${Math.round(tl.downAt)}:armed=${lk ? Math.round(lk.armedAt) : "-"}:clock=${Math.round(mine.clockMs())}`;
            return;
          }
          lastTapRef.current = `nincs-kő:${Math.round(px)},${Math.round(py)}:${JSON.stringify(stoneRectsNow())}`;
          // A voxel-találat távolsága (a blokk elülső lapjáig, közelítve): a kő csak ennél közelebb választható.
          const blockDist = hit ? Math.hypot(hit.x + 0.5 - cam.position.x, hit.y + 0.5 - cam.position.y, hit.z + 0.5 - cam.position.z) - 0.5 : Infinity;
          mine.tapRay(cam.position, dir, tl.downAt, blockDist);
          return;
        }
        if (hit && vMineable(hit.t)) {
          mine.hit({ x: hit.x, y: hit.y, z: hit.z });
          return;
        }
      }
      if (lockOpenNow) return;
      const look = lookHitRef.current;
      if (look && vMineable(look.t)) {
        mine.hit({ x: look.x, y: look.y, z: look.z });
        return;
      }
      haptics("error");
      setMineHint(true);
    },
    [endMine, haptics, stoneRectsNow],
  );

  const onCanvasPointerCancel = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "mouse") endMine();
    if (touchLookRef.current?.id === e.pointerId) touchLookRef.current = null;
  }, [endMine]);

  /**
   * A rúnagombok (a világban lebegő rúnakövek érinthető párjai): felengedéskor véglegesít, ha az ujj a gombon belül
   * engedett fel (C-52: több ujjnál a nem elsődleges mutatóra nincs `click` — a közös `pointerTapHandlers`).
   */
  const runeTaps = useMemo(() => createPointerTapTracker(), []);
  const onRune = useCallback((i: number) => {
    if (pausedRef.current || whyRef.current || expandedRef.current || phaseRef.current !== "play") return;
    mineRef.current?.pick(i);
  }, []);
  /**
   * Review #484 B1 + M2 (lapi védelem a közös `pointerTap.ts` jegyéig): a rúnagomb lenyomása csak élesített zárnál
   * kezdődhet (az élesítés előtt indult lenyomás felengedése sem válasz), és a gombon belül maradó, de
   * `RUNE_TAP_MOVE_PX`-nél hosszabb húzás (körbenézés) sem az.
   */
  const runeDownsRef = useRef(new Map<number, { x: number; y: number }>());
  const runeHandlers = (i: number) => {
    const h = pointerTapHandlers(runeTaps, i, () => onRune(i), {
      onDown: (e) => {
        if (!mineRef.current?.lockArmed()) return true;
        runeDownsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        return false;
      },
    });
    return {
      ...h,
      onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
        const d = runeDownsRef.current.get(e.pointerId);
        runeDownsRef.current.delete(e.pointerId);
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > RUNE_TAP_MOVE_PX) {
          e.stopPropagation();
          runeTaps.cancel(e.pointerId);
          return;
        }
        h.onPointerUp(e);
      },
      onPointerCancel: (e: ReactPointerEvent<HTMLButtonElement>) => {
        runeDownsRef.current.delete(e.pointerId);
        h.onPointerCancel(e);
      },
    };
  };

  // S11 — a keret állapota és a HUD adatai.
  const cfg = activeLevelRef.current;
  const timeBudget = adaptiveTimeBudget(cfg.timeLimit, runStartBandRef.current);
  const inRun = phase === "play";
  const screenState: GameScreenState =
    phase === "menu" ? "start" : inRun ? (paused ? "paused" : "playing") : "result";
  const timeTone: "default" | "warn" | "bad" =
    timeLeft <= timeBudget * 0.15 ? "bad" : timeLeft <= timeBudget * 0.3 ? "warn" : "default";
  // Telefonon 3 stat fér el csonkítás nélkül (360 px); a rúnakristály a chipsorban (iránytű mellett) látszik.
  const hudStats: GameHudStat[] = [
    { id: "xp", label: "XP", value: hud.xp },
    { id: "runes", label: "Rúnaérc", value: `${hud.runes}/${hud.goal}`, tone: hud.runes >= hud.goal ? "good" : "default" },
    { id: "combo", label: "Kombó", value: hud.combo > 0 ? `×${hud.multiplier} (${hud.combo})` : "—", tone: hud.multiplier >= 2 ? "good" : "default" },
  ];
  const isLastLevel = levelIdx >= LEVELS.length - 1;
  const levelName = cfg.name.replace(/^\d+\.\s*/, "");
  const selCount = inventory[selType] ?? 0;
  const presentation = q.bind.presentation;
  const reveal = q.bind.reveal;
  /** B1: a zár élesítve (a gombok addig halványak; a bemenetet a mag szűri, ez csak a kép). */
  const armed = hud.armed;
  /**
   * Látszik a Rúna-zár (nyitott kérdés vagy a megoldás-kijelzése): a Lerak / Bányász gomb ilyenkor a rúnakövek helyét
   * adja át (keskeny telefonon a rúnasor és az akciógombok különben fednék egymást).
   */
  const lockOpen = inRun && presentation !== null;
  const summary = phase === "levelComplete" || phase === "over" ? runSummary() : null;
  const wrongItems = summary ? q.director?.wrongList() ?? [] : [];

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
            title="Kockavadász: Rúnabánya"
            subtitle="Bányássz szabadon a kockavilágban, és nyisd ki a világító rúnaérceket! A jó rúnakő dupla zsákmányt hoz."
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
                  kidMission="Bányássz blokkokat egy kockavilágban: tartsd nyomva a Bányász gombot, vagy koppints háromszor a blokkra — itt nincs kérdés. A világító rúnaércnél Rúna-zár nyílik: a jó válaszú rúnakőre koppintva dupla rúnakristályt kapsz, rossz válasznál megmutatjuk a jót, és később újra megkérdezzük. Gyűjtsd össze a pálya rúnaérceit a jelzőtűzhöz!"
                  parentBody={
                    <>
                      <strong className="text-lime-100/90">Tananyag:</strong> a rúnazárak kérdései — a tananyagod kérdései elsőként, utána az évfolyam közös kérdésbankja (tárgyak körforgásával), angol szókincs a központi szóbankból, és a játék saját bankja (angol, angol matek, matek, környezet). A rosszul megválaszolt kérdés néhány kérdés múlva visszatér (ismétlés).
                      <br />
                      <strong className="text-lime-100/90">Fejleszt:</strong> olvasásértés gyors döntés mellett, fejszámolás, idegen nyelvi gondolkozás, természettudományos összefüggés-látás, térbeli tájékozódás és kéz-szem koordináció (billentyű / érintés).
                      <br />
                      <span className="text-white/70">
                        A játék az elsődleges (szabad bányászás, építés, felfedezés); a kérdés a játék része: a jó válasz játékbeli előnyt ad (dupla zsákmány, kombó), a rossz csak kisebbet — a játék közben nem áll meg.
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
                          {lv.runeGoal} rúnaérc · {Math.floor(lv.timeLimit / 60)}:{String(lv.timeLimit % 60).padStart(2, "0")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-wrap gap-1.5" aria-hidden="true">
                  {[GRASS, DIRT, SAND, STONE, WATER, LOG, LEAVES, COAL, IRON, DIAMOND, RUNE_ORE].map((t) => <MenuBlock key={t} t={t} />)}
                </div>
                <p className="text-sm text-white/80">
                  {touchCapable
                    ? "Bal hüvelykujj: mozgás (tárcsa) · jobb hüvelykujj: körbenézés húzással · Bányász gomb nyomva tartva vagy 3 koppintás a blokkra: bányászás · rúnaérc: Rúna-zár, koppints a jó rúnakőre."
                    : "WASD mozgás, Space ugrás, E (nyomva tartva) bányászás, F lerakás, 1–9 blokkválasztás, rúnazárnál 1–4 válasz, P szünet."}
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
            {/* Célkereszt (Minecraft-stílusú kereszt, sötét kontúrral minden háttéren látható) + bányászás-gyűrű */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
              <div ref={mineRingRef} className="bc-mine-ring" data-p="0" data-testid="bc-mine-ring" />
              <span className="absolute left-1/2 top-1/2 h-6 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow-[0_0_0_1.5px_rgba(0,0,0,0.55)]" />
              <span className="absolute left-1/2 top-1/2 h-[3px] w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow-[0_0_0_1.5px_rgba(0,0,0,0.55)]" />
            </div>
            <AnimatePresence>
              {xpFloat && (
                <motion.div
                  key={xpFloat.key}
                  className={`pointer-events-none absolute left-1/2 top-[40%] -translate-x-1/2 font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] ${xpFloat.rune ? "text-teal-200 text-3xl" : "text-amber-300 text-xl"}`}
                  initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.7 }}
                  animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: -28, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.6, ease: "easeOut" }}
                >
                  +{xpFloat.amount} XP
                </motion.div>
              )}
            </AnimatePresence>

            {/* HUD a vászon tetején (S2 GameHud: idő, XP, rúnaérc-cél, kombó, kristály; 48 px-es szünet gomb). */}
            {inRun && (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col" data-testid="bc-top-hud">
                <GameHud
                  stats={hudStats}
                  onPause={pauseGame}
                  progress={{ value: timeLeft, max: timeBudget, label: `${timeLeft} mp`, tone: timeTone }}
                />
                <div
                  className="bc-chips mt-1.5 flex flex-wrap items-center gap-1.5"
                  data-lock={lockOpen ? "true" : "false"}
                  style={{ paddingLeft: "max(8px, var(--game-safe-left))", paddingRight: "max(8px, var(--game-safe-right))" }}
                >
                  <span
                    className={`rounded-full border bg-slate-950/75 px-3 py-1 text-xs font-extrabold uppercase tracking-wide backdrop-blur-sm ${
                      cfg.isBossLevel ? "border-rose-400 text-rose-200" : "border-lime-300/45 text-lime-100"
                    }`}
                    data-testid="bc-level-chip"
                  >
                    {cfg.isBossLevel ? `★ ${levelName}` : `Pálya ${cfg.id}/${LEVELS.length} · ${levelName}`}
                    {cfg.weather !== "clear" && (
                      <span className="ml-1.5" title={cfg.weather}>
                        {cfg.weather === "rain" ? "🌧" : cfg.weather === "snow" ? "❄" : "🏜"}
                      </span>
                    )}
                  </span>
                  <span className="bc-crystals" data-testid="bc-crystals">
                    <Gem className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Rúnakristály:</span>
                    {hud.crystals}
                  </span>
                  <div ref={compassRef} className="bc-compass" data-hidden="true" data-testid="bc-compass" aria-hidden="true">
                    <ArrowBigUp className="bc-compass-arrow" />
                    <span className="bc-compass-dist">–</span>
                  </div>
                  {mineHint && !paused && (
                    <span
                      role="status"
                      data-testid="bc-mine-hint"
                      className="rounded-full border border-amber-300/60 bg-slate-950/85 px-3 py-1 text-xs font-bold text-amber-100 backdrop-blur-sm"
                    >
                      Nincs blokk a célkereszt alatt — menj közelebb, és nézz egy blokkra!
                    </span>
                  )}
                  {showHint && !presentation && (
                    <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-sm" data-testid="bc-goal-hint">
                      {`Gyűjts ${hud.goal} rúnaércet a jelzőtűzhöz! A fényoszlop mutatja az utat.`}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/*
              J3a Rúna-zár — a világban lebegő rúnakövek érinthető párjai (színkód + betű, U-J3-1), a válasz szövegével.
              Nem modális: a játék alatta lassítva fut, a joystick és a körbenézés működik. Testid: `bc-quiz` (K.2 / terv 9.).
            */}
            {inRun && presentation && (
              <div
                className={`bc-runes ${wrongShake && !reducedMotion ? "animate-shake" : ""}`}
                data-testid="bc-quiz"
                data-state={reveal ? "reveal" : "open"}
                data-long={presentation.options.some((o) => o.label.length > 60) ? "xl" : presentation.options.some((o) => o.label.length > 22) ? "true" : "false"}
                role="group"
                aria-label="Rúnakövek — koppints a jó válaszra"
              >
                {/* A rúnasornál is lehet megállni (#426 review-lelet: a kérdés közben a szünet kéznél legyen). */}
                <button
                  type="button"
                  data-testid="bc-quiz-pause"
                  aria-label="Szünet"
                  onClick={pauseGame}
                  className="bc-rune-pause"
                  data-covered={quizPauseCovered ? "true" : undefined}
                  aria-hidden={quizPauseCovered ? true : undefined}
                  tabIndex={quizPauseCovered ? -1 : undefined}
                >
                  <Pause className="h-5 w-5" fill="currentColor" strokeWidth={0} aria-hidden="true" />
                </button>
                {presentation.options.map((opt, i) => {
                  const st = !reveal ? "idle" : i === reveal.correctOptionIndex ? "correct" : i === reveal.pickedOptionIndex ? "wrong" : "dim";
                  return (
                    <button
                      key={`${presentation.id}-${i}`}
                      type="button"
                      className="bc-rune"
                      data-testid={`bc-rune-${i}`}
                      data-state={st}
                      aria-disabled={reveal || paused ? "true" : undefined}
                      style={{ "--rune": RUNE_COLORS[i] ?? "#94a3b8" } as CSSProperties}
                      data-armed={armed ? "true" : "false"}
                      {...runeHandlers(i)}
                      // A teszt-jelölő (`data-correct`, csak teszt-kampós buildben) a VÁLASZTHATÓ célt jelöli: élesítés előtt
                      // (review #484 B1, 400 ms) a rúnagomb még nem válaszcél, így a mérők is az élesítés után koppintanak.
                      {...(armed ? correctDataAttrs(opt.correct) : {})}
                    >
                      <span className="bc-rune-letter" aria-hidden="true">{RUNE_LETTERS[i] ?? i + 1}</span>
                      <span className="bc-rune-label">{opt.label}</span>
                      {st === "correct" && <span className="sr-only"> — a jó válasz</span>}
                      {st === "wrong" && <span className="sr-only"> — ezt választottad</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {glLost && inRun && (
              <div className="bc-gl-lost" role="alert" data-testid="bc-gl-lost">
                <p className="text-base font-bold text-white">
                  {glRestoreFailed
                    ? "A grafika nem indult újra. Töltsd újra az oldalt."
                    : "A grafika leállt. Indítsd újra, és folytathatod."}
                </p>
                {glRestoreFailed ? (
                  <button type="button" className="game-btn game-btn-primary" onClick={() => window.location.reload()}>
                    <RefreshCw className="h-5 w-5" aria-hidden="true" />
                    Oldal újratöltése
                  </button>
                ) : (
                  <button
                    type="button"
                    className="game-btn game-btn-primary"
                    onClick={() => {
                      restoreGlRef.current();
                    }}
                  >
                    <RefreshCw className="h-5 w-5" aria-hidden="true" />
                    Grafika újraindítása
                  </button>
                )}
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
                {/* Akciógombok ívben a jobb alsó sarokban: Ugrás a legnagyobb, mellette Bányász (tartható), fölötte Lerak. */}
                <div className="bc-actions" data-lock={lockOpen ? "true" : "false"} style={{ pointerEvents: "none" }}>
                  <button
                    type="button"
                    className="game-action-btn bc-act bc-act-place pointer-events-auto"
                    onClick={tryPlaceLook}
                    disabled={selCount <= 0 || lockOpen}
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
                  <HoldButton
                    // Review #484 M3: a zár nyitása / zárása, szünet és fókuszvesztés (joyReset) újracsatolja a gombot — a
                    // letiltott gombra el nem jutó felengedés nem ragasztja be a tartást (a mag is elengedi).
                    key={`mine-${lockOpen ? "lock" : "free"}-${joyReset}`}
                    label="Bányász"
                    className="game-action-btn bc-act bc-act-mine pointer-events-auto"
                    disabled={lockOpen}
                    onHoldStart={startMine}
                    onHoldEnd={endMine}
                  >
                    <Pickaxe className="h-7 w-7" aria-hidden="true" />
                    <span className="bc-act-label" aria-hidden="true">Bányász</span>
                  </HoldButton>
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
                  Billentyűzet: WASD mozgás · Space ugrás · E (tartva) bányász · F lerak · 1–9 blokk · P szünet
                </p>
              )}
            </div>
          )}
        </div>
      </main>

      {/*
        J0c kérdés-sáv (nem modális, a HUD alatt): prompt + időcsík + „Miért?” + szünetgomb. A válaszcélok a rúnakövek
        (fent, `bc-quiz`); a sáv rejtett gombsora billentyűvel (1–4) érhető el (terv 8.11).
      */}
      {inRun && (
        <InlineQuestion
          {...q.bind}
          mode="bar"
          skin="mine"
          disabled={paused || why !== null || expanded}
          onPick={(i) => {
            // B1: a billentyűs (1–4) választás is csak élesített zárnál (a mag dönt, a kérdés-óra szerint).
            mineRef.current?.pick(i);
          }}
          onExpand={() => setExpanded(true)}
          onCollapse={() => setExpanded(false)}
          onWhy={openWhy}
          testId="bc-question"
          promptTestId="bc-prompt"
          optionTestId={(i) => `bc-option-${i}`}
        />
      )}

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
      {/* „Miért?”: a magyarázókártya (G-1) — szünetben a kártya a menü alá nem kerülhet (z-90 > z-80): addig elrejtjük. */}
      {why && !paused && <QuizFeedbackCard card={why} onDismiss={closeWhy} />}

      {/* Review #484: a helyreállító réteg idejére a szünetmenü rejtve (különben eltakarná és inert-té tenné a gombot). */}
      <PauseMenu
        open={paused && inRun && !glLost}
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
        score={summary?.xp ?? 0}
        best={bestScore.best}
        correct={Math.max(0, (summary?.correct ?? 0) - levelStartAnswersRef.current.correct)}
        total={Math.max(0, (summary?.total ?? 0) - levelStartAnswersRef.current.total)}
        onRetry={startNextLevel}
        retryLabel={isLastLevel ? "Befejezés — összesítés!" : `Tovább a ${levelIdx + 2}. pályára`}
        onBack={endRun}
        backLabel="Befejezés most"
        extra={
          <div className="flex flex-col items-center gap-2">
            <p className="text-base font-bold text-lime-100">{cfg.name}</p>
            <div className="flex flex-wrap justify-center gap-1.5 text-sm text-white/90">
              <span className="rounded-full bg-teal-700/60 px-2.5 py-1"><strong className="text-teal-100">{summary?.runes ?? 0}</strong> rúnaérc</span>
              <span className="rounded-full bg-cyan-700/55 px-2.5 py-1 inline-flex items-center gap-1"><Gem className="w-4 h-4" aria-hidden="true" /><strong className="text-cyan-100">{summary?.crystals ?? 0}</strong> kristály</span>
              <span className="rounded-full bg-lime-700/55 px-2.5 py-1"><strong className="text-lime-100">{summary?.blocks ?? 0}</strong> blokk</span>
              <span className="rounded-full bg-amber-700/55 px-2.5 py-1"><strong className="text-amber-100">+{(summary?.xp ?? 0) - levelStartXp}</strong> XP</span>
              <span className="rounded-full bg-orange-700/55 px-2.5 py-1 inline-flex items-center gap-1"><Flame className="w-4 h-4 text-orange-300" aria-hidden="true" /><strong>{summary?.bestCombo ?? 0}</strong></span>
            </div>
            {!isLastLevel && (
              <p className="text-sm text-white/75 max-w-sm">Következő: <strong className="text-lime-200">{LEVELS[levelIdx + 1]!.name}</strong> — {LEVELS[levelIdx + 1]!.description}</p>
            )}
            <ResultReview items={wrongItems} max={3} />
          </div>
        }
      />

      <ResultScreen
        badges={newlyUnlocked}
        open={phase === "over"}
        testId="bc-over"
        title={gameWon ? "Bajnok lettél! Mind az 5 pálya kész!" : "Bányászat vége"}
        won={gameWon}
        score={summary?.xp ?? 0}
        best={bestResult?.best ?? bestScore.best}
        isNewBest={(bestResult?.isNewBest ?? false) && (summary?.xp ?? 0) > 0}
        correct={summary?.correct ?? 0}
        total={summary?.total ?? 0}
        onRetry={startGame}
        retryLabel="Új próbálkozás"
        onBack={() => navigate("/games")}
        extra={
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-white/85">
              Rúnaérc: <strong data-testid="bc-over-runes">{summary?.runRunes ?? 0}</strong> · Kristály: <strong>{summary?.crystals ?? 0}</strong> · Blokk: <strong>{summary?.blocks ?? 0}</strong> · Pálya: <strong>{levelIdx + 1}/{LEVELS.length}</strong>
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
            <ResultReview items={wrongItems} />
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
        /* J3a: nyitott Rúna-zárnál a Lerak / Bányász gomb láthatatlan (a rúnakövek helye), az Ugrás és a joystick marad. */
        .bc-actions[data-lock="true"] .bc-act-place, .bc-actions[data-lock="true"] .bc-act-mine { visibility: hidden; }
        /* J3a — bányászás-gyűrű a célkereszt körül (a --p 0..1 a tartás / az ütések haladása). */
        .bc-mine-ring { position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 9999px; --p: 0;
          background: conic-gradient(#fbbf24 calc(var(--p) * 360deg), transparent 0); -webkit-mask: radial-gradient(circle, transparent 15px, #000 16px); mask: radial-gradient(circle, transparent 15px, #000 16px); opacity: .95; }
        .bc-mine-ring[data-p="0"] { opacity: 0; }
        /* J3a — iránytű a legközelebbi rúnaérchez (a HUD-chipsorban). */
        .bc-compass { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px 2px 4px; min-height: 28px; border-radius: 9999px; background: rgba(15,23,42,.8); border: 1px solid rgba(94,234,212,.55); color: #ccfbf1; font-size: 13px; font-weight: 800; }
        .bc-compass[data-hidden="true"] { display: none; }
        .bc-crystals { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; min-height: 28px; border-radius: 9999px; background: rgba(15,23,42,.8); border: 1px solid rgba(103,232,249,.5); color: #cffafe; font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }
        .bc-compass-arrow { width: 20px; height: 20px; color: #5eead4; transform: rotate(var(--a, 0rad)); }
        /* J3a — a rúnagombok: a világban lebegő rúnakövek érinthető párjai (2×2, a célkereszt alatt; fekvőben egy sorban). */
        /* Review #484 (Vercel): a rúnasor ALULRÓL igazodik (a joystick fölé), így hosszú (több soros) válasznál felfelé nő, nem
           lóg ki a játéktér alá; a felirat sosem vágódik (nincs sorkorlát), hosszú válasznál kisebb betű. */
        .bc-runes { position: absolute; z-index: 24; left: 50%; transform: translateX(-50%); bottom: calc(max(8px, var(--game-safe-bottom)) + 136px); width: min(94vw, 560px); display: grid; grid-template-columns: 1fr 1fr; gap: 10px; pointer-events: none; }
        .bc-runes[data-long="true"] .bc-rune { font-size: 14px; line-height: 1.15; padding-top: 5px; padding-bottom: 5px; }
        .bc-runes[data-long="true"] .bc-rune-letter { width: 30px; height: 30px; font-size: 17px; }
        /* Szélsőséges (> 60 karakteres) tananyag-válasz: kisebb betű és szorosabb gomb — a felirat így is teljes (nincs vágás). */
        .bc-runes[data-long="xl"] { gap: 6px; width: min(98vw, 600px); }
        /* Nagyon magas rúnasornál a saját szünetgomb a kérdéskártyára lógna — ilyenkor a HUD (mindig látható) szünetgombja marad. */
        .bc-runes[data-long="xl"] .bc-rune-pause { display: none; }
        .bc-runes[data-long="xl"] .bc-rune { font-size: 13px; line-height: 1.12; gap: 6px; padding: 4px 6px 4px 4px; }
        .bc-runes[data-long="xl"] .bc-rune-letter { width: 26px; height: 26px; font-size: 15px; border-radius: 8px; }
        .bc-runes.animate-shake { animation: bc-rune-shake 0.16s ease-in-out 2; }
        @keyframes bc-rune-shake {0%,100% { transform: translateX(-50%); }25% { transform: translateX(calc(-50% - 5px)); }75% { transform: translateX(calc(-50% + 5px)); }}
        .bc-rune { pointer-events: auto; display: flex; align-items: center; gap: 8px; min-height: 56px; padding: 6px 10px 6px 6px; border-radius: 14px; text-align: left; color: #fff; font-weight: 800; font-size: 16px; line-height: 1.2;
          background: linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,0) 60%), rgba(30,27,46,.92); border: 2px solid var(--rune); box-shadow: 0 0 14px color-mix(in srgb, var(--rune) 45%, transparent), inset 0 -3px 0 rgba(0,0,0,.35); touch-action: manipulation; -webkit-tap-highlight-color: transparent; user-select: none; }
        .bc-rune:active:not([aria-disabled="true"]) { transform: scale(.97); }
        .bc-rune-pause[data-covered="true"] { visibility: hidden; pointer-events: none; }
        .bc-rune-pause { pointer-events: auto; position: absolute; right: 0; top: -62px; width: 52px; height: 52px; display: inline-flex; align-items: center; justify-content: center; border-radius: 16px; color: #fff; background: rgba(15,23,42,.82); border: 1px solid rgba(255,255,255,.3); touch-action: manipulation; }
        .bc-rune-letter { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 10px; background: var(--rune); color: #0f0c1c; font-size: 20px; font-weight: 900; }
        .bc-rune-label { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
        .bc-rune[data-state="correct"] { border-color: #86efac; background: #15803d; box-shadow: 0 0 22px #22c55e99; }
        .bc-rune[data-state="correct"] .bc-rune-letter { background: #22c55e; color: #fff; }
        .bc-rune[data-state="wrong"] { border-color: #fdba74; background: #9a3412; }
        .bc-rune[data-state="dim"] { opacity: .45; }
        /* Review #484 B1: élesítés előtt (400 ms) a rúnagombok halványak, és nem választanak. */
        .bc-rune[data-armed="false"][data-state="idle"] { opacity: .55; filter: saturate(.6); }
        .bc-gl-lost { position: absolute; inset: 0; z-index: 40; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 16px; text-align: center; background: rgba(2,6,23,.88); }
        @media (prefers-reduced-motion: reduce) { .bc-act { transition: none; } .bc-act:active, .bc-rune:active { transform: none; } }
        /* A kérdés-sáv a Kockavadász HUD-ja (idő + chipsor) alatt kezdődik. */
        .play-question[data-skin="mine"] { --play-question-top: calc(max(4px, var(--game-safe-top)) + 104px); }
        /* Review #484 N1: zár alatt a prompt annyi sor, amennyi a kősáv és a rúnagombok mellett elfér (a többit a „Mutasd”). */
        .play-question[data-skin="mine"]:not([data-expanded="true"]) .play-question-prompt { -webkit-line-clamp: var(--bc-pq-lines, var(--pq-lines, 5)) !important; line-clamp: var(--bc-pq-lines, var(--pq-lines, 5)) !important; }
        /* Alacsony fekvő nézet: érintős fekvő nézetben a hotbar a vászonra kerül, a joystick és az akciógombok közé (a
           vászon kapja a magasságot); a rúnagombok egy sorban a vászon közepe alatt. */
        @media (max-height: 500px) and (min-width: 560px) {
          .bc-bottom[data-touch="true"] { position: absolute; z-index: 25; left: 50%; transform: translateX(-50%); bottom: max(8px, var(--game-safe-bottom)); max-width: 52%; padding: 0 !important; background: transparent; border: 0; pointer-events: none; }
          .bc-bottom[data-touch="true"] button { pointer-events: auto; }
          .bc-bottom[data-touch="true"] .bc-hotbar-empty { display: none; }
          /* Review #484 M4: fekvőben a rúnagombok a két OLDALRA kerülnek (A–B balra, C–D jobbra), a jelenet közepe (érc,
             kövek, célkereszt) és a fent középen álló kérdéskártya szabad marad. */
          .bc-runes, .bc-runes[data-long="xl"] { left: max(8px, var(--game-safe-left, 0px)); right: max(8px, var(--game-safe-right, 0px)); width: auto; transform: none;
            top: calc(max(4px, var(--game-safe-top)) + 84px); bottom: auto; grid-template-columns: minmax(0, 27vw) 1fr minmax(0, 27vw); grid-auto-rows: auto; gap: 8px 0; align-items: start; }
          .bc-runes [data-testid="bc-rune-0"] { grid-column: 1; grid-row: 1; }
          .bc-runes [data-testid="bc-rune-1"] { grid-column: 1; grid-row: 2; }
          .bc-runes [data-testid="bc-rune-2"] { grid-column: 3; grid-row: 1; }
          .bc-runes [data-testid="bc-rune-3"] { grid-column: 3; grid-row: 2; }
          .bc-runes .bc-rune-pause { display: none; }
          .bc-runes.animate-shake { animation-name: bc-rune-shake-side; }
          @keyframes bc-rune-shake-side {0%,100% { transform: translateX(0); }25% { transform: translateX(-5px); }75% { transform: translateX(5px); }}
          .bc-rune { min-height: 50px; font-size: 15px; }
          /* A zár alatt a chipsor (bal felső, iránytű) nem fedi a bal oszlopot. */
          .bc-chips[data-lock="true"] { visibility: hidden; }
          .play-question[data-skin="mine"] { --play-question-top: calc(max(4px, var(--game-safe-top)) + 64px); }
          /* A chipsor a bal oldalon törik (a kérdéskártya fent középen, 40vw széles — nem takarhatja el az iránytűt). */
          .bc-chips { max-width: calc(30vw - 16px); }
        }
      `}</style>
    </GameShell>
  );
}
