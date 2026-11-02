import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ExternalLink, Search, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { homeFilesQueryOptions } from "@/lib/home-files-query";
import { workflowDefinition } from "@shared/lesson-workflow";
import { SKILL_RULES, type SkillCode, type SkillSnapshot } from "@shared/lesson-skill";
import { LessonRepairPanel, REPAIR_PHASE_SLOT_ID, type RepairPreset } from "./LessonRepairPanel";
import { isRepairable, matchesRepairQuery } from "@/lib/lesson-repair-search";

/**
 * Spec 2026-09-23 — külön „Tananyagjavító” menüpont (az Okosítás mintájára): a javítás tudása
 * (a javító út lépései, a tanult szabályok, a tananyagjavító és a szerep-skillek), a lecke
 * kiválasztása, majd a javítás iránya szöveges prompttal — a meglévő, ellenőrzött javító úton.
 */
type RoleSkill = { role: string; version: string; text: string };
type FileRow = { id: string; title?: string; contentType?: string; classroom?: number | null };

const ROLE_LABEL: Record<string, string> = {
  repair: "Tananyagjavító (minden javításnál)", author: "Szerző", lektor: "Lektor", bank: "Gyakorlóbank-készítő", ocr: "Átíró (OCR, kézírás)",
  scope: "Besoroló (tantárgy, évfolyam)", corrector: "Forrás-helyesbítő", "web-research": "Webes forrásgyűjtő", "web-author": "Webes szerző", "web-lektor": "Webes lektor",
  "web-repair": "Webes javító", "html-improve": "HTML-okosító", "html-fix": "HTML-hibajavító", "creator-analyze": "Fájlelemző", "creator-chat": "Készítő chat", "quiz-generator": "Kvízgenerátor",
};

/** Szempont-gombok: a gyakori javítási irányok, a skill-szabályok szavaival. */
const PRESETS: RepairPreset[] = [
  { label: "Elírások (kézírás)", text: "Keresd meg és javítsd a kézírás-átírásból maradt elírásokat (pl. bódex → kódex); a helyes alakot MINDEN előfordulásnál cseréld." },
  { label: "Évfolyam", text: "Ez ___. osztályos tananyag: a nyelvezetet és a mélységet ehhez igazítsd, a tényeket ne változtasd." },
  { label: "Rövidítés", text: "Rövidítsd a tananyagot: a töltelék, az ismétlés és az általános bevezetők menjenek; a kulcsfogalmak tanítása és a kidolgozott példák maradjanak." },
  { label: "Forráshűség", text: SKILL_RULES.source_fidelity[1] },
  { label: "Tanítási mélység", text: SKILL_RULES.teaching_depth[1] },
  { label: "Mintaválaszok", text: SKILL_RULES.sample_score[1] },
  { label: "Ismétlődő kérdések", text: SKILL_RULES.duplicate_question[1] },
];

