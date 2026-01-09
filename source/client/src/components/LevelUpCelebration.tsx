import { useEffect, useState } from "react";

interface LevelUpCelebrationProps {
  level: number;
  onComplete?: () => void;
}

/**
 * Level-Up Celebration komponens
 * Specifikáció: Gamifikált oktatási platform UI/UX
 * Confetti animációval és színkóddal
 */
export default function LevelUpCelebration({ level, onComplete }: LevelUpCelebrationProps) {
  const [show, setShow] = useState(true);
  const [confetti, setConfetti] = useState<Array<{ id: number; x: number; delay: number }>>([]);

  useEffect(() => {
    // Confetti generálás
    const confettiElements = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.5,
    }));
    setConfetti(confettiElements);

    // Auto-hide 3 másodperc után
    const timer = setTimeout(() => {
      setShow(false);
      if (onComplete) {
        setTimeout(onComplete, 500);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!show) return null;

  return (
    <div className="level-up-container">
      {/* Confetti particles */}
      {confetti.map((conf) => (
        <div
          key={conf.id}
          className="confetti"
          style={{
            left: `${conf.x}%`,
            animationDelay: `${conf.delay}s`,
            animationDuration: `${2 + Math.random() * 2}s`,
          }}
        />
      ))}

      {/* Level number */}
      <div className="level-up-number">{level}</div>

      {/* Level up text */}
      <div className="level-up-text">Level Up!</div>
    </div>
  );
}

