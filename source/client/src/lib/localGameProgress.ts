/**
 * JM7b — az eszközön (localStorage) HELYBEN gyűjtött játék-haladás olvasása a fiókoldalhoz és az adatletöltéshez.
 * Csak olvas, a meglévő forrásokból (achievements, Szökőár, Szólétra, Tornado); szerveroldali pontkönyv a JM8 dolga —
 * itt párhuzamos tároló NINCS. Sérült / hiányzó adat → 0 (sosem dob).
 */
import { loadStats, getUnlockedIds, ACHIEVEMENT_CATALOG, type LifetimeStats } from "@/lib/achievements";
import { loadProgress as loadTornadoProgress } from "@/lib/tornado/progress";

/** A játékok saját kulcsai (a játékoldalak konstansai: TsunamiEscapeEnglish.tsx, WordLadderHuEn.tsx). */
const TSUNAMI_XP = "websuli-tsunami-en-xp";
const TSUNAMI_BEST = "websuli-tsunami-en-best-streak";
const LADDER_XP = "websuli-wordladder-xp";
const LADDER_BEST = "websuli-wordladder-streak";

function readNumber(key: string): number {
  try {
    const n = Number(window.localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export type GameRecord = { gameId: string; title: string; emoji: string; href: string; lines: { label: string; value: number }[] };

export type LocalProgress = {
  stats: LifetimeStats;
  unlockedIds: string[];
  totalBadges: number;
  records: GameRecord[];
};

export function readLocalProgress(): LocalProgress {
  const stats = loadStats();
  const tornado = loadTornadoProgress();
  const records: GameRecord[] = [
    { gameId: "tsunami-english", title: "Szökőár szökés", emoji: "🌊", href: "/games/tsunami-english",
      lines: [{ label: "XP", value: readNumber(TSUNAMI_XP) }, { label: "Legjobb sorozat", value: readNumber(TSUNAMI_BEST) }] },
    { gameId: "word-ladder-hu-en", title: "Szólétra", emoji: "🪜", href: "/games/word-ladder-hu-en",
      lines: [{ label: "XP", value: readNumber(LADDER_XP) }, { label: "Legjobb sorozat", value: readNumber(LADDER_BEST) }] },
    { gameId: "block-craft-quiz", title: "Kockavadász", emoji: "⛏️", href: "/games/block-craft-quiz",
      lines: [{ label: "Kibányászott blokk", value: stats.blocksMined }, { label: "Gyémánt", value: stats.diamondsMined }] },
    { gameId: "space-asteroid-quiz", title: "Galaktikus Aszteroida", emoji: "🚀", href: "/games/space-asteroid-quiz",
      lines: [{ label: "Lelőtt aszteroida", value: stats.enemiesKilled }, { label: "Legyőzött főellenség", value: stats.bossesDefeated }] },
    { gameId: "brain-rot-steal", title: "Brain Rot Lopás", emoji: "🧠", href: "/games/brain-rot-steal",
      lines: [{ label: "Elkapott lény", value: stats.brainRotsCaught }] },
    { gameId: "tornado-hunter-200", title: "Tornado Hunter", emoji: "🌪️", href: "/games/tornado-hunter-200",
      lines: [{ label: "Legjobb pálya-pont", value: Math.max(0, Math.floor(tornado.stats.bestLevelScore)) }, { label: "Elkapott tornádó", value: Math.max(0, Math.floor(tornado.stats.tornadoesIntercepted)) }] },
  ];
  return { stats, unlockedIds: getUnlockedIds(), totalBadges: ACHIEVEMENT_CATALOG.length, records };
}

/**
 * Egyszerű szintgörbe a helyi XP-ből: az n. szinthez 100·(n−1)² XP kell (1: 0, 2: 100, 3: 400, 4: 900 …).
 * A J8 közös szintgörbéje (shared/levels.ts) érkezésekor ezt arra kell cserélni (ORKESZTRÁTOR-KÉRÉS).
 */
export function levelFromXp(xp: number): { level: number; current: number; next: number; progress: number } {
  const safe = Number.isFinite(xp) && xp > 0 ? xp : 0;
  const level = Math.floor(Math.sqrt(safe / 100)) + 1;
  const current = 100 * (level - 1) ** 2;
  const next = 100 * level ** 2;
  return { level, current, next, progress: Math.min(1, (safe - current) / (next - current)) };
}
