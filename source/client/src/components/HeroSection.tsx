import { memo, useEffect, useRef } from "react";
import { ChevronRight, Sparkles, BookOpen, Brain, Lightbulb, Atom } from "lucide-react";
import EmailSubscribeDialog from "@/components/EmailSubscribeDialog";
import { Button } from "@/components/ui/button";

interface HeroSectionProps {
  totalFiles?: number;
  totalClassrooms?: number;
  showEmailSubscribe?: boolean;
}

// Lebego kepletetek a hatterben - bovitett lista
const FLOATING_FORMULAS = [
  { formula: "E=mc²", x: 15, y: 20, delay: 0, size: "text-3xl", color: "text-purple-400/40" },
  { formula: "∑", x: 80, y: 15, delay: 1, size: "text-5xl", color: "text-pink-400/35" },
  { formula: "∫", x: 10, y: 70, delay: 2, size: "text-4xl", color: "text-orange-400/35" },
  { formula: "π", x: 85, y: 65, delay: 0.5, size: "text-4xl", color: "text-purple-400/40" },
  { formula: "∞", x: 50, y: 10, delay: 1.5, size: "text-3xl", color: "text-pink-400/35" },
  { formula: "√", x: 25, y: 85, delay: 2.5, size: "text-4xl", color: "text-yellow-400/35" },
  { formula: "Δ", x: 70, y: 80, delay: 3, size: "text-3xl", color: "text-orange-400/35" },
  { formula: "λ", x: 5, y: 45, delay: 0.8, size: "text-3xl", color: "text-purple-400/40" },
  { formula: "θ", x: 92, y: 40, delay: 1.2, size: "text-3xl", color: "text-pink-400/35" },
  { formula: "α", x: 40, y: 90, delay: 2.2, size: "text-2xl", color: "text-orange-400/35" },
  { formula: "β", x: 60, y: 5, delay: 0.3, size: "text-2xl", color: "text-yellow-400/30" },
  { formula: "γ", x: 95, y: 55, delay: 1.8, size: "text-2xl", color: "text-purple-400/35" },
  { formula: "ω", x: 30, y: 35, delay: 2.8, size: "text-2xl", color: "text-pink-400/30" },
  { formula: "∂", x: 75, y: 25, delay: 0.6, size: "text-3xl", color: "text-orange-400/30" },
  { formula: "∇", x: 20, y: 55, delay: 1.4, size: "text-3xl", color: "text-yellow-400/35" },
];

// Oktatas ikonok - bovitett lista kulonbozo szinekkel
const FLOATING_ICONS = [
  { Icon: BookOpen, x: 12, y: 30, delay: 0.3, size: 32, color: "text-purple-400/25" },
  { Icon: Brain, x: 88, y: 25, delay: 1.3, size: 36, color: "text-pink-400/25" },
  { Icon: Lightbulb, x: 20, y: 75, delay: 2.3, size: 30, color: "text-yellow-400/25" },
  { Icon: Atom, x: 75, y: 72, delay: 0.7, size: 34, color: "text-orange-400/25" },
  { Icon: Sparkles, x: 45, y: 5, delay: 1.7, size: 28, color: "text-purple-400/25" },
  { Icon: BookOpen, x: 58, y: 88, delay: 2.0, size: 26, color: "text-pink-400/20" },
  { Icon: Brain, x: 3, y: 60, delay: 0.9, size: 28, color: "text-orange-400/20" },
  { Icon: Lightbulb, x: 97, y: 75, delay: 2.6, size: 24, color: "text-purple-400/20" },
];

