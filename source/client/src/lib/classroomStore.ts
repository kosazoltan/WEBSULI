/**
 * Globális játékos-osztály tárolás localStorage-ben.
 *
 * Minden játék azonos store-t használ — egyszer beállított érték minden
 * tananyag-integrált játékban (BlockCraft, Tsunami, BrainRot, SpaceAsteroid,
 * SpeedQuizMath, WordLadder) érvényes ugyanabban a böngészőben.
 *
 * Custom event ("websuli:grade-changed") értesíti a többi komponenst, ha
 * valamelyik játékban a játékos megváltoztatja az osztályát.
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "websuli.classroomGrade";
const CHANGE_EVENT = "websuli:grade-changed";

export type ClassroomGrade = number; // 1..12

/** Aktuális tárolt osztály (1-12) vagy null ha még nincs beállítva. */
export function loadClassroomGrade(): ClassroomGrade | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
  } catch {
    return null;
  }
}

/** Beállítja az osztályt és minden ablakban értesíti a `useClassroomGrade` hook-okat. */
export function saveClassroomGrade(grade: ClassroomGrade): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(grade));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: grade }));
  } catch {
    /* no-op */
  }
}

/** Törli a tárolt osztályt — pl. "Más osztály választása" gombhoz. */
export function clearClassroomGrade(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: null }));
  } catch {
    /* no-op */
  }
}

/**
 * React hook — visszaadja az aktuális osztályt és reagál a `storage` és
 * a custom `websuli:grade-changed` eseményekre (több ablak / komponens
 * szinkronizálása).
 */
export function useClassroomGrade(): {
  grade: ClassroomGrade | null;
  setGrade: (g: ClassroomGrade) => void;
  clearGrade: () => void;
} {
  const [grade, setGradeState] = useState<ClassroomGrade | null>(() => loadClassroomGrade());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setGradeState(loadClassroomGrade());
      }
    };
    const onCustom = () => setGradeState(loadClassroomGrade());
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onCustom);
    };
  }, []);

  return {
    grade,
    setGrade: (g: ClassroomGrade) => {
      saveClassroomGrade(g);
      setGradeState(g);
    },
    clearGrade: () => {
      clearClassroomGrade();
      setGradeState(null);
    },
  };
}
