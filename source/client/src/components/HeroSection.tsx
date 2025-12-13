import { useEffect, useRef, useState } from "react";
import { Rocket, BookOpen, Users, Sparkles, Atom, Beaker, Zap, FlaskConical } from "lucide-react";
import EmailSubscribeDialog from "@/components/EmailSubscribeDialog";

interface HeroSectionProps {
  totalFiles?: number;
  totalClassrooms?: number;
  showEmailSubscribe?: boolean;
}

// Animated Scientific Symbol Component
const ScientificSymbol = ({ 
  symbol, 
  x, 
  y, 
  delay = 0 
}: { 
  symbol: string; 
  x: string; 
  y: string; 
  delay?: number;
}) => {
  return (
    <div 
      className="absolute text-2xl opacity-20 animate-float"
      style={{ 
        left: x, 
        top: y,
        animationDelay: `${delay}s`,
        animationDuration: `${3 + Math.random() * 2}s`
      }}
    >
      {symbol}
    </div>
  );
};

// DNA Helix Component
const DNAHelix = ({ className = "" }: { className?: string }) => {
  return (
    <svg className={`animate-spin-slow ${className}`} viewBox="0 0 100 100" fill="none">
      <path 
        d="M20,50 Q35,20 50,50 T80,50" 
        stroke="currentColor" 
        strokeWidth="2" 
        fill="none"
        opacity="0.3"
      />
      <path 
        d="M20,50 Q35,80 50,50 T80,50" 
        stroke="currentColor" 
        strokeWidth="2" 
        fill="none"
        opacity="0.3"
      />
      <circle cx="20" cy="50" r="3" fill="currentColor" opacity="0.5" />
      <circle cx="50" cy="50" r="3" fill="currentColor" opacity="0.5" />
      <circle cx="80" cy="50" r="3" fill="currentColor" opacity="0.5" />
    </svg>
  );
};

// Atom Orbit Component
const AtomOrbit = ({ size = 120 }: { size?: number }) => {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="absolute inset-0 animate-spin-slow">
        <div className="absolute top-1/2 left-0 w-2 h-2 bg-cyan-400 rounded-full -translate-y-1/2 shadow-[0_0_10px_rgba(34,211,238,0.6)]" />
      </div>
      <div className="absolute inset-0 animate-spin-slow" style={{ animationDirection: 'reverse', animationDuration: '4s' }}>
        <div className="absolute top-0 left-1/2 w-2 h-2 bg-emerald-400 rounded-full -translate-x-1/2 shadow-[0_0_10px_rgba(52,211,153,0.6)]" />
      </div>
      <div className="absolute inset-0 animate-spin-slow" style={{ animationDuration: '6s' }}>
        <div className="absolute bottom-0 right-0 w-2 h-2 bg-blue-400 rounded-full shadow-[0_0_10px_rgba(96,165,250,0.6)]" />
      </div>
      <div className="absolute top-1/2 left-1/2 w-4 h-4 bg-slate-300 rounded-full -translate-x-1/2 -translate-y-1/2 shadow-[0_0_15px_rgba(203,213,225,0.8)]" />
    </div>
  );
};

