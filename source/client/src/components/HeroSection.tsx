import { useEffect, useRef, useState, memo } from "react";
import { Rocket, BookOpen, Users, Sparkles, Atom, Beaker, Zap, FlaskConical } from "lucide-react";
import EmailSubscribeDialog from "@/components/EmailSubscribeDialog";

interface HeroSectionProps {
  totalFiles?: number;
  totalClassrooms?: number;
  showEmailSubscribe?: boolean;
}

// Cyberpunk Static Scientific Symbol Component - Static decorative element (no animation)
const CyberpunkSymbol = memo(({ 
  symbol, 
  x, 
  y, 
  delay = 0,
  color = 'cyan'
}: { 
  symbol: string; 
  x: string; 
  y: string; 
  delay?: number;
  color?: 'cyan' | 'magenta' | 'purple';
}) => {
  const colorClasses = {
    cyan: 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]',
    magenta: 'text-pink-500 drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]',
    purple: 'text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]'
  };

  return (
    <div 
      className={`absolute text-2xl sm:text-3xl opacity-60 ${colorClasses[color]}`}
      style={{ 
        left: x, 
        top: y,
        // No animation - static decorative element
        contain: 'layout style paint'
      }}
    >
      <div className="relative">
        <div className="relative">{symbol}</div>
      </div>
    </div>
  );
});
CyberpunkSymbol.displayName = 'CyberpunkSymbol';

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
      <div className="absolute inset-0 animate-spin-slow" style={{ animationDirection: 'reverse', animationDuration: '13.33s' }}> {/* 70% slower */}
        <div className="absolute top-0 left-1/2 w-2 h-2 bg-gray-300 rounded-full -translate-x-1/2 shadow-[0_0_10px_rgba(209,213,219,0.6)]" />
      </div>
      <div className="absolute inset-0 animate-spin-slow" style={{ animationDuration: '20s' }}> {/* 70% slower */}
        <div className="absolute bottom-0 right-0 w-2 h-2 bg-gray-500 rounded-full shadow-[0_0_10px_rgba(107,114,128,0.6)]" />
      </div>
      <div className="absolute top-1/2 left-1/2 w-4 h-4 bg-gray-300 rounded-full -translate-x-1/2 -translate-y-1/2 shadow-[0_0_15px_rgba(209,213,219,0.8)]" />
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

    // Scientific particles and connections - Further reduced for better performance
    const particles: Array<{x: number, y: number, vx: number, vy: number, size: number}> = [];
    
    // Initialize particles - Reduced from 15 to 5 for much better performance
    for (let i = 0; i < 5; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3, // Slower movement
        vy: (Math.random() - 0.5) * 0.3, // Slower movement
        size: Math.random() * 2 + 1
      });
    }

    const drawScientificPattern = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, time: number) => {
      // Hexagonal molecular structure - Removed shadowBlur for performance
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3 + time * 0.09; // 70% slower (0.3 * 0.3)
        const px = x + radius * Math.cos(angle);
        const py = y + radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      // Cyberpunk neon hexagon - Increased opacity to compensate for no shadow
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)'; // Cyan - Increased opacity
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inner rotating elements
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-time * 0.15); // 70% slower (0.5 * 0.3)
      
      // Draw electrons orbits with cyberpunk colors - Removed shadowBlur for performance
      const orbitColors = [
        'rgba(34, 211, 238, 0.5)', // cyan - Increased opacity
        'rgba(236, 72, 153, 0.5)', // magenta
        'rgba(192, 132, 252, 0.5)' // purple
      ];
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.6, radius * 0.3, (i * Math.PI) / 3, 0, Math.PI * 2);
        ctx.strokeStyle = orbitColors[i];
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();

      // Nucleus with cyberpunk glow - Removed shadowBlur for performance
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(34, 211, 238, 1)'; // Cyan - Full opacity
      ctx.fill();
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.9)'; // Purple border - Increased opacity
      ctx.lineWidth = 2;
      ctx.stroke();
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
      
      // Create gray gradient background
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, 'rgba(55, 65, 81, 0.95)'); // gray-700
      gradient.addColorStop(0.5, 'rgba(75, 85, 99, 0.95)'); // gray-600
      gradient.addColorStop(1, 'rgba(107, 114, 128, 0.95)'); // gray-500
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      time += 0.001; // Much slower animation for better performance

      // Update and draw particles
      particles.forEach((particle, i) => {
        particle.x += particle.vx;
        particle.y += particle.vy;

        // Bounce off edges
        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;

        // Draw particle with cyberpunk neon colors - Removed shadowBlur for performance
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        const colors = [
          'rgba(34, 211, 238, 0.9)', // cyan-400 - Increased opacity to compensate for no shadow
          'rgba(236, 72, 153, 0.9)', // pink-500
          'rgba(192, 132, 252, 0.9)' // purple-400
        ];
        ctx.fillStyle = colors[i % 3];
        ctx.fill();

        // Draw connections between nearby particles - Reduced connections for performance
        // Only check particles ahead to avoid duplicate checks, and reduce connection distance
        for (let j = i + 1; j < particles.length; j++) {
          const other = particles[j];
          const dx = particle.x - other.x;
          const dy = particle.y - other.y;
          const distanceSq = dx * dx + dy * dy; // Use squared distance to avoid sqrt

          // Reduced connection distance from 120 to 80 for fewer connections
          if (distanceSq < 6400) { // 80^2 = 6400
            const distance = Math.sqrt(distanceSq);
            ctx.beginPath();
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(other.x, other.y);
            // Cyberpunk neon connection lines - Reduced opacity for subtlety
            const colors = [
              'rgba(34, 211, 238, ', // cyan
              'rgba(236, 72, 153, ', // magenta
              'rgba(192, 132, 252, ' // purple
            ];
            const colorIndex = (i + j) % 3;
            const opacity = 0.2 * (1 - distance / 80); // Reduced opacity
            ctx.strokeStyle = colors[colorIndex] + opacity + ')';
            ctx.lineWidth = 0.5; // Thinner lines
            ctx.stroke();
          }
        }
      });

      // Draw Main Central Scientific Pattern - Simplified, less animated
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // Single static molecular structure (no animation)
      drawScientificPattern(ctx, cx, cy, 100, 0);
      
      // Reduced orbiting molecules - only 3 instead of 6
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2 + time * 0.05; // Much slower
        const r = 150; // Fixed radius, no pulsing
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;

        // Small molecular structure with cyberpunk colors - Static
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        const moleculeColors = [
          'rgba(34, 211, 238, 0.8)', // cyan - Reduced opacity
          'rgba(236, 72, 153, 0.8)' // magenta
        ];
        ctx.fillStyle = moleculeColors[i % 2];
        ctx.fill();
        
        // Connection to center - Static, less animated
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(px, py);
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.3)'; // Fixed opacity
        ctx.lineWidth = 1;
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
    // GRAY CONTAINER - HALF SIZE
    <div className="relative text-center mb-3 sm:mb-4 fold:py-0.5 py-1 sm:py-1.5 fold:px-4 px-6 sm:px-10 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-gray-800 via-gray-700 to-gray-800 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden border-2 border-gray-500/30 group">

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
        style={{ willChange: 'contents' }}
      />

      {/* Cyberpunk Floating Scientific Symbols - Reduced count, kept as static decorative elements */}
      {/* Only 6 symbols instead of 15 - positioned as static decorative elements */}
      <CyberpunkSymbol symbol="⚛" x="5%" y="15%" delay={0} color="cyan" />
      <CyberpunkSymbol symbol="∑" x="92%" y="20%" delay={0} color="magenta" />
      <CyberpunkSymbol symbol="∫" x="8%" y="75%" delay={0} color="purple" />
      <CyberpunkSymbol symbol="π" x="88%" y="80%" delay={0} color="cyan" />
      <CyberpunkSymbol symbol="∞" x="85%" y="50%" delay={0} color="purple" />
      <CyberpunkSymbol symbol="Δ" x="20%" y="25%" delay={0} color="purple" />

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
        {/* Scientific Icon with Atom Orbit - Reduced margin */}
        <div className="relative inline-flex items-center justify-center mb-2 sm:mb-3">
          
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
          <div className="absolute -top-2 -right-2 p-2 bg-gray-600/80 rounded-full border border-gray-400/40 animate-bounce" style={{ animationDuration: '10s' }}> {/* 70% slower */}
            <Atom className="w-5 h-5 text-gray-300" />
          </div>
          <div className="absolute -bottom-2 -left-2 p-2 bg-gray-600/80 rounded-full border border-gray-400/40 animate-bounce" style={{ animationDuration: '8.33s', animationDelay: '1.67s' }}> {/* 70% slower */}
            <FlaskConical className="w-5 h-5 text-gray-300" />
          </div>
          <div className="absolute top-0 -left-4 p-1.5 bg-gray-600/80 rounded-full border border-gray-400/40 animate-bounce" style={{ animationDuration: '9.33s', animationDelay: '3.33s' }}> {/* 70% slower */}
            <Zap className="w-4 h-4 text-gray-300" />
          </div>
        </div>

        {/* Title - Reduced size */}
        <h1 className="text-2xl xs:text-3xl sm:text-4xl lg:text-5xl font-black mb-1 sm:mb-2 text-transparent bg-clip-text bg-gradient-to-r from-gray-200 via-white to-gray-200 drop-shadow-[0_0_30px_rgba(255,255,255,0.3)] tracking-tight pb-0.5">
          Anyagok Profiknak
        </h1>

        {/* Tagline - Reduced margin */}
        <div className="flex items-center justify-center gap-2 mb-2 sm:mb-3">
          <div className="h-px w-12 bg-gradient-to-r from-transparent via-gray-400 to-transparent" />
          <p className="text-xs xs:text-sm text-gray-300/90 font-bold uppercase tracking-[0.3em] opacity-90 font-mono" data-testid="text-quote-inspiration">
            TUDOMÁNY · INNOVÁCIÓ · TECH
          </p>
          <div className="h-px w-12 bg-gradient-to-r from-transparent via-gray-400 to-transparent" />
        </div>

        {/* Enhanced Stats with Icons and Animations - Reduced margin */}
        {totalFiles > 0 && (
          <div className="flex flex-col fold:gap-2 xs:flex-row xs:items-center xs:justify-center xs:gap-4 sm:gap-6 text-xs xs:text-sm mb-2 sm:mb-3">
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

        {/* Feature Highlights - Reduced margin and size */}
        <div className="grid grid-cols-1 xs:grid-cols-3 gap-2 sm:gap-3 mb-2 sm:mb-3 max-w-3xl mx-auto">
          <div className="flex flex-col items-center gap-1 p-2 sm:p-3 bg-gray-700/30 backdrop-blur-sm rounded-xl border border-gray-500/20 hover:border-cyan-400/50 transition-all hover:scale-105 group/feature">
            <Rocket className="w-6 h-6 sm:w-7 sm:h-7 text-gray-300 group-hover/feature:text-cyan-400 group-hover/feature:translate-y-[-4px] transition-transform drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
            <span className="text-xs sm:text-sm font-semibold text-gray-200">Gyors Hozzáférés</span>
            <span className="text-[10px] xs:text-xs text-gray-400 text-center">Azonnal elérhető</span>
          </div>
          
          <div className="flex flex-col items-center gap-1 p-2 sm:p-3 bg-gray-700/30 backdrop-blur-sm rounded-xl border border-gray-500/20 hover:border-pink-500/50 transition-all hover:scale-105 group/feature">
            <Atom className="w-6 h-6 sm:w-7 sm:h-7 text-gray-300 group-hover/feature:text-pink-500 group-hover/feature:rotate-180 transition-transform duration-500 drop-shadow-[0_0_8px_rgba(236,72,153,0.6)]" />
            <span className="text-xs sm:text-sm font-semibold text-gray-200">Modern Tudás</span>
            <span className="text-[10px] xs:text-xs text-gray-400 text-center">Naprakész tartalom</span>
          </div>
          
          <div className="flex flex-col items-center gap-1 p-2 sm:p-3 bg-gray-700/30 backdrop-blur-sm rounded-xl border border-gray-500/20 hover:border-purple-400/50 transition-all hover:scale-105 group/feature">
            <Zap className="w-6 h-6 sm:w-7 sm:h-7 text-gray-300 group-hover/feature:text-purple-400 group-hover/feature:scale-125 transition-transform drop-shadow-[0_0_8px_rgba(192,132,252,0.6)]" />
            <span className="text-xs sm:text-sm font-semibold text-gray-200">Hatékony Tanulás</span>
            <span className="text-[10px] xs:text-xs text-gray-400 text-center">Optimalizált módszerek</span>
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

export default memo(HeroSection);
