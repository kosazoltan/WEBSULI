import { memo } from "react";
import { Rocket, BookOpen, Users, Sparkles, Star, Gift, Zap, Snowflake, TreePine, Bell } from "lucide-react";
import EmailSubscribeDialog from "@/components/EmailSubscribeDialog";

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
  return (
    <div className="relative text-center mb-3 sm:mb-4 py-6 sm:py-8 px-6 sm:px-10 rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10 group">

      {/* Elegant gradient background - no animation for performance */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-red-950/40 to-green-950/40" />

      {/* Subtle snow overlay pattern - static, no animation */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      {/* Glowing orbs - static positioned, subtle */}
      <div className="absolute top-0 left-1/4 w-32 h-32 bg-red-500/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-40 h-40 bg-green-500/15 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-yellow-500/10 rounded-full blur-3xl" />

      {/* Corner decorations - elegant gold accents */}
      <div className="absolute top-3 left-3 w-16 h-16">
        <div className="absolute top-0 left-0 w-8 h-[2px] bg-gradient-to-r from-yellow-400/60 to-transparent" />
        <div className="absolute top-0 left-0 w-[2px] h-8 bg-gradient-to-b from-yellow-400/60 to-transparent" />
      </div>
      <div className="absolute top-3 right-3 w-16 h-16">
        <div className="absolute top-0 right-0 w-8 h-[2px] bg-gradient-to-l from-yellow-400/60 to-transparent" />
        <div className="absolute top-0 right-0 w-[2px] h-8 bg-gradient-to-b from-yellow-400/60 to-transparent" />
      </div>
      <div className="absolute bottom-3 left-3 w-16 h-16">
        <div className="absolute bottom-0 left-0 w-8 h-[2px] bg-gradient-to-r from-yellow-400/60 to-transparent" />
        <div className="absolute bottom-0 left-0 w-[2px] h-8 bg-gradient-to-t from-yellow-400/60 to-transparent" />
      </div>
      <div className="absolute bottom-3 right-3 w-16 h-16">
        <div className="absolute bottom-0 right-0 w-8 h-[2px] bg-gradient-to-l from-yellow-400/60 to-transparent" />
        <div className="absolute bottom-0 right-0 w-[2px] h-8 bg-gradient-to-t from-yellow-400/60 to-transparent" />
      </div>

      {/* Floating Christmas symbols - static positions, subtle pulse only */}
      <div className="absolute top-[10%] left-[5%] text-2xl sm:text-3xl opacity-60 text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]">
        <Star className="w-6 h-6 fill-yellow-400" />
      </div>
      <div className="absolute top-[15%] right-[8%] text-xl opacity-50 text-white/70">
        <Snowflake className="w-5 h-5" />
      </div>
      <div className="absolute bottom-[15%] left-[8%] text-2xl opacity-60 text-red-400">
        <Gift className="w-6 h-6" />
      </div>
      <div className="absolute bottom-[20%] right-[5%] text-xl opacity-50 text-green-400">
        <TreePine className="w-5 h-5" />
      </div>
      <div className="absolute top-[50%] left-[3%] text-lg opacity-40 text-yellow-400">
        <Bell className="w-4 h-4" />
      </div>
      <div className="absolute top-[40%] right-[3%] text-lg opacity-40 text-white/60">
        <Snowflake className="w-4 h-4" />
      </div>

      {/* Main content */}
      <div className="relative z-10">

        {/* Central Christmas Icon */}
        <div className="relative inline-flex items-center justify-center mb-4 sm:mb-5">

          {/* Glow ring */}
          <div className="absolute inset-0 -m-4 rounded-full bg-gradient-to-r from-red-500/20 via-yellow-500/20 to-green-500/20 blur-xl" />

          {/* Main icon container */}
          <div className="relative">
            {/* Decorative ring */}
            <div className="absolute inset-0 -m-3 rounded-full border-2 border-dashed border-yellow-400/30 animate-spin-slow" />

            {/* Icon background */}
            <div className="relative p-5 sm:p-6 rounded-full bg-gradient-to-br from-green-800 via-green-700 to-green-900 shadow-2xl shadow-green-900/50 border-2 border-yellow-400/50">
              <TreePine className="w-10 h-10 sm:w-14 sm:h-14 text-green-100 drop-shadow-lg" />

              {/* Star on top */}
              <div className="absolute -top-1 left-1/2 -translate-x-1/2">
                <Star className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400 fill-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]" />
              </div>
            </div>

            {/* Orbiting ornaments - CSS only animation */}
            <div className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-full">
              <div className="w-3 h-3 rounded-full bg-gradient-to-br from-red-400 to-red-600 shadow-lg shadow-red-500/50" />
            </div>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full">
              <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-500 shadow-lg shadow-yellow-500/50" />
            </div>
            <div className="absolute top-1/2 right-0 translate-y-1/2 translate-x-full">
              <div className="w-3 h-3 rounded-full bg-gradient-to-br from-green-400 to-green-600 shadow-lg shadow-green-500/50" />
            </div>
          </div>
        </div>

        {/* Title with elegant gradient */}
        <h1 className="text-2xl xs:text-3xl sm:text-4xl lg:text-5xl font-black mb-2 sm:mb-3 text-transparent bg-clip-text bg-gradient-to-r from-red-300 via-yellow-200 to-green-300 tracking-tight">
          Anyagok Profiknak
        </h1>

        {/* Tagline */}
        <div className="flex items-center justify-center gap-3 mb-4 sm:mb-5">
          <div className="h-px w-8 sm:w-12 bg-gradient-to-r from-transparent via-red-400/50 to-transparent" />
          <p className="text-xs sm:text-sm text-yellow-200/80 font-medium uppercase tracking-[0.2em]">
            Boldog Karácsonyt!
          </p>
          <div className="h-px w-8 sm:w-12 bg-gradient-to-r from-transparent via-green-400/50 to-transparent" />
        </div>

        {/* Stats */}
        {totalFiles > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mb-4 sm:mb-5">
            <div className="flex items-center gap-2 px-4 py-2 bg-white/5 backdrop-blur-sm rounded-full border border-red-500/20 hover:border-red-400/40 transition-colors">
              <BookOpen className="w-4 h-4 text-red-300" />
              <span className="font-bold text-white">{totalFiles}</span>
              <span className="text-red-200/80 text-sm">anyag</span>
            </div>

            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
            </div>

            <div className="flex items-center gap-2 px-4 py-2 bg-white/5 backdrop-blur-sm rounded-full border border-green-500/20 hover:border-green-400/40 transition-colors">
              <Users className="w-4 h-4 text-green-300" />
              <span className="font-bold text-white">{totalClassrooms}</span>
              <span className="text-green-200/80 text-sm">osztály</span>
            </div>

            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
            </div>

            <div className="flex items-center gap-2 px-4 py-2 bg-white/5 backdrop-blur-sm rounded-full border border-yellow-500/20 hover:border-yellow-400/40 transition-colors">
              <Sparkles className="w-4 h-4 text-yellow-300" />
              <span className="text-yellow-200/80 text-sm font-medium">Ingyenes</span>
            </div>
          </div>
        )}

        {/* Feature cards */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-5 max-w-2xl mx-auto">
          <div className="flex flex-col items-center gap-1 p-3 sm:p-4 bg-white/5 backdrop-blur-sm rounded-xl border border-white/5 hover:border-red-500/30 transition-colors group">
            <Rocket className="w-5 h-5 sm:w-6 sm:h-6 text-red-300 group-hover:text-red-200 transition-colors" />
            <span className="text-xs sm:text-sm font-medium text-white/90">Gyors</span>
            <span className="text-[10px] text-white/50 hidden sm:block">Azonnali hozzáférés</span>
          </div>

          <div className="flex flex-col items-center gap-1 p-3 sm:p-4 bg-white/5 backdrop-blur-sm rounded-xl border border-white/5 hover:border-green-500/30 transition-colors group">
            <Gift className="w-5 h-5 sm:w-6 sm:h-6 text-green-300 group-hover:text-green-200 transition-colors" />
            <span className="text-xs sm:text-sm font-medium text-white/90">Modern</span>
            <span className="text-[10px] text-white/50 hidden sm:block">Naprakész tartalom</span>
          </div>

          <div className="flex flex-col items-center gap-1 p-3 sm:p-4 bg-white/5 backdrop-blur-sm rounded-xl border border-white/5 hover:border-yellow-500/30 transition-colors group">
            <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-300 group-hover:text-yellow-200 transition-colors" />
            <span className="text-xs sm:text-sm font-medium text-white/90">Hatékony</span>
            <span className="text-[10px] text-white/50 hidden sm:block">Optimalizált tanulás</span>
          </div>
        </div>

        {/* Email Subscribe */}
        {showEmailSubscribe && (
          <div className="flex justify-center">
            <EmailSubscribeDialog />
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(HeroSection);
