import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Wand2, 
  AlertCircle, 
  CheckCircle, 
  Palette, 
  Code2, 
  Eye, 
  Save,
  Loader2,
  FileCode,
  Smartphone
} from "lucide-react";
import type { HtmlFile } from "@shared/schema";

interface FixError {
  type: string;
  description: string;
  fixed: boolean;
}

interface ThemeChange {
  element: string;
  change: string;
}

export function HtmlFixer() {
  const { toast } = useToast();
  const [selectedFileId, setSelectedFileId] = useState<string>("");
  const [fixedHtml, setFixedHtml] = useState<string>("");
  const [errors, setErrors] = useState<FixError[]>([]);
  const [themeChanges, setThemeChanges] = useState<ThemeChange[]>([]);
  const [viewMode, setViewMode] = useState<"original" | "fixed">("original");
  const [activeFixType, setActiveFixType] = useState<"responsive" | "errors" | "theme" | null>(null);
  
  // Dialog states for custom prompts
  const [responsiveDialogOpen, setResponsiveDialogOpen] = useState(false);
  const [errorsDialogOpen, setErrorsDialogOpen] = useState(false);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  
  // Custom prompt states
  const [responsivePrompt, setResponsivePrompt] = useState("");
  const [errorsPrompt, setErrorsPrompt] = useState("");
  const [themePrompt, setThemePrompt] = useState("");

  // Fetch all HTML files
  const { data: files, isLoading: filesLoading } = useQuery<HtmlFile[]>({
    queryKey: ["/api/html-files"],
  });

  // Fix responsive mutation
  const responsiveFixMutation = useMutation({
    mutationFn: async ({ fileId, customPrompt }: { fileId: string; customPrompt?: string }) => {
      return await apiRequest("POST", "/api/admin/html-fix/responsive", { fileId, customPrompt });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Responsive javítás",
        description: data.message || "A responsive wrapper már alkalmazva van",
      });
      setActiveFixType("responsive");
      setResponsiveDialogOpen(false);
      setResponsivePrompt("");
    },
    onError: (error: any) => {
      toast({
        title: "Hiba",
        description: error.message || "Nem sikerült alkalmazni a responsive javítást",
        variant: "destructive",
      });
    },
  });

  // Fix errors mutation
  const errorsFixMutation = useMutation({
    mutationFn: async ({ fileId, customPrompt }: { fileId: string; customPrompt?: string }) => {
      return await apiRequest("POST", "/api/admin/html-fix/errors", { fileId, customPrompt });
    },
    onSuccess: (data: any) => {
      setFixedHtml(data.fixedHtml);
      setErrors(data.errors || []);
      setViewMode("fixed");
      setActiveFixType("errors");
      setErrorsDialogOpen(false);
      setErrorsPrompt("");
      toast({
        title: "HTML hibák elemezve",
        description: `${data.errors?.length || 0} hiba találva és javítva`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Hiba",
        description: error.message || "Nem sikerült elemezni a HTML hibákat",
        variant: "destructive",
      });
    },
  });

  // Fix theme mutation
  const themeFixMutation = useMutation({
    mutationFn: async ({ fileId, customPrompt }: { fileId: string; customPrompt?: string }) => {
      return await apiRequest("POST", "/api/admin/html-fix/theme", { fileId, customPrompt });
    },
    onSuccess: (data: any) => {
      setFixedHtml(data.themedHtml);
      setThemeChanges(data.changes || []);
      setViewMode("fixed");
      setActiveFixType("theme");
      setThemeDialogOpen(false);
      setThemePrompt("");
      toast({
        title: "Színséma alkalmazva",
        description: `${data.changes?.length || 0} módosítás elvégezve`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Hiba",
        description: error.message || "Nem sikerült alkalmazni a színsémát",
        variant: "destructive",
      });
    },
  });

  // Apply fix mutation
  const applyFixMutation = useMutation({
    mutationFn: async ({ fileId, fixedHtml }: { fileId: string; fixedHtml: string }) => {
      return await apiRequest("POST", "/api/admin/html-fix/apply", { fileId, fixedHtml });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/html-files"] });
      toast({
        title: "Javítás alkalmazva",
        description: "A javított HTML sikeresen mentve",
      });
      // Reset state
      setFixedHtml("");
      setErrors([]);
      setThemeChanges([]);
      setViewMode("original");
      setActiveFixType(null);
    },
    onError: (error: any) => {
      toast({
        title: "Hiba",
        description: error.message || "Nem sikerült menteni a javításokat",
        variant: "destructive",
      });
    },
  });

  const selectedFile = files?.find(f => f.id === selectedFileId);
  const isProcessing = responsiveFixMutation.isPending || errorsFixMutation.isPending || themeFixMutation.isPending;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            HTML Javító Eszközök
          </CardTitle>
          <CardDescription>
            Elemezd és javítsd a feltöltött HTML tananyagokat AI segítségével
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Válassz fájlt</label>
            {filesLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select value={selectedFileId} onValueChange={setSelectedFileId}>
                <SelectTrigger data-testid="select-html-file">
                  <SelectValue placeholder="Válassz egy HTML fájlt..." />
                </SelectTrigger>
                <SelectContent>
                  {files?.map((file) => (
                    <SelectItem key={file.id} value={file.id}>
                      <div className="flex items-center gap-2">
                        <FileCode className="h-4 w-4" />
                        <span className="truncate">{file.title}</span>
                        <Badge variant="outline" className="ml-2">
                          {file.classroom}. osztály
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Fix actions */}
          {selectedFileId && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Button
                onClick={() => setResponsiveDialogOpen(true)}
                disabled={isProcessing}
                variant="outline"
                className="gap-2"
                data-testid="button-fix-responsive"
              >
                <Smartphone className="h-4 w-4" />
                Responsive javítás
              </Button>

              <Button
                onClick={() => setErrorsDialogOpen(true)}
                disabled={isProcessing}
                variant="outline"
                className="gap-2"
                data-testid="button-fix-errors"
              >
                <AlertCircle className="h-4 w-4" />
                Hibák javítása
              </Button>

              <Button
                onClick={() => setThemeDialogOpen(true)}
                disabled={isProcessing}
                variant="outline"
                className="gap-2"
                data-testid="button-fix-theme"
              >
                <Palette className="h-4 w-4" />
                Színséma javítás
              </Button>
            </div>
          )}

          {/* Results section */}
          {selectedFile && activeFixType && (
            <div className="space-y-4 pt-4 border-t">
              {/* Errors list */}
              {activeFixType === "errors" && errors.length > 0 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-semibold">{errors.length} hiba találva:</p>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        {errors.map((error, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            {error.fixed ? (
                              <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                            )}
                            <span>
                              <strong>{error.type}:</strong> {error.description}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Theme changes list */}
              {activeFixType === "theme" && themeChanges.length > 0 && (
                <Alert>
                  <Palette className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-semibold">{themeChanges.length} módosítás:</p>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        {themeChanges.map((change, idx) => (
                          <li key={idx}>
                            <strong>{change.element}:</strong> {change.change}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Preview tabs */}
              {fixedHtml && (
                <>
                  <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "original" | "fixed")}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="original" className="gap-2">
                        <Code2 className="h-4 w-4" />
                        Eredeti
                      </TabsTrigger>
                      <TabsTrigger value="fixed" className="gap-2">
                        <Eye className="h-4 w-4" />
                        Javított
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="original" className="mt-4">
                      <ScrollArea className="h-[400px] w-full rounded-md border p-4">
                        <pre className="text-xs">
                          <code>{selectedFile.content}</code>
                        </pre>
                      </ScrollArea>
                    </TabsContent>

                    <TabsContent value="fixed" className="mt-4">
                      <ScrollArea className="h-[400px] w-full rounded-md border p-4">
                        <pre className="text-xs">
                          <code>{fixedHtml}</code>
                        </pre>
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>

                  {/* Apply button */}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setFixedHtml("");
                        setErrors([]);
                        setThemeChanges([]);
                        setViewMode("original");
                        setActiveFixType(null);
                      }}
                    >
                      Mégse
                    </Button>
                    <Button
                      onClick={() => applyFixMutation.mutate({ fileId: selectedFileId, fixedHtml })}
                      disabled={applyFixMutation.isPending}
                      className="gap-2"
                      data-testid="button-apply-fix"
                    >
                      {applyFixMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Javítás alkalmazása
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Responsive Fix Dialog */}
      <Dialog open={responsiveDialogOpen} onOpenChange={setResponsiveDialogOpen}>
        <DialogContent data-testid="dialog-responsive-prompt">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Responsive javítás
            </DialogTitle>
            <DialogDescription>
              Add meg, hogy mit szeretnél javíttatni a responsive wrapper-rel kapcsolatban (opcionális).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="responsive-prompt">Egyedi utasítások (opcionális)</Label>
              <Textarea
                id="responsive-prompt"
                placeholder="Pl.: Javítsd ki a mobilon túl széles képeket, vagy állítsd be a betűméretet 280px széles kijelzőre..."
                value={responsivePrompt}
                onChange={(e) => setResponsivePrompt(e.target.value)}
                rows={4}
                data-testid="textarea-responsive-prompt"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResponsiveDialogOpen(false);
                setResponsivePrompt("");
              }}
            >
              Mégse
            </Button>
            <Button
              onClick={() => responsiveFixMutation.mutate({ fileId: selectedFileId, customPrompt: responsivePrompt })}
              disabled={responsiveFixMutation.isPending}
              className="gap-2"
              data-testid="button-start-responsive-fix"
            >
              {responsiveFixMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Elemzés indítása
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Errors Fix Dialog */}
      <Dialog open={errorsDialogOpen} onOpenChange={setErrorsDialogOpen}>
        <DialogContent data-testid="dialog-errors-prompt">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              HTML hibák javítása
            </DialogTitle>
            <DialogDescription>
              Add meg, hogy milyen típusú hibákat szeretnél elemeztetni és javíttatni (opcionális).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="errors-prompt">Egyedi utasítások (opcionális)</Label>
              <Textarea
                id="errors-prompt"
                placeholder="Pl.: Ellenőrizd a gombok hozzáférhetőségét, vagy javítsd ki a hiányzó alt szövegeket..."
                value={errorsPrompt}
                onChange={(e) => setErrorsPrompt(e.target.value)}
                rows={4}
                data-testid="textarea-errors-prompt"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setErrorsDialogOpen(false);
                setErrorsPrompt("");
              }}
            >
              Mégse
            </Button>
            <Button
              onClick={() => errorsFixMutation.mutate({ fileId: selectedFileId, customPrompt: errorsPrompt })}
              disabled={errorsFixMutation.isPending}
              className="gap-2"
              data-testid="button-start-errors-fix"
            >
              {errorsFixMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Elemzés indítása
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Theme Fix Dialog */}
      <Dialog open={themeDialogOpen} onOpenChange={setThemeDialogOpen}>
        <DialogContent data-testid="dialog-theme-prompt">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Színséma javítás
            </DialogTitle>
            <DialogDescription>
              Add meg, hogy milyen színséma változásokat szeretnél (opcionális).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="theme-prompt">Egyedi utasítások (opcionális)</Label>
              <Textarea
                id="theme-prompt"
                placeholder="Pl.: Használj sötétebb kék árnyalatokat, vagy alkalmazz élénkebb rózsaszín hangsúlyokat..."
                value={themePrompt}
                onChange={(e) => setThemePrompt(e.target.value)}
                rows={4}
                data-testid="textarea-theme-prompt"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setThemeDialogOpen(false);
                setThemePrompt("");
              }}
            >
              Mégse
            </Button>
            <Button
              onClick={() => themeFixMutation.mutate({ fileId: selectedFileId, customPrompt: themePrompt })}
              disabled={themeFixMutation.isPending}
              className="gap-2"
              data-testid="button-start-theme-fix"
            >
              {themeFixMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Elemzés indítása
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
