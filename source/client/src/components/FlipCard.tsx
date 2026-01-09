import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface FlipCardProps {
  frontContent: React.ReactNode;
  backContent: React.ReactNode;
  isCorrect?: boolean;
  onFlip?: () => void;
  className?: string;
}

/**
 * 3D Flip Card komponens - Quiz kérdésekhez
 * Specifikáció: Gamifikált oktatási platform UI/UX
 */
export default function FlipCard({ 
  frontContent, 
  backContent, 
  isCorrect,
  onFlip,
  className = "" 
}: FlipCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
    if (onFlip) {
      onFlip();
    }
  };

  return (
    <div 
      className={`flip-card ${isFlipped ? 'flipped' : ''} ${className}`}
      onClick={handleFlip}
    >
      <div className="flip-card-inner">
        <div className="flip-card-front">
          {frontContent}
        </div>
        <div className={`flip-card-back ${isCorrect !== undefined ? (isCorrect ? 'correct' : 'incorrect') : ''}`}>
          {backContent}
        </div>
      </div>
    </div>
  );
}

