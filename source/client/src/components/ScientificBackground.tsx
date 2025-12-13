import React, { useEffect, useState, useRef } from 'react';

// Tudományos és Alkímiai szimbólumok
const SCIENTIFIC_ELEMENTS = [
  // Alkímiai elemek és fémek
  { text: '🜂', category: 'alchemy_fire', size: 1.6 }, // Fire
  { text: '🜄', category: 'alchemy_water', size: 1.6 }, // Water
  { text: '🜁', category: 'alchemy_air', size: 1.6 }, // Air
  { text: '🜃', category: 'alchemy_earth', size: 1.6 }, // Earth
  { text: '☉', category: 'alchemy_gold', size: 1.8 }, // Gold (Sun)
  { text: '☽', category: 'alchemy_silver', size: 1.5 }, // Silver (Moon)
  { text: '☿', category: 'alchemy_mercury', size: 1.5 }, // Mercury
  { text: '🜍', category: 'alchemy', size: 1.4 }, // Sulphur
  { text: '🜔', category: 'alchemy', size: 1.4 }, // Salt
  { text: '⚗', category: 'alchemy', size: 1.5 }, // Alembic

  // Fizika képletek (Sci-Fi stílusban)
  { text: 'E=mc²', category: 'physics', size: 1 },
  { text: 'ΔS≥0', category: 'physics', size: 1 },
  { text: 'ℏ', category: 'physics', size: 1.2 },
  { text: 'Ψ', category: 'physics', size: 1.3 },

  // Matematika / Szakrális
  { text: 'φ', category: 'math', size: 1.2 }, // Golden ratio
  { text: '∞', category: 'math', size: 1.3 },
  { text: '∫', category: 'math', size: 1.2 },
  { text: '∑', category: 'math', size: 1.2 },
  { text: '∇', category: 'math', size: 1.2 },

  // Kémia
  { text: 'Au', category: 'chemistry', size: 1 },
  { text: 'Hg', category: 'chemistry', size: 1 },
  { text: 'Pb', category: 'chemistry', size: 1 },

  // Misztikus Geometry
  { text: '⎔', category: 'geometry', size: 1.8 },
  { text: '⌬', category: 'geometry', size: 1.6 },
  { text: '⏣', category: 'geometry', size: 1.6 },
  { text: '◈', category: 'geometry', size: 1.4 },
];

interface FloatingElement {
  id: number;
  text: string;
  category: string;
  x: number;
  y: number;
  size: number;
  baseOpacity: number;
  rotation: number;
  animationDuration: number;
  animationDelay: number;
  colorClass: string;
  glowColor: string;
  direction: 'up' | 'down' | 'left' | 'right' | 'diagonal-up' | 'diagonal-down';
}

interface CircleRing {
  radius: number;
  speed: number;
  width: number;
  dashArray: number[];
  color: string;
  angle: number;
  opacity: number;
}

