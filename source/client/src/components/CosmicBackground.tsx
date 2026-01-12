import { memo, useEffect, useRef } from "react";

interface CosmicBackgroundProps {
  className?: string;
}

function CosmicBackground({ className = "" }: CosmicBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Naprendszer elemek
    const planets = [
      { name: "Nap", radius: 15, distance: 0, speed: 0, color: "#FBBF24", glow: "#FCD34D" },
      { name: "Merkúr", radius: 3, distance: 80, speed: 0.01, color: "#6B7280" },
      { name: "Vénusz", radius: 4, distance: 120, speed: 0.008, color: "#F97316" },
      { name: "Föld", radius: 5, distance: 160, speed: 0.006, color: "#3B82F6" },
      { name: "Mars", radius: 4, distance: 200, speed: 0.004, color: "#DC2626" },
      { name: "Jupiter", radius: 12, distance: 280, speed: 0.002, color: "#F59E0B" },
      { name: "Szaturnusz", radius: 10, distance: 360, speed: 0.0015, color: "#EAB308" },
    ];

    let angle = 0;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const animate = () => {
      // Törlés - sötét világűr háttér
      ctx.fillStyle = "#0A0E27";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Csillagok háttér
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      for (let i = 0; i < 100; i++) {
        const x = (i * 137.508) % canvas.width;
        const y = (i * 197.832) % canvas.height;
        const size = (i % 3) + 1;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Naprendszer rajzolása
      planets.forEach((planet, index) => {
        if (planet.distance === 0) {
          // Nap (középen)
          const gradient = ctx.createRadialGradient(
            centerX,
            centerY,
            0,
            centerX,
            centerY,
            planet.radius * 2
          );
          gradient.addColorStop(0, planet.glow || planet.color);
          gradient.addColorStop(1, "transparent");

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(centerX, centerY, planet.radius * 2, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = planet.color;
          ctx.beginPath();
          ctx.arc(centerX, centerY, planet.radius, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Bolygók körpályán
          const planetAngle = angle * planet.speed + (index * Math.PI * 0.3);
          const x = centerX + Math.cos(planetAngle) * planet.distance;
          const y = centerY + Math.sin(planetAngle) * planet.distance;

          // Pálya vonal (nagyon halvány)
          ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
          ctx.beginPath();
          ctx.arc(centerX, centerY, planet.distance, 0, Math.PI * 2);
          ctx.stroke();

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

      angle += 0.005; // Lassú animáció
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 w-full h-full -z-10 ${className}`}
      style={{ backgroundColor: "#0A0E27" }}
    />
  );
}

export default memo(CosmicBackground);
