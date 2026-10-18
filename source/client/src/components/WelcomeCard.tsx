import { useMemo, useState, type FormEvent } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useClassroomGrade } from "@/lib/classroomStore";
import { getClassroomLabel } from "@shared/classrooms";
import { useLearnerProfile } from "@/lib/learnerProfile";
import { LEARNER_NAME_MAX, WELCOME_DISMISSED_KEY, loadLearnerName, loadNameOverride, motivationFor, newestMaterials, resolveLearnerName, saveLearnerName, saveNameOverride } from "@/lib/learner";

type Material = { id: string; title: string; classroom: number; createdAt: string };

const sessionDismissed = () => {
  try {
    return window.sessionStorage.getItem(WELCOME_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Személyes üdvözlő ajánló a lista fölött (docs/specs/2026-10-18-nyilvanos-oldal-udvozlo.md). Nem felugró ablak: a lista
 * mögötte végig használható. A név a fiókból vagy a tanuló böngészőjéből jön; a szerverre nem kerül.
 */
export default function WelcomeCard<T extends Material>({ files, onViewFile }: { files: T[]; onViewFile: (file: T) => void }) {
  const { user } = useAuth();
  const { grade, setGrade, clearGrade } = useClassroomGrade();
  const [storedName, setStoredName] = useState<string | null>(() => loadLearnerName());
  const [editing, setEditing] = useState(false);
  const [dismissed, setDismissed] = useState(sessionDismissed);
  const [draftName, setDraftName] = useState("");
  const [draftGrade, setDraftGrade] = useState<string>("");
  const [overrideTick, setOverrideTick] = useState(0);
  // Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md): a profil évfolyamát és nevét a LearnerProfileSync szinkronizálja
  // (alkalmazásszinten); itt csak a megjelenített név elsőbbsége.
  const profile = useLearnerProfile();

  const account = user ? { id: user.id, firstName: user.firstName } : null;
  // review #289: bejelentkezve a kézi „Módosítás” fiókhoz kötött felülírás — fiókváltáskor nem öröklődik
  const override = useMemo(() => (account ? loadNameOverride(account.id) : null), [account?.id, overrideTick]);
  // Review #301: a párosított eszközön a profil neve az irányadó (bejelentkezett fiók mellett is).
  const name = profile?.firstName ?? resolveLearnerName(account, storedName, override);
  const today = new Date();
  const picks = useMemo(() => newestMaterials(files, grade, new Date()), [files, grade]);

  const startEdit = () => {
    setDraftName(name ?? "");
    setDraftGrade(grade ? String(grade) : "");
    setEditing(true);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (account) {
      if (!saveNameOverride(account.id, draftName)) return;
      setOverrideTick(t => t + 1);
    } else {
      const saved = saveLearnerName(draftName);
      if (!saved) return;
      setStoredName(saved);
    }
    // review #289: az üres választás törli a tárolt évfolyamot (vissza az évfolyam nélküli ajánláshoz)
    const g = Number(draftGrade);
    if (draftGrade && Number.isInteger(g) && g >= 1 && g <= 12) setGrade(g);
    // Tulajdonosi kérés 2026-10-18 (docs/specs/2026-10-18-evfolyam-nem-torolheto.md): a megadott évfolyam nem törölhető.
    else if (grade == null) clearGrade();
    setEditing(false);
  };

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(WELCOME_DISMISSED_KEY, "1");
    } catch {
      // nincs munkamenet-tárhely: csak erre a megjelenítésre rejtjük el
    }
    setDismissed(true);
    setEditing(false);
  };

  if (!name && !editing && dismissed) return null;

  if (!name || editing) {
    return (
      <form onSubmit={submit} className="glass-card rounded-2xl mx-auto mb-3 max-w-3xl p-3 sm:p-4 text-white" data-testid="welcome-ask" aria-labelledby="welcome-ask-title">
        <h2 id="welcome-ask-title" className="text-base sm:text-lg font-extrabold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-300 shrink-0" aria-hidden="true" />
          {name ? "Kit üdvözölhetünk?" : "Szia! Hogy hívnak?"}
        </h2>
        <p className="text-sm text-white/85 mt-1">Add meg a keresztneved, és megmutatjuk a legújabb tananyagaidat.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            maxLength={LEARNER_NAME_MAX}
            placeholder="Keresztneved"
            aria-label="Keresztneved"
            autoComplete="given-name"
            className="h-11 flex-1 min-w-[10rem] bg-white/20 border-white/40 text-white placeholder:text-white/70"
            data-testid="welcome-name"
          />
          <select
            // Review #293: üres draftnál a tárolt évfolyam látszik (a kijelzett és a mentett érték egyezik).
            value={draftGrade || (grade != null ? String(grade) : "")}
            onChange={(e) => setDraftGrade(e.target.value)}
            aria-label="Évfolyamod"
            className="h-11 rounded-md bg-white/20 border border-white/40 text-white px-2 text-sm [&>option]:text-slate-900"
            data-testid="welcome-grade"
          >
            {grade == null && <option value="">Évfolyam (nem kötelező)</option>}
            {Array.from({ length: 12 }, (_, i) => i + 1).map(g => <option key={g} value={g}>{getClassroomLabel(g)}</option>)}
          </select>
          <Button type="submit" disabled={!draftName.trim()} className="h-11 px-5 rounded-full font-bold text-slate-950 border-0 bg-gradient-to-r from-[#FB923C] to-[#EAB308] hover:from-[#FB923C] hover:to-[#EAB308] hover:brightness-110 shadow-md" data-testid="welcome-save">
            Mehet
          </Button>
          <Button type="button" variant="outline" onClick={name ? () => setEditing(false) : dismiss} className="h-11 rounded-full bg-white/20 border-white/40 text-white hover:bg-white/30" data-testid="welcome-dismiss">
            {name ? "Mégse" : "Most nem"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <section className="glass-card rounded-2xl mx-auto mb-3 max-w-5xl p-3 sm:p-4 text-white" data-testid="welcome-greet" aria-labelledby="welcome-greet-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="welcome-greet-title" className="text-lg sm:text-xl font-extrabold">
          Szia, <span className="text-amber-200">{name}</span>!
        </h2>
        <button type="button" onClick={startEdit} className="min-h-11 text-sm text-white/85 underline underline-offset-2 hover:text-white" data-testid="welcome-edit">
          Nem te vagy? Módosítás
        </button>
      </div>
      <p className="text-sm sm:text-base text-white/90 mt-0.5" data-testid="welcome-motivation">{motivationFor(name, today)}</p>
      {picks.files.length > 0 && (
        <>
          <h3 className="mt-3 mb-1.5 text-sm font-bold text-amber-200">
            {grade && picks.fromGrade ? `A legújabb tananyagaid (${getClassroomLabel(grade)})` : "A legújabb tananyagok"}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-3">
            {picks.files.map(file => (
              <li key={file.id}>
                <button
                  type="button"
                  onClick={() => onViewFile(file)}
                  className="w-full min-h-11 h-full text-left rounded-xl bg-white/15 hover:bg-white/25 border border-white/30 px-3 py-2 flex items-center gap-2 transition-colors"
                  data-testid={`welcome-pick-${file.id}`}
                >
                  <span className="flex-1 min-w-0">
                    {picks.isNew(file) && <span className="mr-1.5 inline-flex items-center rounded-full bg-emerald-700 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white align-middle">Új</span>}
                    <span className="text-sm font-semibold leading-snug break-words">{file.title}</span>
                  </span>
                  <ArrowRight className="w-4 h-4 shrink-0 text-amber-200" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
