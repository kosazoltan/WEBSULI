---
id: semantic_technology_20260410_305
type: semantic
domain: technology
created: 2026-04-10
source: edu-platform-design-prompt-2026.md
tags: [design, fonts, korcsoport, tailwind, animation, accessibility]
project: websuli
---

# Oktatási Platform Design 2026 - AI Prompt Specifikáció

## Magyar ékezet-barát fontok (KÖTELEZŐ)
✅ Poppins, Nunito, Montserrat, Open Sans, Rubik, Quicksand, Lato, Outfit
❌ TILTOTT: Fredoka One, Space Grotesk, Clash Display, Satoshi

## Korcsoport-specifikus design
- **Kid (6-10)**: Lekerekített (24px+), élénk korall/türkiz/sárga, Nunito/Quicksand
- **Teen (11-14)**: Gaming/neon, dark bg (#0F172A), lila/türkiz/amber, Montserrat/Poppins
- **Senior (15-18)**: Minimál, glassmorphism, kék/indigo/narancs, Montserrat/Open Sans

## 2026 trendek
1. **Bento Grid**: `grid grid-cols-4 auto-rows-[200px]` változó méretű kártyák
2. **Aurora gradient**: 400% 400% background-size, 15s animáció
3. **Framer Motion**: staggerChildren 0.1s, spring animációk
4. **Glassmorphism**: `backdrop-filter: blur(20px)`, rgba borders
5. **Neumorphism gombok**: inset/outset box-shadow

## Tailwind fontFamily konfiguráció
```js
'kid-display': ['Nunito', 'Quicksand', 'Poppins', 'sans-serif']
'teen-display': ['Montserrat', 'Outfit', 'Poppins', 'sans-serif']
'senior-display': ['Montserrat', 'Poppins', 'sans-serif']
```

## Checklist
- UTF-8: `<meta charset="UTF-8">`
- WCAG 2.1 AA kontraszt
- Touch targets min 44×44px
- Responsive minden képernyőn
