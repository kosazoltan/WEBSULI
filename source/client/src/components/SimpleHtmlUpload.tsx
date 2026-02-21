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
      title: "Fájl beolvasása...",
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
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 dark:from-gray-900 dark:via-orange-950 dark:to-amber-950 py-2 sm:py-4 px-3 sm:px-4">
      <div className="max-w-4xl mx-auto">
        <Card className="shadow-2xl border-4 border-orange-400/60 dark:border-orange-600/60 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-2xl">
          <CardHeader className="bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-300 text-gray-900 rounded-t-2xl border-b-4 border-orange-600/40 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg sm:text-xl font-extrabold drop-shadow-sm">🚀 Új HTML anyag feltöltése</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={onCancel}
                disabled={isPending}
                className="hover:bg-white/30 text-gray-900 hover:text-gray-900"
                data-testid="button-cancel-upload"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-3 sm:pt-4 pb-3 sm:pb-4">
          <form onSubmit={handleSubmit} className="space-y-1.5 sm:space-y-2">
            {/* Osztály választó */}
            <div className="space-y-1">
              <Label htmlFor="classroom" className="text-xs sm:text-sm font-semibold flex items-center gap-2">
                🎓 Osztály *
              </Label>
              <Select 
                value={classroom.toString()} 
                onValueChange={(value) => setClassroom(parseInt(value))}
                disabled={isPending}
              >
                <SelectTrigger 
                  id="classroom" 
                  className="text-sm sm:text-base h-8 sm:h-9"
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
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                💡 1-12. osztálynál automatikusan hozzáadódik a cím elejéhez
              </p>
            </div>

            {/* Cím mező */}
            <div className="space-y-1">
              <Label htmlFor="title" className="text-xs sm:text-sm font-semibold flex items-center gap-2">
                📝 Cím *
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='Pl: "Matematika szorzótábla" vagy "5. osztály - Földrajz"'
                required
                disabled={isPending}
                className="text-sm sm:text-base h-8 sm:h-9"
                data-testid="input-title"
              />
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                💡 Ha a címben már szerepel az osztály, az fog érvényesülni
              </p>
            </div>

            {/* HTML tartalom mező */}
            <div className="space-y-1">
              <Label htmlFor="content" className="text-xs sm:text-sm font-semibold flex items-center gap-2">
                💻 HTML tartalom *
              </Label>
              
              {/* Fájl feltöltés gomb - OPCIONÁLIS */}
              <div className="flex gap-2 mb-1">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-9 text-xs sm:text-sm bg-gradient-to-r from-orange-100 to-amber-100 dark:from-orange-800/40 dark:to-amber-800/40 hover:from-orange-200 hover:to-amber-200 dark:hover:from-orange-700/50 dark:hover:to-amber-700/50 border-2 border-orange-400 dark:border-orange-500 font-bold text-orange-900 dark:text-orange-200"
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
                  <Upload className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
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
              
              {/* HTML kód textarea */}
              <Textarea
                id="content"
                value={content}
                onChange={(e) => {
                  const newValue = e.target.value;
                  // Removed debug console.log for production
                  setContent(newValue);
                }}
                placeholder="Illeszd be a HTML kódot ide..."
                required
                disabled={isPending}
                rows={10}
                className="font-mono text-xs bg-gray-50 dark:bg-gray-950"
                data-testid="input-content"
              />
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <span className="font-mono">{content.length.toLocaleString()}</span> karakter
                {content.length > 0 && !content.trim() && <span className="text-destructive">⚠️ Csak whitespace</span>}
              </p>
            </div>

            {/* Akció gombok */}
            <div className="flex flex-col sm:flex-row gap-2 pt-1.5 sm:pt-2 border-t border-orange-300 dark:border-orange-700">
              <Button
                type="submit"
                disabled={!title.trim() || !content.trim() || isPending}
                className="w-full sm:flex-1 h-8 sm:h-9 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-extrabold shadow-xl text-sm border-2 border-teal-600"
                data-testid="button-submit-upload"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    <span className="truncate">Feltöltés...</span>
                  </>
                ) : (
                  <>
                    <FileCode className="w-4 h-4 mr-2" />
                    🚀 Feltöltés
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isPending}
                className="w-full sm:w-auto h-8 sm:h-9 text-sm"
                data-testid="button-cancel-upload-bottom"
              >
                Mégse
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
