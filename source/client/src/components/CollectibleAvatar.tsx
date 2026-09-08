import { memo, useId } from "react";

/** Original vector creatures stay sharp on phones and large displays. */
function CollectibleAvatar({ name, value }: { name: string; value: number }) {
  const id = useId();
  const hue = (value * 7) % 360;
  const ghost = name === "Szellem";
  const robot = name === "Robot";
  const skull = name === "Koponya";
  return (
    <svg viewBox="0 0 100 110" className="relative z-10 h-full w-full overflow-visible" aria-hidden>
      <defs><linearGradient id={id} x2=".7" y2="1">
        <stop stopColor={skull ? '#fff7db' : `hsl(${hue} 95% 85%)`}/>
        <stop offset="1" stopColor={skull ? '#a1b7c9' : `hsl(${hue} 70% 48%)`}/>
      </linearGradient></defs>
      <ellipse cx="50" cy="99" rx="30" ry="7" fill="#040921" opacity=".5"/>
      <path d={ghost ? 'M18 83V44a32 32 0 0 1 64 0v39l-11-7-11 9-11-8-11 8-10-9Z' : 'M18 39Q18 16 50 16T82 39v32Q82 91 50 91T18 71Z'} fill={`url(#${id})`} stroke="#f5f9ff" strokeWidth="3"/>
      {!ghost && <path d="M28 87l-5 9m49-9 5 9" stroke={`hsl(${hue} 65% 50%)`} strokeWidth="10" strokeLinecap="round"/>}
      {robot ? <><path d="M50 16V7" stroke="#c6faff" strokeWidth="4"/><circle cx="50" cy="6" r="5" fill="#f8d567"/><rect x="26" y="37" width="48" height="29" rx="9" fill="#142441"/></> : <path d="M28 24Q39 16 51 23" stroke="white" strokeWidth="5" strokeLinecap="round" opacity=".6"/>}
      <ellipse cx="36" cy="49" rx={skull?10:8} ry="11" fill="#101d38"/><ellipse cx="65" cy="49" rx={skull?10:8} ry="11" fill="#101d38"/>
      <circle cx="34" cy="45" r="3" fill="white"/><circle cx="63" cy="45" r="3" fill="white"/>
      <path d={skull?'M42 72h17m-13-4v8m8-8v8':'M42 70q8 8 17-1'} fill="none" stroke="#24304b" strokeWidth="3" strokeLinecap="round"/>
      {!skull && <><ellipse cx="26" cy="64" rx="7" ry="4" fill="#f899ae" opacity=".65"/><ellipse cx="76" cy="64" rx="7" ry="4" fill="#f899ae" opacity=".65"/></>}
    </svg>
  );
}
export default memo(CollectibleAvatar);
