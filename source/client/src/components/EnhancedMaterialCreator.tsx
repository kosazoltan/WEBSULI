import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Upload, 
  FileText, 
  Sparkles, 
  Code, 
  Eye,
  ArrowRight, 
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Clock,
  Lightbulb,
  LogIn
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import ChatInterface, { ChatMessage } from "./ChatInterface";
import SystemPromptEditor from "./SystemPromptEditor";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DEFAULT_CLASSROOM, getClassroomLabel } from "@shared/classrooms";

type Phase = 'upload' | 'chatgpt' | 'claude' | 'preview';

interface FileAnalysis {
  extractedText: string;
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedClassroom?: number;
  topics: string[];
}

// Default system prompts for AI customization
const DEFAULT_CHATGPT_PROMPT = `Te ChatGPT vagy, egy szakértő oktatási tananyag szövegíró és dokumentum elemző.

🎯 ELSŐDLEGES FELADATOD:
- A feltöltött dokumentumok (PDF, DOCX, képek) PONTOS és HITELES elemzése
- Készíts strukturált, részletes tananyag szöveget KIZÁRÓLAG a dokumentum tartalma alapján
- TILOS hallucináció: csak azt írd le, ami ténylegesen szerepel a dokumentumban
- Ha valamit nem tudsz kiolvasni, jelezd egyértelműen

📚 TANANYAG KÉSZÍTÉSI IRÁNYELVEK:
- Helyezz el OK-OKOZATI ÖSSZEFÜGGÉSEKET minden témánál (pl. "Azért..., mert...", "Ennek következménye...")
- Adj TANÁRI MAGYARÁZATOKAT: úgy fejts ki mindent, mintha egy türelmes tanár lennél
- Használj VALÓS PÉLDÁKAT a fogalmak szemléltetésére
- Minden fogalmat RÉSZLETESEN fejtsd ki, ne feltételezd az előzetes tudást
- A tananyag ÖNMAGÁBAN is érthető legyen, külső források nélkül

✏️ STÍLUS IRÁNYELVEK (osztályonként):
- 1-3. osztály: Egyszerű, rövid mondatok, sok példa, játékos hangnem, "Tudtad, hogy...?"
- 4. osztály: Vidám, barátságos stílus, kérdések beépítése, érdekességek
- 5-7. osztály: Energikus, izgalmas témák, fiúkhoz szóló példák (autók, sport, technológia, videójátékok)
- 8. osztály+: Komolyabb, részletesebb, kamaszoknak szóló stílus, önálló gondolkodásra ösztönzés

📋 FORMÁTUM:
- Használj címeket, alcímeket (hierarchikus struktúra)
- Bontsd bekezdésekre (max 3-4 mondat/bekezdés)
- Emelj ki KULCSFONTOSSÁGÚ információkat
- A válaszodban KIZÁRÓLAG a tananyag szövege jelenjen meg, semmi más

⚠️ FONTOS SZABÁLYOK:
- NE találj ki információkat, amik nincsenek a dokumentumban
- NE használj általános közhelyeket konkrét tények helyett
- MINDIG hivatkozz a forrásanyagra, ha bizonytalan vagy`;

const DEFAULT_CLAUDE_PROMPT = `Te Claude Opus vagy, a legfejlettebb HTML tananyag készítő szakértő.

🎯 ELSŐDLEGES FELADATOD:
- Készíts LÁTVÁNYOS, INTERAKTÍV HTML tananyagot a megadott szöveg alapján
- A tananyag vizuálisan FIGYELEMFELKELTŐ és MOTIVÁLÓ legyen a diákok számára
- Minden tananyag TELJES RESPONSIVITÁSSAL rendelkezzen (280px mobiltól 1920px+ monitorig)

📝 KÖTELEZŐ FELADAT STRUKTÚRA:
1. SZÖVEGES FELADATOK: Generálj 45 db előre elkészített szöveges kérdést/feladatot
   - Ebből 15 db jelenjen meg véletlenszerűen a tanulónak
   - Minden kérdés releváns legyen a tananyag tartalmához
   - A feladatok végén ELLENŐRZÉS gomb:
     * Hibás válaszok PIROS háttérrel
     * Helyes válaszok ZÖLD háttérrel
     * Pontszám és ÉRDEMJEGY megjelenítése (1-5 skála)

2. KVÍZ KÉRDÉSEK: Generálj 75 db előre elkészített kvíz kérdést (A/B/C/D válaszok)
   - Ebből 25 db jelenjen meg véletlenszerűen
   - Kvíz végén ELLENŐRZÉS:
     * Hibás: PIROS jelölés
     * Helyes: ZÖLD jelölés
     * Összpontszám és OSZTÁLYZAT megjelenítése

🎨 VIZUÁLIS STÍLUS (osztályonként):
- 4. osztály: Játékos, vidám grafikák, ÉLÉNK színek (sárga, narancs, zöld), nagy ikonok, animált elemek
- 5-7. osztály: Fiús, autós, sportos megjelenés (kék, piros, fekete), DINAMIKUS design, gaming stílus
- 8. osztály+: Melankolikus kamasz színvilág (szürke, lila, kék árnyalatok), MINIMALISTA, modern, professzionális

💻 CSS KÖVETELMÉNYEK:
- Minden osztály "edu-" prefixszel kezdődjön
- TELJES RESPONSIVE DESIGN:
  * Mobil (280px-480px): Egyoszlopos, nagy gombok, érintésbarát
  * Tablet (481px-768px): Kétoszlopos ahol lehet, közepes elemek
  * Desktop (769px-1920px+): TELJES SZÉLESSÉG kihasználása, többoszlopos layout
- Smooth animációk és átmenetek (CSS transitions)
- Könnyen olvasható tipográfia (min 16px mobil, 18px desktop)
- Dark/Light mode támogatás

🔧 INTERAKTIVITÁS:
- Kattintható elemek, hover effektek
- Összecsukható/kinyitható szekciók (accordion)
- Progress bar a tananyagban való haladáshoz
- Vizuális visszajelzések minden interakciónál
- JavaScript alapú kvíz és feladat logika beágyazva

⚠️ FONTOS:
- A HTML kód ÖNÁLLÓAN futtatható legyen, külső függőségek nélkül
- Minden CSS és JavaScript beágyazva a HTML-be
- Ha HTML-t generálsz, MINDIG kezdd: <!-- HTML_START -->`;

