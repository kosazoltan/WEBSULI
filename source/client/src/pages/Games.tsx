import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Gamepad2,
  Waves,
  BookOpen,
  Zap,
  Trophy,
  Lock,
  CloudUpload,
  Box,
  Brain,
  Rocket,
  Tornado,
  Calendar,
  Award,
  Flame,
  Play,
  Sparkles,
} from "lucide-react";
import { useDailyChallenge } from "@/lib/dailyChallenge";
import { useAchievements } from "@/lib/achievements";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import CosmicBackground from "@/components/CosmicBackground";
import PlayerEntry from "@/components/PlayerEntry";
import { useMemo, useState, type CSSProperties } from "react";

type GameCatalogRow = {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
};

type LeaderRow = {
  rank: number;
  displayName: string;
  bestRunXp: number;
  bestStreak: number;
  bestRunSeconds: number;
};

function normalizeGameId(id: string): string {
  const k = id.trim().toLowerCase();
  if (
    k === "blockcraft-quiz" ||
    k === "blockcraft" ||
    k === "kockavadasz-kviz" ||
    k === "kockavadász-kvíz"
  ) {
    return "block-craft-quiz";
  }
  if (k === "wordladder-hu-en" || k === "word-ladder") {
    return "word-ladder-hu-en";
  }
  if (k === "speedquiz-math" || k === "matek-sprint") {
    return "speed-quiz-math";
  }
  if (k === "brainrot-steal" || k === "brain-rot" || k === "brainrotsteal") {
    return "brain-rot-steal";
  }
  if (
    k === "spaceasteroid-quiz" ||
    k === "space-asteroid" ||
    k === "asteroid-quiz" ||
    k === "galaktikus-aszteroida"
  ) {
    return "space-asteroid-quiz";
  }
  if (k === "tornado-hunter-200" || k === "tornado-hunter" || k === "tornadohunter200") {
    return "tornado-hunter-200";
  }
  return k;
}

/**
 * Játszható játékonként a lobbi-kártya adatai (S13): kiemelőszín (`--gc`, a főoldali kártyákkal azonos), jelvény,
 * a kártya lábléc-felirata. A kártya egésze a játék kezdőképernyőjére visz (M8: lista → kártya → Indítás = 2 koppintás).
 */
const GAME_META: Record<string, { icon: typeof Waves; color: string; badge: string; cta: string }> = {
  "tsunami-english": { icon: Waves, color: "#22d3ee", badge: "MIX", cta: "Válassz nehézséget" },
  "word-ladder-hu-en": { icon: BookOpen, color: "#e879f9", badge: "HU↔EN", cta: "Játék" },
  "block-craft-quiz": { icon: Box, color: "#a3e635", badge: "KVÍZ", cta: "Blokkvilág" },
  "speed-quiz-math": { icon: Zap, color: "#fbbf24", badge: "MATEK", cta: "Sprint" },
  "brain-rot-steal": { icon: Brain, color: "#c084fc", badge: "MIX", cta: "Vadászat" },
  "space-asteroid-quiz": { icon: Rocket, color: "#818cf8", badge: "3D", cta: "Indítás" },
  "tornado-hunter-200": { icon: Tornado, color: "#38bdf8", badge: "3D", cta: "Vadászat" },
};

const PLAYABLE_IDS = new Set(Object.keys(GAME_META));

/** Játékonkénti kiemelőszín a közös `.game-card` szabályainak. */
const accent = (color: string) => ({ "--gc": color }) as CSSProperties;

/** API / régi migráció szövegét felülírja (pl. „Hamarosan” helyett játszható leírás) */
const DISPLAY_OVERRIDES: Record<string, { title?: string; description?: string }> = {
  "tsunami-english": {
    title: "Szökőár szökés — Tudáspróba",
    description:
      "3–5. osztályos kaland: angol, matek, nyelvtan, környezetismeret vagy vegyes kihívás. Fuss, válaszolj, és nyomd vissza a hullámot!",
  },
  "word-ladder-hu-en": {
    description:
      "3–5. osztályos szókincs és párosítás (HU ↔ EN). Minden jó válasz egy léc — a menet végére nehezebb feladatok.",
  },
  "block-craft-quiz": {
    description: "Minecraft hangulatú 2D világ: bányászat + angol kvíz.",
  },
  "speed-quiz-math": {
    description: "Gyors matek kihívás: helyes válasz = pont + kombó szorzó.",
  },
  "brain-rot-steal": {
    description: "Kapd el a Brain Rot-okat! Minden elkapás kvízt hoz: angol, matek, magyar nyelvtan. Kombó szorzóval még több XP!",
  },
  "space-asteroid-quiz": {
    title: "Galaktikus Aszteroida Kvíz",
    description:
      "3D űrharc: minden hullám és ütközés kvízt hoz a saját osztályod legutóbbi tananyagaiból. Lődd ki az aszteroidákat, UFO-kat és vadászgépeket!",
  },
  "tornado-hunter-200": {
    title: "Tornado Hunter 200",
    description:
      "3D viharvadászat: 200 szint, 160 jármű, Storm Coin. Közelítsd meg a tornádót, és a horgonyzáskor matek- vagy angolkvíz dönt!",
  },
};

