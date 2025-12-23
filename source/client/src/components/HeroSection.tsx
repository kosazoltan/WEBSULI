import { useEffect, useRef, useState, memo } from "react";
import { Rocket, BookOpen, Users, Sparkles, Star, Gift, Zap, Snowflake } from "lucide-react";
import EmailSubscribeDialog from "@/components/EmailSubscribeDialog";

interface HeroSectionProps {
  totalFiles?: number;
  totalClassrooms?: number;
  showEmailSubscribe?: boolean;
}

// Christmas Symbol Component - Static decorative element
const ChristmasSymbol = memo(({ 
  symbol, 
  x, 
  y, 
  delay = 0,
  color = 'red'
}: { 
  symbol: string; 
  x: string; 
  y: string; 
  delay?: number;
  color?: 'red' | 'green' | 'gold';
}) => {
  const colorClasses = {
    red: 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]',
    green: 'text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.8)]',
    gold: 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]'
  };

  return (
    <div 
      className={`absolute text-2xl sm:text-3xl opacity-70 ${colorClasses[color]}`}
      style={{ 
        left: x, 
        top: y,
        contain: 'layout style paint'
      }}
    >
      <div className="relative">
        <div className="relative animate-pulse" style={{ animationDelay: `${delay}s` }}>{symbol}</div>
      </div>
    </div>
  );
});
ChristmasSymbol.displayName = 'ChristmasSymbol';

// Snowflake Component
const SnowflakeIcon = ({ className = "" }: { className?: string }) => {
  return (
    <svg className={`animate-spin-slow ${className}`} viewBox="0 0 100 100" fill="none">
      <path 
        d="M50,10 L50,90 M10,50 L90,50 M25,25 L75,75 M75,25 L25,75 M30,15 L50,50 L70,15 M30,85 L50,50 L70,85 M15,30 L50,50 L15,70 M85,30 L50,50 L85,70" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
};

// Star Orbit Component (Christmas themed)
const StarOrbit = ({ size = 120 }: { size?: number }) => {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="absolute inset-0 animate-spin-slow">
        <div className="absolute top-1/2 left-0 w-3 h-3 bg-yellow-400 rounded-full -translate-y-1/2 shadow-[0_0_15px_rgba(250,204,21,0.8)]" />
      </div>
      <div className="absolute inset-0 animate-spin-slow" style={{ animationDirection: 'reverse', animationDuration: '13.33s' }}>
        <div className="absolute top-0 left-1/2 w-2.5 h-2.5 bg-red-500 rounded-full -translate-x-1/2 shadow-[0_0_12px_rgba(239,68,68,0.7)]" />
      </div>
      <div className="absolute inset-0 animate-spin-slow" style={{ animationDuration: '20s' }}>
        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_12px_rgba(34,197,94,0.7)]" />
      </div>
      <div className="absolute top-1/2 left-1/2 w-5 h-5 bg-yellow-400 rounded-full -translate-x-1/2 -translate-y-1/2 shadow-[0_0_20px_rgba(250,204,21,0.9)]" />
    </div>
  );
};

