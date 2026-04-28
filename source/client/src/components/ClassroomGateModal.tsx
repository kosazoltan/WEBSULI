import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useClassroomGrade, type ClassroomGrade } from "@/lib/classroomStore";

const GRADES: ClassroomGrade[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

type Props = {
  /** Játék-szín, ami az UI accent-eknek illeszkedik (cyan / lime / amber / rose / fuchsia). */
  accent?: "cyan" | "lime" | "amber" | "rose" | "fuchsia" | "violet";
  /**
   * Ha igaz, akkor mindig megjeleníti a modal-t (még ha be is van állítva grade).
   * Hasznos a "Más osztály választása" gomb-flow-hoz.
   */
  forceShow?: boolean;
  /** Visszahívás amikor a játékos választott — a játék pl. menüből indítja a kört. */
  onSelected?: (grade: ClassroomGrade) => void;
  /** Visszahívás amikor bezárja (csak ha forceShow). */
  onClose?: () => void;
};

const ACCENT_TO_BUTTON: Record<NonNullable<Props["accent"]>, string> = {
  cyan: "from-cyan-700 to-violet-800 hover:from-cyan-500 hover:to-violet-600 border-cyan-300/40",
  lime: "from-lime-600 to-emerald-800 hover:from-lime-500 hover:to-emerald-700 border-lime-200/40",
  amber: "from-amber-500 to-orange-700 hover:from-amber-400 hover:to-orange-600 border-amber-200/40",
  rose: "from-rose-600 to-pink-800 hover:from-rose-500 hover:to-pink-700 border-rose-200/40",
  fuchsia: "from-fuchsia-600 to-purple-800 hover:from-fuchsia-500 hover:to-purple-700 border-fuchsia-200/40",
  violet: "from-violet-600 to-fuchsia-800 hover:from-violet-500 hover:to-fuchsia-700 border-violet-200/40",
};

/**
 * Egységes osztály-választó modal a játékokhoz.
 *
 * Akkor mutatja, ha még nincs beállított osztály a localStorage-ben (vagy
 * `forceShow` esetén). Egy 1–12-es gomb-grid; a választás után a localStorage-be
 * menti, és értesíti a hook-okat (custom event), így minden játék automatikusan
 * frissül a következő render-en.
 *
 * Játékokba beágyazás:
 *   <ClassroomGateModal accent="lime" onSelected={(g) => setStartReady(true)} />
 *
 * Ha grade null ÉS nem forceShow, a modal MEGJELENIK; ha grade nem null, NEM.
 */
export default function ClassroomGateModal({ accent = "cyan", forceShow, onSelected, onClose }: Props) {
  const { grade, setGrade } = useClassroomGrade();
  const visible = forceShow || grade == null;
  if (!visible) return null;

  const handlePick = (g: ClassroomGrade) => {
    setGrade(g);
    onSelected?.(g);
    onClose?.();
  };

  const buttonStyle = ACCENT_TO_BUTTON[accent];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center p-3 bg-black/85 backdrop-blur-sm"
      data-testid="classroom-gate-modal"
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-md rounded-2xl border-2 border-white/20 bg-slate-950/95 p-5 shadow-2xl"
      >
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-amber-300" />
          <h2 className="text-lg font-extrabold text-white">Hányadik osztályos vagy?</h2>
        </div>
        <p className="text-[12px] text-white/70 mb-3 leading-relaxed">
          Az osztályod alapján a játék a SAJÁT legutóbbi 3 tananyagodból kérdez. Ami nincs még feldolgozva, azt általános bankból pótoljuk.
          Az érték a böngésződben tárolódik (nem küldjük el sehova) — bármikor megváltoztathatod.
        </p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {GRADES.map((g) => (
            <Button
              key={g}
              type="button"
              onClick={() => handlePick(g)}
              className={`h-12 text-base font-extrabold bg-gradient-to-br ${buttonStyle} border text-white`}
              data-testid={`button-grade-${g}`}
            >
              {g}.
            </Button>
          ))}
        </div>
        {forceShow && (
          <div className="flex justify-end">
            <button
              type="button"
              className="text-[11px] text-white/55 hover:text-white"
              onClick={onClose}
            >
              Mégse
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
