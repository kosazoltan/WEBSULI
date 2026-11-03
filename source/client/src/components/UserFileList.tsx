import { useState, useMemo, useEffect, useRef, memo, type CSSProperties } from "react";
import { Search, FileCode, ShieldCheck, BookOpen, ArrowRight, Gamepad2, RefreshCw, Sparkles, Layers } from "lucide-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { curriculumSort, isCurrent, todayPosition, type CurriculumHint } from "@/lib/curriculum-order";
import { BAND_ICON } from "@/lib/band-icons";
import { coverIdFor, homeCardTheme } from "@shared/home-card-theme";
import LikeButton from "@/components/LikeButton";
import HeroSection from "@/components/HeroSection";
import SponsorBar from "@/components/SponsorBar";
import HomePracticeGames from "@/components/HomePracticeGames";
import WelcomeCard from "@/components/WelcomeCard";
import { displayTopic } from "@shared/daily-reminder";
import { useClassroomGrade } from "@/lib/classroomStore";
import { CLASSROOM_VALUES, getClassroomLabel } from "@shared/classrooms";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getFingerprint } from "@/lib/fingerprintCache";
import { useAuth } from "@/hooks/useAuth";
import { groupBySubject, HOME_VIEW_STORAGE_KEY, matchesHomeSearch, newestFirst, NEWEST_STRIP, parseHomeView, type HomeView } from "@/lib/home-views";

/** A /api/materials/likes/batch szerveroldali korlátja (server/lib/public-input.ts MAX_MATERIAL_ID_BATCH). */
export const LIKES_BATCH_LIMIT = 100;

interface HtmlFileApi {
  id: string;
  userId: string | null;
  title: string;
  content: string;
  description: string | null;
  classroom: number;
  createdAt: string;
  /** Tanmenet-rendezés (docs/specs/2026-10-17-tanmenet-rendezes.md): tanévbeli pozíció a NAT 2020 mintatanmenet szerint. */
  curriculum?: CurriculumHint;
  /** Spec 2026-11-03-fooldal-boritokartyak: a publikált lecke borítója (art.picture); hiányában a sáv hős-képe. */
  cover?: string | null;
  /** Spec 2026-11-03-fooldal-sebesseg: kész bélyegkép-URL (a build statikus, immutable fájlja; régi szervernél hiányzik). */
  coverThumb?: string;
  /** Spec 2026-11-03-fooldal-nezetek: tantárgy-kulcs a „Tantárgyanként” nézethez (null / régi szerver: „Egyéb”). */
  subject?: string | null;
}

interface UserFileListProps {
  files: HtmlFileApi[];
  isLoading: boolean;
  isError?: boolean;
  isRetrying?: boolean;
  onRetry?: () => void;
  /** Spec 2026-09-20: látható „Frissítés” gomb — mobilon nincs megbízható fókusz-esemény. */
  onRefresh?: () => void;
  onViewFile: (file: HtmlFileApi) => void;
  onToggleView?: () => void;
}

/**
 * Spec 2026-09-20: a lista beúszása CSS (`.list-enter`, fill-mode nélkül) — a nyugalmi állapot LÁTHATÓ.
 * Spec 2026-10-18-nyilvanos-oldal-sebesseg: kártyánként nincs JS-animáció (framer-motion); a hover-emelés CSS.
 */