export default function HeroSection({
  totalFiles = 0,
  totalClassrooms = 0,
  showEmailSubscribe = true
}: HeroSectionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
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

    // Scientific particles and connections
    const particles: Array<{x: number, y: number, vx: number, vy: number, size: number}> = [];
    
    // Initialize particles
    for (let i = 0; i < 30; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2 + 1
      });
    }

    const drawScientificPattern = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, time: number) => {
      // Hexagonal molecular structure
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3 + time * 0.3;
        const px = x + radius * Math.cos(angle);
        const py = y + radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(100, 255, 218, 0.3)'; // Cyan
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inner rotating elements
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-time * 0.5);
      
      // Draw electrons orbits
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.6, radius * 0.3, (i * Math.PI) / 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(147, 197, 253, 0.2)'; // Light blue
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();

      // Nucleus
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(203, 213, 225, 0.8)'; // Light gray
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    const animate = () => {
      if (!ctx) return;
      
      // Create graphite gradient background
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, 'rgba(15, 23, 42, 0.95)'); // slate-900
      gradient.addColorStop(0.5, 'rgba(30, 41, 59, 0.95)'); // slate-800
      gradient.addColorStop(1, 'rgba(51, 65, 85, 0.95)'); // slate-700
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      time += 0.01;

      // Update and draw particles
      particles.forEach((particle, i) => {
        particle.x += particle.vx;
        particle.y += particle.vy;

        // Bounce off edges
        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;

        // Draw particle
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = i % 3 === 0 
          ? 'rgba(100, 255, 218, 0.6)' // cyan
          : i % 3 === 1 
          ? 'rgba(147, 197, 253, 0.6)' // blue  
          : 'rgba(203, 213, 225, 0.6)'; // gray
        ctx.fill();

        // Draw connections between nearby particles
        particles.forEach((other, j) => {
          if (i >= j) return;
          const dx = particle.x - other.x;
          const dy = particle.y - other.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 120) {
            ctx.beginPath();
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(other.x, other.y);
            ctx.strokeStyle = `rgba(100, 255, 218, ${0.15 * (1 - distance / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });

      // Draw Main Central Scientific Pattern
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // Multiple layered molecular structures
      drawScientificPattern(ctx, cx, cy, 100, time);
      drawScientificPattern(ctx, cx, cy, 60, -time * 1.3);
      
      // Orbiting molecules
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + time * 0.3;
        const r = 150 + Math.sin(time * 2 + i) * 15;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;

        // Small molecular structure
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 === 0 
          ? 'rgba(100, 255, 218, 0.8)' 
          : 'rgba(147, 197, 253, 0.8)';
        ctx.fill();
        
        // Connection to center
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(px, py);
        ctx.strokeStyle = 'rgba(100, 255, 218, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
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
    // SCIENTIFIC GRAPHITE CONTAINER
    <div className="relative text-center mb-6 sm:mb-8 fold:py-8 py-12 sm:py-16 fold:px-4 px-6 sm:px-10 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden border-2 border-cyan-500/30 group">

      {/* Graphite Texture Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(100,255,218,0.1),transparent_50%)] pointer-events-none" />
      
      {/* Grid Pattern */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: 'linear-gradient(rgba(100, 255, 218, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(100, 255, 218, 0.3) 1px, transparent 1px)',
        backgroundSize: '50px 50px'
      }} />

      {/* Scientific Canvas Background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Floating Scientific Symbols */}
      <ScientificSymbol symbol="⚛" x="5%" y="15%" delay={0} />
      <ScientificSymbol symbol="∑" x="92%" y="20%" delay={0.5} />
      <ScientificSymbol symbol="∫" x="8%" y="75%" delay={1} />
      <ScientificSymbol symbol="π" x="88%" y="80%" delay={1.5} />
      <ScientificSymbol symbol="√" x="15%" y="45%" delay={0.8} />
      <ScientificSymbol symbol="∞" x="85%" y="50%" delay={1.2} />
      <ScientificSymbol symbol="α" x="10%" y="90%" delay={0.3} />
      <ScientificSymbol symbol="β" x="90%" y="10%" delay={1.8} />
      <ScientificSymbol symbol="Δ" x="20%" y="25%" delay={2} />
      <ScientificSymbol symbol="Ω" x="80%" y="70%" delay={0.6} />

      {/* DNA Helix Decorations */}
      <div className="absolute top-4 left-4 w-16 h-16 text-cyan-400 opacity-20">
        <DNAHelix />
      </div>
      <div className="absolute bottom-4 right-4 w-16 h-16 text-blue-400 opacity-20">
        <DNAHelix />
      </div>

      {/* Corner Tech Elements */}
      <div className="absolute top-4 left-4 w-12 h-12 border-t-2 border-l-2 border-cyan-500/40 rounded-tl-xl" />
      <div className="absolute top-4 right-4 w-12 h-12 border-t-2 border-r-2 border-blue-500/40 rounded-tr-xl" />
      <div className="absolute bottom-4 left-4 w-12 h-12 border-b-2 border-l-2 border-emerald-500/40 rounded-bl-xl" />
      <div className="absolute bottom-4 right-4 w-12 h-12 border-b-2 border-r-2 border-cyan-500/40 rounded-br-xl" />

      <div className="relative z-10">
        {/* Scientific Icon with Atom Orbit */}
        <div className="relative inline-flex items-center justify-center mb-8">
          
          {/* Background Glow */}
          <div className="absolute inset-0 -m-16 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" />
          
          {/* Atom Orbits */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <AtomOrbit size={140} />
          </div>

          {/* Central Icon Container */}
          <div className="relative p-6 rounded-full bg-gradient-to-br from-slate-700 via-slate-600 to-slate-700 shadow-[0_0_60px_rgba(100,255,218,0.4)] border-3 border-cyan-400/60 z-10 backdrop-blur-sm">
            <Beaker className="w-12 h-12 sm:w-16 sm:h-16 text-cyan-300 drop-shadow-[0_0_15px_rgba(100,255,218,0.8)] animate-pulse" />
          </div>

          {/* Floating Science Icons */}
          <div className="absolute -top-2 -right-2 p-2 bg-slate-700/80 rounded-full border border-cyan-400/40 animate-bounce" style={{ animationDuration: '3s' }}>
            <Atom className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="absolute -bottom-2 -left-2 p-2 bg-slate-700/80 rounded-full border border-blue-400/40 animate-bounce" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }}>
            <FlaskConical className="w-5 h-5 text-blue-400" />
          </div>
          <div className="absolute top-0 -left-4 p-1.5 bg-slate-700/80 rounded-full border border-emerald-400/40 animate-bounce" style={{ animationDuration: '2.8s', animationDelay: '1s' }}>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
        </div>

        {/* Title with Holographic Effect */}
        <h1 className="text-3xl xs:text-4xl sm:text-5xl lg:text-6xl font-black mb-4 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-300 to-cyan-400 drop-shadow-[0_0_30px_rgba(100,255,218,0.5)] tracking-tight pb-2 animate-pulse">
          Anyagok Profiknak
        </h1>

        {/* Tagline with Tech Styling */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-px w-12 bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
          <p className="text-xs xs:text-sm text-cyan-300/90 font-bold uppercase tracking-[0.3em] opacity-90 font-mono" data-testid="text-quote-inspiration">
            TUDOMÁNY · INNOVÁCIÓ · JÖVŐ
          </p>
          <div className="h-px w-12 bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
        </div>

        {/* Enhanced Stats with Icons and Animations */}
        {totalFiles > 0 && (
          <div className="flex flex-col fold:gap-4 xs:flex-row xs:items-center xs:justify-center xs:gap-6 sm:gap-10 text-sm xs:text-base mb-8 sm:mb-10">
            <div className="group/stat flex items-center justify-center gap-3 px-4 py-2 bg-slate-800/50 backdrop-blur-sm rounded-full border border-cyan-500/30 hover:border-cyan-400/60 transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(100,255,218,0.3)]">
              <BookOpen className="w-5 h-5 text-cyan-400 group-hover/stat:animate-bounce" />
              <span className="font-bold text-slate-200 font-mono">{totalFiles}</span>
              <span className="text-cyan-300 font-semibold">ANYAG</span>
            </div>
            
            <div className="hidden xs:flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" style={{ animationDelay: '0.3s' }} />
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" style={{ animationDelay: '0.6s' }} />
            </div>
            
            <div className="group/stat flex items-center justify-center gap-3 px-4 py-2 bg-slate-800/50 backdrop-blur-sm rounded-full border border-blue-500/30 hover:border-blue-400/60 transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(147,197,253,0.3)]">
              <Users className="w-5 h-5 text-blue-400 group-hover/stat:animate-bounce" />
              <span className="font-bold text-slate-200 font-mono">{totalClassrooms}</span>
              <span className="text-blue-300 font-semibold">OSZTÁLY</span>
            </div>
            
            <div className="hidden xs:flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" style={{ animationDelay: '0.3s' }} />
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" style={{ animationDelay: '0.6s' }} />
            </div>
            
            <div className="group/stat flex items-center justify-center gap-3 px-4 py-2 bg-slate-800/50 backdrop-blur-sm rounded-full border border-emerald-500/30 hover:border-emerald-400/60 transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(52,211,153,0.3)]">
              <Sparkles className="w-5 h-5 text-emerald-400 group-hover/stat:animate-spin" />
              <span className="text-emerald-300 font-bold">INGYENES</span>
            </div>
          </div>
        )}

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 xs:grid-cols-3 gap-4 mb-8 max-w-3xl mx-auto">
          <div className="flex flex-col items-center gap-2 p-4 bg-slate-800/30 backdrop-blur-sm rounded-xl border border-cyan-500/20 hover:border-cyan-400/50 transition-all hover:scale-105 group/feature">
            <Rocket className="w-8 h-8 text-cyan-400 group-hover/feature:translate-y-[-4px] transition-transform" />
            <span className="text-sm font-semibold text-slate-200">Gyors Hozzáférés</span>
            <span className="text-xs text-slate-400 text-center">Azonnal elérhető anyagok</span>
          </div>
          
          <div className="flex flex-col items-center gap-2 p-4 bg-slate-800/30 backdrop-blur-sm rounded-xl border border-blue-500/20 hover:border-blue-400/50 transition-all hover:scale-105 group/feature">
            <Atom className="w-8 h-8 text-blue-400 group-hover/feature:rotate-180 transition-transform duration-500" />
            <span className="text-sm font-semibold text-slate-200">Modern Tudás</span>
            <span className="text-xs text-slate-400 text-center">Naprakész tartalom</span>
          </div>
          
          <div className="flex flex-col items-center gap-2 p-4 bg-slate-800/30 backdrop-blur-sm rounded-xl border border-emerald-500/20 hover:border-emerald-400/50 transition-all hover:scale-105 group/feature">
            <Zap className="w-8 h-8 text-emerald-400 group-hover/feature:scale-125 transition-transform" />
            <span className="text-sm font-semibold text-slate-200">Hatékony Tanulás</span>
            <span className="text-xs text-slate-400 text-center">Optimalizált módszerek</span>
          </div>
        </div>

        {/* Email Subscribe Button with Enhanced Styling */}
        {showEmailSubscribe && (
          <div className="flex justify-center relative z-20">
            <div className="relative group/btn">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-500 rounded-full blur-xl opacity-50 group-hover/btn:opacity-75 transition-opacity animate-pulse" />
              <EmailSubscribeDialog />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
