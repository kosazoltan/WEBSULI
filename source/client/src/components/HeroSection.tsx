import { memo } from "react";
import { ChevronDown, BookOpen, GraduationCap, FileText, Brain, Lightbulb } from "lucide-react";
import EmailSubscribeDialog from "@/components/EmailSubscribeDialog";
import { Button } from "@/components/ui/button";
import { MIN_CLASSROOM, MAX_CLASSROOM } from "@shared/classrooms";

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

  return (
    <div className="relative min-h-[600px] flex items-center justify-center overflow-hidden rounded-2xl mb-8">
      {/* Mars-szerű gradient háttér: vörös → narancs → barna */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-950 via-orange-950 to-amber-950" />
      
      {/* Animált részecskék háttér - CSS alapú */}
      <div className="absolute inset-0 opacity-20">
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white animate-float-symbol"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: `${4 + Math.random() * 8}px`,
              height: `${4 + Math.random() * 8}px`,
              animationDelay: `${Math.random() * 6}s`,
              animationDuration: `${8 + Math.random() * 12}s`,
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
        {['E=mc²', '∑', '∫', 'π', '∇', '∞'].map((symbol, i) => (
          <div
            key={i}
            className="absolute text-white/20 text-4xl font-bold animate-float-symbol"
            style={{
              left: `${15 + i * 15}%`,
              top: `${20 + (i % 3) * 25}%`,
              animationDelay: `${i * 1.5}s`,
              animationDuration: `${10 + i * 2}s`,
            }}
          >
            {symbol}
          </div>
        ))}
      </div>

      {/* Oktatási ikonok - elszórva */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[
          { Icon: BookOpen, delay: 0 },
          { Icon: Brain, delay: 2 },
          { Icon: Lightbulb, delay: 4 },
          { Icon: GraduationCap, delay: 1 },
        ].map(({ Icon, delay }, i) => (
          <Icon
            key={i}
            className="absolute text-white/15 w-12 h-12 animate-float-icon"
            style={{
              left: `${20 + i * 20}%`,
              top: `${30 + (i % 2) * 40}%`,
              animationDelay: `${delay}s`,
            }}
          />
        ))}
      </div>

      {/* Főtartalom */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 py-16 text-center">
        {/* Főcím - gradient szöveg (Mars-szerű) */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 animate-fade-in-up">
          <span className="bg-gradient-to-r from-red-300 via-orange-300 to-amber-300 bg-clip-text text-transparent drop-shadow-lg">
            Üdvözöl a WebSuli!
          </span>
        </h1>

        {/* Alcím */}
        <p className="text-lg sm:text-xl text-white/90 mb-10 max-w-2xl mx-auto animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          Interaktív tananyagok általános és középiskolásoknak.
          Böngéssz osztályok szerint, és találd meg a neked való anyagokat!
        </p>

        {/* CTA gombok */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
          <Button
            size="lg"
            onClick={scrollToContent}
            className="gap-2 bg-gradient-to-r from-red-600 via-orange-600 to-amber-600 hover:from-red-700 hover:via-orange-700 hover:to-amber-700 text-white border-0 text-lg px-8 py-6 animate-pulse-cta shadow-xl shadow-orange-500/50"
          >
            Böngészés
            <ChevronDown className="w-5 h-5" />
          </Button>

          {showEmailSubscribe && (
            <EmailSubscribeDialog />
          )}
        </div>

        {/* Statisztikák */}
        <div className="flex flex-wrap justify-center gap-8 sm:gap-12 pt-8 border-t border-white/20 animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <FileText className="w-6 h-6 text-orange-400" />
              <span className="text-3xl sm:text-4xl font-bold text-white drop-shadow-lg">
                {totalFiles}
              </span>
            </div>
            <p className="text-sm text-white/90">Tananyag</p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <GraduationCap className="w-6 h-6 text-amber-400" />
              <span className="text-3xl sm:text-4xl font-bold text-white drop-shadow-lg">
                {totalClassrooms}
              </span>
            </div>
            <p className="text-sm text-white/90">Osztály</p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <BookOpen className="w-6 h-6 text-red-400" />
              <span className="text-3xl sm:text-4xl font-bold text-white drop-shadow-lg">
                {MIN_CLASSROOM === 0 ? "1" : MIN_CLASSROOM}-{MAX_CLASSROOM}
              </span>
            </div>
            <p className="text-sm text-white/90">Évfolyam</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(HeroSection);
