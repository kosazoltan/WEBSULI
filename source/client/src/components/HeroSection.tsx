import { memo } from "react";
import { ChevronDown, BookOpen, GraduationCap, FileText, Brain, Lightbulb } from "lucide-react";
import EmailSubscribeDialog from "@/components/EmailSubscribeDialog";
import { Button } from "@/components/ui/button";
import { MIN_CLASSROOM, MAX_CLASSROOM } from "@shared/classrooms";
import { motion } from "framer-motion";

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

  // Pre-generated particle positions to avoid Math.random() during render
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: ((i * 7.3) % 100), // Deterministic distribution
    top: ((i * 11.7) % 100),
    width: 4 + ((i * 2.1) % 8),
    height: 4 + ((i * 2.1) % 8),
    delay: (i * 0.2) % 6,
    duration: 8 + ((i * 1.3) % 12),
  }));

  // Pre-generated symbol positions - több matematikai szimbólum
  const symbols = ['E=mc²', '∑', '∫', 'π', '∇', '∞', 'Ω', 'Δ', 'Φ', 'α', 'β', 'γ'];
  const symbolPositions = symbols.map((symbol, i) => ({
    symbol,
    left: 10 + (i * 7.5) % 90,
    top: 15 + (i % 4) * 20,
    delay: i * 1.2,
    duration: 12 + (i % 4) * 2,
  }));

  // Pre-generated icon positions
  const iconPositions = [
    { Icon: BookOpen, delay: 0 },
    { Icon: Brain, delay: 2 },
    { Icon: Lightbulb, delay: 4 },
    { Icon: GraduationCap, delay: 1 },
  ].map((item, i) => ({
    ...item,
    left: 20 + i * 20,
    top: 30 + (i % 2) * 40,
  }));

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

          {/* Jobb: CTA gombok */}
          <motion.div variants={itemVariants} className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={scrollToContent}
              className="gap-1.5 bg-gradient-to-r from-[#8B5CF6] via-[#EC4899] to-[#F97316] hover:from-[#7C3AED] hover:via-[#DB2777] hover:to-[#EA580C] text-white border-0 text-xs px-3 py-1 h-7 rounded-full shadow-lg"
            >
              Böngészés
              <ChevronDown className="w-3.5 h-3.5 animate-bounce" />
            </Button>
            {showEmailSubscribe && <EmailSubscribeDialog />}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

export default memo(HeroSection);
