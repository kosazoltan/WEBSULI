import React, { useEffect, useRef } from 'react';

const ScientificHeroBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    opacity: number;
  }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas méret beállítása
    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Részecskék inicializálása (molekulák, atomok)
    const particleCount = 80;
    particlesRef.current = Array.from({ length: particleCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.5 + 0.2,
    }));

    // Animációs loop
    let animationFrameId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Részecskék rajzolása és mozgatása
      particlesRef.current.forEach((particle, i) => {
        particle.x += particle.vx;
        particle.y += particle.vy;

        // Szélek visszapattintása
        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;

        // Részecske rajzolása (atom/molekula)
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(139, 92, 246, ${particle.opacity})`;
        ctx.fill();

        // Kapcsolódási vonalak (ha közel vannak egymáshoz)
        particlesRef.current.slice(i + 1).forEach(other => {
          const dx = particle.x - other.x;
          const dy = particle.y - other.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 100) {
            ctx.beginPath();
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(other.x, other.y);
            ctx.strokeStyle = `rgba(236, 72, 153, ${0.2 * (1 - distance / 100)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Matematikai képletek és szimbólumok
  const formulas = [
    { symbol: 'E=mc²', x: '10%', y: '15%', delay: '0s' },
    { symbol: '∑', x: '85%', y: '25%', delay: '1s' },
    { symbol: '∫', x: '20%', y: '70%', delay: '2s' },
    { symbol: 'π', x: '75%', y: '65%', delay: '1.5s' },
    { symbol: '∇', x: '50%', y: '20%', delay: '0.5s' },
    { symbol: '∞', x: '15%', y: '45%', delay: '2.5s' },
  ];

  return (
    <>
      {/* Canvas részecske animáció */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 1 }}
      />

      {/* Gradient háttér - lila → rózsaszín → narancssárga + sötét alapháttér */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 0,
          background: `
            linear-gradient(135deg,
              rgba(139, 92, 246, 0.4) 0%,
              rgba(236, 72, 153, 0.3) 35%,
              rgba(249, 115, 22, 0.25) 70%,
              rgba(234, 179, 8, 0.2) 100%
            ),
            #0F172A
          `,
        }}
      />

      {/* Lebegő matematikai képletek */}
      {formulas.map((formula, i) => (
        <div
          key={i}
          className="absolute pointer-events-none text-4xl sm:text-5xl lg:text-6xl font-bold"
          style={{
            left: formula.x,
            top: formula.y,
            zIndex: 2,
            color: 'rgba(255, 255, 255, 0.15)',
            animation: `float-symbol 8s ease-in-out infinite`,
            animationDelay: formula.delay,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {formula.symbol}
        </div>
      ))}

      {/* Geometriai minták - szimmetrikus vonalak és körök */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-20"
        style={{ zIndex: 1 }}
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="rgba(139, 92, 246, 0.3)"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        
        {/* Koncentrikus körök */}
        <circle cx="20%" cy="30%" r="80" fill="none" stroke="rgba(236, 72, 153, 0.2)" strokeWidth="1" />
        <circle cx="20%" cy="30%" r="120" fill="none" stroke="rgba(236, 72, 153, 0.15)" strokeWidth="1" />
        <circle cx="80%" cy="70%" r="100" fill="none" stroke="rgba(249, 115, 22, 0.2)" strokeWidth="1" />
        <circle cx="80%" cy="70%" r="140" fill="none" stroke="rgba(249, 115, 22, 0.15)" strokeWidth="1" />
      </svg>

      {/* Oktatási ikonok - elszórva */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
        <div
          className="absolute text-3xl sm:text-4xl opacity-10"
          style={{
            left: '8%',
            top: '40%',
            animation: 'float-icon 6s ease-in-out infinite',
            animationDelay: '0s',
          }}
        >
          📚
        </div>
        <div
          className="absolute text-3xl sm:text-4xl opacity-10"
          style={{
            right: '12%',
            top: '50%',
            animation: 'float-icon 7s ease-in-out infinite',
            animationDelay: '1s',
          }}
        >
          ✏️
        </div>
        <div
          className="absolute text-3xl sm:text-4xl opacity-10"
          style={{
            left: '50%',
            top: '80%',
            animation: 'float-icon 8s ease-in-out infinite',
            animationDelay: '2s',
          }}
        >
          💡
        </div>
        <div
          className="absolute text-3xl sm:text-4xl opacity-10"
          style={{
            right: '25%',
            top: '15%',
            animation: 'float-icon 6.5s ease-in-out infinite',
            animationDelay: '1.5s',
          }}
        >
          🧠
        </div>
      </div>
    </>
  );
};

export default ScientificHeroBackground;
