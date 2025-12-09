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

    // Molecule / Particle class
    class Particle {
      x: number;
      y: number;
      radius: number;
      vx: number;
      vy: number;
      color: string;

      constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
        this.radius = Math.random() * 4 + 2;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        // Randomly Gold or Purple
        this.color = Math.random() > 0.5 ? 'rgba(255, 215, 0, 0.6)' : 'rgba(128, 0, 128, 0.6)';
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > canvas!.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas!.height) this.vy *= -1;
      }

      draw() {
        if (!ctx) return;

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
      }
    }

    // Create particles
    const particles: Particle[] = [];
    for (let i = 0; i < 20; i++) {
      particles.push(new Particle(
        Math.random() * canvas.width,
        Math.random() * canvas.height
      ));
    }

    // Draw connections (Chemical Bonds)
    const drawBonds = () => {
      if (!ctx) return;

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);

            const opacity = 1 - distance / 120;
            // Gradient line from particle i color to particle j color? Simplified to goldish
            ctx.strokeStyle = `rgba(200, 180, 50, ${opacity * 0.4})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
    };

    // Animation loop
    let animationFrameId: number;
    const animate = () => {
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas!.width, canvas!.height);

      drawBonds();
      particles.forEach(p => {
        p.update();
        p.draw();
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => updateCanvasSize();
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    // GLASSMORPHISM CONTAINER (Semi-transparent)
    <div className="relative text-center mb-6 sm:mb-8 fold:py-6 py-8 sm:py-10 fold:px-4 px-6 sm:px-10 rounded-2xl sm:rounded-3xl bg-background/30 backdrop-blur-md shadow-xl sm:shadow-2xl overflow-hidden border border-primary/20">

      {/* Canvas background - Local Molecule animation */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none opacity-40"
        style={{ width: '100%', height: '100%' }}
      />

      <div className="relative z-10">
        {/* Logo with REDUCED pulse animation (controlled by index.css) */}
        <div className="inline-block p-3 rounded-full bg-gradient-to-br from-primary to-accent mb-4 shadow-2xl animate-pulse-glow border-4 border-white/20">
          <Rocket className="w-8 h-8 xs:w-9 xs:h-9 sm:w-10 sm:h-10 text-white drop-shadow-lg" />
        </div>

        {/* Title: Gold & Purple Gradient */}
        <h1 className="text-xl xs:text-2xl sm:text-3xl lg:text-4xl font-extrabold mb-2 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent drop-shadow-sm">
          Anyagok Profiknak
        </h1>

        {/* Tagline */}
        <p className="text-xs xs:text-sm text-muted-foreground font-semibold uppercase mb-4 sm:mb-6 tracking-wider opacity-90" data-testid="text-quote-inspiration">
          „Ha arra számítasz, hogy egyszerű dolgod lesz. Tudd, igen nagyot fogsz csalódni!"
        </p>

        {/* Stats */}
        {totalFiles > 0 && (
          <div className="flex flex-col fold:gap-2 xs:flex-row xs:items-center xs:justify-center xs:gap-4 sm:gap-6 text-xs xs:text-sm mb-4 sm:mb-5">
            <div className="flex items-center justify-center gap-1.5 xs:gap-2 bg-primary/10 px-3 py-2 rounded-full border border-primary/20">
              <BookOpen className="w-3.5 h-3.5 xs:w-4 xs:h-4 text-primary" />
              <span className="font-semibold text-foreground">{totalFiles} anyag</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 xs:gap-2 bg-primary/10 px-3 py-2 rounded-full border border-primary/20">
              <Users className="w-3.5 h-3.5 xs:w-4 xs:h-4 text-primary" />
              <span className="font-semibold text-foreground">{totalClassrooms} osztály</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 xs:gap-2 bg-accent/10 px-3 py-2 rounded-full border border-accent/20">
              <Sparkles className="w-3.5 h-3.5 xs:w-4 xs:h-4 text-accent" />
              <span className="font-semibold text-foreground">Ingyenes</span>
            </div>
          </div>
        )}

        {/* Email Subscribe Button */}
        {showEmailSubscribe && (
          <div className="flex justify-center">
            <EmailSubscribeDialog />
          </div>
        )}
      </div>
    </div>
  );
}
