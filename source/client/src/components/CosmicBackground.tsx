import { memo, useEffect, useRef } from "react";

interface CosmicBackgroundProps {
  className?: string;
}

function CosmicBackground({ className = "" }: CosmicBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const staticLayerRef = useRef<HTMLCanvasElement | null>(null);
  const scrollPauseTimerRef = useRef<number | null>(null);
  const stateRef = useRef({
    angle: 0,
    lastFrameAt: 0,
    pausedUntil: 0,
    centerX: 0,
    centerY: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const planets = [
      { name: "Nap", radius: 15, distance: 0, speed: 0, color: "#FBBF24", glow: "#FCD34D" },
      { name: "Merkúr", radius: 3, distance: 80, speed: 0.01, color: "#6B7280" },
      { name: "Vénusz", radius: 4, distance: 120, speed: 0.008, color: "#F97316" },
      { name: "Föld", radius: 5, distance: 160, speed: 0.006, color: "#3B82F6" },
      { name: "Mars", radius: 4, distance: 200, speed: 0.004, color: "#DC2626" },
      { name: "Jupiter", radius: 12, distance: 280, speed: 0.002, color: "#F59E0B" },
      { name: "Szaturnusz", radius: 10, distance: 360, speed: 0.0015, color: "#EAB308" },
    ] as const;

    const isSmallScreen = window.innerWidth < 1024;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shouldAnimate = !isSmallScreen && !prefersReducedMotion;

    const buildStaticLayer = () => {
      const layer = document.createElement("canvas");
      layer.width = canvas.width;
      layer.height = canvas.height;
      const layerCtx = layer.getContext("2d");
      if (!layerCtx) return;

      // Törlés - sötét világűr háttér
      layerCtx.fillStyle = "#0A0E27";
      layerCtx.fillRect(0, 0, layer.width, layer.height);

      // Csillagok háttér (csak egyszer épül fel)
      layerCtx.fillStyle = "rgba(255, 255, 255, 0.3)";
      for (let i = 0; i < 80; i++) {
        const x = (i * 137.508) % layer.width;
        const y = (i * 197.832) % layer.height;
        const size = (i % 3) + 1;
        layerCtx.beginPath();
        layerCtx.arc(x, y, size, 0, Math.PI * 2);
        layerCtx.fill();
      }

      // Pálya vonalak (csak egyszer épülnek fel)
      layerCtx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      for (const planet of planets) {
        if (planet.distance === 0) continue;
        layerCtx.beginPath();
        layerCtx.arc(stateRef.current.centerX, stateRef.current.centerY, planet.distance, 0, Math.PI * 2);
        layerCtx.stroke();
      }

      staticLayerRef.current = layer;
    };

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      stateRef.current.centerX = canvas.width / 2;
      stateRef.current.centerY = canvas.height / 2;
      buildStaticLayer();
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const drawFrame = () => {
      if (staticLayerRef.current) {
        ctx.drawImage(staticLayerRef.current, 0, 0);
      } else {
        ctx.fillStyle = "#0A0E27";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Naprendszer dinamikus része
      planets.forEach((planet, index) => {
        if (planet.distance === 0) {
          // Nap (középen)
          const gradient = ctx.createRadialGradient(
            stateRef.current.centerX,
            stateRef.current.centerY,
            0,
            stateRef.current.centerX,
            stateRef.current.centerY,
            planet.radius * 2
          );
          gradient.addColorStop(0, planet.glow || planet.color);
          gradient.addColorStop(1, "transparent");

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(stateRef.current.centerX, stateRef.current.centerY, planet.radius * 2, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = planet.color;
          ctx.beginPath();
          ctx.arc(stateRef.current.centerX, stateRef.current.centerY, planet.radius, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Bolygók körpályán
          const planetAngle = stateRef.current.angle * planet.speed + (index * Math.PI * 0.3);
          const x = stateRef.current.centerX + Math.cos(planetAngle) * planet.distance;
          const y = stateRef.current.centerY + Math.sin(planetAngle) * planet.distance;

          // Bolygó
          ctx.fillStyle = planet.color;
          ctx.beginPath();
          ctx.arc(x, y, planet.radius, 0, Math.PI * 2);
          ctx.fill();

          // Glow effekt bolygók körül
          const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, planet.radius * 2);
          glowGradient.addColorStop(0, `${planet.color}40`);
          glowGradient.addColorStop(1, "transparent");
          ctx.fillStyle = glowGradient;
          ctx.beginPath();
          ctx.arc(x, y, planet.radius * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    };

    // Scroll közben ideiglenesen megállítjuk az animációt, hogy simább legyen a görgetés.
    const pauseOnScroll = () => {
      stateRef.current.pausedUntil = performance.now() + 140;
      if (scrollPauseTimerRef.current) {
        window.clearTimeout(scrollPauseTimerRef.current);
      }
      scrollPauseTimerRef.current = window.setTimeout(() => {
        stateRef.current.pausedUntil = 0;
      }, 150);
    };
    window.addEventListener("scroll", pauseOnScroll, { passive: true });

    const targetFrameMs = 1000 / 30;
    const animate = (now: number) => {
      animationRef.current = requestAnimationFrame(animate);

      if (!shouldAnimate) return;
      if (document.visibilityState !== "visible") return;
      if (now < stateRef.current.pausedUntil) return;
      if (now - stateRef.current.lastFrameAt < targetFrameMs) return;

      const dt = Math.min(50, stateRef.current.lastFrameAt ? now - stateRef.current.lastFrameAt : targetFrameMs);
      stateRef.current.lastFrameAt = now;
      stateRef.current.angle += (dt / 16.6667) * 0.005;
      drawFrame();
    };

    // Alacsonyabb teljesítményű / mobil környezetben statikus háttér marad.
    if (shouldAnimate) {
      animationRef.current = requestAnimationFrame(animate);
    } else {
      drawFrame();
    }

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("scroll", pauseOnScroll);
      if (scrollPauseTimerRef.current) {
        window.clearTimeout(scrollPauseTimerRef.current);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 w-full h-full z-0 ${className}`}
      style={{ 
        backgroundColor: "#0A0E27",
        pointerEvents: "none"
      }}
    />
  );
}

export default memo(CosmicBackground);
