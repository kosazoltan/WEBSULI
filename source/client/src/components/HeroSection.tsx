import { memo, useEffect, useRef } from "react";
import { ChevronRight, Sparkles, BookOpen, Brain, Lightbulb, Atom } from "lucide-react";
import EmailSubscribeDialog from "@/components/EmailSubscribeDialog";
import { Button } from "@/components/ui/button";

interface HeroSectionProps {
  totalFiles?: number;
  totalClassrooms?: number;
  showEmailSubscribe?: boolean;
}

// Lebego kepletetek a hatterben
const FLOATING_FORMULAS = [
  { formula: "E=mc²", x: 15, y: 20, delay: 0, size: "text-2xl" },
  { formula: "∑", x: 80, y: 15, delay: 1, size: "text-4xl" },
  { formula: "∫", x: 10, y: 70, delay: 2, size: "text-3xl" },
  { formula: "π", x: 85, y: 65, delay: 0.5, size: "text-3xl" },
  { formula: "∞", x: 50, y: 10, delay: 1.5, size: "text-2xl" },
  { formula: "√", x: 25, y: 85, delay: 2.5, size: "text-3xl" },
  { formula: "Δ", x: 70, y: 80, delay: 3, size: "text-2xl" },
  { formula: "λ", x: 5, y: 45, delay: 0.8, size: "text-2xl" },
  { formula: "θ", x: 92, y: 40, delay: 1.2, size: "text-2xl" },
  { formula: "α", x: 40, y: 90, delay: 2.2, size: "text-xl" },
];

// Oktatas ikonok
const FLOATING_ICONS = [
  { Icon: BookOpen, x: 12, y: 30, delay: 0.3, size: 28 },
  { Icon: Brain, x: 88, y: 25, delay: 1.3, size: 32 },
  { Icon: Lightbulb, x: 20, y: 75, delay: 2.3, size: 26 },
  { Icon: Atom, x: 75, y: 72, delay: 0.7, size: 30 },
  { Icon: Sparkles, x: 45, y: 5, delay: 1.7, size: 24 },
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

    // Reszecskek
    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      color: string;
      alpha: number;
    }

    const particles: Particle[] = [];
    const particleCount = 50;
    const colors = [
      "rgba(139, 92, 246, ",  // lila
      "rgba(236, 72, 153, ",  // pink
      "rgba(251, 146, 60, ",  // narancs
      "rgba(234, 179, 8, ",   // sarga
    ];

    // Reszecskek letrehozasa
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 3 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: Math.random() * 0.5 + 0.2,
      });
    }

    // Animacio ciklus
    let animationId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Reszecskek rajzolasa es mozgatasa
      particles.forEach((p, i) => {
        // Mozgatas
        p.x += p.vx;
        p.y += p.vy;

        // Hataron visszapattanas
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        // Rajzolas
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color + p.alpha + ")";
        ctx.fill();

        // Vonalak a kozeli reszecskek kozott
        particles.slice(i + 1).forEach((p2) => {
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(139, 92, 246, ${0.1 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
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
    <div className="relative text-center mb-12 py-16 sm:py-20 px-4 sm:px-6 lg:px-8 rounded-[2.5rem] overflow-hidden">
      {/* Hatter gradient */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background: `
            linear-gradient(135deg,
              hsl(280 100% 15% / 0.8) 0%,
              hsl(340 100% 12% / 0.8) 50%,
              hsl(30 100% 15% / 0.6) 100%
            )
          `,
        }}
      />

      {/* Geometriai mintak - vonalak es korok */}
      <div className="absolute inset-0 z-0 opacity-20">
        <svg width="100%" height="100%" className="absolute inset-0">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(139, 92, 246, 0.3)" strokeWidth="1" />
            </pattern>
            <pattern id="circles" width="100" height="100" patternUnits="userSpaceOnUse">
              <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(236, 72, 153, 0.2)" strokeWidth="1" />
              <circle cx="50" cy="50" r="20" fill="none" stroke="rgba(251, 146, 60, 0.2)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          <rect width="100%" height="100%" fill="url(#circles)" />
        </svg>
      </div>

      {/* Reszecske canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 w-full h-full pointer-events-none"
      />

      {/* Lebego kepletek */}
      {FLOATING_FORMULAS.map((f, i) => (
        <div
          key={`formula-${i}`}
          className={`absolute ${f.size} font-bold text-purple-400/30 pointer-events-none select-none`}
          style={{
            left: `${f.x}%`,
            top: `${f.y}%`,
            animation: `float-symbol 8s ease-in-out infinite`,
            animationDelay: `${f.delay}s`,
          }}
        >
          {f.formula}
        </div>
      ))}

      {/* Lebego ikonok */}
      {FLOATING_ICONS.map((item, i) => (
        <div
          key={`icon-${i}`}
          className="absolute text-pink-400/20 pointer-events-none"
          style={{
            left: `${item.x}%`,
            top: `${item.y}%`,
            animation: `float-icon 10s ease-in-out infinite`,
            animationDelay: `${item.delay}s`,
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

        {/* Cim - gradient kiemelssel */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black mb-6 tracking-tight leading-[1.1] fade-in-up">
          <span className="text-foreground">Fedezd fel a </span>
          <span
            className="bg-clip-text text-transparent"
            style={{
              background: "linear-gradient(135deg, #8B5CF6, #EC4899, #F97316)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Tudas
          </span>
          <span className="text-foreground"> vilagat!</span>
        </h1>

        {/* Alcim */}
        <p className="text-lg sm:text-xl text-muted-foreground mb-10 max-w-2xl font-medium leading-relaxed fade-in-up">
          Interaktiv tananyagok <span className="text-neon-purple font-bold">altalanos</span> es{" "}
          <span className="text-neon-pink font-bold">kozepiskolasoknak</span>.
          Tanulj jatekosan, szerezz XP-t es legyel a legjobb!
        </p>

        {/* CTA gombok - pulzalo hatassal */}
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto items-center fade-in-up">
          <Button
            size="lg"
            className="pulse-cta w-full sm:w-auto text-lg h-14 px-8 rounded-2xl font-bold text-white"
            style={{
              background: "linear-gradient(135deg, #8B5CF6, #EC4899)",
            }}
            onClick={scrollToContent}
          >
            Kezdjuk el! <ChevronRight className="w-5 h-5 ml-2" />
          </Button>

          {showEmailSubscribe && (
            <div className="w-full sm:w-auto">
              <EmailSubscribeDialog />
            </div>
          )}
        </div>

        {/* Statisztikak */}
        <div className="mt-12 pt-8 border-t border-white/10 flex gap-8 sm:gap-16 fade-in-up">
          <div className="text-center">
            <div className="text-3xl sm:text-4xl font-black text-neon-purple mb-1">
              {totalFiles}
            </div>
            <div className="text-xs sm:text-sm uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
              <BookOpen className="w-4 h-4" /> Tananyag
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl sm:text-4xl font-black text-neon-cyan mb-1">
              {totalClassrooms}
            </div>
            <div className="text-xs sm:text-sm uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
              <Brain className="w-4 h-4" /> Osztalyszint
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl sm:text-4xl font-black text-neon-pink mb-1">
              ∞
            </div>
            <div className="text-xs sm:text-sm uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
              <Sparkles className="w-4 h-4" /> Lehetoseg
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(HeroSection);
