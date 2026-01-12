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
    <div className="relative min-h-[500px] flex items-center justify-center overflow-hidden rounded-2xl mb-8">
      {/* Copernican solar system háttérkép */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: 'url("/copernican-hero-bg.jpg")',
        }}
      />
      
      {/* Sötét overlay a szöveg olvashatóságáért */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
      
      {/* Finom gradient overlay a kép fokozatos elhalványításához */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/30" />
      
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
      
      {/* Animált részecskék háttér - molekulák és atomok */}
      <div className="absolute inset-0 opacity-30">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="absolute rounded-full bg-white/60 animate-float-symbol"
            style={{
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              width: `${particle.width}px`,
              height: `${particle.height}px`,
              animationDelay: `${particle.delay}s`,
              animationDuration: `${particle.duration}s`,
              filter: 'blur(1px)',
            }}
          />
        ))}
        {/* További nagyobb részecskék */}
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={`big-${i}`}
            className="absolute rounded-full bg-purple-300/20 animate-float-symbol"
            style={{
              left: `${(i * 12) % 100}%`,
              top: `${(i * 18) % 100}%`,
              width: `${12 + (i % 4) * 4}px`,
              height: `${12 + (i % 4) * 4}px`,
              animationDelay: `${i * 0.8}s`,
              animationDuration: `${15 + (i % 3) * 3}s`,
              filter: 'blur(2px)',
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

      {/* Lebegő matematikai szimbólumok - finoman animálva */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {symbolPositions.map((pos, i) => (
          <motion.div
            key={i}
            className="absolute text-white/15 text-3xl sm:text-4xl lg:text-5xl font-bold"
            initial={{ opacity: 0, y: 20 }}
            animate={{
              opacity: [0.1, 0.3, 0.1],
              y: [0, -30, 0],
              rotate: [0, 10, -10, 0],
            }}
            transition={{
              duration: pos.duration,
              repeat: Infinity,
              delay: pos.delay,
              ease: "easeInOut",
            }}
            style={{
              left: `${pos.left}%`,
              top: `${pos.top}%`,
            }}
          >
            {pos.symbol}
          </motion.div>
        ))}
      </div>

      {/* Oktatási ikonok - elszórva és animálva */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {iconPositions.map(({ Icon, delay, left, top }, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{
              opacity: [0.1, 0.25, 0.1],
              scale: [1, 1.2, 1],
              y: [0, -20, 0],
            }}
            transition={{
              duration: 6 + i,
              repeat: Infinity,
              delay: delay,
              ease: "easeInOut",
            }}
            style={{
              left: `${left}%`,
              top: `${top}%`,
            }}
          >
            <Icon className="text-white/20 w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14" />
          </motion.div>
        ))}
      </div>

      {/* Főtartalom */}
      <motion.div
        className="relative z-10 max-w-4xl mx-auto px-4 py-8 text-center"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Főcím - vibráló gradient szöveg */}
        <motion.h1
          variants={itemVariants}
          className="text-5xl sm:text-6xl lg:text-7xl font-extrabold mb-6"
        >
          <span className="bg-gradient-to-r from-purple-300 via-pink-300 to-orange-300 bg-clip-text text-transparent drop-shadow-2xl animate-gradient-text">
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
              className="gap-2 bg-gradient-to-r from-[#8B5CF6] via-[#EC4899] to-[#F97316] hover:from-[#7C3AED] hover:via-[#DB2777] hover:to-[#EA580C] text-white border-0 text-lg px-10 py-7 rounded-full animate-pulse-glow shadow-2xl shadow-pink-500/50 hover:shadow-pink-500/70 transition-all duration-300"
            >
              Böngészés
              <ChevronDown className="w-5 h-5 animate-bounce" />
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