function HeroSection({
  totalFiles = 0,
  totalClassrooms = 0,
  showEmailSubscribe = true
}: HeroSectionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let rafId: number | null = null;
    let lastUpdate = 0;
    const throttleMs = 100; // Throttle to 10fps for mouse tracking
    
    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastUpdate < throttleMs) {
        if (rafId === null) {
          rafId = requestAnimationFrame(() => {
            setMousePos({ x: e.clientX, y: e.clientY });
            lastUpdate = Date.now();
            rafId = null;
          });
        }
        return;
      }
      setMousePos({ x: e.clientX, y: e.clientY });
      lastUpdate = now;
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

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

    // Christmas snowflakes and stars - Optimized for performance
    const snowflakes: Array<{x: number, y: number, vx: number, vy: number, size: number, rotation: number, rotationSpeed: number}> = [];
    
    // Initialize snowflakes - Reduced count for better performance
    for (let i = 0; i < 8; i++) {
      snowflakes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.2,
        vy: Math.random() * 0.3 + 0.1, // Falling down
        size: Math.random() * 3 + 2,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.02
      });
    }

    // Christmas stars
    const stars: Array<{x: number, y: number, size: number, twinkle: number, twinkleSpeed: number}> = [];
    for (let i = 0; i < 12; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 1,
        twinkle: Math.random() * Math.PI * 2,
        twinkleSpeed: Math.random() * 0.05 + 0.02
      });
    }

    const drawSnowflake = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1;
      
      // Draw 6-armed snowflake
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * size, Math.sin(angle) * size);
        ctx.stroke();
        
        // Side branches
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * size * 0.6, Math.sin(angle) * size * 0.6);
        ctx.lineTo(Math.cos(angle + Math.PI / 6) * size * 0.4, Math.sin(angle + Math.PI / 6) * size * 0.4);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * size * 0.6, Math.sin(angle) * size * 0.6);
        ctx.lineTo(Math.cos(angle - Math.PI / 6) * size * 0.4, Math.sin(angle - Math.PI / 6) * size * 0.4);
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawStar = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, twinkle: number) => {
      const opacity = 0.5 + Math.sin(twinkle) * 0.5;
      ctx.beginPath();
      // 5-pointed star
      for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const px = x + Math.cos(angle) * size;
        const py = y + Math.sin(angle) * size;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(250, 204, 21, ${opacity})`; // Gold
      ctx.fill();
      ctx.strokeStyle = `rgba(250, 204, 21, ${opacity * 0.8})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    const drawChristmasTree = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
      // Tree trunk
      ctx.fillStyle = 'rgba(139, 69, 19, 0.8)'; // Brown
      ctx.fillRect(x - size * 0.1, y + size * 0.6, size * 0.2, size * 0.3);
      
      // Tree layers (triangles)
      const layers = 3;
      for (let i = 0; i < layers; i++) {
        const layerSize = size * (1 - i * 0.3);
        const layerY = y - i * size * 0.2;
        ctx.beginPath();
        ctx.moveTo(x, layerY);
        ctx.lineTo(x - layerSize * 0.5, layerY + layerSize * 0.6);
        ctx.lineTo(x + layerSize * 0.5, layerY + layerSize * 0.6);
        ctx.closePath();
        ctx.fillStyle = `rgba(34, 197, 94, ${0.7 - i * 0.1})`; // Green
        ctx.fill();
        ctx.strokeStyle = `rgba(22, 163, 74, ${0.8 - i * 0.1})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      
      // Star on top
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const px = x + Math.cos(angle) * size * 0.15;
        const py = y - size * 0.5 + Math.sin(angle) * size * 0.15;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(250, 204, 21, 0.9)'; // Gold star
      ctx.fill();
    };

    let animId: number | null = null;
    let isVisible = !document.hidden;

    // Pause animation when tab is not visible (Page Visibility API)
    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
      if (isVisible && animId === null) {
        animId = requestAnimationFrame(animate);
      } else if (!isVisible && animId !== null) {
        cancelAnimationFrame(animId);
        animId = null;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const animate = () => {
      if (!ctx || !isVisible) {
        animId = null;
        return;
      }
      
      // Create Christmas gradient background (dark blue/navy with red-green hints)
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, 'rgba(15, 23, 42, 0.95)'); // slate-900
      gradient.addColorStop(0.3, 'rgba(30, 41, 59, 0.95)'); // slate-800
      gradient.addColorStop(0.6, 'rgba(15, 23, 42, 0.95)'); // slate-900
      gradient.addColorStop(1, 'rgba(20, 30, 50, 0.95)'); // dark blue
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      time += 0.001;

      // Update and draw snowflakes
      snowflakes.forEach((snowflake) => {
        snowflake.x += snowflake.vx;
        snowflake.y += snowflake.vy;
        snowflake.rotation += snowflake.rotationSpeed;

        // Reset snowflake when it goes off screen
        if (snowflake.y > canvas.height) {
          snowflake.y = -10;
          snowflake.x = Math.random() * canvas.width;
        }
        if (snowflake.x < 0) snowflake.x = canvas.width;
        if (snowflake.x > canvas.width) snowflake.x = 0;

        drawSnowflake(ctx, snowflake.x, snowflake.y, snowflake.size, snowflake.rotation);
      });

      // Update and draw twinkling stars
      stars.forEach((star) => {
        star.twinkle += star.twinkleSpeed;
        drawStar(ctx, star.x, star.y, star.size, star.twinkle);
      });

      // Draw central Christmas tree
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      drawChristmasTree(ctx, cx, cy, 80);
      
      // Draw orbiting Christmas ornaments (gifts/stars)
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + time * 0.03;
        const r = 120;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;

        // Draw ornament (colored circle)
        const ornamentColors = [
          'rgba(239, 68, 68, 0.9)', // red
          'rgba(34, 197, 94, 0.9)', // green
          'rgba(250, 204, 21, 0.9)', // gold
          'rgba(239, 68, 68, 0.9)' // red
        ];
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = ornamentColors[i % 4];
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Connection line to center (subtle)
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(px, py);
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.2)'; // Gold, very subtle
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      animId = requestAnimationFrame(animate);
    };

    if (isVisible) {
      animId = requestAnimationFrame(animate);
    }

    const handleResize = () => updateCanvasSize();
    window.addEventListener('resize', handleResize);

    return () => {
      if (animId !== null) {
        cancelAnimationFrame(animId);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    // CHRISTMAS CONTAINER - RED-GREEN-GOLD THEME
    <div className="relative text-center mb-3 sm:mb-4 fold:py-0.5 py-1 sm:py-1.5 fold:px-4 px-6 sm:px-10 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-red-950 via-green-950 to-red-950 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden border-2 border-red-500/30 group">

      {/* Christmas Texture Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(239,68,68,0.1),transparent_50%)] pointer-events-none" />
      
      {/* Snowflake Pattern */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)',
        backgroundSize: '50px 50px'
      }} />

      {/* Christmas Canvas Background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ willChange: 'contents' }}
      />

      {/* Christmas Floating Symbols */}
      <ChristmasSymbol symbol="⭐" x="5%" y="15%" delay={0} color="gold" />
      <ChristmasSymbol symbol="❄️" x="92%" y="20%" delay={0.5} color="green" />
      <ChristmasSymbol symbol="🎁" x="8%" y="75%" delay={1} color="red" />
      <ChristmasSymbol symbol="⭐" x="88%" y="80%" delay={1.5} color="gold" />
      <ChristmasSymbol symbol="🎄" x="85%" y="50%" delay={0.8} color="green" />
      <ChristmasSymbol symbol="❄️" x="20%" y="25%" delay={0.3} color="red" />

      {/* Snowflake Decorations */}
      <div className="absolute top-4 left-4 w-16 h-16 text-white opacity-20">
        <SnowflakeIcon />
      </div>
      <div className="absolute bottom-4 right-4 w-16 h-16 text-white opacity-20">
        <SnowflakeIcon />
      </div>

      {/* Corner Christmas Elements */}
      <div className="absolute top-4 left-4 w-12 h-12 border-t-2 border-l-2 border-red-500/40 rounded-tl-xl" />
      <div className="absolute top-4 right-4 w-12 h-12 border-t-2 border-r-2 border-green-500/40 rounded-tr-xl" />
      <div className="absolute bottom-4 left-4 w-12 h-12 border-b-2 border-l-2 border-green-500/40 rounded-bl-xl" />
      <div className="absolute bottom-4 right-4 w-12 h-12 border-b-2 border-r-2 border-red-500/40 rounded-br-xl" />

      <div className="relative z-10">
        {/* Christmas Icon with Star Orbit */}
        <div className="relative inline-flex items-center justify-center mb-2 sm:mb-3">
          
          {/* Background Glow - Christmas colors */}
          <div className="absolute inset-0 -m-16 bg-red-500/20 rounded-full blur-3xl animate-pulse" />
          
          {/* Star Orbits */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <StarOrbit size={140} />
          </div>

          {/* Central Icon Container - Christmas themed */}
          <div className="relative p-6 rounded-full bg-gradient-to-br from-red-600 via-green-600 to-red-600 shadow-[0_0_60px_rgba(239,68,68,0.4)] border-3 border-yellow-400/60 z-10 backdrop-blur-sm">
            <Star className="w-12 h-12 sm:w-16 sm:h-16 text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.8)] fill-yellow-400" />
          </div>

          {/* Floating Christmas Icons */}
          <div className="absolute -top-2 -right-2 p-2 bg-red-600/80 rounded-full border border-red-400/40 animate-bounce" style={{ animationDuration: '10s' }}>
            <Gift className="w-5 h-5 text-white" />
          </div>
          <div className="absolute -bottom-2 -left-2 p-2 bg-green-600/80 rounded-full border border-green-400/40 animate-bounce" style={{ animationDuration: '8.33s', animationDelay: '1.67s' }}>
            <Snowflake className="w-5 h-5 text-white" />
          </div>
          <div className="absolute top-0 -left-4 p-1.5 bg-yellow-500/80 rounded-full border border-yellow-400/40 animate-bounce" style={{ animationDuration: '9.33s', animationDelay: '3.33s' }}>
            <Sparkles className="w-4 h-4 text-white" />
          </div>
        </div>

        {/* Title - Christmas colors */}
        <h1 className="text-2xl xs:text-3xl sm:text-4xl lg:text-5xl font-black mb-1 sm:mb-2 text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-yellow-400 to-green-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.5)] tracking-tight pb-0.5">
          Anyagok Profiknak
        </h1>

        {/* Tagline - Christmas themed */}
        <div className="flex items-center justify-center gap-2 mb-2 sm:mb-3">
          <div className="h-px w-12 bg-gradient-to-r from-transparent via-red-400 to-transparent" />
          <p className="text-xs xs:text-sm text-yellow-300/90 font-bold uppercase tracking-[0.3em] opacity-90 font-mono" data-testid="text-quote-inspiration">
            KARÁCSONY · ÖRÖM · TANULÁS
          </p>
          <div className="h-px w-12 bg-gradient-to-r from-transparent via-green-400 to-transparent" />
        </div>

        {/* Enhanced Stats with Icons and Animations - Christmas themed */}
        {totalFiles > 0 && (
          <div className="flex flex-col fold:gap-2 xs:flex-row xs:items-center xs:justify-center xs:gap-4 sm:gap-6 text-xs xs:text-sm mb-2 sm:mb-3">
            <div className="group/stat flex items-center justify-center gap-3 px-4 py-2 bg-red-900/50 backdrop-blur-sm rounded-full border border-red-500/30 hover:border-red-400/60 transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]">
              <BookOpen className="w-5 h-5 text-red-300 group-hover/stat:animate-bounce" />
              <span className="font-bold text-white font-mono">{totalFiles}</span>
              <span className="text-red-200 font-semibold">ANYAG</span>
            </div>
            
            <div className="hidden xs:flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" style={{ animationDelay: '0.3s' }} />
              <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" style={{ animationDelay: '0.6s' }} />
            </div>
            
            <div className="group/stat flex items-center justify-center gap-3 px-4 py-2 bg-green-900/50 backdrop-blur-sm rounded-full border border-green-500/30 hover:border-green-400/60 transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(34,197,94,0.3)]">
              <Users className="w-5 h-5 text-green-300 group-hover/stat:animate-bounce" />
              <span className="font-bold text-white font-mono">{totalClassrooms}</span>
              <span className="text-green-200 font-semibold">OSZTÁLY</span>
            </div>
            
            <div className="hidden xs:flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" style={{ animationDelay: '0.3s' }} />
              <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" style={{ animationDelay: '0.6s' }} />
            </div>
            
            <div className="group/stat flex items-center justify-center gap-3 px-4 py-2 bg-yellow-900/50 backdrop-blur-sm rounded-full border border-yellow-500/30 hover:border-yellow-400/60 transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(250,204,21,0.3)]">
              <Sparkles className="w-5 h-5 text-yellow-300 group-hover/stat:animate-spin" />
              <span className="text-yellow-200 font-bold">INGYENES</span>
            </div>
          </div>
        )}

        {/* Feature Highlights - Christmas themed */}
        <div className="grid grid-cols-1 xs:grid-cols-3 gap-2 sm:gap-3 mb-2 sm:mb-3 max-w-3xl mx-auto">
          <div className="flex flex-col items-center gap-1 p-2 sm:p-3 bg-red-900/30 backdrop-blur-sm rounded-xl border border-red-500/20 hover:border-red-400/50 transition-all hover:scale-105 group/feature">
            <Rocket className="w-6 h-6 sm:w-7 sm:h-7 text-red-300 group-hover/feature:text-red-400 group-hover/feature:translate-y-[-4px] transition-transform drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
            <span className="text-xs sm:text-sm font-semibold text-white">Gyors Hozzáférés</span>
            <span className="text-[10px] xs:text-xs text-red-200 text-center">Azonnal elérhető</span>
          </div>
          
          <div className="flex flex-col items-center gap-1 p-2 sm:p-3 bg-green-900/30 backdrop-blur-sm rounded-xl border border-green-500/20 hover:border-green-400/50 transition-all hover:scale-105 group/feature">
            <Gift className="w-6 h-6 sm:w-7 sm:h-7 text-green-300 group-hover/feature:text-green-400 group-hover/feature:rotate-12 transition-transform duration-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
            <span className="text-xs sm:text-sm font-semibold text-white">Modern Tudás</span>
            <span className="text-[10px] xs:text-xs text-green-200 text-center">Naprakész tartalom</span>
          </div>
          
          <div className="flex flex-col items-center gap-1 p-2 sm:p-3 bg-yellow-900/30 backdrop-blur-sm rounded-xl border border-yellow-500/20 hover:border-yellow-400/50 transition-all hover:scale-105 group/feature">
            <Zap className="w-6 h-6 sm:w-7 sm:h-7 text-yellow-300 group-hover/feature:text-yellow-400 group-hover/feature:scale-125 transition-transform drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
            <span className="text-xs sm:text-sm font-semibold text-white">Hatékony Tanulás</span>
            <span className="text-[10px] xs:text-xs text-yellow-200 text-center">Optimalizált módszerek</span>
          </div>
        </div>

        {/* Email Subscribe Button with Christmas Styling */}
        {showEmailSubscribe && (
          <div className="flex justify-center relative z-20">
            <div className="relative group/btn">
              <div className="absolute inset-0 bg-gradient-to-r from-red-500 via-yellow-400 to-green-500 rounded-full blur-xl opacity-50 group-hover/btn:opacity-75 transition-opacity animate-pulse" />
              <EmailSubscribeDialog />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(HeroSection);
