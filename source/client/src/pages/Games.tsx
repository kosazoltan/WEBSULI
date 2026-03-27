import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Gamepad2,
  Waves,
  Sparkles,
  BookOpen,
  Zap,
  Trophy,
  Lock,
  CloudUpload,
  Box,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import CosmicBackground from "@/components/CosmicBackground";
import { useMemo, useState } from "react";

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
  if (k === "blockcraft-quiz" || k === "blockcraft" || k === "kockavadasz-kviz") {
    return "block-craft-quiz";
  }
  if (k === "wordladder-hu-en" || k === "word-ladder") {
    return "word-ladder-hu-en";
  }
  if (k === "speedquiz-math" || k === "matek-sprint") {
    return "speed-quiz-math";
  }
  return k;
}

const GAME_ICONS: Record<string, typeof Waves> = {
  "tsunami-english": Waves,
  "word-ladder-hu-en": BookOpen,
  "speed-quiz-math": Zap,
  "block-craft-quiz": Box,
};

const GAME_ACCENTS: Record<string, string> = {
  "tsunami-english": "from-cyan-500 to-blue-600",
  "word-ladder-hu-en": "from-violet-500 to-fuchsia-600",
  "speed-quiz-math": "from-amber-500 to-orange-600",
  "block-craft-quiz": "from-lime-500 to-emerald-700",
};

const PLAYABLE_IDS = new Set([
  "tsunami-english",
  "word-ladder-hu-en",
  "block-craft-quiz",
  "speed-quiz-math",
]);

