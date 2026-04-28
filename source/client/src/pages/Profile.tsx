import { Link } from "wouter";
import { ArrowLeft, Trophy, Star, Flame, Calendar, Award, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAchievements, ACHIEVEMENT_CATALOG, type Achievement } from "@/lib/achievements";
import { useDailyChallenge } from "@/lib/dailyChallenge";
import { useClassroomGrade } from "@/lib/classroomStore";
import CosmicBackground from "@/components/CosmicBackground";

const TIER_COLORS: Record<Achievement["tier"], string> = {
  common: "border-slate-500/50 bg-slate-800/40",
  rare: "border-blue-400/60 bg-blue-900/30",
  epic: "border-fuchsia-400/60 bg-fuchsia-900/30",
  legendary: "border-amber-300 bg-amber-900/30 shadow-[0_0_18px_rgba(251,191,36,0.32)]",
};

const TIER_LABEL: Record<Achievement["tier"], string> = {
  common: "Közönséges",
  rare: "Ritka",
  epic: "Epikus",
  legendary: "Legendás",
};

const CATEGORY_LABELS: Record<Achievement["category"], string> = {
  general: "Általános",
  quiz: "Kvíz",
  blockcraft: "Kockavadász",
  space: "Galaktikus",
  brainrot: "Brain Rot",
  streak: "Daily / Sorozat",
};

export default function Profile() {
  const { unlocked, stats, totalCount, unlockedCount, totalPoints } = useAchievements();
  const { pick, completedToday, streakDays, totalDays } = useDailyChallenge();
  const { grade } = useClassroomGrade();

  const grouped = ACHIEVEMENT_CATALOG.reduce<Record<Achievement["category"], Achievement[]>>(
    (acc, a) => {
      if (!acc[a.category]) acc[a.category] = [];
      acc[a.category].push(a);
      return acc;
    },
    {} as Record<Achievement["category"], Achievement[]>,
  );

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: "#0A0E27" }}>
      <CosmicBackground />
      <main className="relative z-10 w-full max-w-3xl xl:max-w-5xl mx-auto py-6 px-4 sm:px-6 pb-24 sm:pb-14 min-h-dvh min-h-screen">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/games">
            <Button variant="outline" size="sm" className="border-white/40 text-white hover:bg-white/10 gap-1">
              <ArrowLeft className="w-4 h-4" />
              Játékok
            </Button>
          </Link>
          <div className="flex items-center gap-2 text-white">
            <Trophy className="w-6 h-6 text-amber-400" />
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Profil & Jelvények</h1>
          </div>
        </div>

        {/* Daily Challenge banner */}
        <Card className="glass-card border-amber-400/45 mb-4 bg-amber-900/15">
          <CardContent className="p-4 flex items-start gap-3">
            <Calendar className="w-7 h-7 text-amber-300 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest font-bold text-amber-300 mb-0.5">Mai kihívás</p>
              <p className="text-base font-extrabold text-white">
                {pick.emoji} {pick.title}
              </p>
              <p className="text-xs text-white/75 mt-0.5">
                Bónusz: <strong className="text-amber-300">+{pick.bonusXp} XP</strong>
                {completedToday ? (
                  <span className="ml-2 text-emerald-300 font-semibold">✓ Mára teljesítve</span>
                ) : (
                  <span className="ml-2 text-amber-200/85">Még nincs teljesítve</span>
                )}
              </p>
              <div className="flex items-center gap-3 mt-2 text-[11px]">
                <span className="flex items-center gap-1 text-orange-300 font-semibold">
                  <Flame className="w-3.5 h-3.5" />
                  {streakDays} napos streak
                </span>
                <span className="text-white/55">|</span>
                <span className="text-white/65">Összesen: {totalDays} nap</span>
              </div>
            </div>
            {!completedToday && (
              <Link href={`/games/${pick.game}`}>
                <Button className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs">
                  Indítás
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Lifetime stats */}
        <Card className="glass-card border-cyan-400/35 mb-4">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-5 h-5 text-cyan-300" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wide">Statisztikák</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Stat label="Összes XP" value={stats.totalXp} icon={<Star className="w-3.5 h-3.5 text-amber-300" />} />
              <Stat label="Játszott körök" value={stats.totalGames} />
              <Stat label="Helyes válaszok" value={stats.totalCorrectAnswers} />
              <Stat label="Legjobb sorozat" value={stats.bestStreak} icon={<Flame className="w-3.5 h-3.5 text-orange-400" />} />
              <Stat label="Bányászott blokk" value={stats.blocksMined} />
              <Stat label="Lőtt aszteroida" value={stats.enemiesKilled} />
              <Stat label="Brain Rot kapva" value={stats.brainRotsCaught} />
              <Stat label="Tökéletes körök" value={stats.perfectQuizzes} />
              <Stat label="Gyémántok" value={stats.diamondsMined} />
            </div>
            {grade != null && (
              <p className="text-[11px] text-white/55 mt-3">
                Beállított osztály: <strong className="text-white/75">{grade}.</strong>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Achievement progress */}
        <Card className="glass-card border-amber-400/45 mb-4">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-5 h-5 text-amber-300" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wide">Jelvények</h2>
            </div>
            <p className="text-xs text-white/75">
              <strong className="text-amber-300">{unlockedCount}</strong> / {totalCount} jelvény ·
              <strong className="text-amber-300 ml-1">{totalPoints}</strong> pont
            </p>
            <div className="h-2 mt-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-fuchsia-500 transition-all"
                style={{ width: `${totalCount > 0 ? (unlockedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Jelvény-grid kategóriák szerint */}
        {(Object.keys(grouped) as Achievement["category"][]).map((cat) => {
          const list = grouped[cat] ?? [];
          if (list.length === 0) return null;
          return (
            <div key={cat} className="mb-6">
              <h3 className="text-[11px] uppercase tracking-widest font-bold text-white/65 mb-2 px-1">
                {CATEGORY_LABELS[cat]} · {list.filter((a) => unlocked.has(a.id)).length}/{list.length}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {list.map((a) => {
                  const got = unlocked.has(a.id);
                  return (
                    <div
                      key={a.id}
                      className={`rounded-lg border p-2.5 ${TIER_COLORS[a.tier]} ${got ? "" : "opacity-40 grayscale"}`}
                      data-testid={`achievement-${a.id}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="text-2xl flex-shrink-0">{a.icon}</div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[11px] font-bold leading-tight ${got ? "text-white" : "text-white/55"}`}>
                            {a.title}
                          </p>
                          <p className="text-[10px] text-white/60 leading-snug mt-0.5">{a.description}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] uppercase tracking-wide font-semibold text-amber-300/80">
                              {TIER_LABEL[a.tier]}
                            </span>
                            <span className="text-[9px] text-white/45">+{a.points}p</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-white/55 font-semibold">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-lg font-extrabold text-white tabular-nums mt-0.5">{value.toLocaleString("hu-HU")}</p>
    </div>
  );
}