export default function LessonRepairWorkbench() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const files = useQuery<FileRow[]>(homeFilesQueryOptions());
  const roles = useQuery<{ roles: RoleSkill[] }>({ queryKey: ["/api/studio/skills/tananyag-javito/roles"] });
  const learned = useQuery<{ snapshot: SkillSnapshot }>({ queryKey: ["/api/studio/skills/tananyag-javito"] });
  const steps = workflowDefinition("repair").steps;

  // Spec 2026-10-19 (javító-választó): a régi HTML-tananyag is javítható; a keresés évfolyamra és szinonimára is illik.
  const lessons = useMemo(() => (files.data ?? []).filter((f) => isRepairable(f.contentType)), [files.data]);
  const shown = useMemo(() => lessons.filter((f) => matchesRepairQuery(f, query)).slice(0, 100), [lessons, query]);
  const current = lessons.find((f) => f.id === selected);
  const step2 = useRef<HTMLDivElement>(null);
  // Mobilon a választás után a 2. lépés a látótérbe kerül (a lista alatt, a billentyűzet mögött volt).
  useEffect(() => { if (selected) step2.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }); }, [selected]);
  const rules = (learned.data?.snapshot.rules ?? []).filter((c): c is SkillCode => Object.hasOwn(SKILL_RULES, c));

  return (
    <div className="space-y-3" data-testid="lesson-repair-workbench">
      {/* Spec 2026-10-19-okositas-fazisjelzo: a futó javítás fázissora ide kerül, és a teljes lap görgetése alatt látszik. */}
      <div id={REPAIR_PHASE_SLOT_ID} className="sticky top-0 z-20 empty:hidden" data-testid="lesson-repair-phase-slot" />
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">1. Tananyag kiválasztása</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Keresés: cím, évfolyam (pl. 4 osztályos angol)…" className="pl-9 min-h-11" aria-label="Lecke keresése" data-testid="lesson-repair-search" />
          </div>
          {files.isLoading && <p className="text-sm text-muted-foreground">Betöltés…</p>}
          {!files.isLoading && shown.length === 0 && <p className="text-sm text-muted-foreground">Nincs javítható tananyag{query ? " erre a keresésre" : ""}.</p>}
          <ul className="max-h-72 overflow-y-auto divide-y rounded-md border" role="listbox" aria-label="Leckék">
            {shown.map((f) => (
              <li key={f.id}>
                <button type="button" role="option" aria-selected={f.id === selected} onClick={() => setSelected(f.id)}
                  className={`w-full text-left px-3 py-2 min-h-11 text-sm hover:bg-muted ${f.id === selected ? "bg-primary/10 font-medium" : ""}`}
                  data-testid={`lesson-repair-option-${f.id}`}>
                  <span className="break-words">{f.title || "Névtelen tananyag"}</span>
                  <span className="block text-xs text-muted-foreground font-normal">
                    {f.contentType === "lesson" ? "Lecke" : "Régi HTML"}{f.classroom ? ` · ${f.classroom}. osztály` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {current && (
        <div className="space-y-2 scroll-mt-4" id="lesson-repair-step2" ref={step2}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">2. A javítás iránya — „{current.title}”</p>
            <Button variant="outline" size="sm" className="min-h-9" onClick={() => window.open(`/preview/${current.id}`, "_blank", "noopener,noreferrer")}>
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Lecke megnyitása
            </Button>
          </div>
          <LessonRepairPanel key={current.id} fileId={current.id} isLesson={current.contentType === "lesson"} presets={PRESETS} embedded />
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Wrench className="w-4 h-4" /> Tananyagjavító</CardTitle>
          <CardDescription>
            Válassz egy kész leckét, és írd le, mit javítson a készítő ügynök. A javított változat minden ellenőrzésen átmegy, és csak az „Alkalmazás” után cseréli le az eredetit (mentéssel, visszaállíthatóan).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-medium mb-1">A javítás lépései</p>
            <ol className="flex flex-wrap gap-1.5" aria-label="A javító út lépései">
              {steps.map((s, i) => <li key={s.id} className="rounded-full border px-2 py-0.5 text-xs">{i + 1}. {s.label}</li>)}
            </ol>
          </div>
          <div>
            <p className="font-medium mb-1">Tanult javítási szabályok{learned.data ? ` (${learned.data.snapshot.version})` : ""}</p>
            {rules.length
              ? <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">{rules.map((c) => <li key={c}><span className="text-foreground">{SKILL_RULES[c][0]}:</span> {SKILL_RULES[c][1]}</li>)}</ul>
              : <p className="text-muted-foreground">{learned.isLoading ? "Betöltés…" : "Még nincs tanult kiegészítés; az alapmódszer és a lenti skillek érvényesek."}</p>}
          </div>
          <div>
            <p className="font-medium mb-1">Skillek</p>
            {roles.isLoading && <p className="text-muted-foreground">Betöltés…</p>}
            {roles.isError && <p className="text-destructive">A skillek nem tölthetők be.</p>}
            <div className="space-y-1.5">
              {(roles.data?.roles ?? []).map((r) => (
                <details key={r.role} className="rounded-md border px-3 py-2" data-testid={`repair-skill-${r.role}`}>
                  <summary className="cursor-pointer min-h-9 flex items-center gap-2"><BookOpen className="w-3.5 h-3.5" />{ROLE_LABEL[r.role] ?? r.role} <span className="text-xs text-muted-foreground">v{r.version}</span></summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed font-sans">{r.text}</pre>
                </details>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
