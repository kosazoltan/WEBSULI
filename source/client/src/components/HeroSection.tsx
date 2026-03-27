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
    <div className="relative flex items-center justify-center overflow-hidden rounded-lg mb-2 py-1.5 sm:py-2">
      {/* Gemini fénykép háttér */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-70"
        style={{ backgroundImage: 'url("/gemini-hero-bg.jpg")' }}
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
          <motion.div variants={itemVariants} className="flex items-center gap-2 sm:gap-4 shrink-0">
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
          <motion.div variants={itemVariants} className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
            <Link href="/games">
              <Button
                size="sm"
                className="gap-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border-0 text-[10px] sm:text-xs px-2 sm:px-3 h-6 sm:h-7 rounded-full shadow-lg"
                data-testid="link-hero-games"
              >
                <Gamepad2 className="w-3 h-3 shrink-0" />
                <span className="hidden xs:inline">Játékok</span>
              </Button>
            </Link>
            <Button
              size="sm"
              onClick={scrollToContent}
              className="gap-1 bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white border-0 text-[10px] sm:text-xs px-2 sm:px-3 h-6 sm:h-7 rounded-full shadow-lg"
            >
              <span className="hidden xs:inline">Böngészés</span>
              <ChevronDown className="w-3 h-3 animate-bounce" />
            </Button>
            <div className="hidden sm:block">
              {showEmailSubscribe && <EmailSubscribeDialog />}
            </div>
            {isAdmin ? (
              <Link href="/admin">
                <Button
                  size="sm"
                  className="h-7 min-w-[72px] px-2.5 text-xs font-semibold gap-1 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white border border-rose-200/25 rounded-full shadow-lg"
                >
                  <Shield className="w-3.5 h-3.5 shrink-0" />
                  <span>Admin</span>
                </Button>
              </Link>
            ) : !isAuthenticated ? (
              <Link href="/login">
                <Button size="sm" variant="outline" className="h-6 sm:h-7 px-1.5 sm:px-2 text-[10px] sm:text-xs gap-0.5 border-white/40 text-white hover:bg-white/20 rounded-full">
                  <LogIn className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  <span className="hidden xs:inline">Belépés</span>
                </Button>
              </Link>
            ) : null}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

export default memo(HeroSection);
