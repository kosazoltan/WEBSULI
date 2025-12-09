import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut,
  Download,
  Loader2,
  AlertCircle,
  FileText,
  Search,
  RotateCw,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AdvancedPdfViewerProps {
  pdfUrl: string;
  title?: string;
  onClose?: () => void;
}

type RenderState = 'loading' | 'rendering' | 'rendered' | 'error';

export default function AdvancedPdfViewer({ pdfUrl, title, onClose }: AdvancedPdfViewerProps) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);
  
  // State
  const [state, setState] = useState<RenderState>('loading');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.5);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  // Load PDF
  const loadPdf = useCallback(async () => {
    try {
      setState('loading');
      setError(null);

      const pdfjs = await import('pdfjs-dist');
      
      // Use local worker (served from public folder)
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.js';

      const loadingTask = pdfjs.getDocument({
        url: pdfUrl,
        standardFontDataUrl: '/pdfjs/standard_fonts/',
        useSystemFonts: false,
      });
      const pdf = await loadingTask.promise;
      
      pdfDocRef.current = pdf;
      setTotalPages(pdf.numPages);
      setState('rendered');
      
      // Generate thumbnails
      generateThumbnails(pdf);
      
    } catch (err: any) {
      console.error('[PDF Viewer] Load error:', err);
      setError(err.message || 'PDF betöltése sikertelen');
      setState('error');
      toast({
        title: "PDF betöltési hiba",
        description: err.message || 'Nem sikerült betölteni a PDF-et',
        variant: "destructive"
      });
    }
  }, [pdfUrl, toast]);

  // Generate thumbnails
  const generateThumbnails = async (pdf: any) => {
    const thumbs: string[] = [];
    const thumbnailScale = 0.3;
    
    for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 20); pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: thumbnailScale });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        if (!context) continue;
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;
        
        thumbs.push(canvas.toDataURL());
      } catch (err) {
        console.error(`Thumbnail ${pageNum} error:`, err);
      }
    }
    
    setThumbnails(thumbs);
  };

  // Render current page
  const renderPage = useCallback(async () => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    
    try {
      setState('rendering');
      
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const page = await pdfDocRef.current.getPage(currentPage);
      const viewport = page.getViewport({ scale, rotation });
      
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (!context) {
        throw new Error('Canvas context nem elérhető');
      }

      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      renderTaskRef.current = page.render({
        canvasContext: context,
        viewport: viewport,
      });
      
      await renderTaskRef.current.promise;
      setState('rendered');
    } catch (err: any) {
      if (err.name === 'RenderingCancelledException') {
        return;
      }
      console.error('[PDF Viewer] Render error:', err);
      setState('error');
      setError(err.message || 'Oldal renderelése sikertelen');
    }
  }, [currentPage, scale, rotation]);

  useEffect(() => {
    loadPdf();
    
    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
      }
    };
  }, [loadPdf]);

  useEffect(() => {
    if (pdfDocRef.current) {
      renderPage();
    }
  }, [currentPage, scale, rotation, renderPage]);

  // Handlers
  const handlePrevPage = () => currentPage > 1 && setCurrentPage(currentPage - 1);
  const handleNextPage = () => currentPage < totalPages && setCurrentPage(currentPage + 1);
  const handleZoomIn = () => setScale(s => Math.min(s + 0.25, 3));
  const handleZoomOut = () => setScale(s => Math.max(s - 0.25, 0.5));
  const handleRotate = () => setRotation(r => (r + 90) % 360);
  
  const handleFitToWidth = () => {
    if (containerRef.current && canvasRef.current) {
      const containerWidth = containerRef.current.clientWidth - 48;
      const canvasWidth = canvasRef.current.width / scale;
      const newScale = containerWidth / canvasWidth;
      setScale(Math.max(0.5, Math.min(newScale, 3)));
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = title || 'document.pdf';
    link.click();
  };

  const handleSearch = async () => {
    if (!searchTerm || !pdfDocRef.current) return;
    
    toast({
      title: "Keresés...",
      description: `"${searchTerm}" keresése a dokumentumban`,
    });
    
    // Simple search implementation
    // In production, you'd use PDF.js text layer for better search
  };

  if (state === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">PDF betöltése...</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <div className="text-center">
          <h3 className="font-semibold mb-2">Hiba történt</h3>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
        <Button onClick={loadPdf} variant="outline" data-testid="button-retry-pdf">
          Újrapróbálás
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-2" ref={containerRef}>
      {/* Thumbnail Sidebar */}
      {showThumbnails && (
        <Card className="w-48 flex-shrink-0 p-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Oldalak</span>
            <Button 
              variant="ghost" 
              size="icon"
              className="h-6 w-6"
              onClick={() => setShowThumbnails(false)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="space-y-2">
              {thumbnails.map((thumb, idx) => (
                <div
                  key={idx}
                  className={`cursor-pointer border-2 rounded p-1 transition-all ${
                    currentPage === idx + 1
                      ? 'border-primary bg-primary/10'
                      : 'border-transparent hover:border-muted-foreground/20'
                  }`}
                  onClick={() => setCurrentPage(idx + 1)}
                  data-testid={`thumbnail-${idx + 1}`}
                >
                  <img src={thumb} alt={`Oldal ${idx + 1}`} className="w-full" />
                  <p className="text-xs text-center mt-1">{idx + 1}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}

      {/* Main Viewer */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <Card className="mb-2 p-2">
          <div className="flex flex-wrap items-center gap-2">
            {!showThumbnails && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowThumbnails(true)}
                data-testid="button-show-thumbnails"
              >
                <FileText className="w-4 h-4 mr-1" />
                Bélyegképek
              </Button>
            )}

            <Separator orientation="vertical" className="h-6" />

            {/* Page Navigation */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handlePrevPage}
                disabled={currentPage === 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              
              <Input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => {
                  const page = parseInt(e.target.value);
                  if (page >= 1 && page <= totalPages) {
                    setCurrentPage(page);
                  }
                }}
                className="w-16 h-8 text-center"
                data-testid="input-page-number"
              />
              
              <span className="text-sm text-muted-foreground">/ {totalPages}</span>
              
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                data-testid="button-next-page"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <Separator orientation="vertical" className="h-6" />

            {/* Zoom Controls */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleZoomOut}
                disabled={scale <= 0.5}
                data-testid="button-zoom-out"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              
              <Badge variant="secondary" className="px-2 h-8" data-testid="badge-zoom-level">
                {Math.round(scale * 100)}%
              </Badge>
              
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleZoomIn}
                disabled={scale >= 3}
                data-testid="button-zoom-in"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>

            <Separator orientation="vertical" className="h-6" />

            {/* Actions */}
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleFitToWidth}
              data-testid="button-fit-width"
            >
              Teljes szélesség
            </Button>
            
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handleRotate}
              data-testid="button-rotate"
            >
              <RotateCw className="w-4 h-4" />
            </Button>
            
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handleDownload}
              data-testid="button-download-pdf"
            >
              <Download className="w-4 h-4" />
            </Button>

            <Separator orientation="vertical" className="h-6" />

            {/* Search */}
            <div className="flex items-center gap-1 flex-1 max-w-xs">
              <Input
                placeholder="Keresés..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="h-8"
                data-testid="input-search"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleSearch}
                disabled={!searchTerm}
                data-testid="button-search"
              >
                <Search className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>

        {/* PDF Canvas */}
        <ScrollArea className="flex-1 bg-muted/30">
          <div className="flex justify-center p-6 min-h-[600px]">
            {state === 'rendering' && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}
            <canvas
              ref={canvasRef}
              className="shadow-2xl bg-white dark:bg-gray-900"
              data-testid="canvas-pdf"
            />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
