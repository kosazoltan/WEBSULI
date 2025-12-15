import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sparkles,
  Loader2,
  Eye,
  CheckCircle,
  XCircle,
  Trash2,
  ArrowRight,
  FileText,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { hu } from "date-fns/locale";

interface ImprovedFile {
  id: string;
  originalFileId: string;
  title: string;
  description: string | null;
  classroom: number;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  improvementPrompt: string | null;
  improvementNotes: string | null;
  createdAt: string;
  appliedAt: string | null;
  originalFile?: {
    id: string;
    title: string;
    content: string;
  };
}

interface HtmlFile {
  id: string;
  title: string;
  description: string | null;
  classroom: number;
}

export default function MaterialImprover() {
  const { toast } = useToast();
  const [selectedFileId, setSelectedFileId] = useState<string>("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [previewImprovedId, setPreviewImprovedId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Get all HTML files
  const { data: allFiles = [], isLoading: isLoadingFiles } = useQuery<HtmlFile[]>({
    queryKey: ["/api/html-files"],
  });

  // Get all improved files
  const { data: improvedFiles = [], isLoading: isLoadingImproved } = useQuery<ImprovedFile[]>({
    queryKey: ["/api/admin/improved-files"],
  });

  // Get single improved file with original for preview
  const { data: previewData } = useQuery<ImprovedFile>({
    queryKey: previewImprovedId ? ["/api/admin/improved-files", previewImprovedId] : ["/api/admin/improved-files"],
    enabled: !!previewImprovedId,
  });

  // Precompute rendered HTML documents for side-by-side live preview
  const makeRunnableHtml = (html?: string) => {
    if (!html) {
      console.log('[makeRunnableHtml] Input HTML is empty.');
      return "";
    }
    
    console.log('[makeRunnableHtml] Input HTML length:', html.length);
    console.log('[makeRunnableHtml] Input HTML preview:', html.substring(0, 200));
    
    // Check if HTML already has full structure (DOCTYPE or html tag)
    const hasDocType = html.includes('<!DOCTYPE') || html.includes('<!doctype');
    const hasHtmlTag = html.includes('<html') || html.toLowerCase().includes('<html');
    
    if (hasDocType || hasHtmlTag) {
      console.log('[makeRunnableHtml] HTML already has full structure.');
      
      // Ensure it has proper charset meta tag if missing
      if (!html.includes('charset') && !html.includes('charset')) {
        html = html.replace(
          /<head[^>]*>/i,
          (match) => `${match}<meta charset="UTF-8">`
        );
        // If no head tag, add it after html tag
        if (!html.includes('<head')) {
          html = html.replace(
            /<html[^>]*>/i,
            (match) => `${match}<head><meta charset="UTF-8"></head>`
          );
        }
      }
      
      // Ensure it has proper viewport meta tag if missing
      if (!html.includes('viewport')) {
        html = html.replace(
          /<head[^>]*>/i,
          (match) => `${match}<meta name="viewport" content="width=device-width, initial-scale=1.0" />`
        );
        // If no head tag, add it after html tag
        if (!html.includes('<head')) {
          html = html.replace(
            /<html[^>]*>/i,
            (match) => {
              if (html.includes('</head>')) {
                return match;
              }
              return `${match}<head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>`;
            }
          );
        }
      }
      
      // Ensure it has a body tag
      if (!html.includes('<body') && !html.toLowerCase().includes('<body')) {
        // Find where to insert body (after </head> or after <html>)
        const headCloseIndex = html.indexOf('</head>');
        if (headCloseIndex !== -1) {
          // Insert body after </head>
          html = html.slice(0, headCloseIndex + 7) + '<body>' + html.slice(headCloseIndex + 7);
          // Add closing body tag before </html> or at the end
          const htmlCloseIndex = html.indexOf('</html>');
          if (htmlCloseIndex !== -1) {
            html = html.slice(0, htmlCloseIndex) + '</body>' + html.slice(htmlCloseIndex);
          } else {
            html = html + '</body>';
          }
        } else {
          // No </head> tag, check if there's a <head> opening tag
          const headOpenIndex = html.indexOf('<head');
          if (headOpenIndex !== -1) {
            // Find where head content ends - look for </head> or next major tag (but not <head> itself)
            const headEndIndex = html.indexOf('>', headOpenIndex) + 1;
            // Look for the end of head content - find </head> or next tag that's not <head>
            let insertIndex = headEndIndex;
            // Search for closing </head> first
            const headCloseMatch = html.substring(headEndIndex).match(/<\/head>/i);
            if (headCloseMatch) {
              insertIndex = headEndIndex + headCloseMatch.index! + headCloseMatch[0].length;
            } else {
              // No </head> found, find next tag that's not <head> or part of head content
              // Look for tags like <body>, <script>, <style>, or </html>
              const nextTagMatch = html.substring(headEndIndex).match(/<(body|script|style|html|meta|title|link|base)[\s>]/i);
              if (nextTagMatch) {
                insertIndex = headEndIndex + nextTagMatch.index!;
              } else {
                // If no next tag found, insert before </html> or at end
                const htmlCloseIndex = html.indexOf('</html>');
                insertIndex = htmlCloseIndex !== -1 ? htmlCloseIndex : html.length;
              }
            }
            // Insert </head> and <body> at the correct position
            html = html.slice(0, insertIndex) + '</head><body>' + html.slice(insertIndex);
            // Ensure closing body tag exists
            const htmlCloseIndex = html.indexOf('</html>');
            if (htmlCloseIndex !== -1) {
              html = html.slice(0, htmlCloseIndex) + '</body>' + html.slice(htmlCloseIndex);
            } else {
              html = html + '</body>';
            }
          } else {
            // No head tag at all, add head and body after html tag
            html = html.replace(
              /<html[^>]*>/i,
              (match) => `${match}<head></head><body>`
            );
            const htmlCloseIndex = html.indexOf('</html>');
            if (htmlCloseIndex !== -1) {
              html = html.slice(0, htmlCloseIndex) + '</body>' + html.slice(htmlCloseIndex);
            } else {
              html = html + '</body>';
            }
          }
        }
      }
      
      console.log('[makeRunnableHtml] Returning full HTML structure, length:', html.length);
      return html;
    }
    
    // Otherwise, wrap the content in a full HTML structure
    const wrappedHtml = `<!doctype html><html lang="hu"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head><body style="margin:0;min-height:100vh;">${html}</body></html>`;
    console.log('[makeRunnableHtml] Wrapped HTML with basic structure, length:', wrappedHtml.length);
    return wrappedHtml;
  };

  const renderedOriginal = useMemo(
    () => {
      const result = makeRunnableHtml(previewData?.originalFile?.content);
      console.log('[RENDERED] Original HTML structure check:', {
        hasDocType: result.includes('<!DOCTYPE'),
        hasHtml: result.includes('<html'),
        hasHead: result.includes('<head'),
        hasBody: result.includes('<body'),
        headBeforeBody: result.indexOf('<head') < result.indexOf('<body') || result.indexOf('<body') === -1,
        preview: result.substring(0, 500)
      });
      return result;
    },
    [previewData?.originalFile?.content]
  );

  const renderedImproved = useMemo(() => {
    const result = makeRunnableHtml(previewData?.content);
    console.log('[RENDERED] Improved HTML structure check:', {
      hasDocType: result.includes('<!DOCTYPE'),
      hasHtml: result.includes('<html'),
      hasHead: result.includes('<head'),
      hasBody: result.includes('<body'),
      headIndex: result.indexOf('<head'),
      bodyIndex: result.indexOf('<body'),
      headBeforeBody: result.indexOf('<head') < result.indexOf('<body') || result.indexOf('<body') === -1,
      preview: result.substring(0, 500)
    });
    return result;
  }, [previewData?.content]);

  // Create Blob URL for opening in external browser
  const improvedBlobUrl = useMemo(() => {
    if (!renderedImproved) return null;
    const blob = new Blob([renderedImproved], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    console.log('[BLOB] Created Blob URL for improved HTML, length:', renderedImproved.length);
    return url;
  }, [renderedImproved]);

  // Cleanup Blob URL on unmount
  useEffect(() => {
    return () => {
      if (improvedBlobUrl) {
        URL.revokeObjectURL(improvedBlobUrl);
        console.log('[BLOB] Revoked Blob URL');
      }
    };
  }, [improvedBlobUrl]);

  const handleOpenInExternalBrowser = () => {
    if (improvedBlobUrl) {
      window.open(improvedBlobUrl, '_blank', 'noopener,noreferrer');
      toast({
        title: "Megnyitva külső böngészőben",
        description: "Az HTML új ablakban nyílt meg.",
      });
    }
  };

  // Improve material mutation
  const improveMutation = useMutation({
    mutationFn: async ({ fileId, customPrompt }: { fileId: string; customPrompt?: string }) => {
      return apiRequest("POST", `/api/admin/improve-material/${fileId}`, {
        customPrompt: customPrompt || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/improved-files"] });
      setSelectedFileId("");
      setCustomPrompt("");
      toast({
        title: "✅ Javítás elkezdve",
        description: "A Claude AI most dolgozik a javításon...",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Hiba",
        description: error.message || "Nem sikerült elindítani a javítást",
        variant: "destructive",
      });
    },
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      return apiRequest("PATCH", `/api/admin/improved-files/${id}`, {
        status,
        improvementNotes: notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/improved-files"] });
      toast({
        title: "Státusz frissítve",
        description: "A javított fájl státusza sikeresen frissítve.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Hiba",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Apply improved file mutation
  const applyMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      return apiRequest("POST", "/api/admin/improved-files/" + id + "/apply", {
        createBackup: true,
        notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/improved-files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/html-files"] });
      setApplyingId(null);
      toast({
        title: "✅ Sikeresen alkalmazva",
        description: "A javított fájl sikeresen lecserélte az eredetit. Backup készült.",
      });
    },
    onError: (error: Error) => {
      setApplyingId(null);
      toast({
        title: "Hiba",
        description: error.message || "Nem sikerült alkalmazni a javítást",
        variant: "destructive",
      });
    },
  });

  // Delete improved file mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", "/api/admin/improved-files/" + id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/improved-files"] });
      setDeletingId(null);
      toast({
        title: "Törölve",
        description: "A javított fájl sikeresen törölve.",
      });
    },
    onError: (error: Error) => {
      setDeletingId(null);
      toast({
        title: "Hiba",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleImprove = () => {
    if (!selectedFileId) {
      toast({
        title: "Válassz fájlt",
        description: "Kérlek válassz ki egy fájlt a javításhoz",
        variant: "destructive",
      });
      return;
    }
    improveMutation.mutate({ fileId: selectedFileId, customPrompt: customPrompt || undefined });
  };

  const handleApprove = (id: string) => {
    updateStatusMutation.mutate({ id, status: "approved" });
  };

  const handleReject = (id: string) => {
    updateStatusMutation.mutate({ id, status: "rejected" });
  };

  const handleApply = (id: string) => {
    setApplyingId(id);
  };

  const confirmApply = () => {
    if (applyingId) {
      applyMutation.mutate({ id: applyingId });
    }
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
  };

  const confirmDelete = () => {
    if (deletingId) {
      deleteMutation.mutate(deletingId);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      pending: { variant: "secondary", label: "Függőben" },
      approved: { variant: "default", label: "Jóváhagyva" },
      rejected: { variant: "destructive", label: "Elutasítva" },
      applied: { variant: "outline", label: "Alkalmazva" },
    };
    const config = variants[status] || variants.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card className="border-red-500 border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <Sparkles className="h-5 w-5" />
            Régi Tananyagok Okosabbá Tétele
          </CardTitle>
          <CardDescription>
            Régebbi HTML tananyagok javítása Claude AI segítségével. A javított fájlok először
            előzetes táblába kerülnek, ahol ellenőrizhetők, majd alkalmazhatók.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file-select">Válassz fájlt a javításhoz</Label>
            <Select value={selectedFileId} onValueChange={setSelectedFileId}>
              <SelectTrigger id="file-select" className="border-red-300">
                <SelectValue placeholder="Válassz egy fájlt..." />
              </SelectTrigger>
              <SelectContent>
                {allFiles.map((file) => (
                  <SelectItem key={file.id} value={file.id}>
                    {file.title} ({file.classroom}. osztály)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom-prompt">Egyedi prompt (opcionális)</Label>
            <Textarea
              id="custom-prompt"
              placeholder="Pl: 'Használj dark mode témát' vagy 'Adj hozzá animációkat'..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="border-red-300"
              rows={3}
            />
          </div>

          <Button
            onClick={handleImprove}
            disabled={!selectedFileId || improveMutation.isPending}
            className="bg-red-600 hover:bg-red-700 text-white border-red-700"
          >
            {improveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Javítás folyamatban...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Javítás indítása
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Improved Files List */}
      <Card className="border-red-500 border-2">
        <CardHeader>
          <CardTitle className="text-red-700">Javított Fájlok</CardTitle>
          <CardDescription>
            Itt láthatod az összes javított fájlt. Először jóvá kell hagynod őket, majd
            alkalmazhatod az eredeti fájlokra.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingImproved ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-red-600" />
            </div>
          ) : improvedFiles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>Még nincsenek javított fájlok</p>
            </div>
          ) : (
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cím</TableHead>
                    <TableHead>Osztály</TableHead>
                    <TableHead>Státusz</TableHead>
                    <TableHead>Létrehozva</TableHead>
                    <TableHead className="text-right">Műveletek</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {improvedFiles.map((file) => (
                    <TableRow key={file.id}>
                      <TableCell className="font-medium">{file.title}</TableCell>
                      <TableCell>{file.classroom}. osztály</TableCell>
                      <TableCell>{getStatusBadge(file.status)}</TableCell>
                      <TableCell>
                        {format(new Date(file.createdAt), "yyyy. MM. dd. HH:mm", { locale: hu })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPreviewImprovedId(file.id)}
                            className="border-red-300 text-red-700 hover:bg-red-50"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Előnézet
                          </Button>
                          {file.status === "pending" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleApprove(file.id)}
                                disabled={updateStatusMutation.isPending}
                                className="border-green-300 text-green-700 hover:bg-green-50"
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Jóváhagy
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleReject(file.id)}
                                disabled={updateStatusMutation.isPending}
                                className="border-red-300 text-red-700 hover:bg-red-50"
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Elutasít
                              </Button>
                            </>
                          )}
                          {file.status === "approved" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleApply(file.id)}
                              className="border-red-500 bg-red-600 text-white hover:bg-red-700"
                            >
                              <ArrowRight className="h-4 w-4 mr-1" />
                              Alkalmaz
                            </Button>
                          )}
                          {(file.status === "pending" || file.status === "rejected") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(file.id)}
                              className="border-red-300 text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      {previewData && (
        <Card className="border-red-500 border-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-red-700">Előnézet: {previewData.title}</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewImprovedId(null)}
              >
                Bezár
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="run-improved" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="run-original">Eredeti (futó)</TabsTrigger>
                <TabsTrigger value="run-improved">Javított (futó)</TabsTrigger>
                <TabsTrigger value="code-original">Eredeti (kód)</TabsTrigger>
                <TabsTrigger value="code-improved">Javított (kód)</TabsTrigger>
              </TabsList>
              
              {/* Running HTML Preview - Original */}
              <TabsContent value="run-original" className="mt-4">
                {renderedOriginal ? (
                  <div className="border-2 border-border rounded-lg overflow-hidden bg-white">
                    <div className="bg-muted px-3 py-2 border-b flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Eredeti HTML futás közben</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(renderedOriginal.length / 1024)} KB
                      </span>
                    </div>
                    <iframe
                      srcDoc={renderedOriginal}
                      className="w-full h-[600px] border-0"
                      title="Eredeti HTML Preview"
                      sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin allow-downloads allow-top-navigation-by-user-activation"
                      allow="autoplay; fullscreen; clipboard-write; microphone"
                      data-testid="iframe-preview-original"
                      style={{
                        minHeight: '400px',
                        backgroundColor: 'white',
                      }}
                      onError={(e) => {
                        console.error('[IFRAME] Error loading original HTML:', e);
                        console.error('[IFRAME] HTML content length:', renderedOriginal.length);
                        console.error('[IFRAME] HTML content preview:', renderedOriginal.substring(0, 500));
                      }}
                      onLoad={(ev) => {
                        console.log('[IFRAME] Original HTML loaded, length:', renderedOriginal.length);
                        const iframe = ev.target as HTMLIFrameElement;
                        try {
                          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                          if (iframeDoc) {
                            console.log('[IFRAME] Iframe document found');
                            console.log('[IFRAME] Body exists:', !!iframeDoc.body);
                            console.log('[IFRAME] Body innerHTML length:', iframeDoc.body?.innerHTML?.length || 0);
                            console.log('[IFRAME] Body text content length:', iframeDoc.body?.textContent?.length || 0);
                            if (iframeDoc.body && iframeDoc.body.innerHTML.length === 0) {
                              console.warn('[IFRAME] Body is empty - HTML may not have rendered correctly');
                            }
                          } else {
                            console.warn('[IFRAME] Cannot access iframe document (sandbox restrictions)');
                          }
                        } catch (err) {
                          console.warn('[IFRAME] Error accessing iframe content:', err);
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="h-[600px] flex items-center justify-center rounded-md border text-muted-foreground">
                    Nincs elérhető tartalom
                  </div>
                )}
              </TabsContent>

              {/* Running HTML Preview - Improved */}
              <TabsContent value="run-improved" className="mt-4">
                {renderedImproved ? (
                  <div className="border-2 border-border rounded-lg overflow-hidden bg-white">
                    <div className="bg-muted px-3 py-2 border-b flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Javított HTML futás közben</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleOpenInExternalBrowser}
                          className="h-7 text-xs"
                          disabled={!improvedBlobUrl}
                        >
                          <ExternalLink className="w-3 h-3 mr-1.5" />
                          Külső böngészőben
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(renderedImproved.length / 1024)} KB
                        </span>
                      </div>
                    </div>
                    <iframe
                      srcDoc={renderedImproved}
                      className="w-full h-[600px] border-0"
                      title="Javított HTML Preview"
                      sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin allow-downloads allow-top-navigation-by-user-activation"
                      allow="autoplay; fullscreen; clipboard-write; microphone"
                      data-testid="iframe-preview-improved"
                      style={{
                        minHeight: '400px',
                        backgroundColor: 'white',
                      }}
                      onError={(ev) => {
                        console.error('[IFRAME] Error loading improved HTML:', ev);
                        console.error('[IFRAME] HTML content length:', renderedImproved.length);
                        console.error('[IFRAME] HTML content preview:', renderedImproved.substring(0, 500));
                      }}
                      onLoad={(ev) => {
                        console.log('[IFRAME] Improved HTML loaded, length:', renderedImproved.length);
                        console.log('[IFRAME] HTML content preview (BEFORE iframe):', renderedImproved.substring(0, 500));
                        // Try to access iframe content to check if it loaded
                        const iframe = ev.target as HTMLIFrameElement;
                        try {
                          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                          if (iframeDoc) {
                            console.log('[IFRAME] Iframe document found');
                            const docHtml = iframeDoc.documentElement.outerHTML;
                            console.log('[IFRAME] Document HTML (AFTER iframe):', docHtml.substring(0, 500));
                            console.log('[IFRAME] Document structure:', {
                              htmlTag: iframeDoc.documentElement.tagName,
                              headExists: !!iframeDoc.head,
                              bodyExists: !!iframeDoc.body,
                              headIndex: docHtml.indexOf('<head'),
                              bodyIndex: docHtml.indexOf('<body'),
                              headBeforeBody: docHtml.indexOf('<head') < docHtml.indexOf('<body') || docHtml.indexOf('<body') === -1
                            });
                            console.log('[IFRAME] Body exists:', !!iframeDoc.body);
                            console.log('[IFRAME] Body innerHTML length:', iframeDoc.body?.innerHTML?.length || 0);
                            console.log('[IFRAME] Body text content length:', iframeDoc.body?.textContent?.length || 0);
                            console.log('[IFRAME] Body classes:', iframeDoc.body?.className || 'none');
                            console.log('[IFRAME] Body styles:', iframeDoc.body?.style?.cssText || 'none');
                            if (iframeDoc.body && iframeDoc.body.innerHTML.length === 0) {
                              console.warn('[IFRAME] Body is empty - HTML may not have rendered correctly');
                              console.warn('[IFRAME] Document readyState:', iframeDoc.readyState);
                              console.warn('[IFRAME] Document title:', iframeDoc.title);
                            }
                          } else {
                            console.warn('[IFRAME] Cannot access iframe document (sandbox restrictions)');
                          }
                        } catch (err) {
                          console.warn('[IFRAME] Error accessing iframe content:', err);
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="h-[600px] flex items-center justify-center rounded-md border text-muted-foreground">
                    Nincs elérhető tartalom
                  </div>
                )}
              </TabsContent>

              {/* Code View - Original */}
              <TabsContent value="code-original" className="mt-4">
                <ScrollArea className="h-[600px] w-full rounded-md border p-4">
                  <pre className="text-xs whitespace-pre-wrap font-mono">
                    {previewData.originalFile?.content || "Nincs elérhető tartalom"}
                  </pre>
                </ScrollArea>
              </TabsContent>

              {/* Code View - Improved */}
              <TabsContent value="code-improved" className="mt-4">
                <ScrollArea className="h-[600px] w-full rounded-md border p-4">
                  <pre className="text-xs whitespace-pre-wrap font-mono">
                    {previewData.content || "Nincs elérhető tartalom"}
                  </pre>
                </ScrollArea>
              </TabsContent>
            </Tabs>
            {previewData.status === "approved" && (
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={() => {
                    setPreviewImprovedId(null);
                    handleApply(previewData.id);
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Alkalmaz
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Apply Confirmation Dialog */}
      <AlertDialog open={applyingId !== null} onOpenChange={() => setApplyingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alkalmazás megerősítése</AlertDialogTitle>
            <AlertDialogDescription>
              Biztosan alkalmazni szeretnéd ezt a javított fájlt? Ez lecseréli az eredeti fájlt.
              Automatikus backup készül a művelet előtt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmApply}
              className="bg-red-600 hover:bg-red-700"
            >
              Alkalmaz
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deletingId !== null} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Törlés megerősítése</AlertDialogTitle>
            <AlertDialogDescription>
              Biztosan törölni szeretnéd ezt a javított fájlt? Ez a művelet nem vonható vissza.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Törlés
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}