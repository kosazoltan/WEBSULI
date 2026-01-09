import { memo } from "react";
import { ChevronRight, Play } from "lucide-react";
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
    <div className="relative text-center mb-12 py-20 px-4 sm:px-6 lg:px-8 rounded-[2.5rem] overflow-hidden holographic-card border-0">
      
      {/* Optimized Aurora Background Elements */}
      <div className="absolute inset-0 z-0">
         {/* Use static gradients with subtle opacity animation instead of heavy movement */}
         <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[100px] mix-blend-screen opacity-60" />
         <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[100px] mix-blend-screen opacity-60" />
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-5xl mx-auto flex flex-col items-center">
        
        {/* Badge - Minimalist */}
        <div className="mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-bold tracking-widest uppercase text-slate-300">Websuli 2026</span>
        </div>

        {/* Title - Massive Type */}
        <h1 className="text-5xl sm:text-7xl lg:text-9xl font-black mb-6 tracking-tighter leading-[0.9] drop-shadow-2xl">
          <span className="text-white">Lépj </span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-500">
            Szintet
          </span>
        </h1>

        {/* Subtitle / Mission Statement */}
        <p className="text-xl sm:text-2xl text-slate-400 mb-10 max-w-2xl font-light leading-relaxed">
          A jövő oktatási platformja. <span className="text-slate-200 font-semibold">Gamifikált</span> tananyagok 
          és <span className="text-slate-200 font-semibold">közösségi</span> élmény.
        </p>

        {/* CTA Actions - Big Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto items-center">
            <Button 
                size="lg" 
                className="w-full sm:w-auto text-lg h-16 px-10 rounded-2xl bg-white text-slate-900 hover:bg-cyan-50 transition-colors shadow-xl shadow-white/5 font-bold"
                onClick={scrollToContent}
            >
                Start <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
            
            {showEmailSubscribe && (
               <div className="w-full sm:w-auto">
                  <EmailSubscribeDialog /> 
               </div>
            )}
        </div>

        {/* Stats - Minimalist Row */}
        <div className="mt-16 pt-8 border-t border-white/5 flex gap-12 sm:gap-24 opacity-60 hover:opacity-100 transition-opacity">
            <div className="text-center">
                <div className="text-3xl font-black text-white">{totalFiles}</div>
                <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">Tananyag</div>
            </div>
            <div className="text-center">
                <div className="text-3xl font-black text-white">{totalClassrooms}</div>
                <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">Osztály</div>
            </div>
             <div className="text-center">
                <div className="text-3xl font-black text-white">∞</div>
                <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">Lehetőség</div>
            </div>
        </div>

      </div>
    </div>
  );
}

export default memo(HeroSection);
