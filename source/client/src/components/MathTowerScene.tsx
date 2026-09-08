import { useId } from "react";

/** A compact vector world: the avatar advances with verified correct answers. */
export default function MathTowerScene({ current, target }: { current: number; target: number }) {
  const skyId = useId();
  const blockId = useId();
  const progress = Math.max(0, Math.min(1, current / Math.max(1, target)));
  const step = Math.round(progress * 7);
  return (
    <div className="math-world game-scene" aria-label={`Torony: ${current} a ${target} lépésből`} role="img">
      <svg viewBox="0 0 480 260" preserveAspectRatio="xMidYMid meet" aria-hidden>
        <defs>
          <linearGradient id={skyId} x2="0" y2="1"><stop stopColor="#16285b"/><stop offset="1" stopColor="#382167"/></linearGradient>
          <linearGradient id={blockId}><stop stopColor="#27d7d2"/><stop offset="1" stopColor="#247aad"/></linearGradient>
        </defs>
        <rect width="480" height="260" rx="18" fill={`url(#${skyId})`}/>
        {[35,100,185,290,365,450].map((x,i)=><circle key={x} cx={x} cy={20+i%3*19} r="2" fill="#d5f5ff"/>)}
        <circle cx="405" cy="65" r="30" fill="#f7bded" opacity=".18"/>
        <path d="M0 235L75 195 140 222 210 190 300 230 390 190 480 220V260H0Z" fill="#101c3a"/>
        {Array.from({length:8},(_,i)=>{
          const x=30+i*52,y=218-i*22;
          return <g key={i} opacity={i<=step?1:.45}>
            <path d={`M${x} ${y}l20 -10 30 10 -20 10Z`} fill={i<=step?'#a0fcdf':'#6879ba'}/>
            <path d={`M${x} ${y}l30 10v16l-30 -10Z`} fill={`url(#${blockId})`}/>
            <path d={`M${x+30} ${y+10}l20 -10v16l-20 10Z`} fill="#175480"/>
          </g>;
        })}
        <g transform={`translate(${40+step*52} ${182-step*22})`}>
          <rect width="23" height="26" rx="6" fill="#f6b74d" stroke="#ffe4a0" strokeWidth="2"/>
          <rect x="4" y="6" width="15" height="9" rx="3" fill="#24365a"/>
          <circle cx="8" cy="10" r="1.5" fill="white"/><circle cx="15" cy="10" r="1.5" fill="white"/>
          <path d="M5 27v7m14 -7v7" stroke="#fbdc8a" strokeWidth="5"/>
        </g>
        <path d="M442 55V17l24 8-24 9" stroke="#fbe184" strokeWidth="3" fill="#fbe184"/>
      </svg>
    </div>
  );
}
