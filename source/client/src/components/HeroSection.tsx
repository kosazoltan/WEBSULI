import { useEffect, useRef } from "react";
import { Rocket, BookOpen, Users, Sparkles } from "lucide-react";
import EmailSubscribeDialog from "@/components/EmailSubscribeDialog";

interface HeroSectionProps {
  totalFiles?: number;
  totalClassrooms?: number;
  showEmailSubscribe?: boolean;
}

export default function HeroSection({
  totalFiles = 0,
  totalClassrooms = 0,
  showEmailSubscribe = true
}: HeroSectionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const updateCanvasSize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    updateCanvasSize();

    let time = 0;

    // ALCHEMY GEOMETRY
    const drawAlchemyCircle = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, time: number) => {
      // Outer Circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.2)'; // Amber
      ctx.lineWidth = 1;
      ctx.stroke();

      // Inner Rotating Triangle
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(time * 0.5);
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const angle = (i * 2 * Math.PI) / 3;
        const px = radius * Math.cos(angle);
        const py = radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)'; // Purple
      ctx.stroke();
      ctx.restore();

      // Counter-rotating Square
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-time * 0.3);
      const sqSize = radius * 0.7;
      ctx.strokeRect(-sqSize / 2, -sqSize / 2, sqSize, sqSize);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.15)';
      ctx.restore();
    };

    const animate = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas!.width, canvas!.height);
      time += 0.01;

      // Draw Main Central Seal
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // Layered Geometries
      drawAlchemyCircle(ctx, cx, cy, 180, time); // Large background
      drawAlchemyCircle(ctx, cx, cy, 120, -time * 1.5); // Medium reverse

      // Floating small runes/particles
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + time * 0.2;
        const r = 220 + Math.sin(time * 2 + i) * 10;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;

        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(251, 191, 36, 0.6)' : 'rgba(168, 85, 247, 0.6)';
        ctx.fill();
      }

      requestAnimationFrame(animate);
    };

    const animId = requestAnimationFrame(animate);

    const handleResize = () => updateCanvasSize();
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    // ENHANCED ALCHEMY CONTAINER
    <div className="relative text-center mb-6 sm:mb-8 fold:py-6 py-8 sm:py-12 fold:px-4 px-6 sm:px-10 rounded-2xl sm:rounded-3xl bg-white/60 dark:bg-gray-900/40 backdrop-blur-xl shadow-2xl overflow-hidden border border-purple-500/20 dark:border-purple-400/20 group">

      {/* Background Gradient Mesh - Subtle */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-100/10 via-purple-500/5 to-indigo-900/10 pointer-events-none" />

      {/* Hero Canvas - Alchemy Geometry */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none opacity-60"
      />

      {/* Decorative Corner Runes (CSS based) */}
      <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-amber-500/30 rounded-tl-lg" />
      <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-purple-500/30 rounded-tr-lg" />
      <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-purple-500/30 rounded-bl-lg" />
      <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-amber-500/30 rounded-br-lg" />

      <div className="relative z-10">
        {/* Logo with ALCHEMICAL SEAL HALO */}
        <div className="relative inline-block mb-6 scale-110">

          {/* Rotating Seals CSS - The 'Magic Circle' */}
          <div className="absolute inset-0 -m-12 animate-[spin_12s_linear_infinite]">
            <svg className="w-full h-full text-purple-500/20" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="10 5" />
            </svg>
          </div>
          <div className="absolute inset-0 -m-8 animate-[spin_8s_linear_infinite_reverse]">
            <svg className="w-full h-full text-amber-500/30" viewBox="0 0 100 100">
              <polygon points="50,5 95,95 5,95" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          </div>

          {/* Core Icon Container - The Philosopher's Stone */}
          <div className="relative p-5 rounded-full bg-gradient-to-br from-indigo-600 via-purple-700 to-amber-600 shadow-[0_0_50px_rgba(168,85,247,0.6)] border-2 border-amber-200/50 dark:border-amber-400/30 z-10">
            <Rocket className="w-10 h-10 xs:w-12 xs:h-12 sm:w-14 sm:h-14 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
          </div>

          {/* Mana Sparkles */}
          <div className="absolute -top-2 -right-2 w-4 h-4 bg-amber-400 rounded-full blur-[2px] animate-pulse" />
          <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-purple-400 rounded-full blur-[2px] animate-pulse delay-75" />
        </div>

        {/* Title: Metallic Gold & Deep Purple Gradient */}
        <h1 className="text-2xl xs:text-3xl sm:text-4xl lg:text-5xl font-black mb-3 text-transparent bg-clip-text bg-gradient-to-r from-amber-600 via-purple-700 to-amber-600 dark:from-amber-400 dark:via-purple-400 dark:to-amber-400 drop-shadow-sm tracking-tight pb-2">
          Anyagok Profiknak
        </h1>

        {/* Tagline */}
        <p className="text-xs xs:text-sm text-muted-foreground font-bold uppercase mb-6 tracking-[0.2em] opacity-80" data-testid="text-quote-inspiration">
          ALAPOK · TUDÁS · MESTERSÉG
        </p>

        {/* Stats - Tech styling */}
        {totalFiles > 0 && (
          <div className="flex flex-col fold:gap-3 xs:flex-row xs:items-center xs:justify-center xs:gap-5 sm:gap-8 text-xs xs:text-sm mb-6 sm:mb-8 font-mono">
            <div className="flex items-center justify-center gap-2 text-purple-700 dark:text-purple-300">
              <BookOpen className="w-4 h-4" />
              <span className="font-bold">{totalFiles} FILE</span>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 hidden xs:block" />
            <div className="flex items-center justify-center gap-2 text-purple-700 dark:text-purple-300">
              <Users className="w-4 h-4" />
              <span className="font-bold">{totalClassrooms} OSZTÁLY</span>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 hidden xs:block" />
            <div className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400">
              <Sparkles className="w-4 h-4" />
              <span className="font-bold">FREE ACCESS</span>
            </div>
          </div>
        )}

        {/* Email Subscribe Button */}
        {showEmailSubscribe && (
          <div className="flex justify-center relative z-20">
            <EmailSubscribeDialog />
          </div>
        )}
      </div>
    </div>
  );
}