function UserFileList({ files, isLoading, isError = false, isRetrying = false, onRetry, onRefresh, onViewFile, onToggleView }: UserFileListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  // Tulajdonosi jelzés 2026-10-18 (docs/specs/2026-10-18-tanulo-evfolyam-szuro.md): a tanuló évfolyamára szűrve nyílik —
  // különben a „Mind” nézet más évfolyamok mai anyagát tenné elé (egy ötödikesnek 4. osztályosat).
  const { grade: learnerGrade } = useClassroomGrade();
  // Spec 2026-11-03-udvozlo-jatekkartyak-szulo: az admin (szülő) mindig az összes tananyaggal nyit — a tanulóhoz párosított
  // eszközön is (az eszköz évfolyama a gyereké).
  const { isAdmin } = useAuth();
  const hasGrade = (g: number | null) => g != null && files.some((f) => (f.classroom ?? 1) === g);
  const [selectedClassroom, setSelectedClassroom] = useState<number | null>(() => (!isAdmin && hasGrade(learnerGrade) ? learnerGrade : null));
  // Csak az évfolyam változására (és az első betöltésre) vált — a lista frissítése nem írja felül a tanuló „Mind” választását.
  const appliedGrade = useRef<number | null | undefined | "admin">(undefined);
  useEffect(() => {
    if (isAdmin) {
      // Egyszer vált „Mind”-re (az auth betöltése után is); a szülő kézi évfolyamválasztását utána nem írja felül.
      if (appliedGrade.current !== "admin") {
        appliedGrade.current = "admin";
        setSelectedClassroom(null);
      }
      return;
    }
    if (appliedGrade.current === learnerGrade || files.length === 0) return;
    appliedGrade.current = learnerGrade;
    // Review #291: törölt évfolyamnál vagy anyag nélküli évfolyamnál „Mind” (nem ragad az előző szűrőn).
    setSelectedClassroom(learnerGrade != null && files.some((f) => (f.classroom ?? 1) === learnerGrade) ? learnerGrade : null);
  }, [learnerGrade, files, isAdmin]);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  // Spec 2026-11-03-fooldal-nezetek: „Legfrissebb” és „Tantárgyanként” — külön (VAGY) és együtt (ÉS); eszközönként megmarad.
  const [view, setView] = useState<HomeView>(() => {
    try {
      return parseHomeView(localStorage.getItem(HOME_VIEW_STORAGE_KEY));
    } catch {
      return parseHomeView(null);
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(HOME_VIEW_STORAGE_KEY, JSON.stringify(view));
    } catch {
      // privát mód / tiltott tárhely: a választás csak erre a megnyitásra szól
    }
  }, [view]);

  // Load fingerprint once on mount
  useEffect(() => {
    getFingerprint().then(setFingerprint).catch(() => setFingerprint("anonymous"));
  }, []);

  // Filter by search query AND selected classroom
  // Review #282: renderenként számolva — a nyitva hagyott lista a percenkénti frissítéssel a napváltást is követi.
  const today = todayPosition();
  const filteredFiles = useMemo(() => {
    const filtered = files
      .filter((file) => {
        // Cím, leírás és tantárgynév, ékezettől függetlenül (spec 2026-11-03-fooldal-nezetek).
        const matchesSearch = matchesHomeSearch(file, searchQuery);
        const matchesClassroom = selectedClassroom === null || file.classroom === selectedClassroom;
        return matchesSearch && matchesClassroom;
      });
    // Csak „Legfrissebb” nézetben a legújabb elkészült elöl (spec 2026-11-03-fooldal-nezetek); egyébként a mai tananyag elöl
    // (NAT 2020 mintatanmenet), a tanmenethez nem illeszthető anyag hátul, legújabb elöl.
    return view.newest && !view.bySubject ? newestFirst(filtered) : curriculumSort(filtered, today);
  }, [files, searchQuery, selectedClassroom, today, view.newest, view.bySubject]);

  const newestFiles = useMemo(() => newestFirst(filteredFiles), [filteredFiles]);
  const subjectGroups = useMemo(
    () => (view.bySubject ? groupBySubject(filteredFiles, (list) => (view.newest ? newestFirst(list) : curriculumSort(list, today))) : []),
    [filteredFiles, view.bySubject, view.newest, today],
  );

  // Batch fetch likes for all visible files
  const materialIds = useMemo(() => filteredFiles.map((f) => f.id), [filteredFiles]);

  const { data: batchLikesData, isLoading: batchLikesLoading } = useQuery<Record<string, { liked: boolean; totalLikes: number }>>({
    queryKey: ["/api/materials/likes/batch", [...materialIds].sort().join(","), fingerprint],
    queryFn: async () => {
      if (!fingerprint || materialIds.length === 0) return {};
      // Mérve élesben (2026-09-24): 186 tananyagnál a szerver 100-as kötegkorlátja miatt 86 kártya külön
      // /likes/check kérést küldött (átlag ~780 ms). A korláton belüli kötegekben, párhuzamosan kérdezünk.
      const chunks: string[][] = [];
      for (let i = 0; i < materialIds.length; i += LIKES_BATCH_LIMIT) chunks.push(materialIds.slice(i, i + LIKES_BATCH_LIMIT));
      const parts = await Promise.all(chunks.map((ids) => apiRequest<Record<string, { liked: boolean; totalLikes: number }>>("POST", "/api/materials/likes/batch", { materialIds: ids, fingerprint })));
      return Object.assign({}, ...parts.map((part) => (part && !Array.isArray(part) ? part : {})));
    },
    enabled: !!fingerprint && materialIds.length > 0,
    staleTime: 30000,
  });

  // Stats
  const totalFiles = files.length;
  const allClassrooms = new Set(files.map((f) => f.classroom ?? 1));
  const totalClassrooms = allClassrooms.size;
  const availableClassrooms = Array.from(allClassrooms).sort((a, b) => a - b);

  const gridClass = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3";
  // Spec 2026-11-03-fooldal-nezetek: a kártya minden nézetben ugyanaz (tartalom és data-testid változatlan).
  const renderCard = (file: HtmlFileApi) => {
    const classroom = file.classroom ?? 1;
    // Spec 2026-11-03-fooldal-boritokartyak: az évfolyamsáv színe, formája és ikonja; a kezdőkép bélyegképe és a cím.
    const theme = homeCardTheme(classroom);
    const BandIcon = BAND_ICON[theme.band];
    const style = {
      "--hc-accent": theme.accent, "--hc-strong": theme.strong, "--hc-strong-ink": theme.strongInk, "--hc-panel": theme.panel,
      "--hc-ink": theme.ink, "--hc-muted": theme.muted, "--hc-line": theme.line, "--hc-from": theme.from, "--hc-to": theme.to,
      "--hc-radius": `${theme.radius}px`,
    } as CSSProperties;

    return (
      // Spec 2026-10-18-nyilvanos-oldal-sebesseg: sima elem (nem framer-motion elem) — a hover-emelést CSS adja;
      // a képernyőn kívüli kártya nem renderelődik (content-visibility a kártyán: review #297 — a burkolón levágná az árnyékot és a hover-emelést).
      <div key={file.id}>
        <Card
          className="group cursor-pointer glass-card material-card-cell home-card h-full"
          data-band={theme.band}
          style={style}
          onClick={() => onViewFile(file)}
          data-testid={`link-file-${file.id}`}
        >
          <div className="home-card-media">
            <img
              src={file.coverThumb ?? `/api/design-assets/${coverIdFor(file.cover, classroom)}/thumb`}
              alt=""
              width={480}
              height={320}
              loading="lazy"
              decoding="async"
              onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
              // Review #381: egy korábbi hiba után a lista frissítése új borítót hozhat — a sikeres betöltés újra mutatja.
              onLoad={(e) => { e.currentTarget.style.visibility = ""; }}
              data-testid={`thumb-file-${file.id}`}
            />
            <span className="home-card-emblem" data-shape={theme.shape} title={theme.name} aria-hidden>
              <BandIcon className="w-4 h-4" />
            </span>
            <span className="home-card-grade">{getClassroomLabel(classroom, true)}</span>
          </div>
          <CardContent className="home-card-body">
            {isCurrent(file.curriculum, today) && (
              <span
                className="home-card-current"
                title={displayTopic(file.curriculum?.label) ?? undefined}
                data-testid={`badge-current-${file.id}`}
              >
                Most tanuljuk
              </span>
            )}
            <h3 className="home-card-title line-clamp-2">{file.title}</h3>
            <p className="home-card-desc line-clamp-2">{file.description || "Kattints a megtekintéshez"}</p>
            <div className="home-card-footer">
              <LikeButton
                materialId={file.id}
                initialLikeStatus={batchLikesData?.[file.id]}
                suppressCheck={batchLikesLoading}
                className="home-card-like"
              />
              <span className="home-card-go" aria-hidden>
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const connectionError = isError ? (
    <div role="alert" className="mx-auto max-w-xl rounded-xl border border-amber-300 bg-slate-950 p-6 text-center text-white">
      <h2 className="text-xl font-semibold">A tananyagokat most nem sikerült betölteni</h2>
      <p className="mt-3 text-slate-200">
        Átmeneti kapcsolati hiba történt. Ez nem jelenti azt, hogy a tananyagok eltűntek.
        {files.length > 0 && " A korábban betöltött listát továbbra is láthatod."}
      </p>
      {onRetry && (
        <Button onClick={onRetry} disabled={isRetrying} className="mt-4 min-h-11">
          {isRetrying ? "Újrapróbálás…" : "Újrapróbálom"}
        </Button>
      )}
    </div>
  ) : null;

  if (isLoading) {
    return (
      <div className="min-h-screen relative">
        <div className="container py-16 text-center relative z-10">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-muted/20 rounded mx-auto" />
            <div className="h-4 w-32 bg-muted/20 rounded mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="min-h-screen relative">
        <div className="container py-12 relative z-10">
          {onToggleView && (
            <div className="flex justify-end mb-6">
              <Button
                onClick={onToggleView}
                data-testid="button-toggle-admin-view"
                className="h-8 px-3 text-xs font-semibold gap-1 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white border border-rose-200/25 rounded-full shadow-lg"
              >
                <ShieldCheck className="w-4 h-4 mr-2" />
                Admin nézet
              </Button>
            </div>
          )}

          <div className="py-8">
            <div className="text-center mb-8">
              {connectionError || <Card className="max-w-md mx-auto">
                <CardContent className="pt-12 pb-12">
                  <FileCode className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Még nincsenek anyagok
                  </h3>
                  <p className="text-muted-foreground">
                    Hamarosan érkeznek az első tananyagok! Addig is gyakorolhatsz lent a kártyákkal.
                  </p>
                  <Link href="/games">
                    <Button variant="outline" className="mt-4 gap-2" data-testid="link-empty-games">
                      <Gamepad2 className="w-4 h-4" />
                      Összes játék és ranglista
                    </Button>
                  </Link>
                </CardContent>
              </Card>}
            </div>
            <HomePracticeGames />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      <div className="container py-3 relative z-10">
        {connectionError}
        {/* Hero Section */}
        <HeroSection
          totalFiles={totalFiles}
          totalClassrooms={totalClassrooms}
          showEmailSubscribe={true}
        />

        {/* Támogatók (docs/specs/2026-11-03-szponzor-fejlec.md) */}
        <SponsorBar />

        {/* Személyes üdvözlő ajánló (docs/specs/2026-10-18-nyilvanos-oldal-udvozlo.md) */}
        <WelcomeCard files={files} onViewFile={onViewFile} />

        {/* Classroom Filter */}
        <div className="mb-3">
          <div className="flex flex-wrap gap-1.5 justify-center items-center">
            <Button
              variant={selectedClassroom === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedClassroom(null)}
              aria-pressed={selectedClassroom === null}
              data-testid="button-filter-all"
              className={`h-7 px-3 text-xs font-semibold ${
                selectedClassroom === null
                  ? "bg-gradient-to-r from-[#FB923C] to-[#EAB308] text-white border-0 shadow-md"
                  : "bg-white/20 hover:bg-white/30 text-white border-white/40"
              }`}
            >
              Mind
            </Button>
            {/* Spec 2026-10-18-nyilvanos-oldal-udvozlo: csak az anyaggal bíró évfolyamok — a „(0)” jelvények zaja megszűnt. */}
            {CLASSROOM_VALUES.filter((classroom) => availableClassrooms.includes(classroom)).map((classroom) => (
              <Badge
                key={classroom}
                variant={selectedClassroom === classroom ? "default" : "outline"}
                // Spec 2026-11-03-fooldal-boritokartyak: a chip a sáv színét viseli (aktívan a mért strong / strongInk pár).
                style={selectedClassroom === classroom
                  ? { background: homeCardTheme(classroom).strong, color: homeCardTheme(classroom).strongInk, borderColor: homeCardTheme(classroom).strong }
                  : { borderColor: homeCardTheme(classroom).accent }}
                className={`cursor-pointer text-xs py-0.5 px-2.5 font-semibold border-2 ${
                  selectedClassroom === classroom
                    ? "shadow-md"
                    : "bg-white/15 hover:bg-white/25 text-white"
                } transition-colors duration-200`}
                onClick={() => setSelectedClassroom(classroom)}
                // a11y (2026-09-02): kattintható jelvény → gomb-szerep és toggle-állapot gép által olvasható
                role="button"
                tabIndex={0}
                aria-pressed={selectedClassroom === classroom}
                data-testid={`button-filter-classroom-${classroom}`}
              >
                {getClassroomLabel(classroom, true)}
              </Badge>
            ))}
          </div>
        </div>

        {/* Search + Frissítés (spec 2026-09-20) */}
        <div className="max-w-md mx-auto mb-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/70 z-10" />
            <Input
              placeholder="Keresés…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-white/20 border-white/40 text-white placeholder:text-white/60 focus:bg-white/30 focus:border-white/60 focus-visible:ring-white/50"
              data-testid="input-search"
            />
          </div>
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRetrying}
              className="h-8 shrink-0 bg-white/20 border-white/40 text-white hover:bg-white/30 min-w-11"
              aria-label="Tananyaglista frissítése"
              title="Tananyaglista frissítése"
              data-testid="button-refresh-files"
            >
              <RefreshCw className={isRetrying ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"} />
            </Button>
          )}
        </div>

        {/* Nézetválasztó (spec 2026-11-03-fooldal-nezetek): két független kapcsoló — külön és együtt is. */}
        <div className="mb-3 flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Nézet" data-testid="home-view-switch">
          <span className="text-xs font-semibold text-white/80">Nézet:</span>
          {([
            { key: "newest", label: "Legfrissebb", Icon: Sparkles, testId: "home-view-newest" },
            { key: "bySubject", label: "Tantárgyanként", Icon: Layers, testId: "home-view-by-subject" },
          ] as const).map(({ key, label, Icon, testId }) => (
            <Button
              key={key}
              variant="outline"
              size="sm"
              aria-pressed={view[key]}
              onClick={() => setView((v) => ({ ...v, [key]: !v[key] }))}
              data-testid={testId}
              className={`min-h-11 sm:min-h-8 h-auto px-3 text-xs font-semibold gap-1.5 rounded-full ${
                view[key]
                  // Review #393: a ui/button alapváltozatának mért, ≥ 4,5:1 kontrasztú narancs–borostyán háttere; a fehér felirat
                  // sötét témában és rámutatva is rögzítve (az outline változat saját dark/hover szövegszínt adna).
                  ? "bg-gradient-to-r from-orange-700 to-amber-700 text-white hover:text-white dark:text-white dark:hover:text-white border-0 shadow-md"
                  : "bg-white/20 hover:bg-white/30 text-white hover:text-white dark:text-white dark:hover:text-white border-white/40"
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden />
              {label}
            </Button>
          ))}
          <span className="w-full text-center text-[11px] text-white/70 sm:w-auto">Egyszerre mindkettő is bekapcsolható.</span>
        </div>

        {/* Tananyagok */}
        {filteredFiles.length > 0 ? (
          <>
            {view.newest && view.bySubject && (
              <section className="mb-5" data-testid="home-newest-strip" aria-labelledby="home-newest-heading">
                <h2 id="home-newest-heading" className="text-base font-extrabold text-white/90 tracking-wide mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-orange-300 shrink-0" aria-hidden />
                  Legfrissebb tananyagok
                  <span className="home-count">{Math.min(NEWEST_STRIP, newestFiles.length)}</span>
                </h2>
                <div className={gridClass}>{newestFiles.slice(0, NEWEST_STRIP).map(renderCard)}</div>
              </section>
            )}
            <h2
              className="text-base font-extrabold text-white/90 tracking-wide mb-2 flex items-center gap-2"
              id="content-start"
            >
              <BookOpen className="w-4 h-4 text-orange-300 shrink-0" />
              {view.bySubject ? "Tantárgyanként" : view.newest ? "Legfrissebb tananyagok" : "Tananyagok"}
              <span className="home-count" data-testid="text-files-count">{filteredFiles.length}</span>
            </h2>
            {view.bySubject ? (
              <>
                {subjectGroups.length > 1 && (
                  <nav className="mb-3 flex flex-wrap gap-1.5" aria-label="Ugrás tantárgyra" data-testid="home-subject-jumps">
                    {subjectGroups.map((group, i) => (
                      <button
                        key={group.label}
                        type="button"
                        className="home-subject-jump"
                        onClick={() => {
                          // Review #393: a fókusz is a szakaszra kerül — a következő Tab a szakasz kártyáira lép, nem a következő ugrógombra.
                          const target = document.getElementById(`home-subject-${i}`);
                          target?.scrollIntoView({ behavior: "smooth", block: "start" });
                          target?.focus({ preventScroll: true });
                        }}
                        data-testid={`home-subject-jump-${i}`}
                      >
                        {group.label} <span aria-hidden>· {group.files.length}</span>
                      </button>
                    ))}
                  </nav>
                )}
                {subjectGroups.map((group, i) => (
                  <section
                    key={group.label}
                    id={`home-subject-${i}`}
                    className="mb-5 scroll-mt-4 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300"
                    tabIndex={-1}
                    data-testid="home-subject-section"
                    data-subject={group.label}
                    aria-labelledby={`home-subject-heading-${i}`}
                  >
                    <h3 id={`home-subject-heading-${i}`} className="text-sm font-extrabold text-white/90 mb-2 flex items-center gap-2">
                      {group.label}
                      <span className="home-count" data-testid="home-subject-count">{group.files.length}</span>
                    </h3>
                    <div className={gridClass}>{group.files.map(renderCard)}</div>
                  </section>
                ))}
              </>
            ) : (
              <div className={`${gridClass} list-enter`} data-testid="list-files">
                {filteredFiles.map(renderCard)}
              </div>
            )}
          <HomePracticeGames />
          </>
        ) : (
          <div className="text-center py-16">
            <Card className="max-w-md mx-auto glass-card">
              <CardContent className="pt-12 pb-12">
                <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-4">
                  {selectedClassroom !== null ? (
                    <>
                      Nincs találat a(z) <strong>{selectedClassroom}. osztályban</strong>
                      {searchQuery && (
                        <>
                          {" "}a keresésre: <strong>"{searchQuery}"</strong>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      Nincs találat a keresésre: <strong>"{searchQuery}"</strong>
                    </>
                  )}
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedClassroom(null);
                  }}
                  data-testid="button-clear-filters"
                >
                  Szűrők törlése
                </Button>
              </CardContent>
            </Card>
            <HomePracticeGames />
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(UserFileList);
