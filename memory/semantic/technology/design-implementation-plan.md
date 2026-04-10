---
id: semantic_technology_20260410_301
type: semantic
domain: technology
created: 2026-04-10
source: DESIGN-IMPLEMENTATION-PLAN.md
tags: [design, frontend, tailwind, framer-motion, fonts, bento-grid]
project: websuli
---

# WebSuli Design Implementációs Terv (2026)

## Jelenlegi állapot
✅ React 18 + TypeScript, TailwindCSS 3.4+, shadcn/ui, Framer Motion, Hero Section, Glassmorphism kártyák

## Hiányzó elemek
❌ Google Fonts (Poppins, Nunito, Montserrat), Tailwind font stack, Korcsoport-specifikus design, Bento Grid, Aurora gradient, Framer Motion animációk, Neomorphism

## Implementációs fázisok
**Fázis 1 (KRITIKUS)**: Font rendszer
- `index.html` → Google Fonts import
- `tailwind.config.ts` → font stack (kid/teen/senior display + body)
- `index.css` → Poppins alapértelmezett

**Fázis 2 (OPCIONÁLIS)**: Korcsoport design
- `useClassroomTheme.ts` hook
- CSS változók per korcsoport

**Fázis 3 (MODERN)**: Bento Grid, Aurora gradient, Framer Motion, Neomorphism

## Korcsoport színek
- Kid (6-10): `#FF6B6B` (korall), `#4ECDC4` (türkiz), `#FFE66D` (sárga)
- Teen (11-14): `#8B5CF6` (lila), `#06B6D4` (türkiz), `#F59E0B` (amber)
- Senior (15-18): `#3B82F6` (kék), `#8B5CF6` (indigo), `#F97316` (narancs)
