import { useEffect } from "react";
import { useClassroomGrade } from "@/lib/classroomStore";
import { loadLearnerName, saveLearnerName } from "@/lib/learner";
import { useLearnerProfile } from "@/lib/learnerProfile";

/**
 * Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md): alkalmazásszinten, útvonaltól függetlenül (a napi link a /preview/:id-re
 * visz, onnan játékba is mehet) — a párosított eszközön a profil évfolyama és keresztneve az irányadó. Review #301: a helyi érték
 * kézi módosítása után is visszaáll a profilé.
 */
export default function LearnerProfileSync() {
  const profile = useLearnerProfile();
  const { grade, setGrade } = useClassroomGrade();
  useEffect(() => {
    if (!profile) return;
    if (loadLearnerName() !== profile.firstName) saveLearnerName(profile.firstName);
    if (grade !== profile.grade && profile.grade >= 1 && profile.grade <= 12) setGrade(profile.grade as Parameters<typeof setGrade>[0]);
  }, [profile, grade, setGrade]);
  return null;
}
