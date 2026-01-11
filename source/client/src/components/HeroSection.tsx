import { memo } from "react";
import { ChevronRight, Zap, Flame, Trophy, Star, BookOpen, Lightbulb, Calculator, Brain } from "lucide-react";
import EmailSubscribeDialog from "@/components/EmailSubscribeDialog";
import { Button } from "@/components/ui/button";
import ScientificHeroBackground from "@/components/ScientificHeroBackground";

interface HeroSectionProps {
  totalFiles?: number;
  totalClassrooms?: number;
  showEmailSubscribe?: boolean;
}

function HeroSection({
  totalFiles = 0,
  totalClassrooms = 0,
  showEmailSubscribe = true
}: HeroSectionProps) {

  // 🎮 Gamification values (calculated from actual data)
  const currentLevel = Math.floor(totalFiles / 10) + 1;
  const xpProgress = (totalFiles % 10) * 10; // Progress to next level (0-100)
  const streakDays = 7; // Could be fetched from user data
  
  const scrollToContent = () => {
    const content = document.getElementById('content-start');
    if (content) content.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div 
      className="relative text-center mb-12 py-16 sm:py-20 px-4 sm:px-6 lg:px-8 rounded-[2.5rem] overflow-hidden border-0" 
      style={{
        backgroundColor: 'transparent', // Átlátszó háttér - ScientificHeroBackground látható legyen
        minHeight: '500px',
        position: 'relative',
      } as React.CSSProperties}>
      
      {/* Tudományos háttér - részecskék, képletek, geometriai minták */}
      <ScientificHeroBackground />

      {/* Main Content */}
      <div className="relative z-20 max-w-5xl mx-auto flex flex-col items-center">

        {/* 🏆 Gamification Status Bar - Level, XP, Streak */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-6 fade-in-up">
          {/* Level Badge */}
          <div className="achievement-badge medal-shine">
            <span className="level-indicator mr-2">{currentLevel}</span>
            <span className="text-xs font-black tracking-widest uppercase">Level</span>
            <Trophy className="w-4 h-4 ml-2" />
          </div>
          
          {/* XP Badge */}
          <div className="xp-badge medal-shine">
            <Star className="w-4 h-4" />
            <span className="font-black">{totalFiles * 50} XP</span>
            <Zap className="w-4 h-4" />
          </div>
          
          {/* Streak Badge */}
          <div className="streak-badge">
            <Flame className="w-4 h-4" />
            <span className="font-black">{streakDays} nap</span>
            <span className="text-xs">🔥</span>
          </div>
        </div>

        {/* Achievement Badge - Gaming Style with Pulse */}
        <div className="achievement-badge mb-6 fade-in-up glow-on-hover energy-pulse">
            <span className="text-3xl animate-wobble inline-block">🎮</span>
            <span className="text-xs font-black tracking-widest uppercase ml-2">Websuli 2026</span>
            <span className="ml-2 text-lg">✨</span>
        </div>

        {/* Title - Tudományos témájú gradient szöveg */}
        <h1 
          className="text-4xl sm:text-6xl lg:text-7xl xl:text-8xl font-black mb-6 tracking-tight leading-[1.1] fade-in-up"
          style={{
            background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 50%, #F97316 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Felfedezd a
          <br />
          <span className="inline-block mt-2">Tudomány Világát</span>
        </h1>

        {/* Subtitle / Mission Statement - Tudományos téma */}
        <p 
          className="text-lg sm:text-xl lg:text-2xl text-white/90 mb-8 max-w-3xl font-medium leading-relaxed fade-in-up"
          style={{
            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
            animationDelay: '0.2s',
          }}
        >
          Oktatás modern és interaktív módon. Tanulj, felfedezz, növekedj a{' '}
          <span 
            className="font-black"
            style={{
              background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            matematika, fizika és tudomány
          </span>{' '}
          világában.
        </p>

        {/* 📊 XP Progress Bar to Next Level */}
        <div className="w-full max-w-md mx-auto mb-8 fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="flex items-center justify-between text-xs font-black text-muted-foreground mb-2">
            <span 
              className="flex items-center gap-1"
              style={{
                background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              <Star className="w-4 h-4" />
              Level {currentLevel}
            </span>
            <span 
              className="flex items-center gap-1"
              style={{
                background: 'linear-gradient(135deg, #F97316, #EAB308)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              <span>{xpProgress}%</span>
              <span className="text-xs">→ Level {currentLevel + 1}</span>
            </span>
          </div>
          <div className="xp-progress-bar">
            <div 
              className="xp-progress-fill"
              style={{ width: `${xpProgress}%` }}
            />
          </div>
          <p className="text-center text-xs text-muted-foreground mt-2">
            <span 
              className="font-bold"
              style={{
                background: 'linear-gradient(135deg, #F97316, #EAB308)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {(10 - (totalFiles % 10)) * 50} XP
            </span>
            {' '}kell a következő szinthez! 🎯
          </p>
        </div>

        {/* CTA Actions - Pulzáló gomb gradient-tel */}
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto items-center fade-in-up" style={{ animationDelay: '0.4s' }}>
            <Button
                size="lg"
                className="pulse-cta w-full sm:w-auto text-base sm:text-lg h-14 sm:h-16 px-8 sm:px-10 rounded-2xl text-white hover:scale-110 transition-all shadow-xl font-black relative overflow-hidden group"
                style={{
                  background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 50%, #F97316 100%)',
                  border: 'none',
                }}
                onClick={scrollToContent}
            >
                <span className="relative z-10 flex items-center">
                  <BookOpen className="w-5 h-5 mr-2" />
                  Kezdjük el a tanulást
                  <ChevronRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </span>
                {/* Animated shine effect */}
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></span>
            </Button>

            {showEmailSubscribe && (
               <div className="w-full sm:w-auto">
                  <EmailSubscribeDialog />
               </div>
            )}
        </div>

        {/* 🎮 Stats - Gaming Achievement Style */}
        <div className="mt-12 sm:mt-16 pt-6 sm:pt-8 border-t border-white/20 flex flex-wrap justify-center gap-6 sm:gap-8 lg:gap-16 fade-in-up" style={{ animationDelay: '0.5s' }}>
            {/* Tananyagok - Achievement Card */}
            <div className="text-center sticker hover:scale-110 transition-transform fade-in-up glow-on-hover game-card-3d" style={{ animationDelay: '0.6s' }}>
                <div className="relative">
                  <div 
                    className="text-4xl sm:text-5xl font-black mb-1"
                    style={{
                      background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    {totalFiles}
                  </div>
                  <div className="absolute -top-2 -right-2 text-lg animate-wobble">🏆</div>
                </div>
                <div className="text-xs uppercase tracking-widest text-white/70 font-bold flex items-center justify-center gap-1">
                  <BookOpen className="w-3 h-3" />
                  <span>Tananyag</span>
                </div>
                <div 
                  className="text-xs font-bold mt-1"
                  style={{
                    background: 'linear-gradient(135deg, #F97316, #EAB308)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  +{totalFiles * 50} XP
                </div>
            </div>
            
            {/* Osztályok - Achievement Card */}
            <div className="text-center sticker hover:scale-110 transition-transform fade-in-up glow-on-hover game-card-3d" style={{ animationDelay: '0.7s' }}>
                <div className="relative">
                  <div 
                    className="text-4xl sm:text-5xl font-black mb-1"
                    style={{
                      background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    {totalClassrooms}
                  </div>
                  <div className="absolute -top-2 -right-2 text-lg animate-wobble" style={{ animationDelay: '0.2s' }}>⭐</div>
                </div>
                <div className="text-xs uppercase tracking-widest text-white/70 font-bold flex items-center justify-center gap-1">
                  <Calculator className="w-3 h-3" />
                  <span>Osztály</span>
                </div>
                <div 
                  className="text-xs font-bold mt-1"
                  style={{
                    background: 'linear-gradient(135deg, #F97316, #EAB308)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Unlocked!
                </div>
            </div>
            
            {/* Lehetőségek - Achievement Card */}
            <div className="text-center sticker hover:scale-110 transition-transform fade-in-up glow-on-hover game-card-3d" style={{ animationDelay: '0.8s' }}>
                <div className="relative">
                  <div 
                    className="text-4xl sm:text-5xl font-black mb-1"
                    style={{
                      background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    ∞
                  </div>
                  <div className="absolute -top-2 -right-2 text-lg animate-wobble" style={{ animationDelay: '0.4s' }}>🌟</div>
                </div>
                <div className="text-xs uppercase tracking-widest text-white/70 font-bold flex items-center justify-center gap-1">
                  <Brain className="w-3 h-3" />
                  <span>Lehetőség</span>
                </div>
                <div 
                  className="text-xs font-bold mt-1"
                  style={{
                    background: 'linear-gradient(135deg, #F97316, #EAB308)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Unlimited!
                </div>
            </div>
        </div>

      </div>
    </div>
  );
}

export default memo(HeroSection);
