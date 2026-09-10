import { useState } from "react";
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
import { CLASSROOMS, DEFAULT_CLASSROOM, getClassroomLabel } from "@shared/classrooms";
import { readHtmlLessonData } from "@shared/lesson-html-data";
import { logger } from "@/lib/logger";

type WebSource = { url: string; title: string };

/** A szerver SSE-eseményei (server/studio/web-research-agent.ts `WebResearchEvent`). */
type StreamChunk = {
  type?: string;
  content?: string;
  html?: string;
  message?: string;
  sources?: WebSource[];
  warnings?: string[];
};

const MAX_DESCRIPTION_CHARS = 1000;

async function csrfHeader(): Promise<Record<string, string>> {
  const res = await fetch("/api/csrf-token", { credentials: "include" });
  if (!res.ok) return {};
  const data = (await res.json()) as { csrfToken?: string };
  return data.csrfToken ? { "X-CSRF-Token": data.csrfToken } : {};
}

/** A mentett leírás: rövid összefoglaló + a felhasznált források URL-jei (korlátos hossz). */
export function buildDescription(classroomLabel: string, sources: WebSource[]): string {
  const base = `Internetes forrásokból készült tananyag, ${classroomLabel}.`;
  if (sources.length === 0) return base;
  let out = `${base} Források:`;
  for (const s of sources) {
    const next = `${out} ${s.url};`;
    if (next.length > MAX_DESCRIPTION_CHARS) break;
    out = next;
  }
  return out;
}

export function WebResearchAgentPanel() {
  const { toast } = useToast();
  const [classroom, setClassroom] = useState<number>(DEFAULT_CLASSROOM);
  const [title, setTitle] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [sources, setSources] = useState<WebSource[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [generatedHtml, setGeneratedHtml] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const handleSend = async (message: string) => {
    setIsLoading(true);
    setSavedId(null);
    setStatus("Válasz készül…");
    const userMessage: ChatMessage = { role: "user", content: message };
    const history = [...messages, userMessage];
    setMessages(history);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const setAssistant = (content: string) =>
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content };
        return next;
      });

    try {
      const csrf = await csrfHeader();
      const response = await fetch("/api/studio/web-research/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf["X-CSRF-Token"] ?? "",
        },
        credentials: "include",
        body: JSON.stringify({
          message,
          classroom,
          conversationHistory: messages.filter((m) => m.role === "user" || m.role === "assistant"),
          title: title.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(errBody.message || `Hiba (${response.status})`);
      }
      if (!response.body) throw new Error("Üres válasz a szervertől.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line || line === "[DONE]") continue;
          let parsed: StreamChunk;
          try {
            parsed = JSON.parse(line) as StreamChunk;
          } catch {
            continue;
          }
          if (parsed.type === "content_delta") {
            assistantMessage += parsed.content ?? "";
            setAssistant(assistantMessage);
          } else if (parsed.type === "content_replace") {
            assistantMessage = parsed.content ?? "";
            setAssistant(assistantMessage || "A HTML tananyag készül…");
          } else if (parsed.type === "status") {
            setStatus(parsed.message ?? null);
          } else if (parsed.type === "sources" && Array.isArray(parsed.sources)) {
            setSources(parsed.sources);
          } else if (parsed.type === "html_generated" && parsed.html) {
            const generated = readHtmlLessonData(parsed.html);
            setClassroom(generated.classroom);
            setGeneratedHtml(parsed.html);
            setWarnings(Array.isArray(parsed.warnings) ? parsed.warnings : []);
            if (Array.isArray(parsed.sources) && parsed.sources.length > 0) setSources(parsed.sources);
            if (!title.trim()) {
              setTitle(`${generated.subject} — ${getClassroomLabel(generated.classroom, false)}`);
            }
            if (!assistantMessage.trim()) {
              assistantMessage = "A HTML tananyag elkészült — lásd az előnézetet lent.";
              setAssistant(assistantMessage);
            }
            toast({ title: "HTML elkészült", description: "Mentheted a többi tananyag közé." });
          } else if (parsed.type === "error") {
            throw new Error(parsed.message || "Ismeretlen AI hiba");
          }
        }
      }
      if (!assistantMessage.trim()) {
        setMessages((prev) => prev.slice(0, -1));
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Ismeretlen hiba";
      toast({ title: "Keresési hiba", description: reason, variant: "destructive" });
      // Éles próba 2026-09-09: hibánál a már megérkezett válasz (források, összefoglaló)
      // ne vesszen el — a buborék marad, a hiba oka a végére kerül. Üres választ eldobunk.
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") return prev;
        if (!last.content.trim()) return prev.slice(0, -1);
        return [...prev.slice(0, -1), { role: "assistant", content: `${last.content}\n\n⚠️ ${reason}` }];
      });
      logger.error("[WebResearchAgent]", error);
    } finally {
      setIsLoading(false);
      setStatus(null);
    }
  };

  const handleSave = async () => {
    if (!generatedHtml) return;
    const inferredClassroom = readHtmlLessonData(generatedHtml).classroom;
    const classroomLabel = getClassroomLabel(inferredClassroom, false);
    const saveTitle = title.trim() || `Tananyag — ${classroomLabel}`;
    setIsSaving(true);
    try {
      const file = await apiRequest<{ id: string }>(
        "POST",
        "/api/html-files",
        {
          title: saveTitle,
          description: buildDescription(classroomLabel, sources),
          content: generatedHtml,
          classroom: inferredClassroom,
          contentType: "html",
        },
        { timeout: 180000 },
      );
      queryClient.removeQueries({ queryKey: ["/api/html-files"] });
      await queryClient.refetchQueries({ queryKey: ["/api/html-files"], type: "all" });
      setSavedId(file.id);
      toast({
        title: "Elmentve a tananyagok közé",
        description: `"${saveTitle}" megjelent a Fájlok listában és a főoldalon.`,
      });
    } catch (error) {
      toast({
        title: "Mentési hiba",
        description: error instanceof Error ? error.message : "Nem sikerült menteni.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
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
          Mentés nélkül nem jelenik meg a többi anyag között.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="web-research-classroom">Keresési korosztály (támpont)</Label>
            <Select
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
            isLoading={isLoading}
            placeholder="Pl.: Keress tananyagot 5. osztályos törtekhez, és készítsd el"
            aiName="Claude"
            aiIcon={<Globe className="w-5 h-5 text-primary" />}
          />
        </div>
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
        {generatedHtml && !isLoading && warnings.length > 0 && (
          <div
            className="border border-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 text-xs"
            data-testid="web-research-warnings"
            role="alert"
          >
            <div className="font-medium mb-1">⚠️ Az ellenőrző hibát talált a HTML-ben — mentés előtt kérj javítást a chatben:</div>
            <ul className="list-disc pl-4 space-y-0.5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
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
              srcDoc={generatedHtml}
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
          disabled={!generatedHtml || isSaving || isLoading}
          className="flex-1 min-h-11"
          data-testid="web-research-save"
        >
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          Mentés a tananyagok közé
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
