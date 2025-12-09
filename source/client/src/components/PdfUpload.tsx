import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, 
  FileText, 
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Eye
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { CLASSROOMS, DEFAULT_CLASSROOM } from "@shared/classrooms";

export default function PdfUpload() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classroom, setClassroom] = useState<string>(DEFAULT_CLASSROOM.toString());
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (data: { 
      title: string; 
      description: string; 
      classroom: number;
      content: string;
      contentType: string;
    }) => {
      return await apiRequest("POST", "/api/html-files", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/html-files"] });
      toast({
        title: "✅ PDF sikeresen feltöltve!",
        description: "A PDF anyag elérhető a főoldalon.",
      });
      // Reset form
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Hiba történt",
        description: error.message || "Nem sikerült feltölteni a PDF-et",
        variant: "destructive",
      });
    }
  });

  const processFile = (file: File) => {
    // Validate file type
    if (file.type !== 'application/pdf') {
      toast({
        title: "Nem támogatott fájl",
        description: "Csak PDF fájlok tölthetők fel.",
        variant: "destructive"
      });
      return;
    }

    // Validate file size (50MB limit)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      toast({
        title: "Túl nagy fájl",
        description: `A fájl mérete (${(file.size / 1024 / 1024).toFixed(2)} MB) meghaladja a maximum 50 MB-ot`,
        variant: "destructive"
      });
      return;
    }

    setSelectedFile(file);
    
    // Create preview URL
    const objectUrl = URL.createObjectURL(file);
    setFilePreviewUrl(objectUrl);
    
    // Auto-fill title from filename (remove .pdf extension)
    if (!title) {
      const autoTitle = file.name.replace(/\.pdf$/i, '');
      setTitle(autoTitle);
    }

    toast({
      title: "✅ PDF kiválasztva",
      description: `${file.name} • ${(file.size / 1024 / 1024).toFixed(2)} MB`,
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: "Nincs fájl kiválasztva",
        description: "Kérlek válassz ki egy PDF fájlt!",
        variant: "destructive"
      });
      return;
    }

    if (!title.trim()) {
      toast({
        title: "Hiányzó cím",
        description: "Add meg az anyag címét!",
        variant: "destructive"
      });
      return;
    }

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Content = event.target?.result as string;
        
        if (!base64Content) {
          throw new Error("Nem sikerült beolvasni a fájlt");
        }

        // Upload PDF
        await uploadMutation.mutateAsync({
          title: title.trim(),
          description: description.trim(),
          classroom: parseInt(classroom),
          content: base64Content,
          contentType: 'pdf'
        });
      };

      reader.onerror = () => {
        throw new Error("Fájl olvasási hiba");
      };

      reader.readAsDataURL(selectedFile);
    } catch (error: any) {
      toast({
        title: "Hiba",
        description: error.message || "Nem sikerült feltölteni a PDF-et",
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setTitle("");
    setDescription("");
    setClassroom("1");
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = () => {
    resetForm();
    toast({
      title: "Fájl eltávolítva",
      description: "A kiválasztott PDF el lett távolítva",
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            PDF Feltöltés
          </CardTitle>
          <CardDescription>
            Tölts fel egy PDF fájlt közvetlenül, AI konverzió nélkül. A PDF natív böngésző viewerben jelenik meg.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* File Upload Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              selectedFile 
                ? 'border-green-500 bg-green-50 dark:bg-green-950/20' 
                : 'border-muted-foreground/25 hover:border-primary hover:bg-accent/50'
            }`}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            data-testid="pdf-upload-dropzone"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-pdf-file"
            />

            {!selectedFile ? (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="rounded-full bg-primary/10 p-4">
                    <Upload className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2">
                    Húzd ide a PDF fájlt vagy kattints a tallózáshoz
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Támogatott formátum: PDF • Maximum méret: 50 MB
                  </p>
                  <Button 
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-browse-pdf"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Fájl tallózása
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="rounded-full bg-green-500/10 p-4">
                    <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2 flex items-center justify-center gap-2">
                    <FileText className="h-5 w-5" />
                    {selectedFile.name}
                  </h3>
                  <Badge variant="secondary" className="mb-4" data-testid="badge-file-size">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </Badge>
                  <div className="flex gap-2 justify-center">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleRemoveFile}
                      data-testid="button-remove-pdf"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eltávolítás
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-change-pdf"
                    >
                      Másik fájl
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Metadata Form */}
          {selectedFile && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Anyag címe *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="pl. Matematika tankönyv 5. osztály"
                  data-testid="input-pdf-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Leírás (opcionális)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Rövid leírás az anyagról..."
                  rows={3}
                  data-testid="input-pdf-description"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="classroom">Osztály *</Label>
                <Select value={classroom} onValueChange={setClassroom}>
                  <SelectTrigger id="classroom" data-testid="select-pdf-classroom">
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

              {/* Upload Button */}
              <div className="pt-4">
                <Button
                  onClick={handleUpload}
                  disabled={uploadMutation.isPending || !title.trim()}
                  className="w-full"
                  size="lg"
                  data-testid="button-upload-pdf"
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Feltöltés folyamatban...
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5 mr-2" />
                      PDF feltöltése
                    </>
                  )}
                </Button>
              </div>

              {uploadMutation.isPending && (
                <Progress value={undefined} className="w-full" />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                Fontos tudnivalók
              </p>
              <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200">
                <li>A PDF fájl natív böngésző viewerben jelenik meg</li>
                <li>Nincs AI feldolgozás vagy HTML konverzió</li>
                <li>Maximum fájlméret: 50 MB</li>
                <li>A feltöltés után azonnal elérhető lesz a főoldalon</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
