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

  // Pre-generated symbol positions
  const symbols = ['E=mc²', '∑', '∫', 'π', '∇', '∞'];
  const symbolPositions = symbols.map((symbol, i) => ({
    symbol,
    left: 15 + i * 15,
    top: 20 + (i % 3) * 25,
    delay: i * 1.5,
    duration: 10 + i * 2,
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
    <div className="relative min-h-[300px] flex items-center justify-center overflow-hidden rounded-2xl mb-8">
      {/* Mars-szerű gradient háttér: vörös → narancs → barna */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-950 via-orange-950 to-amber-950" />
      
      {/* Aurora gradient overlay */}
      <div className="absolute inset-0 aurora-bg opacity-40" />
      
      {/* Homokos/köves textúra overlay */}
      <div 
        className="absolute inset-0 opacity-20 mix-blend-overlay"
        style={{
          backgroundImage: `
            radial-gradient(circle at 20% 50%, rgba(139, 69, 19, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(160, 82, 45, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 40% 20%, rgba(101, 67, 33, 0.2) 0%, transparent 50%),
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 2px,
              rgba(139, 69, 19, 0.03) 2px,
              rgba(139, 69, 19, 0.03) 4px
            ),
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(160, 82, 45, 0.03) 2px,
              rgba(160, 82, 45, 0.03) 4px
            )
          `,
          backgroundSize: '100% 100%, 100% 100%, 100% 100%, 20px 20px, 20px 20px'
        }}
      />
      
      {/* Animált részecskék háttér - CSS alapú */}
      <div className="absolute inset-0 opacity-20">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="absolute rounded-full bg-white animate-float-symbol"
            style={{
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              width: `${particle.width}px`,
              height: `${particle.height}px`,
              animationDelay: `${particle.delay}s`,
              animationDuration: `${particle.duration}s`,
            }}
          />
        ))}
      </div>

      {/* Geometriai minták - SVG */}
      <svg className="absolute inset-0 w-full h-full opacity-10" aria-hidden="true">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
          </pattern>
          <pattern id="circles" width="60" height="60" patternUnits="userSpaceOnUse">
            <circle cx="30" cy="30" r="2" fill="white" opacity="0.3" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <rect width="100%" height="100%" fill="url(#circles)" />
      </svg>

      {/* Lebegő matematikai szimbólumok */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {symbolPositions.map((pos, i) => (
          <div
            key={i}
            className="absolute text-white/20 text-4xl font-bold animate-float-symbol"
            style={{
              left: `${pos.left}%`,
              top: `${pos.top}%`,
              animationDelay: `${pos.delay}s`,
              animationDuration: `${pos.duration}s`,
            }}
          >
            {pos.symbol}
          </div>
        ))}
      </div>

      {/* Oktatási ikonok - elszórva */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {iconPositions.map(({ Icon, delay, left, top }, i) => (
          <Icon
            key={i}
            className="absolute text-white/15 w-12 h-12 animate-float-icon"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              animationDelay: `${delay}s`,
            }}
          />
        ))}
      </div>

      {/* Főtartalom */}
      <motion.div
        className="relative z-10 max-w-4xl mx-auto px-4 py-8 text-center"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Főcím - gradient szöveg (Mars-szerű) */}
        <motion.h1
          variants={itemVariants}
          className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6"
        >
          <span className="bg-gradient-to-r from-red-300 via-orange-300 to-amber-300 bg-clip-text text-transparent drop-shadow-lg">
            Üdvözöl a WebSuli!
          </span>
        </motion.h1>

        {/* Alcím */}
        <motion.p
          variants={itemVariants}
          className="text-lg sm:text-xl text-white/90 mb-10 max-w-2xl mx-auto"
        >
          Interaktív tananyagok általános és középiskolásoknak.
          Böngéssz osztályok szerint, és találd meg a neked való anyagokat!
        </motion.p>

        {/* CTA gombok */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row gap-4 justify-center mb-12"
        >
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Button
              size="lg"
              onClick={scrollToContent}
              className="gap-2 bg-gradient-to-r from-red-600 via-orange-600 to-amber-600 hover:from-red-700 hover:via-orange-700 hover:to-amber-700 text-white border-0 text-lg px-8 py-6 animate-pulse-cta shadow-xl shadow-orange-500/50"
            >
              Böngészés
              <ChevronDown className="w-5 h-5" />
            </Button>
          </motion.div>

          {showEmailSubscribe && (
            <EmailSubscribeDialog />
          )}
        </motion.div>

        {/* Statisztikák */}
        <motion.div
          variants={itemVariants}
          className="flex flex-wrap justify-center gap-8 sm:gap-12 pt-8 border-t border-white/20"
        >
          <motion.div
            className="text-center"
            whileHover={{ scale: 1.1 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <FileText className="w-6 h-6 text-orange-400" />
              <span className="text-3xl sm:text-4xl font-bold text-white drop-shadow-lg">
                {totalFiles}
              </span>
            </div>
            <p className="text-sm text-white/90">Tananyag</p>
          </motion.div>

          <motion.div
            className="text-center"
            whileHover={{ scale: 1.1 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <GraduationCap className="w-6 h-6 text-amber-400" />
              <span className="text-3xl sm:text-4xl font-bold text-white drop-shadow-lg">
                {totalClassrooms}
              </span>
            </div>
            <p className="text-sm text-white/90">Osztály</p>
          </motion.div>

          <motion.div
            className="text-center"
            whileHover={{ scale: 1.1 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <BookOpen className="w-6 h-6 text-red-400" />
              <span className="text-3xl sm:text-4xl font-bold text-white drop-shadow-lg">
                {MIN_CLASSROOM === 0 ? "1" : MIN_CLASSROOM}-{MAX_CLASSROOM}
              </span>
            </div>
            <p className="text-sm text-white/90">Évfolyam</p>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default memo(HeroSection);
