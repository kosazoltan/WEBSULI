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
    <div className="relative text-center mb-12 py-16 sm:py-20 px-4 sm:px-6 lg:px-8 rounded-[2.5rem] overflow-hidden border-0 animate-slide-in-up" 
         style={{
           backdropFilter: 'blur(20px)',
           boxShadow: '0 10px 40px rgba(139, 92, 246, 0.15), 0 0 0 1px rgba(139, 92, 246, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.05)',
         }}>
      
      {/* MP4 Video háttér - teljesítmény-optimalizálva */}
      <video
        className="absolute inset-0 w-full h-full object-cover opacity-50 pointer-events-none"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        style={{ 
          zIndex: 0,
          objectPosition: 'center center',
        }}
        onLoadedData={(e) => {
          // Videó betöltése után smooth fade-in
          const video = e.currentTarget;
          video.style.opacity = '0.5';
          video.style.transition = 'opacity 1s ease-in';
        }}
      >
        <source src="/hero-video.mp4" type="video/mp4" />
        {/* Fallback ha a videó nem töltődik be */}
        Your browser does not support the video tag.
      </video>

      {/* Overlay gradienst a videó felett - grafit szürkétől magenta átmenet */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{ 
          zIndex: 1,
          background: 'linear-gradient(to bottom, hsl(220 10% 20% / 0.6) 0%, hsl(220 15% 25% / 0.5) 40%, hsl(280 80% 40% / 0.4) 70%, hsl(300 100% 50% / 0.3) 100%)',
        }}
      />

      {/* Fujiama hegység tájkép háttér SVG - videó és overlay felett */}
      <div className="absolute inset-0 opacity-25 pointer-events-none overflow-hidden" style={{ zIndex: 2 }}>
        <svg className="absolute bottom-0 left-0 w-full h-full" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMax slice">
          <defs>
            <linearGradient id="skyGradientHero" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="hsl(220 30% 18%)" />
              <stop offset="50%" stopColor="hsl(280 40% 22%)" />
              <stop offset="100%" stopColor="hsl(300 50% 28%)" />
            </linearGradient>
            <linearGradient id="mountainGradientHero" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="hsl(220 15% 28%)" />
              <stop offset="100%" stopColor="hsl(220 10% 22%)" />
            </linearGradient>
            <linearGradient id="fujiGradientHero" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="hsl(220 20% 32%)" />
              <stop offset="50%" stopColor="hsl(280 30% 38%)" />
              <stop offset="100%" stopColor="hsl(300 25% 30%)" />
            </linearGradient>
            <linearGradient id="snowGradientHero" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="hsl(0 0% 90%)" />
              <stop offset="100%" stopColor="hsl(220 15% 40%)" />
            </linearGradient>
          </defs>
          
          {/* Ég háttér */}
          <rect width="1200" height="600" fill="url(#skyGradientHero)" />
          
          {/* Hátsó hegyek */}
          <path d="M 0,600 L 0,350 L 200,250 L 400,280 L 600,220 L 800,250 L 1000,230 L 1200,240 L 1200,600 Z" 
                fill="url(#mountainGradientHero)" opacity="0.5" />
          
          {/* Középső hegyek */}
          <path d="M 0,600 L 150,380 L 350,300 L 550,340 L 750,280 L 950,320 L 1200,290 L 1200,600 Z" 
                fill="url(#mountainGradientHero)" opacity="0.6" />
          
          {/* Fujiama hegy - középen, karakterisztikus sziluett */}
          <path d="M 450,600 
                   L 470,560 
                   L 490,510 
                   L 510,450 
                   L 530,380 
                   L 550,320 
                   L 570,260 
                   L 590,200 
                   L 610,140 
                   L 630,100 
                   L 650,70 
                   L 670,50 
                   L 690,35 
                   L 710,25 
                   L 730,20 
                   L 750,18 
                   L 770,20 
                   L 790,25 
                   L 810,35 
                   L 830,50 
                   L 850,70 
                   L 870,100 
                   L 890,140 
                   L 910,200 
                   L 930,260 
                   L 950,320 
                   L 970,380 
                   L 990,450 
                   L 1010,510 
                   L 1030,560 
                   L 1050,600 Z" 
                fill="url(#fujiGradientHero)" />
          
          {/* Fujiama hó sapka - hófehér csúcs */}
          <path d="M 730,18 
                   L 750,16 
                   L 770,18 
                   L 790,24 
                   L 810,34 
                   L 830,48 
                   L 850,68 
                   L 870,98 
                   L 890,138 
                   L 910,198 
                   L 930,258 
                   L 950,318 
                   L 930,280 
                   L 910,200 
                   L 890,140 
                   L 870,100 
                   L 850,70 
                   L 830,50 
                   L 810,35 
                   L 790,25 
                   L 770,20 
                   L 750,18 
                   L 730,20 
                   Z" 
                fill="url(#snowGradientHero)" opacity="0.7" />
          
          {/* Felhők */}
          <ellipse cx="300" cy="180" rx="120" ry="35" fill="hsl(220 20% 28%)" opacity="0.3" />
          <ellipse cx="900" cy="150" rx="90" ry="30" fill="hsl(280 25% 30%)" opacity="0.3" />
          <ellipse cx="800" cy="200" rx="75" ry="25" fill="hsl(300 20% 32%)" opacity="0.25" />
          
          {/* Csillagok - éjszakai égen */}
          <circle cx="200" cy="120" r="2" fill="hsl(300 100% 75%)" opacity="0.5" />
          <circle cx="250" cy="80" r="1.5" fill="hsl(300 100% 75%)" opacity="0.4" />
          <circle cx="320" cy="100" r="1.8" fill="hsl(300 100% 75%)" opacity="0.5" />
          <circle cx="1000" cy="70" r="2" fill="hsl(300 100% 75%)" opacity="0.5" />
          <circle cx="1080" cy="50" r="1.5" fill="hsl(300 100% 75%)" opacity="0.4" />
        </svg>
      </div>
      
      {/* Alkimista titkos jelek - animálva - videó és SVG felett */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 3 }}>
        {/* Körök - alkimista jel (pulzáló) */}
        <svg className="absolute top-10 left-10 w-24 h-24" style={{ 
          animation: 'float-rotate 8s ease-in-out infinite, alchemist-pulse 3s ease-in-out infinite, alchemist-glow 2s ease-in-out infinite',
          filter: 'drop-shadow(0 0 4px hsl(300 100% 70% / 0.6))'
        }}>
          <circle cx="12" cy="12" r="10" fill="none" stroke="hsl(300 100% 70%)" strokeWidth="1.5" strokeDasharray="4 4" />
          <circle cx="12" cy="12" r="6" fill="none" stroke="hsl(300 100% 60%)" strokeWidth="1" />
          <circle cx="12" cy="12" r="2" fill="hsl(300 100% 70%)" />
        </svg>
        
        {/* Háromszög - tűz/levegő jel (forgó) */}
        <svg className="absolute top-20 right-20 w-20 h-20" style={{ 
          animation: 'float-rotate 10s ease-in-out infinite 1s, alchemist-rotate 20s linear infinite, alchemist-pulse 4s ease-in-out infinite',
          filter: 'drop-shadow(0 0 3px hsl(300 100% 70% / 0.5))'
        }}>
          <path d="M 10 2 L 18 18 L 2 18 Z" fill="none" stroke="hsl(300 100% 65%)" strokeWidth="2" />
          <circle cx="10" cy="10" r="1.5" fill="hsl(300 100% 70%)" />
        </svg>
        
        {/* Hexagram - csillag (pulzáló) */}
        <svg className="absolute bottom-20 left-20 w-28 h-28" style={{ 
          animation: 'float-rotate 12s ease-in-out infinite 2s, alchemist-pulse 5s ease-in-out infinite, alchemist-glow 3s ease-in-out infinite',
          filter: 'drop-shadow(0 0 5px hsl(300 100% 70% / 0.6))'
        }}>
          <path d="M 14 2 L 18 10 L 26 10 L 20 16 L 22 24 L 14 20 L 6 24 L 8 16 L 2 10 L 10 10 Z" 
                fill="none" stroke="hsl(300 100% 60%)" strokeWidth="1.5" />
        </svg>
        
        {/* Alkimista négyzet (forgó) */}
        <svg className="absolute bottom-32 right-32 w-16 h-16" style={{ 
          animation: 'float-rotate 9s ease-in-out infinite 0.5s, alchemist-rotate 25s linear infinite reverse, alchemist-pulse 3.5s ease-in-out infinite',
          filter: 'drop-shadow(0 0 3px hsl(300 100% 70% / 0.5))'
        }}>
          <rect x="2" y="2" width="12" height="12" fill="none" stroke="hsl(300 100% 65%)" strokeWidth="1.5" />
          <line x1="2" y1="8" x2="14" y2="8" stroke="hsl(300 100% 70%)" strokeWidth="1" />
          <line x1="8" y1="2" x2="8" y2="14" stroke="hsl(300 100% 70%)" strokeWidth="1" />
        </svg>
        
        {/* Pentagram - ötágú csillag (lassan forgó) */}
        <svg className="absolute top-1/2 left-1/4 w-22 h-22" style={{ 
          animation: 'float-rotate 11s ease-in-out infinite 1.5s, alchemist-rotate 30s linear infinite, alchemist-glow 4s ease-in-out infinite',
          transform: 'translate(-50%, -50%)',
          filter: 'drop-shadow(0 0 4px hsl(300 100% 70% / 0.6))'
        }}>
          <path d="M 11 2 L 13.5 8.5 L 20.5 8.5 L 14.5 13 L 17 19.5 L 11 15 L 5 19.5 L 7.5 13 L 1.5 8.5 L 8.5 8.5 Z" 
                fill="none" stroke="hsl(300 100% 65%)" strokeWidth="1.5" />
        </svg>
        
        {/* Kereszt - négy elem (pulzáló) */}
        <svg className="absolute top-1/3 right-1/3 w-18 h-18" style={{ 
          animation: 'float-rotate 7s ease-in-out infinite 0.8s, alchemist-pulse 2.5s ease-in-out infinite, alchemist-glow 2.5s ease-in-out infinite',
          filter: 'drop-shadow(0 0 3px hsl(300 100% 70% / 0.5))'
        }}>
          <line x1="9" y1="2" x2="9" y2="16" stroke="hsl(300 100% 70%)" strokeWidth="2" />
          <line x1="2" y1="9" x2="16" y2="9" stroke="hsl(300 100% 70%)" strokeWidth="2" />
          <circle cx="9" cy="9" r="2" fill="hsl(300 100% 60%)" />
        </svg>
        
        {/* Spirál jel (forgó) */}
        <svg className="absolute bottom-16 right-16 w-14 h-14" style={{ 
          animation: 'float-rotate 6s ease-in-out infinite 1.2s, alchemist-rotate 15s linear infinite, alchemist-pulse 3s ease-in-out infinite',
          filter: 'drop-shadow(0 0 3px hsl(300 100% 70% / 0.5))'
        }}>
          <path d="M 7 7 Q 7 2 12 2 Q 17 2 17 7 Q 17 12 12 12 Q 7 12 7 7" 
                fill="none" stroke="hsl(300 100% 70%)" strokeWidth="1.5" />
        </svg>
        
        {/* Alkimista körök lánc (pulzáló) */}
        <svg className="absolute top-1/4 right-1/4 w-32 h-32" style={{ 
          animation: 'float-rotate 15s ease-in-out infinite, alchemist-pulse 6s ease-in-out infinite, alchemist-glow 3.5s ease-in-out infinite',
          filter: 'drop-shadow(0 0 4px hsl(300 100% 70% / 0.5))'
        }}>
          <circle cx="16" cy="8" r="3" fill="none" stroke="hsl(300 100% 65%)" strokeWidth="1" />
          <circle cx="24" cy="16" r="3" fill="none" stroke="hsl(300 100% 65%)" strokeWidth="1" />
          <circle cx="16" cy="24" r="3" fill="none" stroke="hsl(300 100% 65%)" strokeWidth="1" />
          <circle cx="8" cy="16" r="3" fill="none" stroke="hsl(300 100% 65%)" strokeWidth="1" />
          <line x1="16" y1="8" x2="24" y2="16" stroke="hsl(300 100% 60%)" strokeWidth="0.5" />
          <line x1="24" y1="16" x2="16" y2="24" stroke="hsl(300 100% 60%)" strokeWidth="0.5" />
          <line x1="16" y1="24" x2="8" y2="16" stroke="hsl(300 100% 60%)" strokeWidth="0.5" />
          <line x1="8" y1="16" x2="16" y2="8" stroke="hsl(300 100% 60%)" strokeWidth="0.5" />
        </svg>
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

        {/* Title - Playful & Bold with Neon Glow */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl xl:text-8xl font-black mb-6 tracking-tight leading-[1.1] animate-slide-in-up">
          <span className="text-foreground drop-shadow-[0_0_10px_rgba(139,92,246,0.3)]">Lépj </span>
          <span className="text-neon-purple animate-slide-in-up hero-title-delay inline-block animate-pulse-glow">
            Szintet
          </span>
          <span className="text-3xl sm:text-4xl lg:text-5xl ml-2 inline-block animate-wobble" style={{ animationDelay: '0.5s' }}>🚀</span>
          <span className="text-2xl sm:text-3xl ml-2 inline-block animate-float-rotate">✨</span>
        </h1>

        {/* Subtitle / Mission Statement - Fun & Energetic with Gradient Text */}
        <p className="text-lg sm:text-xl lg:text-2xl text-muted-foreground mb-8 max-w-2xl font-medium leading-relaxed animate-slide-in-up hero-subtitle-delay">
          A jövő oktatási platformja. <span className="text-neon-cyan font-black glow-on-hover">Gamifikált</span> tananyagok,
          <span className="text-neon-pink font-black glow-on-hover"> közösségi</span> élmény és <span className="text-neon-purple font-black glow-on-hover">végtelen</span> lehetőségek! 
          <span className="inline-block animate-wobble ml-1">✨</span>
        </p>

        {/* 📊 XP Progress Bar to Next Level */}
        <div className="w-full max-w-md mx-auto mb-8 animate-slide-in-up hero-subtitle-delay">
          <div className="flex items-center justify-between text-xs font-black text-muted-foreground mb-2">
            <span className="flex items-center gap-1 text-neon-gold">
              <Star className="w-4 h-4" />
              Level {currentLevel}
            </span>
            <span className="text-neon-purple flex items-center gap-1">
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
                className="btn-bouncy w-full sm:w-auto text-base sm:text-lg h-14 sm:h-16 px-8 sm:px-10 rounded-2xl bg-gradient-fun animate-gradient-shift text-white hover:scale-110 transition-all shadow-xl font-black comic-border border-purple-600 relative overflow-hidden group"
                onClick={scrollToContent}
            >
                <span className="relative z-10 flex items-center">
                  <span className="text-xl mr-2 animate-wobble inline-block">🎯</span>
                  Start Learning 
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

        {/* 🎮 Stats - Gaming Achievement Style with Stickers & Gamification */}
        <div className="mt-12 sm:mt-16 pt-6 sm:pt-8 border-t border-border/50 flex flex-wrap justify-center gap-6 sm:gap-8 lg:gap-16 animate-slide-in-up hero-stats-delay">
            {/* Tananyagok - Achievement Card */}
            <div className="text-center sticker hover:scale-110 transition-transform animate-bounce-in glow-on-hover game-card-3d" style={{ animationDelay: '0.5s' }}>
                <div className="relative">
                  <div className="text-4xl sm:text-5xl font-black text-neon-purple mb-1 drop-shadow-[0_0_15px_rgba(139,92,246,0.6)]">{totalFiles}</div>
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
                  <div className="text-4xl sm:text-5xl font-black text-neon-cyan mb-1 drop-shadow-[0_0_15px_rgba(6,182,212,0.6)]">{totalClassrooms}</div>
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
                  <div className="text-4xl sm:text-5xl font-black text-neon-pink mb-1 drop-shadow-[0_0_15px_rgba(236,72,153,0.6)]">∞</div>
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
