import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Share2, Heart, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ReactPdfViewer from "@/components/ReactPdfViewer";
import LikeButton from "@/components/LikeButton";
import type { HtmlFile } from "@shared/schema";

const CLASSROOM_COLORS = [
  { bg: "bg-orange-500", text: "text-white", name: "1. osztály" },
  { bg: "bg-red-600", text: "text-white", name: "2. osztály" },
  { bg: "bg-purple-600", text: "text-white", name: "3. osztály" },
  { bg: "bg-blue-600", text: "text-white", name: "4. osztály" },
  { bg: "bg-green-600", text: "text-white", name: "5. osztály" },
  { bg: "bg-yellow-500", text: "text-black", name: "6. osztály" },
  { bg: "bg-pink-500", text: "text-white", name: "7. osztály" },
  { bg: "bg-cyan-500", text: "text-white", name: "8. osztály" },
];

export default function PdfView() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  // Fetch material metadata
  const { data: material, isLoading, error } = useQuery<HtmlFile>({
    queryKey: ['/api/html-files', id],
    enabled: !!id,
  });

  const handleBack = () => {
    setLocation('/');
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: material?.title || 'PDF anyag',
          text: material?.description || '',
          url: url,
        });
      } catch (err) {
        // User cancelled
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(url);
      // Could show a toast here
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Anyag betöltése...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !material) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-destructive" />
          <h2 className="text-xl font-semibold">Hiba történt</h2>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Az anyag nem található'}
          </p>
          <Button onClick={handleBack} variant="outline" data-testid="button-back-error">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Vissza a főoldalra
          </Button>
        </div>
      </div>
    );
  }

  // Check if it's actually a PDF
  if (material.contentType !== 'pdf') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-destructive" />
          <h2 className="text-xl font-semibold">Nem PDF anyag</h2>
          <p className="text-sm text-muted-foreground">
            Ez az anyag nem PDF formátumban van tárolva.
          </p>
          <Button onClick={handleBack} variant="outline" data-testid="button-back-not-pdf">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Vissza a főoldalra
          </Button>
        </div>
      </div>
    );
  }

  const classroomColor = CLASSROOM_COLORS[material.classroom - 1];
  const pdfUrl = `/api/pdf/${id}`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 py-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                data-testid="button-back"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Vissza
              </Button>

              <div className="flex-1 min-w-0">
                <h1 className="text-lg sm:text-xl font-bold truncate" data-testid="text-pdf-title">
                  {material.title}
                </h1>
                {material.description && (
                  <p className="text-sm text-muted-foreground truncate" data-testid="text-pdf-description">
                    {material.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge 
                className={`${classroomColor.bg} ${classroomColor.text}`}
                data-testid="badge-classroom"
              >
                {classroomColor.name}
              </Badge>

              <LikeButton materialId={id!} />

              <Button
                variant="outline"
                size="icon"
                onClick={handleShare}
                data-testid="button-share"
              >
                <Share2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 h-[calc(100vh-80px)]">
        <ReactPdfViewer 
          pdfUrl={pdfUrl} 
          title={material.title}
          onClose={handleBack}
        />
      </div>
    </div>
  );
}
