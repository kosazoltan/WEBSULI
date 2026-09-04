import { memo } from "react";
import { ChevronDown, GraduationCap, FileText, LogIn, Shield, Gamepad2 } from "lucide-react";
import EmailSubscribeDialog from "@/components/EmailSubscribeDialog";
import { Button } from "@/components/ui/button";
import { MIN_CLASSROOM, MAX_CLASSROOM } from "@shared/classrooms";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";

interface HeroSectionProps {
  totalFiles?: number;
  totalClassrooms?: number;
  showEmailSubscribe?: boolean;
}

function HeroSection({
  totalFiles = 0,
  totalClassrooms = 0,
  showEmailSubscribe = true,
}: HeroSectionProps) {
  const { isAuthenticated, isAdmin } = useAuth();

  const scrollToContent = () => {
    const content = document.getElementById("content-start");
    if (content) {
      content.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Framer Motion animációk
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring",
        damping: 12,
        stiffness: 100,
      },
    },
  };

  return (
    // E2E/a11y (2026-09-02): a felső sáv az oldal fejléce → szemantikus <header> landmark
    <header className="relative flex items-center justify-center overflow-hidden rounded-lg mb-2 py-1.5 sm:py-2">
      {/* Gemini fénykép háttér */}
      {/* LS-0c (2026-09-04): 11,16 MB JPEG → 246 KB WebP (1440px, q72), 97,7% kisebb.
          A kép opacity-70 + fekete overlay mögött díszlet, a méret nem indokolt.
          A duplikátum copernican-hero-bg.jpg (bájtra azonos, 0 kódhivatkozás) törölve. */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-70"
        style={{ backgroundImage: 'url("/gemini-hero-bg.webp")' }}
      />

      {/* Sötét overlay */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Főtartalom - dinamikus elrendezés */}
      <motion.div
        className="relative z-10 w-full max-w-6xl mx-auto px-2 sm:px-3 py-0.5"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="flex items-center justify-between gap-1.5 sm:gap-3 flex-wrap sm:flex-nowrap">
          {/* Bal: Cím + alcím */}
          <motion.div variants={itemVariants} className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <h1 className="text-base sm:text-lg font-extrabold leading-none">
              <span className="animate-rainbow-spectrum drop-shadow-lg">WebSuli</span>
            </h1>
            <p className="text-[10px] sm:text-xs text-white/80 hidden sm:block whitespace-nowrap">
              {MIN_CLASSROOM === 0 ? "1" : MIN_CLASSROOM}-{MAX_CLASSROOM}. oszt.
            </p>
          </motion.div>

          {/* Közép: Statisztikák */}
          <motion.div variants={itemVariants} className="flex items-center gap-2 sm:gap-4 shrink-0" data-testid="hero-stats">
            <div className="flex items-center gap-1">
              <FileText className="w-3 h-3 text-orange-400" />
              <span className="text-xs sm:text-sm font-bold text-white">{totalFiles}</span>
              <span className="text-[10px] text-white/70 hidden md:inline">tananyag</span>
            </div>
            <div className="flex items-center gap-1">
              <GraduationCap className="w-3 h-3 text-amber-400" />
              <span className="text-xs sm:text-sm font-bold text-white">{totalClassrooms}</span>
              <span className="text-[10px] text-white/70 hidden md:inline">osztály</span>
            </div>
          </motion.div>

          {/* Jobb: CTA gombok + Auth */}
          {/* LS-0b: 44px-es érintőfelület (WCAG 2.5.5 / iOS HIG) és MINDIG látható felirat.
              Korábban `h-6` (24px) + `hidden xs:inline` → 480px alatt ikon-only, ujjal alig
              található gombok. A feliratot nem rejtjük el, inkább tördelünk. */}
          <motion.div variants={itemVariants} className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto flex-wrap justify-end">
            <Button
              asChild
              size="sm"
              className="gap-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border-0 text-xs px-3 min-h-11 min-w-11 rounded-full shadow-lg"
            >
              <a href="#gyakorlo-jatekok" data-testid="link-hero-games">
                <Gamepad2 className="w-4 h-4 shrink-0" />
                <span>Játékok</span>
              </a>
            </Button>
            <Button
              size="sm"
              onClick={scrollToContent}
              className="gap-1 bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white border-0 text-xs px-3 min-h-11 min-w-11 rounded-full shadow-lg"
              data-testid="button-hero-browse"
            >
              <span>Böngészés</span>
              <ChevronDown className="w-4 h-4 animate-bounce" />
            </Button>
            <div className="hidden sm:block">
              {showEmailSubscribe && <EmailSubscribeDialog />}
            </div>
            {isAdmin ? (
              <Link href="/admin">
                <Button
                  size="sm"
                  className="min-h-11 min-w-11 px-3 text-xs font-semibold gap-1 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white border border-rose-200/25 rounded-full shadow-lg"
                >
                  <Shield className="w-4 h-4 shrink-0" />
                  <span>Admin</span>
                </Button>
              </Link>
            ) : !isAuthenticated ? (
              <Link href={`/login?returnTo=${encodeURIComponent("/")}`}>
                <Button size="sm" variant="outline" className="min-h-11 min-w-11 px-3 text-xs gap-1 border-white/40 text-white hover:bg-white/20 rounded-full" data-testid="button-hero-login">
                  <LogIn className="w-4 h-4 shrink-0" />
                  <span>Belépés</span>
                </Button>
              </Link>
            ) : null}
          </motion.div>
        </div>
      </motion.div>
    </header>
  );
}

export default memo(HeroSection);
