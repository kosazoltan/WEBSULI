import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Maximize2,
  Download,
  Loader2,
  AlertCircle,
  FileText
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PdfViewerProps {
  pdfUrl: string;
  title?: string;
  onClose?: () => void;
}

type RenderState = 'loading' | 'rendering' | 'rendered' | 'error';

export default function PdfViewer({ pdfUrl, title, onClose }: PdfViewerProps) {
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
  const [error, setError] = useState<string | null>(null);

  // Load and render PDF
  const loadPdf = useCallback(async () => {
    try {
      setState('loading');
      setError(null);

      // Dynamic import pdfjs-dist
      const pdfjs = await import('pdfjs-dist');
      
      // Setup worker - Use local worker (served from public folder)
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.js';

      // Load PDF document with font configuration
      const loadingTask = pdfjs.getDocument({
        url: pdfUrl,
        standardFontDataUrl: '/pdfjs/standard_fonts/',
        useSystemFonts: false,
      });
      const pdf = await loadingTask.promise;
      
      pdfDocRef.current = pdf;
      setTotalPages(pdf.numPages);
      setState('rendered');
      
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

  // Render current page
  const renderPage = useCallback(async () => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    
    try {
      setState('rendering');
      
      // Cancel any ongoing render task
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const page = await pdfDocRef.current.getPage(currentPage);
      const viewport = page.getViewport({ scale });
      
      const canvas = canvasRef.current;
      // Use '2d' context, not 'webgl' to avoid WebGL context limit issues
      const context = canvas.getContext('2d', { 
        willReadFrequently: false, // Optimize for rendering performance
        alpha: false // Disable alpha channel for better performance
      });
      
      if (!context) {
        throw new Error('Canvas context nem elérhető');
      }

      // Set canvas dimensions (this clears the canvas)
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      // Render page
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };
      
      renderTaskRef.current = page.render(renderContext);
      await renderTaskRef.current.promise;
      
      setState('rendered');
    } catch (err: any) {
      if (err.name === 'RenderingCancelledException') {
        // Ignore cancellation errors
        return;
      }
      console.error('[PDF Viewer] Render error:', err);
      setState('error');
      setError(err.message || 'Oldal renderelése sikertelen');
    }
  }, [currentPage, scale]);

  // Initial load
  useEffect(() => {
    loadPdf();
    
    return () => {
      // Cleanup
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
      }
    };
  }, [loadPdf]);

  // Re-render when page or scale changes
  useEffect(() => {
    if (pdfDocRef.current) {
      renderPage();
    }
  }, [currentPage, scale, renderPage]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && currentPage > 1) {
        setCurrentPage(p => p - 1);
      } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
        setCurrentPage(p => p + 1);
      } else if (e.key === '+' || e.key === '=') {
        setScale(s => Math.min(s + 0.25, 3));
      } else if (e.key === '-') {
        setScale(s => Math.max(s - 0.25, 0.5));
      } else if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages, onClose]);

  // Handlers
  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handleZoomIn = () => {
    setScale(s => Math.min(s + 0.25, 3));
  };

  const handleZoomOut = () => {
    setScale(s => Math.max(s - 0.25, 0.5));
  };

  const handleFitToWidth = () => {
    if (containerRef.current && canvasRef.current) {
      const containerWidth = containerRef.current.clientWidth - 48; // padding
      const canvasWidth = canvasRef.current.width / scale;
      const newScale = containerWidth / canvasWidth;
      setScale(Math.max(0.5, Math.min(newScale, 3)));
    }
  };

  const handleFullscreen = () => {
    if (!containerRef.current) return;
    
    // Check if fullscreen API is supported
    if (!document.fullscreenEnabled && !containerRef.current.requestFullscreen) {
      toast({
        title: "Nem támogatott",
        description: "A teljes képernyős mód nem elérhető ezen az eszközön",
        variant: "destructive"
      });
      return;
    }
    
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        containerRef.current.requestFullscreen();
      }
    } catch (err: any) {
      toast({
        title: "Hiba",
        description: "Nem sikerült váltani a teljes képernyős módba",
        variant: "destructive"
      });
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = title || 'document.pdf';
    link.click();
  };

  // Render loading state
  if (state === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">PDF betöltése...</p>
      </div>
    );
  }

  // Render error state
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
    <div className="flex flex-col h-full" ref={containerRef}>
      {/* Toolbar */}
      <Card className="mb-4 p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <FileText className="w-5 h-5 text-primary" />
          {title && (
            <span className="font-medium text-sm truncate">{title}</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Page navigation */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            <Badge variant="secondary" className="px-3" data-testid="badge-page-info">
              {currentPage} / {totalPages}
            </Badge>
            
            <Button
              variant="outline"
              size="icon"
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              data-testid="button-next-page"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
              data-testid="button-zoom-out"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            
            <Badge variant="secondary" className="px-3 min-w-[60px] text-center" data-testid="badge-zoom-level">
              {Math.round(scale * 100)}%
            </Badge>
            
            <Button
              variant="outline"
              size="icon"
              onClick={handleZoomIn}
              disabled={scale >= 3}
              data-testid="button-zoom-in"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>

          {/* Actions */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleFitToWidth}
            data-testid="button-fit-width"
          >
            Teljes szélesség
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            onClick={handleFullscreen}
            data-testid="button-fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            onClick={handleDownload}
            data-testid="button-download-pdf"
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      {/* PDF Canvas */}
      <ScrollArea className="flex-1">
        <div className="flex justify-center p-6 bg-muted/30 min-h-[600px]">
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

      {/* Keyboard shortcuts hint */}
      <div className="mt-2 text-xs text-muted-foreground text-center">
        <kbd className="px-1 py-0.5 bg-muted rounded">←</kbd> / <kbd className="px-1 py-0.5 bg-muted rounded">→</kbd> navigálás • 
        <kbd className="px-1 py-0.5 bg-muted rounded ml-1">+</kbd> / <kbd className="px-1 py-0.5 bg-muted rounded">-</kbd> zoom •
        <kbd className="px-1 py-0.5 bg-muted rounded ml-1">Esc</kbd> bezárás
      </div>
    </div>
  );
}
