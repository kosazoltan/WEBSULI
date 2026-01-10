import React from 'react';

/**
 * Sci-fi hero section háttér SVG komponens
 * Közvetlenül a DOM-ba renderelődik, NEM függ a CSS-től
 */
export const SciFiHeroBackground: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <svg
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
      viewBox="0 0 1200 600"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Űr ég gradient - sötét kék/lila */}
        <linearGradient id="space-sky" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(230, 70%, 15%)" />
          <stop offset="30%" stopColor="hsl(240, 60%, 20%)" />
          <stop offset="60%" stopColor="hsl(25, 90%, 45%)" />
          <stop offset="75%" stopColor="hsl(30, 100%, 55%)" />
          <stop offset="100%" stopColor="hsl(15, 80%, 30%)" />
        </linearGradient>
        
        {/* Nap glow */}
        <radialGradient id="sun-glow" cx="85%" cy="20%">
          <stop offset="0%" stopColor="hsl(30, 100%, 65%)" stopOpacity="0.8" />
          <stop offset="50%" stopColor="hsl(25, 90%, 50%)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="hsl(20, 85%, 45%)" stopOpacity="0" />
        </radialGradient>
        
        {/* Bolygó felszín gradient */}
        <linearGradient id="planet-surface" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(15, 80%, 30%)" />
          <stop offset="50%" stopColor="hsl(20, 75%, 25%)" />
          <stop offset="100%" stopColor="hsl(10, 70%, 20%)" />
        </linearGradient>
      </defs>
      
      {/* Űr ég háttér */}
      <rect width="100%" height="65%" fill="url(#space-sky)" />
      
      {/* Nap glow effect */}
      <ellipse
        cx="85%"
        cy="20%"
        rx="15%"
        ry="15%"
        fill="url(#sun-glow)"
        style={{ filter: 'blur(60px)' }}
      />
      
      {/* Bolygó felszín (hegyek) */}
      <path
        d="M 0,390 Q 100,370 200,390 T 400,390 T 600,390 T 800,390 T 1000,390 T 1200,390 L 1200,600 L 0,600 Z"
        fill="url(#planet-surface)"
      />
      
      {/* További hegyek a mélységért */}
      <path
        d="M 0,420 Q 150,400 300,420 T 600,420 T 900,420 T 1200,420 L 1200,600 L 0,600 Z"
        fill="hsl(15, 70%, 22%)"
        opacity="0.8"
      />
      
      <path
        d="M 0,450 Q 200,430 400,450 T 800,450 T 1200,450 L 1200,600 L 0,600 Z"
        fill="hsl(10, 65%, 18%)"
        opacity="0.6"
      />
      
      {/* Csillagok */}
      {Array.from({ length: 30 }).map((_, i) => {
        const x = (i * 37.5) % 1200;
        const y = (i * 23.7) % 390;
        const size = (i % 3) + 1;
        const opacity = 0.3 + (i % 3) * 0.2;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={size}
            fill="hsl(60, 100%, 90%)"
            opacity={opacity}
          />
        );
      })}
      
      {/* Border glow */}
      <rect
        x="1"
        y="1"
        width="calc(100% - 2)"
        height="calc(100% - 2)"
        fill="none"
        stroke="hsl(30, 100%, 60%)"
        strokeWidth="2"
        strokeOpacity="0.3"
        rx="40"
      />
    </svg>
  );
};
