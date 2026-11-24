/**
 * Adventi naptár — „Fénylő ablakok” (docs/specs/2026-11-18-adventi-naptar.md; végrehajtás: …-vegrehajtas.md „S3a”, „S3b”).
 * Havas falu 24 ablaka: minden ablak mögött egy kérdés a tanuló évfolyamáról; a megoldott ablak kivilágosodik. 2D, CSS-alapú:
 * nincs three.js és nincs képkocka-hurok. A kérdést a szerver adja és pontozza; a kliens a helyes választ a válasz előtt nem ismeri.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { ArrowLeft, Check, Hourglass, Lock, Volume2, VolumeX, Wrench, X } from "lucide-react";
import type { AdventAnswerResult, AdventDoorView, AdventQuestion, AdventState } from "@shared/advent/contract";
import { doorArtId } from "@shared/advent/art";
import { adventDateLabel, articleFor, daySuffix, nextDoorToOpen, roundIsOver } from "@shared/advent/home-card";
import { ADVENT_MAX_GRADE, ADVENT_MIN_GRADE } from "@shared/advent/rules";
import { isMuted, sfxClick, sfxSuccess, toggleMuted } from "@/lib/audioEngine";
import AdventArt from "@/advent/AdventArt";
import Snowfall from "@/advent/Snowfall";
import { ADVENT_BUSY_WAITING_TEXT, adventErrorText, retryWhenBusy } from "@/advent/busy";
import { escapeMissedByLayer } from "@/advent/dialog-escape";
import { guardSwallows, type GuardPoint } from "@/advent/tap-guard";
import {
  ADVENT_STATE_KEY, adventApi, adventDevice, adventMode, clearPairingLost, forgetLearnerPairing, isPairingLost, markPairingLost, useAdventState,
} from "@/advent/useAdvent";
import { adventStateKey, adventSubjectGeneration, adventWriteBlocked, applyAdventWrite, applyAnswerResult, pairingRecovered, shouldAdopt } from "@/advent/sync";
import "@/advent/advent.css";

const SUBJECT_LABEL: Record<string, string> = {
  christmas: "Karácsony", math: "Matematika", english: "Angol", hungarian: "Magyar nyelv", science: "Természetismeret", history: "Történelem",
};
const GRADES = Array.from({ length: ADVENT_MAX_GRADE - ADVENT_MIN_GRADE + 1 }, (_, i) => ADVENT_MIN_GRADE + i);
/** Élesítési idő: a kérdés megjelenése után ennyi ideig a válaszgombok nem fogadnak bemenetet (dupla koppintás, második Enter). */
export const ADVENT_ARM_MS = 400;
/** A kérdés bezárása után ennyi ideig a rács nem fogad koppintást (a „Tovább” dupla koppintása ne érje a mögöttes ablakot). */
const GRID_GUARD_MS = 400;
/** A rövid üzenet (zárt ablak, eltűnt kérdés) ennyi ideig marad kint. */
const NOTICE_MS = 5000;
/** Ennyi idő után írjuk ki, hogy az ablak nyílik (gyors válasznál nincs felvillanó szöveg; az ablak maga azonnal jelez). */
const OPENING_TEXT_MS = 900;
const PAIRING_TEXT = "A személyes linked lejárt — nyisd meg újra a napi levélből, vagy folytasd vendégként.";
const CHOOSE_FIRST_TEXT = "Előbb válassz fent: nyisd meg újra a leveledből, vagy folytasd vendégként.";
/** Sérült mentés (a szerver 409 `corrupt` jelzése): célzott, gondozóhoz irányító üzenet — az újrapróba nem segítene (PR-C vak L7). */
const CORRUPT_TEXT = "A naptárad mentésében hibát találtunk — kérj segítséget egy felnőttől (a naptárat a gondozó tudja helyrehozni).";
/** A karácsonyfa csillagának egyszeri felfénylése a 24. ablak megoldásakor (terv 13.7: 1,2 s). */
const STAR_FLASH_MS = 1200;

/** Bezárt naptárban (január) nincs mit nyitni és javítani: az állapot ennek megfelelően látszik. */
function shownState(door: AdventDoorView, closed: boolean): AdventDoorView["state"] {
  if (!closed) return door.state;
  if (door.state === "repairable") return "failed";
  if (door.state === "open") return "locked";
  return door.state;
}

function doorLabel(door: AdventDoorView, closed: boolean): string {
  const base = `${door.day}. ablak`;
  const state = shownState(door, closed);
  if (state === "solved") return `${base} — megoldva, világít`;
  if (closed) return state === "failed" ? `${base} — nem sikerült megoldani; az idei naptár bezárt` : `${base} — az idei naptár bezárt`;
  if (state === "locked") return `${base} — december ${door.day}${daySuffix(door.day)} nyílik`;
  if (state === "open") return `${base} — nyitható`;
  if (state === "repairable") return `${base} — javítható`;
  return `${base} — ebben a körben már nem javítható`;
}

type Open = { day: number; question: AdventQuestion; result: AdventAnswerResult | null; readOnly: boolean; repair: boolean; picked: number | null };

