import { withLessonTypography } from "@shared/lesson-typography";
import { useEffect, useState } from "react";
import { Globe, Loader2, CheckCircle2, Eye, Link2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ChatInterface, { type ChatMessage } from "@/components/ChatInterface";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CLASSROOMS, DEFAULT_CLASSROOM } from "@shared/classrooms";
import type { WebResearchJob } from "@shared/web-research-job";
import { type WebSource } from "@shared/web-research-stream";
import { logger } from "@/lib/logger";
import { WorkflowMonitor } from "./WorkflowMonitor";

type PendingResearch = { id: string; message: string; classroom: number; title?: string; conversationHistory?: ChatMessage[] };
const STORAGE_KEY = "websuli:web-research:pending";
function storedResearch(): PendingResearch | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return value && typeof value.id === "string" && typeof value.message === "string" && typeof value.classroom === "number" ? value : null;
  } catch { return null; }
}
function rememberResearch(value: PendingResearch | null) {
  try { if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); else localStorage.removeItem(STORAGE_KEY); }
  catch { logger.warn("A készítés követése ebben a böngészőben nem őrizhető meg újratöltéshez."); }
}

export function WebResearchAgentPanel() {
  const { toast } = useToast();
  const [classroom, setClassroom] = useState<number>(DEFAULT_CLASSROOM);
  const [title, setTitle] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [sources, setSources] = useState<WebSource[]>([]);

  const [generatedHtml, setGeneratedHtml] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [canResume, setCanResume] = useState(false);

  const [pending, setPending] = useState<PendingResearch | null>(storedResearch);

  useEffect(() => {
    if (!pending) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setIsLoading(true);
    setTitle(pending.title || "");
    setClassroom(pending.classroom);
    setStatus("A szerveren futó készítés követése… Az oldalt nyugodtan újratöltheted.");
    const follow = async () => {
      try {
        let job: WebResearchJob;
        try { job = await apiRequest<WebResearchJob>("GET", `/api/studio/web-research/jobs/${pending.id}`, undefined, { timeout: 15_000 }); }
        catch (error) {
          if ((error as { status?: number }).status !== 404) throw error;
          // A lost start response is retried with the SAME key and input, never a new AI run.
          job = await apiRequest<WebResearchJob>("POST", "/api/studio/web-research/jobs", pending, { timeout: 15_000 });
        }
        if (disposed) return;
        if (job.state === "ready" && !job.error) {
          // Also recovers a server restart between durable generation and publication.
          try { job = await apiRequest<WebResearchJob>("POST", `/api/studio/web-research/jobs/${pending.id}/publish`, {}, { timeout: 20_000 }); }
          catch (error) {
            if ((error as { status?: number }).status !== 409) throw error;
            // The worker owns publication until its lease expires; keep following it.
            setStatus("A szerver az ellenőrzött tananyag mentését végzi…");
            if (!disposed) timer = setTimeout(() => void follow(), 2500);
            return;
          }
          if (disposed) return;
        }
        setSources(job.sources);
        setStatus(job.stage);
        setFailure(job.error || null);
        setCanResume(job.canResume === true);
        setMessages([{ role: "user", content: job.message }, { role: "assistant", content: job.state === "done" ? "A tananyag elkészült és elmentve. A Megnyitás gombbal elérhető." : job.content || job.stage }]);
        if (job.state === "done" || job.state === "ready") {
          if (!job.html || (job.state === "done" && !job.materialId)) {
            setFailure("A szerver nem igazolta vissza a teljes tananyagot és a mentését.");
            setIsLoading(false);
            return;
          }
          setGeneratedHtml(job.html);
          setTitle(job.title);
          setClassroom(job.classroom ?? pending.classroom);
          setSavedId(job.materialId || null);
          if (job.state === "done") {
            setIsLoading(false);
            void queryClient.invalidateQueries({ queryKey: ["/api/html-files"] }).catch(error => logger.error("[WebResearchAgent] list refresh", error));
            return;
          }
          // Ready is durable even if publication failed or the worker restarted here.
          setIsLoading(false);
          setStatus(null);
          return;
        }
        if (job.state === "error") { setIsLoading(false); return; }
      } catch (error) {
        if (disposed) return;
        const code = (error as { status?: number }).status;
        if (code && [400, 401, 403, 409].includes(code)) {
          setFailure(error instanceof Error ? error.message : "A futás nem követhető ezzel a hozzáféréssel.");
          setIsLoading(false);
          rememberResearch(null);
          return;
        }
        setStatus("A kapcsolat átmenetileg megszakadt. A készítés a szerveren folytatódik; újracsatlakozás…");
      }
      if (!disposed) timer = setTimeout(() => void follow(), 2500);
    };
    void follow();
    return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, [pending]);

  const handleSend = async (message: string) => {
    if (isLoading || isSaving) return;
    setFailure(null); setSavedId(null); setGeneratedHtml(""); setSources([]); setCanResume(false);
    const request: PendingResearch = { id: crypto.randomUUID(), message, classroom, ...(title.trim() ? { title: title.trim() } : {}),
      ...(messages.length ? { conversationHistory: messages.slice(-50) } : {}) };
    rememberResearch(request);
    setIsLoading(true);
    setPending(request);
  };

  const handleSave = async () => {
    if (!pending || (!generatedHtml && !canResume) || isSaving || isLoading || savedId) return;
    setIsSaving(true); setFailure(null);
    try {
      const job = await apiRequest<WebResearchJob>("POST", `/api/studio/web-research/jobs/${pending.id}/publish`, {}, { timeout: 20_000 });
      if (job.state !== "done" || !job.materialId) throw new Error("A szerver nem igazolta vissza a mentést.");
      setSavedId(job.materialId);
      setGeneratedHtml(job.html || ""); setCanResume(false);
      void queryClient.invalidateQueries({ queryKey: ["/api/studio/workflows"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/html-files"] }).catch(error => logger.error("[WebResearchAgent] list refresh", error));
      setMessages(prev => [...prev.slice(0, -1), { role: "assistant", content: "A tananyag elkészült és elmentve. A Megnyitás gombbal elérhető." }]);
      toast({ title: "Elmentve a tananyagok közé" });
    } catch (error) { setFailure(error instanceof Error ? error.message : "Nem sikerült menteni; a kész tananyag a szerveren megmaradt."); }
    finally { setIsSaving(false); }
  };

  return (
    <Card data-testid="web-research-agent-panel">
      <CardHeader className="py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="w-4 h-4 text-emerald-600" />
          Internetes keresés — tananyag-ügynök
        </CardTitle>
        <CardDescription className="text-xs">
          Írd le, milyen tananyagot keressen. A program forrásokat keres, majd négyoldalas tananyagot készít. Az évfolyamot az elkészült tartalom alapján állapítja meg.
          Az ellenőrzött tananyagot automatikusan elmenti a tananyagok közé.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <WorkflowMonitor id={pending?.id ?? savedId} />
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="web-research-classroom">Keresési korosztály (támpont)</Label>
            <Select
              disabled={isLoading || isSaving}
              value={String(classroom)}
              onValueChange={(v) => setClassroom(parseInt(v, 10))}
            >
              <SelectTrigger id="web-research-classroom" className="min-h-11" data-testid="web-research-classroom">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLASSROOMS.map((c) => (
                  <SelectItem key={c.value} value={String(c.value)}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="web-research-title">Cím a mentéshez</Label>
            <Input
              id="web-research-title"
              disabled={isLoading || isSaving}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="pl. Törtek — 5. osztály"
              data-testid="web-research-title"
            />
          </div>
        </div>
        <Badge variant="outline" className="text-xs">Tananyag · Módszerek · Feladatok · Kvíz</Badge>
        <div className="h-[480px]">
          <ChatInterface
            title="Tananyagkészítő ügynök"
            description="Pl.: Keress 5. osztályos törtes tananyagot, és készíts belőle interaktív HTML-t"
            messages={messages}
            onSendMessage={handleSend}
            isLoading={isLoading || isSaving}
            placeholder="Pl.: Keress tananyagot 5. osztályos törtekhez, és készítsd el"
            aiName="Tananyagkészítő"
            aiIcon={<Globe className="w-5 h-5 text-primary" />}
          />
        </div>
        {failure && <div role="alert" data-testid="web-research-error" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive break-words">{failure}</div>}
        {isLoading && status && (
          <div
            className="flex items-center gap-2 text-xs text-muted-foreground"
            data-testid="web-research-status"
            aria-live="polite"
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            {status}
          </div>
        )}
        {sources.length > 0 && (
          <div className="border rounded-lg p-2" data-testid="web-research-sources">
            <div className="flex items-center gap-1 text-xs font-medium mb-1">
              <Link2 className="w-3 h-3" />
              Felhasznált források ({sources.length})
            </div>
            <ul className="text-xs space-y-0.5 max-h-24 overflow-y-auto">
              {sources.map((s) => (
                <li key={s.url} className="truncate">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
                    {s.title || s.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {generatedHtml && !isLoading && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted px-3 py-2 border-b flex items-center gap-2">
              <Eye className="w-4 h-4" />
              <span className="text-sm">Előnézet</span>
            </div>
            <iframe
              srcDoc={withLessonTypography(generatedHtml, classroom, title)}
              className="w-full h-[320px]"
              title="Webes tananyag előnézet"
              sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
              data-testid="web-research-preview"
            />
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          onClick={() => void handleSave()}
          disabled={(!generatedHtml && !canResume) || isSaving || isLoading || !!savedId}
          className="flex-1 min-h-11"
          data-testid="web-research-save"
        >
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          {savedId ? "Elmentve a tananyagok közé" : canResume ? "Folytatás a mentett eredményből" : "Mentés a tananyagok közé"}
        </Button>
        {savedId && (
          <Button asChild variant="outline" className="min-h-11" data-testid="web-research-open-saved">
            <a href={`/preview/${savedId}`}>Megnyitás</a>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