/** API / régi migráció szövegét felülírja (pl. „Hamarosan” helyett játszható leírás) */
const DISPLAY_OVERRIDES: Record<string, { title?: string; description?: string }> = {
  "tsunami-english": {
    description:
      "3–5. osztályos angol: válassz nehézséget indulás előtt. Hosszabb menetek, a körön belül egyre nehezebb kérdések és gyorsuló hullám.",
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
    title: "Szökőár szökés — Angol",
    description:
      "3–5. osztályos angol: válassz nehézséget indulás előtt. Hosszabb menetek, a körön belül egyre nehezebb kérdések és gyorsuló hullám.",
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
];

export default function Games() {
  const [lbDifficulty, setLbDifficulty] = useState<"easy" | "normal" | "hard">("normal");

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
      <main className="relative z-10 container max-w-3xl py-6 px-4 pb-16">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/">
            <Button
              variant="outline"
              size="sm"
              className="border-white/40 text-white hover:bg-white/10 gap-1"
              data-testid="link-games-back-home"
            >
              <ArrowLeft className="w-4 h-4" />
              Főoldal
            </Button>
          </Link>
          <div className="flex items-center gap-2 text-white">
            <Gamepad2 className="w-6 h-6 text-amber-400" />
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Játékok</h1>
          </div>
        </div>

        <p className="text-white/80 text-sm mb-4 leading-relaxed">
          A tananyagoktól külön futnak a gyakorlók. A helyi XP mindenkinek megmarad a böngészőben; a{" "}
          <strong className="text-amber-200/90">felhő ranglistához</strong> Google bejelentkezés kell, és az
          e-mail címednek rajta kell lennie a WebSuli <strong>értesítő listáján</strong> (feliratkozás vagy
          admin által felvett extra e-mail).
        </p>

        <Card className="glass-card border-white/15 mb-6">
          <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <CloudUpload className="w-8 h-8 text-cyan-400 shrink-0" />
            <p className="text-xs sm:text-sm text-white/75 leading-snug">
              Jelszavas belépés önmagában nem elég a szerver oldali pontokhoz — csak Google OAuth, hogy egyezzen
              a listán tárolt cím. Így a gyerekek pontjai összekapcsolhatók a meghívott e-mailekkel.
            </p>
          </CardContent>
        </Card>

        <h2 className="text-sm font-bold text-white/90 uppercase tracking-wider mb-3">Játéklista</h2>
        {catLoading ? (
          <p className="text-white/50 text-sm mb-6">Betöltés…</p>
        ) : (
          <ul className="space-y-4 mb-10">
            {catalog.map((game) => {
              const Icon = GAME_ICONS[game.id] ?? Gamepad2;
              const accent = GAME_ACCENTS[game.id] ?? "from-slate-500 to-slate-700";
              const playable = PLAYABLE_IDS.has(game.id);

              if (playable && game.id === "tsunami-english") {
                return (
                  <li key={game.id}>
                    <Card className="glass-card border-white/20 overflow-hidden">
                      <CardContent className="p-4 sm:p-5 flex gap-4 items-start">
                        <div
                          className={`shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br ${accent} flex items-center justify-center shadow-lg`}
                        >
                          <Icon className="w-7 h-7 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h2 className="text-lg font-bold text-white">{game.title}</h2>
                            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                          </div>
                          <p className="text-sm text-white/70 leading-snug mb-3">
                            {game.description || "Gyakorló játék"}
                          </p>
                          <p className="text-[11px] text-white/50 mb-2">Nehézség — válassz indulás előtt:</p>
                          <div className="flex flex-wrap gap-2">
                            <Link href="/games/tsunami-english?difficulty=easy">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="bg-emerald-600/40 hover:bg-emerald-600/60 text-white border-emerald-400/30"
                              >
                                Könnyű
                              </Button>
                            </Link>
                            <Link href="/games/tsunami-english?difficulty=normal">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="bg-cyan-600/40 hover:bg-cyan-600/60 text-white border-cyan-400/30"
                              >
                                Közepes
                              </Button>
                            </Link>
                            <Link href="/games/tsunami-english?difficulty=hard">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="bg-rose-600/40 hover:bg-rose-600/60 text-white border-rose-400/30"
                              >
                                Nehéz
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                );
              }

              if (playable && game.id === "word-ladder-hu-en") {
                return (
                  <li key={game.id}>
                    <Link href="/games/word-ladder-hu-en">
                      <Card className="glass-card border-white/20 hover:border-fuchsia-400/50 transition-colors cursor-pointer group h-full">
                        <CardContent className="p-4 sm:p-5 flex gap-4 items-start">
                          <div
                            className={`shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br ${accent} flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform`}
                          >
                            <Icon className="w-7 h-7 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h2 className="text-lg font-bold text-white group-hover:text-fuchsia-200 transition-colors mb-1">
                              {game.title}
                            </h2>
                            <p className="text-sm text-white/70 leading-snug">{game.description}</p>
                            <p className="text-xs text-fuchsia-300/90 mt-2 font-medium">Indítás →</p>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </li>
                );
              }

              if (playable && game.id === "block-craft-quiz") {
                return (
                  <li key={game.id}>
                    <Link href="/games/block-craft-quiz">
                      <Card className="glass-card border-white/20 hover:border-lime-400/50 transition-colors cursor-pointer group h-full">
                        <CardContent className="p-4 sm:p-5 flex gap-4 items-start">
                          <div
                            className={`shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br ${accent} flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform`}
                          >
                            <Icon className="w-7 h-7 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h2 className="text-lg font-bold text-white group-hover:text-lime-200 transition-colors mb-1">
                              {game.title}
                            </h2>
                            <p className="text-sm text-white/70 leading-snug">{game.description}</p>
                            <p className="text-xs text-lime-300/90 mt-2 font-medium">Blokk világ megnyitása →</p>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </li>
                );
              }

              if (playable && game.id === "speed-quiz-math") {
                return (
                  <li key={game.id}>
                    <Link href="/games/speed-quiz-math">
                      <Card className="glass-card border-white/20 hover:border-amber-400/50 transition-colors cursor-pointer group h-full">
                        <CardContent className="p-4 sm:p-5 flex gap-4 items-start">
                          <div
                            className={`shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br ${accent} flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform`}
                          >
                            <Icon className="w-7 h-7 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h2 className="text-lg font-bold text-white group-hover:text-amber-200 transition-colors mb-1">
                              {game.title}
                            </h2>
                            <p className="text-sm text-white/70 leading-snug">{game.description}</p>
                            <p className="text-xs text-amber-300/90 mt-2 font-medium">Matek sprint indítása →</p>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </li>
                );
              }

              return (
                <li key={game.id}>
                  <Card className="glass-card border-white/10 opacity-75">
                    <CardContent className="p-4 sm:p-5 flex gap-4 items-start">
                      <div
                        className={`shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br ${accent} flex items-center justify-center shadow-lg grayscale`}
                      >
                        <Icon className="w-7 h-7 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h2 className="text-lg font-bold text-white/80">{game.title}</h2>
                          <Lock className="w-4 h-4 text-white/40 shrink-0" />
                        </div>
                        <p className="text-sm text-white/55 leading-snug">{game.description}</p>
                        <p className="text-xs text-amber-200/70 mt-2 font-medium">Hamarosan</p>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Trophy className="w-5 h-5 text-amber-400" />
          <h2 className="text-sm font-bold text-white/90 uppercase tracking-wider">
            Ranglista — Szökőár angol
          </h2>
          <Select
            value={lbDifficulty}
            onValueChange={(v) => setLbDifficulty(v as "easy" | "normal" | "hard")}
          >
            <SelectTrigger className="w-[130px] h-8 text-xs bg-white/10 border-white/20 text-white ml-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Könnyű</SelectItem>
              <SelectItem value="normal">Közepes</SelectItem>
              <SelectItem value="hard">Nehéz</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="glass-card border-amber-500/20">
          <CardContent className="p-0">
            {lbLoading ? (
              <p className="p-4 text-white/50 text-sm">Ranglista betöltése…</p>
            ) : leaderboard.length === 0 ? (
              <p className="p-4 text-white/55 text-sm">
                Még nincs felhő pont ezen a nehézségen. Indíts egy kört Google fiókkal és listás e-maillel, és
                a játék végén felkerülsz.
              </p>
            ) : (
              <div className="overflow-x-auto">
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
                        <td className="p-3 pr-4 text-right hidden sm:table-cell text-white/70">
                          {row.bestStreak}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
