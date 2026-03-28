import { useState } from "react";
import { Upload, FileCode, X, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CLASSROOMS, DEFAULT_CLASSROOM, getClassroomLabel } from "@shared/classrooms";

interface SimpleHtmlUploadProps {
  onUpload: (data: { title: string; content: string; description?: string; classroom: number }) => void;
  onCancel: () => void;
  isPending?: boolean;
}

export default function SimpleHtmlUpload({ onUpload, onCancel, isPending = false }: SimpleHtmlUploadProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [classroom, setClassroom] = useState<number>(DEFAULT_CLASSROOM);
  const { toast } = useToast();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    // STOP EVENT PROPAGATION - prevent accidental form close
    event.stopPropagation();
    
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    toast({
      title: "Fájl beolvasása…",
      description: `${file.name} (${Math.round(file.size / 1024)} KB)`,
    });

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      
      if (!result || result.trim().length === 0) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[FILE UPLOAD] Empty file result');
        }
        toast({ 
          title: "Üres fájl", 
          description: "A kiválasztott fájl üres",
          variant: "destructive" 
        });
        return;
      }
      
      setContent(result);
      setFileName(file.name);
      
      if (!title) {
        const extractedTitle = file.name.replace(/\.(html|htm)$/i, '');
        setTitle(extractedTitle);
      }
      
      toast({
        title: "✅ Fájl betöltve!",
        description: `${Math.round(result.length / 1024)} KB betöltve`,
      });
    };
    
    reader.onerror = (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('[FILE UPLOAD] FileReader error:', error);
      }
      toast({
        title: "Fájl olvasási hiba",
        description: "Nem sikerült beolvasni a fájlt",
        variant: "destructive"
      });
    };
    
    reader.readAsText(file, 'UTF-8');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling
    
    if (!title.trim() || !content.trim()) {
      toast({
        title: "Hiányzó adatok",
        description: "A cím és a tartalom mezők kitöltése kötelező",
        variant: "destructive"
      });
      return;
    }

    // Automatikus osztály hozzáadás, ha hiányzik a címből
    // KIVÉTEL: Programozási alapismeretek (classroom 0) esetén NE adjuk hozzá a címhez
    const finalTitle = title.match(/\d+\.?\s*osztály/i) || classroom === 0
      ? title.trim() 
      : `${getClassroomLabel(classroom, false)} - ${title.trim()}`;

    onUpload({
      title: finalTitle,
      content: content.trim(),
      description: description.trim() || undefined,
      classroom: Number(classroom), // Convert string to number
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] sm:h-[calc(100vh-5.5rem)] px-1 sm:px-2">
      <Card className="flex flex-col flex-1 min-h-0 shadow-xl border-2 border-orange-400/60 dark:border-orange-600/60 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-xl">
        <CardHeader className="flex-shrink-0 bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-300 text-gray-900 rounded-t-xl border-b-2 border-orange-600/40 py-2 px-3 sm:px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm sm:text-base font-extrabold drop-shadow-sm">🚀 Új HTML anyag feltöltése</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onCancel}
              disabled={isPending}
              className="hover:bg-white/30 text-gray-900 hover:text-gray-900 h-7 w-7"
              data-testid="button-cancel-upload"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 flex flex-col pt-2 pb-2 px-3 sm:px-4">
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-1.5">
            {/* Osztály + Cím egymás mellett desktopon */}
            <div className="flex-shrink-0 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {/* Osztály választó */}
              <div className="space-y-0.5">
                <Label htmlFor="classroom" className="text-xs font-semibold flex items-center gap-1">
                  🎓 Osztály *
                </Label>
                <Select
                  value={classroom.toString()}
                  onValueChange={(value) => setClassroom(parseInt(value))}
                  disabled={isPending}
                >
                  <SelectTrigger
                    id="classroom"
                    className="text-xs sm:text-sm h-8"
                    data-testid="select-classroom"
                  >
                    <SelectValue placeholder="Válassz osztályt" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASSROOMS.map((option) => (
                      <SelectItem key={option.value} value={option.value.toString()}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cím mező */}
              <div className="space-y-0.5">
                <Label htmlFor="title" className="text-xs font-semibold flex items-center gap-1">
                  📝 Cím *
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder='Pl: "Matematika szorzótábla"'
                  required
                  disabled={isPending}
                  className="text-xs sm:text-sm h-8"
                  data-testid="input-title"
                />
              </div>
            </div>

            {/* HTML tartalom mező - flex-1 kitölti a maradék helyet */}
            <div className="flex-1 min-h-0 flex flex-col gap-1">
              <div className="flex-shrink-0 flex items-center justify-between">
                <Label htmlFor="content" className="text-xs font-semibold flex items-center gap-1">
                  💻 HTML tartalom *
                </Label>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {content.length > 0 && `${content.length.toLocaleString()} kar.`}
                  {content.length > 0 && !content.trim() && <span className="text-destructive ml-1">⚠️ whitespace</span>}
                </span>
              </div>

              {/* Fájl feltöltés gomb */}
              <div className="flex-shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-8 text-xs bg-gradient-to-r from-orange-100 to-amber-100 dark:from-orange-800/40 dark:to-amber-800/40 hover:from-orange-200 hover:to-amber-200 dark:hover:from-orange-700/50 dark:hover:to-amber-700/50 border-2 border-orange-400 dark:border-orange-500 font-bold text-orange-900 dark:text-orange-200"
                  disabled={isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const input = document.getElementById('file-input') as HTMLInputElement;
                    if (input) {
                      input.click();
                    } else if (process.env.NODE_ENV === 'development') {
                      console.error('[BUTTON CLICK] Input element NOT found!');
                    }
                  }}
                  data-testid="button-browse-file"
                >
                  <Upload className="w-3 h-3 mr-1" />
                  <span className="truncate">{fileName ? `✓ ${fileName}` : '📁 Fájl tallózása'}</span>
                </Button>
                <input
                  id="file-input"
                  type="file"
                  accept=".html,.htm"
                  onChange={(e) => {
                    handleFileUpload(e);
                  }}
                  className="hidden"
                  disabled={isPending}
                />
              </div>

              {/* HTML kód textarea - kitölti a maradék helyet */}
              <Textarea
                id="content"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                }}
                placeholder="Illeszd be a HTML kódot ide…"
                required
                disabled={isPending}
                className="flex-1 min-h-[80px] resize-none font-mono text-xs bg-gray-50 dark:bg-gray-950"
                data-testid="input-content"
              />
            </div>

            {/* Akció gombok */}
            <div className="flex-shrink-0 flex flex-row gap-2 pt-1 border-t border-orange-300 dark:border-orange-700">
              <Button
                type="submit"
                disabled={!title.trim() || !content.trim() || isPending}
                className="flex-1 h-8 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-extrabold shadow-xl text-xs sm:text-sm border-2 border-orange-600"
                data-testid="button-submit-upload"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Feltöltés…
                  </>
                ) : (
                  <>
                    <FileCode className="w-3.5 h-3.5 mr-1.5" />
                    🚀 Feltöltés
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isPending}
                className="h-8 text-xs sm:text-sm px-4"
                data-testid="button-cancel-upload-bottom"
              >
                Mégse
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
