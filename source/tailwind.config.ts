import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // ✅ MAGYAR ÉKEZET-BARÁT FONTOK
        'kid-display': ['Nunito', 'Quicksand', 'Poppins', 'sans-serif'],
        'kid-body': ['Quicksand', 'Nunito', 'Poppins', 'sans-serif'],
        'teen-display': ['Montserrat', 'Outfit', 'Poppins', 'sans-serif'],
        'teen-body': ['Poppins', 'Open Sans', 'sans-serif'],
        'senior-display': ['Montserrat', 'Poppins', 'sans-serif'],
        'senior-body': ['Open Sans', 'Lato', 'sans-serif'],
        'sans': ['Poppins', 'Nunito', 'Segoe UI', 'Noto Sans', 'system-ui', 'sans-serif'], // Alapértelmezett
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Korcsoport-specifikus színek
        'kid-primary': '#FF6B6B',
        'kid-secondary': '#4ECDC4',
        'kid-accent': '#FFE66D',
        'teen-primary': '#8B5CF6',
        'teen-secondary': '#06B6D4',
        'teen-accent': '#F59E0B',
        'senior-primary': '#3B82F6',
        'senior-secondary': '#8B5CF6',
        'senior-accent': '#F97316',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "aurora": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "aurora": "aurora 15s ease infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
