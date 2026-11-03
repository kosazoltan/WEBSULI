import { memo, type CSSProperties, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight, Gamepad2, Waves, BookOpen, Zap, Box, Brain, Rocket, Tornado } from "lucide-react";

/** Játékonkénti kiemelőszín (`--gc`) — a kártya keretét, fényét, ikonlapját és lábléc-feliratát színezi. */
const accent = (color: string) => ({ "--gc": color }) as CSSProperties;

function GameCardBody({ icon, badge, title, children, cta }: { icon: ReactNode; badge: string; title: string; children: ReactNode; cta?: string }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="game-icon" aria-hidden="true">{icon}</span>
        <span className="game-badge">{badge}</span>
      </div>
      <h3 className="game-title">{title}</h3>
      <p className="game-desc">{children}</p>
      {cta && (
        <span className="game-cta">
          {cta}
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
      )}
    </>
  );
}

/**
 * Spec 2026-11-03-udvozlo-jatekkartyak-szulo: a főoldali gyakorló játékok a fejléc üvegnyelvén — közös `.game-card`, játékonként
 * saját kiemelőszín, olvasható betűméret, 40 px-es nehézségi gombok. JS-animáció nincs (a hover CSS, csökkentett mozgásnál kikapcsol).
 */
function HomePracticeGames() {
  return (
    <section id="gyakorlo-jatekok" className="mt-8 pt-6 border-t border-white/10 scroll-mt-4" aria-labelledby="heading-practice-games">
      <div className="games-head">
        <span className="games-head-icon" aria-hidden="true">
          <Gamepad2 className="w-5 h-5" />
        </span>
        <h2 id="heading-practice-games" className="flex-1 min-w-0 self-center text-lg sm:text-xl font-extrabold text-white leading-tight">
          Gyakorló játékok
        </h2>
        <Link href="/games" className="games-head-link">
          Játékok menü
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
        {/* A leírás saját, teljes szélességű sorban — mobilon sem szorul a gomb mellé. */}
        <p className="games-head-text">
          A tananyagok mellett itt gyakorolhatsz: mindegyik játékban cél + akadály + kvíz vagy matekteszt van, és a jó válaszra azonnal
          jutalom (XP, sorozat) érkezik — a szülők a játék oldalán elolvashatják, mit fejleszt pontosan.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 auto-rows-fr">
        {/* Szökőár — a kártya nem link: a három nehézségi szint külön indul */}
        <div className="game-card" style={accent("#22d3ee")}>
          <GameCardBody icon={<Waves />} badge="MIX" title="Szökőár szökés — Tudáspróba">
            Angol, matek, nyelvtan, környezet vagy vegyes kihívás.
          </GameCardBody>
          <div className="game-diffs">
            <Link href="/games/tsunami-english?difficulty=easy" className="game-diff game-diff--easy">Könnyű</Link>
            <Link href="/games/tsunami-english?difficulty=normal" className="game-diff game-diff--normal">Közepes</Link>
            <Link href="/games/tsunami-english?difficulty=hard" className="game-diff game-diff--hard">Nehéz</Link>
          </div>
        </div>

        <Link href="/games/word-ladder-hu-en" className="game-card" style={accent("#e879f9")}>
          <GameCardBody icon={<BookOpen />} badge="HU↔EN" title="Szólétra (HU ↔ EN)" cta="Indítás">
            Szókincs és párosítás: minden jó válasz egy fokkal feljebb.
          </GameCardBody>
        </Link>

        <Link href="/games/block-craft-quiz" className="game-card" style={accent("#a3e635")}>
          <GameCardBody icon={<Box />} badge="KVÍZ" title="Kockavadász kvíz" cta="Blokkvilág">
            Minecraft hangulat: bányászat + angol kérdés blokkonként.
          </GameCardBody>
        </Link>

        <Link href="/games/speed-quiz-math" className="game-card" style={accent("#fbbf24")}>
          <GameCardBody icon={<Zap />} badge="MAT" title="Gyors matek sprint" cta="Sprint">
            Gyors feladatok, kombó szorzó: 3–5. osztály szintek.
          </GameCardBody>
        </Link>

        <Link href="/games/brain-rot-steal" className="game-card" style={accent("#c084fc")}>
          <GameCardBody icon={<Brain />} badge="MIX" title="Brain Rot Lopás" cta="Vadászat">
            Kapd el a Brain Rot-okat! Angol, matek, magyar kvíz.
          </GameCardBody>
        </Link>

        <Link href="/games/space-asteroid-quiz" className="game-card" style={accent("#818cf8")}>
          <GameCardBody icon={<Rocket />} badge="3D" title="Galaktikus Aszteroida" cta="Indítás">
            Űrharc + kvíz a saját osztályod tananyagából.
          </GameCardBody>
        </Link>

        <Link href="/games/tornado-hunter-200" className="game-card" style={accent("#38bdf8")}>
          <GameCardBody icon={<Tornado />} badge="3D" title="Tornado Hunter 200" cta="Vadászat">
            Viharvadászat: 200 szint, járművek, matek/angol kvíz a horgonyzáskor.
          </GameCardBody>
        </Link>
      </div>
    </section>
  );
}

export default memo(HomePracticeGames);