function applyDisplayOverrides(rows: GameCatalogRow[]): GameCatalogRow[] {
  return rows.map((row) => {
    const canonicalId = normalizeGameId(row.id);
    const o = DISPLAY_OVERRIDES[canonicalId];
    if (!o) return row;
    return {
      ...row,
      id: canonicalId,
      title: o.title ?? row.title,
      description: o.description ?? row.description,
    };
  });
}

/** Ha a Neon migráció még nem futott, a játéklista így is működik */
const FALLBACK_CATALOG: GameCatalogRow[] = [
  {
    id: "tsunami-english",
    title: "Szökőár szökés — Tudáspróba",
    description:
      "3–5. osztályos kaland: angol, matek, nyelvtan, környezetismeret vagy vegyes kihívás. Fuss, válaszolj, és nyomd vissza a hullámot!",
    sortOrder: 1,
    createdAt: "",
  },
  {
    id: "word-ladder-hu-en",
    title: "Szólétra (HU ↔ EN)",
    description:
      "3–5. osztályos szókincs és párosítás (HU ↔ EN). Minden jó válasz egy léc — a menet végére nehezebb feladatok.",
    sortOrder: 2,
    createdAt: "",
  },
  {
    id: "block-craft-quiz",
    title: "Kockavadász kvíz",
    description: "Minecraft hangulatú 2D világ: bányászat + angol kvíz.",
    sortOrder: 3,
    createdAt: "",
  },
  {
    id: "speed-quiz-math",
    title: "Gyors matek sprint",
    description: "Gyors matek kihívás: helyes válasz = pont + kombó szorzó.",
    sortOrder: 4,
    createdAt: "",
  },
  {
    id: "brain-rot-steal",
    title: "Brain Rot Lopás",
    description: "Kapd el a Brain Rot-okat! Minden elkapás kvízt hoz: angol, matek, magyar nyelvtan. Kombó szorzóval még több XP!",
    sortOrder: 5,
    createdAt: "",
  },
  {
    id: "space-asteroid-quiz",
    title: "Galaktikus Aszteroida Kvíz",
    description:
      "3D űrharc: minden hullám és ütközés kvízt hoz a saját osztályod legutóbbi tananyagaiból. Lődd ki az aszteroidákat, UFO-kat és vadászgépeket!",
    sortOrder: 6,
    createdAt: "",
  },
  {
    id: "tornado-hunter-200",
    title: "Tornado Hunter 200",
    description:
      "3D viharvadászat: 200 szint, 160 jármű, Storm Coin. Közelítsd meg a tornádót, és a horgonyzáskor matek- vagy angolkvíz dönt!",
    sortOrder: 7,
    createdAt: "",
  },
];

function LobbyCardBody({ game, icon: Icon, badge }: { game: GameCatalogRow; icon: typeof Waves; badge: string }) {
  return (
    <>
      <div className="game-lobby-head">
        <span className="game-icon game-icon--lobby" aria-hidden="true">
          <Icon />
        </span>
        <div className="min-w-0 flex-1">
          <span className="game-badge">{badge}</span>
          <h3 className="game-title game-title--lobby">{game.title}</h3>
        </div>
      </div>
      <p className="game-desc">{game.description || "Gyakorló játék"}</p>
    </>
  );
}

