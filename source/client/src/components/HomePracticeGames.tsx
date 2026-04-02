import { memo } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Gamepad2, Waves, BookOpen, Zap, Box, Brain, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const sectionVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", damping: 16, stiffness: 220 },
  },
};

function HomePracticeGames() {
  return (
    <section
      id="gyakorlo-jatekok"
      className="mt-8 pt-6 border-t border-white/20 scroll-mt-4"
      aria-labelledby="heading-practice-games"
    >
      <div className="mb-3 text-center sm:text-left px-0.5">
        <h2
          id="heading-practice-games"
          className="text-sm sm:text-base font-extrabold text-white flex items-center justify-center sm:justify-start gap-2 flex-wrap"
        >
          <Gamepad2 className="w-5 h-5 text-cyan-300 shrink-0" />
          Gyakorló játékok
          <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
        </h2>
        <p className="text-[11px] sm:text-xs text-white/75 mt-1.5 max-w-2xl mx-auto sm:mx-0 leading-snug">
          A tananyagok mellett itt gyakorolhatsz: mindegyik játékban cél + akadály + kvíz vagy matekteszt van, és a jó válaszra azonnal jutalom (XP, sorozat) érkezik — a szülők a játék oldalán elolvashatják, mit fejleszt pontosan.
          Teljes lista és ranglista:{" "}
          <Link href="/games" className="text-cyan-200 underline-offset-2 hover:underline font-semibold">
            Játékok menü
          </Link>
          .
        </p>
      </div>

      <motion.div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 auto-rows-fr"
        variants={sectionVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-40px" }}
      >
        {/* Szökőár */}
        <motion.div variants={cardVariants} className="min-w-0">
          <Card className="glass-card h-full rounded-2xl border-cyan-400/35 hover:border-cyan-300/55 transition-colors shadow-lg">
            <CardContent className="p-2.5 flex flex-col h-full">
              <div className="flex justify-between items-start mb-1.5">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-cyan-500/25 to-blue-600/25 border border-cyan-400/40">
                  <Waves className="w-4 h-4 text-cyan-200" />
                </div>
                <span className="text-[9px] font-bold bg-gradient-to-r from-cyan-600 to-blue-600 text-white px-1.5 py-0 rounded">
                  EN
                </span>
              </div>
              <h3 className="text-xs font-bold text-cyan-100 mb-0.5 line-clamp-2 leading-tight">
                Szökőár szökés — Angol
              </h3>
              <p className="text-[10px] text-white/70 line-clamp-2 mb-2 flex-1 leading-tight">
                3–5. o. angol, hullám + kvízek. Nehézség induláskor.
              </p>
              <div className="flex flex-wrap gap-1 pt-1.5 border-t border-white/15">
                <Link href="/games/tsunami-english?difficulty=easy" className="min-w-0">
                  <Button size="sm" variant="secondary" className="h-6 px-1.5 text-[9px] bg-emerald-700/50 text-white border-emerald-400/30">
                    Könnyű
                  </Button>
                </Link>
                <Link href="/games/tsunami-english?difficulty=normal" className="min-w-0">
                  <Button size="sm" variant="secondary" className="h-6 px-1.5 text-[9px] bg-cyan-700/50 text-white border-cyan-400/30">
                    Közepes
                  </Button>
                </Link>
                <Link href="/games/tsunami-english?difficulty=hard" className="min-w-0">
                  <Button size="sm" variant="secondary" className="h-6 px-1.5 text-[9px] bg-rose-700/50 text-white border-rose-400/30">
                    Nehéz
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Szólétra */}
        <motion.div variants={cardVariants} className="min-w-0">
          <Link href="/games/word-ladder-hu-en">
            <Card className="glass-card h-full rounded-2xl border-fuchsia-400/35 hover:border-fuchsia-300/60 transition-colors cursor-pointer group shadow-lg">
              <CardContent className="p-2.5 flex flex-col h-full">
                <div className="flex justify-between items-start mb-1.5">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500/25 to-fuchsia-600/25 border border-fuchsia-400/40 group-hover:scale-105 transition-transform">
                    <BookOpen className="w-4 h-4 text-fuchsia-200" />
                  </div>
                  <span className="text-[9px] font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-1.5 py-0 rounded">
                    HU↔EN
                  </span>
                </div>
                <h3 className="text-xs font-bold text-fuchsia-100 mb-0.5 line-clamp-2 leading-tight group-hover:text-white">
                  Szólétra (HU ↔ EN)
                </h3>
                <p className="text-[10px] text-white/70 line-clamp-3 flex-1 leading-tight">
                  Szókincs és párosítás: minden jó válasz egy fokkal feljebb.
                </p>
                <p className="text-[9px] text-fuchsia-200/90 font-semibold pt-1.5 border-t border-white/15">Indítás →</p>
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        {/* Kockavadász */}
        <motion.div variants={cardVariants} className="min-w-0">
          <Link href="/games/block-craft-quiz">
            <Card className="glass-card h-full rounded-2xl border-lime-400/35 hover:border-lime-300/60 transition-colors cursor-pointer group shadow-lg">
              <CardContent className="p-2.5 flex flex-col h-full">
                <div className="flex justify-between items-start mb-1.5">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-lime-500/25 to-emerald-700/25 border border-lime-400/40 group-hover:scale-105 transition-transform">
                    <Box className="w-4 h-4 text-lime-200" />
                  </div>
                  <span className="text-[9px] font-bold bg-gradient-to-r from-lime-600 to-emerald-700 text-white px-1.5 py-0 rounded">
                    KVÍZ
                  </span>
                </div>
                <h3 className="text-xs font-bold text-lime-100 mb-0.5 line-clamp-2 leading-tight group-hover:text-white">
                  Kockavadász kvíz
                </h3>
                <p className="text-[10px] text-white/70 line-clamp-3 flex-1 leading-tight">
                  Minecraft hangulat: bányászat + angol kérdés blokkonként.
                </p>
                <p className="text-[9px] text-lime-200/90 font-semibold pt-1.5 border-t border-white/15">Blokkvilág →</p>
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        {/* Matek sprint */}
        <motion.div variants={cardVariants} className="min-w-0">
          <Link href="/games/speed-quiz-math">
            <Card className="glass-card h-full rounded-2xl border-amber-400/35 hover:border-amber-300/60 transition-colors cursor-pointer group shadow-lg">
              <CardContent className="p-2.5 flex flex-col h-full">
                <div className="flex justify-between items-start mb-1.5">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500/25 to-orange-600/25 border border-amber-400/40 group-hover:scale-105 transition-transform">
                    <Zap className="w-4 h-4 text-amber-200" />
                  </div>
                  <span className="text-[9px] font-bold bg-gradient-to-r from-amber-600 to-orange-600 text-white px-1.5 py-0 rounded">
                    MAT
                  </span>
                </div>
                <h3 className="text-xs font-bold text-amber-100 mb-0.5 line-clamp-2 leading-tight group-hover:text-white">
                  Gyors matek sprint
                </h3>
                <p className="text-[10px] text-white/70 line-clamp-3 flex-1 leading-tight">
                  Gyors feladatok, kombó szorzó: 3–5. osztály szintek.
                </p>
                <p className="text-[9px] text-amber-200/90 font-semibold pt-1.5 border-t border-white/15">Sprint →</p>
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        {/* Brain Rot Lopas */}
        <motion.div variants={cardVariants} className="min-w-0">
          <Link href="/games/brain-rot-steal">
            <Card className="glass-card h-full rounded-2xl border-purple-400/35 hover:border-purple-300/60 transition-colors cursor-pointer group shadow-lg">
              <CardContent className="p-2.5 flex flex-col h-full">
                <div className="flex justify-between items-start mb-1.5">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-500/25 to-pink-600/25 border border-purple-400/40 group-hover:scale-105 transition-transform">
                    <Brain className="w-4 h-4 text-purple-200" />
                  </div>
                  <span className="text-[9px] font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-white px-1.5 py-0 rounded">
                    MIX
                  </span>
                </div>
                <h3 className="text-xs font-bold text-purple-100 mb-0.5 line-clamp-2 leading-tight group-hover:text-white">
                  Brain Rot Lopas
                </h3>
                <p className="text-[10px] text-white/70 line-clamp-3 flex-1 leading-tight">
                  Kapd el a Brain Rot-okat! Angol, matek, magyar kviz.
                </p>
                <p className="text-[9px] text-purple-200/90 font-semibold pt-1.5 border-t border-white/15">Vadaszat &rarr;</p>
              </CardContent>
            </Card>
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}

export default memo(HomePracticeGames);
