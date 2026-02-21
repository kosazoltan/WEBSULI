import { memo } from "react";
import { ChevronDown, GraduationCap, FileText, LogIn, Shield } from "lucide-react";
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
  const { user, isAuthenticated, isAdmin } = useAuth();

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
    <div className="relative flex items-center justify-center overflow-hidden rounded-lg mb-3 py-2 sm:py-3">
      {/* Gemini fénykép háttér */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-70"
        style={{ backgroundImage: 'url("/gemini-hero-bg.jpg")' }}
      />

      {/* Sötét overlay */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Főtartalom - egyetlen kompakt sor */}
      <motion.div
        className="relative z-10 w-full max-w-5xl mx-auto px-3 py-1"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          {/* Bal: Cím + alcím */}
          <motion.div variants={itemVariants} className="text-center sm:text-left">
            <h1 className="text-lg sm:text-xl font-extrabold leading-tight">
              <span className="animate-rainbow-spectrum drop-shadow-lg">WebSuli</span>
            </h1>
            <p className="text-xs text-white/80 hidden sm:block">
              Interaktív tananyagok {MIN_CLASSROOM === 0 ? "1" : MIN_CLASSROOM}-{MAX_CLASSROOM}. osztályosoknak
            </p>
          </motion.div>

          {/* Közép: Statisztikák */}
          <motion.div variants={itemVariants} className="flex items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-sm font-bold text-white">{totalFiles}</span>
              <span className="text-xs text-white/70 hidden sm:inline">tananyag</span>
            </div>
            <div className="flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-sm font-bold text-white">{totalClassrooms}</span>
              <span className="text-xs text-white/70 hidden sm:inline">osztály</span>
            </div>
          </motion.div>

          {/* Jobb: CTA gombok + Auth */}
          <motion.div variants={itemVariants} className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={scrollToContent}
              className="gap-1.5 bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white border-0 text-xs px-3 py-1 h-7 rounded-full shadow-lg"
            >
              Böngészés
              <ChevronDown className="w-3.5 h-3.5 animate-bounce" />
            </Button>
            {showEmailSubscribe && <EmailSubscribeDialog />}
            {isAdmin ? (
              <Link href="/admin">
                <Button size="sm" className="h-7 px-2 text-xs gap-1 bg-orange-600 hover:bg-orange-700 text-white rounded-full">
                  <Shield className="w-3 h-3" />
                  Admin
                </Button>
              </Link>
            ) : !isAuthenticated ? (
              <Link href="/login">
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-white/40 text-white hover:bg-white/20 rounded-full">
                  <LogIn className="w-3 h-3" />
                  Belépés
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