function useLandscape(): boolean {
  const query = "(orientation: landscape)";
  const [landscape, setLandscape] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setLandscape(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return landscape;
}

/**
 * A naptár módonként (normál / előnézeti nap) KÜLÖN példány (S5/S6 1. vak L2): módváltáskor (pl. az előnézetből lapfrissítés nélkül
 * a normál címre) a helyi állapot (nyitott kérdés, szándék, hibák) nem öröklődik.
 */
export default function AdventCalendar() {
  // A cím keresőrészének figyelése: változáskor újrarajzol, és a mód (a címből) újraszámolódik.
  useSearch();
  const mode = adventMode();
  return <AdventCalendarView key={mode} />;
}

function AdventCalendarView() {
  const queryClient = useQueryClient();
  // A mód a lekérdezésé (minden rajzoláskor a címből; egy elutasított előnézet után már „normal”) — az írások ugyanide kerülnek.
  const { data: state, isLoading, isError, error: loadError, refetch, generation, mode } = useAdventState();
  const [open, setOpen] = useState<Open | null>(null);
  const [busy, setBusy] = useState(false);
  // Melyik ablak nyílik éppen (lassú hálózaton azonnali jelzés az ablakon), és kiírjuk-e már szöveggel is.
  const [openingDay, setOpeningDay] = useState<number | null>(null);
  const [openingSlow, setOpeningSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A meghiúsult írás fajtája (PR-C 3. vak L2, L3): az „Újra” ezt indítja újra (az átvételt, illetve a főoldalról indított nyitást) —
  // nem csak állapotot olvas. `saving`: az átvétel igazolt mentéséig látható jelzés.
  const [failedWrite, setFailedWrite] = useState<"adopt" | "auto-open" | null>(null);
  const [saving, setSaving] = useState(false);
  // Rövid, látható (és felolvasott) üzenet a lap alján — nem tolja el a rácsot. Az `n` miatt ugyanaz a szöveg újra megjelenik.
  const [notice, setNotice] = useState<{ text: string; n: number } | null>(null);
  // 429 („most sokan vagyunk”): rövid várakozás alatt barátságos üzenet, utána egy automatikus újrapróba.
  const [waiting, setWaiting] = useState(false);
  // Egy művelet az indító alany-generációhoz kötött (PR-C 2. vak L1): váltás után sem az eredménye, sem a hibája, sem a várakozás
  // jelzése nem módosítja az új nézetet, és a 429 utáni újrapróba elmarad.
  const isCurrent = (started: number) => adventSubjectGeneration() === started;
  const patient = useCallback(<T,>(run: () => Promise<T>, started: number) => retryWhenBusy(run, {
    onWait: (waiting) => { if (adventSubjectGeneration() === started) setWaiting(waiting); },
    cancelled: () => adventSubjectGeneration() !== started,
  }), []);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [muted, setMuted] = useState(() => isMuted());
  const [hidden, setHidden] = useState(false);
  const [armed, setArmed] = useState(false);
  // Évfolyamválasztás megerősítéssel; az első válaszig módosítható.
  const [pendingGrade, setPendingGrade] = useState<number | null>(null);
  const [changingGrade, setChangingGrade] = useState(false);
  // Lejárt tanulói link: amíg a gyerek nem választ, a naptár nem ír (A53) — akkor sem, ha a tokent közben más már törölte.
  const [mustChoose, setMustChoose] = useState(() => isPairingLost());
  // A választási kényszer a renderelt értéktől függetlenül, SZINKRON is olvasható (PR-C vak L6: egy commiton belül futó effektusok).
  const mustChooseRef = useRef(mustChoose);
  mustChooseRef.current = mustChoose;
  // A fókusz a párbeszédablak bezárása után oda megy vissza, ahonnan a gyerek megnyitotta (ablak, „Javítom”, „Összesítés” …).
  const questionOpener = useRef<HTMLElement | null>(null);
  const summaryOpener = useRef<HTMLElement | null>(null);
  const summaryButton = useRef<HTMLButtonElement | null>(null);
  const questionRef = useRef<HTMLParagraphElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const gridGuardUntil = useRef(0);
  // A „Tovább” koppintásának pontja (billentyűs zárásnál null): a védőidő csak ezt a pontot védi (vak ellenőr KICSI-4).
  const gridGuardPoint = useRef<GuardPoint | null>(null);
  // A kérdésből az összesítés nyílik: a bezáródó kérdés ne vigye a fókuszt az ablakra (a két párbeszédablak ne „versenyezzen”).
  const handoffToSummary = useRef(false);
  // A védőidő a DOM-on is látszik (data-guard), hogy a gép (teszt) is megvárhassa, mint a gyerek a második koppintás előtt.
  const [guarded, setGuarded] = useState(false);
  useEffect(() => {
    if (!guarded) return;
    const timer = window.setTimeout(() => setGuarded(false), GRID_GUARD_MS);
    return () => window.clearTimeout(timer);
  }, [guarded]);
  const wantsAuto = useRef(false);
  // Új párbeszédablak nyílásakor a korábbi bezárás függőben lévő fókusz-visszaadása érvényét veszti.
  const dialogOpen = open !== null || summaryOpen;
  useEffect(() => { if (dialogOpen) cancelReturnFocus(); }, [dialogOpen]);
  const volatileDevice = useMemo(() => adventDevice().volatile, []);

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // A figyelmeztetés generációja: a „Folytatom vendégként” csak erre hat (egy azóta eltárolt új linket nem töröl — PR-C 2. vak L4).
  const warnedGeneration = useRef<number | null>(null);
  useEffect(() => {
    if (state?.pairing === "invalid") { markPairingLost(); setMustChoose(true); warnedGeneration.current = generation; }
    // Az aktuális generáció igazolt párosítása (új, érvényes link másik lapon) feloldja a régi tiltást (PR-C 2. vak L4).
    if (pairingRecovered({ pairing: state?.pairing, mustChoose: mustChooseRef.current })) {
      clearPairingLost();
      mustChooseRef.current = false;
      setMustChoose(false);
    }
  }, [state?.pairing, generation]);

  // Alanyváltáskor (PR-C vak L3: más tanuló / játékos / vendég) a korábbi alany nyitott kérdése és összesítése bezárul. (A még meg nem
  // erősített évfolyamválasztás a gyereké marad: „Folytatom vendégként” után ugyanazzal folytathatja — A53.)
  const shownGeneration = useRef(generation);
  useEffect(() => {
    if (shownGeneration.current === generation) return;
    shownGeneration.current = generation;
    setOpen(null);
    setSummaryOpen(false);
    // A régi alany függő műveletei már nem írnak a nézetbe (L1): a jelzőik itt állnak vissza.
    setBusy(false);
    setOpeningDay(null);
    setWaiting(false);
    setError(null);
    setFailedWrite(null);
    setSaving(false);
  }, [generation]);

  // A karácsonyfa csillaga a 24. ablak megoldását követi (A43, PR-C vak L8), nem a pontszámot; a felgyulladáskor egyszer felfénylik.
  const star24Solved = state?.doors[23]?.state === "solved";
  const stateLoaded = state != null;
  const starWasLit = useRef<boolean | null>(null);
  const [starFlash, setStarFlash] = useState(false);
  useEffect(() => {
    if (!stateLoaded) return;
    const previous = starWasLit.current;
    starWasLit.current = star24Solved;
    if (previous !== false || !star24Solved) return;
    setStarFlash(true);
    const timer = window.setTimeout(() => setStarFlash(false), STAR_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [stateLoaded, star24Solved]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const say = useCallback((text: string) => setNotice((prev) => ({ text, n: (prev?.n ?? 0) + 1 })), []);

  useEffect(() => {
    setOpeningSlow(false);
    if (openingDay === null) return;
    const timer = window.setTimeout(() => setOpeningSlow(true), OPENING_TEXT_MS);
    return () => window.clearTimeout(timer);
  }, [openingDay]);

  // Élesítés: új (még meg nem válaszolt) kérdésnél a válaszok csak rövid idő után fogadnak bemenetet.
  const pendingQuestion = open && !open.result ? open.question.id : null;
  useEffect(() => {
    setArmed(false);
    if (!pendingQuestion) return;
    const timer = window.setTimeout(() => setArmed(true), ADVENT_ARM_MS);
    return () => window.clearTimeout(timer);
  }, [pendingQuestion]);

  // A visszajelzés után a „Tovább” kapja a fókuszt — így fekvő telefonon is a nézetbe gördül.
  const answeredNow = open?.result && !open.readOnly ? open.question.id : null;
  useEffect(() => { if (answeredNow) nextRef.current?.focus(); }, [answeredNow]);

  // Az írás eredménye csak a kérés indításakori alany-generációra kerül a gyorsítótárba (PR-C vak L3), és a függő régebbi olvasás nem
  // írhatja felül (PR-C 2. vak L2).
  const setState = useCallback((generation: number, next: AdventState) => applyAdventWrite(queryClient, generation, () => next, mode), [queryClient, mode]);
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ADVENT_STATE_KEY }), [queryClient]);

  /**
   * Minden író belépő szinkron őre (A53, PR-C vak L6): az aktuális állapot érvénytelen párosítása, a munkameneti jelző (a tokent
   * közben más törölhette) és a választási kényszer — a renderelt értéktől függetlenül. Tiltásnál a választás azonnal megjelenik.
   */
  const writeBlocked = useCallback((): boolean => {
    const current = queryClient.getQueryData<AdventState | null>(adventStateKey(adventSubjectGeneration(), mode));
    const blocked = adventWriteBlocked({ mustChoose: mustChooseRef.current, lost: isPairingLost(), pairing: current?.pairing });
    if (blocked && !mustChooseRef.current) {
      if (current?.pairing === "invalid") markPairingLost();
      mustChooseRef.current = true;
      setMustChoose(true);
    }
    return blocked;
  }, [queryClient, mode]);

  const openDoor = useCallback(async (day: number, opener: HTMLElement | null, repair = false) => {
    if (writeBlocked()) { say(CHOOSE_FIRST_TEXT); return; }
    const started = generation;
    questionOpener.current = opener;
    setError(null);
    setFailedWrite(null);
    setBusy(true);
    setOpeningDay(day);
    try {
      const res = await patient(() => adventApi.open(day), started);
      if (!isCurrent(started)) return;
      if (!res.question) { say("Ez a kérdés már nem érhető el, de az eredményed megmaradt."); return; }
      if (!muted) sfxClick();
      setOpen({ day, question: res.question, result: res.answered, readOnly: res.answered !== null, repair, picked: res.answered ? res.answered.pick : null });
      return true;
    } catch (e) {
      if (!isCurrent(started)) return;
      setError(adventErrorText(e, "Most nem sikerült kinyitni az ablakot. Próbáld meg újra!"));
      void refresh();
      // A hívó (a főoldalról indított automatikus nyitás) ebből tudja, hogy a szándék még nem teljesült (PR-C 3. vak L3).
      return false;
    } finally {
      if (isCurrent(started)) { setBusy(false); setOpeningDay(null); }
    }
  }, [muted, patient, refresh, say, writeBlocked, generation]);

  const onDoor = (door: AdventDoorView, el: HTMLButtonElement, tap: { detail: number; clientX: number; clientY: number }) => {
    if (performance.now() < gridGuardUntil.current && guardSwallows(gridGuardPoint.current, { pointer: tap.detail > 0, x: tap.clientX, y: tap.clientY }, el === questionOpener.current)) {
      // Az elnyelt (a „Tovább” második) koppintás a fókuszt sem viszi a mögöttes ablakra: az a megnyitón marad (S4, S5).
      if (questionOpener.current?.isConnected && document.activeElement !== questionOpener.current) questionOpener.current.focus();
      return;
    }
    if (writeBlocked()) { say(CHOOSE_FIRST_TEXT); return; }
    if (door.state === "locked") { say(`${articleFor(door.day) === "az" ? "Az" : "A"} ${door.day}. ablak december ${door.day}${daySuffix(door.day)} nyílik.`); return; }
    if (busy) { say("Egy pillanat — még nyílik az előző ablak."); return; }
    void openDoor(door.day, el, door.state === "repairable");
  };

  const answer = async (pick: number) => {
    if (!open || open.result || busy || !armed) return;
    if (writeBlocked()) { say(CHOOSE_FIRST_TEXT); return; }
    const { day, question } = open;
    const started = generation;
    setBusy(true);
    setError(null);
    try {
      const result = await patient(() => adventApi.answer(day, question.id, pick), started);
      // Ha a gyerek közben bezárta a kérdést, az eredmény megérkezése nem nyitja újra. A jelölés a RÖGZÍTETT választ mutatja
      // (másik lapon / eszközön már megválaszolt kérdésnél az nem a mostani koppintás).
      if (adventSubjectGeneration() !== started) return;
      setOpen((current) => (current && current.day === day && current.question.id === question.id ? { ...current, result, picked: result.pick } : current));
      if (result.correct && result.recorded && !muted) sfxSuccess();
      // Az állapot a válasz eredményéből helyben frissül — nem megy utána külön olvasás (osztálynyi terhelésnél ez számít).
      // A teljes ablaklista az összesítéssel együtt (élesítés előtti L6: a másik eszközön megoldott ablak is világít); a függő régebbi
      // olvasás megszakad, és nem írja vissza a régi állást (PR-C 2. vak L2).
      await applyAdventWrite(queryClient, started, (latest) => {
        const current = (latest ?? queryClient.getQueryData<AdventState | null>(adventStateKey(started, mode))) as AdventState | null;
        return current ? applyAnswerResult(current, result) : null;
      }, mode);
    } catch (e) {
      if (!isCurrent(started)) return;
      setError(adventErrorText(e, "Most nem sikerült elküldeni a válaszodat. Próbáld meg újra — nem veszett el semmi!"));
      // 409: a kérdés már nem aktuális (pl. másik eszközön megválaszolták) — a régi kérdés bezárul, az állapot frissül.
      if ((e as { status?: unknown } | null)?.status === 409) setOpen(null);
      await refresh();
    } finally {
      if (isCurrent(started)) setBusy(false);
    }
  };

  const closeQuestion = (point: GuardPoint | null = null) => {
    const finished = open?.result && (open.result.closing.kind === "gift" || open.result.summary.answered === open.result.summary.total);
    gridGuardUntil.current = performance.now() + GRID_GUARD_MS;
    gridGuardPoint.current = point;
    setGuarded(true);
    setOpen(null);
    setError(null);
    // Az összesítés a kérdés-ablak TELJES bezárása után nyílik (a kérdés-ablak onCloseAutoFocus eseményéből): ha ugyanabban az ütemben
    // nyílna, amikor a kérdés-ablak még záródik, az Escape a záródó réteghez kerülhetne, és az összesítés nyitva maradna.
    if (finished && !open?.readOnly) { summaryOpener.current = questionOpener.current; handoffToSummary.current = true; }
  };

  const openSummary = (opener: HTMLElement | null) => { summaryOpener.current = opener; setSummaryOpen(true); };

  const confirmGrade = async () => {
    if (pendingGrade === null) return;
    if (writeBlocked()) { say(CHOOSE_FIRST_TEXT); return; }
    const started = generation;
    setBusy(true);
    setError(null);
    try { await setState(started, await patient(() => adventApi.grade(pendingGrade), started)); if (isCurrent(started)) { setPendingGrade(null); setChangingGrade(false); } }
    catch (e) { if (isCurrent(started)) setError(adventErrorText(e, "Most nem sikerült menteni az évfolyamot. Próbáld meg újra!")); }
    finally { if (isCurrent(started)) setBusy(false); }
  };

  const newRound = async () => {
    if (writeBlocked()) { say(CHOOSE_FIRST_TEXT); return; }
    const started = generation;
    setBusy(true);
    setError(null);
    try { await setState(started, await patient(() => adventApi.round(), started)); if (isCurrent(started)) setSummaryOpen(false); }
    catch (e) { if (isCurrent(started)) setError(adventErrorText(e, "Most nem sikerült új naptárat kérni. Próbáld meg újra!")); }
    finally { if (isCurrent(started)) setBusy(false); }
  };

  /** „Előnézet törlése” (S6): az admin saját előnézeti sora törlődik, utána friss (évfolyamot kérő) előnézet töltődik. */
  const resetPreview = async () => {
    const started = generation;
    setBusy(true);
    setError(null);
    setOpen(null);
    setSummaryOpen(false);
    try { await adventApi.resetPreview(); }
    catch (e) { if (isCurrent(started)) setError(adventErrorText(e, "Most nem sikerült törölni az előnézetet. Próbáld meg újra!")); }
    finally {
      if (isCurrent(started)) { setBusy(false); setPendingGrade(null); setChangingGrade(false); }
      await refresh();
    }
  };

  const continueAsGuest = () => {
    // Csak a figyelmeztetés generációjának (lejárt) tokenjét felejti el — egy azóta (másik lapon) eltárolt új linket nem (L4).
    if (adventSubjectGeneration() === warnedGeneration.current) forgetLearnerPairing();
    clearPairingLost();
    mustChooseRef.current = false;
    setMustChoose(false);
    setError(null);
    void refresh();
  };

  // `?nyit=ma`: a főoldali kártyáról érkezve egyszer megnyitja a soron következő ablakot (ha előbb évfolyamot kell
  // választani, akkor közvetlenül utána) — végigjátszott körnél az összesítést —, a paramétert pedig azonnal eltávolítja.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("nyit") !== "ma") return;
    wantsAuto.current = true;
    url.searchParams.delete("nyit");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);
  /**
   * A főoldalról indított nyitás végrehajtása egy (friss) állapotból. A szándékot csak a siker vagy a szándékos megszakítás fogyasztja
   * el: átmeneti hibánál (pl. 503) „auto-open” jelölés marad, és az „Újra” friss állapotból folytatja a kérdésnyitást (PR-C 3. vak L3).
   */
  const autoOpen = useCallback(async (current: AdventState) => {
    const day = nextDoorToOpen(current);
    // A megnyitó a soron következő ablak gombja: bezárás után oda tér vissza a fókusz, nem a lap aljára (vak ellenőr KICSI-3).
    const opener = day !== null ? document.querySelector<HTMLElement>(`[data-testid="advent-door-${day}"]`) : null;
    if (day !== null) {
      const started = adventSubjectGeneration();
      const ok = await openDoor(day, opener, current.doors[day - 1]?.state === "repairable");
      if (ok === false && isCurrent(started)) setFailedWrite("auto-open");
    } else if (roundIsOver(current)) setSummaryOpen(true);
  }, [openDoor]);
  useEffect(() => {
    // Lejárt párosításnál a szándék MEGMARAD a gyerek döntéséig (PR-C vak L6): az őr szinkron, a renderelt értéktől függetlenül.
    if (!state || !wantsAuto.current || state.needsGrade || writeBlocked()) return;
    wantsAuto.current = false;
    void autoOpen(state);
  }, [state, autoOpen, mustChoose, writeBlocked]);
  /** Az automatikus nyitás újrapróbája: előbb friss állapot (az ablak állapota közben változhatott), utána a nyitás abból (L3). */
  const retryAutoOpen = async () => {
    const started = adventSubjectGeneration();
    const fresh = await refetch();
    if (!isCurrent(started)) return;
    if (fresh.isError || !fresh.data) {
      setError("Most nem sikerült elérni a naptárat. Próbáld meg újra!");
      setFailedWrite("auto-open");
      return;
    }
    // Évfolyamválasztás vagy lejárt link miatt még nem nyitható: a szándék megmarad, a fenti őr a gyerek döntése után folytatja.
    if (fresh.data.needsGrade || writeBlocked()) { wantsAuto.current = true; return; }
    void autoOpen(fresh.data);
  };

  // A függő átvétel kifejezett mentése a megtekintési útról (PR-C vak L2): az összesítés megnyitásakor, vagy végigjátszott körnél (akkor
  // nincs más író kérés). A GET mellékhatás nélkül marad; az átvétel idempotens, CSRF-védett POST.
  const adopting = useRef(false);
  /**
   * Az átvétel (tényleges, az aktuális alanyhoz kötött POST /adopt). Hibánál az „Újra” EZT indítja újra (PR-C 3. vak L2), és az
   * igazolt mentésig látható a függő állapot (`advent-saving`, illetve a hibasáv) — a hiba eltűnése nem tűnhet sikernek.
   */
  const runAdopt = useCallback(async () => {
    if (adopting.current || writeBlocked()) return;
    adopting.current = true;
    const started = adventSubjectGeneration();
    setSaving(true);
    try {
      await setState(started, await adventApi.adopt());
    } catch (e) {
      if (isCurrent(started)) { setError(adventErrorText(e, "Most nem sikerült elmenteni az eredményedet. Próbáld meg újra!")); setFailedWrite("adopt"); }
    } finally {
      adopting.current = false;
      if (isCurrent(started)) setSaving(false);
    }
  }, [writeBlocked, setState]);
  useEffect(() => {
    if (!state || adopting.current) return;
    if (!shouldAdopt(state, { summaryOpen, roundOver: roundIsOver(state), blocked: writeBlocked() })) return;
    void runAdopt();
  }, [state, summaryOpen, generation, writeBlocked, runAdopt]);

  /** Az „Újra”: a meghiúsult írást indítja újra (átvétel / automatikus nyitás), különben friss állapotot olvas (L2, L3). */
  const retryFailed = () => {
    const failed = failedWrite;
    setError(null);
    setFailedWrite(null);
    if (failed === "adopt") { void runAdopt(); return; }
    if (failed === "auto-open") { void retryAutoOpen(); return; }
    void refresh();
  };

  if (isLoading) return <Shell><p className="advent-message" role="status">Betöltjük a naptárat…</p></Shell>;
  // Sérült mentés: célzott, gondozóhoz irányító üzenet újrapróba nélkül — ugyanarra a sorra az „Újra” sem segítene (PR-C vak L7).
  if (isError && (loadError as { corrupt?: unknown } | null)?.corrupt === true) {
    return (
      <Shell>
        <div className="advent-message" role="alert" data-testid="advent-corrupt">
          <p>{CORRUPT_TEXT}</p>
          <BackHome />
        </div>
      </Shell>
    );
  }
  // Hibaoldal CSAK akkor, ha nincs mit mutatni: megtartott állapot mellett a hiba sávként jelenik meg (lent).
  if (isError && !state) {
    return (
      <Shell>
        <div className="advent-message" role="alert" data-testid="advent-load-error">
          <p>Most nem sikerült elérni a naptárat. Lehet, hogy sokan nyitják egyszerre — próbáld meg újra!</p>
          <button type="button" className="advent-btn advent-btn--primary" data-testid="advent-error-retry" onClick={() => void refetch()}>Újra</button>
          <BackHome />
        </div>
      </Shell>
    );
  }
  if (!state) return <Shell><div className="advent-message"><p>A naptár most nem érhető el.</p><BackHome /></div></Shell>;
  if (state.phase === "before") return (
    <Shell>
      {/* Admin-előnézet (A16, S6): a szezon előtti fázisban is jelöljük, hogy előnézetben vagyunk (Thread 5). */}
      {state.identity === "preview" ? <PreviewBanner state={state} busy={busy} onReset={() => void resetPreview()} /> : null}
      <div className="advent-message"><p>Még nincs itt az advent — gyere vissza december 1-jén!</p><BackHome /></div>
    </Shell>
  );
  if (state.phase === "teaser") {
    return (
      <Shell>
        {state.identity === "preview" ? <PreviewBanner state={state} busy={busy} onReset={() => void resetPreview()} /> : null}
        <div className="advent-message" data-testid="advent-teaser">
          <h2>Hamarosan!</h2>
          <p>{state.closing.text}</p>
          <p>Még {state.daysUntilStart} nap.</p>
          <BackHome />
        </div>
      </Shell>
    );
  }

  const doorsByDay = new Map(state.doors.map((d) => [d.day, d]));
  const paused = hidden || open !== null || summaryOpen;
  const closed = state.phase === "closed";
  const repairTarget = closed ? undefined : state.doors.find((d) => d.state === "repairable");
  // Az évfolyam az ELSŐ válaszig módosítható (a szerver addig elfogadja); tanulónál a profilból jön.
  const everAnswered = state.round > 1 || state.doors.some((d) => d.state === "solved" || d.state === "repairable" || d.state === "failed");
  const gradeChangeable = !closed && state.identity !== "learner" && state.grade !== null && !everAnswered && !mustChoose;
  const pickingGrade = !closed && (state.needsGrade || changingGrade);
  const showOpening = openingDay !== null && openingSlow && !waiting;
  const starLit = state.doors[23]?.state === "solved";

  return (
    <Shell paused={paused} snow>
      <AdventArt id="advent-garland" className="advent-garland" decorative />
      <header className="advent-hud" data-game-hud>
        <Link href="/" className="advent-icon-btn" aria-label="Vissza a főoldalra"><ArrowLeft aria-hidden="true" /></Link>
        <div className="advent-hud__title">
          <h1>
            {/* Csak a cím szövege csonkolódhat; a csillag önálló, nem zsugorodó helyen áll (PR-C 2. vak L5). */}
            <span className="advent-hud__name">Adventi naptár</span>
            {/* A karácsonyfa csillaga: a 24. ablak megoldásakor gyullad fel (A43); díszítés, a haladást a felirat mondja ki. */}
            <span className="advent-tree-star" data-testid="advent-tree-star" data-lit={starLit ? "true" : "false"} data-flash={starFlash ? "true" : undefined} aria-hidden="true">★</span>
          </h1>
          <p data-testid="advent-progress">{state.summary.solved} / {state.summary.total} világít{state.round > 1 ? ` · ${state.round}. kör` : ""}</p>
        </div>
        <button ref={summaryButton} type="button" className="advent-btn advent-btn--ghost" data-testid="advent-summary-open" onClick={(e) => openSummary(e.currentTarget)}>Összesítés</button>
        <button
          type="button" className="advent-icon-btn" data-testid="advent-sound-toggle"
          aria-label={muted ? "Hang bekapcsolása" : "Hang kikapcsolása"} onClick={() => setMuted(toggleMuted())}
        >
          {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        </button>
      </header>

      {mustChoose ? (
        <div className="advent-banner" role="alert" data-testid="advent-pairing-invalid">
          <span>{PAIRING_TEXT}</span>
          <button type="button" className="advent-btn advent-btn--primary" data-testid="advent-continue-guest" onClick={continueAsGuest}>Folytatom vendégként</button>
        </div>
      ) : null}
      {/* Admin-előnézet (A16, S6): a megadott nap szerinti naptár a saját előnézeti soron — levél nem megy ki róla. */}
      {state.identity === "preview" ? <PreviewBanner state={state} busy={busy} onReset={() => void resetPreview()} /> : null}
      {volatileDevice ? <p className="advent-banner" role="status">Ezen az eszközön nem tudjuk megjegyezni a naptáradat.</p> : null}
      {closed ? <p className="advent-banner" role="status" data-testid="advent-closed">{state.closing.text}</p> : null}
      {state.closing.kind === "gift" ? (
        <button type="button" className="advent-gift-banner" data-testid="advent-gift-banner" onClick={(e) => openSummary(e.currentTarget)}>{state.closing.text}</button>
      ) : null}
      {gradeChangeable && !pickingGrade ? (
        <div className="advent-banner" data-testid="advent-grade-info">
          <span>{state.grade}. osztályos kérdéseket kapsz.</span>
          <button type="button" className="advent-btn advent-btn--ghost" data-testid="advent-grade-change" disabled={busy} onClick={() => { setPendingGrade(null); setChangingGrade(true); }}>Nem ez az évfolyamom</button>
        </div>
      ) : null}
      {isError ? (
        <div className="advent-banner" role="status" data-testid="advent-stale">
          <span>Most nem érjük el a naptárat — amit látsz, az a legutóbbi állapot.</span>
          <button type="button" className="advent-btn advent-btn--ghost" data-testid="advent-stale-retry" onClick={() => void refetch()}>Újra</button>
        </div>
      ) : null}
      {/* A hiba EGY helyen jelenik meg: nyitott kérdésnél a párbeszédablakban, különben itt. */}
      {error && !mustChoose && open === null ? (
        <div className="advent-banner advent-banner--error" role="alert" data-testid="advent-error">
          <span>{error}</span>
          <button type="button" className="advent-btn advent-btn--ghost" data-testid="advent-error-retry" onClick={retryFailed}>Újra</button>
        </div>
      ) : null}

      {pickingGrade ? (
        <section className="advent-grade" data-testid="advent-grade-picker" aria-labelledby="advent-grade-title">
          {pendingGrade === null ? (
            <>
              <h2 id="advent-grade-title">Hányadikos vagy?</h2>
              <div className="advent-grade__grid">
                {GRADES.map((grade) => (
                  <button key={grade} type="button" className="advent-btn" data-testid={`advent-grade-${grade}`} disabled={busy} aria-pressed={state.grade === grade} onClick={() => setPendingGrade(grade)}>
                    {grade}.
                  </button>
                ))}
              </div>
              {changingGrade ? <button type="button" className="advent-btn advent-btn--ghost" data-testid="advent-grade-cancel" onClick={() => setChangingGrade(false)}>Mégsem</button> : null}
            </>
          ) : (
            <div data-testid="advent-grade-confirm">
              <h2 id="advent-grade-title">{pendingGrade}. osztály — jó így?</h2>
              <p className="advent-grade__hint">Ilyen kérdéseket kapsz majd. Az első válaszodig még módosíthatod.</p>
              <div className="advent-grade__actions">
                <button type="button" className="advent-btn advent-btn--primary" data-testid="advent-grade-yes" disabled={busy} onClick={() => void confirmGrade()}>Igen, {pendingGrade}. osztály</button>
                <button type="button" className="advent-btn advent-btn--ghost" data-testid="advent-grade-no" disabled={busy} onClick={() => setPendingGrade(null)}>Másik évfolyam</button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <ol className="advent-grid" data-testid="advent-grid" aria-label="A naptár 24 ablaka" data-busy={busy ? "true" : "false"} data-guard={guarded ? "true" : "false"} aria-busy={busy}>
          {state.layout.map((day) => {
            const door = doorsByDay.get(day);
            // Védőháló (PR-C 3. vak L4): a szerver sorőre a rácsot az 1…24 permutációjára szűri; ismeretlen napot nem rajzolunk.
            if (!door) return null;
            const shown = shownState(door, closed);
            const opening = openingDay === day;
            return (
              <li key={day}>
                <button
                  type="button" className="advent-door" data-testid={`advent-door-${day}`} data-state={shown} data-opening={opening ? "true" : undefined}
                  aria-label={opening ? `${day}. ablak — nyílik…` : doorLabel(door, closed)} aria-busy={opening || undefined}
                  aria-disabled={shown === "locked" || closed || (busy && !opening) ? "true" : undefined}
                  onClick={(e) => { if (closed) return; onDoor(door, e.currentTarget, e); }}
                >
                  {shown === "solved" ? <AdventArt id={doorArtId(day)} className="advent-door__art" decorative /> : null}
                  <span className="advent-door__num">{day}</span>
                  <span className="advent-door__mark" aria-hidden="true">
                    {opening ? <Hourglass className="advent-door__spinner" /> : shown === "locked" ? <Lock /> : shown === "solved" ? <Check /> : shown === "repairable" ? <Wrench /> : shown === "failed" ? <X /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {repairTarget && !pickingGrade && !mustChoose ? (
        <button type="button" className="advent-btn advent-repair" data-testid="advent-repair" disabled={busy} onClick={(e) => void openDoor(repairTarget.day, e.currentTarget, true)}>
          Javítom {articleFor(repairTarget.day)} {repairTarget.day}. ablakot
        </button>
      ) : null}

      {/* Rövid állapotüzenetek a lap alján, a rács eltolása nélkül: várakozás, lassú nyitás, zárt ablak. */}
      <div className="advent-toasts" aria-live="polite">
        {waiting && open === null ? <p className="advent-toast" role="status" data-testid="advent-busy">{ADVENT_BUSY_WAITING_TEXT}</p> : null}
        {saving ? <p className="advent-toast" role="status" data-testid="advent-saving">Mentjük az eredményedet… egy pillanat!</p> : null}
        {showOpening ? <p className="advent-toast" role="status" data-testid="advent-opening">Nyitjuk {articleFor(openingDay)} {openingDay}. ablakot… egy pillanat!</p> : null}
        {notice ? <p key={notice.n} className="advent-toast" role="status" data-testid="advent-notice">{notice.text}</p> : null}
      </div>

      <Dialog.Root open={open !== null} onOpenChange={(next) => { if (!next) closeQuestion(); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="advent-overlay" />
          <Dialog.Content
            className="advent-dialog" data-testid="advent-dialog" aria-describedby="advent-question-text"
            // A fókusz a KÉRDÉSRE kerül (nem az első válaszra): a képernyőolvasó felolvassa, és egy második Enter nem válaszol.
            onOpenAutoFocus={(event) => { event.preventDefault(); questionRef.current?.focus(); }}
            onCloseAutoFocus={(event) => { event.preventDefault(); if (handoffToSummary.current) { handoffToSummary.current = false; setSummaryOpen(true); return; } returnFocus(questionOpener.current); }}
            onKeyDown={(event) => { if (escapeMissedByLayer(event)) closeQuestion(); }}
          >
            {open ? (
              <>
                <AdventArt id="advent-frame" className="advent-dialog__frame" decorative />
                <Dialog.Title className="advent-dialog__title">
                  {open.repair ? "Javítás — " : ""}{open.day}. ablak · {SUBJECT_LABEL[open.question.subject] ?? "Kérdés"}
                </Dialog.Title>
                <p id="advent-question-text" ref={questionRef} tabIndex={-1} className="advent-question" data-testid="advent-question">{open.question.prompt}</p>
                <div className="advent-options" role="group" aria-label="Válaszlehetőségek" data-armed={armed || open.result !== null ? "true" : "false"}>
                  {open.question.options.map((option, index) => {
                    const mark = !open.result ? undefined : index === open.result.correctIndex ? "correct" : index === open.picked && !open.result.correct ? "wrong" : undefined;
                    return (
                      <button
                        key={index} type="button" className="advent-option" data-testid={`advent-option-${index}`} data-mark={mark}
                        disabled={busy || open.result !== null} aria-busy={busy} aria-disabled={!armed && open.result === null ? "true" : undefined}
                        onClick={() => void answer(index)}
                      >
                        {mark === "correct" ? <Check aria-hidden="true" /> : mark === "wrong" ? <X aria-hidden="true" /> : null}
                        <span>{option}</span>
                        {mark === "wrong" ? <span className="advent-sr"> — ezt választottad</span> : null}
                      </button>
                    );
                  })}
                </div>
                <div className="advent-feedback" data-testid="advent-feedback" aria-live="polite">
                  {open.result ? (
                    <>
                      {/* Már korábban (másik lapon / eszközön) megválaszolt kérdés: a TÁROLT eredményt mondjuk ki, nem a mostani koppintást. */}
                      {!open.result.recorded ? <p data-testid="advent-already-answered">Ezt a kérdést már megválaszoltad — ez lett az eredménye:</p> : null}
                      <p className="advent-feedback__verdict" data-correct={open.result.correct ? "true" : "false"}>
                        {open.result.correct ? "Ügyes vagy — ez az ablak már világít!" : open.result.recorded ? "Most nem sikerült — nézd meg a helyes választ." : "Akkor nem sikerült — nézd meg a helyes választ."}
                      </p>
                      {/* correctIndex -1: a kérdés időközben kikerült a bankból — az eredmény megvan, a helyes válasz szövege nincs. */}
                      {open.result.correctIndex >= 0 ? <p data-testid="advent-correct-answer">A helyes válasz: <strong>{open.question.options[open.result.correctIndex]}</strong></p> : null}
                      {open.result.explanation ? <p>{open.result.explanation}</p> : null}
                      {!open.result.correct && open.result.door.state === "repairable" ? <p>Ezt az ablakot egy új kérdéssel kijavíthatod.</p> : null}
                    </>
                  ) : busy && !waiting ? <p data-testid="advent-sending">Küldjük a válaszodat…</p> : null}
                </div>
                {waiting ? <p className="advent-banner" role="status" data-testid="advent-busy">{ADVENT_BUSY_WAITING_TEXT}</p> : null}
                {error ? <p className="advent-banner advent-banner--error" role="alert" data-testid="advent-error">{error}</p> : null}
                {open.result ? (
                  <button ref={nextRef} type="button" className="advent-btn advent-btn--primary" data-testid="advent-next" onClick={(e) => closeQuestion(e.detail > 0 ? { x: e.clientX, y: e.clientY } : null)}>Tovább</button>
                ) : (
                  <Dialog.Close asChild><button type="button" className="advent-btn advent-btn--ghost">Bezárás</button></Dialog.Close>
                )}
              </>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={summaryOpen && open === null} onOpenChange={setSummaryOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="advent-overlay" />
          <Dialog.Content
            className="advent-dialog advent-summary" data-testid="advent-summary" data-kind={state.closing.kind} aria-describedby={undefined}
            onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus(summaryOpener.current?.isConnected ? summaryOpener.current : summaryButton.current); }}
            onKeyDown={(event) => { if (escapeMissedByLayer(event)) setSummaryOpen(false); }}
          >
            <AdventArt id="advent-frame" className="advent-dialog__frame" decorative />
            <Dialog.Title className="advent-dialog__title">Összesítés</Dialog.Title>
            {state.closing.kind === "gift" ? (
              <>
                <AdventArt id="advent-closing" className="advent-summary__art" />
                <p className="advent-gift" data-testid="advent-gift-message" data-star="lit">{state.closing.text}</p>
              </>
            ) : (
              <p className="advent-encourage" data-testid="advent-encourage">{state.closing.text}</p>
            )}
            <ul className="advent-summary__stats">
              <li><strong>{state.summary.solved} / {state.summary.total}</strong> ablak világít ({state.summary.percent}%)</li>
              <li>Elsőre jó: <strong>{state.summary.firstTry} / {state.summary.total}</strong></li>
              <li data-testid="advent-summary-date">{adventDateLabel(state.today)}{state.firstName ? ` · ${state.firstName}` : ""}{state.grade ? ` · ${state.grade}. osztály` : ""}</li>
              {state.grade !== null && state.identity !== "learner" && everAnswered ? (
                <li className="advent-summary__hint" data-testid="advent-grade-locked">Az évfolyamot az első válaszod óta már nem lehet módosítani — így marad igazságos a naptár.</li>
              ) : null}
            </ul>
            {state.closing.kind === "repair" && repairTarget ? (
              <button type="button" className="advent-btn advent-btn--primary" data-testid="advent-repair-from-summary" disabled={busy} onClick={() => { setSummaryOpen(false); void openDoor(repairTarget.day, summaryOpener.current ?? summaryButton.current, true); }}>Javítom</button>
            ) : null}
            {state.closing.kind === "new-round" && !closed ? (
              <button type="button" className="advent-btn advent-btn--primary" data-testid="advent-new-round" disabled={busy} onClick={() => void newRound()}>Új naptárat kérek</button>
            ) : null}
            {error ? <p className="advent-banner advent-banner--error" role="alert">{error}</p> : null}
            {/* Az átvétel hibája az aktív modálban is újrapróbálható, és a mentésig itt is látszik a függő állapot (S5/S6 1. vak L3). */}
            {failedWrite === "adopt" && !saving ? (
              <button type="button" className="advent-btn advent-btn--primary" data-testid="advent-summary-retry" onClick={retryFailed}>Újra — mentsük el az eredményemet</button>
            ) : null}
            {saving ? <p className="advent-banner" role="status" data-testid="advent-summary-saving">Mentjük az eredményedet… egy pillanat!</p> : null}
            <Dialog.Close asChild><button type="button" className="advent-btn advent-btn--ghost" data-testid="advent-summary-close">Bezárás</button></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Shell>
  );
}

/**
 * Fókusz-visszaadás a párbeszédablak bezárása után: azonnal, majd ha a könyvtár saját takarítása közben a fókusz a lap aljára (body)
 * esett, néhány rövid, korlátos időzítővel újra (0–200 ms; nem képkocka-hurok, A31; nyitott párbeszédablakban nem) — így a fókusz
 * megbízhatóan a megnyitó elemre kerül, akkor is, ha a takarítás később fut, mint egyetlen időzítő. Ha a fókusz közben egy MÁSIK elemre
 * került (a gyerek / a billentyűzet szándékosan odavitte), az ismétlés NEM veszi vissza — különben elrántaná a fókuszt arról, amin a
 * gyerek éppen Entert nyom (mérés 2026-11-20: a „Javítom”-kérdés bezárása utáni ismétlés az „Összesítés” gombról a „Javítom”-ra
 * rántotta vissza a fókuszt, és az Enter az összesítés helyett a kérdést nyitotta).
 */
const RETURN_FOCUS_RETRIES_MS = [0, 16, 50, 100, 200];
/** A függőben lévő visszaadások generációja: új visszaadás vagy új párbeszédablak érvényteleníti a régieket (ne vigyék máshová a fókuszt). */
let returnFocusGeneration = 0;
function cancelReturnFocus(): void {
  returnFocusGeneration++;
}
function returnFocus(target: HTMLElement | null | undefined): void {
  const generation = ++returnFocusGeneration;
  target?.focus();
  for (const delay of RETURN_FOCUS_RETRIES_MS) {
    window.setTimeout(() => {
      if (generation !== returnFocusGeneration || !target?.isConnected) return;
      // Csak az ELVESZETT (a lap aljára esett) fókuszt adjuk vissza; nyitott párbeszédablakban nem nyúlunk hozzá.
      const active = document.activeElement;
      if ((!active || active === document.body) && !document.querySelector("[role=\"dialog\"], [role=\"alertdialog\"]")) target.focus();
    }, delay);
  }
}

/** Admin-előnézet jelölése (A16, S6): minden fázisban — a szezon előtti és teaser nézetnél is (Thread 5). */
function PreviewBanner({ state, busy, onReset }: { state: AdventState; busy: boolean; onReset: () => void }) {
  return (
    <div className="advent-banner advent-banner--preview" role="status" data-testid="advent-preview-banner">
      <span><strong>ELŐNÉZET</strong> — {adventDateLabel(state.today)} szerint; a válaszaid csak az előnézetben mentődnek, levél nem megy ki.</span>
      <button type="button" className="advent-btn advent-btn--ghost" data-testid="advent-preview-reset" disabled={busy} onClick={onReset}>Előnézet törlése</button>
    </div>
  );
}

function BackHome() {
  return <Link href="/" className="advent-btn advent-btn--ghost" data-testid="advent-back-home">Vissza a főoldalra</Link>;
}

function Shell({ children, paused = false, snow = false }: { children: ReactNode; paused?: boolean; snow?: boolean }) {
  // Csak az éppen látható tájolás háttere kerül a lapra (a rejtett képet a böngésző különben is letöltené — terv 13.3).
  const landscape = useLandscape();
  return (
    <main className="advent-page" data-testid="advent-page" data-paused={paused ? "true" : "false"}>
      <AdventArt id={landscape ? "advent-bg-landscape" : "advent-bg-portrait"} className="advent-bg" eager decorative />
      {snow ? <Snowfall paused={paused} /> : null}
      <div className="advent-content">{children}</div>
    </main>
  );
}
