/** Decorative chapter art. It is not presented as an explanatory scientific diagram. */
export function LessonCoverArt({ subject }: { subject: string }) {
  const nature = /természet|környezet|biológ|földrajz/i.test(subject);
  const reading = !/mate|geometr/i.test(subject);
  return <svg className="lesson-cover-art" viewBox="0 0 240 180" aria-hidden="true" focusable="false">
    <circle cx="125" cy="90" r="75" fill="var(--lesson-accent)" opacity=".09" />
    <circle cx="199" cy="28" r="8" fill="var(--fusion-secondary)" />
    <path d="M25 113h12m-6-6v12M208 116h12m-6-6v12" stroke="var(--lesson-accent)" strokeWidth="2" strokeLinecap="round" />
    {nature ? <g stroke="var(--lesson-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M126 148V74" /><path d="M126 106C72 110 57 71 63 49c37 1 65 19 63 57Z" fill="var(--fusion-soft)" /><path d="M127 130c52 2 69-31 65-53-33 0-63 22-65 53Z" fill="var(--lesson-surface)" /><path d="m78 63 48 43m1 24 50-37" fill="none" /><path d="M107 152h40" /></g>
      : reading ? <g stroke="var(--lesson-accent)" strokeWidth="3" strokeLinejoin="round"><path d="M42 47c32-8 62-1 82 11 20-12 50-19 82-11v92c-32-8-62-1-82 11-20-12-50-19-82-11Z" fill="var(--lesson-surface)" /><path d="M124 58v92M60 68c14-2 30 2 47 8m-47 12c14-2 30 2 47 8m-47 12c14-2 30 2 47 8m35-40c17-6 33-10 47-8m-47 28c17-6 33-10 47-8" fill="none" strokeWidth="2" /></g>
        : <g stroke="var(--lesson-accent)" strokeWidth="3" strokeLinejoin="round"><path d="M45 139 144 35l53 104Z" fill="var(--lesson-surface)" /><path d="M144 35v104" strokeDasharray="5 6" strokeWidth="2" /><path d="M132 139v-12h12" fill="none" strokeWidth="2" /><circle cx="144" cy="35" r="7" fill="var(--fusion-secondary)" stroke="var(--lesson-surface)" /><circle cx="45" cy="139" r="5" fill="var(--lesson-accent)" /><circle cx="197" cy="139" r="5" fill="var(--lesson-accent)" /><path d="M63 159h115" stroke="var(--fusion-secondary)" strokeWidth="4" strokeLinecap="round" /></g>}
  </svg>;
}
