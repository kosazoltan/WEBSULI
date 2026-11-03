import { useMemo, useState, type FormEvent } from "react";
import { Sparkles, ArrowRight, Flame, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useClassroomGrade } from "@/lib/classroomStore";
import { getClassroomLabel } from "@shared/classrooms";
import { coverIdFor } from "@shared/home-card-theme";
import { useLearnerProfile } from "@/lib/learnerProfile";
import { streakMessage } from "@shared/learner-streak";
import { LEARNER_NAME_MAX, WELCOME_DISMISSED_KEY, loadLearnerName, loadNameOverride, motivationFor, newestMaterials, resolveLearnerName, saveLearnerName, saveNameOverride } from "@/lib/learner";

type Material = { id: string; title: string; classroom: number; createdAt: string; cover?: string | null; coverThumb?: string };

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
 * Spec 2026-11-03-udvozlo-jatekkartyak-szulo: az admin (szülő) a saját nevével, az összes évfolyam újdonságaival kap ajánlót — a
 * tanulóhoz párosított eszközön is; kinézet a fejléc üvegnyelvén.
 */
export default function WelcomeCard<T extends Material>({ files, onViewFile }: { files: T[]; onViewFile: (file: T) => void }) {
  const { user, isAdmin } = useAuth();
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
  // S3: a párosított tanuló napi sorozata — a szülőnek nem „neked” szóló üzenet.
  const streakText = isAdmin ? null : streakMessage(profile?.streak);

  const account = user ? { id: user.id, firstName: user.firstName } : null;
  // review #289: bejelentkezve a kézi „Módosítás” fiókhoz kötött felülírás — fiókváltáskor nem öröklődik
  const override = useMemo(() => (account ? loadNameOverride(account.id) : null), [account?.id, overrideTick]);
  // Review #301: a párosított eszközön a profil neve az irányadó (bejelentkezett fiók mellett is) — kivéve az admint (szülő).
  const accountName = resolveLearnerName(account, storedName, override);
  // Review #389: az admin a böngészőben tárolt (a párosításkor a gyerekére állított) nevet sem örökli — fióknév vagy a fiókhoz
  // kötött felülírás, ezek hiányában a névkérő űrlap.
  const name = isAdmin ? resolveLearnerName(account, null, override) : profile?.firstName ?? accountName;
  const pickGrade = isAdmin ? null : grade;
  const today = new Date();
  const picks = useMemo(() => newestMaterials(files, pickGrade, new Date()), [files, pickGrade]);

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
    // Az admin nem ír évfolyamot: az eszköz évfolyama a gyereké (a játékok azt használják).
    if (!isAdmin) {
      // review #289: az üres választás törli a tárolt évfolyamot (vissza az évfolyam nélküli ajánláshoz)
      const g = Number(draftGrade);
      if (draftGrade && Number.isInteger(g) && g >= 1 && g <= 12) setGrade(g);
      // Tulajdonosi kérés 2026-10-18 (docs/specs/2026-10-18-evfolyam-nem-torolheto.md): a megadott évfolyam nem törölhető.
      else if (grade == null) clearGrade();
    }
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
      <form onSubmit={submit} className="home-panel welcome-panel mx-auto mb-3 max-w-3xl text-white" data-testid="welcome-ask" aria-labelledby="welcome-ask-title">
        <div className="flex items-center gap-3">
          <span className="welcome-avatar" aria-hidden="true">
            <Sparkles className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2 id="welcome-ask-title" className="text-base sm:text-lg font-extrabold leading-tight">
              {name ? "Kit üdvözölhetünk?" : "Szia! Hogy hívnak?"}
            </h2>
            <p className="welcome-sub">
              {isAdmin ? "Add meg a keresztneved — az ajánló az összes évfolyam újdonságait mutatja." : "Add meg a keresztneved, és megmutatjuk a legújabb tananyagaidat."}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            maxLength={LEARNER_NAME_MAX}
            placeholder="Keresztneved"
            aria-label="Keresztneved"
            autoComplete="given-name"
            className="welcome-input h-11 flex-1 min-w-[10rem]"
            data-testid="welcome-name"
          />
          {!isAdmin && (
            <select
              // Review #293: üres draftnál a tárolt évfolyam látszik (a kijelzett és a mentett érték egyezik).
              value={draftGrade || (grade != null ? String(grade) : "")}
              onChange={(e) => setDraftGrade(e.target.value)}
              aria-label="Évfolyamod"
              className="welcome-input h-11 rounded-xl px-3 text-sm [&>option]:text-slate-900"
              data-testid="welcome-grade"
            >
              {grade == null && <option value="">Évfolyam (nem kötelező)</option>}
              {Array.from({ length: 12 }, (_, i) => i + 1).map(g => <option key={g} value={g}>{getClassroomLabel(g)}</option>)}
            </select>
          )}
          <Button type="submit" disabled={!draftName.trim()} className="h-11 px-5 rounded-full font-bold text-slate-950 border-0 bg-gradient-to-r from-[#FB923C] to-[#EAB308] hover:from-[#FB923C] hover:to-[#EAB308] hover:brightness-110 shadow-md" data-testid="welcome-save">
            Mehet
          </Button>
          <Button type="button" variant="outline" onClick={name ? () => setEditing(false) : dismiss} className="welcome-ghost h-11 rounded-full" data-testid="welcome-dismiss">
            {name ? "Mégse" : "Most nem"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <section className="home-panel welcome-panel mx-auto mb-3 max-w-5xl text-white" data-testid="welcome-greet" aria-labelledby="welcome-greet-title">
      <div className="flex items-start gap-3">
        <span className="welcome-avatar" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h2 id="welcome-greet-title" className="text-lg sm:text-xl font-extrabold leading-tight">
              Szia, <span className="text-amber-200">{name}</span>!
            </h2>
            <button type="button" onClick={startEdit} className="welcome-edit-btn" data-testid="welcome-edit">
              <PencilLine className="w-3.5 h-3.5" aria-hidden="true" />
              Nem te vagy? Módosítás
            </button>
          </div>
          <p className="welcome-sub" data-testid="welcome-motivation">{motivationFor(name, today)}</p>
          {streakText && (
            <p className="welcome-streak" data-testid="welcome-streak">
              <Flame className="w-4 h-4" aria-hidden="true" />
              {streakText}
            </p>
          )}
        </div>
      </div>
      {picks.files.length > 0 && (
        <>
          <h3 className="welcome-picks-title">
            {pickGrade && picks.fromGrade ? `A legújabb tananyagaid (${getClassroomLabel(pickGrade)})` : "A legújabb tananyagok"}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-3">
            {picks.files.map(file => (
              <li key={file.id} className="min-w-0">
                <button type="button" onClick={() => onViewFile(file)} className="welcome-pick" data-testid={`welcome-pick-${file.id}`}>
                  <img
                    className="welcome-pick-thumb"
                    src={file.coverThumb ?? `/api/design-assets/${coverIdFor(file.cover, file.classroom ?? 1)}/thumb`}
                    alt=""
                    width={64}
                    height={64}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                    // Review #389 (mint a listán, review #381): a frissítés új, működő borítót hozhat — a sikeres betöltés újra mutatja.
                    onLoad={(e) => { e.currentTarget.style.visibility = ""; }}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="welcome-pick-meta">
                      {picks.isNew(file) && <span className="welcome-pick-new">Új</span>}
                      <span>{getClassroomLabel(file.classroom ?? 1)}</span>
                    </span>
                    <span className="welcome-pick-title">{file.title}</span>
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
