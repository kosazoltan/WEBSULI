import React from 'react';

/**
 * Geodéziai kupola háttér SVG komponens
 * Közvetlenül a DOM-ba renderelődik, NEM függ a CSS-től
 */
export const GeodesicCardBackground: React.FC<{ className?: string }> = ({ className = '' }) => {
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
      viewBox="0 0 400 300"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Háttér gradient - sötét twilight */}
      <defs>
        <linearGradient id="geodesic-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(230, 60%, 12%)" />
          <stop offset="50%" stopColor="hsl(240, 50%, 15%)" />
          <stop offset="100%" stopColor="hsl(235, 55%, 14%)" />
        </linearGradient>
        
        {/* Narancs-sárga belső világítás */}
        <radialGradient id="geodesic-glow" cx="50%" cy="50%">
          <stop offset="0%" stopColor="hsl(30, 100%, 60%)" stopOpacity="0.25" />
          <stop offset="70%" stopColor="hsl(35, 90%, 55%)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="hsl(30, 100%, 50%)" stopOpacity="0" />
        </radialGradient>
        
        {/* Háromszög pattern - geodéziai kupola */}
        <pattern id="triangle-pattern" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
          <polygon
            points="0,0 40,0 20,34.64"
            fill="hsl(30, 100%, 60%)"
            fillOpacity="0.1"
          />
          <polygon
            points="0,0 20,34.64 0,69.28"
            fill="hsl(35, 90%, 55%)"
            fillOpacity="0.08"
          />
        </pattern>
        
        {/* Border glow */}
        <linearGradient id="border-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(30, 100%, 60%)" stopOpacity="0.6" />
          <stop offset="50%" stopColor="hsl(30, 100%, 65%)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="hsl(30, 100%, 60%)" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      
      {/* Háttér */}
      <rect
        width="100%"
        height="100%"
        fill="url(#geodesic-bg)"
      />
      
      {/* Belső világítás overlay */}
      <rect
        width="100%"
        height="100%"
        fill="url(#geodesic-glow)"
      />
      
      {/* Háromszög pattern overlay */}
      <rect
        width="100%"
        height="100%"
        fill="url(#triangle-pattern)"
        style={{ mixBlendMode: 'overlay' }}
      />
      
      {/* Border glow effect */}
      <rect
        x="1"
        y="1"
        width="calc(100% - 2)"
        height="calc(100% - 2)"
        fill="none"
        stroke="url(#border-glow)"
        strokeWidth="2"
        rx="24"
        style={{ filter: 'blur(1px)' }}
      />
    </svg>
  );
};