function HeroSection({
  totalFiles = 0,
  totalClassrooms = 0,
  showEmailSubscribe = true,
}: HeroSectionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Reszecske animacio canvas-on
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Canvas meret beallitasa
    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Reszecskek - molekulák és atomok
    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      color: string;
      alpha: number;
      pulse: number;
      pulseSpeed: number;
    }

    const particles: Particle[] = [];
    const particleCount = 70; // Több részecske
    const colors = [
      "rgba(139, 92, 246, ",  // lila #8B5CF6
      "rgba(236, 72, 153, ",  // pink #EC4899
      "rgba(249, 115, 22, ",  // narancs #F97316
      "rgba(234, 179, 8, ",   // sárga #EAB308
    ];

    // Reszecskek letrehozasa - lassabb mozgás
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3, // Lassabb
        vy: (Math.random() - 0.5) * 0.3, // Lassabb
        radius: Math.random() * 4 + 1.5, // Nagyobb
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: Math.random() * 0.6 + 0.3, // Erősebb
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.02 + Math.random() * 0.02,
      });
    }

    // Animacio ciklus - pulzáló effekttel
    let animationId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Reszecskek rajzolasa es mozgatasa
      particles.forEach((p, i) => {
        // Mozgatas
        p.x += p.vx;
        p.y += p.vy;

        // Pulzálás frissítése
        p.pulse += p.pulseSpeed;
        const pulseScale = 1 + Math.sin(p.pulse) * 0.3;

        // Hataron visszapattanas
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        // Glow effekt rajzolása
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * pulseScale * 3);
        gradient.addColorStop(0, p.color + (p.alpha * 0.8) + ")");
        gradient.addColorStop(0.5, p.color + (p.alpha * 0.3) + ")");
        gradient.addColorStop(1, p.color + "0)");
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * pulseScale * 3, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Belső mag rajzolása
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * pulseScale, 0, Math.PI * 2);
        ctx.fillStyle = p.color + p.alpha + ")";
        ctx.fill();

        // Vonalak a kozeli reszecskek kozott - molekula kötések
        particles.slice(i + 1).forEach((p2) => {
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            // Gradient vonalak a színek alapján
            const lineAlpha = 0.15 * (1 - dist / 120);
            ctx.strokeStyle = `rgba(139, 92, 246, ${lineAlpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationId);
    };
  }, []);

  const scrollToContent = () => {
    const content = document.getElementById("content-start");
    if (content) content.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="relative text-center mb-12 py-20 sm:py-28 px-4 sm:px-6 lg:px-8 rounded-[2.5rem] overflow-hidden">
      {/* Hatter gradient - vibráló lila → rózsaszín → narancssárga */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background: `
            linear-gradient(135deg,
              rgba(139, 92, 246, 0.25) 0%,
              rgba(236, 72, 153, 0.22) 35%,
              rgba(249, 115, 22, 0.18) 70%,
              rgba(234, 179, 8, 0.12) 100%
            ),
            radial-gradient(ellipse at 20% 30%, rgba(139, 92, 246, 0.35), transparent 50%),
            radial-gradient(ellipse at 80% 70%, rgba(236, 72, 153, 0.30), transparent 50%),
            radial-gradient(ellipse at 60% 20%, rgba(249, 115, 22, 0.20), transparent 40%),
            #0F172A
          `,
        }}
      />

      {/* Geometriai mintak - szimmetrikus vonalak es korok */}
      <div className="absolute inset-0 z-0 opacity-30">
        <svg width="100%" height="100%" className="absolute inset-0">
          <defs>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(139, 92, 246, 0.4)" strokeWidth="0.5" />
            </pattern>
            <pattern id="circles" width="120" height="120" patternUnits="userSpaceOnUse">
              <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(236, 72, 153, 0.25)" strokeWidth="0.5" />
              <circle cx="60" cy="60" r="30" fill="none" stroke="rgba(249, 115, 22, 0.25)" strokeWidth="0.5" />
              <circle cx="60" cy="60" r="10" fill="none" stroke="rgba(234, 179, 8, 0.25)" strokeWidth="0.5" />
            </pattern>
            <pattern id="hexagons" width="80" height="92" patternUnits="userSpaceOnUse">
              <polygon points="40,0 80,23 80,69 40,92 0,69 0,23" fill="none" stroke="rgba(139, 92, 246, 0.15)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          <rect width="100%" height="100%" fill="url(#circles)" />
          <rect width="100%" height="100%" fill="url(#hexagons)" />
        </svg>
      </div>

      {/* Reszecske canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 w-full h-full pointer-events-none"
      />

      {/* Lebego kepletek - kulonbozo szinekkel */}
      {FLOATING_FORMULAS.map((f, i) => (
        <div
          key={`formula-${i}`}
          className={`absolute ${f.size} font-black ${f.color} pointer-events-none select-none`}
          style={{
            left: `${f.x}%`,
            top: `${f.y}%`,
            animation: `float-symbol ${6 + (i % 4)}s ease-in-out infinite`,
            animationDelay: `${f.delay}s`,
            textShadow: '0 0 20px currentColor',
          }}
        >
          {f.formula}
        </div>
      ))}

      {/* Lebego ikonok - kulonbozo szinekkel */}
      {FLOATING_ICONS.map((item, i) => (
        <div
          key={`icon-${i}`}
          className={`absolute ${item.color} pointer-events-none`}
          style={{
            left: `${item.x}%`,
            top: `${item.y}%`,
            animation: `float-icon ${8 + (i % 4)}s ease-in-out infinite`,
            animationDelay: `${item.delay}s`,
            filter: 'drop-shadow(0 0 10px currentColor)',
          }}
        >
          <item.Icon size={item.size} />
        </div>
      ))}

      {/* Fo tartalom */}
      <div className="relative z-10 max-w-5xl mx-auto flex flex-col items-center">
        {/* Badge */}
        <div className="achievement-badge mb-6 animate-bounce-in">
          <Sparkles className="w-5 h-5" />
          <span>WEBSULI 2026</span>
        </div>

        {/* Cim - erős gradient kiemelssel */}
        <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black mb-8 tracking-tight leading-[1.1] fade-in-up">
          <span className="text-white">Fedezd fel a </span>
          <span
            className="bg-clip-text text-transparent animate-gradient-shift"
            style={{
              background: "linear-gradient(135deg, #8B5CF6 0%, #EC4899 50%, #F97316 100%)",
              backgroundSize: "200% 200%",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 30px rgba(139, 92, 246, 0.5))",
            }}
          >
            Tudás
          </span>
          <span className="text-white"> világát!</span>
        </h1>

        {/* Alcim - vibráló színekkel */}
        <p className="text-xl sm:text-2xl text-gray-300 mb-12 max-w-2xl font-medium leading-relaxed fade-in-up">
          Interaktív tananyagok{" "}
          <span className="text-neon-purple font-bold">általános</span> és{" "}
          <span className="text-neon-pink font-bold">középiskolásoknak</span>.
          <br className="hidden sm:block" />
          Tanulj játékosan, szerezz XP-t és legyél a legjobb!
        </p>

        {/* CTA gombok - erős pulzáló hatással */}
        <div className="flex flex-col sm:flex-row gap-5 w-full sm:w-auto items-center fade-in-up">
          <Button
            size="lg"
            className="pulse-cta w-full sm:w-auto text-xl h-16 px-10 rounded-2xl font-black text-white shadow-2xl transform hover:scale-105 transition-transform"
            style={{
              background: "linear-gradient(135deg, #8B5CF6 0%, #EC4899 50%, #F97316 100%)",
              boxShadow: "0 0 40px rgba(139, 92, 246, 0.5), 0 0 80px rgba(236, 72, 153, 0.3)",
            }}
            onClick={scrollToContent}
          >
            Kezdjük el! <ChevronRight className="w-6 h-6 ml-2" />
          </Button>

          {showEmailSubscribe && (
            <div className="w-full sm:w-auto">
              <EmailSubscribeDialog />
            </div>
          )}
        </div>

        {/* Statisztikák - glassmorphism stílus */}
        <div className="mt-16 pt-10 border-t border-white/15 flex flex-wrap justify-center gap-8 sm:gap-16 fade-in-up">
          <div className="text-center group">
            <div
              className="text-4xl sm:text-5xl font-black mb-2 bg-clip-text text-transparent"
              style={{
                background: "linear-gradient(135deg, #8B5CF6, #A78BFA)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 0 15px rgba(139, 92, 246, 0.5))",
              }}
            >
              {totalFiles}+
            </div>
            <div className="text-sm uppercase tracking-widest text-gray-400 font-bold flex items-center justify-center gap-2">
              <BookOpen className="w-4 h-4 text-purple-400" /> Tananyag
            </div>
          </div>
          <div className="text-center group">
            <div
              className="text-4xl sm:text-5xl font-black mb-2 bg-clip-text text-transparent"
              style={{
                background: "linear-gradient(135deg, #EC4899, #F472B6)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 0 15px rgba(236, 72, 153, 0.5))",
              }}
            >
              {totalClassrooms}
            </div>
            <div className="text-sm uppercase tracking-widest text-gray-400 font-bold flex items-center justify-center gap-2">
              <Brain className="w-4 h-4 text-pink-400" /> Osztályszint
            </div>
          </div>
          <div className="text-center group">
            <div
              className="text-4xl sm:text-5xl font-black mb-2 bg-clip-text text-transparent"
              style={{
                background: "linear-gradient(135deg, #F97316, #FB923C)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 0 15px rgba(249, 115, 22, 0.5))",
              }}
            >
              ∞
            </div>
            <div className="text-sm uppercase tracking-widest text-gray-400 font-bold flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 text-orange-400" /> Lehetőség
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(HeroSection);
