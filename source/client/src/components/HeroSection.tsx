import { memo } from "react";
import { ChevronRight } from "lucide-react";
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
  
  const scrollToContent = () => {
    const content = document.getElementById('content-start');
    if (content) content.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="relative text-center mb-12 py-20 px-4 sm:px-6 lg:px-8 rounded-[2.5rem] overflow-hidden holographic-card border-0 animate-slide-in-up">

      {/* Main Content */}
      <div className="relative z-10 max-w-5xl mx-auto flex flex-col items-center">

        {/* Badge - Gaming Style */}
        <div className="achievement-badge mb-6">
            <span className="text-2xl">🎮</span>
            <span className="text-xs font-black tracking-widest uppercase">Websuli 2026</span>
        </div>

        {/* Title - Playful & Bold */}
        <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black mb-6 tracking-tight leading-[1.1] animate-slide-in-up">
          <span className="text-foreground">Lépj </span>
          <span className="text-neon-purple animate-slide-in-up hero-title-delay">
            Szintet
          </span>
          <span className="text-4xl sm:text-5xl ml-2 inline-block wobble">🚀</span>
        </h1>

        {/* Subtitle / Mission Statement - Fun & Energetic */}
        <p className="text-xl sm:text-2xl text-muted-foreground mb-10 max-w-2xl font-medium leading-relaxed animate-slide-in-up hero-subtitle-delay">
          A jövő oktatási platformja. <span className="text-neon-cyan font-black">Gamifikált</span> tananyagok,
          <span className="text-neon-pink font-black"> közösségi</span> élmény és <span className="text-neon-purple font-black">végtelen</span> lehetőségek! ✨
        </p>

        {/* CTA Actions - Bouncy Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto items-center animate-slide-in-up hero-cta-delay">
            <Button
                size="lg"
                className="btn-bouncy w-full sm:w-auto text-lg h-16 px-10 rounded-2xl bg-gradient-fun text-white hover:scale-110 transition-all shadow-xl font-black comic-border border-purple-600"
                onClick={scrollToContent}
            >
                🎯 Start Learning <ChevronRight className="w-5 h-5 ml-2" />
            </Button>

            {showEmailSubscribe && (
               <div className="w-full sm:w-auto">
                  <EmailSubscribeDialog />
               </div>
            )}
        </div>

        {/* Stats - Gaming Achievement Style */}
        <div className="mt-16 pt-8 border-t border-border/50 flex gap-8 sm:gap-16 animate-slide-in-up hero-stats-delay">
            <div className="text-center sticker">
                <div className="text-4xl font-black text-neon-purple mb-1">{totalFiles}</div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">📚 Tananyag</div>
            </div>
            <div className="text-center sticker">
                <div className="text-4xl font-black text-neon-cyan mb-1">{totalClassrooms}</div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">🎓 Osztály</div>
            </div>
             <div className="text-center sticker">
                <div className="text-4xl font-black text-neon-pink mb-1">∞</div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">⭐ Lehetőség</div>
            </div>
        </div>

      </div>
    </div>
  );
}

export default memo(HeroSection);
