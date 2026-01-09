import { memo } from "react";
import { ChevronRight, Zap, Flame, Trophy, Star } from "lucide-react";
import EmailSubscribeDialog from "@/components/EmailSubscribeDialog";
import { Button } from "@/components/ui/button";

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
      className="hero-section-container relative text-center mb-12 py-16 sm:py-20 px-4 sm:px-6 lg:px-8 rounded-[2.5rem] overflow-hidden border-0 animate-slide-in-up" 
      style={{
        background: 'linear-gradient(to bottom, hsl(230 60% 12%), hsl(240 50% 15%), hsl(235 55% 14%))',
        backgroundColor: 'hsl(230 60% 12%)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 10px 40px rgba(30, 144, 255, 0.2), 0 0 0 1px rgba(255, 140, 0, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.1)',
        zIndex: 10,
      } as React.CSSProperties}>
      
      {/* MP4 Video háttér - űr/planéta témájú - ELREJTVE ha nem töltődik be */}
      <video
        className="absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        style={{ 
          zIndex: 0,
          objectPosition: 'center center',
          display: 'none', /* Videó elrejtése - csak sci-fi SVG háttér */
        }}
        onLoadedData={(e) => {
          // Videó betöltése után is maradjon elrejtve
          const video = e.currentTarget;
          video.style.opacity = '0';
          video.style.display = 'none';
        }}
      >
        <source src="/hero-video.mp4" type="video/mp4" />
        {/* Fallback ha a videó nem töltődik be */}
        Your browser does not support the video tag.
      </video>

      {/* Sci-fi űr atmoszféra overlay - sötét kék/lila ég → narancs nap → vörös-barna bolygó */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{ 
          zIndex: 1,
          background: `
            linear-gradient(to bottom, 
              hsl(230 70% 15% / 0.5) 0%, 
              hsl(240 60% 20% / 0.4) 30%,
              hsl(25 90% 45% / 0.3) 60%,
              hsl(30 100% 55% / 0.4) 75%,
              hsl(15 80% 30% / 0.5) 100%
            )
          `,
        }}
      />

      {/* Nap glow effekt - narancs-sárga fény */}
      <div 
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{ 
          zIndex: 1,
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, hsl(30 100% 65% / 0.4) 0%, hsl(25 90% 50% / 0.2) 40%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(60px)',
        }}
      />

      {/* Sci-fi bolygó táj háttér SVG - vörös-barna hegyek, narancs nap */}
      <div className="absolute inset-0 opacity-30 pointer-events-none overflow-hidden" style={{ zIndex: 2 }}>
        <svg className="absolute bottom-0 left-0 w-full h-full" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMax slice">
          <defs>
            <linearGradient id="spaceSkyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="hsl(230 70% 15%)" />
              <stop offset="40%" stopColor="hsl(240 60% 20%)" />
              <stop offset="70%" stopColor="hsl(25 90% 45%)" />
              <stop offset="100%" stopColor="hsl(15 80% 30%)" />
            </linearGradient>
            <linearGradient id="planetGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="hsl(15 75% 35%)" />
              <stop offset="100%" stopColor="hsl(10 80% 25%)" />
            </linearGradient>
            <radialGradient id="sunGlow" cx="50%" cy="50%">
              <stop offset="0%" stopColor="hsl(30 100% 70%)" />
              <stop offset="50%" stopColor="hsl(25 90% 55%)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>
          
          {/* Űr ég háttér - sötét kék/lila → narancs */}
          <rect width="1200" height="600" fill="url(#spaceSkyGradient)" />
          
          {/* Nap - narancs-sárga glow */}
          <circle cx="400" cy="200" r="80" fill="url(#sunGlow)" opacity="0.8" />
          <circle cx="400" cy="200" r="60" fill="hsl(30 100% 65%)" />
          
          {/* Bolygó hegyek - vörös-barna */}
          <path d="M 0,600 L 0,400 L 150,320 L 300,350 L 450,280 L 600,320 L 750,300 L 900,340 L 1050,310 L 1200,330 L 1200,600 Z" 
                fill="url(#planetGradient)" opacity="0.8" />
          
          {/* További hegyek rétegek */}
          <path d="M 0,600 L 100,420 L 250,380 L 400,400 L 550,350 L 700,370 L 850,390 L 1000,360 L 1200,380 L 1200,600 Z" 
                fill="url(#planetGradient)" opacity="0.7" />
          
          <path d="M 0,600 L 50,480 L 200,440 L 350,460 L 500,420 L 650,440 L 800,460 L 950,430 L 1200,450 L 1200,600 Z" 
                fill="url(#planetGradient)" opacity="0.6" />
          
          {/* Csillagok az égen - fehér */}
          <circle cx="180" cy="100" r="1.5" fill="hsl(0 0% 90%)" opacity="0.8" />
          <circle cx="280" cy="60" r="1" fill="hsl(0 0% 90%)" opacity="0.6" />
          <circle cx="550" cy="80" r="1.8" fill="hsl(0 0% 90%)" opacity="0.7" />
          <circle cx="950" cy="100" r="1.5" fill="hsl(0 0% 90%)" opacity="0.8" />
          <circle cx="1100" cy="50" r="1.2" fill="hsl(0 0% 90%)" opacity="0.6" />
          <circle cx="750" cy="120" r="1.3" fill="hsl(0 0% 90%)" opacity="0.7" />
        </svg>
      </div>
      
      {/* Sci-fi UI elemek - radar, grafikonok, tracking jelek - narancs-sárga színekkel */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 3 }}>
        
        {/* Radar kör - koncentrikus gyűrűk */}
        <svg className="absolute top-1/4 right-1/4 w-32 h-32" style={{ 
          animation: 'float-rotate 8s ease-in-out infinite, alchemist-pulse 3s ease-in-out infinite',
          filter: 'drop-shadow(0 0 8px hsl(30 100% 60% / 0.6))'
        }}>
          <circle cx="16" cy="16" r="12" fill="none" stroke="hsl(30 100% 60%)" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
          <circle cx="16" cy="16" r="8" fill="none" stroke="hsl(30 100% 65%)" strokeWidth="1" strokeDasharray="2 2" opacity="0.7" />
          <circle cx="16" cy="16" r="4" fill="hsl(30 100% 65%)" opacity="0.8" />
          <line x1="16" y1="4" x2="16" y2="28" stroke="hsl(30 100% 60%)" strokeWidth="0.5" opacity="0.5" />
          <line x1="4" y1="16" x2="28" y2="16" stroke="hsl(30 100% 60%)" strokeWidth="0.5" opacity="0.5" />
        </svg>

        {/* Data flow lines - fehér ívek narancs pontokkal */}
        <svg className="absolute bottom-1/4 right-1/4 w-full h-full" style={{ 
          animation: 'float-rotate 12s ease-in-out infinite',
        }}>
          <path d="M 80% 70% Q 60% 50%, 40% 40%" 
                fill="none" 
                stroke="hsl(0 0% 90%)" 
                strokeWidth="1.5" 
                opacity="0.4"
                strokeDasharray="4 4" />
          <circle cx="40%" cy="40%" r="3" fill="hsl(30 100% 60%)" opacity="0.8" />
        </svg>

        {/* Grafikon jelzés - Spacewalks chart stílus */}
        <div className="absolute top-1/5 left-1/6 bg-black/30 backdrop-blur-sm rounded-lg p-3 border border-white/20" style={{
          animation: 'float-rotate 10s ease-in-out infinite 1s',
          boxShadow: '0 0 20px hsl(30 100% 60% / 0.3)',
        }}>
          <div className="text-white/80 text-xs font-bold mb-2 flex items-center gap-2">
            <span>📊</span>
            <span>Spacewalks</span>
          </div>
          <div className="relative h-12 w-24">
            <svg viewBox="0 0 100 50" className="w-full h-full">
              <polyline
                points="0,40 20,35 40,30 60,25 80,20 100,15"
                fill="none"
                stroke="hsl(30 100% 60%)"
                strokeWidth="2"
              />
              <polygon
                points="0,40 20,35 40,30 60,25 80,20 100,15 100,50 0,50"
                fill="hsl(30 100% 60% / 0.3)"
              />
            </svg>
          </div>
        </div>

        {/* Heart rate monitor jelzés */}
        <div className="absolute top-1/6 right-1/5 bg-black/30 backdrop-blur-sm rounded-lg p-3 border border-white/20" style={{
          animation: 'float-rotate 9s ease-in-out infinite 0.5s',
          boxShadow: '0 0 20px hsl(30 100% 60% / 0.3)',
        }}>
          <div className="text-white/80 text-xs font-bold mb-2 flex items-center gap-2">
            <span>❤️</span>
            <span>Heart rate</span>
          </div>
          <div className="relative h-12 w-24">
            <svg viewBox="0 0 100 50" className="w-full h-full">
              <polyline
                points="0,25 10,25 15,20 20,25 25,30 30,25 35,20 40,25 45,30 50,25 55,20 60,25 65,30 70,25 75,20 80,25 85,30 90,25 100,25"
                fill="none"
                stroke="hsl(30 100% 60%)"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>

        {/* Progress bars - vízszintes narancs oszlopok */}
        <div className="absolute bottom-1/3 right-1/6 flex gap-1 items-end" style={{
          animation: 'float-rotate 11s ease-in-out infinite 1.5s',
        }}>
          <div className="w-2 rounded-sm" style={{ 
            height: '60%',
            background: 'linear-gradient(to top, hsl(30, 100%, 50%), hsl(30, 100%, 65%))',
            boxShadow: '0 0 10px hsl(30 100% 60% / 0.6)',
          }} />
          <div className="w-2 rounded-sm" style={{ 
            height: '80%',
            background: 'linear-gradient(to top, hsl(30, 100%, 50%), hsl(30, 100%, 65%))',
            boxShadow: '0 0 10px hsl(30 100% 60% / 0.6)',
          }} />
          <div className="w-2 rounded-sm" style={{ 
            height: '45%',
            background: 'linear-gradient(to top, hsl(30, 100%, 50%), hsl(30, 100%, 65%))',
            boxShadow: '0 0 10px hsl(30 100% 60% / 0.6)',
          }} />
          <div className="w-2 rounded-sm" style={{ 
            height: '90%',
            background: 'linear-gradient(to top, hsl(30, 100%, 50%), hsl(30, 100%, 65%))',
            boxShadow: '0 0 10px hsl(30 100% 60% / 0.6)',
          }} />
          <div className="w-2 rounded-sm" style={{ 
            height: '70%',
            background: 'linear-gradient(to top, hsl(30, 100%, 50%), hsl(30, 100%, 65%))',
            boxShadow: '0 0 10px hsl(30 100% 60% / 0.6)',
          }} />
        </div>
      </div>
      

      {/* Main Content */}
      <div className="relative z-20 max-w-5xl mx-auto flex flex-col items-center">

        {/* 🏆 Gamification Status Bar - Level, XP, Streak */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-6 animate-bounce-in">
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
        <div className="achievement-badge mb-6 animate-bounce-in glow-on-hover energy-pulse">
            <span className="text-3xl animate-wobble inline-block">🎮</span>
            <span className="text-xs font-black tracking-widest uppercase ml-2">Websuli 2026</span>
            <span className="ml-2 text-lg">✨</span>
        </div>

        {/* Title - Sci-fi Space Theme with Orange Glow */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl xl:text-8xl font-black mb-6 tracking-tight leading-[1.1] animate-slide-in-up">
          <span className="text-white drop-shadow-[0_0_15px_rgba(255,140,0,0.5)]">Revealing the </span>
          <span className="text-orange-400 animate-slide-in-up hero-title-delay inline-block" style={{
            textShadow: '0 0 20px hsl(30 100% 60%), 0 0 40px hsl(30 100% 50%)',
            animation: 'pulse-glow 3s ease-in-out infinite',
          }}>
            Treasures
          </span>
          <span className="text-white drop-shadow-[0_0_15px_rgba(255,140,0,0.5)]"> of the Universe</span>
          <span className="text-3xl sm:text-4xl lg:text-5xl ml-2 inline-block animate-wobble" style={{ animationDelay: '0.5s' }}>🚀</span>
        </h1>

        {/* Subtitle / Mission Statement - Spacefaring Civilization Theme */}
        <p className="text-lg sm:text-xl lg:text-2xl text-white/90 mb-8 max-w-3xl font-medium leading-relaxed animate-slide-in-up hero-subtitle-delay" style={{
          textShadow: '0 2px 10px rgba(0,0,0,0.5)',
        }}>
          You want to wake up in the morning and think the future is going to be great - and that's what being a <span className="text-orange-400 font-black" style={{ textShadow: '0 0 10px hsl(30 100% 60%)' }}>spacefaring civilization</span> is all about. It's about <span className="text-orange-300 font-black" style={{ textShadow: '0 0 10px hsl(30 100% 65%)' }}>believing in the future</span> and thinking that the future will be better than the past.
        </p>

        {/* 📊 XP Progress Bar to Next Level */}
        <div className="w-full max-w-md mx-auto mb-8 animate-slide-in-up hero-subtitle-delay">
          <div className="flex items-center justify-between text-xs font-black text-muted-foreground mb-2">
            <span className="flex items-center gap-1 text-orange-400" style={{ textShadow: '0 0 10px hsl(30 100% 60%)' }}>
              <Star className="w-4 h-4" />
              Level {currentLevel}
            </span>
            <span className="text-orange-400 flex items-center gap-1" style={{ textShadow: '0 0 10px hsl(30 100% 60%)' }}>
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
            <span className="text-neon-gold font-bold">{(10 - (totalFiles % 10)) * 50} XP</span> kell a következő szinthez! 🎯
          </p>
        </div>

        {/* CTA Actions - Bouncy Buttons with Comic Borders */}
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto items-center animate-slide-in-up hero-cta-delay">
            <Button
                size="lg"
                className="btn-bouncy w-full sm:w-auto text-base sm:text-lg h-14 sm:h-16 px-8 sm:px-10 rounded-2xl text-white hover:scale-110 transition-all shadow-xl font-black relative overflow-hidden group border border-orange-400/50"
                style={{
                  background: 'linear-gradient(135deg, hsl(30 100% 55%) 0%, hsl(25 90% 50%) 100%)',
                  boxShadow: '0 0 30px hsl(30 100% 50% / 0.5), inset 0 2px 0 rgba(255,255,255,0.2)',
                }}
                onClick={scrollToContent}
            >
                <span className="relative z-10 flex items-center">
                  <span className="text-xl mr-2 animate-wobble inline-block">🚀</span>
                  Explore the Universe
                  <ChevronRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </span>
                {/* Animated shine effect - orange */}
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></span>
            </Button>

            {showEmailSubscribe && (
               <div className="w-full sm:w-auto">
                  <EmailSubscribeDialog />
               </div>
            )}
        </div>

        {/* 🎮 Stats - Gaming Achievement Style with Stickers & Gamification */}
        <div className="mt-12 sm:mt-16 pt-6 sm:pt-8 border-t border-border/50 flex flex-wrap justify-center gap-6 sm:gap-8 lg:gap-16 animate-slide-in-up hero-stats-delay">
            {/* Tananyagok - Achievement Card */}
            <div className="text-center sticker hover:scale-110 transition-transform animate-bounce-in glow-on-hover game-card-3d" style={{ animationDelay: '0.5s' }}>
                <div className="relative">
                  <div className="text-4xl sm:text-5xl font-black mb-1" style={{ 
                    color: 'hsl(30 100% 65%)',
                    textShadow: '0 0 20px hsl(30 100% 60%), 0 0 40px hsl(30 100% 50%)',
                  }}>{totalFiles}</div>
                  <div className="absolute -top-2 -right-2 text-lg animate-wobble">🏆</div>
                </div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center justify-center gap-1">
                  <span className="animate-wobble inline-block">📚</span>
                  <span>Tananyag</span>
                </div>
                <div className="text-xs text-neon-gold font-bold mt-1">+{totalFiles * 50} XP</div>
            </div>
            
            {/* Osztályok - Achievement Card */}
            <div className="text-center sticker hover:scale-110 transition-transform animate-bounce-in glow-on-hover game-card-3d" style={{ animationDelay: '0.6s' }}>
                <div className="relative">
                  <div className="text-4xl sm:text-5xl font-black mb-1" style={{ 
                    color: 'hsl(200 100% 70%)',
                    textShadow: '0 0 20px hsl(200 100% 60%), 0 0 40px hsl(200 100% 50%)',
                  }}>{totalClassrooms}</div>
                  <div className="absolute -top-2 -right-2 text-lg animate-wobble" style={{ animationDelay: '0.2s' }}>⭐</div>
                </div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center justify-center gap-1">
                  <span className="animate-wobble inline-block" style={{ animationDelay: '0.2s' }}>🎓</span>
                  <span>Osztály</span>
                </div>
                <div className="text-xs text-neon-cyan font-bold mt-1">Unlocked!</div>
            </div>
            
            {/* Lehetőségek - Achievement Card */}
            <div className="text-center sticker hover:scale-110 transition-transform animate-bounce-in glow-on-hover game-card-3d" style={{ animationDelay: '0.7s' }}>
                <div className="relative">
                  <div className="text-4xl sm:text-5xl font-black mb-1" style={{ 
                    color: 'hsl(30 100% 70%)',
                    textShadow: '0 0 20px hsl(30 100% 65%), 0 0 40px hsl(30 100% 55%)',
                  }}>∞</div>
                  <div className="absolute -top-2 -right-2 text-lg animate-wobble" style={{ animationDelay: '0.4s' }}>🌟</div>
                </div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center justify-center gap-1">
                  <span className="animate-wobble inline-block" style={{ animationDelay: '0.4s' }}>💎</span>
                  <span>Lehetőség</span>
                </div>
                <div className="text-xs text-neon-pink font-bold mt-1">Unlimited!</div>
            </div>
        </div>

      </div>
      
      {/* 🎮 Decorative elements - Floating emojis with animation */}
      <div className="floating-emoji top-4 left-4 text-2xl" style={{ animationDelay: '0s' }}>📚</div>
      <div className="floating-emoji top-8 right-8 text-xl" style={{ animationDelay: '1.5s' }}>🎓</div>
      <div className="floating-emoji bottom-6 left-12 text-xl" style={{ animationDelay: '2s' }}>⭐</div>
      <div className="absolute bottom-4 right-12 text-2xl opacity-30 animate-float-rotate" style={{ animationDelay: '0.5s' }}>🚀</div>
    </div>
  );
}

export default memo(HeroSection);