export function ScientificBackground() {
  const [elements, setElements] = useState<FloatingElement[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  // Lebegő elemek inicializálása
  useEffect(() => {
    const newElements: FloatingElement[] = [];
    const count = 35; // Kevesebb, de hangsúlyosabb elem

    for (let i = 0; i < count; i++) {
      const el = SCIENTIFIC_ELEMENTS[Math.floor(Math.random() * SCIENTIFIC_ELEMENTS.length)];

      // Cyberpunk színpaletta: Cyan, Magenta, Purple
      let colorClass = '';
      let glowColor = '';

      // Véletlenszerűen választunk cyberpunk színek közül
      const colorChoice = Math.random();
      if (colorChoice < 0.33) {
        // Cyan Theme
        colorClass = 'text-cyan-400/80 dark:text-cyan-300/80';
        glowColor = 'rgba(34, 211, 238, 0.8)';
      } else if (colorChoice < 0.66) {
        // Magenta Theme
        colorClass = 'text-pink-500/80 dark:text-pink-400/80';
        glowColor = 'rgba(236, 72, 153, 0.8)';
      } else {
        // Purple Theme
        colorClass = 'text-purple-400/80 dark:text-purple-300/80';
        glowColor = 'rgba(192, 132, 252, 0.8)';
      }

      // Véletlenszerű irányok cyberpunk mozgáshoz
      const directions: FloatingElement['direction'][] = ['up', 'down', 'left', 'right', 'diagonal-up', 'diagonal-down'];

      newElements.push({
        id: i,
        text: el.text,
        category: el.category,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: (1.2 + Math.random() * 2) * el.size,
        baseOpacity: 0.3 + Math.random() * 0.4, // Fényesebb cyberpunk elemek
        rotation: Math.random() * 360,
        animationDuration: 20 + Math.random() * 40, // Gyorsabb, dinamikusabb mozgás
        animationDelay: Math.random() * -50,
        colorClass,
        glowColor,
        direction: directions[Math.floor(Math.random() * directions.length)],
      });
    }
    setElements(newElements);
  }, []);

  // Canvas animáció - Transmutation Circles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas méret
    const updateCanvasSize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };
    updateCanvasSize();

    // Inicializáljuk a köröket
    const rings: CircleRing[] = [];
    const baseRadius = Math.min(window.innerWidth, window.innerHeight) * 0.15;

    // Generáljunk koncentrikus köröket
    for (let i = 0; i < 8; i++) {
      const isGold = i % 2 === 0;
      rings.push({
        radius: baseRadius + (i * 35) + (Math.random() * 10),
        speed: (Math.random() * 0.004 + 0.001) * (i % 2 === 0 ? 1 : -1),
        width: Math.random() < 0.3 ? 2 : 1, // Néha vastagabb
        dashArray: Math.random() > 0.5 ? [Math.random() * 20 + 5, Math.random() * 30 + 10] : [], // Szaggatott vagy sima
        // Cyberpunk neon színek
        color: i % 3 === 0 
          ? 'rgba(34, 211, 238, 0.2)' // cyan
          : i % 3 === 1 
          ? 'rgba(236, 72, 153, 0.2)' // magenta
          : 'rgba(192, 132, 252, 0.2)', // purple
        angle: Math.random() * Math.PI * 2,
        opacity: 0.1 + Math.random() * 0.2
      });
    }

    // Hexagon a közepén - cyberpunk neon
    const hexagon = {
      radius: baseRadius * 0.8,
      angle: 0,
      speed: 0.003, // Gyorsabb rotáció
      color: 'rgba(34, 211, 238, 0.3)' // Cyan neon
    };

    const drawHexagon = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number, color: string) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const theta = angle + (i * Math.PI * 2) / 6;
        const px = x + r * Math.cos(theta);
        const py = y + r * Math.sin(theta);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = color;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Belső vonalak
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const theta1 = angle + (i * Math.PI * 2) / 6;
        const theta2 = angle + ((i + 3) * Math.PI * 2) / 6;
        ctx.moveTo(x + r * Math.cos(theta1), y + r * Math.sin(theta1));
        ctx.lineTo(x + r * Math.cos(theta2), y + r * Math.sin(theta2));
      }
      ctx.strokeStyle = color.replace('0.3', '0.15');
      ctx.lineWidth = 1;
      ctx.shadowBlur = 5;
      ctx.shadowColor = color;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    let time = 0;

    const animate = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const centerX = width / 2;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      // Enyhe pulsálás
      time += 0.01;
      const pulse = 1 + Math.sin(time) * 0.02;

      // Transzformáció középre
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.scale(pulse, pulse);

      // Hexagon rajzolása
      hexagon.angle += hexagon.speed;
      drawHexagon(ctx, 0, 0, hexagon.radius, hexagon.angle, hexagon.color);

      // Körök rajzolása
      rings.forEach(ring => {
        ring.angle += ring.speed;
        ctx.beginPath();
        ctx.arc(0, 0, ring.radius, ring.angle, ring.angle + Math.PI * 2);

        if (ring.dashArray.length > 0) {
          ctx.setLineDash(ring.dashArray);
        } else {
          ctx.setLineDash([]);
        }

        ctx.strokeStyle = ring.color;
        ctx.lineWidth = ring.width;
        ctx.shadowBlur = 8;
        ctx.shadowColor = ring.color;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Díszítő pontok a körökön
        if (Math.random() > 0.5) {
          const numDots = 3;
          for (let d = 0; d < numDots; d++) {
            const dotAngle = ring.angle + (d * (Math.PI * 2 / numDots));
            const dx = Math.cos(dotAngle) * ring.radius;
            const dy = Math.sin(dotAngle) * ring.radius;
            ctx.beginPath();
            ctx.arc(dx, dy, 2, 0, Math.PI * 2);
            ctx.fillStyle = ring.color.replace('0.2', '0.6');
            ctx.shadowBlur = 5;
            ctx.shadowColor = ring.color;
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      });

      ctx.restore();

      // Kapcsolódó vonalak (Constellations) effekt a háttérben
      // Csak néha, halványan

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => updateCanvasSize();
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Animáció CSS string az irány alapján
  const getAnimationName = (direction: FloatingElement['direction']) => {
    switch (direction) {
      case 'up': return 'floatUp';
      case 'down': return 'floatDown';
      case 'left': return 'floatLeft';
      case 'right': return 'floatRight';
      case 'diagonal-up': return 'floatDiagonalUp';
      case 'diagonal-down': return 'floatDiagonalDown';
      default: return 'floatUp';
    }
  };

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-[0]" aria-hidden="true">
      {/* Cyberpunk háttér gradient - Dark Gray with Neon accents */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-950/[0.3] via-gray-900/[0.2] to-background" />

      {/* Cyberpunk radial glows - multiple neon colors */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(34,211,238,0.1)_0%,transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(236,72,153,0.1)_0%,transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(192,132,252,0.08)_0%,transparent_60%)]" />

      {/* Canvas az Alkímia Körökhöz */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full opacity-100" // Canvas kezeli az opacity-t
      />

      {/* Lebegő szimbólumok */}
      {elements.map((el) => (
        <div
          key={el.id}
          className={`absolute font-mono select-none ${el.colorClass} transition-opacity duration-1000`}
          style={{
            left: `${el.x}%`,
            top: `${el.y}%`,
            fontSize: `${el.size}rem`,
            opacity: el.baseOpacity,
            animation: `${getAnimationName(el.direction)} ${el.animationDuration}s infinite ease-in-out`,
            animationDelay: `${el.animationDelay}s`,
            transform: `rotate(${el.rotation}deg)`,
            textShadow: `0 0 20px ${el.glowColor}, 0 0 40px ${el.glowColor}`,
            filter: 'blur(0.2px)',
            willChange: 'transform, opacity',
          }}
        >
          {el.text}
        </div>
      ))}

      {/* Cyberpunk Grid Overlay - Neon grid */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: 'linear-gradient(rgba(34, 211, 238, 0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 211, 238, 0.4) 1px, transparent 1px)',
          backgroundSize: '80px 80px'
        }}
      />

      {/* Animációk definíciója */}
      <style>{`
        @keyframes floatUp {
          0%, 100% { transform: translateY(0) translateX(0) rotate(0deg) scale(1); }
          25% { transform: translateY(-20px) translateX(10px) rotate(5deg) scale(1.1); }
          50% { transform: translateY(-40px) translateX(-5px) rotate(-5deg) scale(1.05); }
          75% { transform: translateY(-20px) translateX(5px) rotate(3deg) scale(1.08); }
        }
        @keyframes floatDown {
          0%, 100% { transform: translateY(0) translateX(0) rotate(0deg) scale(1); }
          25% { transform: translateY(20px) translateX(-10px) rotate(-5deg) scale(1.1); }
          50% { transform: translateY(40px) translateX(5px) rotate(5deg) scale(1.05); }
          75% { transform: translateY(20px) translateX(-5px) rotate(-3deg) scale(1.08); }
        }
        @keyframes floatLeft {
          0%, 100% { transform: translateX(0) translateY(0) rotate(0deg) scale(1); }
          25% { transform: translateX(-20px) translateY(10px) rotate(-5deg) scale(1.1); }
          50% { transform: translateX(-40px) translateY(-5px) rotate(5deg) scale(1.05); }
          75% { transform: translateX(-20px) translateY(5px) rotate(-3deg) scale(1.08); }
        }
        @keyframes floatRight {
          0%, 100% { transform: translateX(0) translateY(0) rotate(0deg) scale(1); }
          25% { transform: translateX(20px) translateY(-10px) rotate(5deg) scale(1.1); }
          50% { transform: translateX(40px) translateY(5px) rotate(-5deg) scale(1.05); }
          75% { transform: translateX(20px) translateY(-5px) rotate(3deg) scale(1.08); }
        }
        @keyframes floatDiagonalUp {
          0%, 100% { transform: translate(0, 0) rotate(0deg) scale(1); }
          25% { transform: translate(25px, -25px) rotate(10deg) scale(1.1); }
          50% { transform: translate(50px, -50px) rotate(-10deg) scale(1.05); }
          75% { transform: translate(25px, -25px) rotate(5deg) scale(1.08); }
        }
        @keyframes floatDiagonalDown {
          0%, 100% { transform: translate(0, 0) rotate(0deg) scale(1); }
          25% { transform: translate(-25px, 25px) rotate(-10deg) scale(1.1); }
          50% { transform: translate(-50px, 50px) rotate(10deg) scale(1.05); }
          75% { transform: translate(-25px, 25px) rotate(-5deg) scale(1.08); }
        }
      `}</style>
    </div>
  );
}

export default ScientificBackground;
