import { useEffect, useState } from "react";

interface XPBarProps {
  currentXP: number;
  targetXP: number;
  level: number;
  showLabel?: boolean;
  className?: string;
}

/**
 * XP Progress Bar komponens
 * Specifikáció: Gamifikált oktatási platform UI/UX
 * Gaming style progress bar shimmer effektekkel
 */
export default function XPBar({ 
  currentXP, 
  targetXP, 
  level,
  showLabel = true,
  className = "" 
}: XPBarProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const percentage = Math.min((currentXP / targetXP) * 100, 100);

  useEffect(() => {
    // Smooth animation to target percentage
    const duration = 800;
    const startTime = performance.now();
    const startValue = animatedProgress;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const newValue = startValue + (percentage - startValue) * eased;
      
      setAnimatedProgress(newValue);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [percentage]);

  return (
    <div className={`xp-bar-container ${className}`}>
      <div 
        className="xp-bar-fill"
        style={{ width: `${animatedProgress}%` }}
      />
      {showLabel && (
        <div className="xp-label">
          Level {level} • {currentXP}/{targetXP} XP
        </div>
      )}
    </div>
  );
}

