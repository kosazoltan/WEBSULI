# VAULT: Design System 2026 Kanonikus

## Legfontosabb szabályok

### 1. Magyar ékezetek
✅ KÖTELEZŐ: Poppins, Nunito, Montserrat, Open Sans, Quicksand
❌ TILOS: Fredoka One, Space Grotesk, Clash Display, Satoshi

### 2. Font stack
```css
font-family: 'Poppins', 'Nunito', 'Segoe UI', 'Noto Sans', system-ui, sans-serif;
```

### 3. Korcsoport téma
- `useClassroomTheme.ts` hook: osztály (1-4/5-8/9-12) → kid/teen/senior
- CSS változók per korcsoport

### 4. Accessibility
- WCAG 2.1 AA kontraszt
- Touch targets: min 44×44px
- UTF-8: `<meta charset="UTF-8">`

## 2026 Trend komponensek
- **Bento Grid**: `grid grid-cols-4 auto-rows-[200px] gap-4`
- **Aurora**: `background-size: 400% 400%; animation: aurora 15s infinite`
- **Glass**: `backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.2)`
- **Framer Motion**: `staggerChildren: 0.1, type: 'spring', damping: 12`
