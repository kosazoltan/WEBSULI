import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ExternalLink, Search, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { homeFilesQueryOptions } from "@/lib/home-files-query";
import { workflowDefinition } from "@shared/lesson-workflow";
import { SKILL_RULES, type SkillCode, type SkillSnapshot } from "@shared/lesson-skill";
import { LessonRepairPanel, type RepairPreset } from "./LessonRepairPanel";

/**
 * Spec 2026-09-23 — külön „Tananyagjavító” menüpont (az Okosítás mintájára): a javítás tudása
 * (a javító út lépései, a tanult szabályok, a tananyagjavító és a szerep-skillek), a lecke
 * kiválasztása, majd a javítás iránya szöveges prompttal — a meglévő, ellenőrzött javító úton.
 */
type RoleSkill = { role: string; version: string; text: string };
type FileRow = { id: string; title?: string; contentType?: string; classroom?: number | null };

const ROLE_LABEL: Record<string, string> = { repair: "Tananyagjavító (minden javításnál)", author: "Szerző", lektor: "Lektor", bank: "Gyakorlóbank-készítő", ocr: "Átíró (OCR, kézírás)" };

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

  const lessons = useMemo(() => (files.data ?? []).filter((f) => f.contentType === "lesson"), [files.data]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? lessons.filter((f) => (f.title ?? "").toLowerCase().includes(q)) : lessons).slice(0, 60);
  }, [lessons, query]);
  const current = lessons.find((f) => f.id === selected);
  const rules = (learned.data?.snapshot.rules ?? []).filter((c): c is SkillCode => Object.hasOwn(SKILL_RULES, c));

  return (
    <div className="space-y-3" data-testid="lesson-repair-workbench">
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">1. Tananyag kiválasztása</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Keresés a leckék címében…" className="pl-9 min-h-11" aria-label="Lecke keresése" data-testid="lesson-repair-search" />
          </div>
          {files.isLoading && <p className="text-sm text-muted-foreground">Betöltés…</p>}
          {!files.isLoading && shown.length === 0 && <p className="text-sm text-muted-foreground">Nincs javítható (strukturált) lecke{query ? " ezzel a címmel" : ""}.</p>}
          <ul className="max-h-72 overflow-y-auto divide-y rounded-md border" role="listbox" aria-label="Leckék">
            {shown.map((f) => (
              <li key={f.id}>
                <button type="button" role="option" aria-selected={f.id === selected} onClick={() => setSelected(f.id)}
                  className={`w-full text-left px-3 py-2 min-h-11 text-sm hover:bg-muted ${f.id === selected ? "bg-primary/10 font-medium" : ""}`}
                  data-testid={`lesson-repair-option-${f.id}`}>
                  {f.title || "Névtelen lecke"}{f.classroom ? <span className="text-xs text-muted-foreground"> · {f.classroom}. osztály</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {current && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">2. A javítás iránya — „{current.title}”</p>
            <Button variant="outline" size="sm" className="min-h-9" onClick={() => window.open(`/preview/${current.id}`, "_blank", "noopener,noreferrer")}>
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Lecke megnyitása
            </Button>
          </div>
          <LessonRepairPanel key={current.id} fileId={current.id} isLesson presets={PRESETS} embedded />
        </div>
      )}
    </div>
  );
}
