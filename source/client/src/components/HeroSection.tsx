import { memo } from "react";
import { BookOpen, ChevronDown, GraduationCap, FileText, LogIn, Shield, Gamepad2 } from "lucide-react";
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
    // E2E/a11y (2026-09-02): a felső sáv az oldal fejléce → szemantikus <header> landmark.
    // Spec 2026-11-03-hero-szponzor-2026: üvegpanel a kártyák nyelvén — márkablokk, statisztika-chipek, egy rendszerű gombok.
    <header className="hero-bar relative overflow-hidden mb-2">
      {/* LS-0c (2026-09-04): 246 KB-os WebP; halvány díszlet a színátmenetes fátyol alatt. */}
      <div aria-hidden="true" className="hero-bar-bg" style={{ backgroundImage: 'url("/gemini-hero-bg.webp")' }} />
      <div aria-hidden="true" className="hero-bar-veil" />

      <motion.div
        className="relative z-10 w-full max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="flex items-center justify-between gap-x-3 gap-y-2.5 flex-wrap xl:flex-nowrap">
          {/* Márka */}
          <motion.div variants={itemVariants} className="flex items-center gap-2.5 min-w-0">
            <span className="hero-mark" aria-hidden="true">
              <BookOpen className="w-5 h-5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-extrabold leading-none tracking-tight">
                <span className="animate-rainbow-spectrum">WebSuli</span>
              </h1>
              <p className="hero-tagline hidden sm:block">
                {MIN_CLASSROOM === 0 ? 1 : MIN_CLASSROOM}–{MAX_CLASSROOM}. évfolyam · interaktív tananyagok
              </p>
            </div>
          </motion.div>

          {/* Statisztikák */}
          <motion.div variants={itemVariants} className="flex items-center gap-1.5 shrink-0" data-testid="hero-stats">
            <span className="hero-chip">
              <FileText className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
              <b>{totalFiles}</b>
              <span className="hidden sm:inline">tananyag</span>
            </span>
            <span className="hero-chip">
              <GraduationCap className="w-3.5 h-3.5 text-sky-300" aria-hidden="true" />
              <b>{totalClassrooms}</b>
              <span className="hidden sm:inline">évfolyam</span>
            </span>
          </motion.div>

          {/* Gombok — LS-0b: 46 px-es érintőfelület és mindig látható felirat. Review #388: egy sorba csak ott kerül minden, ahol
              ténylegesen elfér (xl, mérve); alatta a gombok saját, teljes szélességű sort kapnak — nincs átfedés. */}
          <motion.div variants={itemVariants} className="flex items-center gap-1.5 sm:gap-2 w-full xl:w-auto xl:ml-auto">
            <Button asChild size="sm" className="hero-btn hero-btn--games flex-1 xl:flex-none">
              <a href="#gyakorlo-jatekok" data-testid="link-hero-games">
                <Gamepad2 className="w-4 h-4 shrink-0" />
                <span>Játékok</span>
              </a>
            </Button>
            <Button
              size="sm"
              onClick={scrollToContent}
              className="hero-btn hero-btn--primary flex-1 xl:flex-none"
              data-testid="button-hero-browse"
            >
              <span>Böngészés</span>
              <ChevronDown className="w-4 h-4 animate-bounce [animation-iteration-count:3]" />
            </Button>
            {showEmailSubscribe && (
              <div className="hidden sm:block">
                <EmailSubscribeDialog />
              </div>
            )}
            {isAdmin ? (
              <Link href="/admin" className="flex-1 xl:flex-none">
                <Button size="sm" className="hero-btn hero-btn--admin w-full">
                  <Shield className="w-4 h-4 shrink-0" />
                  <span>Admin</span>
                </Button>
              </Link>
            ) : !isAuthenticated ? (
              <Link href={`/login?returnTo=${encodeURIComponent("/")}`} className="flex-1 xl:flex-none">
                <Button size="sm" className="hero-btn hero-btn--login w-full" data-testid="button-hero-login">
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