export default function Games() {
  const [lbDifficulty, setLbDifficulty] = useState<"easy" | "normal" | "hard">("normal");
  const { pick: dailyPick, completedToday: dailyDone, streakDays } = useDailyChallenge();
  const { unlockedCount, totalCount } = useAchievements();

  const {
    data: catalogFromApi,
    isLoading: catLoading,
    isError: catError,
  } = useQuery<GameCatalogRow[]>({
    queryKey: ["/api/games/catalog"],
    retry: 1,
  });

  const catalog = useMemo(() => {
    if (catLoading && catalogFromApi === undefined) return [];
    const merge = (api: GameCatalogRow[]) => {
      const byId = new Map(
        api.map((g) => {
          const normalizedId = normalizeGameId(g.id);
          return [normalizedId, { ...g, id: normalizedId }] as const;
        }),
      );
      for (const f of FALLBACK_CATALOG) {
        if (!byId.has(f.id)) byId.set(f.id, f);
      }
      return applyDisplayOverrides(Array.from(byId.values()).sort((a, b) => a.sortOrder - b.sortOrder));
    };
    if (catalogFromApi && catalogFromApi.length > 0) return merge(catalogFromApi);
    if (catError) return applyDisplayOverrides(FALLBACK_CATALOG);
    return applyDisplayOverrides(FALLBACK_CATALOG);
  }, [catalogFromApi, catLoading, catError]);

  const { data: leaderboard = [], isLoading: lbLoading } = useQuery<LeaderRow[]>({
    queryKey: ["/api/games/leaderboard/tsunami", lbDifficulty],
    queryFn: async () => {
      const res = await fetch(
        `/api/games/leaderboard?gameId=tsunami-english&difficulty=${lbDifficulty}&limit=25`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      return res.json();
    },
  });

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: "#0A0E27" }}>
      <CosmicBackground />
      <main className="games-lobby relative z-10 w-full max-w-3xl xl:max-w-5xl mx-auto px-4 sm:px-6 pb-24 sm:pb-14 min-h-dvh min-h-screen">
        <header className="games-lobby-top">
          <Link href="/" className="games-top-btn" data-testid="link-games-back-home" aria-label="Vissza a főoldalra">
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            <span className="hidden min-[400px]:inline">Főoldal</span>
          </Link>
          <h1 className="games-lobby-title">
            <Gamepad2 className="w-7 h-7 text-amber-400" aria-hidden="true" />
            Játékok
          </h1>
          <Link
            href="/profile"
            className="games-top-btn games-top-btn--trophy"
            aria-label={`Profil: ${unlockedCount} / ${totalCount} jelvény`}
          >
            <Award className="w-5 h-5 text-amber-300" aria-hidden="true" />
            <span className="hidden sm:inline">Profil</span>
            <strong>
              {unlockedCount}/{totalCount}
            </strong>
          </Link>
        </header>

        <PlayerEntry />

        {/* Mai kihívás */}
        <section className="games-daily" aria-label="Mai kihívás">
          <span className="games-daily-icon" aria-hidden="true">
            <Calendar className="w-6 h-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="games-daily-kicker">
              Mai kihívás <span className="games-daily-xp">+{dailyPick.bonusXp} XP</span>
            </p>
            <p className="games-daily-title">
              <span aria-hidden="true">{dailyPick.emoji}</span> {dailyPick.title}
            </p>
            <p className="games-daily-meta">
              {dailyDone ? (
                <span className="text-emerald-300 font-bold">✓ Mára teljesítve</span>
              ) : (
                <span>Egy sikeres futás napi sorozatot és +50 XP-t ad a profilodba.</span>
              )}
              <span className="games-daily-streak">
                <Flame className="w-4 h-4" aria-hidden="true" />
                {streakDays} nap
              </span>
            </p>
          </div>
          {!dailyDone && (
            <Link href={`/games/${dailyPick.game}`} className="game-btn game-btn-primary games-daily-go">
              Indítás
            </Link>
          )}
        </section>

        <h2 className="games-section-title">Válassz játékot</h2>
        {catLoading ? (
          <p className="text-white/60 text-sm mb-6">Betöltés…</p>
        ) : (
          <ul className="games-lobby-grid" data-testid="games-lobby">
            {catalog.map((game) => {
              const meta = GAME_META[game.id];
              if (!meta || !PLAYABLE_IDS.has(game.id)) {
                return (
                  <li key={game.id}>
                    <div className="game-card game-card--lobby game-card--locked" style={accent("#94a3b8")} aria-disabled="true">
                      <LobbyCardBody game={game} icon={Gamepad2} badge="HAMAROSAN" />
                      <span className="game-card-play game-card-play--locked">
                        <Lock className="w-4 h-4" aria-hidden="true" />
                        Hamarosan
                      </span>
                    </div>
                  </li>
                );
              }

              if (game.id === "tsunami-english") {
                // A kártya nem link: a három nehézségi szint külön indul (a kártyáról 1 koppintás a kezdőképernyőig).
                return (
                  <li key={game.id}>
                    <div className="game-card game-card--lobby" style={accent(meta.color)}>
                      <LobbyCardBody game={game} icon={meta.icon} badge={meta.badge} />
                      <p className="game-diffs-label">{meta.cta}:</p>
                      <div className="game-diffs">
                        <Link href="/games/tsunami-english?difficulty=easy" className="game-diff game-diff--easy">
                          Könnyű
                        </Link>
                        <Link href="/games/tsunami-english?difficulty=normal" className="game-diff game-diff--normal">
                          Közepes
                        </Link>
                        <Link href="/games/tsunami-english?difficulty=hard" className="game-diff game-diff--hard">
                          Nehéz
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              }

              return (
                <li key={game.id}>
                  <Link href={`/games/${game.id}`} className="game-card game-card--lobby" style={accent(meta.color)}>
                    <LobbyCardBody game={game} icon={meta.icon} badge={meta.badge} />
                    <span className="game-card-play">
                      <Play className="w-4 h-4" aria-hidden="true" />
                      {meta.cta}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <section className="games-info" aria-labelledby="games-info-title">
          <p id="games-info-title" className="games-info-kicker">
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            Játszva tanulás — miért működik?
          </p>
          <p>
            Minden WebSuli-játékban <strong>látható cél</strong>, <strong>akadály</strong> (pl. idő, víz, életek, létra) és{" "}
            <strong>rövid teszt</strong> (kvíz vagy matekfeladat) van összekötve. A helyes válaszra <strong>azonnal jutalom</strong> jár:
            XP, sorozat-láng, pályán előrelépés — ez a „cél → próba → visszajelzés” ciklus tartja fenn a figyelmet, tantárgyi
            tartalommal (angol, matek).
          </p>
          <p className="games-info-note">
            Szülőknek: minden játék oldalán kinyitható szöveg írja le, milyen oktatási értéket képvisel (szókincs, számolás,
            olvasásértés stb.). A főoldalon a tananyagok alatt ugyanezek a kártyák várnak.
          </p>
        </section>

        <section className="games-info games-info--cloud" aria-label="Felhő ranglista">
          <CloudUpload className="w-7 h-7 text-cyan-300 shrink-0" aria-hidden="true" />
          <p>
            A helyi XP megmarad a böngészőben. A <strong>felhő ranglistához</strong> Google-bejelentkezés kell, és az e-mail
            címednek rajta kell lennie a WebSuli <strong>értesítő listáján</strong> (feliratkozás vagy admin által felvett extra
            e-mail). Jelszavas belépés önmagában nem elég: csak Google-fiókkal egyezik a listán tárolt cím.
          </p>
        </section>

        <div className="games-lb-head">
          <Trophy className="w-5 h-5 text-amber-400" aria-hidden="true" />
          <h2 className="games-section-title !m-0">Ranglista — Szökőár</h2>
          <Select
            value={lbDifficulty}
            onValueChange={(v) => setLbDifficulty(v as "easy" | "normal" | "hard")}
          >
            <SelectTrigger
              className="w-[140px] h-12 text-sm bg-white/10 border-white/20 text-white ml-auto rounded-xl"
              aria-label="Ranglista nehézsége"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Könnyű</SelectItem>
              <SelectItem value="normal">Közepes</SelectItem>
              <SelectItem value="hard">Nehéz</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="games-info games-lb">
          {lbLoading ? (
            <p className="text-white/60 text-sm">Ranglista betöltése…</p>
          ) : leaderboard.length === 0 ? (
            <p className="text-white/70 text-sm">
              Még nincs felhő pont ezen a nehézségen. Indíts egy kört Google-fiókkal és listás e-maillel, és a játék végén
              felkerülsz.
            </p>
          ) : (
            <div className="overflow-x-auto -mx-4">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-white/10 text-white/60 text-xs uppercase">
                    <th className="p-3 pl-4 font-semibold">#</th>
                    <th className="p-3 font-semibold">Játékos</th>
                    <th className="p-3 font-semibold text-right">Legjobb kör XP</th>
                    <th className="p-3 pr-4 font-semibold text-right hidden sm:table-cell">Sorozat</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row) => (
                    <tr key={row.rank + row.displayName} className="border-b border-white/5 text-white/90">
                      <td className="p-3 pl-4 text-amber-300 font-mono">{row.rank}</td>
                      <td className="p-3">{row.displayName}</td>
                      <td className="p-3 text-right font-semibold text-amber-200">{row.bestRunXp}</td>
                      <td className="p-3 pr-4 text-right hidden sm:table-cell text-white/70">{row.bestStreak}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
