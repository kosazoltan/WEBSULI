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
        <div className="absolute top-1/2 left-0 w-2 h-2 bg-gray-400 rounded-full -translate-y-1/2 shadow-[0_0_10px_rgba(156,163,175,0.6)]" />
      </div>
      <div className="absolute inset-0 animate-spin-slow" style={{ animationDirection: 'reverse', animationDuration: '4s' }}>
        <div className="absolute top-0 left-1/2 w-2 h-2 bg-gray-300 rounded-full -translate-x-1/2 shadow-[0_0_10px_rgba(209,213,219,0.6)]" />
      </div>
      <div className="absolute inset-0 animate-spin-slow" style={{ animationDuration: '6s' }}>
        <div className="absolute bottom-0 right-0 w-2 h-2 bg-gray-500 rounded-full shadow-[0_0_10px_rgba(107,114,128,0.6)]" />
      </div>
      <div className="absolute top-1/2 left-1/2 w-4 h-4 bg-gray-300 rounded-full -translate-x-1/2 -translate-y-1/2 shadow-[0_0_15px_rgba(209,213,219,0.8)]" />
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
      ctx.strokeStyle = 'rgba(156, 163, 175, 0.3)'; // Gray
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
        ctx.strokeStyle = 'rgba(209, 213, 219, 0.2)'; // Light gray
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();

      // Nucleus
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(229, 231, 235, 0.8)'; // Light gray
      ctx.fill();
      ctx.strokeStyle = 'rgba(156, 163, 175, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    const animate = () => {
      if (!ctx) return;
      
      // Create gray gradient background
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, 'rgba(55, 65, 81, 0.95)'); // gray-700
      gradient.addColorStop(0.5, 'rgba(75, 85, 99, 0.95)'); // gray-600
      gradient.addColorStop(1, 'rgba(107, 114, 128, 0.95)'); // gray-500
      
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
          ? 'rgba(156, 163, 175, 0.6)' // gray-400
          : i % 3 === 1 
          ? 'rgba(209, 213, 219, 0.6)' // gray-300  
          : 'rgba(229, 231, 235, 0.6)'; // gray-200
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
            ctx.strokeStyle = `rgba(156, 163, 175, ${0.15 * (1 - distance / 120)})`;
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
          ? 'rgba(156, 163, 175, 0.8)' 
          : 'rgba(209, 213, 219, 0.8)';
        ctx.fill();
        
        // Connection to center
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(px, py);
        ctx.strokeStyle = 'rgba(156, 163, 175, 0.1)';
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
    // GRAY CONTAINER
    <div className="relative text-center mb-6 sm:mb-8 fold:py-8 py-12 sm:py-16 fold:px-4 px-6 sm:px-10 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-gray-800 via-gray-700 to-gray-800 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden border-2 border-gray-500/30 group">

      {/* Gray Texture Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(156,163,175,0.1),transparent_50%)] pointer-events-none" />
      
      {/* Grid Pattern */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: 'linear-gradient(rgba(156, 163, 175, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(156, 163, 175, 0.3) 1px, transparent 1px)',
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
      <div className="absolute top-4 left-4 w-16 h-16 text-gray-400 opacity-20">
        <DNAHelix />
      </div>
      <div className="absolute bottom-4 right-4 w-16 h-16 text-gray-400 opacity-20">
        <DNAHelix />
      </div>

      {/* Corner Tech Elements */}
      <div className="absolute top-4 left-4 w-12 h-12 border-t-2 border-l-2 border-gray-400/40 rounded-tl-xl" />
      <div className="absolute top-4 right-4 w-12 h-12 border-t-2 border-r-2 border-gray-400/40 rounded-tr-xl" />
      <div className="absolute bottom-4 left-4 w-12 h-12 border-b-2 border-l-2 border-gray-400/40 rounded-bl-xl" />
      <div className="absolute bottom-4 right-4 w-12 h-12 border-b-2 border-r-2 border-gray-400/40 rounded-br-xl" />

      <div className="relative z-10">
        {/* Scientific Icon with Atom Orbit */}
        <div className="relative inline-flex items-center justify-center mb-8">
          
          {/* Background Glow */}
          <div className="absolute inset-0 -m-16 bg-gray-500/20 rounded-full blur-3xl animate-pulse" />
          
          {/* Atom Orbits */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <AtomOrbit size={140} />
          </div>

          {/* Central Icon Container */}
          <div className="relative p-6 rounded-full bg-gradient-to-br from-gray-600 via-gray-500 to-gray-600 shadow-[0_0_60px_rgba(156,163,175,0.4)] border-3 border-gray-400/60 z-10 backdrop-blur-sm">
            <Beaker className="w-12 h-12 sm:w-16 sm:h-16 text-gray-200 drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]" />
          </div>

          {/* Floating Science Icons */}
          <div className="absolute -top-2 -right-2 p-2 bg-gray-600/80 rounded-full border border-gray-400/40 animate-bounce" style={{ animationDuration: '3s' }}>
            <Atom className="w-5 h-5 text-gray-300" />
          </div>
          <div className="absolute -bottom-2 -left-2 p-2 bg-gray-600/80 rounded-full border border-gray-400/40 animate-bounce" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }}>
            <FlaskConical className="w-5 h-5 text-gray-300" />
          </div>
          <div className="absolute top-0 -left-4 p-1.5 bg-gray-600/80 rounded-full border border-gray-400/40 animate-bounce" style={{ animationDuration: '2.8s', animationDelay: '1s' }}>
            <Zap className="w-4 h-4 text-gray-300" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl xs:text-4xl sm:text-5xl lg:text-6xl font-black mb-4 text-transparent bg-clip-text bg-gradient-to-r from-gray-200 via-white to-gray-200 drop-shadow-[0_0_30px_rgba(255,255,255,0.3)] tracking-tight pb-2">
          Anyagok Profiknak
        </h1>

        {/* Tagline */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-px w-12 bg-gradient-to-r from-transparent via-gray-400 to-transparent" />
          <p className="text-xs xs:text-sm text-gray-300/90 font-bold uppercase tracking-[0.3em] opacity-90 font-mono" data-testid="text-quote-inspiration">
            TUDOMÁNY · INNOVÁCIÓ · TECH
          </p>
          <div className="h-px w-12 bg-gradient-to-r from-transparent via-gray-400 to-transparent" />
        </div>

        {/* Enhanced Stats with Icons and Animations */}
        {totalFiles > 0 && (
          <div className="flex flex-col fold:gap-4 xs:flex-row xs:items-center xs:justify-center xs:gap-6 sm:gap-10 text-sm xs:text-base mb-8 sm:mb-10">
            <div className="group/stat flex items-center justify-center gap-3 px-4 py-2 bg-gray-700/50 backdrop-blur-sm rounded-full border border-gray-500/30 hover:border-gray-400/60 transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(156,163,175,0.3)]">
              <BookOpen className="w-5 h-5 text-gray-300 group-hover/stat:animate-bounce" />
              <span className="font-bold text-gray-200 font-mono">{totalFiles}</span>
              <span className="text-gray-300 font-semibold">ANYAG</span>
            </div>
            
            <div className="hidden xs:flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-gray-500 animate-pulse" style={{ animationDelay: '0.3s' }} />
              <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '0.6s' }} />
            </div>
            
            <div className="group/stat flex items-center justify-center gap-3 px-4 py-2 bg-gray-700/50 backdrop-blur-sm rounded-full border border-gray-500/30 hover:border-gray-400/60 transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(156,163,175,0.3)]">
              <Users className="w-5 h-5 text-gray-300 group-hover/stat:animate-bounce" />
              <span className="font-bold text-gray-200 font-mono">{totalClassrooms}</span>
              <span className="text-gray-300 font-semibold">OSZTÁLY</span>
            </div>
            
            <div className="hidden xs:flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-gray-500 animate-pulse" style={{ animationDelay: '0.3s' }} />
              <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '0.6s' }} />
            </div>
            
            <div className="group/stat flex items-center justify-center gap-3 px-4 py-2 bg-gray-700/50 backdrop-blur-sm rounded-full border border-gray-500/30 hover:border-gray-400/60 transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(156,163,175,0.3)]">
              <Sparkles className="w-5 h-5 text-gray-300 group-hover/stat:animate-spin" />
              <span className="text-gray-300 font-bold">INGYENES</span>
            </div>
          </div>
        )}

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 xs:grid-cols-3 gap-4 mb-8 max-w-3xl mx-auto">
          <div className="flex flex-col items-center gap-2 p-4 bg-gray-700/30 backdrop-blur-sm rounded-xl border border-gray-500/20 hover:border-gray-400/50 transition-all hover:scale-105 group/feature">
            <Rocket className="w-8 h-8 text-gray-300 group-hover/feature:translate-y-[-4px] transition-transform" />
            <span className="text-sm font-semibold text-gray-200">Gyors Hozzáférés</span>
            <span className="text-xs text-gray-400 text-center">Azonnal elérhető anyagok</span>
          </div>
          
          <div className="flex flex-col items-center gap-2 p-4 bg-gray-700/30 backdrop-blur-sm rounded-xl border border-gray-500/20 hover:border-gray-400/50 transition-all hover:scale-105 group/feature">
            <Atom className="w-8 h-8 text-gray-300 group-hover/feature:rotate-180 transition-transform duration-500" />
            <span className="text-sm font-semibold text-gray-200">Modern Tudás</span>
            <span className="text-xs text-gray-400 text-center">Naprakész tartalom</span>
          </div>
          
          <div className="flex flex-col items-center gap-2 p-4 bg-gray-700/30 backdrop-blur-sm rounded-xl border border-gray-500/20 hover:border-gray-400/50 transition-all hover:scale-105 group/feature">
            <Zap className="w-8 h-8 text-gray-300 group-hover/feature:scale-125 transition-transform" />
            <span className="text-sm font-semibold text-gray-200">Hatékony Tanulás</span>
            <span className="text-xs text-gray-400 text-center">Optimalizált módszerek</span>
          </div>
        </div>

        {/* Email Subscribe Button with Enhanced Styling */}
        {showEmailSubscribe && (
          <div className="flex justify-center relative z-20">
            <div className="relative group/btn">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-500 via-gray-400 to-gray-500 rounded-full blur-xl opacity-50 group-hover/btn:opacity-75 transition-opacity animate-pulse" />
              <EmailSubscribeDialog />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
