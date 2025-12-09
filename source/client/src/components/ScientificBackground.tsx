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

      // Színpaletta: Arany és Mély Lila dominancia
      let colorClass = '';
      let glowColor = '';

      // Véletlenszerűen választunk a két fő téma közül, kategóriától függetlenül is keverhetjük kicsit
      const isGold = Math.random() > 0.4 || el.category.includes('gold') || el.category === 'math';

      if (isGold) {
        // Gold / Amber Theme
        colorClass = 'text-amber-400/80 dark:text-amber-300/80';
        glowColor = 'rgba(251, 191, 36, 0.6)';
      } else {
        // Deep Purple / Magic Theme
        colorClass = 'text-purple-500/80 dark:text-purple-400/80';
        glowColor = 'rgba(168, 85, 247, 0.6)';
      }

      // Különleges elemek kiemelése
      if (el.category === 'chemistry') {
        colorClass = 'text-emerald-500/70 dark:text-emerald-400/70';
        glowColor = 'rgba(16, 185, 129, 0.4)';
      }

      const directions: FloatingElement['direction'][] = ['up', 'down', 'diagonal-up', 'diagonal-down'];

      newElements.push({
        id: i,
        text: el.text,
        category: el.category,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: (1.2 + Math.random() * 2) * el.size,
        baseOpacity: 0.1 + Math.random() * 0.2,
        rotation: Math.random() * 360,
        animationDuration: 40 + Math.random() * 60,
        animationDelay: Math.random() * -100,
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
        color: isGold ? 'rgba(251, 191, 36, 0.15)' : 'rgba(168, 85, 247, 0.15)',
        angle: Math.random() * Math.PI * 2,
        opacity: 0.1 + Math.random() * 0.2
      });
    }

    // Hexagon a közepén
    const hexagon = {
      radius: baseRadius * 0.8,
      angle: 0,
      speed: 0.002,
      color: 'rgba(251, 191, 36, 0.2)'
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
      ctx.stroke();

      // Belső vonalak
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const theta1 = angle + (i * Math.PI * 2) / 6;
        const theta2 = angle + ((i + 3) * Math.PI * 2) / 6;
        ctx.moveTo(x + r * Math.cos(theta1), y + r * Math.sin(theta1));
        ctx.lineTo(x + r * Math.cos(theta2), y + r * Math.sin(theta2));
      }
      ctx.strokeStyle = color.replace('0.2', '0.1');
      ctx.lineWidth = 1;
      ctx.stroke();
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
        ctx.stroke();

        // Díszítő pontok a körökön
        if (Math.random() > 0.5) {
          const numDots = 3;
          for (let d = 0; d < numDots; d++) {
            const dotAngle = ring.angle + (d * (Math.PI * 2 / numDots));
            const dx = Math.cos(dotAngle) * ring.radius;
            const dy = Math.sin(dotAngle) * ring.radius;
            ctx.beginPath();
            ctx.arc(dx, dy, 2, 0, Math.PI * 2);
            ctx.fillStyle = ring.color.replace('0.15', '0.4');
            ctx.fill();
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
      {/* Mély, misztikus háttér gradient - Dark Purple to Black */}
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/[0.15] via-purple-950/[0.1] to-background" />

      {/* Radial glow a közepén (Arany/Lila keverék) */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.08)_0%,transparent_60%)]" />

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
            textShadow: `0 0 15px ${el.glowColor}`,
            filter: 'blur(0.3px)',
            willChange: 'transform, opacity',
          }}
        >
          {el.text}
        </div>
      ))}

      {/* Grid Overlay - Tech hatás */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(251, 191, 36, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(251, 191, 36, 0.3) 1px, transparent 1px)',
          backgroundSize: '100px 100px'
        }}
      />

      {/* Animációk definíciója */}
      <style>{`
        @keyframes floatUp {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-30px) rotate(5deg); }
        }
        @keyframes floatDown {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(30px) rotate(-5deg); }
        }
        @keyframes floatDiagonalUp {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(30px, -30px) rotate(10deg); }
        }
        @keyframes floatDiagonalDown {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(-30px, 30px) rotate(-10deg); }
        }
      `}</style>
    </div>
  );
}

export default ScientificBackground;
