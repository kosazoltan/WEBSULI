
import React, { useEffect, useState } from 'react';

const ELEMENTS = [
    { text: '⏣', weight: 2 }, // Benzene ring
    { text: '⚛', weight: 2 }, // Atom
    { text: 'H₂O', weight: 1 },
    { text: 'E=mc²', weight: 1 },
    { text: 'π', weight: 1 },
    { text: '∫', weight: 1 },
    { text: '∑', weight: 1 },
    { text: '🧪', weight: 1.5 },
    { text: 'DNA', weight: 1 },
    { text: 'C₆H₁₂O₆', weight: 1 }, // Glucose
    { text: 'Fe²⁺', weight: 1 },
    { text: 'Au', weight: 1 },
    { text: 'Ag', weight: 1 },
    { text: 'H₂SO₄', weight: 1 },
    { text: 'NaCl', weight: 1 },
    { text: 'F=ma', weight: 1 }
];

interface Particle {
    id: number;
    text: string;
    x: number;
    y: number;
    size: number;
    duration: number;
    delay: number;
    opacity: number;
    rotation: number;
    colorClass: string;
    blur: string;
}

export function ChemicalBackground() {
    const [particles, setParticles] = useState<Particle[]>([]);

    useEffect(() => {
        const newParticles: Particle[] = [];
        const count = 35; // Increased density

        for (let i = 0; i < count; i++) {
            const el = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
            const isGold = Math.random() > 0.6; // 40% Gold, 60% Purple

            newParticles.push({
                id: i,
                text: el.text,
                x: Math.random() * 100,
                y: Math.random() * 100,
                size: (1.5 + Math.random() * 3) * (el.weight || 1), // Huge elements
                duration: 25 + Math.random() * 40, // 25-65s Very slow, majestic float
                delay: Math.random() * -60,
                opacity: 0.15 + Math.random() * 0.15, // 15-30% opacity (Visible!)
                rotation: Math.random() * 360,
                colorClass: isGold ? 'text-accent' : 'text-primary',
                blur: Math.random() > 0.5 ? 'blur-[1px]' : 'blur-none', // Depth of field effect
            });
        }
        setParticles(newParticles);
    }, []);

    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-[0]" aria-hidden="true">
            {/* Deep Space / Lab Gradient Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5 opacity-50" />

            {particles.map((p) => (
                <div
                    key={p.id}
                    className={`absolute font-serif font-bold select-none ${p.colorClass} ${p.blur}`}
                    style={{
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        fontSize: `${p.size}rem`,
                        opacity: p.opacity,
                        animation: `scienceFloat ${p.duration}s infinite linear`,
                        animationDelay: `${p.delay}s`,
                        transform: `rotate(${p.rotation}deg)`,
                        textShadow: '0 0 15px currentColor', // Glowing effect
                    }}
                >
                    {p.text}
                </div>
            ))}

            <style>{`
        @keyframes scienceFloat {
          0% {
            transform: translate(0, 0) rotate(0deg);
          }
          25% {
            transform: translate(30px, -30px) rotate(15deg);
          }
          50% {
             transform: translate(0, -60px) rotate(0deg); 
          }
          75% {
             transform: translate(-30px, -30px) rotate(-15deg);
          }
          100% {
            transform: translate(0, 0) rotate(0deg);
          }
        }
      `}</style>
        </div>
    );
}