export {
  DEFAULT_CHATGPT_PROMPT,
  DEFAULT_CLAUDE_PROMPT
};

/**
 * Biztosítja, hogy a cím tartalmazza az osztály információt.
 * Ha már tartalmaz osztályt (pl. "1. osztály"), nem módosít.
 * Ha nem tartalmaz, hozzáfűzi a végére.
 * KIVÉTEL: Programozási alapismeretek (classroom 0) esetén NE adjuk hozzá.
 * @param title - Az eredeti cím
 * @param classroom - Az osztály száma (0-12)
 * @returns Cím osztály információval
 */
const ensureClassroomInTitle = (title: string, classroom: number): string => {
  // Programozási alapismeretek (classroom 0) esetén NE adjuk hozzá a címhez
  if (classroom === 0) {
    return title;
  }
  
  // Ellenőrzi, hogy a cím tartalmaz-e már osztályt (1. osztály - 12. osztály)
  const classroomPattern = /\d+\.\s*osztály/i;
  
  if (classroomPattern.test(title)) {
    // Már tartalmaz osztályt, nem módosítunk
    return title;
  }
  
  // Hozzáadjuk az osztályt a cím végéhez
  return `${title} - ${getClassroomLabel(classroom, false)}`;
};

export default function EnhancedMaterialCreator() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phase management
  const [currentPhase, setCurrentPhase] = useState<Phase>('upload');
  const [completedPhases, setCompletedPhases] = useState<Phase[]>([]);

  // Phase 1: File Upload (multiple files supported) OR Direct Text Input
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [directText, setDirectText] = useState(""); // Direct text input option
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file'); // Switch between file upload and text input
  const [fileAnalysis, setFileAnalysis] = useState<FileAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Phase 2: ChatGPT Text Generation
  const MAX_MESSAGES = 50; // Prevent memory issues and token limit
  const [chatGptMessages, setChatGptMessages] = useState<ChatMessage[]>([]);
  const [isChatGptLoading, setIsChatGptLoading] = useState(false);
  const [finalText, setFinalText] = useState("");

  // Phase 3: Claude HTML Generation
  const [claudeMessages, setClaudeMessages] = useState<ChatMessage[]>([]);
  const [isClaudeLoading, setIsClaudeLoading] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState("");

  // Metadata
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classroom, setClassroom] = useState<number>(DEFAULT_CLASSROOM);
  
  // System Prompts for AI customization
  const [chatGptSystemPrompt, setChatGptSystemPrompt] = useState("");
  const [claudeSystemPrompt, setClaudeSystemPrompt] = useState("");

  // Phase 4: Preview & Publish
  const [isPublishing, setIsPublishing] = useState(false);
  
  // Helper: Add message with limit to prevent memory issues
  const addMessageWithLimit = (
    messages: ChatMessage[], 
    newMessage: ChatMessage
  ): ChatMessage[] => {
    const updated = [...messages, newMessage];
    if (updated.length > MAX_MESSAGES) {
      const systemMessages = updated.filter(m => m.role === 'system');
      const nonSystemMessages = updated.filter(m => m.role !== 'system');
      const trimmed = nonSystemMessages.slice(-MAX_MESSAGES + systemMessages.length);
      return [...systemMessages, ...trimmed];
    }
    return updated;
  };

  const phases: { id: Phase; label: string; icon: any }[] = [
    { id: 'upload', label: '1. Fájl feltöltés', icon: Upload },
    { id: 'chatgpt', label: '2. Szöveg generálás', icon: FileText },
    { id: 'claude', label: '3. HTML készítés', icon: Code },
    { id: 'preview', label: '4. Előnézet & Publikálás', icon: Eye }
  ];

  const getPhaseProgress = () => {
    const currentIndex = phases.findIndex(p => p.id === currentPhase);
    return ((currentIndex + 1) / phases.length) * 100;
  };

  // ========== PHASE 1: FILE UPLOAD (MULTIPLE FILES) OR DIRECT TEXT INPUT ==========
  
  // Direct text analysis function
  const analyzeDirectText = async () => {
    if (!directText.trim()) {
      toast({
        title: "Nincs szöveg",
        description: "Kérlek írj be szöveget az elemzéshez",
        variant: "destructive"
      });
      return;
    }

    setIsAnalyzing(true);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);
    
    try {
      // Send direct text to backend as text/plain
      const response = await fetch('/api/ai/enhanced-creator/analyze-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          files: [{
            fileData: directText,
            fileType: 'text/plain',
            fileName: 'direct_input.txt'
          }]
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 401) {
          throw new Error('Nincs bejelentkezve. Kérlek jelentkezz be admin felhasználóként.');
        } else if (response.status === 403) {
          throw new Error('Nincs jogosultságod az AI funkcióhoz. Csak admin használhatja.');
        }
        
        throw new Error(errorData.message || 'Hálózati hiba történt');
      }

      const data = await response.json();

      setFileAnalysis(data.analysis);
      setTitle(data.analysis.suggestedTitle);
      setDescription(data.analysis.suggestedDescription);
      if (data.analysis.suggestedClassroom) {
        setClassroom(data.analysis.suggestedClassroom);
      }

      toast({
        title: "Szöveg elemzés kész!",
        description: `${data.analysis.topics.length} témát találtunk`,
      });

      setCompletedPhases(prev => [...prev, 'upload']);
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        toast({
          title: "Időtúllépés",
          description: "A szöveg elemzése túl sokáig tartott. Próbáld meg rövidebb szöveggel.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Elemzési hiba",
          description: error.message || 'Ismeretlen hiba történt',
          variant: "destructive"
        });
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate file types
    const allowedTypes = [
      'application/pdf', 
      'image/jpeg', 
      'image/jpg', 
      'image/png',
      'application/msword', // DOC
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
      'text/plain' // TXT
    ];
    const invalidFiles = files.filter(file => !allowedTypes.includes(file.type));
    if (invalidFiles.length > 0) {
      toast({
        title: "Nem támogatott fájlok",
        description: `${invalidFiles.length} fájl nem támogatott. Csak PDF, DOC, DOCX, TXT és JPG/PNG fájlok tölthetők fel.`,
        variant: "destructive"
      });
      return;
    }

    // Calculate total size
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const maxSize = 30 * 1024 * 1024; // 30MB limit
    
    // Validate total file size (30MB limit)
    if (totalSize > maxSize) {
      toast({
        title: "Túl nagy fájlok",
        description: `Az összes fájl mérete (${(totalSize / 1024 / 1024).toFixed(2)} MB) meghaladja a maximum 30 MB-ot`,
        variant: "destructive"
      });
      return;
    }

    setSelectedFiles(files);
    setFileAnalysis(null);
    
    // Show success toast for each file
    files.forEach((file, index) => {
      setTimeout(() => {
        toast({
          title: `✅ Fájl feltöltve (${index + 1}/${files.length})`,
          description: `${file.name} • ${(file.size / 1024 / 1024).toFixed(2)} MB`,
        });
      }, index * 200); // Stagger toasts by 200ms each
    });
  };

  const analyzeFile = async () => {
    if (selectedFiles.length === 0) return;

    setIsAnalyzing(true);
    
    // Timeout and AbortController for network request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 180s timeout (3 minutes) for multiple files
    
    try {
      // Process all files
      const processedFiles: Array<{
        fileData: string;
        fileType: string;
        fileName: string;
      }> = [];
      
      // Initialize PDF.js worker once
      let pdfjsInitialized = false;
      
      for (const file of selectedFiles) {
        let fileData: string;
        let fileType: string;
        let fileName: string;

        // For DOC/DOCX: convert to HTML using mammoth (browser build)
        if (file.type === 'application/msword' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          try {
            // @ts-ignore - mammoth.browser has no type definitions but exists at runtime
            const mammoth = await import('mammoth/mammoth.browser');
            
            // Read DOCX as ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();
            
            // Convert DOCX to HTML
            const result = await mammoth.convertToHtml({ arrayBuffer });
            
            // Check for conversion messages/warnings
            if (result.messages && result.messages.length > 0) {
              console.warn('[DOCX] Conversion warnings:', result.messages);
            }
            
            // Store HTML content as text/html
            fileData = result.value; // This is the HTML string
            fileType = 'text/html';
            fileName = file.name;
            
            console.log('[DOCX] Converted to HTML:', {
              fileName,
              htmlLength: fileData.length,
              warningCount: result.messages?.length || 0
            });
          } catch (docxError: any) {
            console.error('[DOCX] Conversion failed:', docxError);
            throw new Error(
              `DOCX konverzió sikertelen (${file.name}). ` +
              `Kérlek próbáld meg PDF vagy JPG/PNG formátumban feltölteni. ` +
              `Hiba: ${docxError.message || 'Ismeretlen hiba'}`
            );
          }
        }
        // For PDFs: convert first page to PNG image
        else if (file.type === 'application/pdf') {
          if (!pdfjsInitialized) {
            const pdfjs = await import('pdfjs-dist');
            
            // Set worker source with error handling
            try {
              // Use local worker (served from public folder)
              pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.js';
              pdfjsInitialized = true;
            } catch (workerError) {
              console.error('[PDF Worker] Betöltési hiba:', workerError);
              throw new Error(
                'PDF worker inicializálása sikertelen. ' +
                'Kérlek próbáld újra vagy használj JPG/PNG formátumot.'
              );
            }
          }
          
          const pdfjs = await import('pdfjs-dist');
          
          // Read PDF as ArrayBuffer
          const arrayBuffer = await file.arrayBuffer();
          
          // Load PDF document with font configuration
          const pdf = await pdfjs.getDocument({
            data: arrayBuffer,
            standardFontDataUrl: '/pdfjs/standard_fonts/',
            useSystemFonts: false,
          }).promise;
          
          // Get first page
          const page = await pdf.getPage(1);
          
          // Set scale for good quality (2x for high DPI)
          const scale = 2.0;
          const viewport = page.getViewport({ scale });
          
          // Create canvas
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          
          if (!context) {
            console.error('[Canvas] Context létrehozása sikertelen', {
              canvas: canvas,
              browser: navigator.userAgent
            });
            
            throw new Error(
              'A böngésző nem támogatja a Canvas 2D renderelést. ' +
              'Kérlek használj egy modern böngészőt (Chrome, Firefox, Safari, Edge). ' +
              'Alternatívaként tölts fel JPG/PNG képet a PDF helyett.'
            );
          }
          
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          // Render PDF page to canvas
          const renderContext = {
            canvasContext: context,
            viewport: viewport,
            canvas: canvas
          };
          await page.render(renderContext).promise;
          
          // Convert canvas to PNG data URL
          fileData = canvas.toDataURL('image/png');
          
          // Update type to PNG since we converted it
          fileType = 'image/png';
          fileName = file.name.replace('.pdf', '_page1.png');
        } 
        // For TXT files: read as plain text
        else if (file.type === 'text/plain') {
          const reader = new FileReader();
          fileData = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsText(file, 'UTF-8');
          });
          fileType = 'text/plain';
          fileName = file.name;
          
          console.log('[TXT] Text file loaded:', {
            fileName,
            textLength: fileData.length
          });
        } else {
          // For images: read directly as base64
          const reader = new FileReader();
          fileData = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          fileType = file.type;
          fileName = file.name;
        }
        
        processedFiles.push({ fileData, fileType, fileName });
      }

      // Send all processed files to backend
      const response = await fetch('/api/ai/enhanced-creator/analyze-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          files: processedFiles
        }),
        signal: controller.signal // Add abort signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Check for authentication errors
        if (response.status === 401) {
          throw new Error('Nincs bejelentkezve. Kérlek jelentkezz be admin felhasználóként.');
        } else if (response.status === 403) {
          throw new Error('Nincs jogosultságod az AI funkcióhoz. Csak admin használhatja.');
        } else if (response.status === 503) {
          // Service temporarily unavailable - show informational toast
          toast({
            title: "Időszakos figyelmeztetés",
            description: "A szolgáltatás ideiglenesen túlterhelt, de a folyamat folytatódik a háttérben. Kérlek várj türelemmel!",
            variant: "default"
          });
          // Don't throw error - let the process continue
          return;
        }
        
        throw new Error(errorData.message || 'Hálózati hiba történt');
      }

      const data = await response.json();

      setFileAnalysis(data.analysis);
      setTitle(data.analysis.suggestedTitle);
      setDescription(data.analysis.suggestedDescription);
      if (data.analysis.suggestedClassroom) {
        setClassroom(data.analysis.suggestedClassroom);
      }

      toast({
        title: "Elemzés kész!",
        description: `${selectedFiles.length} fájl feldolgozva, ${data.analysis.topics.length} témát találtunk`,
      });

      setCompletedPhases(prev => [...prev, 'upload']);
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        toast({
          title: "Időtúllépés",
          description: "A fájlok elemzése túl sokáig tartott (180s). Próbáld kevesebb vagy kisebb fájllal.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Elemzési hiba",
          description: error.message || "Hiba történt a fájlok elemzése során",
          variant: "destructive"
        });
      }
    } finally {
      clearTimeout(timeoutId);
      setIsAnalyzing(false);
    }
  };

  // ========== PHASE 2: CHATGPT TEXT CHAT ==========
  const handleChatGptMessage = async (message: string) => {
    setIsChatGptLoading(true);
    
    // Add user message immediately with limit
    const userMessage: ChatMessage = { role: 'user', content: message };
    const updatedHistory = addMessageWithLimit(chatGptMessages, userMessage);
    setChatGptMessages(updatedHistory);

    try {
      const response = await fetch('/api/ai/enhanced-creator/chatgpt-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message,
          conversationHistory: updatedHistory,
          context: fileAnalysis
        })
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Nincs bejelentkezve. Kérlek jelentkezz be admin felhasználóként.');
        } else if (response.status === 403) {
          throw new Error('Nincs jogosultságod az AI funkcióhoz. Csak admin használhatja.');
        }
        throw new Error('Network response was not ok');
      }
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';
      let buffer = '';

      // Add initial assistant message
      setChatGptMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === 'content_delta') {
                assistantMessage += parsed.content;
                // Update the last assistant message with streaming content
                setChatGptMessages(prev => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = {
                    role: 'assistant',
                    content: assistantMessage
                  };
                  return newMessages;
                });
              } else if (parsed.type === 'error') {
                throw new Error(parsed.message);
              }
            } catch (e) {
              // Ignore parse errors for incomplete JSON
            }
          }
        }
      }

    } catch (error: any) {
      toast({
        title: "ChatGPT hiba",
        description: error.message,
        variant: "destructive"
      });
      // Remove the empty assistant message on error
      setChatGptMessages(prev => prev.slice(0, -1));
    } finally {
      setIsChatGptLoading(false);
    }
  };

  const finalizeChatGptPhase = () => {
    // Extract final text from conversation
    const lastAssistantMessage = [...chatGptMessages].reverse().find(m => m.role === 'assistant');
    if (lastAssistantMessage) {
      setFinalText(lastAssistantMessage.content);
      setCompletedPhases(prev => [...prev, 'chatgpt']);
      toast({
        title: "Szöveg véglegesítve",
        description: "Folytatás a HTML generálással"
      });
    }
  };

  // ========== PHASE 3: CLAUDE HTML CHAT ==========
  const handleClaudeMessage = async (message: string) => {
    setIsClaudeLoading(true);
    
    // Add user message with limit
    const userMessage: ChatMessage = { role: 'user', content: message };
    const updatedHistory = addMessageWithLimit(claudeMessages, userMessage);
    setClaudeMessages(updatedHistory);

    try {
      const response = await fetch('/api/ai/enhanced-creator/claude-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message,
          conversationHistory: updatedHistory,
          textContent: finalText,
          metadata: { title, description, classroom }
        })
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Nincs bejelentkezve. Kérlek jelentkezz be admin felhasználóként.');
        } else if (response.status === 403) {
          throw new Error('Nincs jogosultságod az AI funkcióhoz. Csak admin használhatja.');
        }
        throw new Error('Network response was not ok');
      }
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';
      let buffer = '';

      // Add initial assistant message
      setClaudeMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === 'content_delta') {
                assistantMessage += parsed.content;
                // Update the last assistant message with streaming content
                setClaudeMessages(prev => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = {
                    role: 'assistant',
                    content: assistantMessage
                  };
                  return newMessages;
                });
              } else if (parsed.type === 'html_generated') {
                setGeneratedHtml(parsed.html);
                toast({
                  title: "HTML elkészült!",
                  description: "Megtekintheted az előnézetben"
                });
              } else if (parsed.type === 'error') {
                throw new Error(parsed.message);
              }
            } catch (e) {
              // Ignore parse errors for incomplete JSON
            }
          }
        }
      }

    } catch (error: any) {
      toast({
        title: "Claude hiba",
        description: error.message,
        variant: "destructive"
      });
      // Remove the empty assistant message on error
      setClaudeMessages(prev => prev.slice(0, -1));
    } finally {
      setIsClaudeLoading(false);
    }
  };

  const finalizeClaudePhase = () => {
    if (!generatedHtml) {
      toast({
        title: "Nincs HTML",
        description: "Kérd meg Claude-ot, hogy generáljon HTML-t",
        variant: "destructive"
      });
      return;
    }
    setCompletedPhases(prev => [...prev, 'claude']);
  };

  // ========== PHASE 4: PUBLISH ==========
  const handlePublish = async () => {
    if (!generatedHtml || !title) {
      toast({
        title: "Hiányzó adatok",
        description: "HTML és cím megadása kötelező",
        variant: "destructive"
      });
      return;
    }

    setIsPublishing(true);

    try {
      // ✅ JAVÍTÁS: Automatikus osztály hozzáadása a címhez
      const titleWithClassroom = ensureClassroomInTitle(title, classroom);
      
      const response = await fetch('/api/html-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: titleWithClassroom,
          description,
          content: generatedHtml
          // ✅ classroom mező TÖRÖLVE - a backend a címből kinyeri
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Nem sikerült publikálni az anyagot`);
      }

      await queryClient.invalidateQueries({ queryKey: ['/api/html-files'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/materials'] });

      toast({
        title: "✅ Sikeres publikálás!",
        description: "Az anyag felkerült a platformra"
      });

      // Reset wizard
      resetWizard();

    } catch (error: any) {
      // ✅ JAVÍTÁS: Részletesebb hibaüzenet
      const errorMessage = error.message || 'Ismeretlen hiba történt a publikálás során.';
      
      toast({
        title: "Publikálási hiba",
        description: errorMessage,
        variant: "destructive"
      });
      
      // ✅ JAVÍTÁS: Konzol logolás debug céljából
      console.error('[EnhancedMaterialCreator] Publikálási hiba:', {
        error: error,
        title: title,
        classroom: classroom,
        hasHtml: !!generatedHtml
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const resetWizard = () => {
    setCurrentPhase('upload');
    setCompletedPhases([]);
    setSelectedFiles([]);
    setDirectText("");
    setInputMode('file');
    setFileAnalysis(null);
    setChatGptMessages([]);
    setClaudeMessages([]);
    setFinalText("");
    setGeneratedHtml("");
    setTitle("");
    setDescription("");
    setClassroom(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Ha nincs bejelentkezve, csak figyelmeztetést mutatunk
  if (!isAuthLoading && !isAuthenticated) {
    return (
      <div className="max-w-7xl mx-auto p-4">
        <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950" data-testid="auth-warning-alert">
          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertTitle className="text-yellow-800 dark:text-yellow-200 text-lg font-semibold">Bejelentkezés szükséges</AlertTitle>
          <AlertDescription className="text-yellow-700 dark:text-yellow-300 space-y-3">
            <p>Az anyagok feltöltéséhez és az AI funkciók használatához be kell jelentkezned admin fiókkal.</p>
            <a 
              href="/api/login" 
              className="inline-block"
            >
              <Button variant="default" className="gap-2" data-testid="button-login-from-creator">
                <LogIn className="h-4 w-4" />
                Bejelentkezés
              </Button>
            </a>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      {/* Progress Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Fejlett Anyagkészítő
          </CardTitle>
          <CardDescription>
            3 lépéses AI-alapú workflow: Fájl → ChatGPT → Claude → Publikálás
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Progress value={getPhaseProgress()} className="h-2" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {phases.map((phase) => {
                const Icon = phase.icon;
                const isCompleted = completedPhases.includes(phase.id);
                const isCurrent = currentPhase === phase.id;

                return (
                  <Button
                    key={phase.id}
                    variant={isCurrent ? "default" : isCompleted ? "secondary" : "outline"}
                    size="sm"
                    className="justify-start gap-2"
                    onClick={() => {
                      if (isCompleted || isCurrent) {
                        setCurrentPhase(phase.id);
                      }
                    }}
                    disabled={!isCompleted && !isCurrent}
                    data-testid={`phase-button-${phase.id}`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden md:inline">{phase.label}</span>
                    {isCompleted && <CheckCircle2 className="w-4 h-4 ml-auto text-green-500" />}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Phase Content */}
      <Tabs value={currentPhase} onValueChange={(v) => setCurrentPhase(v as Phase)}>
        {/* PHASE 1: Upload */}
        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>📁 1. Fázis: Fájl feltöltés és elemzés</CardTitle>
              <CardDescription>
                Tölts fel fájlt (PDF, DOCX, TXT, JPG/PNG) vagy írj be közvetlenül szöveget. Az AI elemzi a tartalmat és javaslatot tesz.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Input Mode Toggle */}
              <div className="flex gap-2 justify-center mb-4">
                <Button
                  variant={inputMode === 'file' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setInputMode('file')}
                  data-testid="mode-file-button"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Fájl feltöltés
                </Button>
                <Button
                  variant={inputMode === 'text' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setInputMode('text')}
                  data-testid="mode-text-button"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Szöveg beírása
                </Button>
              </div>

              {/* File Upload Mode */}
              {inputMode === 'file' && (
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,image/jpeg,image/jpg,image/png,text/plain"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    data-testid="file-input"
                  />
                  {selectedFiles.length === 0 ? (
                    <div className="space-y-4">
                      <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
                      <div>
                        <Button
                          onClick={() => fileInputRef.current?.click()}
                          data-testid="file-upload-button"
                        >
                          Fájlok kiválasztása
                        </Button>
                        <p className="text-sm text-muted-foreground mt-2">
                          PDF, DOCX, TXT vagy JPG/PNG • Több fájl • Maximum 30MB összesen
                        </p>
                      </div>
                    </div>
                  ) : (
                  <div className="space-y-4">
                    <FileText className="w-12 h-12 mx-auto text-primary" />
                    <div className="space-y-2">
                      <p className="font-medium">{selectedFiles.length} fájl kiválasztva</p>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {selectedFiles.map((file, index) => (
                          <div key={index} className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                            <FileText className="w-3 h-3" />
                            <span className="truncate max-w-xs">{file.name}</span>
                            <span className="text-xs">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Összesen: {(selectedFiles.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <div className="flex gap-2 justify-center">
                      <Button
                        onClick={() => fileInputRef.current?.click()}
                        variant="outline"
                        size="sm"
                        data-testid="button-change-file"
                      >
                        Másik fájlok
                      </Button>
                      <Button
                        onClick={() => {
                          setSelectedFiles([]);
                          setFileAnalysis(null);
                          if (fileInputRef.current) {
                            fileInputRef.current.value = "";
                          }
                        }}
                        variant="destructive"
                        size="sm"
                        data-testid="button-remove-file"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Törlés
                      </Button>
                      <Button
                        onClick={analyzeFile}
                        disabled={isAnalyzing}
                        data-testid="analyze-button"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ChatGPT dolgozik...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Elemzés indítása
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
                </div>
              )}

              {/* Text Input Mode */}
              {inputMode === 'text' && (
                <div className="space-y-4">
                  <div className="border-2 border-dashed rounded-lg p-6">
                    <Label className="text-base font-medium mb-2 block">Írd be a tananyag szövegét</Label>
                    <Textarea
                      value={directText}
                      onChange={(e) => setDirectText(e.target.value)}
                      placeholder="Másold be ide a tananyag szövegét, vagy írj közvetlenül..."
                      className="min-h-[200px] text-base"
                      data-testid="direct-text-input"
                    />
                    <div className="flex items-center justify-between mt-3">
                      <p className="text-sm text-muted-foreground">
                        {directText.length} karakter
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDirectText("")}
                          disabled={!directText || isAnalyzing}
                          data-testid="button-clear-text"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Törlés
                        </Button>
                        <Button
                          onClick={analyzeDirectText}
                          disabled={!directText.trim() || isAnalyzing}
                          data-testid="analyze-text-button"
                        >
                          {isAnalyzing ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ChatGPT dolgozik...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 mr-2" />
                              Szöveg elemzése
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Linear Progress Indicator when analyzing */}
              {isAnalyzing && (
                <Card className="bg-gradient-to-r from-cyan-50 to-yellow-50 dark:from-cyan-950/20 dark:to-yellow-950/20 border-2 border-cyan-200 dark:border-cyan-800">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      <div className="flex-1">
                        <p className="font-bold text-lg">ChatGPT elemzi a fájlokat...</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium mt-1">
                          <Clock className="w-4 h-4" />
                          <span>Ez akár <strong>1 percig</strong> is tarthat. Kérlek várj türelemmel és ne zárd be az oldalt!</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <Lightbulb className="w-4 h-4" />
                          <span>A folyamat a háttérben fut, ha időszakos figyelmeztetések jelennek meg, az normális.</span>
                        </div>
                      </div>
                    </div>
                    <Progress value={undefined} className="w-full h-2" />
                  </CardContent>
                </Card>
              )}

              {/* Analysis Results */}
              {fileAnalysis && (
                <Card className="bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      Elemzési eredmény
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Javasolt cím</Label>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        data-testid="title-input"
                      />
                    </div>
                    <div>
                      <Label>Javasolt leírás</Label>
                      <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        data-testid="description-input"
                      />
                    </div>
                    <div>
                      <Label>Javasolt osztály</Label>
                      <Input
                        type="number"
                        min={1}
                        max={8}
                        value={classroom}
                        onChange={(e) => setClassroom(parseInt(e.target.value) || 1)}
                        data-testid="classroom-input"
                      />
                    </div>
                    <div>
                      <Label>Talált témák</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {fileAnalysis.topics.map((topic, i) => (
                          <Badge key={i} variant="secondary">{topic}</Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label>Kinyert szöveg (első 500 karakter)</Label>
                      <ScrollArea className="h-32 border rounded-md p-4 mt-2">
                        <p className="text-sm whitespace-pre-wrap">
                          {fileAnalysis.extractedText.substring(0, 500)}...
                        </p>
                      </ScrollArea>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      onClick={() => {
                        // Initialize ChatGPT chat with context if empty
                        if (chatGptMessages.length === 0 && fileAnalysis) {
                          const contextMessage: ChatMessage = {
                            role: 'assistant',
                            content: `📚 **Dokumentum elemezve!**

**Témák:** ${fileAnalysis.topics.join(', ')}

**Kinyert szöveg:**
${fileAnalysis.extractedText}

---

Miben segíthetek? Szeretnéd, hogy készítsek egy strukturált tananyag szöveget ezekből a témákból?`
                          };
                          setChatGptMessages([contextMessage]);
                        }
                        
                        setCurrentPhase('chatgpt');
                        const newPhases = [...completedPhases];
                        if (!newPhases.includes('upload')) {
                          newPhases.push('upload');
                        }
                        setCompletedPhases(newPhases);
                      }}
                      disabled={isAnalyzing}
                      className="w-full"
                      data-testid="next-to-chatgpt-button"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Kérlek várj...
                        </>
                      ) : (
                        <>
                          Tovább a szöveg generáláshoz
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PHASE 2: ChatGPT */}
        <TabsContent value="chatgpt" className="space-y-4">
          {/* Context Info Panel */}
          {fileAnalysis && (
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Dokumentum kontextus
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Témák ({fileAnalysis.topics.length} db)</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {fileAnalysis.topics.map((topic, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{topic}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Kinyert szöveg</Label>
                  <ScrollArea className="h-24 border rounded-md p-2 mt-1 bg-background">
                    <p className="text-xs whitespace-pre-wrap">
                      {fileAnalysis.extractedText}
                    </p>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* ChatGPT System Prompt Editor */}
          <SystemPromptEditor
            promptId="enhanced_creator_chatgpt"
            title="ChatGPT Paraméterezés"
            description="Szabd testre hogyan dolgozzon a ChatGPT (stílus, részletesség, célcsoport)"
            defaultPrompt={DEFAULT_CHATGPT_PROMPT}
            helpText="Adj meg egyedi utasításokat ChatGPT számára. Például: ok-okozati összefüggések, tanári magyarázatok, részletes kifejtés. A prompt automatikusan mentésre kerül és minden következő tananyagnál használva lesz, amíg nem változtatod meg."
            onPromptChange={setChatGptSystemPrompt}
          />
          
          <Card>
            <CardHeader>
              <CardTitle>💬 2. Fázis: ChatGPT szöveg generálás</CardTitle>
              <CardDescription>
                Beszélgess ChatGPT-vel a szöveges tartalom elkészítéséhez. Finomítsd iteratívan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[600px]">
                <ChatInterface
                  title="ChatGPT - Szöveg asszisztens"
                  description="Készíts tananyag szöveget a dokumentum alapján"
                  messages={chatGptMessages}
                  onSendMessage={handleChatGptMessage}
                  isLoading={isChatGptLoading}
                  placeholder="Pl: 'Készíts egy strukturált szöveget a témákról'"
                  aiName="ChatGPT"
                  aiIcon={<FileText className="w-5 h-5 text-primary" />}
                />
              </div>
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setCurrentPhase('upload')}
                disabled={isChatGptLoading}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Vissza
              </Button>
              <Button
                onClick={() => {
                  finalizeChatGptPhase();
                  
                  // Initialize Claude chat with text content if empty
                  if (claudeMessages.length === 0) {
                    const lastAssistantMessage = [...chatGptMessages].reverse().find(m => m.role === 'assistant');
                    if (lastAssistantMessage) {
                      const contextMessage: ChatMessage = {
                        role: 'assistant',
                        content: `🎨 **Szöveg véglegesítve!**

Most készítsük el az interaktív HTML tananyagot. Itt van a szöveges tartalom:

---

${lastAssistantMessage.content}

---

Miben segíthetek? Szeretnél egy interaktív HTML-t ezzel a tartalommal?`
                      };
                      setClaudeMessages([contextMessage]);
                    }
                  }
                  
                  setCurrentPhase('claude');
                }}
                disabled={chatGptMessages.length === 0 || isChatGptLoading}
                className="flex-1"
                data-testid="finalize-chatgpt-button"
              >
                {isChatGptLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Feldolgozás...
                  </>
                ) : (
                  <>
                    Szöveg véglegesítése és tovább
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* PHASE 3: Claude */}
        <TabsContent value="claude" className="space-y-4">
          {/* Context Info Panel - only show if no HTML generated yet */}
          {finalText && !generatedHtml && (
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Szöveges tartalom
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-32 border rounded-md p-3 bg-background">
                  <p className="text-sm whitespace-pre-wrap">
                    {finalText}
                  </p>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
          
          {/* Claude System Prompt Editor - only show if no HTML generated yet */}
          {!generatedHtml && (
            <SystemPromptEditor
              promptId="enhanced_creator_claude"
              title="Claude Paraméterezés"
              description="Szabd testre hogyan készítse Claude a HTML tananyagot (dizájn, interaktivitás, osztályonkénti stílus)"
              defaultPrompt={DEFAULT_CLAUDE_PROMPT}
              helpText="Adj meg egyedi utasításokat Claude számára. Például: Artifact HTML használat, edu- prefix CSS osztályok, osztályonkénti dizájn (4. osztály: vidám, 5-7: autós fiús, 8+: melankolikus). A prompt automatikusan mentésre kerül és minden következő tananyagnál használva lesz."
              onPromptChange={setClaudeSystemPrompt}
            />
          )}
          
          {/* HTML Preview Panel - shown when HTML is generated */}
          {generatedHtml && !isClaudeLoading && (
            <Card className="border-2 border-green-500 dark:border-green-600 bg-gradient-to-br from-green-50/50 to-emerald-50/50 dark:from-green-950/20 dark:to-emerald-950/20">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
                  <CheckCircle2 className="w-5 h-5" />
                  HTML elkészült!
                </CardTitle>
                <CardDescription className="text-green-600 dark:text-green-500">
                  Nézd meg az előnézetet, és válassz: elfogadod vagy módosítást kérsz?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* HTML Preview iframe */}
                <div className="border-2 border-border rounded-lg overflow-hidden bg-white">
                  <div className="bg-muted px-3 py-2 border-b flex items-center gap-2">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Előnézet</span>
                  </div>
                  <iframe
                    srcDoc={generatedHtml}
                    className="w-full h-[400px]"
                    title="HTML Preview"
                    sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin allow-downloads"
                    allow="autoplay; fullscreen; clipboard-write; microphone"
                    data-testid="claude-preview-iframe"
                  />
                </div>
                
                {/* Accept / Modify buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    variant="default"
                    size="lg"
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => {
                      finalizeClaudePhase();
                      setCurrentPhase('preview');
                      toast({
                        title: "HTML elfogadva!",
                        description: "Tovább a publikáláshoz",
                      });
                    }}
                    data-testid="accept-html-button"
                  >
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                    Elfogadom - Tovább a publikáláshoz
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="flex-1 border-amber-500 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                    onClick={() => {
                      // Scroll to chat input for modification request
                      const chatInput = document.querySelector('[data-testid="chat-input"]');
                      if (chatInput) {
                        chatInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        (chatInput as HTMLElement).focus();
                      }
                      toast({
                        title: "Módosítás kérése",
                        description: "Írd le a chat mezőbe, mit szeretnél változtatni",
                      });
                    }}
                    data-testid="modify-html-button"
                  >
                    <Sparkles className="w-5 h-5 mr-2" />
                    Módosítást kérek
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          
          <Card>
            <CardHeader>
              <CardTitle>🎨 3. Fázis: Claude HTML generálás</CardTitle>
              <CardDescription>
                {generatedHtml 
                  ? "Ha módosítást szeretnél, írd le a chat mezőbe mit változtassak!"
                  : "Claude elkészíti az interaktív HTML tananyagot. Kérd el a változtatásokat!"
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Loading indicator for Claude HTML generation */}
              {isClaudeLoading && (
                <Card className="mb-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border-2 border-purple-200 dark:border-purple-800">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      <div className="flex-1">
                        <p className="font-bold text-lg">Claude készíti a HTML-t...</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium mt-1">
                          <Clock className="w-4 h-4" />
                          <span>Ez akár <strong>30-60 másodpercig</strong> is tarthat. Kérlek várj türelemmel!</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <Lightbulb className="w-4 h-4" />
                          <span>Claude Artifact HTML-t készít, ami interaktív és látványos lesz.</span>
                        </div>
                      </div>
                    </div>
                    <Progress value={undefined} className="w-full h-2" />
                  </CardContent>
                </Card>
              )}
              
              <div className={generatedHtml ? "h-[350px]" : "h-[600px]"}>
                <ChatInterface
                  title="Claude - HTML szakértő"
                  description={generatedHtml ? "Kérj módosítást az elkészült HTML-hez" : "Interaktív HTML tananyag készítése"}
                  messages={claudeMessages}
                  onSendMessage={handleClaudeMessage}
                  isLoading={isClaudeLoading}
                  placeholder={generatedHtml ? "Pl: 'A kvíz gombjai legyenek nagyobbak'" : "Pl: 'Készíts egy interaktív HTML-t kvízzel'"}
                  aiName="Claude"
                  aiIcon={<Code className="w-5 h-5 text-primary" />}
                />
              </div>
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setCurrentPhase('chatgpt')}
                disabled={isClaudeLoading}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Vissza
              </Button>
              {!generatedHtml && (
                <Button
                  onClick={() => {
                    finalizeClaudePhase();
                    setCurrentPhase('preview');
                  }}
                  disabled={!generatedHtml || isClaudeLoading}
                  className="flex-1"
                  data-testid="finalize-claude-button"
                >
                  {isClaudeLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Feldolgozás...
                    </>
                  ) : (
                    <>
                      HTML véglegesítése és előnézet
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              )}
            </CardFooter>
          </Card>
        </TabsContent>

        {/* PHASE 4: Preview & Publish */}
        <TabsContent value="preview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>👁️ 4. Fázis: Előnézet és publikálás</CardTitle>
              <CardDescription>
                Ellenőrizd az anyagot és publikáld a platformon
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!generatedHtml ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    Nincs még HTML generálva. Menj vissza a Claude fázishoz.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label>Anyag címe</Label>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        data-testid="preview-title-input"
                      />
                    </div>
                    <div>
                      <Label>Osztály</Label>
                      <Input
                        type="number"
                        min={1}
                        max={8}
                        value={classroom}
                        onChange={(e) => setClassroom(parseInt(e.target.value) || 1)}
                        data-testid="preview-classroom-input"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label>Leírás</Label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      data-testid="preview-description-input"
                    />
                  </div>

                  <div>
                    <Label>HTML előnézet</Label>
                    <ScrollArea className="h-96 border rounded-lg mt-2">
                      <iframe
                        srcDoc={generatedHtml}
                        className="w-full h-full min-h-[600px]"
                        title="HTML Preview"
                        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin allow-downloads"
                        allow="autoplay; fullscreen; clipboard-write; microphone"
                      />
                    </ScrollArea>
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setCurrentPhase('claude')}
                disabled={isPublishing}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Vissza
              </Button>
              <Button
                onClick={handlePublish}
                disabled={!generatedHtml || !title || isPublishing}
                className="flex-1"
                data-testid="publish-button"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Publikálás...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Publikálás a platformon
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
