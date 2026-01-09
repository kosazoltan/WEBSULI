import { memo } from "react";
import { Rocket, Sparkles, Zap, Brain, Trophy, ChevronRight } from "lucide-react";
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
    <div className="relative text-center mb-8 py-12 px-4 sm:px-6 lg:px-8 rounded-3xl overflow-hidden group">
      
      {/* Background Elements */}
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-0" />
      
      {/* Gamified Decorative Blobs */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl animate-float-delayed -z-10" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl animate-pulse-glow -z-10" />

      {/* Main Content */}
      <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
        
        {/* Floating 3D Icons Group */}
        <div className="relative mb-8 h-32 w-full flex justify-center items-center">
             {/* Center Trophy */}
             <div className="relative z-20 animate-float">
                <div className="absolute inset-0 bg-yellow-400/30 blur-xl rounded-full" />
                <div className="w-20 h-20 bg-gradient-to-br from-yellow-300 to-yellow-600 rounded-2xl flex items-center justify-center shadow-lg shadow-yellow-500/20 border border-yellow-200/50 transform rotate-3 hover:scale-110 transition-transform cursor-pointer">
                    <Trophy className="w-10 h-10 text-white drop-shadow-md" />
                </div>
             </div>

             {/* Orbiting Elements */}
             <div className="absolute left-1/2 -translate-x-24 -translate-y-8 animate-float-delayed z-10">
                <div className="w-14 h-14 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20 rotate-[-10deg] opacity-90">
                    <Brain className="w-7 h-7 text-white" />
                </div>
             </div>
             
             <div className="absolute left-1/2 translate-x-12 translate-y-6 animate-pulse z-10">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20 rotate-12 opacity-90">
                    <Rocket className="w-6 h-6 text-white" />
                </div>
             </div>
        </div>

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black mb-4 tracking-tight drop-shadow-2xl">
          <span className="text-white">Lépj </span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 animate-gradient-x">
            Szintet!
          </span>
        </h1>

        {/* Subtitle / Mission Statement */}
        <p className="text-lg sm:text-xl text-slate-300 mb-8 max-w-2xl font-medium leading-relaxed">
          Unalmas PDF-ek helyett <span className="text-cyan-400 font-bold">küldetés-alapú</span> tananyagok. 
          Gyűjts tudást, szerezz jó jegyeket, és építsd a jövőd!
        </p>

        {/* Stats "Health Bar" Style */}
        <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700 hover:border-cyan-500/50 transition-colors">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-slate-200 font-bold">{totalFiles}</span>
                <span className="text-slate-400 text-sm">Tananyag</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700 hover:border-purple-500/50 transition-colors">
                <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                <span className="text-slate-200 font-bold">{totalClassrooms}</span>
                <span className="text-slate-400 text-sm">Osztály</span>
            </div>
        </div>

        {/* CTA Actions */}
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Button 
                size="lg" 
                className="w-full sm:w-auto text-lg h-14 shadow-xl shadow-cyan-500/20"
                onClick={scrollToContent}
            >
                Start Küldetés <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
            
            {showEmailSubscribe && (
               <div className="w-full sm:w-auto">
                  <EmailSubscribeDialog /> 
               </div>
            )}
        </div>

        {/* Floating Badges (Features) */}
        <div className="mt-12 flex justify-center gap-6 opacity-60 hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span className="text-xs uppercase tracking-widest text-slate-400">Gyors</span>
            </div>
            <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-pink-400" />
                <span className="text-xs uppercase tracking-widest text-slate-400">Interaktív</span>
            </div>
            <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-cyan-400" />
                <span className="text-xs uppercase tracking-widest text-slate-400">Ingyenes</span>
            </div>
        </div>

      </div>
    </div>
  );
}

export default memo(HeroSection);
