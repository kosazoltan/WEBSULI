import { useMemo } from 'react';

export type ClassroomTheme = 'kid' | 'teen' | 'senior';

export interface ClassroomThemeConfig {
  theme: ClassroomTheme;
  displayFont: string;
  bodyFont: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

/**
 * Korcsoport-specifikus téma meghatározása osztály alapján
 * - Alsó tagozat (1-4. osztály): kid (6-10 év)
 * - Felső tagozat (5-8. osztály): teen (11-14 év)
 * - Középiskola (9-12. osztály): senior (15-18 év)
 */
export function useClassroomTheme(classroom: number | null): ClassroomThemeConfig {
  return useMemo(() => {
    if (classroom === null || classroom < 1) {
      // Alapértelmezett: teen theme
      return {
        theme: 'teen',
        displayFont: 'font-teen-display',
        bodyFont: 'font-teen-body',
        primaryColor: 'text-teen-primary',
        secondaryColor: 'text-teen-secondary',
        accentColor: 'text-teen-accent',
      };
    }

    if (classroom >= 1 && classroom <= 4) {
      // Alsó tagozat - Játékos Felfedező
      return {
        theme: 'kid',
        displayFont: 'font-kid-display',
        bodyFont: 'font-kid-body',
        primaryColor: 'text-kid-primary',
        secondaryColor: 'text-kid-secondary',
        accentColor: 'text-kid-accent',
      };
    } else if (classroom >= 5 && classroom <= 8) {
      // Felső tagozat - Digitális Kalandor
      return {
        theme: 'teen',
        displayFont: 'font-teen-display',
        bodyFont: 'font-teen-body',
        primaryColor: 'text-teen-primary',
        secondaryColor: 'text-teen-secondary',
        accentColor: 'text-teen-accent',
      };
    } else {
      // Középiskola - Fiatal Professzionális
      return {
        theme: 'senior',
        displayFont: 'font-senior-display',
        bodyFont: 'font-senior-body',
        primaryColor: 'text-senior-primary',
        secondaryColor: 'text-senior-secondary',
        accentColor: 'text-senior-accent',
      };
    }
  }, [classroom]);
}
